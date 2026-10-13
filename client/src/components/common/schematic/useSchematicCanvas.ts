import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { isCoarsePointer, terminalHitRadius } from '@/simulators/shared/workspace/workspaceCanvasMechanics';
import {
  defaultContentBounds,
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
/** Fingertip-sized wire pick radius (world units) used instead of WIRE_HIT_THRESHOLD for touch. */
export const WIRE_HIT_THRESHOLD_COARSE = 24;
/** Screen pixels a pin-press must travel before releasing over another pin counts as a drag-to-connect. */
export const WIRE_DRAG_MIN_PX = 12;
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_SLOP_PX = 28;

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
  /** Nearest pin within the snap radius; `coarse` selects the >=20px touch radius. */
  findTerminalAt: (point: SchematicPoint, coarse?: boolean) => TerminalHit | null;
  /** Pin currently magnetised by the pointer while a wire is being drawn (drives the snap indicator). */
  terminalSnap: TerminalHit | null;
  /** World-unit radius within which a pin captures the pointer for the current input type. */
  snapRadius: number;
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
    onCanvasPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
    onCanvasPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
    onCanvasPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
    onCanvasPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => void;
    onCanvasDrop: (event: React.DragEvent<SVGSVGElement>) => void;
    onWirePointerDown: (event: React.PointerEvent<Element>, wire: SchematicWire) => void;
    onWireDoubleClick: (event: React.MouseEvent<Element>, wire: SchematicWire) => void;
    onWireCornerPointerDown: (event: React.PointerEvent<Element>, wire: SchematicWire, corner: number) => void;
    onTextPointerDown: (event: React.PointerEvent<Element>, text: SchematicText) => void;
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
  const cancelInteractionRef = useRef<() => void>(() => undefined);
  const viewport = useSchematicViewport({ onPinchStart: () => cancelInteractionRef.current() });
  const [gridMode, setGridMode] = useState<SchematicGridMode>('dots');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [dragState, setDragState] = useState<SchematicDragState>(null);
  const [cursor, setCursor] = useState<SchematicPoint>([0, 0]);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const dragStartRef = useRef<SchematicDocument<C> | null>(null);
  const lastDragDeltaRef = useRef<SchematicPoint | null>(null);
  const pendingClickRef = useRef<{ id: string; origin: SchematicPoint } | null>(null);
  /** A press that armed a wire at a pin: releasing over another pin after a drag completes it. */
  const wireGestureRef = useRef<{ pointerId: number; origin: SchematicPoint } | null>(null);
  const lastWireTapRef = useRef<{ id: string; time: number; client: SchematicPoint } | null>(null);
  const [terminalSnap, setTerminalSnap] = useState<TerminalHit | null>(null);
  const [coarseInput, setCoarseInput] = useState(false);

  const routing = useWireRouting({ library, document, gridSize, snapEnabled, cursor, panning: dragState?.kind === 'pan', terminalSnap });
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

  const snapRadius = terminalHitRadius(viewport.zoom, coarseInput || isCoarsePointer());

  const findTerminalAt = useCallback((point: SchematicPoint, coarse = isCoarsePointer()): TerminalHit | null => {
    const radius = terminalHitRadius(viewport.zoom, coarse);
    let best: { hit: TerminalHit; distance: number } | null = null;
    for (const component of [...componentsRef.current].reverse()) {
      for (const terminal of library.getTerminals(component)) {
        const distance = Math.hypot(point[0] - terminal.position[0], point[1] - terminal.position[1]);
        if (distance <= radius && (!best || distance < best.distance)) {
          best = { distance, hit: { componentId: component.id, terminalId: terminal.id, position: terminal.position, axis: terminalAxis(terminal.position, [component.x, component.y]) } };
        }
      }
    }
    return best?.hit ?? null;
  }, [componentsRef, library, viewport.zoom]);

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

  /** Touch/pen get the generous snap radius and pan-on-empty-space; mouse keeps the precise legacy behaviour. */
  const isCoarseEvent = useCallback((event: { pointerType?: string }) => event.pointerType === 'touch' || isCoarsePointer(), []);

  /** Route every later event of this pointer to the canvas, even when it leaves the element or the window. */
  const captureCanvas = useCallback((pointerId: number) => {
    try {
      viewport.svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // Unsupported (jsdom) or the pointer already ended: events still bubble normally.
    }
  }, [viewport.svgRef]);

  /** Abandons a drag in progress and restores the pre-drag document (a second finger landing, or the OS cancelling the touch). */
  const cancelInteraction = useCallback(() => {
    pendingClickRef.current = null;
    wireGestureRef.current = null;
    const base = dragStartRef.current;
    if (base) {
      setComponents(base.components);
      setWires(base.wires);
      setTexts(base.texts);
      dragStartRef.current = null;
    }
    setDragState(null);
    setTerminalSnap(null);
    onPointerRelease?.();
  }, [onPointerRelease, setComponents, setTexts, setWires]);
  cancelInteractionRef.current = cancelInteraction;

  const onCanvasPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    // Extra fingers belong to the pinch gesture; ignore them here.
    if (!event.isPrimary || viewport.isPinching()) return;
    const coarse = isCoarseEvent(event);
    setCoarseInput(coarse);
    const point = clientToWorld(event.clientX, event.clientY);
    setCursor(point);
    if (event.button === 1 || event.button === 2 || event.altKey) {
      event.preventDefault();
      captureCanvas(event.pointerId);
      setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
      return;
    }
    if (event.button !== 0) return;

    const terminal = findTerminalAt(point, coarse);
    if (terminal) {
      const completing = Boolean(routing.wiring.from);
      routing.handleTerminal(terminal);
      setTerminalSnap(null);
      if (!completing) {
        // Pressing a pin arms the wire; dragging to another pin and releasing completes it.
        wireGestureRef.current = { pointerId: event.pointerId, origin: [event.clientX, event.clientY] };
        captureCanvas(event.pointerId);
      }
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
      captureCanvas(event.pointerId);
      setDragState({ kind: 'component', id: component.id, offset: [point[0] - component.x, point[1] - component.y], origin: [component.x, component.y], ids: group });
      return;
    }

    const hit = routing.findWireNear(point, coarse ? WIRE_HIT_THRESHOLD_COARSE : undefined);
    if (hit) {
      setMarqueeIds([]);
      setSelection({ kind: 'wire', id: hit.wire.id });
      return;
    }

    setSelection(null);
    setMarqueeIds([]);
    captureCanvas(event.pointerId);
    // A finger on empty canvas pans (marquee selection is impractical by touch); a mouse draws the marquee.
    if (event.pointerType === 'touch') setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
    else setDragState({ kind: 'marquee', start: point, end: point });
  }, [beginDragSnapshot, captureCanvas, clientToWorld, findComponentAt, findTerminalAt, isCoarseEvent, marqueeIds, onComponentPress, routing, setMarqueeIds, setSelection, viewport]);

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

  const onCanvasPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || viewport.isPinching()) return;
    const point = clientToWorld(event.clientX, event.clientY);
    setCursor(point);
    const wiringFrom = routing.wiring.from;
    if (wiringFrom) {
      // Magnetise the nearest pin so the user sees the wire will land there before releasing.
      const candidate = findTerminalAt(point, isCoarseEvent(event));
      const target = candidate && !(candidate.componentId === wiringFrom.componentId && candidate.terminalId === wiringFrom.terminalId) ? candidate : null;
      setTerminalSnap(previous => (previous?.componentId === target?.componentId && previous?.terminalId === target?.terminalId ? previous : target));
    } else if (terminalSnap) {
      setTerminalSnap(null);
    }
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
  }, [clientToWorld, dragComponents, dragState, findTerminalAt, isCoarseEvent, routing, setTexts, snap, terminalSnap, viewport]);

  const onCanvasPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary) return;
    const gesture = wireGestureRef.current;
    wireGestureRef.current = null;
    const wiringFrom = routing.wiring.from;
    if (gesture && gesture.pointerId === event.pointerId && wiringFrom && !viewport.isPinching()) {
      const travelled = Math.hypot(event.clientX - gesture.origin[0], event.clientY - gesture.origin[1]);
      if (travelled > WIRE_DRAG_MIN_PX) {
        const target = findTerminalAt(clientToWorld(event.clientX, event.clientY), isCoarseEvent(event));
        if (target && !(target.componentId === wiringFrom.componentId && target.terminalId === wiringFrom.terminalId)) routing.handleTerminal(target);
      }
    }
    setTerminalSnap(null);
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
  }, [clientToWorld, commit, componentsRef, document, dragState, findTerminalAt, isCoarseEvent, onComponentClick, onPointerRelease, routing, setMarqueeIds, setSelection, textsRef, viewport, wiresRef]);

  const onCanvasPointerCancel = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.isPrimary) cancelInteraction();
  }, [cancelInteraction]);

  const onCanvasDrop = useCallback((event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(LIBRARY_DRAG_MIME);
    if (!type) return;
    addComponent(type, clientToWorld(event.clientX, event.clientY));
  }, [addComponent, clientToWorld]);

  const onWirePointerDown = useCallback((event: React.PointerEvent<Element>, wire: SchematicWire) => {
    if (!event.isPrimary || event.button !== 0 || event.altKey) return;
    event.stopPropagation();
    if (routing.wiring.from) {
      routing.connectToWire(wire, clientToWorld(event.clientX, event.clientY));
      return;
    }
    if (event.pointerType === 'touch') {
      // iOS never delivers dblclick for taps on the canvas, so a quick second tap inserts a bend point.
      const now = event.timeStamp;
      const last = lastWireTapRef.current;
      if (last && last.id === wire.id && now - last.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.client[0], event.clientY - last.client[1]) < DOUBLE_TAP_SLOP_PX) {
        lastWireTapRef.current = null;
        routing.insertCorner(wire, clientToWorld(event.clientX, event.clientY));
        return;
      }
      lastWireTapRef.current = { id: wire.id, time: now, client: [event.clientX, event.clientY] };
    }
    setMarqueeIds([]);
    setSelection({ kind: 'wire', id: wire.id });
  }, [clientToWorld, routing, setMarqueeIds, setSelection]);

  const onWireDoubleClick = useCallback((event: React.MouseEvent<Element>, wire: SchematicWire) => {
    event.stopPropagation();
    routing.insertCorner(wire, clientToWorld(event.clientX, event.clientY));
  }, [clientToWorld, routing]);

  const onWireCornerPointerDown = useCallback((event: React.PointerEvent<Element>, wire: SchematicWire, corner: number) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    captureCanvas(event.pointerId);
    beginDragSnapshot();
    setDragState({ kind: 'wireCorner', id: wire.id, corner });
  }, [beginDragSnapshot, captureCanvas]);

  const onTextPointerDown = useCallback((event: React.PointerEvent<Element>, text: SchematicText) => {
    if (!event.isPrimary || event.button !== 0 || event.altKey) return;
    event.stopPropagation();
    event.preventDefault();
    const point = clientToWorld(event.clientX, event.clientY);
    captureCanvas(event.pointerId);
    setMarqueeIds([]);
    setSelection({ kind: 'text', id: text.id });
    beginDragSnapshot();
    setDragState({ kind: 'text', id: text.id, offset: [point[0] - text.x, point[1] - text.y] });
  }, [beginDragSnapshot, captureCanvas, clientToWorld, setMarqueeIds, setSelection]);

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
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasPointerCancel,
    onCanvasDrop,
    onWirePointerDown,
    onWireDoubleClick,
    onWireCornerPointerDown,
    onTextPointerDown,
  }), [onCanvasDrop, onCanvasPointerCancel, onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp, onTextPointerDown, onWireCornerPointerDown, onWireDoubleClick, onWirePointerDown]);

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
    terminalSnap,
    snapRadius,
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
