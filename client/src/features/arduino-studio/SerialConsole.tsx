/** Serial Monitor (Serial.print/println output + input buffer for Serial.read) and a real-time waveform plotter. */
import { ChevronDown, ChevronUp, CornerDownLeft, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { SerialState } from "./useArduinoRuntime";

const SERIES_COLORS = ["#ef4444", "#06b6d4", "#8b5cf6", "#f59e0b", "#22c55e", "#ec4899"] as const;
/** Oscilloscope time base: the plot always spans exactly this many seconds, independent of print rate. */
const WINDOW_S = 10;
const WINDOW_MS = WINDOW_S * 1000;
const MAX_ROWS = 1000;
const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export interface PlotData {
  labels: string[];
  series: number[][];
  /** Simulation time (ms) of each sample. */
  times: number[];
}

/** Parses "1", "1,2,3", "a:1 b:2" style lines (Arduino Serial Plotter formats); returns null for non-numeric lines. */
export function parsePlotLine(line: string): { label: string | null; value: number }[] | null {
  const tokens = line.trim().split(/[\s,;\t]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > SERIES_COLORS.length) return null;
  const out: { label: string | null; value: number }[] = [];
  for (const tok of tokens) {
    const colon = tok.lastIndexOf(":");
    const label = colon > 0 ? tok.slice(0, colon) : null;
    const num = colon > 0 ? tok.slice(colon + 1) : tok;
    if (!NUMERIC.test(num)) return null;
    out.push({ label, value: Number(num) });
  }
  return out;
}

export function buildPlotData(lines: readonly string[], times: readonly number[], seriesLabel: (index: number) => string = i => `Series ${i}`): PlotData {
  const rows: { label: string | null; value: number }[][] = [];
  const t: number[] = [];
  let newest = -1;
  for (let i = lines.length - 1; i >= 0 && rows.length < MAX_ROWS; i--) {
    const parsed = parsePlotLine(lines[i]);
    if (!parsed) continue;
    const ti = times[i] ?? 0;
    if (newest < 0) newest = ti;
    if (ti < newest - WINDOW_MS) break;
    rows.unshift(parsed);
    t.unshift(ti);
  }
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const labels = Array.from({ length: width }, (_, i) => rows.map(r => r[i]?.label).find(l => l) ?? seriesLabel(i + 1));
  const series = Array.from({ length: width }, (_, i) => rows.map(r => r[i]?.value ?? NaN));
  return { labels, series, times: t };
}

/** Catmull-Rom spline through the points, converted to cubic Beziers for smooth anti-aliased curves. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function Plotter({ data, t }: { data: PlotData; t: TFunction }) {
  const W = 400;
  const H = 160;
  const pad = { l: 34, r: 8, t: 8, b: 4 };
  const finite = data.series.flat().filter(Number.isFinite);
  if (finite.length === 0) {
    return (
      <div className="mae-i18n-text flex h-full items-center justify-center px-4 text-center font-mono text-[11px] text-slate-400 dark:text-slate-600">
        {t("arduino.plotterHint", "Print numeric values (one per line, comma-separated for several series) to plot them live.")}
      </div>
    );
  }
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  const latest = data.times[data.times.length - 1] ?? 0;
  const tEnd = Math.max(latest, WINDOW_MS);
  const tStart = tEnd - WINDOW_MS;
  const xt = (ms: number) => pad.l + ((ms - tStart) / WINDOW_MS) * (W - pad.l - pad.r);
  const xTicks: number[] = [];
  for (let ms = Math.ceil(tStart / 2000) * 2000; ms <= tEnd; ms += 2000) xTicks.push(ms);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={t("arduino.serialPlotterAria", "Serial plotter")} shapeRendering="geometricPrecision">
          {ticks.map(t => (
            <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {xTicks.map(i => (
            <line key={i} x1={xt(i)} x2={xt(i)} y1={H - pad.b - 4} y2={H - pad.b} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {data.series.map((s, si) => {
            const pts = s.map((v, i): [number, number] | null => (Number.isFinite(v) ? [xt(data.times[i]), y(v)] : null)).filter((p): p is [number, number] => p !== null);
            return <path key={si} d={smoothPath(pts)} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </svg>
        {ticks.map(t => (
          <span key={t} className="pointer-events-none absolute start-1 -translate-y-1/2 font-mono text-[9px] leading-none text-slate-400 dark:text-slate-500" style={{ top: `${(y(t) / H) * 100}%` }}>
            {Math.abs(t) >= 100 ? t.toFixed(0) : t.toFixed(1)}
          </span>
        ))}
      </div>
      <div className="relative mx-0 h-6 shrink-0 font-mono text-[9px] leading-none text-slate-400 dark:text-slate-500">
        {xTicks.map(ms => (
          <span key={ms} className="absolute top-0.5 -translate-x-1/2 tabular-nums" style={{ left: `${(xt(ms) / W) * 100}%` }}>
            {(ms / 1000).toFixed(0)}
          </span>
        ))}
        <span className="absolute inset-x-0 top-3 text-center font-semibold text-slate-500 dark:text-slate-400">{t("arduino.timeAxisLabel", "Time (s)")}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 px-2 pb-1.5 pt-1 font-mono text-[10px]">
        {data.labels.map((label, i) => {
          const last = data.series[i][data.series[i].length - 1];
          return (
            <span key={label + i} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {label}
              <span className="tabular-nums text-slate-800 dark:text-slate-200">{Number.isFinite(last) ? last : "—"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  serial: SerialState;
  baud: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSend: (text: string) => void;
  onClear: () => void;
  className?: string;
}

export function SerialConsole({ serial, baud, collapsed, onToggleCollapsed, onSend, onClear, className }: Props) {
  const { t } = useTranslation("simulators");
  const [input, setInput] = useState("");
  const [autoscroll, setAutoscroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const plot = useMemo(
    () => buildPlotData(serial.lines, serial.times, index => t("arduino.seriesLabel", "Series {{index}}", { index })),
    [serial.lines, serial.times, t]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoscroll) el.scrollTop = el.scrollHeight;
  }, [serial, autoscroll, collapsed]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    onSend(`${input}\n`);
    setInput("");
  };

  return (
    <section className={`flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12] ${className ?? ""}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#1a1d24] dark:bg-[#0d0f12]">
        <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} className="flex min-h-11 sm:min-h-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <div className="me-1 flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-[#E0443E]/40 bg-[#FF5F56]" />
            <span className="h-2.5 w-2.5 rounded-full border border-[#DEA123]/40 bg-[#FFBD2E]" />
            <span className="h-2.5 w-2.5 rounded-full border border-[#1AAB29]/40 bg-[#27C93F]" />
          </div>
          <Terminal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <span className="font-mono tracking-wider">serial.monitor</span>
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <div className="flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          <span>{baud ? t("arduino.baudSuffix", "{{baud}} baud", { baud }) : t("arduino.portClosed", "port closed")}</span>
          <label className="flex min-h-11 sm:min-h-0 cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={autoscroll} onChange={e => setAutoscroll(e.target.checked)} className="h-4 w-4 accent-violet-500" />
            {t("arduino.autoscroll", "autoscroll")}
          </label>
          <button type="button" onClick={onClear} title={t("arduino.clearSerialOutput", "Clear serial output")} className="touch-target cursor-pointer p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <div className="flex min-h-0 flex-col border-b border-slate-200 dark:border-[#1a1d24] md:border-b-0 md:border-e">
            <div ref={scrollRef} className="min-h-0 flex-1 select-text overflow-y-auto bg-white p-2.5 font-mono text-xs leading-relaxed text-slate-800 dark:bg-[#050608] dark:text-slate-100">
              {serial.lines.length === 0 && !serial.partial ? (
                <div className="mae-i18n-text italic text-slate-400 dark:text-slate-600">
                  {t("arduino.serialEmptyState", "Serial output appears here. Call Serial.begin() then Serial.println().")}
                </div>
              ) : (
                <>
                  {serial.lines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">
                      {line || " "}
                    </div>
                  ))}
                  {serial.partial && <div className="whitespace-pre-wrap break-all">{serial.partial}</div>}
                </>
              )}
            </div>
            <form onSubmit={submit} className="flex shrink-0 items-center gap-1.5 border-t border-slate-200 bg-slate-50 p-1.5 dark:border-[#1a1d24] dark:bg-[#090a0d]">
              <span className="ps-2 font-mono text-xs font-bold text-violet-400">&gt;</span>
              <input
                aria-label={t("arduino.serialInputAria", "Serial input buffer")}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={t("assembler.keyboardEntry", "Keyboard entry (stdin buffer)…")}
                className="min-h-11 sm:min-h-0 min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-xs text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-600"
              />
              <button type="submit" className="inline-flex min-h-11 sm:min-h-0 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1b2028] dark:hover:text-white">
                <CornerDownLeft className="h-3 w-3" />
                {t("arduino.send", "Send")}
              </button>
            </form>
          </div>

          <div className="flex min-h-0 flex-col bg-white dark:bg-[#050608]">
            <div className="min-h-0 flex-1">
              <Plotter data={plot} t={t} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
