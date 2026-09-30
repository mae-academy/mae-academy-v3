import { evaluateRemote, PlcEngineError, type EvaluateBody, type EvaluateResponse, type PlcTransport } from '@/services/plcClient';
import { applyDiff, encodeDiff, flattenSnapshot, fromBase64, toBase64, unflattenSnapshot } from '@shared/plcWire';
import type { LadderProgram } from '../domain/ast';
import { byteAreaSize } from '../domain/hardware';
import type { MemoryMap } from '../domain/memory';
import { compileProgram, type CompiledProgram } from '../engine/compiler';
import { FlowTrace } from '../engine/flow-trace';
import {
  defaultClock,
  defaultScheduler,
  type Diagnostic,
  type ExecutionMode,
  type PlcEvent,
  type PlcEventListener,
  type ScanMetrics,
  type FieldIoAdapter,
  type MonotonicClock,
  type Scheduler,
  type ScanReport,
  type StatusFlagMirror,
} from '../engine/types';
import type { PlcRuntimePort } from './runtime-port';
import { applyWireTrace } from './trace';

export interface RemoteRuntimeOptions {
  /** Simulated period of one scan. */
  readonly targetScanMs?: number;
  /** Simulated time granted to one `step()`. */
  readonly stepDeltaMs?: number;
  /** A run that falls this far behind real time resyncs instead of replaying. */
  readonly maxDeltaMs?: number;
  /** De-energise the outputs on the transition into STOP. */
  readonly clearOutputsOnStop?: boolean;
  /** Emit a `scan` event every N applied batches. */
  readonly scanEventEvery?: number;
  readonly clock?: MonotonicClock;
  readonly scheduler?: Scheduler;
  readonly fieldIo?: FieldIoAdapter;
  readonly statusFlagMirror?: StatusFlagMirror;
  /** Sends a batch to the engine; defaults to `fetch('/api/plc/evaluate')`. */
  readonly transport?: PlcTransport;
  /** Scans per request at the default 20 ms period; grows automatically on slow links. */
  readonly batchScans?: number;
  /** Extra attempts after a transient failure (network error, 5xx). A 429 is retried for as long as the run lasts. */
  readonly retries?: number;
  /** Floor for the wait after a 429, whatever Retry-After says. */
  readonly minThrottleWaitMs?: number;
}

const DEFAULTS: { targetScanMs: number; stepDeltaMs: number; maxDeltaMs: number; clearOutputsOnStop: boolean; scanEventEvery: number } = { targetScanMs: 20, stepDeltaMs: 20, maxDeltaMs: 250, clearOutputsOnStop: true, scanEventEvery: 1 };
const MAX_BATCH = 64; // matches LIMITS.maxScansPerRequest on the server
/** Fresh carried state: the server's opaque runtime snapshot with nothing in it (edges, timers, counters). */
const EMPTY_RUNTIME: unknown = [[], [], []];

/** Keeps only what the engine needs: titles, comments, symbols and IL text stay in the browser. */
function slim(program: LadderProgram): LadderProgram {
  return {
    schemaVersion: 1,
    profileId: program.profileId,
    networks: program.networks.map((network) => ({
      id: network.id,
      grid: network.grid,
      branches: network.branches,
      nodes: network.nodes.map(({ symbol: _symbol, ...node }) => node as typeof node),
    })),
  };
}

/**
 * Controller that runs its scans on the serverless engine.
 *
 * The engine is stateless, so the browser is the system of record: every request carries the
 * memory image plus the small runtime state (edges, timer/counter bookkeeping) that the previous
 * response returned, and the response is written back into the local `MemoryMap` that the UI
 * already subscribes to. Scans are batched; to hide network latency each request is sent one
 * measured round trip *before* its reply is due, so replies land on a steady cadence.
 */
export class RemoteRuntime implements PlcRuntimePort {
  private options: RemoteRuntimeOptions & typeof DEFAULTS;
  private readonly transport: PlcTransport;
  private readonly baseBatch: number;
  private readonly retries: number;
  private readonly minThrottleWaitMs: number;
  private readonly listeners = new Set<PlcEventListener>();
  private readonly trace = new FlowTrace();

  private source: LadderProgram;
  private program: CompiledProgram;
  private currentMode: ExecutionMode = 'STOP';
  private lastMetrics: ScanMetrics | null = null;

