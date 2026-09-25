/**
 * MAE Academy / Signals & Systems — Tab D Spectral Vector Scope.
 * Vector SVG implementation consuming canonical StandardStepPlot architecture.
 * Renders:
 * 1. Magnitude Spectrum: Discrete stems for Fourier Series |c_k|, continuous curve for Fourier Transform |X(jω)|
 * 2. Phase Spectrum: Discrete stems for Fourier Series ∠c_k, continuous curve for Fourier Transform ∠X(jω)
 * 3. Harmonic Builder / Time Scaling: Canonical StandardStepPlot displaying x(t) and reconstructed partial sum x_N(t)
 */
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { StandardStepPlot } from "@/components/common/templates/StandardStepPlot";
import {
  partialSum,
  type FourierSeriesResult,
  type FourierTransformResult,
} from "@/features/signals/engines/fourierEngine";
import { evaluateSignal, type SignalNode } from "@/features/signals/engines/signalEngine";

type Props = {
  mode: "fs" | "ft";
  series: FourierSeriesResult | null;
  transform: FourierTransformResult | null;
  node: SignalNode;
  harmonics: number;
  scale: number;
};

interface SvgStemPlotProps {
  titleKatex: string;
  xLabelKatex: string;
  yLabelKatex: string;
  stems: Array<{ x: number; y: number }>;
  color: string;
  height?: number;
  forceBipolar?: boolean;
}

const STEM_PAD = { top: 24, bottom: 28, left: 48, right: 24 };

