/**
 * MAE Academy / Signals & Systems — Tab E S/Z-plane vector scope.
 * Follows the StandardRootLocusPlot aesthetic: 4-quadrant axes through (0, 0), KaTeX tick labels,
 * rose × poles and blue ○ zeros, violet ROC shading. The view is auto-scaled (no wheel zoom / pan):
 * Span = max(2.5, 1.3·max|Re|,|Im| over poles, zeros, and ROC boundaries), eased between systems.
 * Roots drag with conjugate symmetry; the dragged draft is committed on release.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SvgKatexTick } from "@/components/common/templates/SvgKatexTick";
import { niceTicks } from "@shared/signals/plotAutoScale";
import { type Complex, type RocResult, type TransferFunction, withMovedRoot } from "@shared/signals/transferFunction";

type Props = {
  system: TransferFunction;
  roc: RocResult;
  extractSlice: boolean;
  onPreview: (system: TransferFunction) => void;
  onCommit: (system: TransferFunction) => void;
};

type Drag = { family: "poles" | "zeros"; index: number } | null;
type Hover = { family: "pole" | "zero"; root: Complex; index: number; screenX: number; screenY: number } | null;

const POLE = "#E11D48";
const ZERO = "#2563EB";
const VIOLET = "#7C3AED";
const ROC_FILL = "rgba(124, 58, 237, 0.12)";
const MIN_SPAN = 2.5;
const HEADROOM = 1.3;
const EASE_MS = 260;

/** Symmetric half-width that keeps every root and ROC boundary visible with 30% headroom. */
export function autoSpan(system: TransferFunction, roc: RocResult | null): number {
  const extents = [...system.poles, ...system.zeros].flatMap((root) => [Math.abs(root.re), Math.abs(root.im)]);
  if (roc) extents.push(Math.abs(roc.boundary), Math.abs(roc.innerBoundary ?? 0));
  if (system.mode === "z") extents.push(1);
  const finite = extents.filter(Number.isFinite);
  return Math.max(MIN_SPAN, HEADROOM * (finite.length ? Math.max(...finite) : 0));
}

