import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '../../plc/evaluate';
import { POST as LOGO_POST } from '../../plc/logo/evaluate';
import { POST as LOGIC_POST } from '../../logic/solve';
import { POST as SIGNALS_POST } from '../../signals/transform';
import { POST as CONTROL_POST } from '../../control/solve';
import { POST as CODE_POST } from '../../code/process';
import { evaluateGuard, guarded, setLimiterForTests } from './guard';
import { checkOrigin } from './origin';
import { HybridLimiter, MemoryLimiter, TIERS } from './ratelimit';

const prod = { NODE_ENV: 'production' };
const dev = { NODE_ENV: 'development' };
const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe('origin guard', () => {
  it('accepts the production site by Origin or Referer, rejects everyone else', () => {
    expect(checkOrigin(headers({ origin: 'https://maeacademy.org' }), prod).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'https://www.maeacademy.org' }), prod).ok).toBe(true);
    expect(checkOrigin(headers({ referer: 'https://maeacademy.org/simulations/plc?x=1' }), prod).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'https://evil.example' }), prod).ok).toBe(false);
    expect(checkOrigin(headers({ origin: 'https://maeacademy.org.evil.example' }), prod).ok).toBe(false);
    expect(checkOrigin(headers({ origin: 'null' }), prod).ok).toBe(false);
    expect(checkOrigin(headers({ referer: 'https://evil.example/https://maeacademy.org/' }), prod).ok).toBe(false);
  });

  it('an allowed Origin cannot be overridden by a foreign Referer, and a bad Origin is final', () => {
    expect(checkOrigin(headers({ origin: 'https://maeacademy.org', referer: 'https://evil.example/' }), prod).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'https://evil.example', referer: 'https://maeacademy.org/' }), prod).ok).toBe(false);
  });

  it('rejects requests with no signal (curl, scripts); accepts browser same-origin fetches with no referer', () => {
    expect(checkOrigin(headers({}), prod).ok).toBe(false);
    expect(checkOrigin(headers({ 'user-agent': 'curl/8' }), prod).ok).toBe(false);
    expect(checkOrigin(headers({ 'sec-fetch-site': 'cross-site' }), prod).ok).toBe(false);
    expect(checkOrigin(headers({ 'sec-fetch-site': 'same-origin' }), prod).ok).toBe(true);
  });

  it('allows localhost only outside production', () => {
    expect(checkOrigin(headers({ origin: 'http://localhost:3000' }), dev).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'http://127.0.0.1:5173' }), dev).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'http://localhost:3000' }), prod).ok).toBe(false);
  });

  it('honours Vercel preview hosts and ALLOWED_ORIGINS', () => {
    const env = { NODE_ENV: 'production', VERCEL_URL: 'mae-abc123.vercel.app', ALLOWED_ORIGINS: 'http://localhost:5000, https://staging.maeacademy.org' };
    expect(checkOrigin(headers({ origin: 'https://mae-abc123.vercel.app' }), env).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'http://localhost:5000' }), env).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'https://staging.maeacademy.org' }), env).ok).toBe(true);
    expect(checkOrigin(headers({ origin: 'https://other.vercel.app' }), env).ok).toBe(false);
  });
});

describe('sliding-window limiter', () => {
  it('allows exactly `max` per window, then blocks, then recovers as the window slides', async () => {
    let now = 1_000_000;
    const limiter = new MemoryLimiter(5, 60_000, () => now);
    const results = [];
    for (let i = 0; i < 7; i++) results.push((await limiter.limit('a')).success);
    expect(results).toEqual([true, true, true, true, true, false, false]);
    expect((await limiter.limit('b')).success).toBe(true); // keys are independent
    now += 130_000; // two windows later
    expect((await limiter.limit('a')).success).toBe(true);
  });

  it('reports limit, remaining and reset', async () => {
    const limiter = new MemoryLimiter(3, 60_000, () => 61_000);
    const first = await limiter.limit('k');
    expect(first).toMatchObject({ success: true, limit: 3, remaining: 2, reset: 120_000 });
    await limiter.limit('k');
    await limiter.limit('k');
    expect(await limiter.limit('k')).toMatchObject({ success: false, remaining: 0 });
  });

  it('defines the tiers agreed for the platform', () => {
    expect(TIERS.general.limit).toBe(60);
    expect(TIERS.plc.limit).toBe(900);
    expect(TIERS.circuit.limit).toBe(900);
    expect(TIERS.assets.limit).toBeGreaterThan(TIERS.general.limit);
    expect(TIERS.ai.limit).toBeLessThan(TIERS.general.limit); // every AI request spends a paid upstream call
  });
});

