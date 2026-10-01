import { build } from 'esbuild';
import { EdgeVM } from '@edge-runtime/vm';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../../../client/src/features/plc-simulator/logo/scenarios';
import { EMPTY_WIRE_STATE } from '../../../../shared/logo/wire';

/** Same contract as api/_lib/plc/edge.test.ts, for the LOGO! route: edge-bundleable and guarded. */
describe('api/plc/logo/evaluate on the Edge runtime', () => {
  let bundle = '';

  it('bundles for a non-Node target with no UI code in the graph', async () => {
    const result = await build({
      entryPoints: ['api/plc/logo/evaluate.ts'],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      globalName: 'edgeApi',
      conditions: ['edge-light', 'worker', 'browser'],
      metafile: true,
      logLevel: 'silent',
    });
    bundle = result.outputFiles[0]!.text;
    const inputs = Object.keys(result.metafile!.inputs);
    expect(inputs.some((file) => file.startsWith('node:'))).toBe(false);
    expect(inputs.some((file) => /client\/src|node-adapter|express/.test(file))).toBe(false);
    expect(bundle.length).toBeLessThan(1_000_000);
  });

  it('serves real traffic inside the edge sandbox: guard, validation, scans, bad input', async () => {
    const vm = new EdgeVM({ extend: (context) => Object.assign(context, { process: { env: {} } }) });
    vm.evaluate(bundle);
    const program = SCENARIOS['seal-in-gates'].program;

    const call = async (payload: unknown, headers: Record<string, string> = { origin: 'https://maeacademy.org', 'x-forwarded-for': '198.51.100.9' }) => {
      (vm.context as Record<string, unknown>).__payload = JSON.stringify(payload);
      (vm.context as Record<string, unknown>).__headers = headers;
      const out = (await vm.evaluate(`edgeApi.POST(new Request('https://maeacademy.org/api/plc/logo/evaluate', { method: 'POST', headers: __headers, body: __payload })).then(async (r) => ({ status: r.status, text: await r.text(), limit: r.headers.get('x-ratelimit-limit') }))`)) as { status: number; text: string; limit: string | null };
      return { status: out.status, json: JSON.parse(out.text) as Record<string, any>, limit: out.limit };
    };

    const inputs = '1' + '0'.repeat(23);
    const res = await call({ v: 1, program, st: EMPTY_WIRE_STATE, ops: [{ t: 'start' }, { t: 'scan', at: [0, 20, 40], inputs }] });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.st.c).toBe(3);
    expect(res.json.st.run).toBe(1);
    expect(res.limit).toBe('900'); // the plc tier, from the real guard

    expect((await call({ v: 1, program, st: EMPTY_WIRE_STATE, ops: [] }, { 'x-forwarded-for': '198.51.100.10' })).status).toBe(403); // no origin
    expect((await call({ v: 2, program, st: EMPTY_WIRE_STATE, ops: [] })).status).toBe(400);
    expect((await call({ v: 1, program, st: EMPTY_WIRE_STATE, ops: [{ t: 'scan', at: [], inputs }] })).status).toBe(400);
  });
});
