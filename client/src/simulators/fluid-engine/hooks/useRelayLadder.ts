import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_LADDER_STATE, idleLadder, stepLadder, tagKey,
  type LadderCircuit, type LadderInputs, type LadderResult, type LadderState,
} from '../models/relayLadder';

export interface RelayLadderOptions {
  circuit: LadderCircuit;
  /** The fluid simulation has been started (running or paused): the relays scan. Otherwise every relay is released. */
  live: boolean;
  /** Simulated time of the fluid engine; timers count the time that passes between two values. */
  time: number;
  /** Limit-switch signals of the schematic by lower-cased tag (see `sensorSignals`). */
  sensors: Record<string, boolean>;
}

export interface RelayLadder {
  result: LadderResult;
  /** Pushbuttons operated (held or latched), by lower-cased tag. */
  pressed: Record<string, boolean>;
  /** The latched share of `pressed`, by lower-cased tag. */
  latched: Record<string, boolean>;
  /** Sensors forced on by hand, by lower-cased tag. */
  forced: Record<string, boolean>;
  /** Pushes a momentary pushbutton in; it releases with the next mouse / touch release. A detented one toggles instead. */
  operate: (tag: string, detent: boolean) => void;
  release: () => void;
  forceSensor: (tag: string, on: boolean) => void;
  /** Releases every pushbutton and clears forced signals (the relays release with the simulation). */
  clearInputs: () => void;
}

/**
 * Runs the relay ladder alongside the fluid engine: each time the engine publishes a new snapshot the ladder advances by the
 * simulated time that passed, with the engine's limit switches and the operator's pushbuttons as its inputs.
 * Solenoid outputs are in `result.solenoids`; the owner feeds them back into the engine.
 */
export function useRelayLadder({ circuit, live, time, sensors }: RelayLadderOptions): RelayLadder {
  const [held, setHeld] = useState<Record<string, boolean>>({});
  const [latched, setLatched] = useState<Record<string, boolean>>({});
  const [forced, setForced] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<LadderResult>(() => idleLadder(circuit));
  const state = useRef<LadderState>(EMPTY_LADDER_STATE);
  const lastTime = useRef(time);

  const pressed = useMemo(() => {
    const merged: Record<string, boolean> = { ...held };
    for (const [key, on] of Object.entries(latched)) if (on) merged[key] = true;
    return merged;
  }, [held, latched]);

  // The caller may rebuild `sensors` on every render; only a change of its content may re-run the scan.
  const sensorSignature = JSON.stringify(sensors);
  const stableSensors = useMemo(() => sensors, [sensorSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs = useMemo<LadderInputs>(() => {
    const merged = { ...stableSensors };
    for (const [key, on] of Object.entries(forced)) if (on) merged[key] = true;
    return { sensors: merged, pressed };
  }, [stableSensors, forced, pressed]);

  useEffect(() => {
    if (!live) {
      state.current = EMPTY_LADDER_STATE;
      lastTime.current = time;
      setResult(idleLadder(circuit));
      return;
    }
    // A reset rewinds the engine clock; a negative step would un-count the timers.
    const dt = Math.max(0, time - lastTime.current);
    lastTime.current = time;
    const next = stepLadder(circuit, inputs, state.current, dt);
    state.current = next.state;
    setResult(next);
  }, [circuit, live, time, inputs]);

  const operate = useCallback((tag: string, detent: boolean) => {
    const key = tagKey(tag);
    if (detent) setLatched(previous => ({ ...previous, [key]: !previous[key] }));
    else setHeld(previous => ({ ...previous, [key]: true }));
  }, []);
  const release = useCallback(() => setHeld(previous => (Object.keys(previous).length === 0 ? previous : {})), []);
  const forceSensor = useCallback((tag: string, on: boolean) => setForced(previous => ({ ...previous, [tagKey(tag)]: on })), []);
  const clearInputs = useCallback(() => { setHeld({}); setLatched({}); setForced({}); }, []);

  useEffect(() => {
    const events = ['mouseup', 'touchend', 'touchcancel', 'blur'] as const;
    events.forEach(name => window.addEventListener(name, release));
    return () => events.forEach(name => window.removeEventListener(name, release));
  }, [release]);

  return { result, pressed, latched, forced, operate, release, forceSensor, clearInputs };
}
