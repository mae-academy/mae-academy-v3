import { build } from 'esbuild';
import { EdgeVM } from '@edge-runtime/vm';
import { describe, expect, it } from 'vitest';

/** Same contract as api/_lib/plc/edge.test.ts, for the Digital Logic route: edge-bundleable and guarded. */
describe('api/logic/solve on the Edge runtime', () => {
  let bundle = '';

  it('bundles for a non-Node target with no UI code in the graph', async () => {
    const result = await build({
      entryPoints: ['api/logic/solve.ts'],
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
    expect(bundle.length).toBeLessThan(1_500_000); // ~170 KB gzipped, far under the edge function limit
  });

  it('serves real traffic inside the edge sandbox: guard, K-map, discrete-event run, bad input', async () => {
    const vm = new EdgeVM({ extend: (context) => Object.assign(context, { process: { env: {} } }) });
    vm.evaluate(bundle);
    const call = async (payload: unknown, headers: Record<string, string> = { origin: 'https://maeacademy.org', 'x-forwarded-for': '198.51.100.21' }) => {
      (vm.context as Record<string, unknown>).__payload = JSON.stringify(payload);
      (vm.context as Record<string, unknown>).__headers = headers;
      const out = (await vm.evaluate(`edgeApi.POST(new Request('https://maeacademy.org/api/logic/solve', { method: 'POST', headers: __headers, body: __payload })).then(async (r) => ({ status: r.status, text: await r.text(), limit: r.headers.get('x-ratelimit-limit') }))`)) as { status: number; text: string; limit: string | null };
      return { status: out.status, json: JSON.parse(out.text) as Record<string, any>, limit: out.limit };
    };
    const kmap = await call({ op: 'kmap', variables: ['A', 'B', 'C'], minterms: [1, 3, 5, 7] });
    expect(kmap.status).toBe(200);
    expect(kmap.json.solution.expression).toBe('C');
    expect(kmap.limit).toBe('900'); // the logic tier, from the real guard

    const comp = (id: string, type: string, props: Record<string, unknown> = {}) => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
    const run = await call({ op: 'des', state: null, ops: [{ t: 'step', dt: 0.01 }], components: [comp('a', 'digital-input', { state: 'HIGH' }), comp('n', 'gate-not'), comp('o', 'digital-output')], wires: [{ id: 'w1', fromComp: 'a', fromTerm: 'out', toComp: 'n', toTerm: 'a' }, { id: 'w2', fromComp: 'n', fromTerm: 'y', toComp: 'o', toTerm: 'in' }] });
    expect(run.status).toBe(200);
    expect(run.json.pins['o:in']).toBe(0);

    expect((await call({ op: 'kmap', variables: ['A', 'B'], minterms: [1] }, { 'x-forwarded-for': '198.51.100.22' })).status).toBe(403); // no origin
    expect((await call({ op: 'kmap', variables: ['A'], minterms: [1] })).status).toBe(400);
  });
});
