import { z } from 'zod';
import { evaluateBatch, UnknownProfileError } from './evaluate';
import { EvaluateRequestSchema } from '../../plc/schema';

const MAX_BODY_BYTES = 512 * 1024;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/** Web-standard handler shared by the Vercel function and the local Express adapter. */
export async function handleEvaluate(request: Request): Promise<Response> {
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

  const parsed = EvaluateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: z.treeifyError(parsed.error) }, 400);
  }

  try {
    const started = performance.now();
    const result = evaluateBatch(parsed.data);
    return json({ ...result, serverMs: Math.round((performance.now() - started) * 100) / 100 });
  } catch (error) {
    if (error instanceof UnknownProfileError) return json({ error: error.message }, 400);
    // Malformed-but-schema-valid input (e.g. wrong snapshot size) is the caller's fault, not ours.
    if (error instanceof Error && /Snapshot|not allocated|address/i.test(error.message)) return json({ error: error.message }, 400);
    console.error('plc/evaluate failed', error);
    return json({ error: 'Internal error' }, 500);
  }
}
