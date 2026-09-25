/**
 * MAE Academy / Signals & Systems — canonical discrete-time stem plot.
 * Matches DiscreteConvolutionScope: 1.5 px stems from the y = 0 baseline, solid 4 px heads, hairline
 * centre axes, strictly integer KaTeX n-ticks, and a frosted-glass HUD with a halo on the hovered sample.
 * The caller supplies the auto-scaled integer window and y-domain so several plots can share one frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SvgKatexTick } from "@/components/common/templates/SvgKatexTick";
import { niceTicks } from "@/lib/plotAutoScale";
import type { DiscreteSample } from "@/features/signals/engines/discreteSignalEngine";

type Props = {
  title: string;
  /** KaTeX name used in the y label and tooltip, e.g. "x[n]". */
  name: string;
  samples: DiscreteSample[];
  color: string;
  window: { from: number; to: number };
  yDomain: [number, number];
  height?: number;
  testId?: string;
};

// Equal left/right padding: with a symmetric window the n = 0 axis lands on the exact horizontal centre.
const PAD = { top: 34, bottom: 34, left: 48, right: 48 };

/** Integer tick step so that at most ~22 labels fit (1, 2, 5, 10, …); a ±10 window labels every sample. */
function integerStep(span: number): number {
  for (const step of [1, 2, 5, 10, 20]) if (span / step <= 22) return step;
  return 50;
}

export function DiscreteStemPlot({ title, name, samples, color, window, yDomain, height = 240, testId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height });
  const [hover, setHover] = useState<DiscreteSample | null>(null);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const update = () => { const rect = el.getBoundingClientRect(); if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height }); };
    update();
    const observer = new ResizeObserver(update); observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Half a sample of padding on each side so the outermost stems never sit on the frame.
  const xMin = window.from - 0.5; const xMax = window.to + 0.5; const [yMin, yMax] = yDomain;
  const plotW = Math.max(10, size.width - PAD.left - PAD.right); const plotH = Math.max(10, size.height - PAD.top - PAD.bottom);
  const mapX = useCallback((n: number) => PAD.left + ((n - xMin) / (xMax - xMin)) * plotW, [plotW, xMax, xMin]);
  const mapY = useCallback((y: number) => PAD.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH, [plotH, yMax, yMin]);
  const zeroY = mapY(0);

  const visible = useMemo(() => samples.filter((sample) => sample.n >= window.from && sample.n <= window.to), [samples, window]);
  const step = integerStep(window.to - window.from);
  const nTicks = useMemo(() => { const ticks: number[] = []; for (let n = Math.ceil(window.from / step) * step; n <= window.to; n += step) ticks.push(n); return ticks; }, [step, window]);
  const yTicks = useMemo(() => niceTicks(yMin, yMax, 5).filter((value) => value >= yMin && value <= yMax), [yMax, yMin]);

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left;
    const n = Math.round(xMin + ((x - PAD.left) / plotW) * (xMax - xMin));
    setHover(n >= window.from && n <= window.to ? visible.find((sample) => sample.n === n) ?? null : null);
  };

  return (
    <div data-testid={testId} className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60" style={{ height }}>
      <div className="pb-1 text-xs font-bold tracking-wider text-slate-800 dark:text-white"><KatexMath math={title} /></div>
      <div ref={containerRef} onPointerMove={handleMove} onPointerLeave={() => setHover(null)} className="relative min-h-0 flex-1 cursor-crosshair select-none overflow-hidden">
        <div className="pointer-events-none absolute left-2 top-1 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400"><KatexMath math={name} /></div>
        <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[11px] font-medium text-slate-500 dark:text-slate-400"><KatexMath math="n\in\mathbb{Z}" /></div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {nTicks.map((n) => <line key={`gx${n}`} x1={mapX(n)} y1={PAD.top} x2={mapX(n)} y2={PAD.top + plotH} className="stroke-slate-200/70 dark:stroke-slate-800/70" strokeDasharray="3 3" strokeWidth={1} />)}
          {yTicks.map((value) => <line key={`gy${value}`} x1={PAD.left} y1={mapY(value)} x2={PAD.left + plotW} y2={mapY(value)} className="stroke-slate-200/70 dark:stroke-slate-800/70" strokeDasharray="3 3" strokeWidth={1} />)}
          {/* Hairline centre axes (y = 0 and n = 0 when in view). */}
          <line x1={PAD.left} y1={zeroY} x2={PAD.left + plotW} y2={zeroY} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth={1.25} />
          {window.from <= 0 && window.to >= 0 && <line x1={mapX(0)} y1={PAD.top} x2={mapX(0)} y2={PAD.top + plotH} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth={1.25} />}
          {yTicks.filter((value) => Math.abs(value) > 1e-12).map((value) => <SvgKatexTick key={`ty${value}`} x={PAD.left - 8} y={mapY(value)} anchor="end">{String(Number(value.toPrecision(3)))}</SvgKatexTick>)}
          {nTicks.map((n) => <SvgKatexTick key={`tx${n}`} x={mapX(n)} y={PAD.top + plotH + 18} baseline active={hover?.n === n}>{String(n)}</SvgKatexTick>)}
          {hover && <line x1={mapX(hover.n)} y1={PAD.top} x2={mapX(hover.n)} y2={PAD.top + plotH} className="stroke-slate-400/80 dark:stroke-slate-500/80" strokeDasharray="2 2" strokeWidth={1} />}
          {visible.map((sample) => {
            const x = mapX(sample.n); const y = mapY(sample.value); const active = hover?.n === sample.n;
            return (
              <g key={sample.n} data-n={sample.n} data-value={sample.value}>
                {active && <circle cx={x} cy={y} r={10} fill={color} opacity={0.18} />}
                <line x1={x} y1={zeroY} x2={x} y2={y} stroke={color} strokeWidth={1.5} />
                <circle cx={x} cy={y} r={active ? 5 : 4} fill={color} className="stroke-white dark:stroke-slate-900" strokeWidth={1.25} />
              </g>
            );
          })}
        </svg>
        {hover && (
          <div
            data-testid="stem-tooltip"
            className="pointer-events-none absolute z-20 min-w-32 rounded-xl border border-slate-200/80 bg-white/95 p-3 text-xs text-slate-900 shadow-xl shadow-slate-900/10 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90 dark:text-slate-100"
            style={{ left: Math.min(size.width - 150, Math.max(8, mapX(hover.n) + 14)), top: Math.max(8, Math.min(size.height - 76, mapY(hover.value) - 30)) }}
          >
            <div className="mb-1.5 border-b border-slate-200/80 pb-1.5 text-[11px] font-semibold dark:border-slate-700/60"><KatexMath math={`n = ${hover.n}`} /></div>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <KatexMath math={`${name} = ${hover.value.toFixed(3)}`} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default DiscreteStemPlot;