  private runtimeState: unknown = EMPTY_RUNTIME;
  /** Hash of the program the server holds for us; null means the next request carries the program. */
  private programHash: string | null = null;
  private cycle = 0;
  private revision = 0; // bumped on every program swap
  private generation = 0; // bumped on every mode change that must cancel in-flight work
  private rttMs = 0;
  private sleepHandle: number | null = null;
  private batches = 0;
  private scanTimes: number[] = [];
  private minScanMs = Number.POSITIVE_INFINITY;
  private maxScanMs = 0;

  constructor(readonly memory: MemoryMap, program: LadderProgram, options: RemoteRuntimeOptions = {}) {
    const { transport, batchScans, retries, minThrottleWaitMs, ...rest } = options;
    this.options = { ...DEFAULTS, ...rest };
    this.transport = transport ?? evaluateRemote;
    this.baseBatch = Math.max(1, Math.min(MAX_BATCH, batchScans ?? 5));
    this.retries = retries ?? 2;
    this.minThrottleWaitMs = minThrottleWaitMs ?? 1_000;
    this.source = program;
    this.program = compileProgram(program, memory.profile);
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
  get scanPeriodMs(): number {
    return this.options.targetScanMs;
  }

  setTargetScanMs(ms: number): void {
    const targetScanMs = Math.max(1, Math.round(ms));
    this.options = { ...this.options, targetScanMs, stepDeltaMs: targetScanMs, maxDeltaMs: Math.max(this.options.maxDeltaMs, targetScanMs * 2) };
  }

  enableFlowTrace(): FlowTrace {
    return this.trace;
  }

  subscribe(listener: PlcEventListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  // ---- program -------------------------------------------------------------------------------

  loadProgram(program: LadderProgram): CompiledProgram {
    this.source = program;
    this.program = compileProgram(program, this.memory.profile);
    this.revision += 1;
    this.programHash = null;
    this.emit({ type: 'program', diagnostics: this.program.diagnostics });
    if (!this.program.ok && this.currentMode === 'RUN') this.stop();
    return this.program;
  }

  // ---- mode machine --------------------------------------------------------------------------

  run(): boolean {
    if (!this.program.ok) {
      this.emit({
        type: 'diagnostic',
        diagnostic: { code: 'PROGRAM_NOT_RUNNABLE', severity: 'error', message: 'Program has compile errors; the controller stays in STOP' },
      });
      return false;
    }
    if (this.currentMode === 'RUN') return true;
    if (this.currentMode === 'STOP') this.coldStart();
    this.cancel();
    this.setMode('RUN');
    void this.runLoop(this.generation);
    return true;
  }

  pause(): void {
    if (this.currentMode === 'STOP' || this.currentMode === 'PAUSE') return;
    this.cancel();
    this.setMode('PAUSE');
  }

  stop(): void {
    this.cancel();
    if (this.currentMode !== 'STOP' && this.options.clearOutputsOnStop) this.clearOutputs();
    this.trace.clear();
    this.setMode('STOP');
  }

  step(): Promise<ScanReport | null> {
    if (!this.program.ok) return Promise.resolve(null);
    if (this.currentMode === 'STOP') this.coldStart();
    this.cancel();
    this.setMode('SINGLE_STEP');
    const generation = this.generation;
    return this.exchange(1, this.options.stepDeltaMs, generation).then(
      (report) => {
        if (generation === this.generation) this.setMode('PAUSE');
        return report;
      },
      (error) => {
        if (generation === this.generation) this.fail(error);
        return null;
      },
    );
  }

  reset(): void {
    this.cancel();
    this.memory.reset();
    this.coldStart();
    this.lastMetrics = null;
    this.trace.clear();
    this.setMode('STOP');
    this.emit({ type: 'reset' });
  }

  dispose(): void {
    this.cancel();
    this.listeners.clear();
  }

  /**
   * Makes the local input image match the field at once, so a flipped switch is reflected by the
   * LED and the contacts in 0 ms; the controller reacts when the next batch comes back.
   */
  syncInputs(): void {
    const image = this.sampleField();
    if (!image) return;
    this.memory.transaction(() => {
      for (let i = 0; i < image.length; i++) this.memory.write(`IB${i}`, image[i]!, 'io');
    });
  }

  // ---- scan loop -----------------------------------------------------------------------------

  private async runLoop(generation: number): Promise<void> {
    const clock = this.options.clock ?? defaultClock;
    let due = clock();
    while (generation === this.generation && this.currentMode === 'RUN') {
      const period = this.options.targetScanMs;
      const n = this.batchSize(period);

      // Send one round trip early so the reply arrives as its simulated interval ends.
      const wait = due - this.rttMs - clock();
      if (wait > 0 && !(await this.sleep(wait, generation))) return;
      if (generation !== this.generation) return;

      try {
        await this.exchange(n, period, generation);
      } catch (error) {
        if (generation === this.generation) this.fail(error);
        return;
      }
      if (generation !== this.generation) return;

      due += n * period;
      const now = clock();
      if (now - due > this.options.maxDeltaMs) due = now; // far behind: resync instead of replaying
    }
  }

  private batchSize(period: number): number {
    const needed = Math.ceil((1.5 * this.rttMs) / period);
    return Math.max(1, Math.min(MAX_BATCH, Math.max(Math.ceil((this.baseBatch * 20) / period), needed)));
  }

  /** One request/response cycle: build, send (with retries), apply. */
  private async exchange(n: number, deltaMs: number, generation: number): Promise<ScanReport | null> {
    const clock = this.options.clock ?? defaultClock;
    const revision = this.revision;

    const sentAt = clock();
    const response = await this.send(() => this.buildBody(n, deltaMs), generation);
    if (response === null || generation !== this.generation) return null;
    const rtt = clock() - sentAt;
    this.rttMs = this.rttMs === 0 ? rtt : this.rttMs * 0.8 + rtt * 0.2;

    return this.apply(response, n, deltaMs, rtt, revision === this.revision);
  }

  private async send(build: () => EvaluateBody, generation: number): Promise<EvaluateResponse | null> {
    let failures = 0;
    let warned = false;
    let renegotiated = false;
    for (;;) {
      try {
        return await this.transport(build());
      } catch (error) {
        if (error instanceof PlcEngineError && error.code === 'need_program' && !renegotiated) {
          // The server recycled its program cache: send the program itself this once.
          renegotiated = true;
          this.programHash = null;
          continue;
        }
        if (error instanceof PlcEngineError && error.status === 429) {
          // Throttled: keep the last frame on screen, tell the user once, and try again after the
          // server's Retry-After. Nothing is lost, because the engine is stateless and we resend.
          const waitMs = Math.min(15_000, Math.max(this.minThrottleWaitMs, error.retryAfterMs ?? 2_000));
          if (!warned) {
            warned = true;
            this.emit({
              type: 'diagnostic',
              diagnostic: {
                code: 'ENGINE_THROTTLED',
                severity: 'warning',
                message: `Too many simulation requests; holding the last state and retrying in ${Math.ceil(waitMs / 1000)} s`,
              },
            });
          }
          if (!(await this.sleep(waitMs, generation))) return null;
          continue;
        }
        const retryable = error instanceof PlcEngineError ? error.retryable : true;
        if (!retryable || failures >= this.retries) throw error;
        if (!(await this.sleep(100 * 2 ** failures, generation))) return null;
        failures += 1;
      }
    }
  }

  private buildBody(n: number, deltaMs: number): EvaluateBody {
    const image = flattenSnapshot(this.memory.snapshot());
    return {
      v: 2,
      ...(this.programHash ? { h: this.programHash } : { program: slim(this.source) }),
      // the whole image against zeros: an idle controller packs down to a few bytes
      st: { m: toBase64(encodeDiff(new Uint8Array(image.length), image)), r: this.runtimeState, c: this.cycle },
      in: toBase64(this.sampleField() ?? new Uint8Array(0)),
      n,
      dt: deltaMs,
      tr: true,
    };
  }

  private apply(response: EvaluateResponse, n: number, deltaMs: number, rtt: number, sameProgram: boolean): ScanReport | null {
    if (!response.ok || response.m === undefined || response.r === undefined || response.c === undefined) {
      const first = response.cd?.find((d) => d.severity === 'error');
      this.fail(new PlcEngineError(first ? `The engine rejected the program: ${first.message}` : 'The engine rejected the program'));
      return null;
    }
    const clock = this.options.clock ?? defaultClock;
    const { fieldIo, statusFlagMirror } = this.options;

    this.runtimeState = response.r;
    this.cycle = response.c;
    if (sameProgram && response.h) this.programHash = response.h; // from now on send the hash, not the program

    // Per-scan results arrive sparse: one flag byte per scan, diagnostics only where a scan had some.
    const flagBytes = response.sc?.f ? fromBase64(response.sc.f) : null;
    const lastFlags = flagBytes?.[n - 1] ?? 0;
    const statusFlags = { zero: (lastFlags & 1) !== 0, overflow: (lastFlags & 2) !== 0, negative: (lastFlags & 4) !== 0, divideByZero: (lastFlags & 8) !== 0 };

    this.memory.transaction(() => {
      // The reply lists only the cells this batch changed; write them over the memory as it is now,
      // so anything the user touched while the request was in flight (and the server left alone) stays.
      const template = this.memory.snapshot();
      const patched = applyDiff(flattenSnapshot(template), fromBase64(response.m!));
      this.memory.restore(unflattenSnapshot(template, patched) as ReturnType<MemoryMap['snapshot']>);
      this.syncInputs(); // keep optimistic input toggles that happened while the request was in flight
      if (statusFlagMirror) {
        if (statusFlagMirror.zero) this.memory.writeBit(statusFlagMirror.zero, statusFlags.zero);
        if (statusFlagMirror.overflow) this.memory.writeBit(statusFlagMirror.overflow, statusFlags.overflow);
        if (statusFlagMirror.negative) this.memory.writeBit(statusFlagMirror.negative, statusFlags.negative);
        if (statusFlagMirror.divideByZero) this.memory.writeBit(statusFlagMirror.divideByZero, statusFlags.divideByZero);
      }
    });
    if (response.o && fieldIo?.commitOutputs) fieldIo.commitOutputs(fromBase64(response.o));

    // The trace describes the program the request carried; skip it if the program changed since.
    if (response.tr && sameProgram) {
      applyWireTrace(this.trace, this.program.networks.map((c) => c.root), response.tr, fromBase64);
    }

    const scanTimeMs = (response.ms ?? 0) / Math.max(1, n);
    this.minScanMs = Math.min(this.minScanMs, scanTimeMs);
    this.maxScanMs = Math.max(this.maxScanMs, scanTimeMs);
    this.scanTimes.push(scanTimeMs);
    if (this.scanTimes.length > 32) this.scanTimes.shift();
    const metrics: ScanMetrics = {
      cycle: this.cycle,
      startedAt: clock() - rtt,
      scanTimeMs,
      deltaMs,
      cycleTimeMs: deltaMs,
      minScanMs: this.minScanMs,
      maxScanMs: this.maxScanMs,
      avgScanMs: this.scanTimes.reduce((a, b) => a + b, 0) / this.scanTimes.length,
    };
    this.lastMetrics = metrics;

    const diagnostics = dedupe((response.sc?.g ?? []).flatMap(([, list]) => list));
    const report: ScanReport = { metrics, diagnostics, statusFlags, memoryVersion: this.memory.version };
    for (const diagnostic of diagnostics) this.emit({ type: 'diagnostic', diagnostic });
    this.batches += 1;
    if (this.batches % this.options.scanEventEvery === 0) this.emit({ type: 'scan', report });
    return report;
  }

  // ---- helpers -------------------------------------------------------------------------------

  private coldStart(): void {
    this.runtimeState = EMPTY_RUNTIME;
    this.cycle = 0;
    this.minScanMs = Number.POSITIVE_INFINITY;
    this.maxScanMs = 0;
    this.scanTimes = [];
  }

  /** Invalidates in-flight requests and pending sleeps. */
  private cancel(): void {
    this.generation += 1;
    if (this.sleepHandle !== null) {
      (this.options.scheduler ?? defaultScheduler).cancel(this.sleepHandle);
      this.sleepHandle = null;
    }
  }

  /** Resolves true after `ms`, or false if the run was cancelled meanwhile. */
  private sleep(ms: number, generation: number): Promise<boolean> {
    const scheduler = this.options.scheduler ?? defaultScheduler;
    return new Promise((resolve) => {
      this.sleepHandle = scheduler.schedule(() => {
        this.sleepHandle = null;
        resolve(generation === this.generation);
      }, ms);
    });
  }

  private sampleField(): Uint8Array | null {
    const spec = this.memory.profile.memory.I;
    if (!spec) return null;
    const image = new Uint8Array(byteAreaSize(spec));
    this.options.fieldIo?.sampleInputs?.(image);
    const remainder = spec.bitCount % 8;
    if (remainder !== 0 && image.length > 0) image[image.length - 1]! &= (1 << remainder) - 1;
    return image;
  }

  private clearOutputs(): void {
    const spec = this.memory.profile.memory.Q;
    if (!spec) return;
    const size = byteAreaSize(spec);
    this.memory.transaction(() => {
      for (let i = 0; i < size; i++) this.memory.write(`QB${i}`, 0);
    });
    this.options.fieldIo?.commitOutputs?.(new Uint8Array(size));
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Simulation engine failed';
    this.emit({ type: 'diagnostic', diagnostic: { code: 'ENGINE_UNREACHABLE', severity: 'error', message } });
    this.stop();
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
        console.error('RemoteRuntime listener failed', error);
      }
    });
  }
}

function dedupe(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const key = `${d.code}|${d.networkId ?? ''}|${d.nodeId ?? ''}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
