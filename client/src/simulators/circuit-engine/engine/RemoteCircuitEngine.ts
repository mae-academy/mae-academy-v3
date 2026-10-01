import type { CircuitComponent, CircuitWire, SimulationSnapshot } from '@shared/circuit/circuitTypes';
import { diffCircuit, fingerprintCircuit } from '@shared/circuit/fingerprint';
import { describeCircuit, type NetLookup } from '@shared/circuit/nets';
import type { TransientRequest, TransientResponse } from '@shared/circuit/protocol';
import { CircuitEngineError, CircuitSession, solveRemote, type CircuitTransport } from '@/services/circuitClient';

/** What the canvas needs from a simulation runtime. The solver behind it lives on the server. */
export interface CircuitEngine {
  setCircuit(components: CircuitComponent[], wires: CircuitWire[]): void;
  reset(): void;
  step(elapsedSeconds?: number): SimulationSnapshot;
  getSnapshot(): SimulationSnapshot;
  getTime(): number;
}

/** Largest simulated time one request may carry (matches the server limit). */
const MAX_PENDING = 0.25;
/** Simulated time per integration slice sent to the server. */
const SLICE = 0.03;
/** A batch is worth a round trip once this much simulated time has accumulated. */
const MIN_ADVANCE = 0.001;
/** Minimum wall-clock gap between requests: keeps the live run at ≤ ~14 requests/s, under the 900/min budget. */
const MIN_INTERVAL_MS = 70;
/** Consecutive failures before the canvas shows the "check warnings" state. */
const FAILURES_BEFORE_WARNING = 3;

export function emptySnapshot(): SimulationSnapshot {
  return {
    time: 0, nodeVoltages: { '0': 0 }, terminalVoltages: {}, branchCurrents: {}, wireCurrents: {}, wirePhases: {}, componentPowered: {},
    componentIntensity: {}, nodeHistory: {}, branchHistory: {}, instrumentReadings: {}, warnings: [], converged: true,
  };
}

/** JSON has no Infinity: an open-circuit ohmmeter arrives as `null` and is restored to the +∞ the UI formats. */
function toSnapshot(response: TransientResponse): SimulationSnapshot {
  return {
    time: response.time,
    nodeVoltages: response.nodeVoltages,
    terminalVoltages: response.terminalVoltages,
    branchCurrents: response.branchCurrents,
    wireCurrents: response.wireCurrents,
    wirePhases: response.wirePhases,
    componentPowered: response.componentPowered,
    componentIntensity: response.componentIntensity,
    nodeHistory: {},
    branchHistory: {},
    instrumentReadings: Object.fromEntries(Object.entries(response.instrumentReadings).map(([id, reading]) => [id, { ...reading, value: reading.value === null ? Number.POSITIVE_INFINITY : reading.value }])),
    warnings: response.diagnostics.map((item) => ({ code: item.code, message: item.message, ...(item.componentId ? { componentId: item.componentId } : {}) })),
    converged: response.converged,
  };
}

/**
 * Drop-in replacement for the in-browser engine. The canvas keeps calling `step()` every animation frame; this class turns those
 * calls into batched, stateless requests to /api/circuit/solve and answers each frame from the latest result, so rendering never
 * waits on the network. Wire animation phases are extrapolated between responses.
 */
export class RemoteCircuitEngine implements CircuitEngine {
  private session: CircuitSession | null = null;
  private descriptionKey = '';
  private fingerprints = new Map<string, string>();
  /** Opaque engine state echoed between requests. */
  private state: unknown;
  /** Ids whose stored energy survives the schematic edit; sent with the first request after it. */
  private retain: string[] | undefined;
  private generation = 0;
  private inflight = false;
  private pending = 0;
  private sinceResponse = 0;
  private lastSent = Number.NEGATIVE_INFINITY;
  private backoffUntil = 0;
  private failures = 0;
  private base: SimulationSnapshot = emptySnapshot();
  /** What the canvas last received; `getSnapshot()` hands out this exact object until a step or a response replaces it. */
  private current: SimulationSnapshot = this.base;
  private phaseRates: Record<string, number> = {};

  constructor(
    private readonly transport: CircuitTransport = solveRemote,
    private readonly now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    private readonly netLookup?: (components: CircuitComponent[], wires: CircuitWire[]) => NetLookup | undefined,
  ) {}

