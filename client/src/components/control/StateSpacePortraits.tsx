/**
 * MAE State-Space Studio visual system: monochrome blueprint plots.
 * Canvas vectors and trajectories remain solid black/white; control equations
 * and state labels are routed through KaTeX in the surrounding instrument UI.
 */
import { MousePointer2, Orbit } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { KatexMath } from "@/components/ui/KatexMath";
import { integrateStateRK4, type Matrix, type Vector } from "@/lib/matrixMath";

type LocaleCode = "en" | "ar" | "es";
type Props = { matrix: Matrix; closedLoopMatrix?: Matrix; order: 2 | 3 };
const CARD = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const HEADING = "text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white";
const FIELD = "rounded-xl border border-slate-200 bg-white text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white";

const copy: Record<LocaleCode, { title: string; initial: string; duration: string; dynamics: string; open: string; closed: string; plane: string; field: string; trajectory: string; space: string; rotate: string; drag: string }> = {
  en: { title: "Phase Portrait Engine", initial: "Initial state", duration: "Duration", dynamics: "Dynamics", open: "Open loop", closed: "Closed loop", plane: "2D phase plane", field: "Vector field", trajectory: "RK4 trajectory", space: "3D state space", rotate: "Rotate view", drag: "Drag the plot to inspect the state trajectory." },
  ar: { title: "محرك مخطط الطور", initial: "الحالة الابتدائية", duration: "المدة", dynamics: "الديناميكيات", open: "حلقة مفتوحة", closed: "حلقة مغلقة", plane: "مستوى الطور ثنائي الأبعاد", field: "حقل المتجهات", trajectory: "مسار RK4", space: "فضاء الحالة ثلاثي الأبعاد", rotate: "تدوير العرض", drag: "اسحب الرسم لفحص مسار الحالة." },
  es: { title: "Motor de retrato de fase", initial: "Estado inicial", duration: "Duración", dynamics: "Dinámica", open: "Lazo abierto", closed: "Lazo cerrado", plane: "Plano de fase 2D", field: "Campo vectorial", trajectory: "Trayectoria RK4", space: "Espacio de estados 3D", rotate: "Rotar vista", drag: "Arrastre el gráfico para inspeccionar la trayectoria de estado." },
};

function drawArrow(ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number, color: string, width = 1) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const head = 4;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(endX, endY); ctx.lineTo(endX - head * Math.cos(angle - Math.PI / 6), endY - head * Math.sin(angle - Math.PI / 6)); ctx.lineTo(endX - head * Math.cos(angle + Math.PI / 6), endY - head * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fill();
}