describe('guard: 403 / 429 behaviour and headers', () => {
  const ok = { origin: 'https://maeacademy.org', 'x-forwarded-for': '203.0.113.9' };
  const env = { NODE_ENV: 'production' };
  afterEach(() => (['general', 'plc', 'assets'] as const).forEach((t) => setLimiterForTests(t, undefined)));

  it('403 for a foreign or missing origin, without spending any quota', async () => {
    const limiter = new MemoryLimiter(1, 60_000);
    setLimiterForTests('general', limiter);
    const blocked = await evaluateGuard({ header: headers({ origin: 'https://evil.example' }), ip: '1.1.1.1' }, 'general', env);
    expect(blocked).toMatchObject({ allowed: false, status: 403 });
    expect((await limiter.limit('1.1.1.1')).success).toBe(true); // the 403 did not consume the only slot
  });

  it('429 with Retry-After and X-RateLimit-* once the tier is exhausted', async () => {
    setLimiterForTests('general', new MemoryLimiter(2, 60_000));
    const input = { header: headers(ok), ip: '203.0.113.9' };
    const a = await evaluateGuard(input, 'general', env);
    expect(a).toMatchObject({ allowed: true, headers: { 'x-ratelimit-limit': '2', 'x-ratelimit-remaining': '1' } });
    await evaluateGuard(input, 'general', env);
    const c = await evaluateGuard(input, 'general', env);
    expect(c).toMatchObject({ allowed: false, status: 429 });
    if (c.allowed) throw new Error('unreachable');
    expect(Number(c.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(c.headers['x-ratelimit-remaining']).toBe('0');
    expect(c.headers['x-ratelimit-limit']).toBe('2');
  });

  it('tiers are separate buckets: exhausting general does not touch plc', async () => {
    setLimiterForTests('general', new MemoryLimiter(1, 60_000));
    setLimiterForTests('plc', new MemoryLimiter(900, 60_000));
    const input = { header: headers(ok), ip: '203.0.113.9' };
    await evaluateGuard(input, 'general', env);
    expect(await evaluateGuard(input, 'general', env)).toMatchObject({ allowed: false, status: 429 });
    expect(await evaluateGuard(input, 'plc', env)).toMatchObject({ allowed: true });
  });

  it('guarded() wraps a web handler: 403, 429 and headers on success', async () => {
    const limiter = new MemoryLimiter(1, 60_000);
    setLimiterForTests('plc', limiter);
    const handler = guarded('plc', async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }));
    const req = (h: Record<string, string>) => new Request('http://x/api/plc/evaluate', { method: 'POST', headers: h, body: '{}' });

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect((await handler(req({}))).status).toBe(403);
      const first = await handler(req(ok));
      expect(first.status).toBe(200);
      expect(first.headers.get('x-ratelimit-limit')).toBe('1');
      const second = await handler(req(ok));
      expect(second.status).toBe(429);
      expect(second.headers.get('retry-after')).not.toBeNull();
      expect(await second.json()).toEqual({ error: 'Too Many Requests' });
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('the real /api/code/process route is guarded', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await CODE_POST(new Request('http://x/api/code/process', { method: 'POST', body: '{}' }));
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('the real /api/control/solve route is guarded', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await CONTROL_POST(new Request('http://x/api/control/solve', { method: 'POST', body: '{}' }));
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('the real /api/signals/transform route is guarded', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await SIGNALS_POST(new Request('http://x/api/signals/transform', { method: 'POST', body: '{}' }));
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('the real /api/logic/solve route is guarded', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await LOGIC_POST(new Request('http://x/api/logic/solve', { method: 'POST', body: '{}' }));
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('the real /api/plc/logo/evaluate route is guarded', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await LOGO_POST(new Request('http://x/api/plc/logo/evaluate', { method: 'POST', body: '{}' }));
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('the real /api/plc/evaluate route is guarded', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await POST(new Request('http://x/api/plc/evaluate', { method: 'POST', body: '{}' }));
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

describe('hybrid limiter (plc tier): Redis stays off the response path', () => {
  const never = new Promise<never>(() => {});
  const fast = async <T>(work: Promise<T>): Promise<T> => Promise.race([work, new Promise<never>((_, r) => setTimeout(() => r(new Error('blocked on Redis')), 100))]);

  it('decides locally without waiting for a slow or hung Redis, and hands back the sync as background work', async () => {
    const limiter = new HybridLimiter(new MemoryLimiter(900, 60_000), { limit: () => never }, 900);
    const result = await fast(limiter.limit('ip'));
    expect(result.success).toBe(true);
    expect(result.pending).toBeInstanceOf(Promise);
  });

  it('when the shared counter says the IP is over its global limit, it is refused locally from then on', async () => {
    let now = 1_000_000;
    const limiter = new HybridLimiter(new MemoryLimiter(900, 60_000, () => now), { limit: async () => ({ success: false, reset: now + 30_000 }) }, 900, () => now);
    const first = await limiter.limit('ip');
    expect(first.success).toBe(true); // this request was admitted on the local decision
    await first.pending; // the background sync lands
    const next = await limiter.limit('ip');
    expect(next).toMatchObject({ success: false, remaining: 0, reset: now + 30_000 });
    expect((await limiter.limit('other-ip')).success).toBe(true); // per key
    now += 31_000; // the block expires with the window
    expect((await limiter.limit('ip')).success).toBe(true);
  });

  it('a failing or timed-out Redis never affects users, and the local window still enforces the limit', async () => {
    const limiter = new HybridLimiter(new MemoryLimiter(2, 60_000), { limit: async () => { throw new Error('redis down'); } }, 2);
    const a = await limiter.limit('ip');
    await a.pending;
    expect((await limiter.limit('ip')).success).toBe(true);
    expect((await limiter.limit('ip')).success).toBe(false); // local limit of 2 reached
  });

  it('guarded() keeps the background sync alive without delaying the reply', async () => {
    const tracked: Promise<unknown>[] = [];
    let release!: () => void;
    const slow = new Promise<void>((resolve) => (release = resolve));
    setLimiterForTests('plc', { limit: async () => ({ success: true, limit: 900, remaining: 899, reset: Date.now() + 1000, pending: slow.then(() => tracked.push(slow)) }) });
    const handler = guarded('plc', async () => new Response('{}'));
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await fast(handler(new Request('http://x/api/plc/evaluate', { method: 'POST', headers: { origin: 'https://maeacademy.org', 'x-forwarded-for': '9.9.9.9' }, body: '{}' })));
      expect(res.status).toBe(200); // replied while the sync is still outstanding
      expect(res.headers.get('x-ratelimit-limit')).toBe('900');
    } finally {
      process.env.NODE_ENV = prev;
      release();
      setLimiterForTests('plc', undefined);
    }
  });
});
