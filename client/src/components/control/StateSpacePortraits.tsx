/**
 * MAE State-Space Studio visual system: monochrome blueprint plots.
 * Canvas vectors and trajectories remain solid black/white; control equations
 * and state labels are routed through KaTeX in the surrounding instrument UI.
 */
import { useTranslation } from 'react-i18next';
import { MousePointer2, Orbit } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioCard, InnerBox } from "@/components/common/templates";
import type { Matrix, StateTrajectory, Vector } from "@shared/control/matrixTypes";
import { stateTrajectoryRemote } from "@/services/controlClient";
import { useRemoteQuery } from "@/lib/useRemoteQuery";

const EMPTY_TRAJECTORY: StateTrajectory = { time: [], states: [] };

type LocaleCode = "en" | "ar" | "es";
type Props = { matrix: Matrix; closedLoopMatrix?: Matrix; order: 2 | 3 };
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 560, height: 440 });
  // The RK4 trajectory is integrated by the serverless engine (debounced while the initial state is dragged); the last one stays drawn.
  const trajectory = useRemoteQuery(`traj|${JSON.stringify(matrix)}|${initialState.join(",")}|${duration}`, (signal) => stateTrajectoryRemote(matrix, initialState, duration, undefined, signal), { debounceMs: 20 }).data ?? EMPTY_TRAJECTORY;
  const { locale } = useLocale();
  const labels = copy[locale as LocaleCode] ?? copy.en;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const padding = { top: 32, right: 36, bottom: 44, left: 48 };
  const plotWidth = Math.max(10, size.width - padding.left - padding.right);
  const plotHeight = Math.max(10, size.height - padding.top - padding.bottom);
  const plotDim = Math.min(plotWidth, plotHeight);

  const centerX = padding.left + plotWidth / 2;
  const centerY = padding.top + plotHeight / 2;

  const peak = Math.max(1, ...trajectory.states.flatMap((state) => state.slice(0, 2).map((value) => Math.abs(value))));
  const range = Math.min(30, peak * 1.35 + 0.5);

  const toX = useCallback(
    (value: number) => centerX + (value / range) * (plotDim / 2),
    [centerX, plotDim, range]
  );
  const toY = useCallback(
    (value: number) => centerY - (value / range) * (plotDim / 2),
    [centerY, plotDim, range]
  );

  // Vector quiver field calculation
  const quiverArrows = useMemo(() => {
    const arrows: Array<{ startX: number; startY: number; endX: number; endY: number; angle: number }> = [];
    const fieldGrid = 12;
    for (let row = 1; row < fieldGrid; row++) {
      for (let column = 1; column < fieldGrid; column++) {
        const x = -range + (column / fieldGrid) * range * 2;
        const y = -range + (row / fieldGrid) * range * 2;
        const dx = matrix[0][0] * x + matrix[0][1] * y;
        const dy = matrix[1][0] * x + matrix[1][1] * y;
        const norm = Math.hypot(dx, dy);
        if (norm < 1e-8) continue;
        const length = (range * 0.12) / norm;
        const startX = toX(x);
        const startY = toY(y);
        const endX = toX(x + dx * length);
        const endY = toY(y + dy * length);
        const angle = Math.atan2(endY - startY, endX - startX);
        arrows.push({ startX, startY, endX, endY, angle });
      }
    }
    return arrows;
  }, [matrix, range, toX, toY]);

  // Trajectory SVG path
  const trajectoryD = useMemo(() => {
    if (!trajectory.states.length) return "";
    return trajectory.states.reduce((acc, state, index) => {
      const sx = toX(state[0]);
      const sy = toY(state[1]);
      return index === 0 ? `M ${sx.toFixed(1)} ${sy.toFixed(1)}` : `${acc} L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
    }, "");
  }, [trajectory.states, toX, toY]);

  const startPt = trajectory.states[0];
  const endPt = trajectory.states.at(-1);

  // Symmetrical ticks along [-range, +range]
  const ticks = [-range, -range / 2, 0, range / 2, range];

  return (
    <StudioCard
      title={labels.plane}
      actionSlot={
        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><i className="h-px w-4 bg-blue-500" />{labels.trajectory}</span>
          <span className="inline-flex items-center gap-1"><i className="h-px w-4 border-t border-dashed border-violet-500" />{labels.field}</span>
        </div>
      }
    >
      <div
        ref={containerRef}
        className="relative min-h-[380px] md:min-h-[440px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#090a0d]"
        style={{ aspectRatio: "4 / 3" }}
      >
        <svg className="absolute inset-0 h-full w-full pointer-events-none select-none">
          {/* Symmetrical 4-Quadrant Grid lines */}
          {ticks.map((val, index) => {
            const x = toX(val);
            const y = toY(val);
            const halfD = plotDim / 2;
            return (
              <g key={`pp-grid-${index}`} className="text-slate-200/60 dark:text-slate-800/60">
                {/* Vertical grid line */}
                <line x1={x} y1={centerY - halfD} x2={x} y2={centerY + halfD} stroke="currentColor" strokeDasharray="2 2" strokeWidth={1} />
                {/* Horizontal grid line */}
                <line x1={centerX - halfD} y1={y} x2={centerX + halfD} y2={y} stroke="currentColor" strokeDasharray="2 2" strokeWidth={1} />
              </g>
            );
          })}

          {/* Prominent Zero-Crossing Axes (x1 and x2) */}
          <line
            x1={centerX - plotDim / 2}
            y1={centerY}
            x2={centerX + plotDim / 2}
            y2={centerY}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1.5}
          />
          <line
            x1={centerX}
            y1={centerY - plotDim / 2}
            x2={centerX}
            y2={centerY + plotDim / 2}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1.5}
          />

          {/* Axis Tick Values */}
          {ticks.filter((v) => Math.abs(v) > 1e-4).map((val, idx) => {
            const sx = toX(val);
            const sy = toY(val);
            return (
              <g key={`tick-val-${idx}`} className="font-mono text-[9px] fill-slate-400 dark:fill-slate-500">
                <text x={sx} y={centerY + 14} textAnchor="middle">
                  {val.toFixed(1)}
                </text>
                <text x={centerX - 8} y={sy + 3.5} textAnchor="end">
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Vector quiver field arrows */}
          {quiverArrows.map((arrow, idx) => {
            const head = 4;
            const x1 = arrow.endX - head * Math.cos(arrow.angle - Math.PI / 6);
            const y1 = arrow.endY - head * Math.sin(arrow.angle - Math.PI / 6);
            const x2 = arrow.endX - head * Math.cos(arrow.angle + Math.PI / 6);
            const y2 = arrow.endY - head * Math.sin(arrow.angle + Math.PI / 6);
            return (
              <g key={`arrow-${idx}`} stroke="#8B5CF6" fill="#8B5CF6" strokeOpacity={0.6} fillOpacity={0.6}>
                <line x1={arrow.startX} y1={arrow.startY} x2={arrow.endX} y2={arrow.endY} strokeWidth={1} />
                <polygon points={`${arrow.endX},${arrow.endY} ${x1},${y1} ${x2},${y2}`} strokeWidth={1} />
              </g>
            );
          })}

          {/* Trajectory path */}
          {trajectoryD && (
            <path
              d={trajectoryD}
              fill="none"
              stroke="#2563EB"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Start and end points */}
          {startPt && (
            <circle cx={toX(startPt[0])} cy={toY(startPt[1])} r={5} fill="#2563EB" stroke="#FFFFFF" strokeWidth={1.5} />
          )}
          {endPt && (
            <circle cx={toX(endPt[0])} cy={toY(endPt[1])} r={4} fill="#2563EB" stroke="#FFFFFF" strokeWidth={1} />
          )}
        </svg>

        {/* KaTeX Axis Indicators positioned cleanly at axis tips */}
        <div
          className="pointer-events-none absolute font-serif text-xs font-bold text-violet-600 dark:text-violet-300"
          style={{ left: `${Math.min(size.width - 24, centerX + plotDim / 2 + 8)}px`, top: `${centerY - 8}px` }}
        >
          <KatexMath math="x_1" />
        </div>
        <div
          className="pointer-events-none absolute font-serif text-xs font-bold text-violet-600 dark:text-violet-300"
          style={{ left: `${centerX + 8}px`, top: `${Math.max(10, centerY - plotDim / 2 - 20)}px` }}
        >
          <KatexMath math="x_2" />
        </div>
      </div>
    </StudioCard>
  );
}


function StateSpace3D({ matrix, initialState, duration }: { matrix: Matrix; initialState: Vector; duration: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 480, height: 360 });
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [rotation, setRotation] = useState({ yaw: -0.65, pitch: 0.45 });
  // The RK4 trajectory is integrated by the serverless engine (debounced while the initial state is dragged); the last one stays drawn.
  const trajectory = useRemoteQuery(`traj|${JSON.stringify(matrix)}|${initialState.join(",")}|${duration}`, (signal) => stateTrajectoryRemote(matrix, initialState, duration, undefined, signal), { debounceMs: 20 }).data ?? EMPTY_TRAJECTORY;
  const { locale } = useLocale();
  const labels = copy[locale as LocaleCode] ?? copy.en;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxMagnitude = Math.max(1, ...trajectory.states.flatMap((state) => state.map((value) => Math.abs(value))));
  const range = Math.min(25, maxMagnitude * 1.25 + 0.5);

  const project = useCallback(
    (point: Vector) => {
      const cy = Math.cos(rotation.yaw),
        sy = Math.sin(rotation.yaw),
        cp = Math.cos(rotation.pitch),
        sp = Math.sin(rotation.pitch);
      const x = point[0] * cy - point[2] * sy;
      const z = point[0] * sy + point[2] * cy;
      const y = point[1] * cp - z * sp;
      const depth = point[1] * sp + z * cp;
      const scaleFactor = (Math.min(size.width, size.height) * 0.38) / (range * (1 + depth / (range * 5)));
      return { x: size.width / 2 + x * scaleFactor, y: size.height / 2 - y * scaleFactor };
    },
    [range, rotation.pitch, rotation.yaw, size.height, size.width]
  );

  const origin = project([0, 0, 0]);
  const axes: [Vector, string][] = [
    [[range, 0, 0], "x_1"],
    [[0, range, 0], "x_2"],
    [[0, 0, range], "x_3"],
  ];

  const trajectoryD = useMemo(() => {
    if (!trajectory.states.length) return "";
    return trajectory.states.reduce((acc, point, index) => {
      const proj = project(point);
      return index === 0 ? `M ${proj.x.toFixed(1)} ${proj.y.toFixed(1)}` : `${acc} L ${proj.x.toFixed(1)} ${proj.y.toFixed(1)}`;
    }, "");
  }, [project, trajectory.states]);

  const startPt = trajectory.states[0] ? project(trajectory.states[0]) : null;
  const endPt = trajectory.states.length ? project(trajectory.states.at(-1)!) : null;

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointerRef.current = { ...pointer, x: event.clientX, y: event.clientY };
    setRotation((current) => ({
      yaw: current.yaw + dx * 0.012,
      pitch: Math.max(-1.35, Math.min(1.35, current.pitch + dy * 0.012)),
    }));
  };
  const pointerUp = () => {
    pointerRef.current = null;
  };

  return (
    <StudioCard
      title={labels.space}
      actionSlot={
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <Orbit className="h-3.5 w-3.5" />
          {labels.rotate}
        </span>
      }
    >
      <div
        ref={containerRef}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        className="relative min-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#090a0d] touch-none cursor-grab active:cursor-grabbing"
        style={{ aspectRatio: "4 / 3" }}
      >
        <svg className="absolute inset-0 h-full w-full pointer-events-none">
          {/* Projected 3D Axes */}
          {axes.map(([point, label], idx) => {
            const target = project(point);
            return (
              <g key={`axis-3d-${idx}`}>
                <line
                  x1={origin.x}
                  y1={origin.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="currentColor"
                  strokeWidth={1.2}
                  className="text-slate-400 dark:text-slate-600"
                />
                <text
                  x={target.x + 5}
                  y={target.y - 3}
                  className="fill-slate-500 font-mono text-[10px] font-bold dark:fill-slate-400"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* 3D Trajectory */}
          {trajectoryD && (
            <path
              d={trajectoryD}
              fill="none"
              stroke="#2563EB"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Start and end points */}
          {startPt && <circle cx={startPt.x} cy={startPt.y} r={4.5} fill="#2563EB" />}
          {endPt && <circle cx={endPt.x} cy={endPt.y} r={3.5} fill="#2563EB" />}
        </svg>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <MousePointer2 className="h-3.5 w-3.5" />
        {labels.drag}
      </p>
    </StudioCard>
  );
}


export function StateSpacePortraits({ matrix, closedLoopMatrix, order }: Props) {
  const { t } = useTranslation('simulators');
  const { locale } = useLocale(); const labels = copy[locale as LocaleCode] ?? copy.en;
  const [initialState, setInitialState] = useState<Vector>(() => Array.from({ length: order }, (_, index) => index === 0 ? 1 : 0));
  const duration = 10;
  const [mode, setMode] = useState<"open" | "closed">("open");
  useEffect(() => { setInitialState(Array.from({ length: order }, (_, index) => index === 0 ? 1 : 0)); setMode("open"); }, [order]);
  const activeMatrix = mode === "closed" && closedLoopMatrix ? closedLoopMatrix : matrix;
  const inputClass = `mt-2 w-full px-2 py-1 text-slate-800 text-lg tracking-wide [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 ${FIELD}`;

  return (
    <StudioCard title={labels.title}>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {initialState.map((value, index) => (
            <InnerBox key={index}>
              <KatexMath math={`x_{${index + 1}}(0)`} className="text-xs text-slate-500 dark:text-slate-400" />
              <input
                type="number"
                step="any"
                value={value}
                onChange={(event) => setInitialState((current) => current.map((state, position) => position === index ? Number(event.target.value) || 0 : state))}
                data-math-input="true"
                style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                className={inputClass}
              />
            </InnerBox>
          ))}
        </div>
        <InnerBox title={labels.dynamics}>
          <div className="mt-1">
            <SegmentedControl
              options={[{ label: labels.open, value: "open" }, { label: labels.closed, value: "closed", disabled: !closedLoopMatrix }]}
              value={mode}
              onChange={setMode}
              size="sm"
              fullWidth
              aria-label="Dynamics selector"
            />
          </div>
        </InnerBox>
      </div>
      <div className="mt-5">
        {order === 2 ? <PhasePlane matrix={activeMatrix} initialState={initialState} duration={duration} /> : <StateSpace3D matrix={activeMatrix} initialState={initialState} duration={duration} />}
      </div>
    </StudioCard>
  );
}

export default StateSpacePortraits;
