import type { LadderProgram } from '../domain/ast';
import type { MemoryMap } from '../domain/memory';
import type { CompiledProgram } from '../engine/compiler';
import type { FlowTrace } from '../engine/flow-trace';
import type { ExecutionMode, PlcEventListener, ScanMetrics } from '../engine/types';

/**
 * The surface the host, session and canvas use from a controller. `PlcRuntime` (in-browser engine)
 * and `RemoteRuntime` (serverless engine) both satisfy it, so the UI is engine-agnostic.
 */
export interface PlcRuntimePort {
  readonly memory: MemoryMap;
  readonly mode: ExecutionMode;
  readonly compiled: CompiledProgram;
  readonly metrics: ScanMetrics | null;
  readonly scanPeriodMs: number;
  setTargetScanMs(ms: number): void;
  enableFlowTrace(): FlowTrace;
  subscribe(listener: PlcEventListener): () => void;
  loadProgram(program: LadderProgram): CompiledProgram;
  run(): boolean;
  pause(): void;
  stop(): void;
  /** Runs exactly one scan; the remote engine resolves asynchronously. */
  step(): unknown;
  reset(): void;
  dispose(): void;
}