  setCircuit(components: CircuitComponent[], wires: CircuitWire[]): void {
    const description = describeCircuit(components, wires, this.netLookup?.(components, wires));
    const key = JSON.stringify(description);
    // Layout-only edits (moving a part, re-routing a wire) change nothing electrical: no round trip, no state change.
    if (key === this.descriptionKey && this.session) return;
    const next = fingerprintCircuit(components, wires);
    const { sameCircuit, unchanged } = diffCircuit(this.fingerprints, next);
    this.fingerprints = next;
    this.descriptionKey = key;
    this.session = new CircuitSession(description, this.transport);
    this.generation += 1;
    this.inflight = false;
    if (sameCircuit) this.retain = Array.from(unchanged);
    else { this.state = undefined; this.retain = undefined; this.pending = 0; this.base = emptySnapshot(); this.current = this.base; this.phaseRates = {}; }
  }

  reset(): void {
    this.generation += 1;
    this.inflight = false;
    this.state = undefined;
    this.retain = undefined;
    this.pending = 0;
    this.sinceResponse = 0;
    this.fingerprints = new Map();
    this.base = emptySnapshot();
    this.current = this.base;
    this.phaseRates = {};
    this.failures = 0;
    this.backoffUntil = 0;
  }

  step(elapsedSeconds = 1 / 1000): SimulationSnapshot {
    const elapsed = Math.max(0, elapsedSeconds);
    this.pending = Math.min(MAX_PENDING, this.pending + elapsed);
    this.sinceResponse = Math.min(0.5, this.sinceResponse + elapsed);
    this.pump();
    this.current = this.view();
    return this.current;
  }

  /** Stable between steps: a canvas effect that re-reads it after every render must not see a new object each time. */
  getSnapshot(): SimulationSnapshot { return this.current; }

  getTime(): number { return this.base.time; }

  private view(): SimulationSnapshot {
    const ahead = Math.min(this.sinceResponse, MAX_PENDING);
    const phases = this.base.wirePhases ?? {};
    return {
      ...this.base,
      time: this.base.time + ahead,
      wirePhases: Object.fromEntries(Object.entries(phases).map(([id, phase]) => [id, phase + (this.phaseRates[id] ?? 0) * ahead])),
    };
  }

  private pump(): void {
    const t = this.now();
    if (!this.session || this.inflight || this.pending < MIN_ADVANCE || t < this.backoffUntil || t - this.lastSent < MIN_INTERVAL_MS) return;
    const generation = this.generation;
    const session = this.session;
    const sent = this.pending;
    const steps = Math.min(64, Math.max(1, Math.ceil(sent / SLICE)));
    const request: Omit<TransientRequest, 'v' | 'h' | 'circuit'> = {
      analysisType: 'transient', timeStep: sent / steps, steps,
      ...(this.state !== undefined ? { state: this.state } : {}),
      ...(this.retain ? { retain: this.retain } : {}),
    };
    this.pending = 0;
    this.inflight = true;
    this.lastSent = t;
    session.send(request).then(
      (response) => {
        if (generation !== this.generation) return; // the circuit changed while this was in flight: its result no longer describes it
        this.inflight = false;
        this.failures = 0;
        this.state = response.state;
        this.retain = undefined;
        const advanced = Math.max(0, response.advanced);
        this.pending = Math.min(MAX_PENDING, this.pending + Math.max(0, sent - advanced)); // the server bounds its work: re-queue what it did not run
        const previous = this.base.wirePhases ?? {};
        this.phaseRates = advanced > 0 ? Object.fromEntries(Object.entries(response.wirePhases).map(([id, phase]) => [id, (phase - (previous[id] ?? phase)) / advanced])) : {};
        this.base = toSnapshot(response);
        this.sinceResponse = 0;
        this.current = this.view();
      },
      (error: unknown) => {
        if (generation !== this.generation) return;
        this.inflight = false;
        this.pending = Math.min(MAX_PENDING, this.pending + sent);
        if ((error as { name?: string })?.name === 'AbortError') return;
        this.failures += 1;
        const failure = error instanceof CircuitEngineError ? error : new CircuitEngineError('Cannot reach the simulation engine');
        const delay = failure.code === 'version' ? 30_000 : failure.retryAfterMs ?? Math.min(4000, 250 * 2 ** this.failures);
        this.backoffUntil = this.now() + delay;
        if (this.failures >= FAILURES_BEFORE_WARNING || failure.code === 'version') {
          this.base = { ...this.base, converged: false, warnings: [{ code: 'ENGINE_UNREACHABLE', message: failure.message }] };
          this.current = this.view();
        }
      },
    );
  }
}
