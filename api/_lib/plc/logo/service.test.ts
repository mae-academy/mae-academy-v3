import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../../../client/src/features/plc-simulator/logo/scenarios';
import { EMPTY_PROGRAM } from '../../../../shared/logo/types';
import { EMPTY_WIRE_STATE, type LogoOp } from '../../../../shared/logo/wire';
import { handleLogoEvaluate } from './handler';
import { serveLogoEvaluate } from './service';

const program = SCENARIOS['seal-in-gates'].program;
const press = (index: number) => '0'.repeat(index) + '1' + '0'.repeat(23 - index);
const body = (ops: LogoOp[], extra: Record<string, unknown> = {}) => ({ v: 1, program, st: EMPTY_WIRE_STATE, ops, ...extra });

describe('serveLogoEvaluate', () => {
  it('is stateless: two requests chained through the returned state equal one request', () => {
    const scans = (at: number[], inputs: string): LogoOp => ({ t: 'scan', at, inputs });
    const whole = serveLogoEvaluate(body([{ t: 'start' }, scans([0, 20, 40, 60], press(0))]));
    const a = serveLogoEvaluate(body([{ t: 'start' }, scans([0, 20], press(0))]));
    const b = serveLogoEvaluate(body([scans([40, 60], press(0))], { st: (a.body as { st: unknown }).st }));
    expect((b.body as { st: unknown }).st).toEqual((whole.body as { st: unknown }).st);
  });

  it('refuses an invalid program with its diagnostics instead of running it', () => {
    const bad = { ...program, sinks: [{ target: { kind: 'digital-output', index: 1 }, source: { kind: 'block-output', blockId: 99 } }] };
    const res = serveLogoEvaluate(body([{ t: 'start' }], { program: bad }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false });
    expect(JSON.stringify(res.body)).toContain('B99 does not exist');
  });

  it('does not scan while stopped, and a stopped CPU holds every relay open', () => {
    const res = serveLogoEvaluate(body([{ t: 'scan', at: [0], inputs: press(0) }]));
    expect((res.body as { st: { c: number } }).st.c).toBe(0);
  });

  it('validates the payload: version, malformed state, oversized batches, unknown block types', () => {
    expect(serveLogoEvaluate({ ...body([]), v: 2 }).status).toBe(400);
    expect(serveLogoEvaluate(body([], { st: { ...EMPTY_WIRE_STATE, q: '2'.repeat(16) } })).status).toBe(400);
    expect(serveLogoEvaluate(body([{ t: 'scan', at: Array.from({ length: 65 }, (_, i) => i), inputs: press(0) }])).status).toBe(400);
    expect(serveLogoEvaluate(body(Array.from({ length: 17 }, () => ({ t: 'stop' }) as LogoOp))).status).toBe(400);
    const evil = { ...EMPTY_PROGRAM, blocks: [{ id: 1, type: 'EXEC', inputs: {}, params: {}, retentive: false }] };
    expect(serveLogoEvaluate(body([], { program: evil })).status).toBe(400);
  });
});

describe('handleLogoEvaluate', () => {
  const post = (text: string, headers: Record<string, string> = {}) => handleLogoEvaluate(new Request('http://x/api/plc/logo/evaluate', { method: 'POST', body: text, headers }));

  it('rejects non-POST, bad JSON and oversized bodies', async () => {
    expect((await handleLogoEvaluate(new Request('http://x/', { method: 'GET' }))).status).toBe(405);
    expect((await post('{nope')).status).toBe(400);
    expect((await post('x'.repeat(300 * 1024))).status).toBe(413);
  });

  it('reports server time on success', async () => {
    const res = await post(JSON.stringify(body([{ t: 'start' }])));
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).ms).toBe('number');
  });
});
