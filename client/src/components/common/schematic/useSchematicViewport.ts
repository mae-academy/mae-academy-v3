import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { clampZoom, tabDGentleWheelZoomFactor, ZOOM_STEP } from '@/simulators/shared/workspace/workspaceCanvasMechanics';
import type { SchematicBounds, SchematicPoint } from '@/components/common/schematic/schematicTypes';

export const FIT_PADDING = 60;
export const FIT_ZOOM_MAX = 2.5;

export interface ViewState {
  zoom: number;
  pan: SchematicPoint;
}

/** Zooms by `factor` keeping the screen-space anchor fixed under the cursor/pinch centre. */
export function zoomViewAt(view: ViewState, factor: number, anchor: SchematicPoint): ViewState {
  const zoom = clampZoom(view.zoom * factor);
  const ratio = zoom / view.zoom;
  return {
    zoom,
    pan: [anchor[0] - (anchor[0] - view.pan[0]) * ratio, anchor[1] - (anchor[1] - view.pan[1]) * ratio],
  };
}

/** Centres `bounds` inside a viewport of `width`×`height` with a fixed padding. */
export function fitViewToBounds(bounds: SchematicBounds | null, width: number, height: number): ViewState {
  if (!bounds) return { zoom: 1, pan: [0, 0] };
  const availWidth = Math.max(20, width - FIT_PADDING * 2);
  const availHeight = Math.max(20, height - FIT_PADDING * 2);
  const zoom = clampZoom(Math.min(FIT_ZOOM_MAX, availWidth / Math.max(1, bounds.width), availHeight / Math.max(1, bounds.height)));
  return { zoom, pan: [width / 2 - bounds.centerX * zoom, height / 2 - bounds.centerY * zoom] };
}

export function screenToWorld(view: ViewState, screen: SchematicPoint): SchematicPoint {
  return [(screen[0] - view.pan[0]) / view.zoom, (screen[1] - view.pan[1]) / view.zoom];
}

/** Exact inverse of `screenToWorld`: the projection every renderer (SVG and HTML overlay) must share. */
export function worldToScreen(view: ViewState, world: SchematicPoint): SchematicPoint {
  return [world[0] * view.zoom + view.pan[0], world[1] * view.zoom + view.pan[1]];
}

/**
 * The single world->screen matrix, expressed for both renderers. `svg` is the attribute for the
 * canvas `<g>`; `css` is the identical matrix for an HTML layer whose children use world units.
 */
export function viewTransforms(view: ViewState): { svg: string; css: string } {
  const [px, py] = view.pan;
  return {
    svg: `translate(${px},${py}) scale(${view.zoom})`,
    css: `translate(${px}px, ${py}px) scale(${view.zoom})`,
  };
}

export interface SchematicViewport {
  svgRef: React.RefObject<SVGSVGElement | null>;
  zoom: number;
  pan: SchematicPoint;
  setView: (next: ViewState) => void;
  setZoom: (next: number | ((current: number) => number)) => void;
  setPan: (next: SchematicPoint | ((current: SchematicPoint) => SchematicPoint)) => void;
  clientToWorld: (clientX: number, clientY: number) => SchematicPoint;
  /** World coordinate currently at the centre of the visible canvas. */
  viewportCenter: () => SchematicPoint;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitBounds: (bounds: SchematicBounds | null) => void;
  panBy: (dx: number, dy: number) => void;
  /** True from the moment a second finger lands until every finger has lifted. */
  isPinching: () => boolean;
}

export interface UseSchematicViewportOptions {
  /** Fired when a second finger lands, so the host can abandon a one-finger drag in progress. */
  onPinchStart?: () => void;
}

/**
 * Canonical viewport math: wheel zoom about the cursor, Shift/horizontal-wheel pan,
 * trackpad pinch (ctrl+wheel) and two-finger touch pinch/pan driven by Pointer Events.
 */
