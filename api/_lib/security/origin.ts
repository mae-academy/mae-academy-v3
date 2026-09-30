/**
 * Browser-origin check for the public API.
 *
 * This keeps other websites from using our endpoints as their backend and turns away naive
 * scripts. It is a speed bump, not authentication: a non-browser client can set any header it
 * likes. The real protection is the rate limit, the Zod schemas and the per-request compute caps.
 */

const PRODUCTION_ORIGINS = ['https://maeacademy.org', 'https://www.maeacademy.org'];
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export interface OriginEnv {
  readonly NODE_ENV?: string;
  /** Comma-separated extra origins, e.g. "http://localhost:5000" when testing `pnpm start`. */
  readonly ALLOWED_ORIGINS?: string;
  readonly VERCEL_URL?: string;
  readonly VERCEL_BRANCH_URL?: string;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string;
}

const toOrigin = (value: string): string | null => {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.origin;
  } catch {
    return null;
  }
};

export function isAllowedOrigin(origin: string, env: OriginEnv): boolean {
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (env.NODE_ENV !== 'production' && LOCAL_ORIGIN.test(origin)) return true; // dev only
  const extra = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => toOrigin(host));
  for (const entry of (env.ALLOWED_ORIGINS ?? '').split(',')) extra.push(toOrigin(entry.trim()));
  return extra.includes(origin);
}

export type OriginVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * `Origin` wins when present (every cross-site and every POST request carries it). Otherwise the
 * `Referer` origin is used. Same-origin GETs from `<img>`/fetch and `rel=noreferrer` navigations
 * may carry neither, so the browser-set `Sec-Fetch-Site: same-origin` is accepted as a last resort.
 * Anything with no signal at all (curl, most scrapers) is rejected.
 */
export function checkOrigin(header: (name: string) => string | null, env: OriginEnv): OriginVerdict {
  const origin = header('origin');
  if (origin) {
    return origin !== 'null' && isAllowedOrigin(origin, env) ? { ok: true } : { ok: false, reason: 'origin not allowed' };
  }
  const referer = header('referer');
  if (referer) {
    const refererOrigin = toOrigin(referer);
    return refererOrigin !== null && isAllowedOrigin(refererOrigin, env) ? { ok: true } : { ok: false, reason: 'referer not allowed' };
  }
  if (header('sec-fetch-site') === 'same-origin') return { ok: true };
  return { ok: false, reason: 'missing origin' };
}
