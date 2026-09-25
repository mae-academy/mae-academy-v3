import { useCallback, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { JUNCTION_PREFIX, isJunctionId, snapToGrid } from '@/components/common/schematic/schematicGeometry';
import type { SchematicDocumentState } from '@/components/common/schematic/useSchematicDocument';
import type {
  SchematicComponent,
  SchematicComponentLibrary,
  SchematicDocument,
  SchematicPoint,
  SchematicWire,
} from '@/components/common/schematic/schematicTypes';

export function defaultCloneForPaste<C extends SchematicComponent>(source: C, id: string, label: string, x: number, y: number): C {
  return { ...source, id, label, x, y, props: structuredClone(source.props) };
}

/** Collects the explicit multi-selection, or the single selected component. */
export function collectSelection<C extends SchematicComponent>(
  document: SchematicDocument<C>,
  selectedComponentId: string | null,
  marqueeIds: string[],
): SchematicDocument<C> {
  if (marqueeIds.length > 0) {
    const ids = new Set(marqueeIds);
    return {
      components: document.components.filter(c => ids.has(c.id)),
      wires: document.wires.filter(w => ids.has(w.id) || (ids.has(w.fromComp) && ids.has(w.toComp))),
      texts: document.texts.filter(t => ids.has(t.id)),
    };
  }
  const component = selectedComponentId ? document.components.find(c => c.id === selectedComponentId) : undefined;
  return { components: component ? [component] : [], wires: [], texts: [] };
}

/** Re-ids a clipboard payload and translates it by (dx, dy); internal wires and junctions are remapped. */
export function instantiateClipboard<C extends SchematicComponent>(
  clipboard: SchematicDocument<C>,
  existing: C[],
  dx: number,
  dy: number,
  library: Pick<SchematicComponentLibrary<C>, 'nextLabel' | 'cloneForPaste'>,
): SchematicDocument<C> {
  const clone = library.cloneForPaste ?? defaultCloneForPaste;
  const idMap = new Map<string, string>();
  const labelPool = [...existing];
  const components = clipboard.components.map(source => {
    const id = nanoid(10);
    idMap.set(source.id, id);
    const pasted = clone(source, id, library.nextLabel(source.type, labelPool), source.x + dx, source.y + dy);
    labelPool.push(pasted);
    return pasted;
  });
  for (const wire of clipboard.wires) {
    for (const endpoint of [wire.fromComp, wire.toComp]) {
      if (isJunctionId(endpoint) && !idMap.has(endpoint)) idMap.set(endpoint, `${JUNCTION_PREFIX}${nanoid(10)}`);
    }
  }
  const shift = (point: SchematicPoint): SchematicPoint => [point[0] + dx, point[1] + dy];
  const wires: SchematicWire[] = clipboard.wires.map(wire => ({
    ...wire,
    id: nanoid(10),
    fromComp: idMap.get(wire.fromComp) ?? wire.fromComp,
    toComp: idMap.get(wire.toComp) ?? wire.toComp,
    path: wire.path.map(shift),
    waypoints: wire.waypoints?.map(shift),
    junctionPoint: wire.junctionPoint ? shift(wire.junctionPoint) : undefined,
  }));
  const texts = clipboard.texts.map(text => ({ ...text, id: nanoid(10), x: text.x + dx, y: text.y + dy }));
  return { components, wires, texts };
}

/** Removes the selection; deleting a component also drops every wire attached to it. */
export function removeFromDocument<C extends SchematicComponent>(document: SchematicDocument<C>, ids: ReadonlySet<string>): SchematicDocument<C> {
  return {
    components: document.components.filter(c => !ids.has(c.id)),
    wires: document.wires.filter(w => !ids.has(w.id) && !ids.has(w.fromComp) && !ids.has(w.toComp) && !(w.junctionWireId && ids.has(w.junctionWireId))),
    texts: document.texts.filter(t => !ids.has(t.id)),
  };
}

export interface SchematicClipboard<C extends SchematicComponent> {
  clipboard: SchematicDocument<C> | null;
  hasClipboard: boolean;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  removeSelection: () => void;
}

export function useSchematicClipboard<C extends SchematicComponent>(
  document: SchematicDocumentState<C>,
  library: SchematicComponentLibrary<C>,
  viewportCenter: () => SchematicPoint,
  gridSize: number,
  snapEnabled: boolean,
): SchematicClipboard<C> {
  const [clipboard, setClipboard] = useState<SchematicDocument<C> | null>(null);
  const { selection, marqueeIds, setComponents, setWires, setTexts, setSelection, setMarqueeIds, commit, snapshot } = document;

  const removeSelection = useCallback(() => {
    const ids = new Set(marqueeIds.length > 0 ? marqueeIds : selection ? [selection.id] : []);
    if (ids.size === 0) return;
    const next = removeFromDocument(snapshot(), ids);
    setComponents(next.components);
    setWires(next.wires);
    setTexts(next.texts);
    commit(next);
    setSelection(null);
    setMarqueeIds([]);
  }, [commit, marqueeIds, selection, setComponents, setMarqueeIds, setSelection, setTexts, setWires, snapshot]);

  const copy = useCallback(() => {
    const payload = collectSelection(snapshot(), selection?.kind === 'component' ? selection.id : null, marqueeIds);
    const count = payload.components.length + payload.wires.length + payload.texts.length;
    if (count === 0) return;
    setClipboard(structuredClone(payload));
    toast.success(count === 1 && payload.components.length === 1 ? `${payload.components[0].label} copied` : `${count} items copied`);
  }, [marqueeIds, selection, snapshot]);

  const cut = useCallback(() => {
    copy();
    removeSelection();
  }, [copy, removeSelection]);

  const paste = useCallback(() => {
    if (!clipboard || clipboard.components.length + clipboard.wires.length + clipboard.texts.length === 0) return;
    const blocked = library.validatePaste?.(clipboard.components);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    const anchors = [...clipboard.components, ...clipboard.texts];
    const minX = anchors.length ? Math.min(...anchors.map(item => item.x)) : 0;
    const minY = anchors.length ? Math.min(...anchors.map(item => item.y)) : 0;
    const center = viewportCenter();
    const targetX = snapEnabled ? snapToGrid(center[0] + gridSize * 2, gridSize) : center[0] + gridSize * 2;
    const targetY = snapEnabled ? snapToGrid(center[1] + gridSize * 2, gridSize) : center[1] + gridSize * 2;
    const current = snapshot();
    const pasted = instantiateClipboard(clipboard, current.components, targetX - minX, targetY - minY, library);
    const next: SchematicDocument<C> = {
      components: [...current.components, ...pasted.components],
      wires: [...current.wires, ...pasted.wires],
      texts: [...current.texts, ...pasted.texts],
    };
    setComponents(next.components);
    setWires(next.wires);
    setTexts(next.texts);
    commit(next);
    const newIds = [...pasted.components.map(c => c.id), ...pasted.texts.map(t => t.id), ...pasted.wires.map(w => w.id)];
    if (newIds.length === 1 && pasted.components.length === 1) {
      setSelection({ kind: 'component', id: pasted.components[0].id });
      setMarqueeIds([]);
    } else {
      setSelection(null);
      setMarqueeIds(newIds);
    }
    toast.success(`${newIds.length} items pasted`);
  }, [clipboard, commit, gridSize, library, setComponents, setMarqueeIds, setSelection, setTexts, setWires, snapEnabled, snapshot, viewportCenter]);

  return {
    clipboard,
    hasClipboard: Boolean(clipboard && clipboard.components.length + clipboard.wires.length + clipboard.texts.length > 0),
    copy,
    cut,
    paste,
    removeSelection,
  };
}
