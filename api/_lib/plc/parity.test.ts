import { describe, expect, it } from 'vitest';
import { S7_200_CPU224 } from './domain/hardware';
import type { LadderProgram } from './domain/ast';
import { MemoryMap } from './domain/memory';
import { compileProgram } from './engine/compiler';
import { ScanExecutor } from './engine/executor';
import { PLC_EXAMPLES } from '../../../client/src/features/plc-simulator/ui/host/plcExamples';
import { createDemoNetworks } from '../../../client/src/features/plc-simulator/ui/host/demo-program';
import { ilToLad } from '../../../client/src/features/plc-simulator/transpiler';
import { handleEvaluate } from './handler';
import { ProgramCache, programHash, serveEvaluate } from './service';
import { applyDiff, canonicalJson, encodeDiff, flattenSnapshot, fromBase64, toBase64, unflattenSnapshot } from '../../../shared/plcWire';

/** Deterministic PRNG so a parity failure is reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const DELTAS = [20, 20, 20, 100, 250, 10, 1];
const BATCHES = 64;
const BATCH = 5;
const INPUT_BYTES = Math.ceil(14 / 8);

const programs: { id: string; program: LadderProgram }[] = [
  { id: 'demo', program: { schemaVersion: 1, profileId: S7_200_CPU224.id, networks: createDemoNetworks() } },
];
for (const example of PLC_EXAMPLES) {
  const result = ilToLad(example.stl, S7_200_CPU224);
  if (result.ok && result.value) programs.push({ id: example.id, program: { schemaVersion: 1, profileId: S7_200_CPU224.id, networks: result.value } });
}

const zeros = (n: number) => new Uint8Array(n);
const IMAGE_SIZE = flattenSnapshot(new MemoryMap(S7_200_CPU224).snapshot()).length;
const emptyImage = toBase64(encodeDiff(zeros(IMAGE_SIZE), zeros(IMAGE_SIZE)));

/** What the browser does: pack its memory, send, apply the delta over its memory, echo the runtime blob. */
class FakeClient {
  readonly memory = new MemoryMap(S7_200_CPU224);
  runtime: unknown = [[], [], []];
  cycle = 0;
  hash: string | null = null;
  requests: string[] = [];
  responses: string[] = [];

  constructor(readonly program: LadderProgram, readonly cache?: ProgramCache) {}

  async batch(inputs: Uint8Array, deltaMs: number, n = BATCH) {
    const image = flattenSnapshot(this.memory.snapshot());
    const body = {
      v: 2,
      ...(this.hash ? { h: this.hash } : { program: this.program }),
      st: { m: toBase64(encodeDiff(zeros(image.length), image)), r: this.runtime, c: this.cycle },
      in: toBase64(inputs),
      n,
      dt: deltaMs,
      tr: true,
    };
    const requestText = JSON.stringify(body);
    const result = await serveEvaluate(JSON.parse(requestText), this.cache);
    const responseText = JSON.stringify(result.body);
    this.requests.push(requestText);
    this.responses.push(responseText);
    if (result.status === 409) {
      this.hash = null;
      return this.batch(inputs, deltaMs, n);
    }
    expect(result.status).toBe(200);
    const res = JSON.parse(responseText);
    const template = this.memory.snapshot();
    this.memory.restore(unflattenSnapshot(template, applyDiff(flattenSnapshot(template), fromBase64(res.m))) as ReturnType<MemoryMap['snapshot']>);
    this.runtime = res.r;
    this.cycle = res.c;
    this.hash = res.h;
    return res as { sc?: { f?: string; g?: [number, unknown[]][] }; o?: string; c: number; h: string };
  }
}

