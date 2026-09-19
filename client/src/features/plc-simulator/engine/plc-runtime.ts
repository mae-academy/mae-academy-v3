import type { LadderProgram } from '../domain/ast';
import type { MemoryMap } from '../domain/memory';
import { compileProgram, type CompiledProgram } from './compiler';
import { ScanExecutor } from './executor';
import { FlowTrace } from './flow-trace';
import {
  defaultClock,
  defaultScheduler,
  type ExecutionMode,
  type FieldIoAdapter,
  type MonotonicClock,
  type PlcEvent,
  type PlcEventListener,
  type ScanMetrics,
  type ScanReport,
  type Scheduler,
  type StatusFlagMirror,
} from './types';

export interface RuntimeOptions {
  /** Target period between scan starts in `timed` pacing. */
  readonly targetScanMs: number;
  /**
   * `timed` holds the configured scan period and compensates for scheduler drift;
   * `free` runs scans back to back and reports the achieved cycle time instead.
   */
  readonly pacing: 'timed' | 'free';
  /** Upper bound on scans executed in one catch-up burst after the scheduler oversleeps. */
  readonly maxCatchUpScans: number;
  /** Simulated time is clamped to this, so a throttled tab cannot jump every timer forward. */
  readonly maxDeltaMs: number;
  /** Simulated time granted to one `step()`; real elapsed time is meaningless when paused. */
  readonly stepDeltaMs: number;
  /** Time budget spent executing scans per turn in `free` pacing before yielding to the host. */
  readonly freeRunBudgetMs: number;
  /** De-energise the outputs on the transition into STOP. */
  readonly clearOutputsOnStop: boolean;
  readonly watchdogMs: number;
  readonly metricsWindow: number;
  /** Emit a `scan` event every N scans; raise it to keep a UI at 60 Hz from drowning. */
  readonly scanEventEvery: number;
  readonly clock: MonotonicClock;
  readonly scheduler: Scheduler;
  readonly fieldIo?: FieldIoAdapter;
  readonly statusFlagMirror?: StatusFlagMirror;
}

export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptions = {
  targetScanMs: 20,
  pacing: 'timed',
  maxCatchUpScans: 4,
  maxDeltaMs: 250,
  stepDeltaMs: 20,
  freeRunBudgetMs: 8,
  clearOutputsOnStop: true,
  watchdogMs: 500,
  metricsWindow: 32,
  scanEventEvery: 1,
  clock: defaultClock,
  scheduler: defaultScheduler,
};

/**
 * Controller facade: owns the mode machine and the scan scheduler, and is the single surface a
 * worker or a React hook talks to. It never touches the DOM, so it runs unchanged in a Web Worker.
 */
export class PlcRuntime {
  private options: RuntimeOptions;
  private readonly executor: ScanExecutor;
  private readonly listeners = new Set<PlcEventListener>();

  private program: CompiledProgram;
  private currentMode: ExecutionMode = 'STOP';
  private handle: number | null = null;
  private nextDue = 0;
  private lastScanAt: number | null = null;
  private lastMetrics: ScanMetrics | null = null;
  private trace: FlowTrace | null = null;

  constructor(readonly memory: MemoryMap, program: LadderProgram, options: Partial<RuntimeOptions> = {}) {
    this.options = { ...DEFAULT_RUNTIME_OPTIONS, ...options };
    this.program = compileProgram(program, memory.profile);
    this.executor = new ScanExecutor(memory, this.program, {
      fieldIo: this.options.fieldIo,
      statusFlagMirror: this.options.statusFlagMirror,
      clock: this.options.clock,
      watchdogMs: this.options.watchdogMs,
      metricsWindow: this.options.metricsWindow,
    });
  }

  // ---- introspection -------------------------------------------------------------------------

  get mode(): ExecutionMode {
    return this.currentMode;
  }

  get compiled(): CompiledProgram {
    return this.program;
  }

  get metrics(): ScanMetrics | null {
    return this.lastMetrics;
  }

  /** Configured scan period in milliseconds. */
  get scanPeriodMs(): number {
    return this.options.targetScanMs;
  }

  /**
   * Changes the scan period on the fly. A single step advances simulated time by one period, and
   * the catch-up clamp grows with it so slow periods do not slow the timers down.
   */
  setTargetScanMs(ms: number): void {
    const targetScanMs = Math.max(1, Math.round(ms));
    this.options = {
      ...this.options,
      targetScanMs,
      stepDeltaMs: targetScanMs,
      maxDeltaMs: Math.max(this.options.maxDeltaMs, targetScanMs * 2),
    };
  }

  /**
   * Starts recording per-node power flow (idempotent) and returns the trace. Costs one map write
   * per evaluated tree node per scan, so it stays off until a UI asks for it.
   */
  enableFlowTrace(): FlowTrace {
    if (this.trace === null) {
      this.trace = new FlowTrace();
      this.executor.setTrace(this.trace);
    }
    return this.trace;
  }

