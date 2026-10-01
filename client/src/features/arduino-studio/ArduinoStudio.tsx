/**
 * Arduino Studio: standalone embedded C++ simulator.
 * Layout mirrors the Code Studio split panes: ribbon on top, sketch editor left, board canvas + serial monitor right.
 */
import { BookOpen, Check, ChevronDown, Clipboard, Code, Copy, Cpu, Download, Pause, Play, Redo2, RotateCcw, Trash2, Undo2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cpp } from "@codemirror/lang-cpp";
import { CodeEditor, type LineSeverity } from "@/components/code-editor/CodeEditor";
import { SegmentedControl } from "@/components/common/templates";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ArduinoBoard } from "./ArduinoBoard";
import type { PinUsage } from "@shared/code/arduinoTypes";
import { analyzeSketchRemote } from "@/services/codeClient";
import { useRemoteQuery } from "@/lib/useRemoteQuery";
import { ARDUINO_EXAMPLES, DEFAULT_SKETCH } from "./arduinoExamples";
import type { ArduinoSpeed } from "./arduinoRuntime";
import { SerialConsole } from "./SerialConsole";
import { useArduinoRuntime } from "./useArduinoRuntime";

const CPP_LANGUAGE = cpp();

function SketchEditor({
  code,
  onChange,
  errorLine,
  activeLine,
  onActiveLine,
}: {
  code: string;
  onChange: (value: string) => void;
  errorLine: number | null;
  activeLine: number;
  onActiveLine: (line: number) => void;
}) {
  const { t } = useTranslation("simulators");
  const lineSeverity = useMemo(
    () => (errorLine === null ? undefined : new Map<number, LineSeverity>([[errorLine, "error"]])),
    [errorLine]
  );
  return (
    <CodeEditor
      value={code}
      onChange={onChange}
      language={CPP_LANGUAGE}
      activeLine={activeLine}
      onCursorLine={onActiveLine}
      lineSeverity={lineSeverity}
      ariaLabel={t("arduino.sketchAria", "Arduino sketch")}
    />
  );
}

// ---------------------------------------------------------------------------
// Ribbon
// ---------------------------------------------------------------------------
function useSpeedOptions() {
  const { t } = useTranslation("simulators");
  return [
    { label: "0.5x", value: "0.5" },
    { label: "1.0x", value: "1" },
    { label: "2.0x", value: "2" },
    { label: t("toolbar.instant", "Instant"), value: "instant" },
  ] as const;
}

const pillButton =
  "h-9 inline-flex items-center justify-center gap-1.5 px-2.5 text-xs font-medium transition active:scale-[.98] whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-300 dark:hover:bg-[#13161c]";

const STATUS_STYLE = {
  idle: "bg-slate-400",
  running: "bg-emerald-500 animate-pulse",
  paused: "bg-amber-400",
  error: "bg-rose-500",
} as const;

