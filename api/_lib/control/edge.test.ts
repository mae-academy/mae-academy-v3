import { build } from 'esbuild';
import { EdgeVM } from '@edge-runtime/vm';
import { describe, expect, it } from 'vitest';
import { defaultRectifierParameters } from '../../../shared/power/rectifierTypes';

/** Same contract as the other edge tests, for the control / power route: edge-bundleable, guarded, no UI code. */
describe('api/control/solve on the Edge runtime', () => {
  let bundle = '';

  it('bundles for a non-Node target with no UI code in the graph', async () => {
    const result = await build({
      entryPoints: ['api/control/solve.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'edgeApi',
      conditions: ['edge-light', 'worker', 'browser'], metafile: true, logLevel: 'silent',
    });
    bundle = result.outputFiles[0]!.text;
    const inputs = Object.keys(result.metafile!.inputs);
    expect(inputs.some((file) => file.startsWith('node:'))).toBe(false);
    expect(inputs.some((file) => /client\/src|node-adapter|express/.test(file))).toBe(false);
    expect(bundle.length).toBeLessThan(1_500_000);
  });

  it('serves real traffic inside the edge sandbox: guard, converter and control requests, bad input', async () => {
    const vm = new EdgeVM({ extend: (context) => Object.assign(context, { process: { env: {} } }) });
    vm.evaluate(bundle);
    const call = async (payload: unknown, headers: Record<string, string> = { origin: 'https://maeacademy.org', 'x-forwarded-for': '198.51.100.41' }) => {
      (vm.context as Record<string, unknown>).__payload = JSON.stringify(payload);
      (vm.context as Record<string, unknown>).__headers = headers;
      const out = (await vm.evaluate(`edgeApi.POST(new Request('https://maeacademy.org/api/control/solve', { method: 'POST', headers: __headers, body: __payload })).then(async (r) => ({ status: r.status, text: await r.text(), limit: r.headers.get('x-ratelimit-limit') }))`)) as { status: number; text: string; limit: string | null };
      return { status: out.status, json: JSON.parse(out.text) as Record<string, any>, limit: out.limit };
    };
    const rect = await call({ domain: 'power', request: { op: 'rectifier', parameters: defaultRectifierParameters } });
    expect(rect.status).toBe(200);
    expect(rect.json.simulation.samples.length).toBeGreaterThan(100);
    expect(rect.limit).toBe('900'); // the control tier, from the real guard

    const locus = await call({ domain: 'control', request: { op: 'root-locus', numerator: [1], denominator: [1, 3, 2, 0], locus: true } });
    expect(locus.json.locus.openLoopPoles).toHaveLength(3);

    expect((await call({ domain: 'power', request: { op: 'rectifier', parameters: defaultRectifierParameters } }, { 'x-forwarded-for': '198.51.100.42' })).status).toBe(403); // no origin
    expect((await call({ domain: 'power', request: { op: 'rectifier', parameters: { ...defaultRectifierParameters, firingAngle: 200 } } })).status).toBe(400);
  });
});
