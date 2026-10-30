/**
 * The graph surface (STEPS.md §4 Interaction): pan (drag, arrow keys), zoom (wheel, + / −), tracing with the tangent
 * and slope triangle (§8.1), and dragging points whose coordinates are parameters. Drawing only; all evaluation
 * happens in the engine Worker.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Viewport } from "@shared/mathcore/ir/types";
import { closestPoint } from "@shared/mathcore/sample/closest";
import { NS } from "../i18n/register";
import type { Scene } from "../render/renderer";
import { Canvas2DRenderer, gridStep } from "../render/renderer";

export interface TraceTarget {
  id: string;
  segments: readonly Float64Array[];
}

export interface DraggablePoint {
  id: string;
  x: number;
  y: number;
}

export interface GraphCanvasProps {
  scene: Scene;
  onViewport: (v: Viewport, quality: "drag" | "full") => void;
  traceTargets: TraceTarget[];
  onTrace: (target: { id: string; x: number } | null) => void;
  draggable: DraggablePoint[];
  onDragPoint: (id: string, x: number, y: number, quality: "drag" | "full") => void;
  /** Keeps one unit equal on both axes (viewport.aspect = "equal"). */
  equalAspect: boolean;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
}

/** Pointer distance, in CSS pixels, within which a curve is traced or a point grabbed. */
const HIT_RADIUS = 12;
/** Zoom factor per wheel notch and per + / − key. */
const ZOOM_STEP = 1.2;
/** Fraction of the view moved by one arrow-key press. */
const KEY_PAN = 0.1;
/** Delay after the last interaction before full-resolution sampling (STEPS.md §7.1 technique 2). */
const SETTLE_MS = 150;

