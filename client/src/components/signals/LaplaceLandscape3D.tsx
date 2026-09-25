/**
 * MAE Academy / Signals & Systems — Tab E software 3D magnitude landscape.
 * A pure Canvas 2D rotate + project pipeline (see software3d.ts) replaces the WebGL-backed
 * Plotly GL3D surface: a wireframe |H(s)| height field over the complex plane, rendered with
 * zero GPU dependency. Camera state lives only in a ref — React re-renders only on `system` change.
 */
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useRef } from "react";
import { magnitudeLandscape, type TransferFunction } from "@/features/signals/engines/laplaceEngine";
import { DEFAULT_CAMERA, MAX_ELEVATION, MAX_ZOOM, MIN_ZOOM, project3D, rampColor, type Camera3D } from "./software3d";

type Point3 = { x: number; y: number; z: number; t: number };
type Scene = { rows: Point3[][]; cols: Point3[][]; path: Point3[]; axisLabels: { x: string; y: string } };
type Drag = { x: number; y: number } | null;

const HEIGHT_SCALE = 1.15;
const RESOLUTION = 30;
const SPAN = 4;
const CEILING = 14;
// A wireframe (unlike a shaded, filled surface) has no ambient/specular fill to keep the valleys
// visible, so every stop stays bright enough to read on the dark canvas — even the "low" end.
const SURFACE_RAMP = ["#1e3a8a", "#2563eb", "#7c3aed", "#c026d3", "#f43f5e"] as const;

/** Normalizes the |H| height field and the frequency-response slice into the ±1 unit cube. */
function buildScene(system: TransferFunction): Scene {
  const landscape = magnitudeLandscape(system, RESOLUTION, SPAN, CEILING);
  const toPoint = (real: number, imaginary: number, magnitude: number): Point3 => ({
    x: real / SPAN,
    y: (magnitude / CEILING) * HEIGHT_SCALE,
    z: imaginary / SPAN,
    t: magnitude / CEILING,
  });
  const rows = landscape.y.map((imaginary, iy) => landscape.x.map((real, ix) => toPoint(real, imaginary, landscape.z[iy][ix])));
  const cols = landscape.x.map((_, ix) => landscape.y.map((imaginary, iy) => toPoint(landscape.x[ix], imaginary, landscape.z[iy][ix])));
  const path = landscape.path.x.map((real, index) => toPoint(real, landscape.path.y[index], landscape.path.z[index]));
  return { rows, cols, path, axisLabels: system.mode === "s" ? { x: "σ", y: "jω" } : { x: "Re{z}", y: "Im{z}" } };
}

