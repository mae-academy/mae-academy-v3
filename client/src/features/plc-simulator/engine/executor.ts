import { byteAreaSize, type ByteAreaSpec } from '../domain/hardware';
import type { MemoryMap } from '../domain/memory';
import type { ByteAreaPrefix, PlcAddress } from '../domain/types';
import type { CompiledProgram } from './compiler';
import { ExecContext } from './context';
import { evaluateNetwork } from './evaluator';
import type { FlowTrace } from './flow-trace';
import { advanceAsyncTimers } from './instructions';
import { RuntimeState } from './runtime-state';
import {
  createStatusFlags,
  type FieldIoAdapter,
  type MonotonicClock,
  type ScanMetrics,
  type ScanReport,
  type StatusFlagMirror,
  type StatusFlags,
} from './types';

export interface ExecutorOptions {
  readonly fieldIo?: FieldIoAdapter;
  readonly statusFlagMirror?: StatusFlagMirror;
  /** Monotonic clock used to measure how long each scan takes. */
  readonly clock: MonotonicClock;
  /** A scan slower than this raises a `SCAN_WATCHDOG` diagnostic. */
  readonly watchdogMs: number;
  /** Number of recent scans averaged into {@link ScanMetrics.avgScanMs}. */
  readonly metricsWindow: number;
}

/**
 * One deterministic scan cycle.
 *
 *   Phase A  latch the field into the process image input table (area I)
 *   Phase B  evaluate every network in order, top to bottom
 *   Phase C  service the timers that the CPU maintains asynchronously (1 ms / 10 ms resolutions)
 *   Phase D  publish the process image output table (area Q) to the field
 *
 * The four phases run inside a single `MemoryMap.transaction()`, so the UI observes one coherent
 * memory version per scan instead of a burst of intermediate states.
 *
 * Deviation worth knowing: 100 ms timers, counters and every box instruction are executed inline
 * in Phase B rather than in Phase C. That is what the hardware does — their values update when the
 * instruction executes — and it is what lets a later rung react to a timer bit within the same
 * scan. Phase C is reserved for the resolutions the real CPU updates outside rung execution.
 */
export class ScanExecutor {
  readonly state = new RuntimeState();
  readonly flags: StatusFlags = createStatusFlags();

  private readonly ctx: ExecContext;
  private readonly inputImage: Uint8Array;
  private readonly outputImage: Uint8Array;
  private readonly inputAddresses: readonly PlcAddress[];
  private readonly outputAddresses: readonly PlcAddress[];
  /** Mask clearing the bits of the final byte that the profile does not physically expose. */
  private readonly inputTailMask: number;

  private cycle = 0;
  private minScanMs = Number.POSITIVE_INFINITY;
  private maxScanMs = 0;
  private readonly recent: number[] = [];
  private recentSum = 0;
  private previousStart: number | null = null;

  constructor(
    readonly memory: MemoryMap,
    private program: CompiledProgram,
    private readonly options: ExecutorOptions,
  ) {
    this.ctx = new ExecContext(memory, this.state, this.flags);

    const inputSpec = memory.profile.memory.I;
    const outputSpec = memory.profile.memory.Q;
    this.inputImage = new Uint8Array(inputSpec ? byteAreaSize(inputSpec) : 0);
    this.outputImage = new Uint8Array(outputSpec ? byteAreaSize(outputSpec) : 0);
    this.inputAddresses = buildByteAddresses('I', this.inputImage.length);
    this.outputAddresses = buildByteAddresses('Q', this.outputImage.length);
    this.inputTailMask = tailMask(inputSpec);
  }

  get scanCount(): number {
    return this.cycle;
  }

  /** Enables (or, with `null`, disables) power-flow recording for the UI. */
  setTrace(trace: FlowTrace | null): void {
    this.ctx.trace = trace;
  }

  /** Swaps the executing program without disturbing memory or edge state. */
  setProgram(program: CompiledProgram): void {
    this.program = program;
  }

  /** Cold start: clears edges, timer accumulators, statistics and the scan counter. */
  coldStart(): void {
    this.state.clear();
    this.cycle = 0;
    this.minScanMs = Number.POSITIVE_INFINITY;
    this.maxScanMs = 0;
    this.recent.length = 0;
    this.recentSum = 0;
    this.previousStart = null;
    resetFlags(this.flags);
  }

  /** De-energises the output image; used on the RUN -> STOP transition. */
  clearOutputs(): void {
    this.memory.transaction(() => {
      for (const address of this.outputAddresses) this.memory.write(address, 0);
    });
    this.outputImage.fill(0);
    this.options.fieldIo?.commitOutputs?.(this.outputImage);
  }

