/**
 * MAE Academy / Signals & Systems — Piecewise Signal Scope.
 * Presentation boundary only: coordinates, Canvas drawing, and pointer interaction live here;
 * signal definitions, transformations, sampling, and symbolic impulses remain in signalsEngine.
 */
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useRef } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { estimateVisibleAmplitude, samplePiecewiseSignal, type PiecewiseSignalModel } from "@/utils/signalsEngine";

type Viewport = { centerTime: number; centerValue: number; secondsPerPixel: number };
type Props = { model: PiecewiseSignalModel };

class MathToPixels {
  constructor(private readonly width: number, private readonly height: number, private readonly view: Viewport) {}
  x(time: number) { return this.width / 2 + (time - this.view.centerTime) / this.view.secondsPerPixel; }
  y(value: number) { return this.height / 2 - (value - this.view.centerValue) / this.view.secondsPerPixel; }
}

class PixelsToMath {
  constructor(private readonly width: number, private readonly height: number, private readonly view: Viewport) {}
  point(x: number, y: number) { return { time: this.view.centerTime + (x - this.width / 2) * this.view.secondsPerPixel, value: this.view.centerValue - (y - this.height / 2) * this.view.secondsPerPixel }; }
}

function drawArrow(context: CanvasRenderingContext2D, x: number, baseline: number, endpoint: number) {
  const direction = Math.sign(endpoint - baseline) || -1;
  context.strokeStyle = "#f43f5e"; context.fillStyle = "#f43f5e"; context.lineWidth = 2.3;
  context.beginPath(); context.moveTo(x, baseline); context.lineTo(x, endpoint); context.stroke();
  context.beginPath(); context.moveTo(x, endpoint); context.lineTo(x - 7, endpoint - direction * 7); context.lineTo(x + 7, endpoint - direction * 7); context.closePath(); context.fill();
}