/** Canonical discrete stem plot for Fourier Series harmonic coefficients */
function SvgStemPlot({
  titleKatex,
  xLabelKatex,
  yLabelKatex,
  stems,
  color,
  height = 180,
  forceBipolar = false,
}: SvgStemPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 500, height });

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

  const plotW = Math.max(10, size.width - STEM_PAD.left - STEM_PAD.right);
  const plotH = Math.max(10, size.height - STEM_PAD.top - STEM_PAD.bottom);

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (!stems.length) return { xMin: -6, xMax: 6, yMin: -1, yMax: 1 };
    const maxK = Math.max(5, ...stems.map((s) => Math.abs(s.x)));
    const maxYVal = Math.max(0.2, ...stems.map((s) => Math.abs(s.y)));
    const yTop = maxYVal * 1.2;
    const yBottom = forceBipolar ? -yTop : 0;
    return { xMin: -maxK, xMax: maxK, yMin: yBottom, yMax: yTop };
  }, [stems, forceBipolar]);

  const mapX = useCallback(
    (x: number) => STEM_PAD.left + ((x - xMin) / (xMax - xMin)) * plotW,
    [plotW, xMax, xMin]
  );
  const mapY = useCallback(
    (y: number) => STEM_PAD.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH,
    [plotH, yMax, yMin]
  );
  const zeroY = mapY(0);

  // Generate integer harmonic ticks
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = Math.max(1, Math.round((xMax - xMin) / 10));
    for (let k = Math.ceil(xMin); k <= xMax; k += step) {
      ticks.push(k);
    }
    return ticks;
  }, [xMax, xMin]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#07101e]"
      style={{ height }}
    >
      <svg className="absolute inset-0 h-full w-full pointer-events-none select-none">
        {/* Vertical Harmonic Grid */}
        {xTicks.map((k) => (
          <line
            key={`x-grid-${k}`}
            x1={mapX(k)}
            y1={STEM_PAD.top}
            x2={mapX(k)}
            y2={size.height - STEM_PAD.bottom}
            stroke="currentColor"
            strokeDasharray="2 4"
            className="text-slate-200 dark:text-slate-800"
            strokeWidth={1}
          />
        ))}

        {/* Horizontal Ticks */}
        {[yMin, (yMin + yMax) / 2, yMax].map((yVal, idx) => {
          const sy = mapY(yVal);
          return (
            <g key={`y-grid-${idx}`}>
              <line
                x1={STEM_PAD.left}
                y1={sy}
                x2={size.width - STEM_PAD.right}
                y2={sy}
                stroke="currentColor"
                strokeDasharray={Math.abs(yVal) < 1e-4 ? undefined : "2 4"}
                className={
                  Math.abs(yVal) < 1e-4
                    ? "text-violet-400/60 dark:text-violet-500/60"
                    : "text-slate-200 dark:text-slate-800"
                }
                strokeWidth={Math.abs(yVal) < 1e-4 ? 1.5 : 1}
              />
              <text
                x={STEM_PAD.left - 8}
                y={sy + 3.5}
                textAnchor="end"
                className="fill-slate-400 font-mono text-[9px] dark:fill-slate-500"
              >
                {yVal.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Zero Axis */}
        <line
          x1={mapX(0)}
          y1={STEM_PAD.top}
          x2={mapX(0)}
          y2={size.height - STEM_PAD.bottom}
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-violet-400/60 dark:text-violet-500/60"
        />

        {/* Harmonic Number Ticks */}
        {xTicks.map((k) => (
          <text
            key={`k-tick-${k}`}
            x={mapX(k)}
            y={size.height - STEM_PAD.bottom + 14}
            textAnchor="middle"
            className="fill-slate-500 font-mono text-[10px] dark:fill-slate-400"
          >
            {k}
          </text>
        ))}

        {/* Stems */}
        {stems.map((stem, idx) => {
          const sx = mapX(stem.x);
          const sy = mapY(stem.y);
          return (
            <g key={`stem-${idx}`} stroke={color} fill={color}>
              <line x1={sx} y1={zeroY} x2={sx} y2={sy} strokeWidth={2.4} />
              <circle cx={sx} cy={sy} r={3.5} stroke="#FFFFFF" strokeWidth={1} />
            </g>
          );
        })}
      </svg>

      {/* Header KaTeX Title */}
      <div className="pointer-events-none absolute left-3 top-2 flex items-center gap-2 rounded-md bg-white/80 px-2 py-0.5 text-xs font-bold text-slate-800 backdrop-blur-sm dark:bg-slate-900/80 dark:text-slate-200">
        <KatexMath math={titleKatex} />
      </div>

      {/* Axis KaTeX Label */}
      <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-white/80 px-1.5 py-0.5 text-xs font-bold text-slate-600 backdrop-blur-sm dark:bg-slate-900/80 dark:text-slate-400">
        <KatexMath math={xLabelKatex} />
      </div>
    </div>
  );
}

export function FourierCanvases({
  mode,
  series,
  transform,
  node,
  harmonics,
  scale,
}: Props) {
  // Harmonic Builder / Time Scaling Data
  const builderSeries = useMemo(() => {
    if (mode === "fs" && series) {
      const T0 = series.period;
      const count = 300;
      const original: Array<{ x: number; y: number }> = [];
      const sum: Array<{ x: number; y: number }> = [];

      for (let i = 0; i <= count; i++) {
        const t = -T0 + (2 * T0 * i) / count;
        const localT = (((t + T0 / 2) % T0) + T0) % T0 - T0 / 2;
        original.push({ x: t, y: evaluateSignal(node, localT) });
        sum.push({ x: t, y: partialSum(series, t, harmonics) });
      }

      return {
        xLabel: "t\\text{ (s)}",
        yLabel: "x(t)",
        title: `Harmonic Builder: x_N(t) \\text{ with } N=${harmonics}`,
        seriesList: [
          {
            id: "original",
            katexName: "x(t)",
            data: original,
            color: "#64748B",
            dashArray: "5 5",
          },
          {
            id: "partial-sum",
            katexName: `x_{${harmonics}}(t)`,
            data: sum,
            color: "#8B5CF6", // Brand violet
          },
        ],
      };
    }

    if (mode === "ft") {
      const count = 300;
      const scaled: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= count; i++) {
        const t = -3 + (6 * i) / count;
        scaled.push({ x: t, y: evaluateSignal(node, scale * t) });
      }

      return {
        xLabel: "t\\text{ (s)}",
        yLabel: `x(${scale.toFixed(2)}t)`,
        title: `Time Scaling Property: x(${scale.toFixed(2)}t)`,
        seriesList: [
          {
            id: "scaled",
            katexName: `x(${scale.toFixed(2)}t)`,
            data: scaled,
            color: "#8B5CF6",
          },
        ],
      };
    }

    return null;
  }, [harmonics, mode, node, scale, series]);

  return (
    <div className="space-y-4">
      {/* 1. Magnitude Spectrum */}
      {mode === "fs" && series ? (
        <SvgStemPlot
          titleKatex="\text{Magnitude Spectrum } |c_k|"
          xLabelKatex="k"
          yLabelKatex="|c_k|"
          stems={series.coefficients.map((item) => ({
            x: item.harmonic,
            y: item.magnitude,
          }))}
          color="#2563EB"
          height={180}
        />
      ) : transform ? (
        <StandardStepPlot
          title="Magnitude Spectrum |X(jω)|"
          series={[
            {
              id: "ft-mag",
              katexName: "|X(j\\omega)|",
              data: transform.spectrum.map((pt) => ({ x: pt.omega, y: pt.magnitude })),
              color: "#2563EB",
            },
          ]}
          height={180}
          xLabelKatex="\omega\text{ (rad/s)}"
          yLabelKatex="|X(j\omega)|"
          showLegend={false}
        />
      ) : null}

      {/* 2. Phase Spectrum */}
      {mode === "fs" && series ? (
        <SvgStemPlot
          titleKatex="\text{Phase Spectrum } \angle c_k\text{ (rad)}"
          xLabelKatex="k"
          yLabelKatex="\angle c_k"
          stems={series.coefficients
            .filter((item) => item.magnitude > 1e-3)
            .map((item) => ({
              x: item.harmonic,
              y: item.phase,
            }))}
          color="#E11D48"
          height={180}
          forceBipolar
        />
      ) : transform ? (
        <StandardStepPlot
          title="Phase Spectrum ∠X(jω)"
          series={[
            {
              id: "ft-phase",
              katexName: "\\angle X(j\\omega)",
              data: transform.spectrum.map((pt) => ({ x: pt.omega, y: pt.phase })),
              color: "#E11D48",
            },
          ]}
          height={180}
          xLabelKatex="\omega\text{ (rad/s)}"
          yLabelKatex="\angle X(j\omega)\text{ (rad)}"
          forceBipolar
          showLegend={false}
        />
      ) : null}

      {/* 3. Harmonic Builder / Time Scaling Plot */}
      {builderSeries && (
        <StandardStepPlot
          title={builderSeries.title}
          series={builderSeries.seriesList}
          height={210}
          xLabelKatex={builderSeries.xLabel}
          yLabelKatex={builderSeries.yLabel}
          forceBipolar
          showLegend={builderSeries.seriesList.length > 1}
        />
      )}
    </div>
  );
}

export default FourierCanvases;
