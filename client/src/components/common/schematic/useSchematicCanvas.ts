import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { TERMINAL_HIT_RADIUS } from '@/simulators/shared/workspace/workspaceCanvasMechanics';
import {
  defaultContentBounds,
  isNearTerminal,
  refreshWireEndpoints,
  resolveWireEndpoints,
  routePath,
  snapPointToGrid,
  terminalAxis,
} from '@/components/common/schematic/schematicGeometry';
import { cloneDocument, areDocumentsEqual, useSchematicDocument, type SchematicDocumentState } from '@/components/common/schematic/useSchematicDocument';
import { useSchematicViewport, type SchematicViewport } from '@/components/common/schematic/useSchematicViewport';
import { useWireRouting, type WireRouting } from '@/components/common/schematic/useWireRouting';
import { useSchematicClipboard, type SchematicClipboard } from '@/components/common/schematic/useSchematicClipboard';
import { useSchematicShortcuts, type SchematicShortcutAction } from '@/components/common/schematic/useSchematicShortcuts';
import type {
  SchematicBounds,
  SchematicComponent,
  SchematicComponentLibrary,
  SchematicDocument,
  SchematicDragState,
  SchematicGridMode,
  SchematicPoint,
  SchematicText,
  SchematicWire,
  SchematicWireRouting,
  TerminalHit,
  WireEndpoints,
} from '@/components/common/schematic/schematicTypes';

/** World-unit travel below which a press/release on a component counts as a click. */
export const CLICK_DRAG_TOLERANCE = 3;

export interface UseSchematicCanvasOptions<C extends SchematicComponent> {
  library: SchematicComponentLibrary<C>;
  gridSize: number;
  isDark: boolean;
  /** Mouse-down on a component body; return true to consume it (no drag), e.g. momentary pushbuttons. */
  onComponentPress?: (component: C) => boolean;
  /** Press-and-release on a component body without dragging (switch toggles, logic inputs). */
  onComponentClick?: (component: C) => void;
  /** Every canvas pointer release (e.g. to release a held momentary control). */
  onPointerRelease?: () => void;
  onUnhandledKey?: (event: KeyboardEvent) => void;
  /** Domain-aware fit bounds (symbol extents, labels); defaults to component/text anchors. */
  getContentBounds?: () => SchematicBounds | null;
  defaultText?: string;
}

export interface SchematicCanvasController<C extends SchematicComponent> {
  library: SchematicComponentLibrary<C>;
  gridSize: number;
  isDark: boolean;
  document: SchematicDocumentState<C>;
  viewport: SchematicViewport;
  routing: WireRouting;
  clipboard: SchematicClipboard<C>;
  components: C[];
  wires: SchematicWire[];
  texts: SchematicText[];
  selectedComponent: C | undefined;
  selectedWire: SchematicWire | undefined;
  selectedText: SchematicText | undefined;
  hasSelection: boolean;
  gridMode: SchematicGridMode;
  setGridMode: (mode: SchematicGridMode) => void;
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  dragState: SchematicDragState;
  cursor: SchematicPoint;
  hoveredComponentId: string | null;
  setHoveredComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  findTerminalAt: (point: SchematicPoint) => TerminalHit | null;
  findComponentAt: (point: SchematicPoint) => C | null;
  wireEndpoints: (wire: SchematicWire, components?: C[]) => WireEndpoints | null;
  refreshWires: (wires: SchematicWire[], components: C[], movedIds?: ReadonlySet<string>) => SchematicWire[];
  addComponent: (type: string, position?: SchematicPoint) => C | null;
  addText: () => void;
  updateComponent: (id: string, patch: Partial<C>) => void;
  updateText: (patch: Partial<SchematicText>) => void;
  setWireRouting: (routing: SchematicWireRouting) => void;
  rotateSelected: (degrees?: number) => void;
  flipSelected: (axis: 'h' | 'v') => void;
  moveSelected: (dx: number, dy: number) => void;
  undo: () => void;
  redo: () => void;
  zoomToFit: () => void;
  loadDocument: (document: SchematicDocument<C>, options?: { resetHistory?: boolean }) => void;
  handlers: {
    onCanvasMouseDown: (event: React.MouseEvent<SVGSVGElement>) => void;
    onCanvasMouseMove: (event: React.MouseEvent<SVGSVGElement>) => void;
    onCanvasMouseUp: () => void;
    onCanvasDrop: (event: React.DragEvent<SVGSVGElement>) => void;
    onWireMouseDown: (event: React.MouseEvent<SVGPathElement>, wire: SchematicWire) => void;
    onWireDoubleClick: (event: React.MouseEvent<SVGPathElement>, wire: SchematicWire) => void;
    onWireCornerMouseDown: (event: React.MouseEvent<SVGCircleElement>, wire: SchematicWire, corner: number) => void;
    onTextMouseDown: (event: React.MouseEvent<SVGGElement>, text: SchematicText) => void;
  };
}