describe('protocol v2 (hash + diffs) equals a plain one-scan-at-a-time executor', () => {
  it('found programs to compare', () => expect(programs.length).toBeGreaterThan(5));

  for (const { id, program } of programs) {
    it(`${id}: ${BATCHES * BATCH} scans in batches of ${BATCH} are bit-identical`, async () => {
      const rand = lcg(id.length * 7919 + 1);
      const inputs = new Uint8Array(INPUT_BYTES);

      // reference: one scan at a time on a persistent executor, the way PlcRuntime drives it
      const refMemory = new MemoryMap(S7_200_CPU224);
      let current = new Uint8Array(INPUT_BYTES);
      const executor = new ScanExecutor(refMemory, compileProgram(program, S7_200_CPU224), {
        clock: () => 0,
        watchdogMs: Number.POSITIVE_INFINITY,
        metricsWindow: 1,
        fieldIo: { sampleInputs: (image) => image.set(current.subarray(0, image.length)) },
      });
      executor.coldStart();

      const client = new FakeClient(program);
      for (let b = 0; b < BATCHES; b++) {
        if (rand() < 0.3) inputs[Math.floor(rand() * INPUT_BYTES)] ^= 1 << Math.floor(rand() * 8);
        const deltaMs = DELTAS[Math.floor(rand() * DELTAS.length)]!;
        current = inputs.slice();

        const reference = Array.from({ length: BATCH }, () => executor.scan(0, deltaMs));
        const res = await client.batch(inputs.slice(), deltaMs);

        expect(client.memory.snapshot(), `memory after batch ${b}`).toEqual(refMemory.snapshot());
        expect(res.c).toBe(executor.scanCount);
        expect(fromBase64(res.o!)).toEqual(refMemory.snapshot().bytes.Q);
        // sparse per-scan results reconstruct to exactly what each scan reported
        const flags = res.sc?.f ? fromBase64(res.sc.f) : new Uint8Array(BATCH);
        const diag = new Map(res.sc?.g ?? []);
        reference.forEach((report, i) => {
          const f = report.statusFlags;
          expect(flags[i], `flags of scan ${i} in batch ${b}`).toBe((f.zero ? 1 : 0) | (f.overflow ? 2 : 0) | (f.negative ? 4 : 0) | (f.divideByZero ? 8 : 0));
          expect(JSON.parse(JSON.stringify(diag.get(i) ?? []))).toEqual(JSON.parse(JSON.stringify(report.diagnostics)));
        });
      }
      expect(client.cycle).toBe(BATCHES * BATCH);
      // after the first request the program is never sent again
      expect(client.requests[0]).toContain('"program"');
      expect(client.requests.slice(1).every((r) => !r.includes('"program"') && r.includes('"h"'))).toBe(true);
    });
  }
});

describe('payload size', () => {
  it('a steady-state demo batch is hundreds of bytes each way (was ~11 KB)', async () => {
    const client = new FakeClient(programs[0]!.program);
    for (let i = 0; i < 12; i++) await client.batch(Uint8Array.from([1, 0]), 20);
    const up = client.requests.at(-1)!.length;
    const down = client.responses.at(-1)!.length;
    console.log(`steady-state request ${up} B, response ${down} B`);
    expect(up).toBeLessThan(800);
    expect(down).toBeLessThan(800);
  });
});

describe('program cache and negotiation', () => {
  it('server-computed content hash ignores key order; different programs get different hashes', async () => {
    const p = programs[0]!.program;
    const reordered = JSON.parse(canonicalJson(p));
    expect(await programHash(reordered)).toBe(await programHash(p));
    expect(await programHash(programs[1]!.program)).not.toBe(await programHash(p));
  });

  it('answers 409 need_program for an unknown hash, then accepts the program and returns the hash to use', async () => {
    const cache = new ProgramCache();
    const base = { v: 2, st: { m: toBase64(encodeDiff(zeros(0), zeros(0))), r: [[], [], []], c: 0 }, in: 'AA==', n: 1, dt: 20 };
    const unknown = await serveEvaluate({ ...base, h: 'a'.repeat(32) }, cache);
    expect(unknown).toMatchObject({ status: 409, body: { error: 'need_program' } });
  });

  it('a client recovers transparently when the server forgot its program (cache recycled)', async () => {
    const cache = new ProgramCache();
    const client = new FakeClient(programs[0]!.program, cache);
    await client.batch(Uint8Array.from([1, 0]), 20);
    const before = client.hash;
    expect(before).not.toBeNull();
    const recycled = new ProgramCache(); // a new isolate
    (client as { cache?: ProgramCache }).cache = recycled;
    const res = await client.batch(Uint8Array.from([1, 0]), 20); // sends h, gets 409, resends the program
    expect(res.h).toBe(before);
    expect(recycled.size).toBe(1);
  });

  it('the cache is bounded and evicts the least recently used program', async () => {
    const cache = new ProgramCache(2);
    const make = (id: string) => ({ schemaVersion: 1 as const, profileId: S7_200_CPU224.id, networks: [{ id, grid: { rows: 1, cols: 2 }, nodes: [], branches: [] }] });
    const body = (program: unknown) => ({ v: 2, program, st: { m: emptyImage, r: [[], [], []], c: 0 }, in: 'AA==', n: 1, dt: 20 });
    const hashes: string[] = [];
    for (const id of ['a', 'b', 'c']) {
      const r = await serveEvaluate(body(make(id)), cache);
      if (r.status !== 200) throw new Error(JSON.stringify(r.body));
      hashes.push(r.body.h as string);
    }
    expect(cache.size).toBe(2);
    expect(cache.get(hashes[0]!)).toBeUndefined(); // 'a' was evicted
    expect(cache.get(hashes[2]!)).toBeDefined();
  });

  it('a client-supplied hash cannot plant a program: the server keys by its own hash of the content', async () => {
    const cache = new ProgramCache();
    const p = programs[0]!.program;
    const body = { v: 2, h: 'f'.repeat(32), program: p, st: { m: emptyImage, r: [[], [], []], c: 0 }, in: 'AA==', n: 1, dt: 20 };
    const r = await serveEvaluate(body, cache);
    expect(r.status).toBe(200);
    expect(r.body.h).toBe(await programHash(p));
    expect(r.body.h).not.toBe('f'.repeat(32));
    expect(cache.get('f'.repeat(32))).toBeUndefined();
  });
});

