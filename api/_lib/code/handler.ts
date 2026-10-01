import { serveCode } from './service';

const MAX_BODY_BYTES = 512 * 1024;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/** Web-standard handler shared by the Vercel function and the local Express adapter. */
export async function handleCode(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: 'Unreadable body' }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Body must be valid JSON' }, 400);
  }

  try {
    const started = performance.now();
    const result = await serveCode(payload);
    const serverMs = Math.round((performance.now() - started) * 100) / 100;
    return json(result.status === 200 ? { ...result.body, ms: serverMs } : result.body, result.status);
  } catch (error) {
    console.error('code/process failed', error);
    return json({ error: 'Internal error' }, 500);
  }
}