  subscribe(listener: PlcEventListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  // ---- program -------------------------------------------------------------------------------

  /**
   * Recompiles and installs a program. A running controller keeps scanning only if the new program
   * compiles cleanly; otherwise it drops to STOP, as a CPU does when a download fails.
   */
  loadProgram(program: LadderProgram): CompiledProgram {
    this.program = compileProgram(program, this.memory.profile);
    this.executor.setProgram(this.program);
    this.emit({ type: 'program', diagnostics: this.program.diagnostics });
    if (!this.program.ok && this.currentMode === 'RUN') this.stop();
    return this.program;
  }

  // ---- mode machine --------------------------------------------------------------------------

  /** STOP -> RUN performs a cold start; PAUSE -> RUN resumes with the retained image. */
  run(): boolean {
    if (!this.program.ok) {
      this.emit({
        type: 'diagnostic',
        diagnostic: {
          code: 'PROGRAM_NOT_RUNNABLE',
          severity: 'error',
          message: 'Program has compile errors; the controller stays in STOP',
        },
      });
      return false;
    }
    if (this.currentMode === 'RUN') return true;
    if (this.currentMode === 'STOP') this.executor.coldStart();

    this.setMode('RUN');
    const now = this.options.clock();
    this.lastScanAt = now;
    this.nextDue = now;
    this.arm(0);
    return true;
  }

  /** Freezes the scan loop; memory, timers and edges are retained. */
  pause(): void {
    if (this.currentMode === 'STOP' || this.currentMode === 'PAUSE') return;
    this.disarm();
    this.setMode('PAUSE');
  }

  /** Controller stop: scanning ends and the outputs are de-energised. */
  stop(): void {
    this.disarm();
    if (this.currentMode !== 'STOP' && this.options.clearOutputsOnStop) this.executor.clearOutputs();
    this.lastScanAt = null;
    this.trace?.clear(); // nothing conducts while the controller is stopped
    this.setMode('STOP');
  }

  /**
   * Executes exactly one scan and settles in PAUSE. Simulated time advances by `stepDeltaMs`
   * rather than by the wall time the operator spent between clicks.
   */
  step(): ScanReport | null {
    if (!this.program.ok) return null;
    if (this.currentMode === 'STOP') this.executor.coldStart();

    this.disarm();
    this.setMode('SINGLE_STEP');
    const report = this.executeScan(this.options.stepDeltaMs);
    this.setMode('PAUSE');
    return report;
  }

  /** Cold start: clears memory, edge state and timers, and returns to STOP. */
  reset(): void {
    this.disarm();
    this.memory.reset();
    this.executor.coldStart();
    this.lastScanAt = null;
    this.lastMetrics = null;
    this.trace?.clear();
    this.setMode('STOP');
    this.emit({ type: 'reset' });
  }

  /** Releases the scheduler handle; always call this when tearing down the worker or hook. */
  dispose(): void {
    this.disarm();
    this.listeners.clear();
  }

  // ---- scan loop -----------------------------------------------------------------------------

  private readonly tick = (): void => {
    this.handle = null;
    if (this.currentMode !== 'RUN') return;

    const { clock, pacing, freeRunBudgetMs, targetScanMs, maxCatchUpScans } = this.options;
    const burstStart = clock();
    let scans = 0;

    do {
      this.executeScan(this.elapsed());
      scans += 1;
      this.nextDue += targetScanMs;
    } while (
      this.currentMode === 'RUN' &&
      (pacing === 'free'
        ? clock() - burstStart < freeRunBudgetMs
        : scans < maxCatchUpScans && this.nextDue <= clock())
    );

    if (this.currentMode !== 'RUN') return;

    if (pacing === 'free') {
      this.arm(0);
      return;
    }
    const now = clock();
    // The scheduler fell far behind (background tab, heavy program): resync instead of
    // trying to replay every missed scan.
    if (this.nextDue < now - targetScanMs * maxCatchUpScans) this.nextDue = now;
    this.arm(Math.max(0, this.nextDue - now));
  };

  private executeScan(deltaMs: number): ScanReport {
    const startedAt = this.options.clock();
    this.lastScanAt = startedAt;

    const report = this.executor.scan(startedAt, deltaMs);
    this.lastMetrics = report.metrics;

    for (const diagnostic of report.diagnostics) this.emit({ type: 'diagnostic', diagnostic });
    if (report.metrics.cycle % this.options.scanEventEvery === 0) this.emit({ type: 'scan', report });
    return report;
  }

  /** Wall time since the previous scan, clamped so a throttled tab cannot warp the timers. */
  private elapsed(): number {
    const now = this.options.clock();
    if (this.lastScanAt === null) return this.options.targetScanMs;
    return Math.min(this.options.maxDeltaMs, Math.max(0, now - this.lastScanAt));
  }

  private arm(delayMs: number): void {
    if (this.handle !== null) this.options.scheduler.cancel(this.handle);
    this.handle = this.options.scheduler.schedule(this.tick, delayMs);
  }

  private disarm(): void {
    if (this.handle === null) return;
    this.options.scheduler.cancel(this.handle);
    this.handle = null;
  }

  private setMode(mode: ExecutionMode): void {
    if (mode === this.currentMode) return;
    const previous = this.currentMode;
    this.currentMode = mode;
    this.emit({ type: 'mode', mode, previous });
  }

  private emit(event: PlcEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        // A faulty subscriber must not stall the scan loop.
        console.error('PlcRuntime listener failed', error);
      }
    });
  }
}
