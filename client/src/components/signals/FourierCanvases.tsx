/**
 * MAE Academy / Signals & Systems — Tab D Spectral Vector Scope.
 * Canonical StandardStepPlot / stem-plot rendering for:
 * 1. Magnitude spectrum — stems |c_n| (series) or |X(jω)| with impulse lines drawn at height = area.
 * 2. Phase spectrum — fixed to [−π, π] with KaTeX π ticks.
 * 3. Time trace — harmonic builder x_N(t), the time-scaled x(at), or the synthesized 𝓕⁻¹ waveform.
 * All ranges auto-scale (ω window from the spectrum's 1% bandwidth + 20% headroom); there is no zoom.
 */
import { niceTicks, symmetricYBound } from "@shared/signals/plotAutoScale";
import { SvgKatexTick } from "@/components/common/templates/SvgKatexTick";
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import { KatexMath } from "@/components/ui/KatexMath";
import { StandardStepPlot } from "@/components/common/templates/StandardStepPlot";
import type { FourierSeriesResult } from "@shared/signals/results";
import { partialSum } from "@shared/signals/seriesSynthesis";
import type { Impulse } from "@shared/signals/results";

export type SpectrumSample = { omega: number; magnitude: number; phase: number };
export type TimeTrace = { katexName: string; data: Array<{ x: number; y: number }> };

type Props = {
  mode: "fs" | "ft";
  series: FourierSeriesResult | null;
  /** Continuous spectrum samples on [−bandwidth, bandwidth]. */
  spectrum: SpectrumSample[] | null;
  impulses: Impulse[];
  bandwidth: number;
  /** Time-domain trace for FT/inverse modes; FS mode builds the partial sum itself. */
  trace: TimeTrace | null;
  /** One period of x(t) for the FS harmonic builder. */
  periodic?: (time: number) => number;
  harmonics: number;
  /** FS observation window [t_start, t_end] (s), shared with the 3D waterfall; defaults to [−T₀, T₀]. */
  timeWindow?: { start: number; end: number };
};

const MAGNITUDE = "#2563EB";
const IMPULSE = "#7C3AED";
const PHASE = "#E11D48";
const PARTIAL = "#7C3AED";

/** Phase axis ticks: −π … π labelled in KaTeX. */
export const PI_TICKS = [
  { value: -Math.PI, katex: "-\\pi" },
  { value: -Math.PI / 2, katex: "-\\frac{\\pi}{2}" },
  { value: 0, katex: "0" },
  { value: Math.PI / 2, katex: "\\frac{\\pi}{2}" },
  { value: Math.PI, katex: "\\pi" },
];
const PHASE_DOMAIN: [number, number] = [-Math.PI * 1.15, Math.PI * 1.15];

interface SvgStemPlotProps {
  titleKatex: string;
  xLabelKatex: string;
  yLabelKatex: string;
  stems: Array<{ x: number; y: number }>;
  color: string;
  omega0: number;
  height?: number;
  phase?: boolean;
}

const PLOT_HEIGHT = 288;
const STEM_PAD = { top: 30, bottom: 30, left: 48, right: 48 };

