/**
 * MAE Academy / Signals & Systems — Tab A canvas scope.
 * The canvas is imperative by design: view coordinates live in refs and redraw
 * directly on pan/zoom; sampled plot arrays are never stored in React state.
 */
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useRef } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { evaluateWindowedSignal, plotWindowedSegments, type ImpulseMarker, type PeriodMode, type SignalNode, type SignalWindow } from "@/lib/signals/signalEngine";

type ScreenRect = { width: number; height: number };
type Viewport = { centerT: number; centerY: number; secondsPerPixel: number };
type MathPoint = { t: number; value: number };

export class MathToPixels {
  constructor(private readonly rect: ScreenRect, private readonly view: Viewport) {}
  x(time: number) { return this.rect.width / 2 + (time - this.view.centerT) / this.view.secondsPerPixel; }
  y(value: number) { return this.rect.height / 2 - (value - this.view.centerY) / this.view.secondsPerPixel; }
}

export class PixelsToMath {
  constructor(private readonly rect: ScreenRect, private readonly view: Viewport) {}
  point(x: number, y: number): MathPoint { return { t: this.view.centerT + (x - this.rect.width / 2) * this.view.secondsPerPixel, value: this.view.centerY - (y - this.rect.height / 2) * this.view.secondsPerPixel }; }
}

function arrow(context: CanvasRenderingContext2D, x: number, from: number, to: number, color: string) {
  const direction = Math.sign(to - from) || -1; const head = 7;
  context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 2.2;
  context.beginPath(); context.moveTo(x, from); context.lineTo(x, to); context.stroke();
  context.beginPath(); context.moveTo(x, to); context.lineTo(x - head, to - direction * head); context.lineTo(x + head, to - direction * head); context.closePath(); context.fill();
}

