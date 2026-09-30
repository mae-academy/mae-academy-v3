import type { IncomingHttpHeaders } from 'node:http';
import { clientIp, evaluateGuard } from './guard';
import type { Tier } from './ratelimit';

interface NodeRequestLike {
  readonly headers: IncomingHttpHeaders;
  readonly socket: { readonly remoteAddress?: string };
}
interface NodeResponseLike {
  status(code: number): NodeResponseLike;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

const one = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/** Address to rate-limit on: the platform's forwarded header on Vercel, the socket otherwise. */
export function nodeClientIp(req: NodeRequestLike): string {
  const header = (name: string) => one(req.headers[name]);
  if (process.env.VERCEL || process.env.TRUST_PROXY === '1') return clientIp(header);
  return req.socket.remoteAddress ?? 'unknown';
}

/** Express/Connect middleware running the same guard as the Vercel functions. */
export function expressGuard(tier: Tier | ((path: string) => Tier)) {
  return async (req: NodeRequestLike & { path?: string }, res: NodeResponseLike, next: () => void): Promise<void> => {
    const resolved = typeof tier === 'function' ? tier(req.path ?? '') : tier;
    const verdict = await evaluateGuard({ header: (name) => one(req.headers[name]), ip: nodeClientIp(req) }, resolved);
    for (const [name, value] of Object.entries(verdict.headers)) res.setHeader(name, value);
    if (verdict.allowed) return next();
    res.status(verdict.status).json({ error: verdict.error });
  };
}

/** Builds the web `Request` the serverless handlers expect from a Node request and its raw body. */
export function toWebRequest(req: NodeRequestLike & { method?: string }, url: string, body: string | Uint8Array | undefined): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    const text = one(value);
    if (text !== null) headers.set(name, text);
  }
  headers.set('x-forwarded-for', nodeClientIp(req)); // the guard reads the client address from here
  const method = req.method ?? 'POST';
  return new Request(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : (body as BodyInit | undefined) });
}
