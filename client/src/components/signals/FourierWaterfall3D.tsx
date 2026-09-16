/**
 * MAE Academy / Signals & Systems — Tab D Plotly harmonic waterfall.
 * Plotly owns 3D orbit/pan controls; the pure Fourier engine supplies each
 * individual harmonic trajectory in (time, harmonic frequency, amplitude).
 */
import { useEffect, useRef, useState } from "react";
import { waterfallHarmonics, type FourierSeriesResult } from "@/features/signals/engines/fourierEngine";
import { loadPlotlyGl3d, type PlotlyRuntime } from "./plotlyRuntime";

type Props = { series: FourierSeriesResult; harmonics: number };
const palette = ["#60a5fa", "#818cf8", "#a78bfa", "#d946ef", "#fb7185", "#fb923c"];

export function FourierWaterfall3D({ series, harmonics }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { let disposed = false; let plotly: PlotlyRuntime | null = null; const root = host.current; if (!root) return;
    setStatus("loading");
    void loadPlotlyGl3d().then((runtime) => { if (disposed || !host.current) return; plotly = runtime; const traces = waterfallHarmonics(series, Math.min(12, harmonics), 110).map((harmonic, index) => ({ type: "scatter3d" as const, mode: "lines" as const, x: harmonic.time, y: harmonic.time.map(() => harmonic.harmonic * series.omega0), z: harmonic.amplitude, line: { color: palette[index % palette.length], width: harmonic.harmonic === 0 ? 7 : 4 }, name: `k=${harmonic.harmonic}`, hovertemplate: "t=%{x:.2f}<br>kω₀=%{y:.2f}<br>A=%{z:.3f}<extra></extra>" }));
      return plotly.react(host.current!, traces, { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", margin: { l: 0, r: 0, t: 8, b: 0 }, showlegend: false, scene: { bgcolor: "rgba(7,16,30,.98)", xaxis: { title: { text: "time t" }, color: "#cbd5e1", gridcolor: "#334155", zerolinecolor: "#64748b" }, yaxis: { title: { text: "harmonic kω₀" }, color: "#cbd5e1", gridcolor: "#334155", zerolinecolor: "#64748b" }, zaxis: { title: { text: "amplitude" }, color: "#cbd5e1", gridcolor: "#334155", zerolinecolor: "#64748b" }, camera: { eye: { x: 1.55, y: 1.45, z: 0.82 } } } }, { displayModeBar: false, responsive: true, scrollZoom: true });
    }).then(() => { if (!disposed) setStatus("ready"); }).catch(() => { if (!disposed) setStatus("error"); }); return () => { disposed = true; if (plotly && root) plotly.purge(root); };
  }, [harmonics, series]);
  return <div className="relative h-[430px] w-full overflow-hidden rounded-2xl border border-violet-400/30 bg-[#07101e]" aria-label="Interactive 3D time frequency harmonic waterfall. Drag to rotate and use the wheel to zoom."><div ref={host} className="h-full w-full" />{status !== "ready" && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#07101e] text-center"><div className="max-w-xs"><span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" /><p className="mt-3 text-xs font-bold text-violet-100">{status === "loading" ? "Initializing the interactive harmonic space…" : "The 3D harmonic space could not initialize in this browser."}</p></div></div>}</div>;
}

export default FourierWaterfall3D;
