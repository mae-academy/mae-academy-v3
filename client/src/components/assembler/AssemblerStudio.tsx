/**
 * MAE Assembler Studio: 4-Quadrant IDE Viewport Split
 *
 * Visual design system alignment:
 * - Single-line consolidated Circuit Studio toolbar ribbon
 * - macOS window traffic lights (#FF5F56, #FFBD2E, #27C93F) on Editor & Terminal headers
 * - Deep black terminal viewport inside subtle window frame
 * - Uniform pill-rounded tabs in State Inspector
 * - Clean bottom diagnostics bar in Editor (no floating error/breakpoint pills)
 * - High-contrast, legible subregister labels (AH, AL, BH, BL, etc.)
 */
import {
  Activity,
  BookOpen,
  Clock,
  Code,
  CornerDownLeft,
  Cpu,
  Database,
  Layers,
  ListOrdered,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cpp } from "@codemirror/lang-cpp";
import { python } from "@codemirror/lang-python";
import type { Extension } from "@codemirror/state";
import { CodeEditor } from "@/components/code-editor/CodeEditor";
import { masmLanguage } from "@/components/code-editor/languages";
import { prewarmRemote } from "@/features/code-studio/executionCache";
import { TerminalSurface } from "@/features/code-studio/components/Terminal";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SegmentedControl } from "@/components/common/templates";
import {
  AssemblerToolbar,
  type AssemblerLanguageOption,
  type AssemblerTemplateGroup,
  type ExecutionSpeed,
} from "@/components/assembler/AssemblerToolbar";
import type { RegisterSnapshot } from "@/components/assembler/AssemblerRegisters";
import type { AssemblerFlag } from "@/components/assembler/AssemblerFlags";
import { AssemblerVariables } from "@/components/assembler/AssemblerVariables";
import {
  masmEngine,
  useExecutionEngine,
  type SupportedLanguage,
  type TraceStep,
} from "@/features/execution-engine";

export const CODE_STUDIO_SEO: Record<SupportedLanguage, { title: string; description: string }> = {
  masm8086: {
    title: "Online 8086 Assembler & Register Emulator | Code Studio",
    description: "Step through Intel 8086 assembly instructions with live CPU registers, flags, stack, and memory visualization.",
  },
  cpp: {
    title: "Online C++ Compiler & STL Visualizer | Code Studio",
    description: "Run C++ online with step-by-step trace inspection, vectors, stacks, queues, and standard algorithms.",
  },
  python: {
    title: "Online Python Code Visualizer & Trace Studio | Code Studio",
    description: "Interactive Python execution with live call stack, scope inspection, and variables visualizer.",
  },
  c: {
    title: "Online C Compiler & Memory Visualizer | Code Studio",
    description: "Execute standard C programs with line-by-line tracing, memory views, and terminal I/O.",
  },
};

export function updatePageSeo(language: SupportedLanguage) {
  const meta = CODE_STUDIO_SEO[language];
  if (!meta) return;
  document.title = meta.title;

  let descMeta = document.querySelector('meta[name="description"]');
  if (!descMeta) {
    descMeta = document.createElement("meta");
    descMeta.setAttribute("name", "description");
    document.head.appendChild(descMeta);
  }
  descMeta.setAttribute("content", meta.description);

  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", meta.title);
  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", meta.description);
}

function formatDiagnostic(raw: string): string {
  if (!raw) return "";
  const lines = raw
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("at ") && !l.includes("Traceback (most recent call last):"));
  return lines.join("\n");
}

type MemoryMode = "hex" | "decimal" | "ascii";

const BASE_PLAY_INTERVAL_MS = 160;

// ---------------------------------------------------------------------------
// macOS Window Controls (Traffic Lights)
// ---------------------------------------------------------------------------
function MacWindowDots() {
  return (
    <div className="flex items-center gap-1.5 shrink-0 me-2">
      <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E]/40" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]/40" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]/40" />
    </div>
  );
}

import {
  MASM_TEMPLATE_GROUPS,
  MASM_EXAMPLE_SOURCES,
  DEFAULT_MASM_TEMPLATE,
} from "@/components/assembler/masmExamples";
import {
  PYTHON_TEMPLATE_GROUPS,
  PYTHON_EXAMPLE_SOURCES,
  DEFAULT_PYTHON_TEMPLATE,
} from "@/features/code-studio/pythonExamples";
import {
  CPP_TEMPLATE_GROUPS,
  CPP_EXAMPLE_SOURCES,
  DEFAULT_CPP_TEMPLATE,
} from "@/features/code-studio/cppExamples";
import {
  C_TEMPLATE_GROUPS,
  C_EXAMPLE_SOURCES,
  DEFAULT_C_TEMPLATE,
} from "@/features/code-studio/cExamples";

// ---------------------------------------------------------------------------
// Language definitions & starter code
// ---------------------------------------------------------------------------
interface LanguageDefinition {
  label: string;
  filename: string;
  groups: AssemblerTemplateGroup[];
  sources: Record<string, string>;
  defaultTemplate: string;
}

const MASM_GROUPS: AssemblerTemplateGroup[] = MASM_TEMPLATE_GROUPS;
const MASM_SOURCES: Record<string, string> = MASM_EXAMPLE_SOURCES;

const PYTHON_GROUPS: AssemblerTemplateGroup[] = PYTHON_TEMPLATE_GROUPS;
const PYTHON_SOURCES: Record<string, string> = PYTHON_EXAMPLE_SOURCES;

const CPP_GROUPS: AssemblerTemplateGroup[] = CPP_TEMPLATE_GROUPS;
const CPP_SOURCES: Record<string, string> = CPP_EXAMPLE_SOURCES;

const C_GROUPS: AssemblerTemplateGroup[] = C_TEMPLATE_GROUPS;
const C_SOURCES: Record<string, string> = C_EXAMPLE_SOURCES;

const LANGUAGE_DEFINITIONS: Record<SupportedLanguage, LanguageDefinition> = {
  masm8086: {
    label: "MASM 8086",
    filename: "program.asm",
    groups: MASM_GROUPS,
    sources: MASM_SOURCES,
    defaultTemplate: DEFAULT_MASM_TEMPLATE,
  },
  python: {
    label: "Python",
    filename: "script.py",
    groups: PYTHON_GROUPS,
    sources: PYTHON_SOURCES,
    defaultTemplate: DEFAULT_PYTHON_TEMPLATE,
  },
  cpp: {
    label: "C++",
    filename: "main.cpp",
    groups: CPP_GROUPS,
    sources: CPP_SOURCES,
    defaultTemplate: DEFAULT_CPP_TEMPLATE,
  },
  c: {
    label: "C",
    filename: "main.c",
    groups: C_GROUPS,
    sources: C_SOURCES,
    defaultTemplate: DEFAULT_C_TEMPLATE,
  },
};

