/**
 * MAE Academy / Signals & Systems — Tab D software 3D harmonic waterfall.
 * A pure Canvas 2D rotate + project pipeline (see software3d.ts) replaces the WebGL-backed
 * Plotly GL3D surface, so the visualization renders identically on every device. Camera and
 * drag state live only in refs — React re-renders only when `series`/`harmonics` change.
 */
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useRef } from "react";
import { waterfallHarmonics, type FourierSeriesResult } from "@/features/signals/engines/fourierEngine";
import { DEFAULT_CAMERA, MAX_ELEVATION, MAX_ZOOM, MIN_ZOOM, project3D, type Camera3D } from "./software3d";

type Props = { series: FourierSeriesResult; harmonics: number };
type Curve = { harmonic: number; points: Array<{ x: number; y: number; z: number }> };
type Drag = { x: number; y: number } | null;

/** Normalizes each harmonic's (time, harmonic·ω₀, amplitude) trajectory into the ±1 unit cube. */
function buildScene(series: FourierSeriesResult, harmonics: number): Curve[] {
  const raw = waterfallHarmonics(series, Math.min(12, harmonics), 90);
  if (raw.length === 0) return [];
  const maxHarmonic = Math.max(1, ...raw.map((harmonic) => Math.abs(harmonic.harmonic)));
  const maxAmplitude = Math.max(1e-6, ...raw.flatMap((harmonic) => harmonic.amplitude.map(Math.abs)));
  const halfPeriod = Math.max(1e-6, series.period / 2);
  return raw.map((harmonic) => ({
    harmonic: harmonic.harmonic,
    points: harmonic.time.map((t, index) => ({
      x: t / halfPeriod,
      y: (harmonic.amplitude[index] / maxAmplitude) * 0.82,
      z: (harmonic.harmonic / maxHarmonic) * 0.92,
    })),
  }));
}

export function FourierWaterfall3D({ series, harmonics }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<Camera3D>({ ...DEFAULT_CAMERA });
  const drag = useRef<Drag>(null);
  const data = useRef<Curve[]>(buildScene(series, harmonics));
  const drawRef = useRef<() => void>(() => undefined);

  useEffect(() => { data.current = buildScene(series, harmonics); drawRef.current(); }, [series, harmonics]);

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
      context.fillStyle = dark ? "#07101e" : "#f8fafc";
      context.fillRect(0, 0, bounds.width, bounds.height);

      const cx = bounds.width / 2;
      const cy = bounds.height / 2 + bounds.height * 0.08;
      const unit = Math.min(bounds.width, bounds.height) * 0.34 * camera.current.scale;
      const cam = { theta: camera.current.theta, phi: camera.current.phi, scale: unit };
      const project = (x: number, y: number, z: number) => project3D(x, y, z, cam, cx, cy);

      // Floor grid: a lattice on the y=0 plane spanning the (time, harmonic) axes.
      context.strokeStyle = dark ? "rgba(203,213,225,.16)" : "rgba(100,116,139,.2)";
      context.lineWidth = 1;
      for (let index = -5; index <= 5; index += 1) {
        const t = index / 5;
        const a = project(t, 0, -1);
        const b = project(t, 0, 1);
        context.beginPath(); context.moveTo(a.u, a.v); context.lineTo(b.u, b.v); context.stroke();
        const c1 = project(-1, 0, t);
        const c2 = project(1, 0, t);
        context.beginPath(); context.moveTo(c1.u, c1.v); context.lineTo(c2.u, c2.v); context.stroke();
      }

      // Axes rails.
      context.strokeStyle = dark ? "#334155" : "#94a3b8";
      context.lineWidth = 1.4;
      const drawLine = (p0: { u: number; v: number }, p1: { u: number; v: number }) => { context.beginPath(); context.moveTo(p0.u, p0.v); context.lineTo(p1.u, p1.v); context.stroke(); };
      drawLine(project(-1, 0, -1), project(1, 0, -1)); // time axis
      drawLine(project(-1, 0, -1), project(-1, 0, 1)); // harmonic axis
      drawLine(project(-1, 0, -1), project(-1, 1, -1)); // amplitude axis

      context.fillStyle = dark ? "#cbd5e1" : "#334155";
      context.font = "600 11px ui-monospace, monospace";
      const timeLabel = project(1, 0, -1); context.fillText("t", timeLabel.u + 6, timeLabel.v + 4);
      const harmonicLabel = project(-1, 0, 1); context.fillText("kω₀", harmonicLabel.u + 6, harmonicLabel.v + 4);
      const amplitudeLabel = project(-1, 1, -1); context.fillText("A", amplitudeLabel.u - 4, amplitudeLabel.v - 8);

      // Depth-sort the harmonic curves back-to-front (painter's algorithm).
      const curves = data.current;
      const maxAbsHarmonic = Math.max(1, ...curves.map((curve) => Math.abs(curve.harmonic)));
      const withDepth = curves
        .map((curve) => {
          const projected = curve.points.map((point) => project(point.x, point.y, point.z));
          const avgDepth = projected.reduce((sum, point) => sum + point.depth, 0) / projected.length;
          return { curve, projected, avgDepth };
        })
        .sort((a, b) => a.avgDepth - b.avgDepth);

      for (const { curve, projected } of withDepth) {
        const isFundamental = curve.harmonic === 0;
        const recession = Math.abs(curve.harmonic) / maxAbsHarmonic; // 0 = centered, 1 = farthest harmonic
        context.strokeStyle = isFundamental ? "#2563EB" : `rgba(124,58,237,${(0.35 + 0.55 * (1 - recession)).toFixed(3)})`;
        context.lineWidth = isFundamental ? 2.5 : 1.6;
        context.beginPath();
        projected.forEach((point, index) => (index === 0 ? context.moveTo(point.u, point.v) : context.lineTo(point.u, point.v)));
        context.stroke();
      }
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
    <div className="relative h-[430px] w-full overflow-hidden rounded-2xl border border-violet-400/30 bg-[#07101e]">
      <canvas
        ref={canvas}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D time frequency harmonic waterfall. Drag to rotate and use the wheel to zoom."
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

export default FourierWaterfall3D;
