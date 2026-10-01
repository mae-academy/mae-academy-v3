import { build } from 'esbuild';
import { EdgeVM } from '@edge-runtime/vm';
import { describe, expect, it } from 'vitest';

/**
 * The route is declared `runtime: 'edge'`: no Node built-ins, and no dynamic code evaluation (Edge forbids eval / new Function,
 * which is why the deployed compiler returns generated JavaScript for the browser to instantiate instead of running it).
 */
describe('api/code/process on the Edge runtime', () => {
  let bundle = '';

  it('bundles for a non-Node target: no Node built-ins, no UI code, and none of the Node-only JSCPP interpreter modules', async () => {
    const result = await build({
      entryPoints: ['api/code/process.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'edgeApi',
      conditions: ['edge-light', 'worker', 'browser'], metafile: true, logLevel: 'silent',
    });
    bundle = result.outputFiles[0]!.text;
    const inputs = Object.keys(result.metafile!.inputs);
    expect(inputs.some((file) => file.startsWith('node:'))).toBe(false);
    expect(inputs.some((file) => /client\/src|node-adapter|express|JSCPP/.test(file))).toBe(false);
    expect(bundle).not.toMatch(/new Function\(/); // the Function-based instantiation helper must be tree-shaken out
    expect(bundle.length).toBeLessThan(1_500_000);
  });

  it('serves real traffic inside the edge sandbox (eval disabled): guard, sketch compile, C++ trace, STL prepare, bad input', async () => {
    const vm = new EdgeVM({ extend: (context) => Object.assign(context, { process: { env: {} } }) });
    vm.evaluate(bundle);
    const call = async (payload: unknown, headers: Record<string, string> = { origin: 'https://maeacademy.org', 'x-forwarded-for': '198.51.100.51' }) => {
      (vm.context as Record<string, unknown>).__payload = JSON.stringify(payload);
      (vm.context as Record<string, unknown>).__headers = headers;
      const out = (await vm.evaluate(`edgeApi.POST(new Request('https://maeacademy.org/api/code/process', { method: 'POST', headers: __headers, body: __payload })).then(async (r) => ({ status: r.status, text: await r.text(), limit: r.headers.get('x-ratelimit-limit') }))`)) as { status: number; text: string; limit: string | null };
      return { status: out.status, json: JSON.parse(out.text) as Record<string, any>, limit: out.limit };
    };
    const sketch = await call({ domain: 'arduino', request: { op: 'compile-sketch', source: 'void setup(){ pinMode(13, OUTPUT); } void loop(){ digitalWrite(13, HIGH); delay(100); }' } });
    expect(sketch.status).toBe(200);
    expect(sketch.json.ok).toBe(true);
    expect(sketch.json.js).toContain('function');
    expect(sketch.limit).toBe('600'); // the code tier, from the real guard

    const trace = await call({ domain: 'cpp-trace', request: { op: 'trace-execution', language: 'cpp', code: 'int main(){\n  puts("hi");\n  return 0;\n}\n', outcome: { stdout: 'hi\n', stderr: '', exitCode: 0 } } });
    expect(trace.json.steps.length).toBeGreaterThan(0);
    const stl = await call({ domain: 'preprocess', request: { op: 'prepare-stl', code: '#include <vector>\nint main(){ std::vector<int> v; }' } });
    expect(stl.json.headers).toEqual(['vector']);

    expect((await call({ domain: 'arduino', request: { op: 'compile-sketch', source: 'void setup(){}' } }, { 'x-forwarded-for': '198.51.100.52' })).status).toBe(403); // no origin
    expect((await call({ domain: 'arduino', request: { op: 'compile-sketch', source: '' } })).status).toBe(400);
  });
});