function trace(context: CanvasRenderingContext2D, mapper: MathToPixels, segments: Array<Array<{ t: number; value: number }>>, stroke: string, width: number, dash: number[] = []) {
  context.save(); context.strokeStyle = stroke; context.lineWidth = width; context.lineJoin = "round"; context.lineCap = "round"; context.setLineDash(dash);
  // Every segment starts with moveTo. This is the deliberate breakSegment rule:
  // no lineTo is permitted across a discontinuity such as u(t) or rect(t).
  segments.forEach((segment) => { context.beginPath(); segment.forEach((point, index) => { const x = mapper.x(point.t); const y = mapper.y(point.value); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); });
  context.restore();
}

function symmetrySegments(node: SignalNode, window: SignalWindow, periodMode: PeriodMode, from: number, to: number, mode: "even" | "odd") {
  const samples = 720; const segment: Array<{ t: number; value: number }> = [];
  for (let index = 0; index <= samples; index += 1) { const t = from + (to - from) * index / samples; const forward = evaluateWindowedSignal(node, t, window, periodMode); const reflected = evaluateWindowedSignal(node, -t, window, periodMode); const value = mode === "even" ? (forward + reflected) / 2 : (forward - reflected) / 2; if (Number.isFinite(value) && Math.abs(value) < 1e4) segment.push({ t, value }); }
  return [segment];
}

type Props = { node: SignalNode; signalWindow: SignalWindow; periodMode: PeriodMode; impulses: ImpulseMarker[]; showEven: boolean; showOdd: boolean };

export function SignalCanvas({ node, signalWindow, periodMode, impulses, showEven, showOdd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<Viewport>({ centerT: 0, centerY: 0, secondsPerPixel: 0.022 });
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const renderRef = useRef<() => void>(() => undefined);
  const impulseNodesRef = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    let animationFrame = 0;
    const render = () => {
      const bounds = canvas.getBoundingClientRect(); if (bounds.width < 1 || bounds.height < 1) return;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(bounds.width * pixelRatio)); canvas.height = Math.max(1, Math.floor(bounds.height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const rect = { width: bounds.width, height: bounds.height }; const view = viewRef.current;
      const mapper = new MathToPixels(rect, view); const inverse = new PixelsToMath(rect, view);
      const dark = document.documentElement.classList.contains("dark");
      const background = dark ? "#080f1c" : "#ffffff"; const grid = dark ? "rgba(100,116,139,0.22)" : "rgba(100,116,139,0.17)";
      const axis = dark ? "rgba(196,181,253,0.72)" : "rgba(109,40,217,0.58)"; const ink = dark ? "#60a5fa" : "#2563eb";
      context.fillStyle = background; context.fillRect(0, 0, rect.width, rect.height);
      const left = inverse.point(0, 0).t; const right = inverse.point(rect.width, 0).t; const bottom = inverse.point(0, rect.height).value; const top = inverse.point(0, 0).value;
      const minorStep = 0.5 * Math.pow(10, Math.floor(Math.log10(Math.max(view.secondsPerPixel * 90, 0.001))));
      context.strokeStyle = grid; context.lineWidth = 1; context.setLineDash([2, 5]);
      for (let value = Math.floor(left / minorStep) * minorStep; value <= right; value += minorStep) { const x = mapper.x(value); context.beginPath(); context.moveTo(x, 0); context.lineTo(x, rect.height); context.stroke(); }
      for (let value = Math.floor(bottom / minorStep) * minorStep; value <= top; value += minorStep) { const y = mapper.y(value); context.beginPath(); context.moveTo(0, y); context.lineTo(rect.width, y); context.stroke(); }
      context.setLineDash([]); context.strokeStyle = axis; context.lineWidth = 1.15; context.beginPath(); context.moveTo(0, mapper.y(0)); context.lineTo(rect.width, mapper.y(0)); context.moveTo(mapper.x(0), 0); context.lineTo(mapper.x(0), rect.height); context.stroke();
      trace(context, mapper, plotWindowedSegments(node, signalWindow, periodMode, left, right), ink, 2.55);
      if (showEven) trace(context, mapper, symmetrySegments(node, signalWindow, periodMode, left, right, "even"), dark ? "#c4b5fd" : "#7c3aed", 1.5, [6, 5]);
      if (showOdd) trace(context, mapper, symmetrySegments(node, signalWindow, periodMode, left, right, "odd"), dark ? "#fb7185" : "#e11d48", 1.5, [2, 4]);
      impulses.forEach((impulse, index) => {
        const x = mapper.x(impulse.at); const baseline = mapper.y(0); const length = Math.min(118, 36 + Math.abs(impulse.area) * 38); const endpoint = baseline - Math.sign(impulse.area || 1) * length;
        if (x > -20 && x < rect.width + 20) arrow(context, x, baseline, endpoint, dark ? "#f472b6" : "#e11d48");
        const label = impulseNodesRef.current.get(index); if (label) { label.style.display = x > -40 && x < rect.width + 40 ? "block" : "none"; label.style.transform = `translate(${x + 10}px, ${Math.min(rect.height - 28, Math.max(8, endpoint - 10))}px)`; }
      });
      context.fillStyle = dark ? "#94a3b8" : "#475569"; context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText("t", rect.width - 14, Math.max(13, mapper.y(0) - 6)); context.fillText("x(t)", Math.min(rect.width - 32, mapper.x(0) + 7), 14);
      context.fillStyle = dark ? "#cbd5e1" : "#334155"; context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText(`${view.secondsPerPixel < 0.01 ? view.secondsPerPixel.toFixed(3) : view.secondsPerPixel.toFixed(2)} s/px`, 12, rect.height - 12);
    };
    const scheduleRender = () => { cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(render); };
    renderRef.current = scheduleRender; scheduleRender(); const observer = new ResizeObserver(scheduleRender); observer.observe(canvas);
    return () => { observer.disconnect(); cancelAnimationFrame(animationFrame); };
  }, [impulses, node, periodMode, showEven, showOdd, signalWindow]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => { pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => { const pointer = pointerRef.current; if (!pointer || pointer.id !== event.pointerId) return; const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y; pointerRef.current = { ...pointer, x: event.clientX, y: event.clientY }; const view = viewRef.current; const precisionPan = 0.56; view.centerT -= dx * view.secondsPerPixel * precisionPan; view.centerY += dy * view.secondsPerPixel * precisionPan; renderRef.current(); };
  const onPointerUp = () => { pointerRef.current = null; };
  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => { event.preventDefault(); const canvas = canvasRef.current; if (!canvas) return; const bounds = canvas.getBoundingClientRect(); const view = viewRef.current; const before = new PixelsToMath({ width: bounds.width, height: bounds.height }, view).point(event.clientX - bounds.left, event.clientY - bounds.top); const wheelStep = 0.0625; const factor = event.deltaY > 0 ? 1 + wheelStep : 1 / (1 + wheelStep); view.secondsPerPixel = Math.max(0.002, Math.min(0.25, view.secondsPerPixel * factor)); const after = new PixelsToMath({ width: bounds.width, height: bounds.height }, view).point(event.clientX - bounds.left, event.clientY - bounds.top); view.centerT += before.t - after.t; view.centerY += before.value - after.value; renderRef.current(); };

  return <div className="relative min-h-[390px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#080f1c]">
    <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} aria-label="Interactive signal plot: drag to pan and use the wheel to zoom" className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing" />
    <div className="pointer-events-none absolute inset-0" aria-hidden>{impulses.map((impulse, index) => <div key={`${impulse.at}-${index}`} ref={(element) => { if (element) impulseNodesRef.current.set(index, element); else impulseNodesRef.current.delete(index); }} className="absolute left-0 top-0 rounded border border-rose-400/35 bg-slate-950/85 px-1.5 py-0.5 text-[10px] text-rose-100 shadow-sm"><KatexMath math={impulse.latex} /></div>)}</div>
    <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-3 rounded-lg border border-slate-700/70 bg-slate-950/75 px-2.5 py-1.5 text-[10px] font-bold text-slate-300"><span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 bg-blue-400" />x(t)</span>{showEven && <span className="inline-flex items-center gap-1"><i className="h-px w-4 border-t border-dashed border-violet-300" />even</span>}{showOdd && <span className="inline-flex items-center gap-1"><i className="h-px w-4 border-t border-dotted border-rose-400" />odd</span>}</div>
  </div>;
}

export default SignalCanvas;
