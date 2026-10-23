import { describe, expect, it } from 'vitest';
import { handleGetFollowers, handlePushFollowers, type FollowerStore, type StoredFollowers } from './handler';
import { SOCIAL_FOLLOWER_BASELINE } from '../../../shared/socialMetrics';

const memoryStore = (initial: StoredFollowers | null = null): FollowerStore & { value: StoredFollowers | null } => {
  const s = { value: initial, get: async () => s.value, set: async (v: StoredFollowers) => void (s.value = v) };
  return s;
};
const graph = (counts: Record<string, number | 'fail'>): typeof fetch =>
  (async (url: string | URL | Request) => {
    const id = String(url).split('/v21.0/')[1]!.split('?')[0]!;
    const v = counts[id];
    if (v === undefined || v === 'fail') return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({ followers_count: v }), { status: 200 });
  }) as typeof fetch;
const env = { META_ACCESS_TOKEN: 't0ken', FACEBOOK_PAGE_ID: 'fb1', INSTAGRAM_USER_ID: 'ig1' };
const fixedNow = () => new Date('2026-10-23T12:00:00Z');

describe('GET /api/telemetry/social', () => {
  it('serves the baseline when nothing is configured', async () => {
    const res = await handleGetFollowers({ env: {}, now: fixedNow });
    expect(await res.json()).toMatchObject({ ...SOCIAL_FOLLOWER_BASELINE, source: 'fallback' });
    expect(res.headers.get('cache-control')).toContain('s-maxage=300');
  });

  it('returns live Graph API counts, caches them for 30 minutes and persists them', async () => {
    const store = memoryStore();
    const res = await handleGetFollowers({ env, store, fetchImpl: graph({ ig1: 60001, fb1: 61234 }), now: fixedNow });
    expect(await res.json()).toMatchObject({ instagram: 60001, facebook: 61234, source: 'live', updatedAt: '2026-10-23T12:00:00.000Z' });
    expect(res.headers.get('cache-control')).toContain('s-maxage=1800');
    expect(store.value).toMatchObject({ instagram: 60001, facebook: 61234 });
  });

  it('falls back per platform: one live value, the other from the store', async () => {
    const store = memoryStore({ instagram: 58500, facebook: 59999, updatedAt: '2026-10-22T00:00:00Z' });
    const res = await handleGetFollowers({ env, store, fetchImpl: graph({ ig1: 'fail', fb1: 62000 }), now: fixedNow });
    expect(await res.json()).toMatchObject({ instagram: 58500, facebook: 62000, source: 'live' });
  });

  it('serves stored figures when Meta is down', async () => {
    const store = memoryStore({ instagram: 58500, facebook: 59999, updatedAt: '2026-10-22T00:00:00Z' });
    const res = await handleGetFollowers({ env, store, fetchImpl: graph({ ig1: 'fail', fb1: 'fail' }), now: fixedNow });
    expect(await res.json()).toEqual({ instagram: 58500, facebook: 59999, updatedAt: '2026-10-22T00:00:00Z', source: 'cache' });
  });

  it('rejects implausible upstream values and never leaks the token', async () => {
    const bad = (async () => new Response(JSON.stringify({ followers_count: -5 }))) as unknown as typeof fetch;
    const res = await handleGetFollowers({ env, fetchImpl: bad, now: fixedNow });
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ source: 'fallback' });
    expect(text).not.toContain('t0ken');
  });

  it('survives a store outage', async () => {
    const broken: FollowerStore = { get: async () => { throw new Error('down'); }, set: async () => { throw new Error('down'); } };
    const res = await handleGetFollowers({ env, store: broken, fetchImpl: graph({ ig1: 1, fb1: 2 }), now: fixedNow });
    expect(await res.json()).toMatchObject({ instagram: 1, facebook: 2, source: 'live' });
  });
});

describe('POST /api/telemetry/social', () => {
  const post = (body: unknown, token?: string) =>
    new Request('https://x/api/telemetry/social', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} });
  const e = { TELEMETRY_ADMIN_TOKEN: 's3cret' };

  it('is disabled without a token or store', async () => {
    expect((await handlePushFollowers(post({ facebook: 1 }, 's3cret'), { env: {}, store: memoryStore() })).status).toBe(404);
    expect((await handlePushFollowers(post({ facebook: 1 }, 's3cret'), { env: e })).status).toBe(404);
  });

  it('requires the bearer token', async () => {
    expect((await handlePushFollowers(post({ facebook: 1 }), { env: e, store: memoryStore() })).status).toBe(401);
    expect((await handlePushFollowers(post({ facebook: 1 }, 'wrong'), { env: e, store: memoryStore() })).status).toBe(401);
  });

  it('validates the body', async () => {
    const store = memoryStore();
    for (const body of ['nope', {}, { facebook: -1 }, { facebook: 1.5 }, { twitter: 5 }]) {
      expect((await handlePushFollowers(post(body, 's3cret'), { env: e, store })).status).toBe(400);
    }
    expect(store.value).toBeNull();
  });

  it('merges pushed counts into the store', async () => {
    const store = memoryStore({ instagram: 58171, updatedAt: 'old' });
    const res = await handlePushFollowers(post({ facebook: 60100 }, 's3cret'), { env: e, store, now: fixedNow });
    expect(res.status).toBe(200);
    expect(store.value).toEqual({ instagram: 58171, facebook: 60100, updatedAt: '2026-10-23T12:00:00.000Z' });
  });
});