function PhasePlane({ matrix, initialState, duration }: { matrix: Matrix; initialState: Vector; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trajectory = useMemo(() => integrateStateRK4(matrix, initialState, duration), [duration, initialState, matrix]);
  const { locale } = useLocale();
  const labels = copy[locale as LocaleCode] ?? copy.en;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * scale)); canvas.height = Math.max(1, Math.floor(rect.height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const dark = document.documentElement.classList.contains("dark");
      const background = dark ? "#0f172a" : "#ffffff";
      const ink = dark ? "#60a5fa" : "#2563eb";
      const grid = dark ? "rgba(148,163,184,0.22)" : "rgba(100,116,139,0.18)";
      const secondary = dark ? "rgba(196,181,253,0.72)" : "rgba(124,58,237,0.58)";
      const width = rect.width; const height = rect.height; const padding = 38;
      context.fillStyle = background; context.fillRect(0, 0, width, height);
      const peak = Math.max(1, ...trajectory.states.flatMap((state) => state.slice(0, 2).map((value) => Math.abs(value))));
      const range = Math.min(30, peak * 1.24 + 0.5);
      const toX = (value: number) => padding + ((value + range) / (range * 2)) * (width - padding * 2);
      const toY = (value: number) => height - padding - ((value + range) / (range * 2)) * (height - padding * 2);
      context.lineWidth = 1; context.strokeStyle = grid;
      for (let index = 0; index <= 8; index++) { const fraction = index / 8; const x = padding + fraction * (width - 2 * padding); const y = padding + fraction * (height - 2 * padding); context.beginPath(); context.moveTo(x, padding); context.lineTo(x, height - padding); context.stroke(); context.beginPath(); context.moveTo(padding, y); context.lineTo(width - padding, y); context.stroke(); }
      context.strokeStyle = secondary; context.lineWidth = 1.2; context.beginPath(); context.moveTo(toX(-range), toY(0)); context.lineTo(toX(range), toY(0)); context.moveTo(toX(0), toY(-range)); context.lineTo(toX(0), toY(range)); context.stroke();
      const fieldGrid = 12;
      for (let row = 1; row < fieldGrid; row++) for (let column = 1; column < fieldGrid; column++) {
        const x = -range + (column / fieldGrid) * range * 2; const y = -range + (row / fieldGrid) * range * 2;
        const dx = matrix[0][0] * x + matrix[0][1] * y; const dy = matrix[1][0] * x + matrix[1][1] * y;
        const norm = Math.hypot(dx, dy); if (norm < 1e-8) continue;
        const length = (range * 0.13) / norm;
        drawArrow(context, toX(x), toY(y), toX(x + dx * length), toY(y + dy * length), secondary, 0.9);
      }
      context.strokeStyle = ink; context.lineWidth = 2.2; context.lineJoin = "round"; context.lineCap = "round"; context.beginPath();
      trajectory.states.forEach((state, index) => { const x = toX(state[0]); const y = toY(state[1]); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
      const start = trajectory.states[0]; const end = trajectory.states.at(-1)!;
      context.fillStyle = ink; context.beginPath(); context.arc(toX(start[0]), toY(start[1]), 4, 0, Math.PI * 2); context.fill(); context.beginPath(); context.arc(toX(end[0]), toY(end[1]), 3, 0, Math.PI * 2); context.fill();
      context.fillStyle = secondary; context.font = "10px monospace"; context.fillText("x₁", width - padding + 8, toY(0) + 3); context.fillText("x₂", toX(0) + 6, padding - 8);
    };
    render(); const observer = new ResizeObserver(render); observer.observe(canvas); return () => observer.disconnect();
  }, [matrix, trajectory]);

  return <section className={CARD}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className={HEADING}>{labels.plane}</h3><div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1"><i className="h-px w-4 bg-blue-500" />{labels.trajectory}</span><span className="inline-flex items-center gap-1"><i className="h-px w-4 border-t border-dashed border-violet-500" />{labels.field}</span></div></div><div className="relative mt-4 min-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f172a]" style={{ aspectRatio: "4 / 3" }}><canvas ref={canvasRef} className="absolute inset-0 h-full w-full" /></div></section>;
}

