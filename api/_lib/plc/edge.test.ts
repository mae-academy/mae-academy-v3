import { build } from 'esbuild';
import { EdgeVM } from '@edge-runtime/vm';
import { describe, expect, it } from 'vitest';
import { S7_200_CPU224 } from './domain/hardware';
import { MemoryMap } from './domain/memory';
import { createDemoNetworks } from '../../../client/src/features/plc-simulator/ui/host/demo-program';
import { encodeDiff, flattenSnapshot, toBase64 } from '../../../shared/plcWire';

/**
 * The function is declared `runtime: 'edge'`. This bundles it the way an edge platform does (no
 * Node built-ins available) and then runs the bundle inside Vercel's edge-runtime sandbox, which
 * exposes only web-standard globals. If anything reachable from the route needs Node, this fails.
 */
describe('api/plc/evaluate on the Edge runtime', () => {
  let bundle = '';

  it('bundles for a non-Node target: no Node built-ins anywhere in the dependency graph', async () => {
    const result = await build({
      entryPoints: ['api/plc/evaluate.ts'],
      bundle: true,
      write: false,
      platform: 'browser', // a build that needs fs, crypto, Buffer... fails to resolve here
      format: 'iife',
      globalName: 'edgeApi',
      conditions: ['edge-light', 'worker', 'browser'],
      metafile: true,
      logLevel: 'silent',
    });
    bundle = result.outputFiles[0]!.text;
    const inputs = Object.keys(result.metafile!.inputs);
    expect(inputs.some((file) => file.startsWith('node:'))).toBe(false);
    expect(inputs.some((file) => /client\/src|node-adapter|express/.test(file))).toBe(false); // no UI code, no Node adapter
    expect(bundle.length).toBeLessThan(1_000_000); // well under the edge function size limit
    console.log(`edge bundle: ${(bundle.length / 1024).toFixed(0)} KB`);
  });

  it('serves real traffic inside the edge sandbox: guard, validation, program registration, hash reuse, 409', async () => {
    // Vercel's Edge runtime provides `process.env` (and nothing else from Node); mirror that.
    const vm = new EdgeVM({ extend: (context) => Object.assign(context, { process: { env: {} } }) });
    vm.evaluate(bundle);

    const program = { schemaVersion: 1, profileId: S7_200_CPU224.id, networks: createDemoNetworks() };
    const image = flattenSnapshot(new MemoryMap(S7_200_CPU224).snapshot());
    const m = toBase64(encodeDiff(new Uint8Array(image.length), image));
    const base = { v: 2, st: { m, r: [[], [], []], c: 0 }, in: 'AQ==', n: 5, dt: 20, tr: true };

    const call = async (payload: unknown, headers: Record<string, string> = { origin: 'https://maeacademy.org', 'x-forwarded-for': '198.51.100.7' }) => {
      (vm.context as Record<string, unknown>).__payload = JSON.stringify(payload);
      (vm.context as Record<string, unknown>).__headers = headers;
      const out = (await vm.evaluate(`edgeApi.POST(new Request('https://maeacademy.org/api/plc/evaluate', { method: 'POST', headers: __headers, body: __payload })).then(async (r) => ({ status: r.status, text: await r.text(), limit: r.headers.get('x-ratelimit-limit') }))`)) as { status: number; text: string; limit: string | null };
      return { status: out.status, json: JSON.parse(out.text) as Record<string, any>, limit: out.limit };
    };

    const first = await call({ ...base, program });
    expect(first.status).toBe(200);
    expect(first.json.ok).toBe(true);
    expect(first.json.h).toMatch(/^[0-9a-f]{32}$/); // crypto.subtle worked in the sandbox
    expect(first.limit).toBe('900'); // the plc tier, from the real guard

    const second = await call({ ...base, h: first.json.h, st: { ...base.st, r: first.json.r, c: first.json.c } });
    expect(second.status).toBe(200);
    expect(second.json.c).toBe(10);

    expect((await call({ ...base, h: 'a'.repeat(32) })).status).toBe(409);
    expect((await call({ ...base, program }, { 'x-forwarded-for': '198.51.100.8' })).status).toBe(403); // no origin
    expect((await call({ ...base, program, v: 1 })).status).toBe(400);
  });
});