const LANGUAGE_OPTIONS: AssemblerLanguageOption[] = (
  Object.keys(LANGUAGE_DEFINITIONS) as SupportedLanguage[]
).map(value => ({ value, label: LANGUAGE_DEFINITIONS[value].label }));

const EMPTY_REGISTERS: RegisterSnapshot = {
  AX: "0000",
  BX: "0000",
  CX: "0000",
  DX: "0000",
  SI: "0000",
  DI: "0000",
  BP: "0000",
  SP: "0000",
  IP: "0000",
  CS: "0000",
  DS: "0000",
  ES: "0000",
  SS: "0000",
};

const EMPTY_FLAGS: Record<AssemblerFlag, boolean> = {
  ZF: false,
  SF: false,
  CF: false,
  OF: false,
  PF: false,
  AF: false,
  IF: false,
  DF: false,
};

const FLAG_NAMES: AssemblerFlag[] = [
  "ZF",
  "SF",
  "CF",
  "OF",
  "PF",
  "AF",
  "IF",
  "DF",
];

function toRegisterSnapshot(
  registers: Record<string, string> | undefined
): RegisterSnapshot {
  return {
    AX: registers?.AX ?? EMPTY_REGISTERS.AX,
    BX: registers?.BX ?? EMPTY_REGISTERS.BX,
    CX: registers?.CX ?? EMPTY_REGISTERS.CX,
    DX: registers?.DX ?? EMPTY_REGISTERS.DX,
    SI: registers?.SI ?? EMPTY_REGISTERS.SI,
    DI: registers?.DI ?? EMPTY_REGISTERS.DI,
    BP: registers?.BP ?? EMPTY_REGISTERS.BP,
    SP: registers?.SP ?? EMPTY_REGISTERS.SP,
    IP: registers?.IP ?? EMPTY_REGISTERS.IP,
    CS: registers?.CS ?? EMPTY_REGISTERS.CS,
    DS: registers?.DS ?? EMPTY_REGISTERS.DS,
    ES: registers?.ES ?? EMPTY_REGISTERS.ES,
    SS: registers?.SS ?? EMPTY_REGISTERS.SS,
  };
}

function formatRegisterValue(
  hexStr: string,
  format: "hex" | "decimal" | "binary",
  bits: 8 | 16 = 16
): string {
  const num = parseInt(hexStr || "0", 16) || 0;
  if (format === "decimal") {
    return num.toString(10);
  }
  if (format === "binary") {
    return num.toString(2).padStart(bits, "0");
  }
  return bits === 16
    ? hexStr.toUpperCase().padStart(4, "0") + "h"
    : hexStr.toUpperCase().padStart(2, "0") + "h";
}

function toFlagRecord(
  flags: Record<string, number> | undefined
): Record<AssemblerFlag, boolean> {
  if (!flags) return EMPTY_FLAGS;
  return Object.fromEntries(
    FLAG_NAMES.map(flag => [flag, Boolean(flags[flag])])
  ) as Record<AssemblerFlag, boolean>;
}

const formatAddress = (value: number) =>
  `${Math.max(0, Math.min(0xfffff, value)).toString(16).toUpperCase().padStart(4, "0")}h`;

const parseAddress = (raw: string, fallback: number) => {
  const clean = raw
    .trim()
    .replace(/^0x/i, "")
    .replace(/h$/i, "")
    .replace(/[^0-9a-f]/gi, "");
  const value = Number.parseInt(clean, 16);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(0xfffff, value))
    : fallback;
};

const outputValue = (value: number, mode: MemoryMode) =>
  mode === "decimal"
    ? value.toString().padStart(3, "0")
    : mode === "ascii"
      ? value >= 32 && value <= 126
        ? String.fromCharCode(value)
        : "·"
      : `${value.toString(16).toUpperCase().padStart(2, "0")}h`;

const stringifyVariable = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const LANGUAGE_EXTENSIONS: Record<SupportedLanguage, Extension> = {
  masm8086: masmLanguage,
  python: python(),
  cpp: cpp(),
  c: cpp(),
};

// ---------------------------------------------------------------------------
// Source Editor Component (Area 1)
// ---------------------------------------------------------------------------
function SourceEditor({
  code,
  onChange,
  language,
  activeLine,
  onActiveLine,
  breakpoints,
  onToggleBreakpoint,
}: {
  code: string;
  onChange: (source: string) => void;
  language: SupportedLanguage;
  activeLine: number;
  onActiveLine: (line: number) => void;
  breakpoints: number[];
  onToggleBreakpoint: (line: number) => void;
}) {
  return (
    <CodeEditor
      value={code}
      onChange={onChange}
      language={LANGUAGE_EXTENSIONS[language]}
      activeLine={activeLine}
      onCursorLine={onActiveLine}
      breakpoints={breakpoints}
      onToggleBreakpoint={onToggleBreakpoint}
      ariaLabel="Source code editor"
    />
  );
}

const CPP_REFERENCE: [string, string][] = [
  ["%d / %i", "signed int"],
  ["%f", "float / double"],
  ["%s", "C string (char *)"],
  ["%c", "single char"],
  ["%p", "pointer address"],
  ["*p", "dereference pointer"],
  ["&x", "address of x"],
  ["<stdio.h>", "printf, scanf"],
  ["<stdlib.h>", "malloc, free, atoi"],
  ["<string.h>", "strlen, strcpy, strcmp"],
];

const QUICK_REFERENCE: Partial<Record<SupportedLanguage, [string, string][]>> = {
  python: [
    ["len(x)", "length of a sequence"],
    [".append(v)", "add item to end of list"],
    [".pop(i)", "remove & return item (last by default)"],
    ["x[::-1]", "reversed slice"],
    ["x[a:b:s]", "slice start:stop:step"],
    ["int() float() str()", "type conversions"],
    ["list() tuple() set()", "collection conversions"],
    ["range(n)", "0..n-1 iterator"],
  ],
  c: CPP_REFERENCE,
  cpp: [...CPP_REFERENCE, ["<iostream>", "std::cout, std::cin"], ["<vector>", "std::vector<T>"]],
};

