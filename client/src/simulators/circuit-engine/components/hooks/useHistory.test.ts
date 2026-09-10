// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory, areSnapshotsEqual, type CanvasSnapshot } from './useHistory';
import type { CircuitComponent, CircuitWire, WorkspaceText } from '@/simulators/circuit-engine/models/circuitTypes';

describe('useHistory', () => {
  it('captures initial base state immediately on mount and history is never empty', () => {
    const initial: CanvasSnapshot = {
      components: [],
      wires: [],
      texts: [],
    };

    const { result } = renderHook(() => useHistory<CanvasSnapshot>(initial));

    expect(result.current.present).toEqual(initial);
    expect(result.current.past).toEqual([]);
    expect(result.current.future).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('safely handles undo() when past is empty without throwing errors', () => {
    const initial = { count: 0 };
    const { result } = renderHook(() => useHistory(initial));

    let undone: { count: number } | undefined;
    expect(() => {
      act(() => {
        undone = result.current.undo();
      });
    }).not.toThrow();

    expect(undone).toBeUndefined();
    expect(result.current.present).toEqual({ count: 0 });
    expect(result.current.past).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  it('safely handles redo() when future is empty without throwing errors', () => {
    const initial = { count: 0 };
    const { result } = renderHook(() => useHistory(initial));

    let redone: { count: number } | undefined;
    expect(() => {
      act(() => {
        redone = result.current.redo();
      });
    }).not.toThrow();

    expect(redone).toBeUndefined();
    expect(result.current.present).toEqual({ count: 0 });
    expect(result.current.future).toHaveLength(0);
    expect(result.current.canRedo).toBe(false);
  });

  it('correctly pushes new state, tracks past, and clears future', () => {
    const { result } = renderHook(() => useHistory({ step: 1 }));

    act(() => {
      result.current.set({ step: 2 });
    });

    expect(result.current.present).toEqual({ step: 2 });
    expect(result.current.past).toEqual([{ step: 1 }]);
    expect(result.current.future).toEqual([]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Perform undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.present).toEqual({ step: 1 });
    expect(result.current.past).toEqual([]);
    expect(result.current.future).toEqual([{ step: 2 }]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Perform redo
    act(() => {
      result.current.redo();
    });

    expect(result.current.present).toEqual({ step: 2 });
    expect(result.current.past).toEqual([{ step: 1 }]);
    expect(result.current.future).toEqual([]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('prevents duplicate states from being pushed', () => {
    const initial: CanvasSnapshot = {
      components: [
        { id: 'r1', type: 'resistor', x: 100, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 1000 } },
      ],
      wires: [],
      texts: [],
    };

    const { result } = renderHook(() =>
      useHistory<CanvasSnapshot>(initial, { areEqual: areSnapshotsEqual }),
    );

    // Attempt to push identical snapshot
    act(() => {
      result.current.set({
        components: [
          { id: 'r1', type: 'resistor', x: 100, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 1000 } },
        ],
        wires: [],
        texts: [],
      });
    });

    expect(result.current.past).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  it('resets history with new base state when opening/importing schematic', () => {
    const { result } = renderHook(() => useHistory({ name: 'initial' }));

    act(() => {
      result.current.set({ name: 'modified' });
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.reset({ name: 'imported-schematic' });
    });

    expect(result.current.present).toEqual({ name: 'imported-schematic' });
    expect(result.current.past).toEqual([]);
    expect(result.current.future).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