function StateSpace3D({ matrix, initialState, duration }: { matrix: Matrix; initialState: Vector; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [rotation, setRotation] = useState({ yaw: -0.65, pitch: 0.45 });
  const trajectory = useMemo(() => integrateStateRK4(matrix, initialState, duration), [duration, initialState, matrix]);
  const { locale } = useLocale();
  const labels = copy[locale as LocaleCode] ?? copy.en;

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const context = canvas.getContext("2d"); if (!context) return;
    const render = () => {
      const rect = canvas.getBoundingClientRect(); const scale = window.devicePixelRatio || 1; canvas.width = Math.max(1, Math.floor(rect.width * scale)); canvas.height = Math.max(1, Math.floor(rect.height * scale)); context.setTransform(scale, 0, 0, scale, 0, 0);
      const dark = document.documentElement.classList.contains("dark"); const background = dark ? "#0f172a" : "#ffffff"; const ink = dark ? "#60a5fa" : "#2563eb"; const grid = dark ? "rgba(148,163,184,0.26)" : "rgba(100,116,139,0.2)";
      const width = rect.width; const height = rect.height; context.fillStyle = background; context.fillRect(0, 0, width, height);
      const maxMagnitude = Math.max(1, ...trajectory.states.flatMap((state) => state.map((value) => Math.abs(value))));
      const range = Math.min(25, maxMagnitude * 1.25 + 0.5);
      const project = (point: Vector) => { const cy = Math.cos(rotation.yaw), sy = Math.sin(rotation.yaw), cp = Math.cos(rotation.pitch), sp = Math.sin(rotation.pitch); const x = point[0] * cy - point[2] * sy; const z = point[0] * sy + point[2] * cy; const y = point[1] * cp - z * sp; const depth = point[1] * sp + z * cp; const scaleFactor = Math.min(width, height) * 0.38 / (range * (1 + depth / (range * 5))); return { x: width / 2 + x * scaleFactor, y: height / 2 - y * scaleFactor }; };
      const origin = project([0, 0, 0]); const axes: [Vector, string][] = [[[range, 0, 0], "x₁"], [[0, range, 0], "x₂"], [[0, 0, range], "x₃"]];
      context.strokeStyle = grid; context.lineWidth = 1; axes.forEach(([point, label]) => { const target = project(point); context.beginPath(); context.moveTo(origin.x, origin.y); context.lineTo(target.x, target.y); context.stroke(); context.fillStyle = grid; context.font = "10px monospace"; context.fillText(label, target.x + 4, target.y - 4); });
      context.strokeStyle = ink; context.lineWidth = 2.2; context.lineJoin = "round"; context.lineCap = "round"; context.beginPath(); trajectory.states.forEach((point, index) => { const projection = project(point); if (index === 0) context.moveTo(projection.x, projection.y); else context.lineTo(projection.x, projection.y); }); context.stroke();
      const start = project(trajectory.states[0]); const end = project(trajectory.states.at(-1)!); context.fillStyle = ink; context.beginPath(); context.arc(start.x, start.y, 4, 0, Math.PI * 2); context.fill(); context.beginPath(); context.arc(end.x, end.y, 3, 0, Math.PI * 2); context.fill();
    };
    render(); const observer = new ResizeObserver(render); observer.observe(canvas); return () => observer.disconnect();
  }, [rotation, trajectory]);

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const pointer = pointerRef.current; if (!pointer || pointer.id !== event.pointerId) return; const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y; pointerRef.current = { ...pointer, x: event.clientX, y: event.clientY }; setRotation((current) => ({ yaw: current.yaw + dx * 0.012, pitch: Math.max(-1.35, Math.min(1.35, current.pitch + dy * 0.012)) })); };
  const pointerUp = () => { pointerRef.current = null; };

  return <section className={CARD}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className={HEADING}>{labels.space}</h3><span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400"><Orbit className="h-3.5 w-3.5" />{labels.rotate}</span></div><div className="relative mt-4 min-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f172a]" style={{ aspectRatio: "4 / 3" }}><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing" /></div><p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><MousePointer2 className="h-3.5 w-3.5" />{labels.drag}</p></section>;
}

export function StateSpacePortraits({ matrix, closedLoopMatrix, order }: Props) {
  const { locale } = useLocale(); const labels = copy[locale as LocaleCode] ?? copy.en;
  const [initialState, setInitialState] = useState<Vector>(() => Array.from({ length: order }, (_, index) => index === 0 ? 1 : 0));
  const duration = 10;
  const [mode, setMode] = useState<"open" | "closed">("open");
  useEffect(() => { setInitialState(Array.from({ length: order }, (_, index) => index === 0 ? 1 : 0)); setMode("open"); }, [order]);
  const activeMatrix = mode === "closed" && closedLoopMatrix ? closedLoopMatrix : matrix;
  const inputClass = `mt-2 w-full px-2 py-1 text-slate-800 text-lg tracking-wide [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 ${FIELD}`;
  return <section className={CARD}><div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><h2 className={HEADING}>{labels.title}</h2></div><div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{initialState.map((value, index) => <label key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><KatexMath math={`x_{${index + 1}}(0)`} className="text-xs text-slate-500 dark:text-slate-400" /><input type="number" step="any" value={value} onChange={(event) => setInitialState((current) => current.map((state, position) => position === index ? Number(event.target.value) || 0 : state))} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className={inputClass} /></label>)}</div><div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{labels.dynamics}</p><div className="mt-2 flex gap-2">{(["open", "closed"] as const).map((value) => <button key={value} type="button" disabled={value === "closed" && !closedLoopMatrix} onClick={() => setMode(value)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-35 ${mode === value ? "bg-brand-gradient text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"}`}>{value === "open" ? labels.open : labels.closed}</button>)}</div></div></div><div className="mt-5">{order === 2 ? <PhasePlane matrix={activeMatrix} initialState={initialState} duration={duration} /> : <StateSpace3D matrix={activeMatrix} initialState={initialState} duration={duration} />}</div></section>;
}

export default StateSpacePortraits;