export function LaplaceLandscape3D({ system }: { system: TransferFunction }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<Camera3D>({ ...DEFAULT_CAMERA });
  const drag = useRef<Drag>(null);
  const data = useRef<Scene>(buildScene(system));
  const drawRef = useRef<() => void>(() => undefined);

  useEffect(() => { data.current = buildScene(system); drawRef.current(); }, [system]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let frame = 0;
    const draw = () => {
      const context = element.getContext("2d");
      if (!context) return;
      const bounds = element.getBoundingClientRect();
      const ratio = devicePixelRatio || 1;
      element.width = Math.floor(bounds.width * ratio);
      element.height = Math.floor(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const dark = document.documentElement.classList.contains("dark");
      context.fillStyle = "#07101e";
      context.fillRect(0, 0, bounds.width, bounds.height);

      const cx = bounds.width / 2;
      const cy = bounds.height / 2 + bounds.height * 0.1;
      const unit = Math.min(bounds.width, bounds.height) * 0.32 * camera.current.scale;
      const cam = { theta: camera.current.theta, phi: camera.current.phi, scale: unit };
      const project = (point: Point3) => ({ ...project3D(point.x, point.y, point.z, cam, cx, cy), t: point.t });

      // Base grid on the z=0 (magnitude-floor) plane, in subtle slate.
      context.strokeStyle = "rgba(203,213,225,.14)";
      context.lineWidth = 1;
      for (let index = -4; index <= 4; index += 1) {
        const t = index / 4;
        const a = project3D(t, 0, -1, cam, cx, cy);
        const b = project3D(t, 0, 1, cam, cx, cy);
        context.beginPath(); context.moveTo(a.u, a.v); context.lineTo(b.u, b.v); context.stroke();
        const c1 = project3D(-1, 0, t, cam, cx, cy);
        const c2 = project3D(1, 0, t, cam, cx, cy);
        context.beginPath(); context.moveTo(c1.u, c1.v); context.lineTo(c2.u, c2.v); context.stroke();
      }

      const scene = data.current;

      // Depth-sort every mesh polyline (rows + columns) back-to-front for a clean wireframe.
      type Line = { projected: Array<{ u: number; v: number; depth: number; t: number }>; avgDepth: number; avgT: number };
      const toLine = (points: Point3[]): Line => {
        const projected = points.map(project);
        const avgDepth = projected.reduce((sum, point) => sum + point.depth, 0) / projected.length;
        const avgT = projected.reduce((sum, point) => sum + point.t, 0) / projected.length;
        return { projected, avgDepth, avgT };
      };
      const lines = [...scene.rows.map(toLine), ...scene.cols.map(toLine)].sort((a, b) => a.avgDepth - b.avgDepth);

      for (const line of lines) {
        context.strokeStyle = rampColor(SURFACE_RAMP, line.avgT);
        context.globalAlpha = dark ? 0.85 : 0.75;
        context.lineWidth = 1.1;
        context.beginPath();
        line.projected.forEach((point, index) => (index === 0 ? context.moveTo(point.u, point.v) : context.lineTo(point.u, point.v)));
        context.stroke();
      }
      context.globalAlpha = 1;

      // Axes rails.
      context.strokeStyle = "#475569";
      context.lineWidth = 1.4;
      const drawLine = (p0: { u: number; v: number }, p1: { u: number; v: number }) => { context.beginPath(); context.moveTo(p0.u, p0.v); context.lineTo(p1.u, p1.v); context.stroke(); };
      drawLine(project3D(-1, 0, -1, cam, cx, cy), project3D(1, 0, -1, cam, cx, cy));
      drawLine(project3D(-1, 0, -1, cam, cx, cy), project3D(-1, 0, 1, cam, cx, cy));
      drawLine(project3D(-1, 0, -1, cam, cx, cy), project3D(-1, 1, -1, cam, cx, cy));

      context.fillStyle = "#cbd5e1";
      context.font = "600 11px ui-monospace, monospace";
      const xLabel = project3D(1, 0, -1, cam, cx, cy); context.fillText(scene.axisLabels.x, xLabel.u + 6, xLabel.v + 4);
      const zLabel = project3D(-1, 0, 1, cam, cx, cy); context.fillText(scene.axisLabels.y, zLabel.u + 6, zLabel.v + 4);
      const yLabel = project3D(-1, 1, -1, cam, cx, cy); context.fillText("|H|", yLabel.u - 4, yLabel.v - 8);

      // The highlighted frequency-response slice (jω axis or unit circle) drawn last, on top.
      const path = scene.path.map(project);
      context.strokeStyle = "#10b981";
      context.lineWidth = 2.5;
      context.beginPath();
      path.forEach((point, index) => (index === 0 ? context.moveTo(point.u, point.v) : context.lineTo(point.u, point.v)));
      context.stroke();
    };
    drawRef.current = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    drawRef.current();
    const observer = new ResizeObserver(drawRef.current);
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => { drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    camera.current.theta += dx * 0.008;
    camera.current.phi = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, camera.current.phi + dy * 0.008));
    drawRef.current();
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    camera.current.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.current.scale * (event.deltaY > 0 ? 0.9 : 1.11)));
    drawRef.current();
  };
  const resetView = () => { camera.current = { ...DEFAULT_CAMERA }; drawRef.current(); };

  return (
    <div className="relative h-[440px] overflow-hidden rounded-2xl border border-violet-400/30 bg-[#07101e]">
      <canvas
        ref={canvas}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D magnitude landscape over the complex plane. Drag to rotate and use the wheel to zoom."
      />
      <button
        type="button"
        onClick={resetView}
        className="absolute right-3 top-3 rounded-full border border-violet-400/40 bg-slate-950/70 px-3 py-1 text-[11px] font-bold text-violet-100 backdrop-blur transition hover:bg-slate-900/80"
      >
        Reset View
      </button>
    </div>
  );
}

export default LaplaceLandscape3D;
