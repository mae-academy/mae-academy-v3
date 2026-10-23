import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { SOCIAL_FOLLOWER_BASELINE, type SocialFollowersPayload } from '../../../shared/socialMetrics';

/**
 * Social follower telemetry. Official counts only: Meta's Graph API with a Page/IG access token. Nothing is
 * scraped (platform terms forbid it and it breaks without notice). When the API is not configured or fails,
 * the last stored figures are served, and finally the baseline in shared/socialMetrics.ts.
 */

export interface TelemetryEnv {
  readonly META_ACCESS_TOKEN?: string;
  readonly FACEBOOK_PAGE_ID?: string;
  readonly INSTAGRAM_USER_ID?: string;
  /** Enables POST: lets a script, webhook or cron push fresh numbers into the store. */
  readonly TELEMETRY_ADMIN_TOKEN?: string;
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
  readonly KV_REST_API_URL?: string;
  readonly KV_REST_API_TOKEN?: string;
}

export interface StoredFollowers {
  readonly instagram?: number;
  readonly facebook?: number;
  readonly updatedAt: string;
}

export interface FollowerStore {
  get(): Promise<StoredFollowers | null>;
  set(value: StoredFollowers): Promise<void>;
}

const GRAPH = 'https://graph.facebook.com/v21.0';
const STORE_KEY = 'telemetry:social-followers';
/** Edge cache lifetimes: the CDN absorbs traffic so Meta is queried roughly once per half hour. */
const CACHE_OK = 'public, s-maxage=1800, stale-while-revalidate=3600';
const CACHE_FALLBACK = 'public, s-maxage=300, stale-while-revalidate=600';

const count = z.number().int().min(0).max(2_000_000_000);
const pushSchema = z.object({ instagram: count.optional(), facebook: count.optional() }).strict().refine((v) => v.instagram !== undefined || v.facebook !== undefined, 'nothing to update');

async function graphFollowers(id: string | undefined, token: string | undefined, fetchImpl: typeof fetch): Promise<number | undefined> {
  if (!id || !token) return undefined;
  try {
    const res = await fetchImpl(`${GRAPH}/${encodeURIComponent(id)}?fields=followers_count&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return undefined;
    const parsed = count.safeParse(((await res.json()) as { followers_count?: unknown }).followers_count);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined; // the token never reaches a log or a response
  }
}

export function createRedisStore(env: TelemetryEnv): FollowerStore | undefined {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return undefined;
  const redis = new Redis({ url, token });
  return {
    get: async () => (await redis.get<StoredFollowers>(STORE_KEY)) ?? null,
    set: async (value) => {
      await redis.set(STORE_KEY, value);
    },
  };
}

export interface HandlerDeps {
  readonly env: TelemetryEnv;
  readonly store?: FollowerStore | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

const json = (body: unknown, status: number, cache: string): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });

export async function handleGetFollowers({ env, store, fetchImpl = fetch, now = () => new Date() }: HandlerDeps): Promise<Response> {
  const [ig, fb, stored] = await Promise.all([
    graphFollowers(env.INSTAGRAM_USER_ID, env.META_ACCESS_TOKEN, fetchImpl),
    graphFollowers(env.FACEBOOK_PAGE_ID, env.META_ACCESS_TOKEN, fetchImpl),
    store?.get().catch(() => null) ?? Promise.resolve(null),
  ]);

  const live = ig !== undefined || fb !== undefined;
  const updatedAt = now().toISOString();
  const payload: SocialFollowersPayload = {
    instagram: ig ?? stored?.instagram ?? SOCIAL_FOLLOWER_BASELINE.instagram,
    facebook: fb ?? stored?.facebook ?? SOCIAL_FOLLOWER_BASELINE.facebook,
    updatedAt: live ? updatedAt : (stored?.updatedAt ?? updatedAt),
    source: live ? 'live' : stored ? 'cache' : 'fallback',
  };

  if (live && store) {
    // Keep the freshest figures so a later Meta outage still serves recent numbers.
    await store.set({ instagram: payload.instagram, facebook: payload.facebook, updatedAt }).catch(() => undefined);
  }
  return json(payload, 200, payload.source === 'fallback' ? CACHE_FALLBACK : CACHE_OK);
}

/** Constant-time string comparison (both sides are short secrets). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function handlePushFollowers(req: Request, { env, store, now = () => new Date() }: HandlerDeps): Promise<Response> {
  const secret = env.TELEMETRY_ADMIN_TOKEN;
  if (!secret || !store) return json({ error: 'Not enabled' }, 404, 'no-store');
  const auth = req.headers.get('authorization') ?? '';
  if (!safeEqual(auth, `Bearer ${secret}`)) return json({ error: 'Unauthorized' }, 401, 'no-store');

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ error: 'Invalid JSON' }, 400, 'no-store');
  }
  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid body' }, 400, 'no-store');

  const previous = (await store.get().catch(() => null)) ?? undefined;
  const next: StoredFollowers = { ...previous, ...parsed.data, updatedAt: now().toISOString() };
  await store.set(next);
  return json({ ok: true, ...next }, 200, 'no-store');
}