export function PiecewiseSignalScope({ model }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ centerTime: 0, centerValue: 0, secondsPerPixel: 0.018 });
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const renderRef = useRef<() => void>(() => undefined);
  const impulseLabelsRef = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    let frame = 0;
    const render = () => {
      const bounds = canvas.getBoundingClientRect(); if (bounds.width < 1 || bounds.height < 1) return;
      const dpr = window.devicePixelRatio || 1; canvas.width = Math.max(1, Math.floor(bounds.width * dpr)); canvas.height = Math.max(1, Math.floor(bounds.height * dpr)); context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = bounds.width; const height = bounds.height; const view = viewportRef.current; const toPixel = new MathToPixels(width, height, view); const toMath = new PixelsToMath(width, height, view);
      const dark = document.documentElement.classList.contains("dark"); const background = dark ? "#080f1c" : "#ffffff"; const grid = dark ? "rgba(100,116,139,0.22)" : "rgba(100,116,139,0.18)"; const axis = dark ? "rgba(196,181,253,0.72)" : "rgba(109,40,217,0.62)";
      context.fillStyle = background; context.fillRect(0, 0, width, height);
      const left = toMath.point(0, 0).time; const right = toMath.point(width, 0).time; const bottom = toMath.point(0, height).value; const top = toMath.point(0, 0).value;
      const gridStep = 0.5 * Math.pow(10, Math.floor(Math.log10(Math.max(view.secondsPerPixel * 88, 0.001))));
      context.strokeStyle = grid; context.lineWidth = 1; context.setLineDash([2, 5]);
      for (let time = Math.floor(left / gridStep) * gridStep; time <= right; time += gridStep) { context.beginPath(); context.moveTo(toPixel.x(time), 0); context.lineTo(toPixel.x(time), height); context.stroke(); }
      for (let value = Math.floor(bottom / gridStep) * gridStep; value <= top; value += gridStep) { context.beginPath(); context.moveTo(0, toPixel.y(value)); context.lineTo(width, toPixel.y(value)); context.stroke(); }
      context.setLineDash([]); context.strokeStyle = axis; context.lineWidth = 1.15; context.beginPath(); context.moveTo(0, toPixel.y(0)); context.lineTo(width, toPixel.y(0)); context.moveTo(toPixel.x(0), 0); context.lineTo(toPixel.x(0), height); context.stroke();
      const segments = samplePiecewiseSignal(model, left, right, 1400); context.strokeStyle = dark ? "#60a5fa" : "#2563eb"; context.lineWidth = 2.6; context.lineCap = "round"; context.lineJoin = "round";
      segments.forEach(segment => { context.beginPath(); segment.forEach((point, index) => { const x = toPixel.x(point.time); const y = toPixel.y(point.value); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); });
      model.impulses.forEach((impulse, index) => { const x = toPixel.x(impulse.time); const baseline = toPixel.y(0); const endpoint = baseline - Math.sign(impulse.weight || 1) * Math.min(110, 34 + Math.abs(impulse.weight) * 34); if (x > -20 && x < width + 20) drawArrow(context, x, baseline, endpoint); const label = impulseLabelsRef.current.get(index); if (label) { label.style.display = x > -45 && x < width + 45 ? "block" : "none"; label.style.transform = `translate(${x + 10}px, ${Math.min(height - 30, Math.max(8, endpoint - 12))}px)`; } });
      context.fillStyle = dark ? "#cbd5e1" : "#475569"; context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText("t [s]", width - 40, Math.max(13, toPixel.y(0) - 7)); context.fillText("y(t)", Math.min(width - 34, toPixel.x(0) + 7), 14); context.fillStyle = dark ? "#94a3b8" : "#64748b"; context.fillText(`${view.secondsPerPixel.toFixed(3)} s/px`, 12, height - 12);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    renderRef.current = schedule; schedule(); const observer = new ResizeObserver(schedule); observer.observe(canvas);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [model]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => { pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => { const pointer = pointerRef.current; if (!pointer || pointer.id !== event.pointerId) return; const view = viewportRef.current; view.centerTime -= (event.clientX - pointer.x) * view.secondsPerPixel * 0.56; view.centerValue += (event.clientY - pointer.y) * view.secondsPerPixel * 0.56; pointerRef.current = { ...pointer, x: event.clientX, y: event.clientY }; renderRef.current(); };
  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => { event.preventDefault(); const canvas = canvasRef.current; if (!canvas) return; const bounds = canvas.getBoundingClientRect(); const view = viewportRef.current; const before = new PixelsToMath(bounds.width, bounds.height, view).point(event.clientX - bounds.left, event.clientY - bounds.top); const factor = event.deltaY > 0 ? 1.0625 : 1 / 1.0625; view.secondsPerPixel = Math.max(0.0015, Math.min(0.25, view.secondsPerPixel * factor)); const after = new PixelsToMath(bounds.width, bounds.height, view).point(event.clientX - bounds.left, event.clientY - bounds.top); view.centerTime += before.time - after.time; view.centerValue += before.value - after.value; renderRef.current(); };
  const amplitude = estimateVisibleAmplitude(model, -6, 6);

  return <div className="relative min-h-[430px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#080f1c]"><canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { pointerRef.current = null; }} onPointerCancel={() => { pointerRef.current = null; }} onWheel={onWheel} aria-label="Interactive piecewise signal plot; drag to pan and use the wheel to zoom" className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing" /><div className="pointer-events-none absolute inset-0" aria-hidden>{model.impulses.map((impulse, index) => <div key={`${impulse.time}-${index}`} ref={(node) => { if (node) impulseLabelsRef.current.set(index, node); else impulseLabelsRef.current.delete(index); }} className="absolute left-0 top-0 rounded border border-rose-400/35 bg-slate-950/85 px-1.5 py-0.5 text-[10px] text-rose-100 shadow-sm"><KatexMath math={impulse.latex} /></div>)}</div><div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-slate-700/70 bg-slate-950/75 px-2.5 py-1.5 font-mono text-[10px] font-bold text-slate-300">±{amplitude.toFixed(2)} VU</div></div>;
}

export default PiecewiseSignalScope;
