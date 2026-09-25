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
}

/**
 * Canonical viewport math: wheel zoom about the cursor, Shift/horizontal-wheel pan,
 * trackpad pinch (ctrl+wheel) and two-finger touch pinch/pan.
 */
export function useSchematicViewport(): SchematicViewport {
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

    let pinch: { distance: number; center: SchematicPoint } | null = null;
    const pinchGeometry = (touches: TouchList): { distance: number; center: SchematicPoint } => {
      const rect = canvas.getBoundingClientRect();
      const a = touches[0];
      const b = touches[1];
      return {
        distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 1,
        center: [(a.clientX + b.clientX) / 2 - rect.left, (a.clientY + b.clientY) / 2 - rect.top],
      };
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        pinch = pinchGeometry(event.touches);
      }
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const next = pinchGeometry(event.touches);
      const zoomed = zoomViewAt(viewRef.current, next.distance / pinch.distance, next.center);
      setView({ zoom: zoomed.zoom, pan: [zoomed.pan[0] + next.center[0] - pinch.center[0], zoomed.pan[1] + next.center[1] - pinch.center[1]] });
      pinch = next;
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
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
  }), [clientToWorld, fitBounds, panBy, resetZoom, setPan, setView, setZoom, view, viewportCenter, zoomIn, zoomOut]);
}
