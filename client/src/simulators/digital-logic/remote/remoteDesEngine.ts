import { runDesRemote, type DesOp, type DesResult } from '@/services/logicClient';
import type { CircuitComponent, CircuitWire, SimulationSnapshot } from '@shared/logic/circuitTypes';
import type { DesWireState, LogicState } from '@shared/logic/desTypes';
import { LOGIC_COMPONENT_TYPES, logicPinsFor, resolveReversedWires, type LogicPinMap } from '@shared/logic/pins';

export type LogicStateListener = (next: LogicState, atNs: number) => void;

/** What the Digital Logic workspace needs from a discrete-event engine (the serverless one implements it). */
export interface DigitalLogicEngine {
  setCircuit(components: CircuitComponent[], wires: CircuitWire[]): void;
  reset(): void;
  getSnapshot(): SimulationSnapshot;
  getTime(): number;
  step(elapsedSeconds?: number): SimulationSnapshot;
  toggleDigitalInput(componentId: string): SimulationSnapshot;
  driveDigitalInput(componentId: string, value: LogicState): SimulationSnapshot;
  subscribeToWire(wireId: string, listener: LogicStateListener): () => void;
  getWireLogicState(wireId: string): LogicState;
  isWireFlowReversed(wireId: string): boolean;
  getLogicState(componentId: string, pin: string): LogicState;
  /** Notified after every applied reply (the engine answers asynchronously). */
  subscribe(listener: () => void): () => void;
  /** Resolves once every queued request has been answered. */
  idle(): Promise<void>;
}

export interface RemoteDesOptions {
  /** Minimum real time between two clock-step requests. */
  readonly batchMs?: number;
  readonly clock?: () => number;
  readonly onError?: (message: string) => void;
}

const MAX_OPS = 16; // LOGIC_LIMITS.maxOps on the server
const MAX_STEP_S = 1; // a single step op may cover at most one second

const emptySnapshot = (): SimulationSnapshot => ({ time: 0, nodeVoltages: {}, terminalVoltages: {}, branchCurrents: {}, wireCurrents: {}, componentPowered: {}, componentIntensity: {}, nodeHistory: {}, branchHistory: {}, instrumentReadings: {}, warnings: [], converged: true });

/**
 * Browser end of the serverless discrete-event engine. The engine is stateless, so this object is the
 * system of record for the carried `DesWireState`; no gate, flip-flop or event-queue logic runs here.
 * The only local work is bookkeeping: request batching, fan-out of returned wire events to
 * subscribers, and the structural wire-direction lookup (pin catalogue, not simulation).
 */
export class RemoteDesEngine implements DigitalLogicEngine {
  private readonly batchMs: number;
  private readonly clock: () => number;
  private components: CircuitComponent[] = [];
  private wires: CircuitWire[] = [];
  private pinMaps = new Map<string, LogicPinMap>();
  private reversed = new Set<string>();
  private hasClock = false;
  private carried: DesWireState | null = null;
  private needInit = false;
  private pending: DesOp[] = [];
  private inFlight = false;
  private generation = 0;
  private lastFlushAt = Number.NEGATIVE_INFINITY;
  private simTime = 0;
  private view: SimulationSnapshot = emptySnapshot();
  private wireLevels: Record<string, LogicState> = {};
  private pinLevels: Record<string, LogicState> = {};
  private readonly wireListeners = new Map<string, Set<LogicStateListener>>();
  private readonly listeners = new Set<() => void>();
  private waiters: (() => void)[] = [];

  constructor(private readonly options: RemoteDesOptions = {}) {
    this.batchMs = options.batchMs ?? 100;
    this.clock = options.clock ?? (() => performance.now());
  }

  // ---- engine surface ----------------------------------------------------------------------

  setCircuit(components: CircuitComponent[], wires: CircuitWire[]): void {
    this.generation += 1;
    this.components = components.filter(c => LOGIC_COMPONENT_TYPES.has(c.type)).map(c => ({ ...c, props: { ...c.props } }));
    this.wires = wires.map(w => ({ ...w }));
    this.pinMaps = new Map(this.components.map(c => [c.id, logicPinsFor(c)]));
    this.reversed = resolveReversedWires(this.wires, this.pinMaps);
    this.hasClock = this.components.some(c => c.type === 'logic-clock');
    this.carried = null;
    this.pending = [];
    this.simTime = 0;
    this.view = emptySnapshot();
    this.wireLevels = {};
    this.pinLevels = {};
    this.needInit = true;
    this.inFlight = false; // a reply for the previous circuit is discarded by the generation check
    void this.flush();
  }

