import { describe, expect, it } from 'vitest';
import { S7_200_CPU224 } from './domain/hardware';
import type { LadderProgram } from './domain/ast';
import { MemoryMap as ReferenceMemory } from './domain/memory';
import { compileProgram as referenceCompile } from './engine/compiler';
import { ScanExecutor as ReferenceExecutor } from './engine/executor';
import { PLC_EXAMPLES } from '../../../client/src/features/plc-simulator/ui/host/plcExamples';
import { createDemoNetworks } from '../../../client/src/features/plc-simulator/ui/host/demo-program';
import { ilToLad } from '../../../client/src/features/plc-simulator/transpiler';
import { EvaluateRequestSchema, type EvaluateRequest, type WireState } from '../../plc/schema';
import { handleEvaluate } from './handler';
import { encodeMemory, evaluateBatch, type EvaluateResponse } from './evaluate';
import { fromBase64, toBase64 } from './codec';

/** Deterministic PRNG so a parity failure is reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const DELTAS = [20, 20, 20, 100, 250, 10, 1];
const SCANS = 320;
const BATCH = 8;
const INPUT_BYTES = Math.ceil(14 / 8);

function makeScript(seed: number) {
  const rand = lcg(seed);
  const inputs = new Uint8Array(INPUT_BYTES);
  return Array.from({ length: SCANS }, () => {
    if (rand() < 0.25) inputs[Math.floor(rand() * INPUT_BYTES)] ^= 1 << Math.floor(rand() * 8);
    return { deltaMs: DELTAS[Math.floor(rand() * DELTAS.length)]!, inputs: inputs.slice() };
  });
}

const programs: { id: string; program: LadderProgram }[] = [
  { id: 'demo', program: { schemaVersion: 1, profileId: S7_200_CPU224.id, networks: createDemoNetworks() } },
];
for (const example of PLC_EXAMPLES) {
  const result = ilToLad(example.stl, S7_200_CPU224);
  if (result.ok && result.value) {
    programs.push({ id: example.id, program: { schemaVersion: 1, profileId: S7_200_CPU224.id, networks: result.value } });
  }
}

describe('batched, stateless evaluate() equals a plain one-scan-at-a-time executor', () => {
  it('found programs to compare', () => expect(programs.length).toBeGreaterThan(5));

  for (const { id, program } of programs) {
    it(`${id}: ${SCANS} scans in batches of ${BATCH} are bit-identical`, () => {
      const script = makeScript(id.length * 7919 + 1);

      // reference: one scan at a time on a persistent executor, the way PlcRuntime drives it
      const memory = new ReferenceMemory(S7_200_CPU224);
      let current = new Uint8Array(INPUT_BYTES);
      const executor = new ReferenceExecutor(memory, referenceCompile(program, S7_200_CPU224), {
        clock: () => 0,
        watchdogMs: Number.POSITIVE_INFINITY,
        metricsWindow: 1,
        fieldIo: { sampleInputs: (image) => image.set(current.subarray(0, image.length)) },
      });
      executor.coldStart();

      let state: WireState | null = null;
      let cycle = 0;
      for (let from = 0; from < script.length; from += BATCH) {
        const batch = script.slice(from, from + BATCH);
        const referenceScans = batch.map((scan) => {
          current = scan.inputs;
          const report = executor.scan(0, scan.deltaMs);
          return { cycle: report.metrics.cycle, diagnostics: report.diagnostics, statusFlags: report.statusFlags };
        });

        // remote: the request goes through JSON and the Zod schema exactly as it would over HTTP
        const wire = JSON.parse(
          JSON.stringify({ program, state, scans: batch.map((s) => ({ deltaMs: s.deltaMs, inputs: toBase64(s.inputs) })) }),
        );
        const request: EvaluateRequest = EvaluateRequestSchema.parse(wire);
        const response: EvaluateResponse = JSON.parse(JSON.stringify(evaluateBatch(request)));

        expect(response.ok).toBe(true);
        expect(response.scans).toEqual(JSON.parse(JSON.stringify(referenceScans)));
        expect(response.state!.memory).toEqual(encodeMemory(memory.snapshot()));
        expect(fromBase64(response.outputs!)).toEqual(memory.snapshot().bytes.Q);
        cycle = response.state!.cycle;
        state = response.state!;
      }
      expect(cycle).toBe(SCANS);
    });
  }
});

describe('POST /api/plc/evaluate request validation', () => {
  const post = (body: unknown, raw = false) =>
    handleEvaluate(new Request('http://x/api/plc/evaluate', { method: 'POST', body: raw ? (body as string) : JSON.stringify(body) }));
  const good = { program: programs[0]!.program, scans: [{ deltaMs: 20, inputs: 'AA==' }] };

  it('accepts a valid cold-start request', async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
  it('rejects bad JSON, schema violations, oversized batches, bad addresses and wrong method', async () => {
    expect((await post('{nope', true)).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ ...good, scans: [] })).status).toBe(400);
    expect((await post({ ...good, scans: Array(65).fill(good.scans[0]) })).status).toBe(400);
    expect((await post({ ...good, scans: [{ deltaMs: -1, inputs: 'AA==' }] })).status).toBe(400);
    expect((await post({ ...good, scans: [{ deltaMs: 20, inputs: '<script>' }] })).status).toBe(400);
    expect((await post({ ...good, program: { ...good.program, profileId: 'NOPE' } })).status).toBe(400);
    const res = await handleEvaluate(new Request('http://x/api/plc/evaluate', { method: 'GET' }));
    expect(res.status).toBe(405);
  });
  it('rejects a state snapshot that does not fit the profile (400, not 500)', async () => {
    const bad = { ...good, state: { memory: { profileId: 'S7_200_CPU224', bytes: { I: 'AA==' }, indexed: {} }, runtime: { edges: [], timers: [], counters: [] }, cycle: 0 } };
    expect((await post(bad)).status).toBe(400);
  });
  it('reports compile errors without running', async () => {
    const broken = structuredClone(good) as typeof good & { program: LadderProgram };
    (broken.program.networks[0]!.nodes[0] as { operand?: string }).operand = 'Z9.9';
    const res = await post(broken);
    if (res.status === 200) expect((await res.json()).ok).toBe(false);
    else expect(res.status).toBe(400);
  });
});