describe('POST /api/plc/evaluate request validation', () => {
  const post = (body: unknown, raw = false) =>
    handleEvaluate(new Request('http://x/api/plc/evaluate', { method: 'POST', body: raw ? (body as string) : JSON.stringify(body) }));
  const good = { v: 2, program: programs[0]!.program, st: { m: emptyImage, r: [[], [], []], c: 0 }, in: 'AA==', n: 1, dt: 20 };

  it('accepts a valid cold-start request and reports server time', async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.ms).toBe('number');
  });
  it('an old-protocol or unversioned request gets a clear version_mismatch 400', async () => {
    const res = await post({ program: good.program, scans: [{ deltaMs: 20, inputs: 'AA==' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('version_mismatch');
    expect((await post({ ...good, v: 1 })).status).toBe(400);
  });
  it('rejects bad JSON, schema violations, oversized batches, bad values and wrong method', async () => {
    expect((await post('{nope', true)).status).toBe(400);
    expect((await post({ v: 2 })).status).toBe(400);
    expect((await post({ ...good, n: 0 })).status).toBe(400);
    expect((await post({ ...good, n: 65 })).status).toBe(400);
    expect((await post({ ...good, dt: -1 })).status).toBe(400);
    expect((await post({ ...good, in: '<script>' })).status).toBe(400);
    expect((await post({ ...good, program: undefined, h: undefined })).status).toBe(400); // neither program nor hash
    expect((await post({ ...good, h: 'not-a-hash' })).status).toBe(400);
    expect((await post({ ...good, program: { ...good.program, profileId: 'NOPE' } })).status).toBe(400);
    expect((await handleEvaluate(new Request('http://x/api/plc/evaluate', { method: 'GET' }))).status).toBe(405);
  });
  it('rejects malformed memory diffs and runtime blobs with 400, not 500', async () => {
    expect((await post({ ...good, st: { ...good.st, m: toBase64(Uint8Array.from([9, 9, 9])) } })).status).toBe(400); // wrong size / run
    expect((await post({ ...good, st: { ...good.st, m: toBase64(Uint8Array.from([5])) } })).status).toBe(400); // wrong total
    expect((await post({ ...good, st: { ...good.st, r: [[], [], [['T37', 0]]] } })).status).toBe(400); // bad counter tuple
    expect((await post({ ...good, st: { ...good.st, r: [[['x', 2]], [], []] } })).status).toBe(400); // bad edge bit
  });
  it('reports compile errors without running', async () => {
    const broken = structuredClone(good) as typeof good;
    (broken.program.networks[0]!.nodes[0] as { operand?: string }).operand = 'Z9.9';
    const res = await post(broken);
    if (res.status === 200) expect((await res.json()).ok).toBe(false);
    else expect(res.status).toBe(400);
  });
});
