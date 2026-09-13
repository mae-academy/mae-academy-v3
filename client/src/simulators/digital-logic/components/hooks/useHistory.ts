import { useState, useCallback, useRef } from 'react';
import type { CircuitComponent, CircuitWire, WorkspaceText } from '@/simulators/digital-logic/models/circuitTypes';
import type { Point } from '@/simulators/digital-logic/models/wiring';

export interface CanvasSnapshot {
  components: CircuitComponent[];
  wires: CircuitWire[];
  texts: WorkspaceText[];
}

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface UseHistoryOptions<T> {
  maxHistory?: number;
  areEqual?: (a: T, b: T) => boolean;
}

export interface UseHistoryReturn<T> {
  present: T;
  past: T[];
  future: T[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => T | undefined;
  redo: () => T | undefined;
  set: (nextState: T | ((current: T) => T)) => void;
  reset: (baseState: T) => void;
}

export function areSnapshotsEqual(a: CanvasSnapshot, b: CanvasSnapshot): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.components.length !== b.components.length ||
    a.wires.length !== b.wires.length ||
    a.texts.length !== b.texts.length
  ) {
    return false;
  }

  for (let i = 0; i < a.components.length; i++) {
    const ca = a.components[i];
    const cb = b.components[i];
    if (
      ca.id !== cb.id ||
      ca.type !== cb.type ||
      ca.x !== cb.x ||
      ca.y !== cb.y ||
      ca.rotation !== cb.rotation ||
      ca.flipH !== cb.flipH ||
      ca.flipV !== cb.flipV ||
      ca.label !== cb.label ||
      JSON.stringify(ca.props) !== JSON.stringify(cb.props)
    ) {
      return false;
    }
  }

  for (let i = 0; i < a.wires.length; i++) {
    const wa = a.wires[i];
    const wb = b.wires[i];
    if (
      wa.id !== wb.id ||
      wa.fromComp !== wb.fromComp ||
      wa.fromTerm !== wb.fromTerm ||
      wa.toComp !== wb.toComp ||
      wa.toTerm !== wb.toTerm ||
      wa.routing !== wb.routing ||
      JSON.stringify(wa.path) !== JSON.stringify(wb.path)
    ) {
      return false;
    }
  }

  for (let i = 0; i < a.texts.length; i++) {
    const ta = a.texts[i];
    const tb = b.texts[i];
    if (
      ta.id !== tb.id ||
      ta.x !== tb.x ||
      ta.y !== tb.y ||
      ta.text !== tb.text ||
      ta.fontSize !== tb.fontSize ||
      ta.color !== tb.color ||
      ta.rotation !== tb.rotation
    ) {
      return false;
    }
  }

  return true;
}

export function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return {
    components: snapshot.components.map(c => ({
      ...c,
      props: { ...c.props },
    })),
    wires: snapshot.wires.map(w => ({
      ...w,
      path: w.path.map(p => [p[0], p[1]] as Point),
      waypoints: w.waypoints ? w.waypoints.map(p => [p[0], p[1]] as Point) : undefined,
    })),
    texts: snapshot.texts.map(t => ({ ...t })),
  };
}

const defaultAreEqual = <T>(a: T, b: T): boolean => a === b;

export function useHistory<T>(
  initialState: T | (() => T),
  options: UseHistoryOptions<T> = {},
): UseHistoryReturn<T> {
  const { maxHistory = 50, areEqual = defaultAreEqual } = options;

  const [history, setHistory] = useState<HistoryState<T>>(() => {
    const base = typeof initialState === 'function' ? (initialState as () => T)() : initialState;
    return {
      past: [],
      present: base,
      future: [],
    };
  });

  const historyRef = useRef(history);
  historyRef.current = history;

  const areEqualRef = useRef(areEqual);
  areEqualRef.current = areEqual;

  const maxHistoryRef = useRef(maxHistory);
  maxHistoryRef.current = maxHistory;

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const undo = useCallback((): T | undefined => {
    const current = historyRef.current;
    if (!current || !Array.isArray(current.past) || current.past.length === 0) {
      return undefined;
    }

    const previous = current.past[current.past.length - 1];
    const newPast = current.past.slice(0, -1);

    setHistory({
      past: newPast,
      present: previous,
      future: [current.present, ...(current.future || [])],
    });

    return previous;
  }, []);

  const redo = useCallback((): T | undefined => {
    const current = historyRef.current;
    if (!current || !Array.isArray(current.future) || current.future.length === 0) {
      return undefined;
    }

    const next = current.future[0];
    const newFuture = current.future.slice(1);

    setHistory({
      past: [...(current.past || []), current.present],
      present: next,
      future: newFuture,
    });

    return next;
  }, []);

  const set = useCallback((nextState: T | ((current: T) => T)) => {
    setHistory(current => {
      const next = typeof nextState === 'function' ? (nextState as (c: T) => T)(current.present) : nextState;

      if (areEqualRef.current(current.present, next)) {
        return current;
      }

      const updatedPast = [...(current.past || []), current.present];
      if (updatedPast.length > maxHistoryRef.current) {
        updatedPast.splice(0, updatedPast.length - maxHistoryRef.current);
      }

      return {
        past: updatedPast,
        present: next,
        future: [],
      };
    });
  }, []);

  const reset = useCallback((baseState: T) => {
    setHistory({
      past: [],
      present: baseState,
      future: [],
    });
  }, []);

  return {
    present: history.present,
    past: history.past,
    future: history.future,
    canUndo,
    canRedo,
    undo,
    redo,
    set,
    reset,
  };
}