  reset(): void {
    this.generation += 1;
    this.carried = null;
    this.pending = [];
    this.simTime = 0;
    this.needInit = true;
    this.inFlight = false;
    void this.flush();
  }

  getSnapshot(): SimulationSnapshot {
    return this.view;
  }

  getTime(): number {
    return this.simTime;
  }

  step(elapsedSeconds = 1 / 1000): SimulationSnapshot {
    const dt = Math.max(0, elapsedSeconds);
    this.simTime += dt;
    if (this.hasClock && dt > 0) {
      const last = this.pending[this.pending.length - 1];
      if (last?.t === 'step' && last.dt + dt <= MAX_STEP_S) last.dt += dt;
      else this.pending.push({ t: 'step', dt: Math.min(MAX_STEP_S, dt) });
      if (this.clock() - this.lastFlushAt >= this.batchMs) void this.flush();
    }
    this.view = { ...this.view, time: this.simTime };
    return this.view;
  }

  toggleDigitalInput(componentId: string): SimulationSnapshot {
    this.optimisticInput(componentId, undefined);
    this.pending.push({ t: 'toggle', id: componentId });
    void this.flush();
    return this.view;
  }

  driveDigitalInput(componentId: string, value: LogicState): SimulationSnapshot {
    this.optimisticInput(componentId, value);
    this.pending.push({ t: 'drive', id: componentId, value });
    void this.flush();
    return this.view;
  }

  subscribeToWire(wireId: string, listener: LogicStateListener): () => void {
    const set = this.wireListeners.get(wireId) ?? new Set<LogicStateListener>();
    set.add(listener);
    this.wireListeners.set(wireId, set);
    return () => { set.delete(listener); };
  }

  getWireLogicState(wireId: string): LogicState {
    return this.wireLevels[wireId] ?? 'X';
  }

  isWireFlowReversed(wireId: string): boolean {
    return this.reversed.has(wireId);
  }

  getLogicState(componentId: string, pin: string): LogicState {
    return this.pinLevels[`${componentId}:${pin}`] ?? 'X';
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  idle(): Promise<void> {
    return this.pending.length === 0 && !this.inFlight && !this.needInit ? Promise.resolve() : new Promise(resolve => this.waiters.push(resolve));
  }

  // ---- internals ---------------------------------------------------------------------------

  /** Shows a clicked input at its new level at once; the reply overwrites it with the engine's answer. */
  private optimisticInput(id: string, value: LogicState | undefined): void {
    const component = this.components.find(c => c.id === id && c.type === 'digital-input');
    if (!component) return;
    const current = this.pinLevels[`${id}:out`] ?? (component.props.state === 'HIGH' ? 1 : 0);
    const next: LogicState = value ?? (current === 1 ? 0 : 1);
    this.pinLevels = { ...this.pinLevels, [`${id}:out`]: next };
    this.view = { ...this.view, terminalVoltages: { ...this.view.terminalVoltages, [`${id}:out`]: next === 1 ? 1 : 0 }, componentPowered: { ...this.view.componentPowered, [id]: next === 1 } };
  }

  private async flush(): Promise<void> {
    if (this.inFlight || (this.pending.length === 0 && !this.needInit)) return;
    this.inFlight = true;
    this.lastFlushAt = this.clock();
    const generation = this.generation;
    const ops = this.pending.splice(0, MAX_OPS);
    const initial = this.carried === null;
    this.needInit = false;
    try {
      const result = await runDesRemote(this.components, this.wires, this.carried, ops);
      if (generation !== this.generation) return; // the circuit was replaced while this request was in flight
      this.apply(result, initial);
    } catch (error) {
      if (generation !== this.generation) return;
      this.pending = [];
      this.options.onError?.(error instanceof Error ? error.message : 'Simulation engine error');
    }
    if (generation !== this.generation) return;
    this.inFlight = false;
    if (this.pending.length > 0) await this.flush();
    else this.waiters.splice(0).forEach(resolve => resolve());
    this.listeners.forEach(listener => listener());
  }

  private apply(result: DesResult, _initial: boolean): void {
    this.carried = result.state;
    this.wireLevels = result.wires;
    this.pinLevels = result.pins;
    const s = result.snapshot;
    this.view = { ...emptySnapshot(), ...s, time: this.simTime };
    result.events.forEach(([wireId, value, atNs]) => this.wireListeners.get(wireId)?.forEach(listener => listener(value, atNs)));
  }
}
