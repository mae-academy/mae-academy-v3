import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import { useHistory } from '@/simulators/circuit-engine/components/hooks/useHistory';
import type {
  SchematicComponent,
  SchematicDocument,
  SchematicSelection,
  SchematicText,
  SchematicWire,
} from '@/components/common/schematic/schematicTypes';

export function areDocumentsEqual<C extends SchematicComponent>(a: SchematicDocument<C>, b: SchematicDocument<C>): boolean {
  if (a === b) return true;
  if (a.components.length !== b.components.length || a.wires.length !== b.wires.length || a.texts.length !== b.texts.length) return false;
  for (let i = 0; i < a.components.length; i++) {
    const ca = a.components[i];
    const cb = b.components[i];
    if (ca.id !== cb.id || ca.type !== cb.type || ca.x !== cb.x || ca.y !== cb.y || ca.rotation !== cb.rotation
      || ca.flipH !== cb.flipH || ca.flipV !== cb.flipV || ca.label !== cb.label
      || JSON.stringify(ca.props) !== JSON.stringify(cb.props)) return false;
  }
  for (let i = 0; i < a.wires.length; i++) {
    const wa = a.wires[i];
    const wb = b.wires[i];
    if (wa.id !== wb.id || wa.fromComp !== wb.fromComp || wa.fromTerm !== wb.fromTerm || wa.toComp !== wb.toComp
      || wa.toTerm !== wb.toTerm || wa.routing !== wb.routing || JSON.stringify(wa.path) !== JSON.stringify(wb.path)) return false;
  }
  for (let i = 0; i < a.texts.length; i++) {
    const ta = a.texts[i];
    const tb = b.texts[i];
    if (ta.id !== tb.id || ta.x !== tb.x || ta.y !== tb.y || ta.text !== tb.text || ta.fontSize !== tb.fontSize
      || ta.color !== tb.color || ta.rotation !== tb.rotation) return false;
  }
  return true;
}

export function cloneDocument<C extends SchematicComponent>(document: SchematicDocument<C>): SchematicDocument<C> {
  return {
    components: document.components.map(component => ({ ...component, props: { ...component.props } })),
    wires: document.wires.map(wire => ({
      ...wire,
      path: wire.path.map(point => [point[0], point[1]] as [number, number]),
      waypoints: wire.waypoints?.map(point => [point[0], point[1]] as [number, number]),
    })),
    texts: document.texts.map(text => ({ ...text })),
  };
}

export interface SchematicDocumentState<C extends SchematicComponent> {
  components: C[];
  wires: SchematicWire[];
  texts: SchematicText[];
  setComponents: React.Dispatch<React.SetStateAction<C[]>>;
  setWires: React.Dispatch<React.SetStateAction<SchematicWire[]>>;
  setTexts: React.Dispatch<React.SetStateAction<SchematicText[]>>;
  /** Always-current mirrors for event handlers that outlive a render. */
  componentsRef: React.MutableRefObject<C[]>;
  wiresRef: React.MutableRefObject<SchematicWire[]>;
  textsRef: React.MutableRefObject<SchematicText[]>;
  selection: SchematicSelection;
  setSelection: React.Dispatch<React.SetStateAction<SchematicSelection>>;
  marqueeIds: string[];
  setMarqueeIds: React.Dispatch<React.SetStateAction<string[]>>;
  /** Pushes the (patched) current document onto the undo stack. */
  commit: (patch?: Partial<SchematicDocument<C>>) => void;
  /** Replaces the whole document; one undoable step unless `resetHistory` starts a fresh stack. */
  replaceDocument: (document: SchematicDocument<C>, options?: { resetHistory?: boolean }) => void;
  snapshot: () => SchematicDocument<C>;
  undo: () => SchematicDocument<C> | undefined;
  redo: () => SchematicDocument<C> | undefined;
  canUndo: boolean;
  canRedo: boolean;
}

export function useSchematicDocument<C extends SchematicComponent>(): SchematicDocumentState<C> {
  const [components, setComponents] = useState<C[]>([]);
  const [wires, setWires] = useState<SchematicWire[]>([]);
  const [texts, setTexts] = useState<SchematicText[]>([]);
  const [selection, setSelection] = useState<SchematicSelection>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const componentsRef = useRef(components);
  const wiresRef = useRef(wires);
  const textsRef = useRef(texts);
  componentsRef.current = components;
  wiresRef.current = wires;
  textsRef.current = texts;

  const history = useHistory<SchematicDocument<C>>(() => ({ components: [], wires: [], texts: [] }), { areEqual: areDocumentsEqual });

  const snapshot = useCallback((): SchematicDocument<C> => ({
    components: componentsRef.current,
    wires: wiresRef.current,
    texts: textsRef.current,
  }), []);

  const commit = useCallback((patch?: Partial<SchematicDocument<C>>) => {
    history.set(cloneDocument({ ...snapshot(), ...patch }));
  }, [history, snapshot]);

  const apply = useCallback((document: SchematicDocument<C>) => {
    componentsRef.current = document.components;
    wiresRef.current = document.wires;
    textsRef.current = document.texts;
    setComponents(document.components);
    setWires(document.wires);
    setTexts(document.texts);
    setSelection(null);
    setMarqueeIds([]);
  }, []);

  const replaceDocument = useCallback((document: SchematicDocument<C>, options?: { resetHistory?: boolean }) => {
    apply(document);
    if (options?.resetHistory) history.reset(cloneDocument(document));
    else history.set(cloneDocument(document));
  }, [apply, history]);

  const undo = useCallback(() => {
    if (!history.canUndo) return undefined;
    const previous = history.undo();
    if (previous) apply(previous);
    return previous;
  }, [apply, history]);

  const redo = useCallback(() => {
    if (!history.canRedo) return undefined;
    const next = history.redo();
    if (next) apply(next);
    return next;
  }, [apply, history]);

  return {
    components,
    wires,
    texts,
    setComponents,
    setWires,
    setTexts,
    componentsRef,
    wiresRef,
    textsRef,
    selection,
    setSelection,
    marqueeIds,
    setMarqueeIds,
    commit,
    replaceDocument,
    snapshot,
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  };
}
