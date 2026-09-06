/**
 * MAE Academy / Signals & Systems — Tab B proof renderer.
 * Each canvas redraws from pure classifier functions inside requestAnimationFrame;
 * slider motion never stores chart geometry in React state.
 */
import { useEffect, useRef } from "react";
import { classifySystem, evaluateSystem, shiftTestSamples, stabilitySamples, superpositionSamples, x1, x2, type PillarId, type SystemSemantic } from "@/features/signals/engines/systemClassifier";

type Props = { system: SystemSemantic; pillar: PillarId; a: number; b: number; t0: number };
type Point = { t: number; value: number };

function drawArrow(context: CanvasRenderingContext2D, x: number, y: number, color: string) { context.fillStyle = color; context.beginPath(); context.moveTo(x, y); context.lineTo(x - 5, y - 8); context.lineTo(x + 5, y - 8); context.closePath(); context.fill(); }
function trace(context: CanvasRenderingContext2D, points: Point[], mapX: (time: number) => number, mapY: (value: number) => number, color: string, dash: number[] = [], width = 2.2) { context.save(); context.strokeStyle = color; context.lineWidth = width; context.lineCap = "round"; context.lineJoin = "round"; context.setLineDash(dash); context.beginPath(); points.forEach((point, index) => { const x = mapX(point.t); const y = mapY(point.value); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); context.restore(); }
function makeGrid(context: CanvasRenderingContext2D, width: number, height: number, mapX: (time: number) => number, mapY: (value: number) => number, from: number, to: number, minY: number, maxY: number, dark: boolean) { const grid = dark ? "rgba(100,116,139,0.18)" : "rgba(100,116,139,0.17)"; context.strokeStyle = grid; context.lineWidth = 1; context.setLineDash([2, 4]); for (let time = Math.ceil(from); time <= to; time += 1) { const x = mapX(time); context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); } for (let value = Math.ceil(minY); value <= maxY; value += Math.max(1, Math.round((maxY - minY) / 4))) { const y = mapY(value); context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); } context.setLineDash([]); const axis = dark ? "rgba(196,181,253,0.70)" : "rgba(109,40,217,0.55)"; context.strokeStyle = axis; context.lineWidth = 1.1; context.beginPath(); context.moveTo(0, mapY(0)); context.lineTo(width, mapY(0)); context.moveTo(mapX(0), 0); context.lineTo(mapX(0), height); context.stroke(); }

