import type { NetworkId, NodeId } from '../domain/ast';
import type { PlcAddress } from '../domain/types';

// ---- execution modes -------------------------------------------------------------------------

/**
 * `SINGLE_STEP` is transient: the runtime executes exactly one scan and settles into `PAUSE`.
 * `PAUSE` freezes the scan loop but retains the full memory image; `STOP` is a controller stop
 * (outputs de-energised when `clearOutputsOnStop` is set, retentive areas untouched).
 */
export type ExecutionMode = 'RUN' | 'STOP' | 'PAUSE' | 'SINGLE_STEP';

// ---- diagnostics -----------------------------------------------------------------------------

export type DiagnosticSeverity = 'warning' | 'error';

export type DiagnosticCode =
  | 'DIVIDE_BY_ZERO'
  | 'ARITHMETIC_OVERFLOW'
  | 'INVALID_OPERAND'
  | 'ADDRESS_OUT_OF_RANGE'
  | 'TYPE_WIDTH_MISMATCH'
  | 'UNSUPPORTED_NODE'
  | 'PROGRAM_NOT_RUNNABLE'
  | 'EMPTY_BRANCH_LANE'
  | 'UNKNOWN_BRANCH'
  | 'BRANCH_CYCLE'
  | 'DUPLICATE_INSTANCE'
  | 'MCR_DEPTH_EXCEEDED'
  | 'MCR_UNBALANCED'
  | 'SCAN_WATCHDOG'
  | 'ENGINE_UNREACHABLE'
  | 'ENGINE_THROTTLED';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly networkId?: NetworkId;
  readonly nodeId?: NodeId;
  readonly address?: PlcAddress;
}

// ---- status flags ----------------------------------------------------------------------------

/**
 * Arithmetic status bits. The S7-200 publishes these as SM1.0-SM1.3, but SM is not part of the
 * addressable areas in `HardwareProfile`, so they are surfaced on the runtime instead and may be
 * mirrored into user memory via `RuntimeOptions.statusFlagMirror`.
 */
export interface StatusFlags {
  /** Result of the last arithmetic box was zero. */
  zero: boolean;
  /** Result did not fit the destination type, or a non-finite REAL was produced. */
  overflow: boolean;
  /** Result of the last arithmetic box was negative. */
  negative: boolean;
  /** Last DIV attempted a division by zero; the destination is left untouched. */
  divideByZero: boolean;
}

export const createStatusFlags = (): StatusFlags => ({
  zero: false,
  overflow: false,
  negative: false,
  divideByZero: false,
});

/** Optional M-bit mirrors for {@link StatusFlags}, written at the end of Phase B. */
export interface StatusFlagMirror {
  readonly zero?: PlcAddress;
  readonly overflow?: PlcAddress;
  readonly negative?: PlcAddress;
  readonly divideByZero?: PlcAddress;
}

// ---- field I/O -------------------------------------------------------------------------------

/**
 * Bridge between the simulated field (switches, sensors, lamps) and the process image tables.
 * Both hooks receive raw byte buffers, mirroring how a real CPU latches its I/O in one block.
 * The buffers are owned by the runtime and reused across scans — copy if you need to retain them.
 */
export interface FieldIoAdapter {
  /** Phase A. Fill `inputImage` with the current field state; the runtime diffs it into area I. */
  sampleInputs?(inputImage: Uint8Array): void;
  /** Phase D. Receives the output image (area Q) produced by this scan. */
  commitOutputs?(outputImage: Uint8Array): void;
}

// ---- metrics & events ------------------------------------------------------------------------

export interface ScanMetrics {
  /** 1-based scan counter since the last cold start. */
  readonly cycle: number;
  /** Clock reading at the start of Phase A. */
  readonly startedAt: number;
  /** Wall time consumed by phases A-D. */
  readonly scanTimeMs: number;
  /** Time the logic was told had elapsed since the previous scan (drives timers). */
  readonly deltaMs: number;
  readonly minScanMs: number;
  readonly maxScanMs: number;
  /** Arithmetic mean over the last {@link RuntimeOptions.metricsWindow} scans. */
  readonly avgScanMs: number;
  /** Measured period between consecutive scan starts. */
  readonly cycleTimeMs: number;
}

export interface ScanReport {
  readonly metrics: ScanMetrics;
  readonly diagnostics: readonly Diagnostic[];
  readonly statusFlags: Readonly<StatusFlags>;
  /** Memory `version` after the scan's transaction committed. */
  readonly memoryVersion: number;
}

export type PlcEvent =
  | { readonly type: 'scan'; readonly report: ScanReport }
  | { readonly type: 'mode'; readonly mode: ExecutionMode; readonly previous: ExecutionMode }
  | { readonly type: 'diagnostic'; readonly diagnostic: Diagnostic }
  | { readonly type: 'program'; readonly diagnostics: readonly Diagnostic[] }
  | { readonly type: 'reset' };

export type PlcEventListener = (event: PlcEvent) => void;

// ---- clock / scheduling ----------------------------------------------------------------------

/** Monotonic millisecond clock. */
export type MonotonicClock = () => number;

export interface Scheduler {
  schedule(callback: () => void, delayMs: number): number;
  cancel(handle: number): void;
}

/** `performance.now()` where available, falling back to `Date.now()` (worker & node safe). */
export const defaultClock: MonotonicClock =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

export const defaultScheduler: Scheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
  cancel: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
};
