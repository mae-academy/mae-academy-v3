import { build } from 'esbuild';
import { EdgeVM } from '@edge-runtime/vm';
import { describe, expect, it } from 'vitest';
import { describeCircuit } from '../../../shared/circuit/nets';
import type { CircuitComponent, CircuitWire } from '../../../shared/circuit/circuitTypes';

/**
 * api/circuit/solve is declared `runtime: 'edge'`. This bundles it the way an edge platform does (no Node built-ins available)
 * and runs the bundle inside Vercel's edge-runtime sandbox, which exposes only web-standard globals. If anything reachable
 * from the route needs Node — or reaches into the browser code — this fails.
 */
describe('api/circuit/solve on the Edge runtime', () => {
  let bundle = '';

  it('bundles for a non-Node target: no Node built-ins and no client code in the dependency graph', async () => {
    const result = await build({
      entryPoints: ['api/circuit/solve.ts'],
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
    expect(inputs.some((file) => /api\/_lib\/circuit\/engine\/mnaSolver/.test(file))).toBe(true); // the solver is what this function is for
    expect(bundle.length).toBeLessThan(1_500_000);
    console.log(`edge bundle: ${(bundle.length / 1024).toFixed(0)} KB`);
  });

  it('serves real traffic inside the edge sandbox: guard, validation, registration, hash reuse, 409, stateful transient', async () => {
    const vm = new EdgeVM({ extend: (context) => Object.assign(context, { process: { env: {} } }) });
    vm.evaluate(bundle);

    const part = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
    const link = (id: string, a: string, at: string, b: string, bt: string): CircuitWire => ({ id, fromComp: a, fromTerm: at, toComp: b, toTerm: bt, path: [], routing: 'orthogonal' });
    const circuit = describeCircuit(
      [part('V1', 'dc-voltage', { voltage: 5 }), part('R1', 'resistor', { resistance: 1000 }), part('C1', 'capacitor', { capacitance: 1e-6 }), part('G', 'ground')],
      [link('w1', 'V1', 'pos', 'R1', 'a'), link('w2', 'R1', 'b', 'C1', 'a'), link('w3', 'C1', 'b', 'G', 'gnd'), link('w4', 'V1', 'neg', 'G', 'gnd')],
    );

    const call = async (payload: unknown, headers: Record<string, string> = { origin: 'https://maeacademy.org', 'x-forwarded-for': '198.51.100.7' }) => {
      (vm.context as Record<string, unknown>).__payload = JSON.stringify(payload);
      (vm.context as Record<string, unknown>).__headers = headers;
      const out = (await vm.evaluate(`edgeApi.POST(new Request('https://maeacademy.org/api/circuit/solve', { method: 'POST', headers: __headers, body: __payload })).then(async (r) => ({ status: r.status, text: await r.text(), limit: r.headers.get('x-ratelimit-limit') }))`)) as { status: number; text: string; limit: string | null };
      return { status: out.status, json: JSON.parse(out.text) as Record<string, any>, limit: out.limit };
    };

    const first = await call({ v: 1, analysisType: 'transient', timeStep: 0.002, steps: 5, circuit });
    expect(first.status).toBe(200);
    expect(first.json.converged).toBe(true);
    expect(first.json.h).toMatch(/^[0-9a-f]{32}$/); // crypto.subtle worked in the sandbox
    expect(first.limit).toBe('900'); // the circuit tier, from the real guard

    const second = await call({ v: 1, analysisType: 'transient', timeStep: 0.002, steps: 5, h: first.json.h, state: first.json.state });
    expect(second.status).toBe(200);
    expect(second.json.time).toBeGreaterThan(first.json.time);

    expect((await call({ v: 1, analysisType: 'dc', h: 'a'.repeat(32) })).status).toBe(409);
    expect((await call({ v: 1, analysisType: 'dc', circuit }, { 'x-forwarded-for': '198.51.100.8' })).status).toBe(403); // no origin
    expect((await call({ v: 2, analysisType: 'dc', circuit })).status).toBe(400);
  });
});