export function SystemProofCanvas({ system, pillar, a, b, t0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const context = canvas.getContext("2d"); if (!context) return;
    let frame = 0;
    const render = () => {
      const bounds = canvas.getBoundingClientRect(); if (bounds.width < 1 || bounds.height < 1) return;
      const ratio = window.devicePixelRatio || 1; canvas.width = Math.floor(bounds.width * ratio); canvas.height = Math.floor(bounds.height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = bounds.width; const height = bounds.height; const dark = document.documentElement.classList.contains("dark"); const background = dark ? "#07101e" : "#ffffff"; const blue = dark ? "#60a5fa" : "#2563eb"; const orange = dark ? "#fb923c" : "#ea580c"; const red = dark ? "#fb7185" : "#e11d48"; const muted = dark ? "#94a3b8" : "#64748b";
      context.fillStyle = background; context.fillRect(0, 0, width, height);
      let from = -3; let to = 3; let minY = -1.75; let maxY = 1.75; let label = "";
      const report = classifySystem(system); const verdict = report.pillars.find((item) => item.id === pillar)?.verdict ?? "";
      if (pillar === "stability") { from = -2; to = 8; const points = stabilitySamples(system, from, to); const range = Math.max(1.2, ...points.map((point) => Math.abs(point.output))) * 1.12; minY = -range; maxY = range; const mapX = (time: number) => (time - from) / (to - from) * width; const mapY = (value: number) => height / 2 - value / (maxY - minY) * height; makeGrid(context, width, height, mapX, mapY, from, to, minY, maxY, dark); trace(context, points.map((point) => ({ t: point.t, value: point.input })), mapX, mapY, muted, [5, 5], 1.5); trace(context, points.map((point) => ({ t: point.t, value: point.output })), mapX, mapY, verdict === "Unstable" ? red : blue, [], 2.4); label = `${verdict === "Unstable" ? "Auto-range" : "Bounded range"} ±${range.toFixed(1)}`; }
      else { const mapX = (time: number) => (time - from) / (to - from) * width; const mapY = (value: number) => height / 2 - value / (maxY - minY) * height; makeGrid(context, width, height, mapX, mapY, from, to, minY, maxY, dark);
        if (pillar === "linearity") { const data = superpositionSamples(system, a, b, from, to); trace(context, data.map((point) => ({ t: point.t, value: point.left })), mapX, mapY, blue, [], 3); trace(context, data.map((point) => ({ t: point.t, value: point.right })), mapX, mapY, orange, [8, 5], 1.8); label = Math.max(...data.map((point) => Math.abs(point.difference))) < 1e-5 ? "Coincident traces" : "Separated traces"; }
        if (pillar === "time") { const data = shiftTestSamples(system, t0, from, to); trace(context, data.map((point) => ({ t: point.t, value: point.left })), mapX, mapY, blue, [], 3); trace(context, data.map((point) => ({ t: point.t, value: point.right })), mapX, mapY, orange, [8, 5], 1.8); label = Math.max(...data.map((point) => Math.abs(point.difference))) < 1e-5 ? "Coincident shifts" : "Different shifts"; }
        if (pillar === "causality") { const currentTime = 0.55; const sample = system.terms.find((term) => term.kind === "input-sample"); const required = sample?.kind === "input-sample" ? sample.argument.slope * currentTime + sample.argument.offset : currentTime; const dependency = (time: number) => x2(time); context.fillStyle = "rgba(244,63,94,0.13)"; context.fillRect(mapX(currentTime), 0, width - mapX(currentTime), height); trace(context, Array.from({ length: 360 }, (_, index) => { const t = from + (to - from) * index / 359; return { t, value: dependency(t) }; }), mapX, mapY, muted, [], 1.8); context.strokeStyle = dark ? "#fbbf24" : "#a16207"; context.setLineDash([4, 4]); context.beginPath(); context.moveTo(mapX(currentTime), 0); context.lineTo(mapX(currentTime), height); context.stroke(); context.setLineDash([]); context.strokeStyle = verdict === "Non-Causal" ? red : blue; context.beginPath(); context.moveTo(mapX(required), mapY(0)); context.lineTo(mapX(required), mapY(dependency(required))); context.stroke(); context.fillStyle = verdict === "Non-Causal" ? red : blue; context.beginPath(); context.arc(mapX(required), mapY(dependency(required)), 4, 0, Math.PI * 2); context.fill(); label = verdict === "Non-Causal" ? "Future input dependency" : "Present / past dependency"; }
        if (pillar === "memory") { const input = x2; const points = Array.from({ length: 360 }, (_, index) => { const t = from + (to - from) * index / 359; return { t, value: evaluateSystem(system, input, t) }; }); const raw = Array.from({ length: 360 }, (_, index) => { const t = from + (to - from) * index / 359; return { t, value: input(t) }; }); trace(context, raw, mapX, mapY, muted, [4, 4], 1.5); trace(context, points, mapX, mapY, verdict === "Dynamic" ? orange : blue, [], 2.4); label = verdict === "Dynamic" ? "Output samples another time / history" : "Output samples x(t) only"; }
      }
      context.fillStyle = dark ? "#cbd5e1" : "#334155"; context.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText(label, 12, height - 12); context.fillStyle = muted; context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace"; context.fillText("t", width - 15, Math.max(13, height / 2 - 6));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); }; schedule(); const observer = new ResizeObserver(schedule); observer.observe(canvas); return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [a, b, pillar, system, t0]);
  return <canvas ref={canvasRef} aria-label={`${pillar} graphical proof`} className="h-52 w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07101e]" />;
}

export default SystemProofCanvas;