export function useSchematicViewport({ onPinchStart }: UseSchematicViewportOptions = {}): SchematicViewport {
  const onPinchStartRef = useRef(onPinchStart);
  onPinchStartRef.current = onPinchStart;
  const pinchingRef = useRef(false);
  const isPinching = useCallback(() => pinchingRef.current, []);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setViewState] = useState<ViewState>({ zoom: 1, pan: [0, 0] });
  const viewRef = useRef(view);

  const setView = useCallback((next: ViewState) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const setZoom = useCallback((next: number | ((current: number) => number)) => {
    const current = viewRef.current;
    const zoom = clampZoom(typeof next === 'function' ? next(current.zoom) : next);
    setView({ zoom, pan: current.pan });
  }, [setView]);

  const setPan = useCallback((next: SchematicPoint | ((current: SchematicPoint) => SchematicPoint)) => {
    const current = viewRef.current;
    setView({ zoom: current.zoom, pan: typeof next === 'function' ? next(current.pan) : next });
  }, [setView]);

  const panBy = useCallback((dx: number, dy: number) => {
    const current = viewRef.current;
    setView({ zoom: current.zoom, pan: [current.pan[0] + dx, current.pan[1] + dy] });
  }, [setView]);

  const canvasSize = useCallback((): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect();
    return [rect?.width || 800, rect?.height || 600];
  }, []);

  const clientToWorld = useCallback((clientX: number, clientY: number): SchematicPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return screenToWorld(viewRef.current, [clientX - rect.left, clientY - rect.top]);
  }, []);

  const viewportCenter = useCallback((): SchematicPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [300, 220];
    return screenToWorld(viewRef.current, [rect.width / 2, rect.height / 2]);
  }, []);

  const zoomAboutCenter = useCallback((factor: number) => {
    const [width, height] = canvasSize();
    setView(zoomViewAt(viewRef.current, factor, [width / 2, height / 2]));
  }, [canvasSize, setView]);

  const zoomIn = useCallback(() => zoomAboutCenter(ZOOM_STEP), [zoomAboutCenter]);
  const zoomOut = useCallback(() => zoomAboutCenter(1 / ZOOM_STEP), [zoomAboutCenter]);
  const resetZoom = useCallback(() => zoomAboutCenter(1 / viewRef.current.zoom), [zoomAboutCenter]);

  const fitBounds = useCallback((bounds: SchematicBounds | null) => {
    const [width, height] = canvasSize();
    setView(fitViewToBounds(bounds, width, height));
  }, [canvasSize, setView]);

  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return undefined;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (event.shiftKey || (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey)) {
        const current = viewRef.current;
        setView({ zoom: current.zoom, pan: [current.pan[0] - event.deltaX, current.pan[1] - event.deltaY] });
        return;
      }
      // ctrl+wheel is how browsers deliver trackpad pinch; same anchored zoom path.
      setView(zoomViewAt(viewRef.current, tabDGentleWheelZoomFactor(event.deltaY), [event.clientX - rect.left, event.clientY - rect.top]));
    };

    // Two-finger pinch/pan from Pointer Events: one model for touch, pen and mouse.
    const touches = new Map<number, SchematicPoint>();
    let pinch: { distance: number; center: SchematicPoint } | null = null;
    const pinchGeometry = (): { distance: number; center: SchematicPoint } => {
      const rect = canvas.getBoundingClientRect();
      const [a, b] = Array.from(touches.values());
      return {
        distance: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
        center: [(a[0] + b[0]) / 2 - rect.left, (a[1] + b[1]) / 2 - rect.top],
      };
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      touches.set(event.pointerId, [event.clientX, event.clientY]);
      if (touches.size === 2) {
        pinchingRef.current = true;
        pinch = pinchGeometry();
        onPinchStartRef.current?.();
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, [event.clientX, event.clientY]);
      if (!pinch || touches.size < 2) return;
      event.preventDefault();
      const next = pinchGeometry();
      const zoomed = zoomViewAt(viewRef.current, next.distance / pinch.distance, next.center);
      setView({ zoom: zoomed.zoom, pan: [zoomed.pan[0] + next.center[0] - pinch.center[0], zoomed.pan[1] + next.center[1] - pinch.center[1]] });
      pinch = next;
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (!touches.delete(event.pointerId)) return;
      if (touches.size < 2) pinch = null;
      // A lone finger left over from a pinch must not start dragging; wait for a full release.
      if (touches.size === 0) pinchingRef.current = false;
    };
    // iOS Safari reports page pinch as gesture events; the canvas owns that gesture.
    const swallowGesture = (event: Event) => event.preventDefault();

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointercancel', handlePointerEnd);
    canvas.addEventListener('gesturestart', swallowGesture);
    canvas.addEventListener('gesturechange', swallowGesture);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerEnd);
      canvas.removeEventListener('pointercancel', handlePointerEnd);
      canvas.removeEventListener('gesturestart', swallowGesture);
      canvas.removeEventListener('gesturechange', swallowGesture);
    };
  }, [setView]);

  return useMemo(() => ({
    svgRef,
    zoom: view.zoom,
    pan: view.pan,
    setView,
    setZoom,
    setPan,
    clientToWorld,
    viewportCenter,
    zoomIn,
    zoomOut,
    resetZoom,
    fitBounds,
    panBy,
    isPinching,
  }), [clientToWorld, fitBounds, isPinching, panBy, resetZoom, setPan, setView, setZoom, view, viewportCenter, zoomIn, zoomOut]);
}
