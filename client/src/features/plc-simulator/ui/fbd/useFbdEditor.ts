import { useCallback, useMemo, useRef, useState } from 'react';
import {
  addBlock,
  connect,
  moveBlock,
  nextId,
  removeBlock,
  removeLink,
  updateBlock,
  type BlockId,
  type FbdBlock,
  type FbdGraph,
  type FbdKind,
  type LinkId,
} from './model';

export interface FbdSelection {
  readonly blockId: BlockId | null;
  readonly linkId: LinkId | null;
}

const NONE: FbdSelection = { blockId: null, linkId: null };
const HISTORY_LIMIT = 100;

export interface FbdEditor {
  readonly graph: FbdGraph;
  readonly selection: FbdSelection;
  /** Palette entry waiting for a click on the canvas. */
  readonly armed: FbdKind | null;
  readonly notice: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly actions: {
    arm(kind: FbdKind | null): void;
    place(kind: FbdKind, x: number, y: number): void;
    /** Live drag: only the first call of a gesture is recorded for undo. */
    moveTo(id: BlockId, x: number, y: number): void;
    endMove(): void;
    link(from: BlockId, to: BlockId, pin: number): void;
    select(selection: FbdSelection): void;
    patch(id: BlockId, patch: Partial<Pick<FbdBlock, 'index' | 'preset'>>): void;
    deleteSelection(): void;
    load(graph: FbdGraph): void;
    undo(): void;
    redo(): void;
    dismissNotice(): void;
  };
}

interface History {
  readonly present: FbdGraph;
  readonly past: readonly FbdGraph[];
  readonly future: readonly FbdGraph[];
}

/** Diagram state with undo / redo. Every edit is a pure function of `model.ts`, so it stays testable. */
export function useFbdEditor(initial: FbdGraph): FbdEditor {
  const [history, setHistory] = useState<History>({ present: initial, past: [], future: [] });
  const [selection, setSelection] = useState<FbdSelection>(NONE);
  const [armed, setArmed] = useState<FbdKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const moving = useRef(false);

  const commit = useCallback((next: FbdGraph): void => {
    setHistory((h) => (next === h.present ? h : { present: next, past: [...h.past, h.present].slice(-HISTORY_LIMIT), future: [] }));
  }, []);

  const graphRef = useRef(history.present);
  graphRef.current = history.present;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const actions = useMemo<FbdEditor['actions']>(
    () => ({
      arm: setArmed,
      place(kind, x, y) {
        const id = nextId(graphRef.current, 'b');
        commit(addBlock(graphRef.current, kind, x, y, id));
        setSelection({ blockId: id, linkId: null });
        setArmed(null);
        setNotice(null);
      },
      moveTo(id, x, y) {
        const next = moveBlock(graphRef.current, id, x, y);
        if (!moving.current) {
          moving.current = true;
          commit(next);
        } else {
          setHistory((h) => ({ ...h, present: next }));
        }
      },
      endMove() {
        moving.current = false;
      },
      link(from, to, pin) {
        const result = connect(graphRef.current, from, to, pin, nextId(graphRef.current, 'l'));
        if (result.ok) {
          commit(result.graph);
          setNotice(null);
        } else setNotice(result.reason);
      },
      select: setSelection,
      patch: (id, patch) => commit(updateBlock(graphRef.current, id, patch)),
      deleteSelection() {
        const current = selectionRef.current;
        if (current.blockId !== null) commit(removeBlock(graphRef.current, current.blockId));
        else if (current.linkId !== null) commit(removeLink(graphRef.current, current.linkId));
        setSelection(NONE);
      },
      load(graph) {
        commit(graph);
        setSelection(NONE);
        setArmed(null);
      },
      undo() {
        setHistory((h) => {
          const previous = h.past.at(-1);
          return previous === undefined ? h : { present: previous, past: h.past.slice(0, -1), future: [h.present, ...h.future] };
        });
        setSelection(NONE);
      },
      redo() {
        setHistory((h) => {
          const [next, ...rest] = h.future;
          return next === undefined ? h : { present: next, past: [...h.past, h.present], future: rest };
        });
        setSelection(NONE);
      },
      dismissNotice: () => setNotice(null),
    }),
    [commit],
  );

  return {
    graph: history.present,
    selection,
    armed,
    notice,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    actions,
  };
}
