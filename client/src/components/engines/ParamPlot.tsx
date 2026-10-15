import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildPlotModel, tickX, type PlotDef, type PlotGeometry } from "./paramsSpec";

/** The chart is drawn 1:1 in CSS pixels at the container width, so text stays readable on a phone (a scaled-down 640 px viewBox would not). */
function geometry(width: number): PlotGeometry {
  const w = Math.min(760, Math.max(280, Math.round(width)));
  return { width: w, height: w < 480 ? Math.round(w * 0.82) : Math.round(w * 0.5), left: w < 480 ? 46 : 56, right: 14, top: 14, bottom: 48 };
}

export interface ParamPlotProps {
  plot: PlotDef;
  values: Readonly<Record<string, number>>;
  alt: string;
}

/** Inline-SVG line chart: axes with ticks and labels, grid, the curve and an optional vertical marker. Always black on white, left-to-right. */
function ParamPlotImpl({ plot, values, alt }: ParamPlotProps) {
  const clip = `plot-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    setWidth(element.clientWidth || 640);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth || 640));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const G = useMemo(() => geometry(width - 16), [width]);
  const model = useMemo(() => buildPlotModel(plot, values, G), [plot, values, G]);
  const h = G.height - G.top - G.bottom;
  const py = (y: number) => G.top + (1 - (y - model.yMin) / (model.yMax - model.yMin)) * h;
  const right = G.width - G.right;
  const bottom = G.height - G.bottom;
  return (
    <div ref={box} dir="ltr" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-900">
      <svg viewBox={`0 0 ${G.width} ${G.height}`} role="img" aria-label={alt} width={G.width} height={G.height} className="mx-auto block max-w-full" data-testid="param-plot" fontFamily="Arial, Helvetica, sans-serif">
        <rect width={G.width} height={G.height} fill="#ffffff" />
        {model.yTicks.map((tick) => (
          <g key={`y${tick.value}`}>
            <line x1={G.left} x2={right} y1={py(tick.value)} y2={py(tick.value)} stroke="#d4d4d8" strokeDasharray="3 3" />
            <text x={G.left - 6} y={py(tick.value) + 4} textAnchor="end" fontSize="12" fill="#27272a">{tick.label}</text>
          </g>
        ))}
        {model.xTicks.map((tick) => {
          const x = tickX(plot, G, tick.value);
          return (
            <g key={`x${tick.value}`}>
              <line x1={x} x2={x} y1={G.top} y2={bottom} stroke="#d4d4d8" strokeDasharray="3 3" />
              <text x={x} y={bottom + 16} textAnchor="middle" fontSize="12" fill="#27272a">{tick.label}</text>
            </g>
          );
        })}
        <rect x={G.left} y={G.top} width={right - G.left} height={h} fill="none" stroke="#18181b" strokeWidth="1.2" />
        <clipPath id={clip}>
          <rect x={G.left} y={G.top} width={right - G.left} height={h} />
        </clipPath>
        <path d={model.path} fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinejoin="round" clipPath={`url(#${clip})`} data-testid="param-curve" />
        {model.marker ? (
          <g data-testid="param-marker" data-x={model.marker.x.toFixed(1)}>
            <line x1={model.marker.x} x2={model.marker.x} y1={G.top} y2={bottom} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={Math.min(model.marker.x + 5, right - 4)} y={G.top + 13} textAnchor={model.marker.x > right - 90 ? "end" : "start"} dx={model.marker.x > right - 90 ? -10 : 0} fontSize="12" fontWeight="600" fill="#b91c1c">
              {model.marker.label}
            </text>
          </g>
        ) : null}
        <text x={(G.left + right) / 2} y={G.height - 8} textAnchor="middle" fontSize="13" fill="#18181b">{plot.xLabel}</text>
        <text transform={`translate(14 ${(G.top + bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="#18181b">{plot.yLabel}</text>
      </svg>
    </div>
  );
}

export const ParamPlot = memo(ParamPlotImpl);