export function GraphCanvas(props: GraphCanvasProps) {
  const { t } = useTranslation(NS);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Canvas2DRenderer | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ mode: "pan" | "point"; id?: string; x: number; y: number; vp: Viewport } | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useLayoutEffect(() => {
    if (!canvas.current) return;
    renderer.current = new Canvas2DRenderer(canvas.current);
    props.onCanvas?.(canvas.current);
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(1, Math.floor(width)), h: Math.max(1, Math.floor(height)) });
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => {
      ro.disconnect();
      props.onCanvas?.(null);
    };
    // Created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Equal aspect: when the box changes shape, widen or narrow y around its center.
  useEffect(() => {
    if (!size.w || !size.h || !props.equalAspect) return;
    const v = props.scene.viewport;
    const unitsPerPx = (v.xmax - v.xmin) / size.w;
    const cy = (v.ymin + v.ymax) / 2;
    const half = (unitsPerPx * size.h) / 2;
    if (Math.abs(v.ymax - v.ymin - 2 * half) > 1e-9 * (v.ymax - v.ymin)) {
      props.onViewport({ ...v, ymin: cy - half, ymax: cy + half }, "full");
    }
    // Only the box size triggers this; viewport changes come back through props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, props.equalAspect]);

  useEffect(() => {
    if (!renderer.current || !size.w) return;
    renderer.current.resize(size.w, size.h, window.devicePixelRatio || 1);
  }, [size]);

  useEffect(() => {
    if (!renderer.current || !size.w) return;
    renderer.current.draw(props.scene);
  }, [props.scene, size]);

  const toWorld = (clientX: number, clientY: number, vp = props.scene.viewport) => {
    const r = canvas.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: vp.xmin + ((clientX - r.left) / r.width) * (vp.xmax - vp.xmin),
      y: vp.ymax - ((clientY - r.top) / r.height) * (vp.ymax - vp.ymin),
    };
  };

  const emit = (v: Viewport) => {
    propsRef.current.onViewport(v, "drag");
    clearTimeout(settle.current);
    settle.current = setTimeout(() => propsRef.current.onViewport(v, "full"), SETTLE_MS);
  };

  const zoomAt = (cx: number, cy: number, factor: number) => {
    const v = props.scene.viewport;
    emit({
      ...v,
      xmin: cx + (v.xmin - cx) * factor,
      xmax: cx + (v.xmax - cx) * factor,
      ymin: cy + (v.ymin - cy) * factor,
      ymax: cy + (v.ymax - cy) * factor,
    });
  };

  const pxScale = () => {
    const v = props.scene.viewport;
    return { sx: size.w / (v.xmax - v.xmin), sy: size.h / (v.ymax - v.ymin) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    const { sx, sy } = pxScale();
    const hit = props.draggable.find((p) => Math.hypot((p.x - w.x) * sx, (p.y - w.y) * sy) <= HIT_RADIUS);
    drag.current = hit
      ? { mode: "point", id: hit.id, x: e.clientX, y: e.clientY, vp: props.scene.viewport }
      : { mode: "pan", x: e.clientX, y: e.clientY, vp: props.scene.viewport };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d?.mode === "pan") {
      const r = canvas.current?.getBoundingClientRect();
      if (!r) return;
      const dx = ((e.clientX - d.x) / r.width) * (d.vp.xmax - d.vp.xmin);
      const dy = ((e.clientY - d.y) / r.height) * (d.vp.ymax - d.vp.ymin);
      emit({ ...d.vp, xmin: d.vp.xmin - dx, xmax: d.vp.xmax - dx, ymin: d.vp.ymin + dy, ymax: d.vp.ymax + dy });
      return;
    }
    if (d?.mode === "point" && d.id) {
      const w = toWorld(e.clientX, e.clientY);
      props.onDragPoint(d.id, w.x, w.y, "drag");
      return;
    }
    // Hover: trace the nearest curve within the hit radius.
    const w = toWorld(e.clientX, e.clientY);
    const { sx, sy } = pxScale();
    let best: { id: string; x: number; distance: number } | null = null;
    for (const target of props.traceTargets) {
      const c = closestPoint(target.segments, w.x, w.y, sx, sy);
      if (c && c.distance <= HIT_RADIUS && (!best || c.distance < best.distance)) best = { id: target.id, x: c.x, distance: c.distance };
    }
    props.onTrace(best ? { id: best.id, x: best.x } : null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "point" && d.id) {
      const w = toWorld(e.clientX, e.clientY);
      props.onDragPoint(d.id, w.x, w.y, "full");
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    zoomAt(w.x, w.y, e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  };

  // React's wheel listener is passive; block page scroll while the pointer is over the graph.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const stop = (ev: WheelEvent) => ev.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = props.scene.viewport;
    const dx = (v.xmax - v.xmin) * KEY_PAN;
    const dy = (v.ymax - v.ymin) * KEY_PAN;
    const cx = (v.xmin + v.xmax) / 2;
    const cy = (v.ymin + v.ymax) / 2;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => emit({ ...v, xmin: v.xmin - dx, xmax: v.xmax - dx }),
      ArrowRight: () => emit({ ...v, xmin: v.xmin + dx, xmax: v.xmax + dx }),
      ArrowUp: () => emit({ ...v, ymin: v.ymin + dy, ymax: v.ymax + dy }),
      ArrowDown: () => emit({ ...v, ymin: v.ymin - dy, ymax: v.ymax - dy }),
      "+": () => zoomAt(cx, cy, 1 / ZOOM_STEP),
      "=": () => zoomAt(cx, cy, 1 / ZOOM_STEP),
      "-": () => zoomAt(cx, cy, ZOOM_STEP),
    };
    const fn = moves[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div ref={wrap} className="mc-canvas-wrap" dir="ltr">
      <canvas
        ref={canvas}
        className="mc-canvas"
        tabIndex={0}
        role="img"
        aria-label={t("graphLabel")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag.current && props.onTrace(null)}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/** Slope-triangle run: one grid step, so the triangle stays a readable size at any zoom. */
export function triangleRun(v: Viewport): number {
  return gridStep(Math.max(v.xmax - v.xmin, v.ymax - v.ymin), 10);
}
