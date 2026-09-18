/** Serial Monitor (Serial.print/println output + input buffer for Serial.read) and a real-time waveform plotter. */
import { ChevronDown, ChevronUp, CornerDownLeft, LineChart, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SerialState } from "./useArduinoRuntime";

const SERIES_COLORS = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24", "#a78bfa", "#fb7185"] as const;
const MAX_SAMPLES = 300;
const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export interface PlotData {
  labels: string[];
  series: number[][];
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

export function buildPlotData(lines: readonly string[]): PlotData {
  const rows: { label: string | null; value: number }[][] = [];
  for (let i = lines.length - 1; i >= 0 && rows.length < MAX_SAMPLES; i--) {
    const parsed = parsePlotLine(lines[i]);
    if (parsed) rows.unshift(parsed);
  }
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const labels = Array.from({ length: width }, (_, i) => rows.map(r => r[i]?.label).find(l => l) ?? `Series ${i + 1}`);
  const series = Array.from({ length: width }, (_, i) => rows.map(r => r[i]?.value ?? NaN));
  return { labels, series };
}

function Plotter({ data }: { data: PlotData }) {
  const W = 400;
  const H = 160;
  const pad = { l: 34, r: 8, t: 8, b: 14 };
  const finite = data.series.flat().filter(Number.isFinite);
  if (finite.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center font-mono text-[11px] text-slate-500">
        Print numeric values (one per line, comma-separated for several series) to plot them live.
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
  const n = data.series[0].length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="min-h-0 flex-1" role="img" aria-label="Serial plotter">
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-slate-700/60" strokeWidth={0.5} strokeDasharray="2 3" />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="fill-slate-500" fontSize={8} fontFamily="ui-monospace, monospace">
              {Math.abs(t) >= 100 ? t.toFixed(0) : t.toFixed(1)}
            </text>
          </g>
        ))}
        {data.series.map((s, si) => {
          const pts = s.map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(" ");
          return <polyline key={si} points={pts} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 pb-1 font-mono text-[10px]">
        {data.labels.map((label, i) => {
          const last = data.series[i][data.series[i].length - 1];
          return (
            <span key={label + i} className="inline-flex items-center gap-1 text-slate-400">
              <span className="h-1.5 w-3 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {label}
              <span className="text-slate-200 tabular-nums">{Number.isFinite(last) ? last : "—"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const LINE_ENDINGS = { none: "", nl: "\n", cr: "\r", both: "\r\n" } as const;
type LineEnding = keyof typeof LINE_ENDINGS;

interface Props {
  serial: SerialState;
  baud: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSend: (text: string) => void;
  onClear: () => void;
}

export function SerialConsole({ serial, baud, collapsed, onToggleCollapsed, onSend, onClear }: Props) {
  const [input, setInput] = useState("");
  const [ending, setEnding] = useState<LineEnding>("nl");
  const [autoscroll, setAutoscroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const plot = useMemo(() => buildPlotData(serial.lines), [serial.lines]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoscroll) el.scrollTop = el.scrollHeight;
  }, [serial, autoscroll, collapsed]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input && ending === "none") return;
    onSend(input + LINE_ENDINGS[ending]);
    setInput("");
  };

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12] ${collapsed ? "shrink-0" : "h-[42%] shrink-0"}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#1a1d24] dark:bg-[#0d0f12]">
        <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <div className="me-1 flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-[#E0443E]/40 bg-[#FF5F56]" />
            <span className="h-2.5 w-2.5 rounded-full border border-[#DEA123]/40 bg-[#FFBD2E]" />
            <span className="h-2.5 w-2.5 rounded-full border border-[#1AAB29]/40 bg-[#27C93F]" />
          </div>
          <Terminal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <span className="font-mono tracking-wider">serial.monitor</span>
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400 dark:text-slate-500">
          <span>{baud ? `${baud} baud` : "port closed"}</span>
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={autoscroll} onChange={e => setAutoscroll(e.target.checked)} className="accent-violet-500" />
            autoscroll
          </label>
          <button type="button" onClick={onClear} title="Clear serial output" className="cursor-pointer p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <div className="flex min-h-0 flex-col border-b border-[#1a1d24] md:border-b-0 md:border-e">
            <div ref={scrollRef} className="min-h-0 flex-1 select-text overflow-y-auto bg-[#050608] p-2.5 font-mono text-xs leading-relaxed text-slate-100">
              {serial.lines.length === 0 && !serial.partial ? (
                <div className="italic text-slate-600">Serial output appears here. Call Serial.begin() then Serial.println().</div>
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
            <form onSubmit={submit} className="flex shrink-0 items-center gap-1.5 border-t border-[#1a1d24] bg-[#090a0d] p-1.5">
              <span className="ps-2 font-mono text-xs font-bold text-violet-400">&gt;</span>
              <input
                aria-label="Serial input buffer"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Send to Serial.read()…"
                className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600"
              />
              <select
                aria-label="Line ending"
                value={ending}
                onChange={e => setEnding(e.target.value as LineEnding)}
                className="cursor-pointer rounded-md border border-[#1a1d24] bg-[#13161c] px-1.5 py-1 font-mono text-[10px] text-slate-300 outline-none"
              >
                <option value="none">No line ending</option>
                <option value="nl">Newline</option>
                <option value="cr">Carriage return</option>
                <option value="both">Both NL &amp; CR</option>
              </select>
              <button type="submit" className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#1a1d24] bg-[#13161c] px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-[#1b2028] hover:text-white">
                <CornerDownLeft className="h-3 w-3" />
                Send
              </button>
            </form>
          </div>

          <div className="flex min-h-0 flex-col bg-[#050608]">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-[#1a1d24] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <LineChart className="h-3 w-3" />
              serial plotter
              <span className="ms-auto normal-case">last {MAX_SAMPLES} samples</span>
            </div>
            <div className="min-h-0 flex-1">
              <Plotter data={plot} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
