import { build } from 'esbuild';
import { EdgeVM } from '@edge-runtime/vm';
import { describe, expect, it } from 'vitest';

/** Same contract as api/_lib/plc/edge.test.ts, for the Signals & Systems route: edge-bundleable and guarded. */
describe('api/signals/transform on the Edge runtime', () => {
  let bundle = '';

  it('bundles for a non-Node target with no UI code in the graph', async () => {
    const result = await build({
      entryPoints: ['api/signals/transform.ts'],
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

  it('serves real traffic inside the edge sandbox: guard, transforms, convolution, bad input', async () => {
    const vm = new EdgeVM({ extend: (context) => Object.assign(context, { process: { env: {} } }) });
    vm.evaluate(bundle);
    const call = async (payload: unknown, headers: Record<string, string> = { origin: 'https://maeacademy.org', 'x-forwarded-for': '198.51.100.31' }) => {
      (vm.context as Record<string, unknown>).__payload = JSON.stringify(payload);
      (vm.context as Record<string, unknown>).__headers = headers;
      const out = (await vm.evaluate(`edgeApi.POST(new Request('https://maeacademy.org/api/signals/transform', { method: 'POST', headers: __headers, body: __payload })).then(async (r) => ({ status: r.status, text: await r.text(), limit: r.headers.get('x-ratelimit-limit') }))`)) as { status: number; text: string; limit: string | null };
      return { status: out.status, json: JSON.parse(out.text) as Record<string, any>, limit: out.limit };
    };
    const tf = await call({ action: 'laplace', request: { op: 'parse', source: '\\frac{1}{s+2}', mode: 's' } });
    expect(tf.status).toBe(200);
    expect(tf.json.system.poles).toEqual([{ re: -2, im: 0 }]);
    expect(tf.limit).toBe('900'); // the signals tier, from the real guard

    const series = await call({ action: 'fourier', request: { op: 'series', expression: '\\text{rect}(t)', period: 2, harmonics: 6 } });
    expect(series.json.series.coefficients).toHaveLength(13);
    const conv = await call({ action: 'convolution', request: { op: 'discrete', x: [1, 2, 1], h: [1, -1, 2] } });
    expect(conv.json.result.values).toEqual([1, 1, 1, 3, 2]);

    expect((await call({ action: 'convolution', request: { op: 'discrete', x: [1], h: [1] } }, { 'x-forwarded-for': '198.51.100.32' })).status).toBe(403); // no origin
    expect((await call({ action: 'fourier', request: { op: 'series', expression: 'x', period: 9999, harmonics: 4 } })).status).toBe(400);
  });
});
