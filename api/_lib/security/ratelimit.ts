import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/** Requests per minute per IP. `plc` covers the live simulation (batched scans, up to ~15/s). */
export const TIERS = {
  general: { limit: 60, windowMs: 60_000 },
  assets: { limit: 300, windowMs: 60_000 }, // covers, thumbnails: one request per visible card
  plc: { limit: 900, windowMs: 60_000 },
} as const;
export type Tier = keyof typeof TIERS;

export interface LimitResult {
  readonly success: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Epoch ms at which the window has room again. */
  readonly reset: number;
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
  return new RedisLimiter(remote, memory);
}
