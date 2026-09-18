/**
 * Arduino Studio: standalone embedded C++ simulator.
 * Layout mirrors the Code Studio split panes: ribbon on top, sketch editor left, board canvas + serial monitor right.
 */
import { BookOpen, ChevronDown, Code, Cpu, Pause, Play, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import Editor from "react-simple-code-editor";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { ArduinoBoard } from "./ArduinoBoard";
import { ARDUINO_EXAMPLES, DEFAULT_SKETCH } from "./arduinoExamples";
import type { ArduinoSpeed } from "./arduinoRuntime";
import { SerialConsole } from "./SerialConsole";
import { useArduinoRuntime } from "./useArduinoRuntime";

// ---------------------------------------------------------------------------
// C++ / Arduino syntax highlighting
// ---------------------------------------------------------------------------
const KEYWORDS = new Set(["if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return", "const", "static", "volatile", "enum", "sizeof", "true", "false"]);
const TYPES = new Set(["void", "int", "long", "short", "char", "float", "double", "bool", "boolean", "byte", "word", "unsigned", "signed", "String", "size_t", "uint8_t", "int8_t", "uint16_t", "int16_t", "uint32_t", "int32_t"]);
const BUILTINS = new Set([
  "setup", "loop", "pinMode", "digitalWrite", "digitalRead", "analogWrite", "analogRead", "delay", "delayMicroseconds", "millis", "micros", "map", "constrain", "min", "max", "abs", "pow", "sqrt", "sin", "cos", "random", "randomSeed", "Serial", "F",
]);
const CONSTANTS = new Set(["HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "LED_BUILTIN", "A0", "A1", "A2", "A3", "A4", "A5", "PI", "TWO_PI", "HALF_PI", "DEC", "HEX", "OCT", "BIN"]);
const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(^[ \t]*#[^\n]*)|(\b\d[\w.]*)|([A-Za-z_]\w*)/gm;

function highlightCpp(source: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    const idx = m.index;
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (idx > last) out.push(source.slice(last, idx));
    const text = m[0];
    let cls = "";
    if (m[1]) cls = "text-slate-400 italic dark:text-slate-500";
    else if (m[2]) cls = "text-emerald-600 dark:text-emerald-400";
    else if (m[3]) cls = "text-fuchsia-600 dark:text-fuchsia-400";
    else if (m[4]) cls = "text-amber-600 dark:text-amber-300";
    else if (KEYWORDS.has(text)) cls = "text-violet-600 dark:text-violet-400 font-medium";
    else if (TYPES.has(text)) cls = "text-sky-600 dark:text-sky-400";
    else if (CONSTANTS.has(text)) cls = "text-orange-600 dark:text-orange-300";
    else if (BUILTINS.has(text)) cls = "text-blue-600 dark:text-blue-300";
    out.push(cls ? <span key={key++} className={cls}>{text}</span> : text);
    last = idx + text.length;
  }
  if (last < source.length) out.push(source.slice(last));
  return out;
}

function SketchEditor({ code, onChange, errorLine }: { code: string; onChange: (value: string) => void; errorLine: number | null }) {
  const lineCount = code.split("\n").length;
  return (
    <div className="relative min-h-0 flex-1 select-text overflow-auto bg-[#f8fbff] dark:bg-[#07080a]" dir="ltr">
      <div className="flex min-h-full min-w-max">
        <div className="sticky start-0 z-10 w-12 shrink-0 select-none border-e border-slate-200 bg-slate-100/95 py-2 font-mono text-[12px] leading-7 dark:border-[#1a1d24] dark:bg-[#090a0d]/95" aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={`h-7 pe-2 text-end tabular-nums ${errorLine === i + 1 ? "bg-rose-500/20 font-semibold text-rose-600 dark:text-rose-300" : "text-slate-400 dark:text-slate-500"}`}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {errorLine !== null && <div aria-hidden className="pointer-events-none absolute inset-x-0 h-7 bg-rose-500/10" style={{ top: 8 + (errorLine - 1) * 28 }} />}
          <Editor
            value={code}
            onValueChange={onChange}
            highlight={highlightCpp}
            padding={8}
            tabSize={2}
            style={{ minHeight: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, lineHeight: "1.75rem", whiteSpace: "pre", position: "relative", zIndex: 1 }}
            textareaClassName="!outline-none !caret-violet-500"
            textareaId="arduino-sketch"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ribbon
// ---------------------------------------------------------------------------
const SPEED_OPTIONS = [
  { label: "0.5x", value: "0.5" },
  { label: "1.0x", value: "1" },
  { label: "2.0x", value: "2" },
  { label: "Instant", value: "instant" },
] as const;

const pillButton =
  "h-9 inline-flex items-center justify-center gap-1.5 px-2.5 text-xs font-medium transition active:scale-[.98] whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-300 dark:hover:bg-[#13161c]";

const STATUS_STYLE = {
  idle: "bg-slate-400",
  running: "bg-emerald-500 animate-pulse",
  paused: "bg-amber-400",
  error: "bg-rose-500",
} as const;

export function ArduinoStudio() {
  const rt = useArduinoRuntime();
  const [code, setCode] = useState(DEFAULT_SKETCH);
  const [exampleId, setExampleId] = useState<string>("default");
  const [speed, setSpeedState] = useState<ArduinoSpeed>(1);
  const [serialCollapsed, setSerialCollapsed] = useState(false);
  const started = useRef(false);

  const { status } = rt.snapshot;
  const running = status === "running";
  const lines = useMemo(() => code.split("\n").length, [code]);

  const onRun = () => {
    if (running) rt.pause();
    else {
      started.current = true;
      rt.run(code);
    }
  };

  const onReset = () => {
    rt.reset();
    started.current = false;
  };

  const onExample = (id: string) => {
    const ex = ARDUINO_EXAMPLES.find(e => e.id === id);
    if (!ex) return;
    rt.reset();
    started.current = false;
    setExampleId(id);
    setCode(ex.source);
  };

  const onSpeed = (value: string) => {
    const next: ArduinoSpeed = value === "instant" ? "instant" : (Number(value) as 0.5 | 1 | 2);
    setSpeedState(next);
    rt.setSpeed(next);
  };

  const editSketch = (value: string) => {
    setCode(value);
    if (exampleId !== "custom") setExampleId("custom");
  };

  const errorMessage = rt.diagnostic ? `Line ${rt.diagnostic.line}: ${rt.diagnostic.message}` : rt.runtimeError ? `Runtime error: ${rt.runtimeError}` : null;

  return (
    <div className="arduino-studio flex h-[calc(100vh-10rem)] min-h-[620px] w-full select-none flex-col gap-2.5 overflow-hidden font-sans text-slate-800 dark:text-slate-200">
      {/* ------------------------------------------------------------------ */}
      {/* Header ribbon                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12]">
        <header className="scrollbar-none flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto p-1.5 text-xs">
          <div className="flex shrink-0 items-center gap-2 ps-2 pe-1">
            <Cpu className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <h1 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Arduino Studio</h1>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-violet-700 dark:text-violet-300">UNO R3 · Embedded C++</span>
          </div>

          <span className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200 dark:bg-[#1a1d24]" />

          <div
            className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-300/50 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1a1d24]"
            title="Example sketches"
          >
            <BookOpen className="pointer-events-none h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="pointer-events-none text-xs font-semibold text-slate-800 dark:text-slate-200">{ARDUINO_EXAMPLES.find(e => e.id === exampleId)?.label ?? "Example Sketches"}</span>
            <ChevronDown className="pointer-events-none h-3 w-3 text-slate-400" />
            <select aria-label="Example sketches" value={exampleId} onChange={e => onExample(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer text-xs opacity-0">
              {!ARDUINO_EXAMPLES.some(ex => ex.id === exampleId) && <option value={exampleId}>Example Sketches</option>}
              {ARDUINO_EXAMPLES.map(ex => (
                <option key={ex.id} value={ex.id} className="bg-white font-sans text-slate-800 dark:bg-[#13161c] dark:text-slate-200">
                  {ex.label}
                </option>
              ))}
            </select>
          </div>

          <span className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200 dark:bg-[#1a1d24]" />

          <button
            type="button"
            onClick={onRun}
            title={running ? "Pause execution" : status === "paused" ? "Resume execution" : "Compile and run sketch"}
            className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-xs font-semibold ${!running && started.current ? "brand-pill-active-rev" : "brand-pill-active"}`}
          >
            {running ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            <span>{running ? "Pause" : status === "paused" ? "Resume" : "Run"}</span>
          </button>
          <button type="button" onClick={onReset} title="Reset board and clear serial output" className={pillButton}>
            <RotateCcw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span>Reset</span>
          </button>

          <span className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200 dark:bg-[#1a1d24]" />

          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 p-0.5 ps-2.5 dark:border-[#1a1d24] dark:bg-[#13161c]">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Speed</span>
            <SegmentedControl<string> options={[...SPEED_OPTIONS]} value={String(speed)} onChange={onSpeed} size="sm" className="border-0 bg-transparent p-0" aria-label="Execution speed" />
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-2 pe-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[status]}`} />
            <span className="uppercase">{status === "paused" && !started.current ? "ready" : status}</span>
            <span className="tabular-nums">t = {(rt.snapshot.timeMs / 1000).toFixed(2)} s</span>
          </div>
        </header>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-hidden lg:grid-cols-2">
        {/* -------------------------------------------------------------- */}
        {/* Left: sketch editor                                             */}
        {/* -------------------------------------------------------------- */}
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12]">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#1a1d24] dark:bg-[#0d0f12]">
            <div className="flex items-center gap-1.5">
              <div className="me-2 flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-[#E0443E]/40 bg-[#FF5F56]" />
                <span className="h-2.5 w-2.5 rounded-full border border-[#DEA123]/40 bg-[#FFBD2E]" />
                <span className="h-2.5 w-2.5 rounded-full border border-[#1AAB29]/40 bg-[#27C93F]" />
              </div>
              <Code className="ms-0.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">sketch.ino</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">{lines} lines</span>
          </div>
          <SketchEditor code={code} onChange={editSketch} errorLine={rt.diagnostic?.line ?? null} />
          <div className={`flex min-h-9 shrink-0 items-start gap-2 border-t px-3 py-2 font-mono text-[11.5px] ${errorMessage ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200" : "border-slate-200 bg-slate-50 text-slate-500 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-500"}`} role="status">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${errorMessage ? "bg-rose-500" : "bg-emerald-500"}`} />
            <span className="select-text break-words whitespace-pre-wrap">{errorMessage ?? "Ready — sketch compiles to a non-blocking simulation loop."}</span>
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Right: hardware canvas (top) + serial monitor (bottom)          */}
        {/* -------------------------------------------------------------- */}
        <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden">
          <section className="flex min-h-[180px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12]">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#1a1d24] dark:bg-[#0d0f12]">
              <div className="flex items-center gap-1.5">
                <div className="me-2 flex shrink-0 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-[#E0443E]/40 bg-[#FF5F56]" />
                  <span className="h-2.5 w-2.5 rounded-full border border-[#DEA123]/40 bg-[#FFBD2E]" />
                  <span className="h-2.5 w-2.5 rounded-full border border-[#1AAB29]/40 bg-[#27C93F]" />
                </div>
                <Cpu className="ms-0.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span className="font-mono text-xs font-semibold tracking-wider text-slate-700 dark:text-slate-300">board.uno</span>
              </div>
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">ATmega328P · 16 MHz · 5 V</span>
            </div>
            <div
              className="min-h-0 flex-1 bg-slate-50 dark:bg-[#07080a]"
              style={{ backgroundImage: "radial-gradient(circle, rgba(148,163,184,.25) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
            >
              <ArduinoBoard snapshot={rt.snapshot} onDigitalInput={rt.setDigitalInput} onAnalogInput={rt.setAnalogInput} />
            </div>
          </section>

          <SerialConsole
            serial={rt.serial}
            baud={rt.snapshot.baud}
            collapsed={serialCollapsed}
            onToggleCollapsed={() => setSerialCollapsed(c => !c)}
            onSend={rt.sendSerial}
            onClear={rt.clearSerial}
          />
        </div>
      </div>
    </div>
  );
}

