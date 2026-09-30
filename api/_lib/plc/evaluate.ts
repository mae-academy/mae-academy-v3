import type { HardwareProfile } from './domain/hardware';
import { MemoryMap, type MemorySnapshot } from './domain/memory';
import type { CompiledProgram } from './engine/compiler';
import { ScanExecutor } from './engine/executor';
import { FlowTrace } from './engine/flow-trace';
import type { RuntimeStateSnapshot } from './engine/runtime-state';
import type { Diagnostic, StatusFlags } from './engine/types';
import { encodeTrace, type WireTrace } from './trace';
import { toBase64 } from '../../../shared/plcWire';

export interface ScanResult {
  readonly cycle: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly statusFlags: Readonly<StatusFlags>;
}

export interface BatchInput {
  readonly compiled: CompiledProgram;
  readonly profile: HardwareProfile;
  readonly memory: MemorySnapshot;
  readonly runtime: RuntimeStateSnapshot;
  readonly cycle: number;
  /** Input image sampled for every scan of the batch. */
  readonly inputs: Uint8Array;
  readonly scans: number;
  readonly deltaMs: number;
  readonly trace: boolean;
}

export interface BatchResult {
  readonly memory: MemorySnapshot;
  readonly runtime: RuntimeStateSnapshot;
  readonly cycle: number;
  readonly scans: readonly ScanResult[];
  /** Area Q after the last scan. */
  readonly outputs: Uint8Array | undefined;
  readonly trace: WireTrace | undefined;
}

/**
 * Runs a batch of consecutive scans and returns the state to resume from. Pure: the same input
 * always yields the same result (time is supplied by the caller through `deltaMs`).
 */
export function runBatch(input: BatchInput): BatchResult {
  const memory = new MemoryMap(input.profile);
  memory.restore(input.memory);
  const inputs = input.inputs;
  const executor = new ScanExecutor(memory, input.compiled, {
    clock: () => 0, // wall time is meaningless server-side; metrics are not returned
    watchdogMs: Number.POSITIVE_INFINITY,
    metricsWindow: 1,
    fieldIo: {
      sampleInputs(image) {
        image.set(inputs.subarray(0, image.length));
      },
    },
  });
  executor.state.importState(input.runtime);
  executor.restoreCycle(input.cycle);

  const trace = input.trace ? new FlowTrace() : null;
  const scans: ScanResult[] = [];
  const last = input.scans - 1;
  for (let i = 0; i <= last; i++) {
    // Only the final scan is traced: it is the one the canvas shows, and tracing costs a write per node.
    if (trace && i === last) executor.setTrace(trace);
    const report = executor.scan(i, input.deltaMs);
    scans.push({ cycle: report.metrics.cycle, diagnostics: report.diagnostics, statusFlags: report.statusFlags });
  }

  const snapshot = memory.snapshot();
  return {
    memory: snapshot,
    runtime: executor.state.exportState(),
    cycle: executor.scanCount,
    scans,
    outputs: snapshot.bytes.Q,
    trace: trace ? encodeTrace(input.compiled.networks.map((n) => n.root), trace, toBase64) : undefined,
  };
}
