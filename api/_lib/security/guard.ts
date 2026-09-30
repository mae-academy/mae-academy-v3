import { waitUntil } from '@vercel/functions';
import { checkOrigin, type OriginEnv } from './origin';
import { TIERS, createLimiter, type Limiter, type LimiterEnv, type Tier } from './ratelimit';

export interface GuardInput {
  readonly header: (name: string) => string | null;
  readonly ip: string;
}

export type GuardResult =
  | { readonly allowed: true; readonly headers: Record<string, string>; readonly pending?: Promise<unknown> }
  | { readonly allowed: false; readonly status: 403 | 429; readonly headers: Record<string, string>; readonly error: string };

type Env = OriginEnv & LimiterEnv;
const processEnv = (): Env => (typeof process === 'undefined' ? {} : (process.env as Env));

const limiters = new Map<Tier, Limiter>();
const limiterFor = (tier: Tier, env: Env): Limiter => {
  let limiter = limiters.get(tier);
  if (!limiter) {
    limiter = createLimiter(tier, env);
    limiters.set(tier, limiter);
  }
  return limiter;
};

/** Test hook: swap the limiter behind a tier (or pass undefined to rebuild from the environment). */
export function setLimiterForTests(tier: Tier, limiter: Limiter | undefined): void {
  if (limiter) limiters.set(tier, limiter);
  else limiters.delete(tier);
}

/**
 * The single gate every /api handler goes through: origin check first (cheap, no quota spent),
 * then the per-IP rate limit for the route's tier.
 */
export async function evaluateGuard(input: GuardInput, tier: Tier, env: Env = processEnv()): Promise<GuardResult> {
  const verdict = checkOrigin(input.header, env);
  if (!verdict.ok) return { allowed: false, status: 403, headers: { 'cache-control': 'no-store' }, error: 'Forbidden' };

  const result = await limiterFor(tier, env).limit(`${input.ip}`);
  const headers: Record<string, string> = {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.reset / 1000)),
  };
  if (result.success) return { allowed: true, headers, ...(result.pending ? { pending: result.pending } : {}) };

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { allowed: false, status: 429, headers: { ...headers, 'retry-after': String(retryAfter), 'cache-control': 'no-store' }, error: 'Too Many Requests' };
}

export const TIER_LIMITS = TIERS;

/** Client address as seen by Vercel (it overwrites X-Forwarded-For, so the first hop is the client). */
export function clientIp(header: (name: string) => string | null): string {
  return header('x-forwarded-for')?.split(',')[0]?.trim() || header('x-real-ip')?.trim() || 'unknown';
}

/** Lets background work (the Redis sync) finish after the response has been sent. */
export function keepAlive(work: Promise<unknown>): void {
  try {
    waitUntil(work);
  } catch {
    // not on Vercel (dev server, tests): the promise simply runs on
  }
}

/** Wraps a web-standard handler (Vercel function) with the guard; adds rate-limit headers to replies. */
export function guarded(tier: Tier, handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  return async (request) => {
    const header = (name: string) => request.headers.get(name);
    const verdict = await evaluateGuard({ header, ip: clientIp(header) }, tier);
    if (!verdict.allowed) {
      return new Response(JSON.stringify({ error: verdict.error }), {
        status: verdict.status,
        headers: { 'content-type': 'application/json', ...verdict.headers },
      });
    }
    if (verdict.pending) keepAlive(verdict.pending);
    const response = await handler(request);
    for (const [name, value] of Object.entries(verdict.headers)) response.headers.set(name, value);
    return response;
  };
}
