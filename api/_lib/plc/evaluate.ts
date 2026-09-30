import { getProfile } from './domain/hardware';
import type { LadderProgram } from './domain/ast';
import { MemoryMap, type MemorySnapshot } from './domain/memory';
import { compileProgram } from './engine/compiler';
import { ScanExecutor } from './engine/executor';
import type { Diagnostic, StatusFlags } from './engine/types';
import { fromBase64, toBase64 } from './codec';
import { FlowTrace } from './engine/flow-trace';
import { encodeTrace, type WireTrace } from './trace';
import type { EvaluateRequest, WireState } from '../../plc/schema';

export interface ScanResult {
  readonly cycle: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly statusFlags: Readonly<StatusFlags>;
}

export interface EvaluateResponse {
  readonly ok: boolean;
  /** Compile diagnostics; when `ok` is false nothing was executed and `state` is absent. */
  readonly compileDiagnostics: readonly Diagnostic[];
  readonly state?: WireState;
  readonly scans: readonly ScanResult[];
  /** Area Q after the last scan (base64). */
  readonly outputs?: string;
  /** Power flow of the last scan, present when requested. */
  readonly trace?: WireTrace;
  /** Wall time spent in `evaluateBatch`, added by the HTTP handler. */
  readonly serverMs?: number;
}

export class UnknownProfileError extends Error {}

const BYTE_AREAS = ['I', 'Q', 'M', 'V'] as const;
const INDEXED_AREAS = ['T', 'C'] as const;

export function encodeMemory(snapshot: MemorySnapshot): WireState['memory'] {
  const bytes: Record<string, string> = {};
  for (const area of BYTE_AREAS) {
    const b = snapshot.bytes[area];
    if (b) bytes[area] = toBase64(b);
  }
  const indexed: Record<string, { current: number[]; preset: number[]; status: string }> = {};
  for (const area of INDEXED_AREAS) {
    const s = snapshot.indexed[area];
    if (s) indexed[area] = { current: Array.from(s.current), preset: Array.from(s.preset), status: toBase64(s.status) };
  }
  return { profileId: snapshot.profileId, bytes, indexed };
}

function decodeMemory(wire: WireState['memory']): MemorySnapshot {
  const bytes: MemorySnapshot['bytes'] = {};
  for (const area of BYTE_AREAS) {
    const text = wire.bytes[area];
    if (text !== undefined) bytes[area] = fromBase64(text);
  }
  const indexed: MemorySnapshot['indexed'] = {};
  for (const area of INDEXED_AREAS) {
    const s = wire.indexed[area];
    if (s) indexed[area] = { current: Uint16Array.from(s.current), preset: Uint16Array.from(s.preset), status: fromBase64(s.status) };
  }
  return { profileId: wire.profileId, bytes, indexed };
}

/**
 * Runs a batch of consecutive scans and returns the state to resume from. Pure: the same request
 * always yields the same response (time is supplied by the caller through `deltaMs`).
 */
export function evaluateBatch(request: EvaluateRequest): EvaluateResponse {
  const program = request.program as unknown as LadderProgram;
  const profile = getProfile(program.profileId);
  if (!profile) throw new UnknownProfileError(`Unknown hardware profile "${program.profileId}"`);

  const compiled = compileProgram(program, profile);
  if (!compiled.ok) return { ok: false, compileDiagnostics: compiled.diagnostics, scans: [] };

  const memory = new MemoryMap(profile);
  let inputs: Uint8Array = new Uint8Array(0);
  const executor = new ScanExecutor(memory, compiled, {
    clock: () => 0, // wall time is meaningless server-side; metrics are not returned
    watchdogMs: Number.POSITIVE_INFINITY,
    metricsWindow: 1,
    fieldIo: {
      sampleInputs(image) {
        image.set(inputs.subarray(0, image.length));
      },
    },
  });

  const { state } = request;
  if (state) {
    memory.restore(decodeMemory(state.memory));
    executor.state.importState(state.runtime as never);
    executor.restoreCycle(state.cycle);
  } else {
    executor.coldStart();
  }

  const scans: ScanResult[] = [];
  let startedAt = 0;
  const trace = request.trace ? new FlowTrace() : null;
  const last = request.scans.length - 1;
  for (let i = 0; i <= last; i++) {
    const scan = request.scans[i]!;
    inputs = fromBase64(scan.inputs);
    // Only the final scan is traced: it is the one the canvas shows, and tracing costs a write per node.
    if (trace && i === last) executor.setTrace(trace);
    const report = executor.scan(startedAt++, scan.deltaMs);
    scans.push({ cycle: report.metrics.cycle, diagnostics: report.diagnostics, statusFlags: report.statusFlags });
  }

  const snapshot = memory.snapshot();
  return {
    ok: true,
    compileDiagnostics: compiled.diagnostics,
    state: {
      memory: encodeMemory(snapshot),
      runtime: executor.state.exportState() as WireState['runtime'],
      cycle: executor.scanCount,
    },
    scans,
    outputs: snapshot.bytes.Q ? toBase64(snapshot.bytes.Q) : undefined,
    trace: trace ? encodeTrace(compiled.networks.map((n) => n.root), trace, toBase64) : undefined,
  };
}