export const LIBRARY_DRAG_MIME = 'application/electrolab-component';

export function useSchematicCanvas<C extends SchematicComponent>({
  library,
  gridSize,
  isDark,
  onComponentPress,
  onComponentClick,
  onPointerRelease,
  onUnhandledKey,
  getContentBounds,
  defaultText = 'Text label',
}: UseSchematicCanvasOptions<C>): SchematicCanvasController<C> {
  const document = useSchematicDocument<C>();
  const viewport = useSchematicViewport();
  const [gridMode, setGridMode] = useState<SchematicGridMode>('dots');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [dragState, setDragState] = useState<SchematicDragState>(null);
  const [cursor, setCursor] = useState<SchematicPoint>([0, 0]);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const dragStartRef = useRef<SchematicDocument<C> | null>(null);
  const lastDragDeltaRef = useRef<SchematicPoint | null>(null);
  const pendingClickRef = useRef<{ id: string; origin: SchematicPoint } | null>(null);

  const routing = useWireRouting({ library, document, gridSize, snapEnabled, cursor, panning: dragState?.kind === 'pan' });
  const clipboard = useSchematicClipboard(document, library, viewport.viewportCenter, gridSize, snapEnabled);

  const { components, wires, texts, selection, marqueeIds, setComponents, setWires, setTexts, setSelection, setMarqueeIds, commit, componentsRef, wiresRef, textsRef } = document;
  const { clientToWorld } = viewport;
  const snap = useCallback((point: SchematicPoint): SchematicPoint => (snapEnabled ? snapPointToGrid(point, gridSize) : point), [gridSize, snapEnabled]);

  const selectedComponent = selection?.kind === 'component' ? components.find(c => c.id === selection.id) : undefined;
  const selectedWire = selection?.kind === 'wire' ? wires.find(w => w.id === selection.id) : undefined;
  const selectedText = selection?.kind === 'text' ? texts.find(t => t.id === selection.id) : undefined;

  const refreshWires = useCallback((nextWires: SchematicWire[], nextComponents: C[], movedIds?: ReadonlySet<string>) =>
    refreshWireEndpoints(library, nextWires, nextComponents, gridSize, movedIds), [gridSize, library]);

  const wireEndpoints = useCallback((wire: SchematicWire, source?: C[]) =>
    resolveWireEndpoints(library, wire, source ?? componentsRef.current), [componentsRef, library]);

  const findTerminalAt = useCallback((point: SchematicPoint): TerminalHit | null => {
    for (const component of [...componentsRef.current].reverse()) {
      for (const terminal of library.getTerminals(component)) {
        if (isNearTerminal(point[0], point[1], terminal.position[0], terminal.position[1], TERMINAL_HIT_RADIUS)) {
          return { componentId: component.id, terminalId: terminal.id, position: terminal.position, axis: terminalAxis(terminal.position, [component.x, component.y]) };
        }
      }
    }
    return null;
  }, [componentsRef, library]);

  const findComponentAt = useCallback((point: SchematicPoint): C | null => {
    for (const component of [...componentsRef.current].reverse()) {
      if (library.hitTest(component, point)) return component;
    }
    return null;
  }, [componentsRef, library]);

  const addComponent = useCallback((type: string, position?: SchematicPoint): C | null => {
    const target = snap(position ?? viewport.viewportCenter());
    const component = library.createComponent(type, target, componentsRef.current);
    if (!component) return null;
    const nextComponents = [...componentsRef.current, component];
    setComponents(nextComponents);
    commit({ components: nextComponents });
    setMarqueeIds([]);
    setSelection({ kind: 'component', id: component.id });
    toast.success(`${component.label} added`);
    return component;
  }, [commit, componentsRef, library, setComponents, setMarqueeIds, setSelection, snap, viewport]);

  const addText = useCallback(() => {
    const [x, y] = snap(viewport.viewportCenter());
    const text: SchematicText = { id: nanoid(10), x, y, text: defaultText, fontSize: 16, color: isDark ? '#e2e8f0' : '#172033', rotation: 0 };
    const nextTexts = [...textsRef.current, text];
    setTexts(nextTexts);
    commit({ texts: nextTexts });
    setMarqueeIds([]);
    setSelection({ kind: 'text', id: text.id });
  }, [commit, defaultText, isDark, setMarqueeIds, setSelection, setTexts, snap, textsRef, viewport]);

  const updateComponent = useCallback((id: string, patch: Partial<C>) => {
    const nextComponents = componentsRef.current.map(c => (c.id === id ? { ...c, ...patch } : c));
    const geometryChanged = ['x', 'y', 'rotation', 'flipH', 'flipV'].some(key => key in patch);
    const nextWires = refreshWires(wiresRef.current, nextComponents, geometryChanged ? new Set([id]) : undefined);
    setComponents(nextComponents);
    setWires(nextWires);
    commit({ components: nextComponents, wires: nextWires });
  }, [commit, componentsRef, refreshWires, setComponents, setWires, wiresRef]);

  const updateText = useCallback((patch: Partial<SchematicText>) => {
    if (!selectedText) return;
    const nextTexts = textsRef.current.map(t => (t.id === selectedText.id ? { ...t, ...patch } : t));
    setTexts(nextTexts);
    commit({ texts: nextTexts });
  }, [commit, selectedText, setTexts, textsRef]);

  const setWireRouting = useCallback((nextRouting: SchematicWireRouting) => {
    if (!selectedWire) return;
    const endpoints = resolveWireEndpoints(library, selectedWire, componentsRef.current);
    if (!endpoints) return;
    const nextWires = wiresRef.current.map(w => (w.id === selectedWire.id ? { ...w, routing: nextRouting, path: routePath(endpoints.from, endpoints.to, nextRouting), waypoints: undefined } : w));
    setWires(nextWires);
    commit({ wires: nextWires });
  }, [commit, componentsRef, library, selectedWire, setWires, wiresRef]);

  const rotateSelected = useCallback((degrees = 90) => {
    if (!selectedComponent) return;
    const step = Math.round(degrees / 90) * 90 || 90;
    const rotation = ((Math.round((selectedComponent.rotation + step) / 90) * 90) % 360 + 360) % 360;
    updateComponent(selectedComponent.id, { rotation } as Partial<C>);
  }, [selectedComponent, updateComponent]);

  const flipSelected = useCallback((axis: 'h' | 'v') => {
    if (!selectedComponent) return;
    updateComponent(selectedComponent.id, (axis === 'h' ? { flipH: !selectedComponent.flipH } : { flipV: !selectedComponent.flipV }) as Partial<C>);
  }, [selectedComponent, updateComponent]);

  const moveSelected = useCallback((dx: number, dy: number) => {
    if (selectedComponent) {
      const [x, y] = snap([selectedComponent.x + dx, selectedComponent.y + dy]);
      updateComponent(selectedComponent.id, { x, y } as Partial<C>);
    } else if (selectedText) {
      updateText({ x: selectedText.x + dx, y: selectedText.y + dy });
    }
  }, [selectedComponent, selectedText, snap, updateComponent, updateText]);

  const undo = useCallback(() => {
    if (document.undo()) routing.cancelWiring();
  }, [document, routing]);

  const redo = useCallback(() => {
    if (document.redo()) routing.cancelWiring();
  }, [document, routing]);

  const zoomToFit = useCallback(() => {
    const bounds = getContentBounds ? getContentBounds() : defaultContentBounds(componentsRef.current, textsRef.current);
    viewport.fitBounds(bounds);
    if (bounds) toast.success('Centered circuit to fit viewport');
  }, [componentsRef, getContentBounds, textsRef, viewport]);

  const loadDocument = useCallback((next: SchematicDocument<C>, options?: { resetHistory?: boolean }) => {
    routing.cancelWiring();
    setDragState(null);
    document.replaceDocument(next, options);
  }, [document, routing]);

  const beginDragSnapshot = useCallback(() => {
    dragStartRef.current = cloneDocument(document.snapshot());
    lastDragDeltaRef.current = null;
  }, [document]);

  const onCanvasMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const point = clientToWorld(event.clientX, event.clientY);
    setCursor(point);
    if (event.button === 1 || event.button === 2 || event.altKey) {
      event.preventDefault();
      setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
      return;
    }
    if (event.button !== 0) return;

    const terminal = findTerminalAt(point);
    if (terminal) {
      routing.handleTerminal(terminal);
      return;
    }

    if (routing.wiring.from) {
      const hit = routing.findWireNear(point);
      if (hit) routing.connectToWire(hit.wire, hit.projection.point);
      else routing.lockCornerAt(point);
      return;
    }

    const component = findComponentAt(point);
    if (component) {
      const group = marqueeIds.length > 1 && marqueeIds.includes(component.id) ? marqueeIds : [component.id];
      if (group.length === 1) {
        setSelection({ kind: 'component', id: component.id });
        setMarqueeIds([component.id]);
      }
      if (onComponentPress?.(component)) return;
      pendingClickRef.current = { id: component.id, origin: point };
      beginDragSnapshot();
      setDragState({ kind: 'component', id: component.id, offset: [point[0] - component.x, point[1] - component.y], origin: [component.x, component.y], ids: group });
      return;
    }

    const hit = routing.findWireNear(point);
    if (hit) {
      setMarqueeIds([]);
      setSelection({ kind: 'wire', id: hit.wire.id });
      return;
    }

    setSelection(null);
    setMarqueeIds([]);
    setDragState({ kind: 'marquee', start: point, end: point });
  }, [beginDragSnapshot, clientToWorld, findComponentAt, findTerminalAt, marqueeIds, onComponentPress, routing, setMarqueeIds, setSelection]);

  const dragComponents = useCallback((state: Extract<SchematicDragState, { kind: 'component' }>, point: SchematicPoint) => {
    const base = dragStartRef.current;
    if (!base) return;
    const target = snap([point[0] - state.offset[0], point[1] - state.offset[1]]);
    const delta: SchematicPoint = [target[0] - state.origin[0], target[1] - state.origin[1]];
    const last = lastDragDeltaRef.current;
    if (last && last[0] === delta[0] && last[1] === delta[1]) return;
    lastDragDeltaRef.current = delta;

    const ids = new Set(state.ids);
    const shift = (p: SchematicPoint): SchematicPoint => [p[0] + delta[0], p[1] + delta[1]];
    const nextComponents = base.components.map(c => (ids.has(c.id) ? { ...c, x: c.x + delta[0], y: c.y + delta[1] } : c));
    const internal = (w: SchematicWire) => ids.has(w.fromComp) && ids.has(w.toComp);
    const external = refreshWires(base.wires.filter(w => !internal(w)), nextComponents, ids);
    const externalById = new Map(external.map(w => [w.id, w]));
    const nextWires = base.wires.map(w => (internal(w)
      ? { ...w, path: w.path.map(shift), waypoints: w.waypoints?.map(shift) }
      : externalById.get(w.id) ?? w));
    setComponents(nextComponents);
    setWires(nextWires);
    if (ids.size > 1) setTexts(base.texts.map(t => (ids.has(t.id) ? { ...t, x: t.x + delta[0], y: t.y + delta[1] } : t)));
  }, [refreshWires, setComponents, setTexts, setWires, snap]);

  const onCanvasMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const point = clientToWorld(event.clientX, event.clientY);
    setCursor(point);
    const pending = pendingClickRef.current;
    if (pending && Math.hypot(point[0] - pending.origin[0], point[1] - pending.origin[1]) > CLICK_DRAG_TOLERANCE) {
      pendingClickRef.current = null;
    }
    if (!dragState) return;
    switch (dragState.kind) {
      case 'pan':
        viewport.panBy(event.clientX - dragState.client[0], event.clientY - dragState.client[1]);
        setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
        return;
      case 'marquee':
        setDragState({ ...dragState, end: point });
        return;
      case 'component':
        dragComponents(dragState, point);
        return;
      case 'text': {
        const [x, y] = snap([point[0] - dragState.offset[0], point[1] - dragState.offset[1]]);
        setTexts(previous => previous.map(t => (t.id === dragState.id ? { ...t, x, y } : t)));
        return;
      }
      case 'wireCorner':
        routing.dragCorner(dragState.id, dragState.corner, point);
        return;
      default:
        return;
    }
  }, [clientToWorld, dragComponents, dragState, routing, setTexts, snap, viewport]);

  const onCanvasMouseUp = useCallback(() => {
    onPointerRelease?.();
    const pending = pendingClickRef.current;
    pendingClickRef.current = null;
    if (pending) {
      const clicked = componentsRef.current.find(c => c.id === pending.id);
      if (clicked) onComponentClick?.(clicked);
    }
    if (dragStartRef.current) {
      const current = document.snapshot();
      if (!areDocumentsEqual(dragStartRef.current, current)) commit(current);
      dragStartRef.current = null;
    }
    if (dragState?.kind === 'marquee') {
      const [left, right] = [dragState.start[0], dragState.end[0]].sort((a, b) => a - b);
      const [top, bottom] = [dragState.start[1], dragState.end[1]].sort((a, b) => a - b);
      const inside = (x: number, y: number) => x >= left && x <= right && y >= top && y <= bottom;
      const componentIds = componentsRef.current.filter(c => inside(c.x, c.y)).map(c => c.id);
      const wireIds = wiresRef.current.filter(w => w.path.some(p => inside(p[0], p[1]))).map(w => w.id);
      const textIds = textsRef.current.filter(t => inside(t.x, t.y)).map(t => t.id);
      const ids = [...componentIds, ...wireIds, ...textIds];
      setMarqueeIds(ids);
      setSelection(ids.length === 1 && componentIds.length === 1 ? { kind: 'component', id: componentIds[0] } : null);
    }
    setDragState(null);
  }, [commit, componentsRef, document, dragState, onComponentClick, onPointerRelease, setMarqueeIds, setSelection, textsRef, wiresRef]);

  const onCanvasDrop = useCallback((event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(LIBRARY_DRAG_MIME);
    if (!type) return;
    addComponent(type, clientToWorld(event.clientX, event.clientY));
  }, [addComponent, clientToWorld]);

  const onWireMouseDown = useCallback((event: React.MouseEvent<SVGPathElement>, wire: SchematicWire) => {
    if (event.button !== 0 || event.altKey) return;
    event.stopPropagation();
    if (routing.wiring.from) {
      routing.connectToWire(wire, clientToWorld(event.clientX, event.clientY));
      return;
    }
    setMarqueeIds([]);
    setSelection({ kind: 'wire', id: wire.id });
  }, [clientToWorld, routing, setMarqueeIds, setSelection]);

  const onWireDoubleClick = useCallback((event: React.MouseEvent<SVGPathElement>, wire: SchematicWire) => {
    event.stopPropagation();
    routing.insertCorner(wire, clientToWorld(event.clientX, event.clientY));
  }, [clientToWorld, routing]);

  const onWireCornerMouseDown = useCallback((event: React.MouseEvent<SVGCircleElement>, wire: SchematicWire, corner: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    beginDragSnapshot();
    setDragState({ kind: 'wireCorner', id: wire.id, corner });
  }, [beginDragSnapshot]);

  const onTextMouseDown = useCallback((event: React.MouseEvent<SVGGElement>, text: SchematicText) => {
    if (event.button !== 0 || event.altKey) return;
    event.stopPropagation();
    const point = clientToWorld(event.clientX, event.clientY);
    setMarqueeIds([]);
    setSelection({ kind: 'text', id: text.id });
    beginDragSnapshot();
    setDragState({ kind: 'text', id: text.id, offset: [point[0] - text.x, point[1] - text.y] });
  }, [beginDragSnapshot, clientToWorld, setMarqueeIds, setSelection]);

  const hasSelection = Boolean(selection) || marqueeIds.length > 0;

  const onAction = useCallback((action: SchematicShortcutAction): boolean => {
    switch (action.type) {
      case 'undo': undo(); return true;
      case 'redo': redo(); return true;
      case 'copy': clipboard.copy(); return Boolean(selectedComponent) || marqueeIds.length > 0;
      case 'cut': clipboard.cut(); return Boolean(selectedComponent) || marqueeIds.length > 0;
      case 'paste': clipboard.paste(); return clipboard.hasClipboard;
      case 'delete': clipboard.removeSelection(); return true;
      case 'escape':
        routing.cancelWiring();
        setSelection(null);
        setMarqueeIds([]);
        return true;
      case 'rotate':
        if (!selectedComponent) return false;
        rotateSelected(90);
        return true;
      case 'flip':
        if (!selectedComponent) return false;
        flipSelected(action.axis);
        return true;
      case 'text': addText(); return true;
      case 'wireHint':
        routing.cancelWiring();
        toast.message('Click a terminal to start wiring');
        return true;
      case 'nudge':
        if (!selectedComponent && !selectedText) return false;
        moveSelected(action.dx, action.dy);
        return true;
      default:
        return false;
    }
  }, [addText, clipboard, flipSelected, marqueeIds.length, moveSelected, redo, rotateSelected, routing, selectedComponent, selectedText, setMarqueeIds, setSelection, undo]);

  useSchematicShortcuts({ step: snapEnabled ? gridSize : 1, onAction, onUnhandledKey });

  const handlers = useMemo(() => ({
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    onCanvasDrop,
    onWireMouseDown,
    onWireDoubleClick,
    onWireCornerMouseDown,
    onTextMouseDown,
  }), [onCanvasDrop, onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onTextMouseDown, onWireCornerMouseDown, onWireDoubleClick, onWireMouseDown]);

  return {
    library,
    gridSize,
    isDark,
    document,
    viewport,
    routing,
    clipboard,
    components,
    wires,
    texts,
    selectedComponent,
    selectedWire,
    selectedText,
    hasSelection,
    gridMode,
    setGridMode,
    snapEnabled,
    setSnapEnabled,
    dragState,
    cursor,
    hoveredComponentId,
    setHoveredComponentId,
    findTerminalAt,
    findComponentAt,
    wireEndpoints,
    refreshWires,
    addComponent,
    addText,
    updateComponent,
    updateText,
    setWireRouting,
    rotateSelected,
    flipSelected,
    moveSelected,
    undo,
    redo,
    zoomToFit,
    loadDocument,
    handlers,
  };
}