// ---------------------------------------------------------------------------
// Main Studio Component (4-Quadrant IDE Viewport Split)
// ---------------------------------------------------------------------------
export function AssemblerStudio() {
  const {
    isRunning: engineBusy,
    result,
    runCode,
    reset: resetEngine,
  } = useExecutionEngine();

  const [location, setLocation] = useLocation();

  const getRouteLanguage = (): SupportedLanguage | null => {
    const match = location.match(/^\/(?:simulations\/code|code)\/(masm8086|python|cpp|c)(?:\/.*)?$/i);
    if (match) return match[1].toLowerCase() as SupportedLanguage;
    return null;
  };

  const initialLang: SupportedLanguage = getRouteLanguage() ?? "masm8086";
  const [language, setLanguage] = useState<SupportedLanguage>(initialLang);
  const initialDef = LANGUAGE_DEFINITIONS[initialLang];
  const [template, setTemplate] = useState(initialDef.defaultTemplate);
  const initialCode = initialDef.sources[initialDef.defaultTemplate] ?? MASM_EXAMPLE_SOURCES[DEFAULT_MASM_TEMPLATE];
  const [code, setCode] = useState(initialCode);
  const [codeHistory, setCodeHistory] = useState<string[]>([initialCode]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Synchronize document title and search engine meta descriptions reactively
  useEffect(() => {
    updatePageSeo(language);
  }, [language]);

  // Synchronize with external route changes (e.g. browser back/forward)
  useEffect(() => {
    const routeLang = getRouteLanguage();
    if (routeLang && routeLang !== language) {
      applyLanguage(routeLang, false);
    }
  }, [location]);

  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [activeLine, setActiveLine] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<ExecutionSpeed>(1.0);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [mode, setMode] = useState<MemoryMode>("hex");
  const [memoryReference, setMemoryReference] = useState("01E5h");
  const [stackReference, setStackReference] = useState("2FFFEh");
  const [stdinInput, setStdinInput] = useState("");
  const [stdinQueue, setStdinQueue] = useState("");
  const [engineReady, setEngineReady] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("state");
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const compiledKeyRef = useRef<string | null>(null);
  const pendingActionRef = useRef<"run" | "step" | "instant" | "resume" | null>(null);
  /** Cumulative stdin fed to the last run; a resume replays it plus the new keystrokes. */
  const consumedStdinRef = useRef("");
  const resumeFromStepRef = useRef(0);
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  const computeKey = () => `${language}::${code}`;

  const currentStep: TraceStep | null =
    result && currentStepIndex >= 0
      ? (result.steps[currentStepIndex] ?? null)
      : null;
  const previousStep: TraceStep | null =
    result && currentStepIndex > 0
      ? (result.steps[currentStepIndex - 1] ?? null)
      : null;

  const cumulativeStdout = useMemo(() => {
    if (!result?.steps || currentStepIndex < 0) return "";
    let out = "";
    for (let i = 0; i <= currentStepIndex; i++) {
      out += result.steps[i].stdout || "";
    }
    return out;
  }, [result, currentStepIndex]);

  const combinedError = engineError ?? result?.error ?? null;
  const isMasm = language === "masm8086";
  const totalSteps = result?.steps.length ?? 0;

  // Wall-clock duration of the last run, measured on busy -> idle transitions.
  const runStartRef = useRef<number | null>(null);
  const [runTimeMs, setRunTimeMs] = useState<number | null>(null);
  useEffect(() => {
    if (engineBusy) {
      runStartRef.current = performance.now();
    } else if (runStartRef.current !== null) {
      setRunTimeMs(Math.round(performance.now() - runStartRef.current));
      runStartRef.current = null;
    }
  }, [engineBusy]);

  // Inspector tabs depend on the active language; low-level tabs are MASM-only.
  const inspectorTabs: { label: string; value: string; icon: ReactNode }[] = isMasm
    ? [
      { label: "Registers & Flags", value: "state", icon: <Cpu className="h-4 w-4" /> },
      { label: "Execution Trace", value: "trace", icon: <ListOrdered className="h-4 w-4" /> },
      { label: "Stack", value: "stack", icon: <Layers className="h-4 w-4" /> },
      { label: "Main Memory", value: "memory", icon: <Database className="h-4 w-4" /> },
    ]
    : [
      { label: "Variables View", value: "state", icon: <Cpu className="h-4 w-4" /> },
      { label: "Execution Trace", value: "trace", icon: <ListOrdered className="h-4 w-4" /> },
      { label: "Telemetry & Insights", value: "telemetry", icon: <Activity className="h-4 w-4" /> },
      { label: "Quick Reference", value: "reference", icon: <BookOpen className="h-4 w-4" /> },
    ];
  // Reset to the first tab if the active one is not offered for this language.
  useEffect(() => {
    if (!inspectorTabs.some(t => t.value === activeTab)) setActiveTab("state");
  }, [inspectorTabs, activeTab]);

  // Code change handler with undo/redo history tracking
  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setCodeHistory(prev => {
      const updated = prev.slice(0, historyIndex + 1);
      return [...updated, newCode];
    });
    setHistoryIndex(prev => prev + 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevCode = codeHistory[historyIndex - 1];
      setHistoryIndex(prev => prev - 1);
      setCode(prevCode);
    }
  };

  const handleRedo = () => {
    if (historyIndex < codeHistory.length - 1) {
      const nextCode = codeHistory[historyIndex + 1];
      setHistoryIndex(prev => prev + 1);
      setCode(nextCode);
    }
  };

  const handleCut = () => {
    navigator.clipboard.writeText(code);
    handleCodeChange("");
    toast.success("Cut code to clipboard");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    toast.success("Copied code to clipboard");
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleCodeChange(text);
        toast.success("Pasted from clipboard");
      }
    } catch {
      toast.error("Clipboard permission required to paste");
    }
  };

  const handleDelete = () => {
    handleCodeChange("");
    toast.info("Deleted code");
  };

  // Preload/Init MASM or mark high-level ready
  useEffect(() => {
    let active = true;
    setEngineError(null);
    if (language !== "masm8086") {
      setEngineReady(true);
      return;
    }
    setEngineReady(false);
    masmEngine
      .preload()
      .then(() => {
        if (!active) return;
        setEngineReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to initialize MASM engine";
        setEngineError(message);
      });
    return () => {
      active = false;
    };
  }, [language]);

  // Seed scrubber on new result
  useEffect(() => {
    if (!result) return;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (!result.steps.length) {
      setCurrentStepIndex(-1);
      return;
    }
    if (action === "instant" || speed === "instant") {
      setCurrentStepIndex(result.steps.length - 1);
      setIsPlaying(false);
    } else if (action === "resume") {
      // Continue right after the last step of the blocked run instead of restarting playback.
      setCurrentStepIndex(Math.min(resumeFromStepRef.current, result.steps.length - 1));
      setIsPlaying(true);
    } else if (action === "run") {
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      setCurrentStepIndex(0);
    }
  }, [result, speed]);

  // Track active line in gutter
  useEffect(() => {
    if (currentStep) {
      setActiveLine(currentStep.line || 1);
    }
  }, [currentStep]);

  // Auto-scroll terminal on new output
  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop =
        terminalScrollRef.current.scrollHeight;
    }
  }, [currentStep?.stdout, stdinQueue]);

  // Auto-step animation loop with variable speed
  useEffect(() => {
    if (!isPlaying || !result || speed === "instant") return;
    const multiplier = typeof speed === "number" ? speed : 1.0;
    const stepInterval = Math.max(25, BASE_PLAY_INTERVAL_MS / multiplier);

    let animationFrameId: number;
    let lastTime = performance.now();
    let accumulator = 0;

    const playbackTick = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      accumulator += delta;

      if (accumulator >= stepInterval) {
        const ticks = Math.floor(accumulator / stepInterval);
        accumulator -= ticks * stepInterval;

        setCurrentStepIndex(index => {
          let next = index;
          let hitBreakpoint = false;
          let finished = false;

          for (let i = 0; i < ticks; i++) {
            next++;
            if (next >= result.steps.length) {
              finished = true;
              next = result.steps.length - 1;
              break;
            }
            if (breakpoints.includes(result.steps[next].line)) {
              hitBreakpoint = true;
              break;
            }
          }

          if (finished || hitBreakpoint) {
            setIsPlaying(false);
            if (hitBreakpoint) {
              toast.info(`Paused at breakpoint on line ${result.steps[next].line}`);
            }
          }
          return next;
        });
      }

      animationFrameId = requestAnimationFrame(playbackTick);
    };

    animationFrameId = requestAnimationFrame(playbackTick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, result, breakpoints, speed]);

  const toggleBreakpoint = (line: number) =>
    setBreakpoints(items =>
      items.includes(line)
        ? items.filter(item => item !== line)
        : [...items, line]
    );

  const applyLanguage = (next: SupportedLanguage, updateUrl: boolean = true) => {
    if (next === language) return;
    setLanguage(next);
    setActiveTab("state");
    setIsPlaying(false);
    resetEngine();
    compiledKeyRef.current = null;
    setCurrentStepIndex(-1);
    setBreakpoints([]);
    setActiveLine(1);
    const definition = LANGUAGE_DEFINITIONS[next];
    setTemplate(definition.defaultTemplate);
    const src = definition.sources[definition.defaultTemplate];
    setCode(src);
    setCodeHistory([src]);
    setHistoryIndex(0);
    prewarmRemote(next, src);
    if (updateUrl) {
      setLocation(`/simulations/code/${next}`, { replace: true });
    }
    toast.success(`Switched to ${definition.label}`);
  };

  const changeLanguage = (next: SupportedLanguage) => {
    applyLanguage(next, true);
  };

  const selectTemplate = (next: string) => {
    setTemplate(next);
    setIsPlaying(false);
    resetEngine();
    compiledKeyRef.current = null;
    setCurrentStepIndex(-1);
    const nextSrc = LANGUAGE_DEFINITIONS[language]?.sources[next] ?? "";
    setCode(nextSrc);
    setCodeHistory(prev => [...prev, nextSrc]);
    setHistoryIndex(prev => prev + 1);
    prewarmRemote(language, nextSrc);
    toast.success(`Loaded example: ${next}`);
  };

  const runProgram = async (isInstant = false) => {
    pendingActionRef.current = isInstant ? "instant" : "run";
    compiledKeyRef.current = computeKey();
    const consumedStdin = stdinQueue;
    consumedStdinRef.current = consumedStdin;
    setStdinQueue("");
    await runCode(language, code, { stdin: consumedStdin, instant: isInstant });
  };

  const awaitingInput =
    isMasm &&
    !!result?.awaitingInput &&
    currentStepIndex >= (result?.steps.length ?? 0) - 1;

  /** Queues keystrokes; if the CPU is blocked on input, resumes it from the paused INT. */
  const submitStdin = (text: string) => {
    if (!text) return;
    if (awaitingInput && result && !engineBusy) {
      const cumulative = consumedStdinRef.current + stdinQueue + text;
      consumedStdinRef.current = cumulative;
      resumeFromStepRef.current = result.steps.length;
      pendingActionRef.current = "resume";
      setStdinQueue("");
      void runCode(language, code, { stdin: cumulative, instant: false });
      return;
    }
    setStdinQueue(buffer => `${buffer}${text}`);
  };

  const onRun = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (engineBusy) return;
    const key = computeKey();
    const hasFreshStdin = stdinQueue.length > 0;

    if (speed === "instant") {
      void runProgram(true);
      return;
    }

    if (
      !hasFreshStdin &&
      compiledKeyRef.current === key &&
      result &&
      result.steps.length > 0
    ) {
      setCurrentStepIndex(index =>
        index >= result.steps.length - 1 ? 0 : index
      );
      setIsPlaying(true);
      return;
    }
    void runProgram(false);
  };

  const onStep = () => {
    if (isPlaying) setIsPlaying(false);
    if (engineBusy) return;
    const key = computeKey();
    const hasFreshStdin = stdinQueue.length > 0;

    if (speed === "instant" && result && result.steps.length > 0) {
      setCurrentStepIndex(result.steps.length - 1);
      return;
    }

    if (!hasFreshStdin && compiledKeyRef.current === key && result && result.steps.length > 0) {
      setCurrentStepIndex(index =>
        Math.min(result.steps.length - 1, index + 1)
      );
      return;
    }
    pendingActionRef.current = "step";
    compiledKeyRef.current = key;
    const consumedStdin = stdinQueue;
    consumedStdinRef.current = consumedStdin;
    setStdinQueue("");
    // Step mode always wants full trace (never instant)
    void runCode(language, code, { stdin: consumedStdin, instant: false });
  };

  const onStepBack = () => {
    if (isPlaying) setIsPlaying(false);
    setCurrentStepIndex(index => Math.max(0, index - 1));
  };

  const onReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(-1);
    resetEngine();
    compiledKeyRef.current = null;
    toast.info("Execution reset");
  };

  const onScrub = (index: number) => {
    setIsPlaying(false);
    setCurrentStepIndex(index);
  };

  const handleImportCode = (importedCode: string, filename: string) => {
    handleCodeChange(importedCode);
    compiledKeyRef.current = null;
    setCurrentStepIndex(-1);
    setIsPlaying(false);
    toast.success(`Imported ${filename}`);
  };

  const handleExportCode = () => {
    const filename = LANGUAGE_DEFINITIONS[language].filename;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  };

  const handleSpeedChange = (newSpeed: ExecutionSpeed) => {
    setSpeed(newSpeed);
    if (newSpeed === "instant" && isPlaying && result && result.steps.length) {
      setCurrentStepIndex(result.steps.length - 1);
      setIsPlaying(false);
    }
  };

  // Memory & Stack calculations
  const memoryBase = parseAddress(memoryReference, 0x1e5);
  const memoryRows = useMemo(() => {
    if (language !== "masm8086") return [];
    const bytes = masmEngine.peekMemory(memoryBase, 12);
    return Array.from({ length: 12 }, (_, index) => ({
      address: memoryBase + index,
      value: bytes[index] ?? 0,
    }));
  }, [memoryBase, language, currentStep]);

  const stackWindow = useMemo(() => {
    const map = new Map<number, number>();
    currentStep?.memory?.forEach(cell => map.set(cell.address, cell.value));
    return map;
  }, [currentStep]);

  useEffect(() => {
    const windowStart = currentStep?.memory?.[0]?.address;
    if (language === "masm8086" && windowStart !== undefined)
      setStackReference(formatAddress(windowStart));
  }, [currentStep, language]);

  const [registerFormat, setRegisterFormat] = useState<"hex" | "decimal" | "binary">("hex");

  const prevSp = previousStep?.registers ? parseInt(previousStep.registers.SP || "0", 16) : null;
  const currSp = currentStep?.registers ? parseInt(currentStep.registers.SP || "0", 16) : null;
  const spDelta = (prevSp !== null && currSp !== null && !isNaN(prevSp) && !isNaN(currSp)) ? currSp - prevSp : null;

  const stackBase = parseAddress(stackReference, 0x2fffe);
  const stackOffsets = [-6, -4, -2, 0, 2, 4, 6, 8, 10];
  const stackRows = useMemo(
    () =>
      stackOffsets.map(offset => {
        const address = stackBase + offset;
        const isSp = offset === 0;
        return {
          offset,
          address,
          isSp,
          value: `${outputValue(stackWindow.get(address) ?? 0, "hex")}${outputValue(stackWindow.get(address + 1) ?? 0, "hex")}`,
        };
      }),
    [stackBase, stackWindow]
  );

  const registers = toRegisterSnapshot(currentStep?.registers);
  const flags = toFlagRecord(currentStep?.flags);

  return (
    <div className="code-studio assembler-studio flex flex-col gap-2.5 h-[calc(100vh-10rem)] min-h-[560px] w-full overflow-hidden select-none font-sans text-slate-800 dark:text-slate-200">
      {/* ===================================================================== */}
      {/* 1. CONSOLIDATED CIRCUIT-STYLE TOP TOOLBAR                             */}
      {/* ===================================================================== */}
      <AssemblerToolbar
        groups={LANGUAGE_DEFINITIONS[language].groups}
        selectedTemplate={template}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        running={isPlaying}
        busy={engineBusy}
        language={language}
        languageOptions={LANGUAGE_OPTIONS}
        onLanguageChange={changeLanguage}
        onTemplateChange={selectTemplate}
        onRun={onRun}
        onStep={onStep}
        onStepBack={onStepBack}
        onReset={onReset}
        onScrub={onScrub}
        speed={speed}
        onSpeedChange={handleSpeedChange}
        onImportCode={handleImportCode}
        onExportCode={handleExportCode}
        onUndo={handleUndo}
        canUndo={historyIndex > 0}
        onRedo={handleRedo}
        canRedo={historyIndex < codeHistory.length - 1}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDelete}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup direction={isDesktop ? "horizontal" : "vertical"} className="gap-2.5">
          {/* ================================================================= */}
          {/* QUADRANT 1 (Left Panel): Code Editor (Full Vertical Height)       */}
          {/* ================================================================= */}
          <ResizablePanel defaultSize={50} minSize={30} className="flex h-full min-h-0 flex-col overflow-hidden">
            <section className="flex flex-col h-full min-h-0 rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12] overflow-hidden shadow-xs">
              {/* macOS Title Bar Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-[#1a1d24] bg-slate-50 dark:bg-[#0d0f12] shrink-0">
                <div className="flex items-center gap-1.5">
                  <MacWindowDots />
                  <Code className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ms-0.5" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">
                    {LANGUAGE_DEFINITIONS[language].filename}
                  </span>
                </div>

                {/* Clean Right Metadata */}
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  <span>{code.split("\n").length} lines</span>
                </div>
              </div>

              {/* Source Editor Body */}
              <SourceEditor
                code={code}
                onChange={handleCodeChange}
                language={language}
                activeLine={activeLine}
                onActiveLine={setActiveLine}
                breakpoints={breakpoints}
                onToggleBreakpoint={toggleBreakpoint}
              />
            </section>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-transparent hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors" />

          {/* ================================================================= */}
          {/* Right Panel (Nested Vertical Group): Terminal Top + Inspectors Bottom */}
          {/* ================================================================= */}
          <ResizablePanel defaultSize={50} minSize={30} className="flex h-full min-h-0 flex-col overflow-hidden">
            <ResizablePanelGroup direction="vertical" className="h-full w-full gap-2.5">
              {/* =============================================================== */}
              {/* QUADRANT 2 (Top Right): Terminal Window                         */}
              {/* =============================================================== */}
              <ResizablePanel defaultSize={45} minSize={20} className="flex h-full min-h-0 flex-col overflow-hidden">
                <section className="flex flex-col h-full min-h-0 rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12] overflow-hidden shadow-xs">
                  {/* macOS Title Bar Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-[#1a1d24] bg-slate-50 dark:bg-[#0d0f12] shrink-0">
                    <div className="flex items-center gap-1.5">
                      <MacWindowDots />
                      <Terminal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ms-0.5" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wider font-mono">
                        terminal.out
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {stdinQueue && (
                        <span className="rounded-md bg-violet-950/60 border border-violet-800/40 px-2 py-0.5 text-[10px] font-mono text-violet-300">
                          stdin queued
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (currentStep) currentStep.stdout = "";
                          setStdinQueue("");
                        }}
                        title="Clear terminal"
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Terminal surface: VRAM grid for MASM, plain console text otherwise */}
                  {engineBusy ? (
                    <div className="flex-1 min-h-0 p-3 font-mono text-xs bg-[#050608] text-violet-400 italic flex items-start gap-2">
                      <span className="h-2 w-2 mt-1 rounded-full bg-violet-500 animate-ping" />
                      {language === "c" || language === "cpp"
                        ? "[Compiling & Linking...]"
                        : "Executing program..."}
                    </div>
                  ) : combinedError && !currentStep?.stdout && !currentStep?.video ? (
                    <div className="flex-1 min-h-0 p-3 bg-[#050608] text-[#F43F5E] italic font-sans text-xs">
                      Execution stopped. Check diagnostics below.
                    </div>
                  ) : (
                    <TerminalSurface
                      scrollRef={terminalScrollRef}
                      stdout={cumulativeStdout}
                      video={isMasm ? (currentStep?.video ?? null) : null}
                      awaitingInput={awaitingInput}
                      active={!combinedError}
                      emptyLabel="Output console ready. Click 'Run' to execute."
                    />
                  )}

                  {/* Interactive Keyboard Input Bar */}
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      const entry = stdinInput.trim();
                      if (entry) {
                        submitStdin(`${entry}\n`);
                        setStdinInput("");
                        if (!awaitingInput) toast.success(`Queued stdin: "${entry}"`);
                      }
                    }}
                    className={`flex shrink-0 items-center gap-1.5 border-t p-1.5 ${awaitingInput
                      ? "border-violet-500 bg-violet-500/10 ring-1 ring-inset ring-violet-500/60 animate-pulse"
                      : "border-slate-200 bg-slate-50 dark:border-[#1a1d24] dark:bg-[#090a0d]"
                      }`}
                  >
                    <span className="font-mono text-xs font-bold text-violet-500 dark:text-violet-400 ps-2">
                      &gt;
                    </span>
                    <input
                      aria-label="Terminal keyboard entry"
                      value={stdinInput}
                      onChange={event => setStdinInput(event.target.value)}
                      autoFocus={awaitingInput}
                      placeholder={
                        awaitingInput
                          ? "Waiting for input — type a key…"
                          : "Keyboard entry (stdin buffer)…"
                      }
                      onKeyDown={event => {
                        // Blocked program: a bare keystroke is delivered immediately.
                        if (
                          awaitingInput &&
                          !stdinInput &&
                          event.key.length === 1 &&
                          !event.ctrlKey &&
                          !event.metaKey
                        ) {
                          event.preventDefault();
                          submitStdin(event.key);
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-xs text-slate-800 placeholder:text-slate-400 outline-none dark:text-slate-100 dark:placeholder:text-slate-600"
                    />
                    <button
                      type="submit"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1b2028] dark:hover:text-white"
                    >
                      <CornerDownLeft className="h-3 w-3" />
                      <span>Queue</span>
                    </button>
                  </form>

                  {/* PERSISTENT ERROR DIAGNOSTICS BANNER */}
                  {combinedError && (
                    <div className="shrink-0 border-t border-[#F43F5E]/30 bg-rose-500/10 p-2.5 text-xs flex items-start gap-2.5 shadow-xs font-sans">
                      <span className="h-2 w-2 rounded-full bg-[#F43F5E] shrink-0 mt-1" />
                      <div className="flex-1 min-w-0 font-sans">
                        <span className="font-bold uppercase tracking-wider text-[10.5px] text-[#F43F5E] block mb-0.5 font-sans">
                          DIAGNOSTICS / EXECUTION ERROR
                        </span>
                        <div className="font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-rose-900 dark:text-rose-200 font-normal">
                          {formatDiagnostic(combinedError)}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </ResizablePanel>

              <ResizableHandle withHandle className="bg-transparent hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors" />

              {/* =============================================================== */}
              {/* QUADRANT 3 (Bottom Right): State Inspector Tabs                 */}
              {/* =============================================================== */}
              <ResizablePanel defaultSize={55} minSize={35} className="flex h-full min-h-0 flex-col overflow-hidden">
                <section className="flex flex-col h-full min-h-0 rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12] overflow-hidden shadow-xs">
                  {/* macOS Title Bar Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-[#1a1d24] bg-slate-50 dark:bg-[#0d0f12] shrink-0">
                    <div className="flex items-center gap-1.5">
                      <MacWindowDots />
                      <Cpu className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ms-0.5" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wider font-mono">
                        inspector.exe
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="text-[10.5px] uppercase tracking-wider">
                        {isMasm ? "8086 CPU" : LANGUAGE_DEFINITIONS[language].label}
                      </span>
                    </div>
                  </div>

                  <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="h-full flex flex-col min-h-0"
                  >
                    {/* Tab Header with Full-Width Inspector Tabs */}
                    <div className="w-full px-2 py-1.5 border-b border-slate-200 dark:border-[#1a1d24] bg-slate-50/60 dark:bg-[#090a0d] shrink-0">
                      <SegmentedControl
                        options={inspectorTabs}
                        value={activeTab}
                        onChange={setActiveTab}
                        size="md"
                        fullWidth
                        className="h-10 bg-slate-200/60 dark:bg-[#13161c] border-slate-200/80 dark:border-[#1a1d24]"
                        aria-label="Inspector tabs"
                      />
                    </div>

                    {/* ----------------------------------------------------------- */}
                    {/* TAB 1: Registers & Flags (MASM) OR Variables (High-Level)   */}
                    {/* ----------------------------------------------------------- */}
                    <TabsContent
                      value="state"
                      className="flex-1 min-h-0 overflow-y-auto p-3 m-0 outline-hidden space-y-3"
                    >
                      {isMasm ? (
                        <>
                          {/* General Purpose Registers with High-Contrast Subregisters & Platform Segmented Switcher */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                General Purpose Registers
                              </div>
                              {/* Platform standard segmented pill control */}
                              <SegmentedControl
                                options={[
                                  { label: "HEX", value: "hex" },
                                  { label: "DEC", value: "decimal" },
                                  { label: "BIN", value: "binary" },
                                ]}
                                value={registerFormat}
                                onChange={setRegisterFormat}
                                size="sm"
                                aria-label="Register format"
                                className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
                              />
                            </div>

                            {/* Split into a clean 2-row grid: Row 1: AX, BX | Row 2: CX, DX */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {(["AX", "BX", "CX", "DX"] as const).map(reg => {
                                const val = registers[reg];
                                const high = `${reg[0]}H`;
                                const low = `${reg[0]}L`;
                                return (
                                  <div
                                    key={reg}
                                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-[#1a1d24] dark:bg-[#090a0d]"
                                  >
                                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-[#1a1d24]">
                                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                        {reg}
                                      </span>
                                      <span className="font-mono text-xs font-normal text-violet-700 dark:text-violet-300">
                                        {formatRegisterValue(val, registerFormat, 16)}
                                      </span>
                                    </div>
                                    {/* High-contrast subregisters */}
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-[#1a1d24] dark:bg-[#13161c] min-w-0">
                                        <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400 shrink-0 me-1">
                                          {high}
                                        </span>
                                        <span className="font-mono text-xs font-normal text-slate-900 dark:text-slate-100 truncate">
                                          {formatRegisterValue(val.slice(0, 2), registerFormat, 8)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-[#1a1d24] dark:bg-[#13161c] min-w-0">
                                        <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400 shrink-0 me-1">
                                          {low}
                                        </span>
                                        <span className="font-mono text-xs font-normal text-slate-900 dark:text-slate-100 truncate">
                                          {formatRegisterValue(val.slice(2), registerFormat, 8)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Combined Single-Line Layout for Pointers, Indexes & Segments */}
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center justify-between">
                              <span>Pointers, Indexes &amp; Segments</span>
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                              {(["SP", "BP", "SI", "DI", "CS", "DS", "SS", "ES"] as const).map(reg => {
                                const isSeg = ["CS", "DS", "SS", "ES"].includes(reg);
                                return (
                                  <div
                                    key={reg}
                                    className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 dark:border-[#1a1d24] dark:bg-[#090a0d] min-w-0"
                                  >
                                    <span className={`block text-[10px] font-bold uppercase tracking-wide ${isSeg
                                      ? "text-violet-600 dark:text-violet-400"
                                      : "text-slate-600 dark:text-slate-300"
                                      }`}>
                                      {reg}
                                    </span>
                                    <span className={`font-mono text-xs font-semibold block truncate ${isSeg
                                      ? "text-violet-700 dark:text-violet-300"
                                      : "text-slate-900 dark:text-slate-100"
                                      }`}>
                                      {formatRegisterValue(registers[reg], registerFormat, 16)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Flags: Dedicated Balanced Row with Increased Size & High Contrast */}
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                              Flags
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                              {(["CF", "ZF", "SF", "OF", "PF", "AF", "IF", "DF"] as const).map(flag => {
                                const active = flags[flag];
                                return (
                                  <div
                                    key={flag}
                                    className={`rounded-lg border px-2 py-1.5 text-center transition ${active
                                      ? "border-violet-500 bg-violet-100/80 text-violet-950 dark:border-violet-400/60 dark:bg-violet-950/50 dark:text-violet-100 shadow-xs"
                                      : "border-slate-200 bg-slate-50/60 text-slate-500 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-400"
                                      }`}
                                  >
                                    <div className="flex items-center justify-center gap-1 mb-0.5">
                                      <span
                                        className={`h-2 w-2 rounded-full ${active
                                          ? "bg-violet-600 shadow-[0_0_6px_rgba(124,58,237,0.7)]"
                                          : "bg-slate-300 dark:bg-slate-700"
                                          }`}
                                      />
                                      <span className={`font-mono text-xs font-bold ${active
                                        ? "text-violet-950 dark:text-violet-100"
                                        : "text-slate-700 dark:text-slate-300"
                                        }`}>
                                        {flag}
                                      </span>
                                    </div>
                                    <span className={`font-mono text-xs font-bold block ${active
                                      ? "text-violet-700 dark:text-violet-300"
                                      : "text-slate-400 dark:text-slate-500"
                                      }`}>
                                      {active ? "1" : "0"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      ) : (
                        <AssemblerVariables
                          variables={currentStep?.variables ?? {}}
                          previousVariables={previousStep?.variables ?? null}
                          callStack={currentStep?.callStack ?? []}
                          copy={{
                            variablesTitle: "Variables Inspector",
                            callStackTitle: "Call Stack",
                            empty: "No variables tracked at this step",
                            name: "Name",
                            type: "Type",
                            value: "Value",
                          }}
                        />
                      )}
                    </TabsContent>

                    {/* ----------------------------------------------------------- */}
                    {/* TAB 2: Execution Trace Log                                  */}
                    {/* ----------------------------------------------------------- */}
                    <TabsContent
                      value="trace"
                      className="flex-1 min-h-0 overflow-y-auto p-3 m-0 outline-hidden"
                    >
                      <div className="rounded-lg border border-slate-200 dark:border-[#1a1d24] overflow-hidden">
                        <div className="grid grid-cols-[3.5rem_3.5rem_1fr_6rem] bg-slate-100 dark:bg-[#090a0d] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#1a1d24]">
                          <span>Step</span>
                          <span>Line</span>
                          <span>Instruction / Code</span>
                          <span>State Update</span>
                        </div>
                        {result && result.steps.length > 0 ? (
                          <div className="divide-y divide-slate-100 dark:divide-[#1a1d24]">
                            {result.steps.map(step => {
                              const isCurrent = step.stepIndex === currentStepIndex;
                              const lineText =
                                code.split("\n")[step.line - 1]?.trim() || `Line ${step.line}`;
                              return (
                                <button
                                  key={step.stepIndex}
                                  type="button"
                                  onClick={() => onScrub(step.stepIndex)}
                                  className={`grid w-full grid-cols-[3.5rem_3.5rem_1fr_6rem] px-3 py-1.5 text-start font-mono text-xs items-center cursor-pointer transition font-normal ${isCurrent
                                    ? "bg-violet-100/60 dark:bg-violet-950/40 text-violet-900 dark:text-violet-200"
                                    : "hover:bg-slate-50 dark:hover:bg-[#13161c]"
                                    }`}
                                >
                                  <span className="text-slate-500 dark:text-slate-400 tabular-nums font-normal">
                                    {step.stepIndex.toString().padStart(2, "0")}
                                  </span>
                                  <span className="text-violet-600 dark:text-violet-400 tabular-nums font-normal">
                                    L{step.line}
                                  </span>
                                  <span className="truncate pe-2 font-normal">
                                    {lineText}
                                  </span>
                                  <span className="truncate text-slate-600 dark:text-slate-300 text-[11px] font-normal">
                                    {isMasm && step.registers
                                      ? `AX=${step.registers.AX}`
                                      : stringifyVariable(
                                        Object.values(step.variables)[0]?.value
                                      )}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="px-3 py-8 text-center text-xs text-slate-500 font-mono">
                            No trace steps recorded. Run or step through the program.
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* ----------------------------------------------------------- */}
                    {/* TAB 3: Stack Visualizer                                     */}
                    {/* ----------------------------------------------------------- */}
                    <TabsContent
                      value="stack"
                      className="flex-1 min-h-0 p-3 m-0 outline-hidden space-y-3 h-full flex flex-col"
                    >
                      <div className="flex items-center justify-between max-w-xl shrink-0">
                        <label className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Stack Reference (SS:SP):
                          </span>
                          <input
                            aria-label="Stack reference address"
                            value={stackReference}
                            onChange={e => setStackReference(e.target.value)}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-normal text-slate-800 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-200 w-24 uppercase outline-none"
                          />
                        </label>
                        {spDelta !== null && spDelta !== 0 && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${spDelta < 0
                            ? "bg-rose-500/15 text-[#F43F5E] border border-rose-500/30"
                            : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                            }`}>
                            {spDelta < 0 ? `${spDelta} (PUSH)` : `+${spDelta} (POP)`}
                          </span>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200 dark:border-[#1a1d24] overflow-hidden max-w-xl flex flex-col flex-1 min-h-0">
                        <div className="grid grid-cols-[4.5rem_7rem_1fr_4.5rem] bg-slate-100 dark:bg-[#090a0d] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#1a1d24] shrink-0">
                          <span>Pointer</span>
                          <span>Address</span>
                          <span>Value (16-bit Word)</span>
                          <span className="text-end">Delta</span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-[#1a1d24] overflow-y-auto flex-1">
                          {stackRows.map(row => (
                            <div
                              key={row.address}
                              className={`grid grid-cols-[4.5rem_7rem_1fr_4.5rem] px-3 py-1 font-mono text-xs items-center font-normal ${row.isSp
                                ? "bg-violet-50 dark:bg-violet-950/25 text-violet-900 dark:text-violet-200"
                                : "text-slate-700 dark:text-slate-300"
                                }`}
                            >
                              <span className="flex items-center gap-1.5">
                                {row.isSp ? (
                                  <span className="rounded bg-[#F43F5E] text-white text-[9px] px-1.5 py-0.5 font-bold tracking-wide">
                                    SP
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                                    {row.offset < 0 ? `SP${row.offset}` : `SP+${row.offset}`}
                                  </span>
                                )}
                              </span>
                              <span className="text-slate-600 dark:text-slate-400 font-normal">
                                {row.address.toString(16).toUpperCase().padStart(4, "0")}h
                              </span>
                              <span className="font-normal text-slate-900 dark:text-slate-100">
                                {row.value}
                              </span>
                              <span className="text-end text-[11px] tabular-nums font-normal">
                                {row.isSp && spDelta !== null && spDelta !== 0 ? (
                                  <span className={spDelta < 0 ? "text-[#F43F5E] font-bold" : "text-blue-500 font-bold"}>
                                    {spDelta > 0 ? `+${spDelta}` : `${spDelta}`}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-600 font-normal">
                                    {row.offset > 0 ? `+${row.offset}` : row.offset === 0 ? "0" : `${row.offset}`}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent
                      value="telemetry"
                      className="flex-1 min-h-0 overflow-y-auto p-3 m-0 outline-hidden"
                    >
                      <div className="rounded-lg border border-slate-200 dark:border-[#1a1d24] divide-y divide-slate-200 dark:divide-[#1a1d24] font-mono text-xs">
                        {[
                          ["Exit Status", !result ? "—" : combinedError ? "Error" : "Code 0 (OK)"],
                          ["Execution Time", runTimeMs === null ? "—" : `~${runTimeMs} ms`],
                          ["Steps Executed", String(totalSteps)],
                          ["Active Variables", String(Object.keys(currentStep?.variables ?? {}).length)],
                        ].map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between px-3 py-2">
                            <span className="text-slate-500 dark:text-slate-400">{k}</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{v}</span>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent
                      value="reference"
                      className="flex-1 min-h-0 overflow-y-auto p-3 m-0 outline-hidden"
                    >
                      <div className="rounded-lg border border-slate-200 dark:border-[#1a1d24] divide-y divide-slate-200 dark:divide-[#1a1d24] font-mono text-xs">
                        {(QUICK_REFERENCE[language] ?? []).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[9rem_1fr] gap-2 px-3 py-1.5">
                            <code className="font-semibold text-slate-800 dark:text-slate-200">{k}</code>
                            <span className="text-slate-500 dark:text-slate-400">{v}</span>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* ----------------------------------------------------------- */}
                    {/* TAB 4: Main Memory (Searchable RAM Grid)                    */}
                    {/* ----------------------------------------------------------- */}
                    <TabsContent
                      value="memory"
                      className="flex-1 min-h-0 p-3 m-0 outline-hidden space-y-3 h-full flex flex-col"
                    >
                      <div className="flex items-center justify-between gap-2 max-w-2xl shrink-0">
                        <label className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Base Address:
                          </span>
                          <input
                            aria-label="Memory reference address"
                            value={memoryReference}
                            onChange={e => setMemoryReference(e.target.value)}
                            onBlur={e =>
                              setMemoryReference(
                                formatAddress(parseAddress(e.target.value, memoryBase))
                              )
                            }
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-normal text-slate-800 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-200 w-24 uppercase outline-none"
                          />
                        </label>
                      </div>

                      <div className="rounded-lg border border-slate-200 dark:border-[#1a1d24] overflow-hidden max-w-2xl flex flex-col flex-1 min-h-0">
                        <div className="grid grid-cols-[6.5rem_6.5rem_4.5rem_4.5rem_3.5rem] bg-slate-100 dark:bg-[#090a0d] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#1a1d24] shrink-0">
                          <span>Address</span>
                          <span>Byte Value</span>
                          <span>Hex</span>
                          <span>Decimal</span>
                          <span>ASCII</span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-[#1a1d24] overflow-y-auto flex-1">
                          {memoryRows.map(row => (
                            <div
                              key={row.address}
                              className="grid grid-cols-[6.5rem_6.5rem_4.5rem_4.5rem_3.5rem] px-3 py-1 font-mono text-xs items-center font-normal"
                            >
                              <span className="text-slate-600 dark:text-slate-400 font-normal">
                                {formatAddress(row.address)}
                              </span>
                              <span className="text-slate-800 dark:text-slate-200 font-normal">
                                {row.value.toString(2).padStart(8, "0")}b
                              </span>
                              <span className="text-violet-700 dark:text-violet-300 font-normal">
                                {outputValue(row.value, "hex")}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 font-normal">
                                {outputValue(row.value, "decimal")}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400 font-normal">
                                {outputValue(row.value, "ascii")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export const CodeStudio = AssemblerStudio;
export default AssemblerStudio;
