import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/** Requests per minute per IP. `plc` and `circuit` cover the live simulations (batched scans / steps, up to ~15/s). */
export const TIERS = {
  general: { limit: 60, windowMs: 60_000 },
  assets: { limit: 300, windowMs: 60_000 }, // covers, thumbnails: one request per visible card
  plc: { limit: 900, windowMs: 60_000 },
  circuit: { limit: 900, windowMs: 60_000 }, // live transient batches (~10/s) plus on-demand DC / derivation requests
  logic: { limit: 900, windowMs: 60_000 }, // live discrete-event batches (~10/s) plus K-map / FSM / synthesis / timing queries
} as const;
export type Tier = keyof typeof TIERS;

export interface LimitResult {
  readonly success: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Epoch ms at which the window has room again. */
  readonly reset: number;
  /** Background work the caller should keep alive after replying (`waitUntil`), e.g. a Redis sync. */
  readonly pending?: Promise<unknown>;
}

export interface Limiter {
  limit(key: string): Promise<LimitResult>;
}

/**
 * Sliding-window counter (current window plus the weighted previous one, the same approximation
 * Upstash uses). Per server instance: fine for dev and as a safety net, but it is not shared
 * across serverless instances, so production relies on Redis.
 */
export class MemoryLimiter implements Limiter {
  private readonly buckets = new Map<string, { start: number; current: number; previous: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<LimitResult> {
    const now = this.now();
    const start = now - (now % this.windowMs);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { start, current: 0, previous: 0 };
      this.buckets.set(key, bucket);
    } else if (bucket.start !== start) {
      bucket.previous = start - bucket.start === this.windowMs ? bucket.current : 0;
      bucket.current = 0;
      bucket.start = start;
    }
    if (this.buckets.size > 10_000) this.sweep(start);

    const weight = 1 - (now - start) / this.windowMs;
    const used = Math.floor(bucket.previous * weight) + bucket.current;
    if (used >= this.max) {
      return { success: false, limit: this.max, remaining: 0, reset: start + this.windowMs };
    }
    bucket.current += 1;
    return { success: true, limit: this.max, remaining: Math.max(0, this.max - used - 1), reset: start + this.windowMs };
  }

  private sweep(currentStart: number): void {
    this.buckets.forEach((bucket, key) => {
      if (currentStart - bucket.start >= 2 * this.windowMs) this.buckets.delete(key);
    });
  }
}

const UPSTASH_TIMEOUT_MS = 400;
const SYNC_TIMEOUT_MS = 3000;

/** The shared (cross-instance) counter; Upstash in production, a stub in tests. */
export interface RemoteCounter {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
}

/**
 * For hot routes (the live simulation): the admission decision comes from the local window in
 * microseconds, and the shared Redis count is updated in the background. If Redis later reports the
 * IP over its global limit, that IP is refused locally until the window resets, so a burst can
 * overshoot by about one request per instance but the Redis round trip never sits in the response
 * time.
 */
export class HybridLimiter implements Limiter {
  private readonly blocked = new Map<string, number>();

  constructor(
    private readonly local: Limiter,
    private readonly remote: RemoteCounter,
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<LimitResult> {
    const now = this.now();
    const until = this.blocked.get(key);
    if (until !== undefined) {
      if (until > now) return { success: false, limit: this.max, remaining: 0, reset: until };
      this.blocked.delete(key);
    }
    const result = await this.local.limit(key);
    if (!result.success) return result;
    if (this.blocked.size > 10_000) this.blocked.forEach((t, k) => t <= now && this.blocked.delete(k));

    const pending = Promise.race([
      this.remote.limit(key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('redis sync timeout')), SYNC_TIMEOUT_MS)),
    ])
      .then((shared) => {
        if (!shared.success) this.blocked.set(key, shared.reset);
      })
      .catch(() => undefined); // Redis trouble never affects the user; the local window still protects us
    return { ...result, pending };
  }
}

/** Upstash sliding window; any Redis failure or slowness falls back to the in-memory limiter. */
class RedisLimiter implements Limiter {
  constructor(
    private readonly remote: Ratelimit,
    private readonly fallback: Limiter,
  ) {}

  async limit(key: string): Promise<LimitResult> {
    try {
      const result = await Promise.race([
        this.remote.limit(key),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('redis timeout')), UPSTASH_TIMEOUT_MS)),
      ]);
      return { success: result.success, limit: result.limit, remaining: result.remaining, reset: result.reset };
    } catch {
      return this.fallback.limit(key); // fail open to a local limit rather than take the API down
    }
  }
}

export interface LimiterEnv {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
  readonly KV_REST_API_URL?: string; // names used by Vercel's Upstash integration
  readonly KV_REST_API_TOKEN?: string;
}

export function createLimiter(tier: Tier, env: LimiterEnv): Limiter {
  const { limit, windowMs } = TIERS[tier];
  const memory = new MemoryLimiter(limit, windowMs);
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return memory;
  const remote = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, `${windowMs / 1000} s`),
    prefix: `mae:rl:${tier}`,
    analytics: false,
  });
  // The simulation loop must not wait on Redis; every other tier can.
  return tier === 'plc' || tier === 'circuit' || tier === 'logic' ? new HybridLimiter(memory, remote, limit) : new RedisLimiter(remote, memory);
}