export function SZPlaneCanvas({ system, roc, extractSlice, onPreview, onCommit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 460 });
  const [draft, setDraft] = useState<TransferFunction | null>(null);
  const dragRef = useRef<Drag>(null);
  const [hover, setHover] = useState<Hover>(null);
  const shown = draft ?? system;

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const update = () => { const rect = el.getBoundingClientRect(); if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height }); };
    update();
    const observer = new ResizeObserver(update); observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-scale: the target follows the committed system (frozen mid-drag so the cursor stays on its root).
  const targetSpan = useMemo(() => autoSpan(system, roc), [system, roc]);
  const [span, setSpan] = useState(targetSpan);
  const spanRef = useRef(span); spanRef.current = span;
  useEffect(() => {
    const from = spanRef.current; if (Math.abs(from - targetSpan) < 1e-9) return;
    let frame = 0; const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / EASE_MS); const eased = 1 - Math.pow(1 - progress, 3);
      setSpan(from + (targetSpan - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [targetSpan]);

  // Math units per pixel: the ±Span square fits the shorter side; the longer side shows extra plane.
  const unit = Math.max((2 * span) / size.width, (2 * span) / size.height);
  const mx = useCallback((value: number) => size.width / 2 + value / unit, [size.width, unit]);
  const my = useCallback((value: number) => size.height / 2 - value / unit, [size.height, unit]);
  const inv = useCallback((screenX: number, screenY: number): Complex => ({ re: (screenX - size.width / 2) * unit, im: -(screenY - size.height / 2) * unit }), [size.width, size.height, unit]);
  const halfX = (size.width / 2) * unit; const halfY = (size.height / 2) * unit;

  const hitRoot = (coord: Complex, radiusPx: number) => {
    for (const family of ["poles", "zeros"] as const) {
      const index = shown[family].findIndex((root) => Math.hypot(root.re - coord.re, root.im - coord.im) < radiusPx * unit);
      if (index >= 0) return { family, index };
    }
    return null;
  };
  const local = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = local(event); const hit = hitRoot(inv(point.x, point.y), 14);
    if (!hit) return;
    dragRef.current = hit;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = local(event); const drag = dragRef.current;
    if (drag) {
      const target = inv(point.x, point.y);
      // A real root has no conjugate partner, so it stays on the real axis (real coefficients).
      if (Math.abs(system[drag.family][drag.index]?.im ?? 0) < 1e-9) target.im = 0;
      let next: TransferFunction;
      try { next = withMovedRoot(system, drag.family, drag.index, target); } catch { return; }
      setDraft(next); onPreview(next);
      const root = next[drag.family][drag.index];
      if (root) setHover({ family: drag.family === "poles" ? "pole" : "zero", root, index: drag.index, screenX: point.x, screenY: point.y });
      return;
    }
    const hit = hitRoot(inv(point.x, point.y), 12);
    if (!hit) { setHover(null); return; }
    const root = shown[hit.family][hit.index];
    setHover({ family: hit.family === "poles" ? "pole" : "zero", root, index: hit.index, screenX: mx(root.re), screenY: my(root.im) });
  };

  const handlePointerUp = () => {
    if (dragRef.current && draft) onCommit(draft);
    dragRef.current = null; setDraft(null);
  };

  const ticks = useMemo(() => ({
    x: niceTicks(-halfX, halfX, Math.max(4, Math.round(size.width / 90))),
    y: niceTicks(-halfY, halfY, Math.max(4, Math.round(size.height / 70))),
  }), [halfX, halfY, size.width, size.height]);

  const originX = mx(0); const originY = my(0);
  // Tick labels hug the axes but stay inside the frame when an axis scrolls off-centre.
  const labelY = Math.min(size.height - 6, Math.max(18, originY + 16));
  const labelX = Math.min(size.width - 8, Math.max(40, originX - 6));

  const rocShape = (() => {
    if (shown.mode === "s") {
      const boundary = mx(roc.boundary); const inner = mx(roc.innerBoundary ?? 0);
      const [x, w] = roc.kind === "right" ? [boundary, size.width - boundary] : roc.kind === "left" ? [0, boundary] : [Math.min(inner, boundary), Math.abs(boundary - inner)];
      const edges = roc.kind === "two-sided" ? [inner, boundary] : [boundary];
      return <>
        <rect x={x} y={0} width={Math.max(0, w)} height={size.height} fill={ROC_FILL} />
        {edges.map((edge) => <line key={edge} x1={edge} y1={0} x2={edge} y2={size.height} stroke={VIOLET} strokeWidth={1.25} strokeDasharray="6 4" opacity={0.7} />)}
      </>;
    }
    const outer = Math.abs(roc.boundary / unit); const inner = Math.abs((roc.innerBoundary ?? 0) / unit);
    const ring = (r: number) => `M ${originX},${originY} m -${r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
    if (roc.kind === "right") return <path d={`M 0,0 L ${size.width},0 L ${size.width},${size.height} L 0,${size.height} Z ${ring(outer)}`} fill={ROC_FILL} fillRule="evenodd" />;
    if (roc.kind === "left") return <circle cx={originX} cy={originY} r={outer} fill={ROC_FILL} />;
    return <path d={`${ring(outer)} ${ring(inner)}`} fill={ROC_FILL} fillRule="evenodd" />;
  })();

  return (
    <div
      ref={containerRef}
      data-testid="sz-plane"
      data-span={span.toFixed(4)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => { if (!dragRef.current) setHover(null); }}
      className={`relative h-[460px] w-full select-none overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#07101e] ${dragRef.current ? "cursor-grabbing" : hover ? "cursor-grab" : "cursor-default"}`}
      aria-label="Auto-scaled pole-zero plane: drag poles and zeros to reshape the transfer function."
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {/* Cartesian grid at the tick positions (both planes), plus |z| rings in the Z-plane. */}
        <g className="text-slate-200 dark:text-slate-800" stroke="currentColor" strokeWidth={1}>
          {ticks.x.map((value) => <line key={`gx${value}`} x1={mx(value)} y1={0} x2={mx(value)} y2={size.height} strokeDasharray="2 4" />)}
          {ticks.y.map((value) => <line key={`gy${value}`} x1={0} y1={my(value)} x2={size.width} y2={my(value)} strokeDasharray="2 4" />)}
          {shown.mode === "z" && [0.5, 1.5, 2].map((radius) => <circle key={radius} cx={originX} cy={originY} r={radius / unit} fill="none" strokeDasharray="2 4" />)}
        </g>

        {rocShape}

        {/* Hairline axes through the origin. */}
        <g className="text-slate-400 dark:text-slate-500" stroke="currentColor" strokeWidth={1.25}>
          <line x1={0} y1={originY} x2={size.width} y2={originY} />
          <line x1={originX} y1={0} x2={originX} y2={size.height} />
        </g>

        {/* KaTeX tick labels (origin labelled once). */}
        <g aria-hidden="true">
          {ticks.x.filter((value) => value !== 0).map((value) => <SvgKatexTick key={`tx${value}`} x={mx(value)} y={labelY} baseline>{String(value)}</SvgKatexTick>)}
          {ticks.y.filter((value) => value !== 0).map((value) => {
            const formatted = value > 0 ? `+${value}j` : `${value}j`;
            return <SvgKatexTick key={`ty${value}`} x={labelX} y={my(value)} anchor="end">{formatted}</SvgKatexTick>;
          })}
          <SvgKatexTick x={labelX} y={labelY} anchor="end" baseline>0</SvgKatexTick>
        </g>

        {/* Frequency slice: jω axis or unit circle. */}
        {shown.mode === "z"
          ? <circle cx={originX} cy={originY} r={1 / unit} fill="none" stroke={extractSlice ? VIOLET : ZERO} strokeWidth={extractSlice ? 2.8 : 1.8} className="transition-colors duration-200" />
          : extractSlice && <line x1={originX} y1={0} x2={originX} y2={size.height} stroke={VIOLET} strokeWidth={3} />}

        {shown.zeros.map((root, index) => {
          const selected = hover?.family === "zero" && hover.index === index;
          return <g key={`zero-${index}`}>
            <circle cx={mx(root.re)} cy={my(root.im)} r={selected ? 8.5 : 7} fill="white" className="dark:fill-[#07101e]" stroke={ZERO} strokeWidth={selected ? 3.5 : 3} />
            <text x={mx(root.re) + 11} y={my(root.im) - 10} fill={ZERO} fontSize={12} fontStyle="italic" style={{ fontFamily: "'KaTeX_Math', 'Times New Roman', serif" }}>z<tspan fontSize={9} dy={3}>{index + 1}</tspan></text>
          </g>;
        })}

        {shown.poles.map((root, index) => {
          const selected = hover?.family === "pole" && hover.index === index; const arm = selected ? 8.5 : 7;
          const x = mx(root.re); const y = my(root.im);
          return <g key={`pole-${index}`}>
            <line x1={x - arm} y1={y - arm} x2={x + arm} y2={y + arm} stroke={POLE} strokeWidth={selected ? 3.4 : 2.8} strokeLinecap="round" />
            <line x1={x + arm} y1={y - arm} x2={x - arm} y2={y + arm} stroke={POLE} strokeWidth={selected ? 3.4 : 2.8} strokeLinecap="round" />
            <text x={x + 11} y={y - 10} fill={POLE} fontSize={12} fontStyle="italic" style={{ fontFamily: "'KaTeX_Math', 'Times New Roman', serif" }}>p<tspan fontSize={9} dy={3}>{index + 1}</tspan></text>
          </g>;
        })}
      </svg>

      {/* Imaginary Axis Label: directly at the top of the vertical axis */}
      <div
        style={{
          left: `${Math.max(100, Math.min(size.width - 100, originX))}px`,
          top: "12px",
          transform: "translateX(-50%)",
        }}
        className="pointer-events-none absolute rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1 text-xs text-slate-700 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 dark:text-slate-300 shadow-sm"
      >
        <KatexMath math={shown.mode === "s" ? String.raw`\text{Im}(s)\ (j\omega)` : String.raw`\text{Im}(z)`} />
      </div>

      {/* Real Axis Label: at the far right of the horizontal axis */}
      <div
        style={{
          right: "12px",
          top: `${Math.max(36, Math.min(size.height - 36, originY))}px`,
          transform: "translateY(-50%)",
        }}
        className="pointer-events-none absolute rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1 text-xs text-slate-700 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 dark:text-slate-300 shadow-sm"
      >
        <KatexMath math={shown.mode === "s" ? String.raw`\text{Re}(s)\ (\sigma)` : String.raw`\text{Re}(z)`} />
      </div>

      {/* ROC status badge with BIBO Stable token */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
        <span className="text-slate-700 dark:text-slate-300">{roc.kind === "right" ? "ROC →" : roc.kind === "left" ? "← ROC" : "ROC Band"}</span>
        <span className="mx-2 text-slate-400">•</span>
        <span className={roc.stable ? "rounded border px-1.5 py-0.5 font-bold bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" : "rounded border px-1.5 py-0.5 font-bold bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"}>
          {roc.stable ? "BIBO Stable" : "Unstable"}
        </span>
      </div>

      {hover && (
        <div
          style={{ left: `${Math.min(size.width - 190, Math.max(12, hover.screenX + 16))}px`, top: `${Math.min(size.height - 110, Math.max(12, hover.screenY - 70))}px` }}
          className="pointer-events-none absolute z-30 rounded-xl border border-slate-200/90 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95"
        >
          <div className="flex items-center gap-2 font-bold">
            <span className={`h-2 w-2 rounded-full ${hover.family === "pole" ? "bg-rose-600" : "bg-blue-600"}`} />
            <KatexMath math={`${hover.family === "pole" ? "p" : "z"}_{${hover.index + 1}}`} />
          </div>
          <div className="mt-1.5 space-y-1 text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
            <KatexMath math={`${hover.root.re.toFixed(3)}${hover.root.im >= 0 ? "+" : "-"}j${Math.abs(hover.root.im).toFixed(3)}`} className="block" />
            <KatexMath math={`|${shown.mode}|=${Math.hypot(hover.root.re, hover.root.im).toFixed(3)}`} className="block" />
          </div>
        </div>
      )}
    </div>
  );
}

export default SZPlaneCanvas;
