import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineComponent,
  type EngineMedium,
  type EngineNetwork,
  type EngineSnapshot,
  type EngineWire,
  type ManualInput,
  type OperatorSide,
} from '@shared/fluid/engine/types';

/** IDLE: nothing has run since the last reset. PAUSED: stopped mid-simulation, state kept. */
export type SimulationStatus = 'IDLE' | 'RUNNING' | 'PAUSED';

export interface FluidEngineBridgeOptions {
  medium: EngineMedium;
  /** Simulated seconds per real second. */
  speed: number;
}

export interface FluidEngineBridge {
  snapshot: EngineSnapshot;
  status: SimulationStatus;
  /** Operators currently pressed or latched, for indicator lamps. */
  manualInputs: Record<string, ManualInput>;
  run: () => void;
  pause: () => void;
  /** Advances exactly one engine tick and leaves the simulation paused. */
  step: () => void;
  /** Returns every component to its initial state and releases all inputs. */
  reset: () => void;
  triggerManualInput: (componentId: string, actuatorSide: OperatorSide, active: boolean) => void;
}

/** One engine tick in seconds. */
export const ENGINE_TICK = DEFAULT_ENGINE_CONFIG.dt;
/** Upper bound on catch-up work per animation frame; a longer backlog (hidden tab, slow frame) is dropped. */
const MAX_TICKS_PER_FRAME = 12;
const MAX_FRAME_SECONDS = 0.1;
/** The clock readout is refreshed at this resolution even when nothing on the canvas changes. */
const CLOCK_RESOLUTION = 0.1;

const EMPTY_NETWORK: EngineNetwork = { components: [], wires: [] };
const EMPTY_SNAPSHOT = new FluidEngine(EMPTY_NETWORK).getSnapshot();

function sameRecord<T>(a: Record<string, T>, b: Record<string, T>, same: (x: T, y: T) => boolean): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!(key in b) || !same(a[key], b[key])) return false;
  }
  return true;
}

/** Whether two snapshots would draw differently (ignoring sub-resolution clock changes). */
export function snapshotChanged(a: EngineSnapshot, b: EngineSnapshot): boolean {
  if (a === b) return false;
  if (Math.floor(a.time / CLOCK_RESOLUTION) !== Math.floor(b.time / CLOCK_RESOLUTION)) return true;
  return a.medium !== b.medium
    || !sameRecord(a.portPressure, b.portPressure, (x, y) => x === y)
    || !sameRecord(a.valves, b.valves, (x, y) => x.envelope === y.envelope && x.latched === y.latched)
    || !sameRecord(a.cylinders, b.cylinders, (x, y) => x.stroke === y.stroke && x.velocity === y.velocity)
    || !sameRecord(a.logic, b.logic, (x, y) => x.offset === y.offset)
    || !sameRecord(a.motors, b.motors, (x, y) => x.rpm === y.rpm && x.angle === y.angle)
    || !sameRecord(a.reliefValves, b.reliefValves, (x, y) => x.open === y.open)
    || a.diagnostics.length !== b.diagnostics.length
    || a.diagnostics.some((diagnostic, index) => diagnostic.code !== b.diagnostics[index].code || diagnostic.componentId !== b.diagnostics[index].componentId)
    || !sameRecord(a.sensors, b.sensors, (x, y) => x === y);
}

/**
 * Owns the headless FluidEngine for one canvas: keeps it in sync with the schematic, drives it from
 * requestAnimationFrame in fixed ticks while running, and publishes its snapshot to React only when
 * something visible changed.
 */
export function useFluidEngineBridge(components: EngineComponent[], wires: EngineWire[], { medium, speed }: FluidEngineBridgeOptions): FluidEngineBridge {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<SimulationStatus>('IDLE');
  const [manualInputs, setManualInputs] = useState<Record<string, ManualInput>>({});

  const holder = useRef<{ medium: EngineMedium; engine: FluidEngine } | null>(null);
  const statusRef = useRef<SimulationStatus>('IDLE');
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const published = useRef<EngineSnapshot>(EMPTY_SNAPSHOT);

  /** The engine for the current medium; a medium switch starts a fresh one. */
  const getEngine = useCallback((): FluidEngine => {
    if (!holder.current || holder.current.medium !== medium) holder.current = { medium, engine: new FluidEngine(EMPTY_NETWORK, { medium }) };
    return holder.current.engine;
  }, [medium]);

  const changeStatus = useCallback((next: SimulationStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const publish = useCallback((next: EngineSnapshot, force = false) => {
    if (!force && !snapshotChanged(published.current, next)) return;
    published.current = next;
    setSnapshot(next);
  }, []);

  /* Only what the engine reads: dragging a part around must not rebuild the network. */
  const network = useMemo<EngineNetwork>(() => ({
    components: components.map(({ id, type, props }) => ({ id, type, props })),
    wires: wires.map(({ id, fromComp, fromTerm, toComp, toTerm }) => ({ id, fromComp, fromTerm, toComp, toTerm })),
  }), [components, wires]);
  const signature = useMemo(() => JSON.stringify(network), [network]);
  const networkRef = useRef(network);
  networkRef.current = network;

  useEffect(() => {
    changeStatus('IDLE');
    setManualInputs({});
  }, [medium, changeStatus]);

  useEffect(() => {
    const engine = getEngine();
    engine.setNetwork(networkRef.current);
    // Before the first run an edit (e.g. a valve's initial state) takes effect immediately.
    if (statusRef.current === 'IDLE') engine.reset();
    publish(engine.getSnapshot(), true);
  }, [signature, getEngine, publish]);

  useEffect(() => {
    if (status !== 'RUNNING') return undefined;
    let frame = 0;
    let last = performance.now();
    let backlog = 0;
    const loop = (now: number) => {
      const engine = getEngine();
      backlog += Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000)) * speedRef.current;
      last = now;
      let ticks = 0;
      while (backlog >= ENGINE_TICK && ticks < MAX_TICKS_PER_FRAME) {
        engine.step(ENGINE_TICK);
        backlog -= ENGINE_TICK;
        ticks += 1;
      }
      if (ticks === MAX_TICKS_PER_FRAME) backlog = 0;
      if (ticks > 0) publish(engine.getSnapshot());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [status, getEngine, publish]);

  const run = useCallback(() => changeStatus('RUNNING'), [changeStatus]);
  const pause = useCallback(() => {
    if (statusRef.current !== 'RUNNING') return;
    changeStatus('PAUSED');
    // The loop only publishes visible changes; show the exact state the engine stopped in.
    publish(getEngine().getSnapshot(), true);
  }, [changeStatus, getEngine, publish]);
  const step = useCallback(() => {
    publish(getEngine().step(ENGINE_TICK), true);
    changeStatus('PAUSED');
  }, [changeStatus, getEngine, publish]);
  const reset = useCallback(() => {
    const engine = getEngine();
    engine.reset();
    setManualInputs({});
    changeStatus('IDLE');
    publish(engine.getSnapshot(), true);
  }, [changeStatus, getEngine, publish]);

  const triggerManualInput = useCallback((componentId: string, actuatorSide: OperatorSide, active: boolean) => {
    getEngine().setManual(componentId, actuatorSide, active);
    setManualInputs(previous => ({ ...previous, [componentId]: { ...(previous[componentId] ?? { left: false, right: false }), [actuatorSide]: active } }));
  }, [getEngine]);

  return { snapshot, status, manualInputs, run, pause, step, reset, triggerManualInput };
}