/** Canonical discrete stem plot for Fourier-series coefficients (hairline axes, KaTeX ticks, frosted HUD). */
function SvgStemPlot({ titleKatex, xLabelKatex, yLabelKatex, stems, color, omega0, height = PLOT_HEIGHT, phase = false }: SvgStemPlotProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>({ width: 500, height });
  const [hover, setHover] = useState<{ x: number; y: number; stem: { x: number; y: number } } | null>(null);

  const plotW = Math.max(10, size.width - STEM_PAD.left - STEM_PAD.right);
  const plotH = Math.max(10, size.height - STEM_PAD.top - STEM_PAD.bottom);

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (!stems.length) return { xMin: -6, xMax: 6, yMin: phase ? PHASE_DOMAIN[0] : 0, yMax: phase ? PHASE_DOMAIN[1] : 1 };
    const maxN = Math.max(5, ...stems.map((stem) => Math.abs(stem.x))) + 1; // one harmonic of clearance at the frame
    if (phase) return { xMin: -maxN, xMax: maxN, yMin: PHASE_DOMAIN[0], yMax: PHASE_DOMAIN[1] };
    return { xMin: -maxN, xMax: maxN, yMin: 0, yMax: symmetricYBound(Math.max(...stems.map((stem) => Math.abs(stem.y)))) };
  }, [stems, phase]);

  const mapX = useCallback((x: number) => STEM_PAD.left + ((x - xMin) / (xMax - xMin)) * plotW, [plotW, xMax, xMin]);
  const mapY = useCallback((y: number) => STEM_PAD.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH, [plotH, yMax, yMin]);
  const zeroY = mapY(0);
  const xTicks = useMemo(() => niceTicks(xMin, xMax, 10).filter((n) => Number.isInteger(n)), [xMax, xMin]);
  const yTicks = phase ? PI_TICKS : niceTicks(yMin, yMax, 5).map((value) => ({ value, katex: String(Number(value.toPrecision(3))) }));

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // Live rect + the same linear map as the drawn stems: the stem whose index is nearest the cursor tip is the hovered one.
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const innerWidth = Math.max(10, rect.width - STEM_PAD.left - STEM_PAD.right);
    const position = xMin + ((x - STEM_PAD.left) / innerWidth) * (xMax - xMin);
    const nearest = stems.reduce<{ stem: { x: number; y: number }; distance: number } | null>((best, stem) => { const distance = Math.abs(stem.x - position); return !best || distance < best.distance ? { stem, distance } : best; }, null);
    setHover(nearest && nearest.distance <= 0.5 ? { x: mapX(nearest.stem.x), y: mapY(nearest.stem.y), stem: nearest.stem } : null);
  };

  return (
    <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60" style={{ height }}>
      <div className="pb-1 text-xs font-bold tracking-wider text-slate-800 dark:text-white"><KatexMath math={titleKatex} /></div>
      <div ref={containerRef} onPointerMove={handleMove} onPointerLeave={() => setHover(null)} className="relative min-h-0 flex-1 cursor-crosshair select-none overflow-hidden">
        <div className="pointer-events-none absolute left-2 top-1 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400"><KatexMath math={yLabelKatex} /></div>
        <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400"><KatexMath math={xLabelKatex} /></div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {xTicks.map((n) => <line key={`gx${n}`} x1={mapX(n)} y1={STEM_PAD.top} x2={mapX(n)} y2={size.height - STEM_PAD.bottom} className="stroke-slate-300/40 dark:stroke-slate-700/40" strokeDasharray="3,3" strokeWidth={1} />)}
          {yTicks.map((tick) => <line key={`gy${tick.value}`} x1={STEM_PAD.left} y1={mapY(tick.value)} x2={size.width - STEM_PAD.right} y2={mapY(tick.value)} className="stroke-slate-300/40 dark:stroke-slate-700/40" strokeDasharray="3,3" strokeWidth={1} />)}
          {/* Hairline centre axes. */}
          <line x1={STEM_PAD.left} y1={zeroY} x2={size.width - STEM_PAD.right} y2={zeroY} className="stroke-slate-400 dark:stroke-slate-600" strokeWidth={1.25} />
          <line x1={mapX(0)} y1={STEM_PAD.top} x2={mapX(0)} y2={size.height - STEM_PAD.bottom} className="stroke-slate-400 dark:stroke-slate-600" strokeWidth={1.25} />
          {yTicks.map((tick) => <SvgKatexTick key={`ty${tick.value}`} x={STEM_PAD.left - 8} y={mapY(tick.value)} anchor="end">{tick.katex}</SvgKatexTick>)}
          {xTicks.map((n) => <SvgKatexTick key={`tx${n}`} x={mapX(n)} y={size.height - STEM_PAD.bottom + 16} baseline>{String(n)}</SvgKatexTick>)}
          {hover && <line x1={hover.x} y1={STEM_PAD.top} x2={hover.x} y2={size.height - STEM_PAD.bottom} className="stroke-slate-400/80 dark:stroke-slate-500/80" strokeDasharray="2 2" strokeWidth={1} />}
          {stems.map((stem) => {
            const sx = mapX(stem.x);
            const sy = mapY(stem.y);
            const active = hover?.stem.x === stem.x;
            return (
              <g key={`stem-${stem.x}`} stroke={color} fill={color}>
                {active && <circle cx={sx} cy={sy} r={9} fill={color} opacity={0.2} stroke="none" />}
                <line x1={sx} y1={zeroY} x2={sx} y2={sy} strokeWidth={active ? 3 : 2} />
                <circle cx={sx} cy={sy} r={active ? 4.5 : 3.5} className="stroke-white dark:stroke-slate-900" strokeWidth={1.25} />
              </g>
            );
          })}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-20 min-w-36 rounded-xl border border-slate-200/80 bg-white/95 p-3 text-xs text-slate-900 shadow-xl shadow-slate-900/10 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90 dark:text-slate-100"
            style={{ left: Math.min(size.width - 170, Math.max(8, hover.x + 12)), top: Math.max(8, Math.min(size.height - 80, hover.y - 30)) }}
          >
            <div className="mb-1.5 border-b border-slate-200/80 pb-1.5 text-[11px] font-semibold dark:border-slate-700/60">
              <KatexMath math={`n=${hover.stem.x},\\;\\omega=${Number((hover.stem.x * omega0).toFixed(3))}\\text{ rad/s}`} />
            </div>
            <KatexMath math={`${phase ? "\\angle c_{n}" : "|c_{n}|"}=${hover.stem.y.toFixed(4)}${phase ? "\\text{ rad}" : ""}`} className="text-[11px]" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Impulse lines as spikes of height |area| on a shared polyline (baseline runs along the ω axis). */
function impulseSpikes(impulses: Impulse[], bandwidth: number) {
  const visible = impulses.filter((impulse) => Math.abs(impulse.omega) <= bandwidth && Math.hypot(impulse.area.re, impulse.area.im) > 1e-9).sort((a, b) => a.omega - b.omega);
  if (!visible.length) return null;
  const data: Array<{ x: number; y: number }> = [{ x: -bandwidth, y: 0 }];
  visible.forEach((impulse) => { const height = Math.hypot(impulse.area.re, impulse.area.im); data.push({ x: impulse.omega, y: 0 }, { x: impulse.omega, y: height }, { x: impulse.omega, y: 0 }); });
  data.push({ x: bandwidth, y: 0 });
  return data;
}

export function FourierCanvases({ mode, series, spectrum, impulses, bandwidth, trace, periodic, harmonics, timeWindow }: Props) {
  // FS stems trimmed to the last harmonic above 1% of the peak (+20%), and to the summed band |n| ≤ max(N, 10).
  const stems = useMemo(() => {
    if (!series) return { magnitude: [], phase: [] };
    const peak = Math.max(...series.coefficients.map((item) => item.magnitude), 1e-12);
    const last = Math.max(0, ...series.coefficients.filter((item) => item.magnitude > 0.01 * peak).map((item) => Math.abs(item.harmonic)));
    const limit = Math.max(5, Math.min(Math.ceil(last * 1.2), Math.max(harmonics, 10)));
    const kept = series.coefficients.filter((item) => Math.abs(item.harmonic) <= limit);
    return {
      magnitude: kept.map((item) => ({ x: item.harmonic, y: item.magnitude })),
      phase: kept.filter((item) => item.magnitude > 1e-3 * peak).map((item) => ({ x: item.harmonic, y: item.phase })),
    };
  }, [series, harmonics]);

  const builder = useMemo(() => {
    if (mode !== "fs" || !series || !periodic) return null;
    const T0 = series.period;
    const start = timeWindow?.start ?? -T0; const span = (timeWindow?.end ?? T0) - start;
    // ≥ 40 samples per cycle of the highest harmonic so flat tops and jump edges resolve cleanly.
    const count = Math.min(8000, Math.max(600, Math.ceil((40 * Math.max(1, harmonics) * span) / T0)));
    const original: Array<{ x: number; y: number }> = []; const sum: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= count; i += 1) {
      const t = start + (span * i) / count;
      const local = ((((t + T0 / 2) % T0) + T0) % T0) - T0 / 2;
      original.push({ x: t, y: periodic(local) }); sum.push({ x: t, y: partialSum(series, t, harmonics) });
    }
    return [
      { id: "original", katexName: "x(t)", data: original, color: "#64748B", dashArray: "5 5" },
      { id: "partial-sum", katexName: `x_{${harmonics}}(t)`, data: sum, color: PARTIAL },
    ];
  }, [harmonics, mode, periodic, series, timeWindow?.start, timeWindow?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const magnitudeSeries = useMemo(() => {
    if (!spectrum) return [];
    const list = [{ id: "ft-mag", katexName: "|X(j\\omega)|", data: spectrum.map((point) => ({ x: point.omega, y: point.magnitude })), color: MAGNITUDE }];
    const spikes = impulseSpikes(impulses, bandwidth);
    if (spikes) list.push({ id: "ft-impulses", katexName: "\\text{impulse area}", data: spikes, color: IMPULSE });
    return list;
  }, [bandwidth, impulses, spectrum]);

  const omegaDomain: [number, number] = [-bandwidth, bandwidth];
  // Magnitude ceiling = 118% of the tallest curve or impulse spike, so peaks never touch the frame.
  const magnitudePeak = Math.max(0, ...magnitudeSeries.flatMap((entry) => entry.data.map((point) => point.y)));
  const magnitudeDomain: [number, number] = [0, magnitudePeak > 1e-9 ? magnitudePeak * 1.18 : 1];
  const omegaCursor = { cursorKatex: "\\omega", cursorUnitKatex: "\\text{ rad/s}" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
        {mode === "fs" && series ? (
          <SvgStemPlot titleKatex="\text{Magnitude spectrum } |c_{n}|" xLabelKatex="n\;(\omega=n\omega_0)" yLabelKatex="|c_{n}|" stems={stems.magnitude} color={MAGNITUDE} omega0={series.omega0} />
        ) : spectrum ? (
          <StandardStepPlot
            title={<KatexMath math="\text{Magnitude spectrum } |X(j\omega)|" />}
            series={magnitudeSeries}
            height={PLOT_HEIGHT}
            xLabelKatex="\omega\text{ (rad/s)}"
            yLabelKatex="|X(j\omega)|"
            xDomain={omegaDomain}
            yDomain={magnitudeDomain}
            showLegend={magnitudeSeries.length > 1}
            {...omegaCursor}
          />
        ) : null}

        {mode === "fs" && series ? (
          <SvgStemPlot titleKatex="\text{Phase spectrum } \angle c_{n}\text{ (rad)}" xLabelKatex="n\;(\omega=n\omega_0)" yLabelKatex="\angle c_{n}" stems={stems.phase} color={PHASE} omega0={series.omega0} phase />
        ) : spectrum ? (
          <StandardStepPlot
            title={<KatexMath math="\text{Phase spectrum } \angle X(j\omega)" />}
            series={[{ id: "ft-phase", katexName: "\\angle X(j\\omega)", data: spectrum.map((point) => ({ x: point.omega, y: point.phase })), color: PHASE, unit: "rad" }]}
            height={PLOT_HEIGHT}
            xLabelKatex="\omega\text{ (rad/s)}"
            yLabelKatex="\angle X(j\omega)\text{ (rad)}"
            xDomain={omegaDomain}
            yDomain={PHASE_DOMAIN}
            yTickLabels={PI_TICKS}
            showLegend={false}
            {...omegaCursor}
          />
        ) : null}
      </div>

      {builder ? (
        <StandardStepPlot
          title={<KatexMath math={`x_N(t) = a_0 + \\sum_{n=1}^{N} \\left( a_n \\cos(n\\omega_0 t) + b_n \\sin(n\\omega_0 t) \\right),\\; N=${harmonics}`} />}
          series={builder}
          xDomain={timeWindow ? [timeWindow.start, timeWindow.end] : undefined}
          height={PLOT_HEIGHT}
          xLabelKatex="t\text{ (s)}"
          yLabelKatex="x(t)"
          forceBipolar
          showLegend
        />
      ) : trace ? (
        <StandardStepPlot
          title={<KatexMath math={trace.katexName} />}
          series={[{ id: "trace", katexName: trace.katexName, data: trace.data, color: PARTIAL }]}
          height={PLOT_HEIGHT}
          xLabelKatex="t\text{ (s)}"
          yLabelKatex={trace.katexName}
          forceBipolar
          showLegend={false}
        />
      ) : null}
    </div>
  );
}

export default FourierCanvases;