export function ArduinoStudio() {
  const { t } = useTranslation("simulators");
  const SPEED_OPTIONS = useSpeedOptions();
  const rt = useArduinoRuntime();
  const [code, setCode] = useState(DEFAULT_SKETCH);
  const [exampleId, setExampleId] = useState<string>("default");
  const [speed, setSpeedState] = useState<ArduinoSpeed>(1);
  const [serialCollapsed, setSerialCollapsed] = useState(false);
  const started = useRef(false);
  const lastLayout = useRef<PinUsage | undefined>(undefined);
  // The static pin layout comes from the serverless compiler (debounced while typing); the last layout that parsed stays on the board.
  const layoutQuery = useRemoteQuery(code, (signal) => analyzeSketchRemote(code, signal), { debounceMs: 350 });
  const layout = useMemo(() => {
    const parsed = layoutQuery.data ?? null;
    if (parsed) lastLayout.current = parsed;
    return parsed ?? lastLayout.current;
  }, [layoutQuery.data]);
  const [activeLine, setActiveLine] = useState(1);
  const [history, setHistory] = useState<string[]>([DEFAULT_SKETCH]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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

  const commit = (value: string) => {
    setCode(value);
    setHistory(prev => [...prev.slice(0, historyIndex + 1), value]);
    setHistoryIndex(prev => prev + 1);
  };

  const onExample = (id: string) => {
    const ex = ARDUINO_EXAMPLES.find(e => e.id === id);
    if (!ex) return;
    rt.reset();
    started.current = false;
    setExampleId(id);
    commit(ex.source);
  };

  const onSpeed = (value: string) => {
    const next: ArduinoSpeed = value === "instant" ? "instant" : (Number(value) as 0.5 | 1 | 2);
    setSpeedState(next);
    rt.setSpeed(next);
  };

  const editSketch = (value: string) => {
    commit(value);
    if (exampleId !== "custom") setExampleId("custom");
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCode(history[historyIndex - 1]);
    }
  };
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCode(history[historyIndex + 1]);
    }
  };
  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    toast.success(t("assembler.toastCopied", "Copied code to clipboard"));
  };
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editSketch(text);
        toast.success(t("assembler.toastPasted", "Pasted from clipboard"));
      }
    } catch {
      toast.error(t("assembler.toastPasteError", "Clipboard permission required to paste"));
    }
  };
  const handleDelete = () => {
    editSketch("");
    toast.info(t("assembler.toastDeleted", "Deleted code"));
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        editSketch(reader.result);
        toast.success(t("assembler.toastImported", "Imported {{filename}}", { filename: file.name }));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  const handleExport = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sketch.ino";
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorMessage = rt.diagnostic
    ? t("arduino.lineError", "Line {{line}}: {{message}}", { line: rt.diagnostic.line, message: rt.diagnostic.message })
    : rt.runtimeError
      ? t("arduino.runtimeError", "Runtime error: {{error}}", { error: rt.runtimeError })
      : null;

  return (
    <div className="arduino-studio flex h-[calc(100vh-15rem)] min-h-[600px] w-full select-none flex-col gap-2.5 overflow-hidden font-sans text-slate-800 dark:text-slate-200">
      {/* ------------------------------------------------------------------ */}
      {/* Header ribbon                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12]">
        <header className="scrollbar-none flex w-full flex-nowrap items-center justify-between gap-1.5 overflow-x-auto p-1.5 text-xs">
          <div className="flex shrink-0 items-center gap-1">
            <div
              className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-300/50 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1a1d24]"
              title={t("assembler.activeExample", "Active: {{template}} (Click to switch example)", {
                template: ARDUINO_EXAMPLES.find(e => e.id === exampleId)?.label ?? t("arduino.customSketch", "Custom sketch"),
              })}
            >
              <BookOpen className="pointer-events-none h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
              <span className="pointer-events-none text-xs font-semibold text-slate-800 dark:text-slate-200">{t("toolbar.examples", "Examples")}</span>
              <ChevronDown className="pointer-events-none h-3 w-3 text-slate-400" />
              <select aria-label={t("toolbar.browseLibrary", "Browse the Interactive Examples Library")} value={exampleId} onChange={e => onExample(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer text-xs opacity-0">
                {!ARDUINO_EXAMPLES.some(ex => ex.id === exampleId) && <option value={exampleId}>{t("arduino.customSketch", "Custom sketch")}</option>}
                {ARDUINO_EXAMPLES.map(ex => (
                  <option key={ex.id} value={ex.id} className="bg-white font-sans text-slate-800 dark:bg-[#13161c] dark:text-slate-200">
                    {ex.label}
                  </option>
                ))}
              </select>
            </div>

            <span className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200 dark:bg-[#1a1d24]" />

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onRun}
                title={
                  running
                    ? t("toolbar.pauseTooltip", "Pause execution")
                    : status === "paused"
                      ? t("arduino.resumeTooltip", "Resume execution")
                      : t("arduino.runTooltip", "Run execution")
                }
                className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-xs font-semibold ${!running && started.current ? "brand-pill-active-rev" : "btn-active-brand"}`}
              >
                {running ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                <span>{running ? t("toolbar.pause", "Pause") : status === "paused" ? t("arduino.resume", "Resume") : t("toolbar.run", "Run")}</span>
              </button>
              <button type="button" onClick={onReset} title={t("arduino.resetTooltip", "Reset execution state")} className={`${pillButton} w-9 px-0`}>
                <RotateCcw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <span className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200 dark:bg-[#1a1d24]" />

            <div className="flex shrink-0 items-center gap-1">
              <button type="button" title={t("toolbar.undo", "Undo (Ctrl/Cmd+Z)")} onClick={handleUndo} disabled={historyIndex <= 0} className={`${pillButton} w-9 px-0`}>
                <Undo2 size={13} />
              </button>
              <button type="button" title={t("toolbar.redo", "Redo (Ctrl/Cmd+Shift+Z)")} onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={`${pillButton} w-9 px-0`}>
                <Redo2 size={13} />
              </button>
              <button type="button" title={copied ? t("assembler.copied", "Copied!") : t("toolbar.copy", "Copy (Ctrl/Cmd+C)")} onClick={handleCopy} className={`${pillButton} w-9 px-0`}>
                {copied ? <Check size={13} className="text-violet-600 dark:text-violet-400" /> : <Copy size={13} />}
              </button>
              <button type="button" title={t("toolbar.paste", "Paste (Ctrl/Cmd+V)")} onClick={handlePaste} className={`${pillButton} w-9 px-0`}>
                <Clipboard size={13} />
              </button>
              <button type="button" title={t("toolbar.delete", "Delete (Del/Backspace)")} onClick={handleDelete} className={`${pillButton} w-9 px-0`}>
                <Trash2 size={13} />
              </button>

              <span className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200 dark:bg-[#1a1d24]" />

              <button type="button" title={t("arduino.importTooltip", "Import file (.ino, .cpp, .c)")} onClick={() => fileInputRef.current?.click()} className={`${pillButton} w-9 px-0`}>
                <Upload size={13} />
              </button>
              <input ref={fileInputRef} type="file" accept=".ino,.cpp,.cc,.c,.h,.txt" onChange={handleImport} className="hidden" />
              <button type="button" title={t("arduino.exportTooltip", "Export / Download file (.ino)")} onClick={handleExport} className={`${pillButton} w-9 px-0`}>
                <Download size={13} />
              </button>
            </div>
          </div>

          <div className="ms-2 flex shrink-0 items-center gap-1.5">
            <SegmentedControl<string>
              options={[...SPEED_OPTIONS]}
              value={String(speed)}
              onChange={onSpeed}
              size="sm"
              aria-label={t("assembler.executionSpeedAria", "Execution speed")}
              className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
            />
          </div>
        </header>
      </section>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup direction={isDesktop ? "horizontal" : "vertical"} className="gap-2.5">
          {/* -------------------------------------------------------------- */}
          {/* Left: Code Editor (sketch.ino) takes full vertical height      */}
          {/* -------------------------------------------------------------- */}
          <ResizablePanel defaultSize={50} minSize={30} className="flex h-full min-h-0 flex-col overflow-hidden">
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
                <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">{t("assembler.linesCount", "{{count}} lines", { count: lines })}</span>
              </div>
              <SketchEditor code={code} onChange={editSketch} errorLine={rt.diagnostic?.line ?? null} activeLine={activeLine} onActiveLine={setActiveLine} />
              {errorMessage && (
                <div className="flex shrink-0 items-start gap-2 border-t border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11.5px] text-rose-700 dark:text-rose-200" role="alert">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                  <span className="select-text break-words whitespace-pre-wrap">{errorMessage}</span>
                </div>
              )}
            </section>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-transparent hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors" />

          {/* -------------------------------------------------------------- */}
          {/* Right: Nested vertical group (Board Top + Serial Monitor Bottom) */}
          {/* -------------------------------------------------------------- */}
          <ResizablePanel defaultSize={50} minSize={30} className="flex h-full min-h-0 flex-col overflow-hidden">
            <ResizablePanelGroup direction="vertical" className="h-full w-full gap-2.5">
              {/* Top: Hardware canvas (board.uno) */}
              <ResizablePanel defaultSize={70} minSize={30} className="flex h-full min-h-0 flex-col overflow-hidden">
                <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12]">
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
                  </div>
                  <div
                    className="relative min-h-0 flex-1 overflow-hidden bg-slate-50 dark:bg-[#07080a]"
                    style={{ backgroundImage: "radial-gradient(circle, rgba(148,163,184,.25) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
                  >
                    <ArduinoBoard snapshot={rt.snapshot} onDigitalInput={rt.setDigitalInput} onAnalogInput={rt.setAnalogInput} layout={layout} ledColors={ARDUINO_EXAMPLES.find(e => e.id === exampleId)?.ledColors} />
                  </div>
                </section>
              </ResizablePanel>

              <ResizableHandle withHandle className="bg-transparent hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors" />

              {/* Bottom: Serial Monitor (terminal + real-time plotter) */}
              <ResizablePanel defaultSize={30} minSize={25} className="flex h-full min-h-0 flex-col overflow-hidden">
                <SerialConsole
                  serial={rt.serial}
                  baud={rt.snapshot.baud}
                  collapsed={serialCollapsed}
                  onToggleCollapsed={() => setSerialCollapsed(c => !c)}
                  onSend={rt.sendSerial}
                  onClear={rt.clearSerial}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