  /**
   * Executes one full scan.
   * @param startedAt monotonic clock reading taken as the scan begins
   * @param deltaMs simulated time since the previous scan; drives every timer
   */
  scan(startedAt: number, deltaMs: number): ScanReport {
    this.cycle += 1;
    resetFlags(this.flags);

    this.ctx.scan = this.cycle;
    this.ctx.deltaMs = deltaMs;

    this.memory.transaction(() => {
      this.readInputs();
      this.executeLogic();
      advanceAsyncTimers(this.ctx); // Phase C
      this.publishStatusFlags();
      this.writeOutputs();
    });

    const scanTimeMs = Math.max(0, this.options.clock() - startedAt);
    const cycleTimeMs = this.previousStart === null ? deltaMs : startedAt - this.previousStart;
    this.previousStart = startedAt;

    if (scanTimeMs > this.options.watchdogMs) {
      this.ctx.report(
        'SCAN_WATCHDOG',
        'error',
        `Scan ${this.cycle} took ${scanTimeMs.toFixed(1)} ms, over the ${this.options.watchdogMs} ms watchdog`,
      );
    }

    return {
      metrics: this.trackMetrics(startedAt, scanTimeMs, deltaMs, cycleTimeMs),
      diagnostics: this.ctx.takeDiagnostics(),
      statusFlags: { ...this.flags },
      memoryVersion: this.memory.version,
    };
  }

  // ---- Phase A ------------------------------------------------------------------------------

  private readInputs(): void {
    const sample = this.options.fieldIo?.sampleInputs;
    if (!sample || this.inputImage.length === 0) return;

    sample.call(this.options.fieldIo, this.inputImage);
    // Points the profile does not expose must never appear energised.
    const last = this.inputImage.length - 1;
    const tail = this.inputImage[last];
    if (tail !== undefined) this.inputImage[last] = tail & this.inputTailMask;

    for (let i = 0; i < this.inputImage.length; i++) {
      const address = this.inputAddresses[i];
      const value = this.inputImage[i];
      // MemoryMap suppresses no-op writes, so unchanged bytes cost nothing downstream.
      if (address !== undefined && value !== undefined) this.memory.write(address, value, 'io');
    }
  }

  // ---- Phase B ------------------------------------------------------------------------------

  private executeLogic(): void {
    for (const network of this.program.networks) evaluateNetwork(network, this.ctx);
    this.ctx.endScan(); // reports master-control zones left open by the program
  }

  private publishStatusFlags(): void {
    const mirror = this.options.statusFlagMirror;
    if (!mirror) return;
    if (mirror.zero) this.memory.writeBit(mirror.zero, this.flags.zero);
    if (mirror.overflow) this.memory.writeBit(mirror.overflow, this.flags.overflow);
    if (mirror.negative) this.memory.writeBit(mirror.negative, this.flags.negative);
    if (mirror.divideByZero) this.memory.writeBit(mirror.divideByZero, this.flags.divideByZero);
  }

  // ---- Phase D ------------------------------------------------------------------------------

  private writeOutputs(): void {
    if (this.outputImage.length === 0) return;
    for (let i = 0; i < this.outputImage.length; i++) {
      const address = this.outputAddresses[i];
      if (address !== undefined) this.outputImage[i] = this.memory.read(address);
    }
    this.options.fieldIo?.commitOutputs?.(this.outputImage);
  }

  // ---- metrics ------------------------------------------------------------------------------

  private trackMetrics(startedAt: number, scanTimeMs: number, deltaMs: number, cycleTimeMs: number): ScanMetrics {
    this.minScanMs = Math.min(this.minScanMs, scanTimeMs);
    this.maxScanMs = Math.max(this.maxScanMs, scanTimeMs);

    this.recent.push(scanTimeMs);
    this.recentSum += scanTimeMs;
    if (this.recent.length > this.options.metricsWindow) {
      this.recentSum -= this.recent.shift() ?? 0;
    }

    return {
      cycle: this.cycle,
      startedAt,
      scanTimeMs,
      deltaMs,
      cycleTimeMs,
      minScanMs: Number.isFinite(this.minScanMs) ? this.minScanMs : 0,
      maxScanMs: this.maxScanMs,
      avgScanMs: this.recent.length === 0 ? 0 : this.recentSum / this.recent.length,
    };
  }
}

// ---- helpers ------------------------------------------------------------------------------------

function resetFlags(flags: StatusFlags): void {
  flags.zero = false;
  flags.overflow = false;
  flags.negative = false;
  flags.divideByZero = false;
}

const buildByteAddresses = (area: ByteAreaPrefix, count: number): readonly PlcAddress[] => {
  const out: PlcAddress[] = [];
  for (let i = 0; i < count; i++) out.push(`${area}B${i}`);
  return out;
};

/** Bits of the final byte that the profile actually exposes; 0xff when the area is byte-aligned. */
function tailMask(spec: ByteAreaSpec | undefined): number {
  if (!spec) return 0xff;
  const remainder = spec.bitCount % 8;
  return remainder === 0 ? 0xff : (1 << remainder) - 1;
}
