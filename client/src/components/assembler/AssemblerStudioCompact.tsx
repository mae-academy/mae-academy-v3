import Editor from "react-simple-code-editor";
import { Circle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  AssemblerToolbar,
  type AssemblerLanguageOption,
  type AssemblerTemplateGroup,
} from "@/components/assembler/AssemblerToolbar";
import {
  AssemblerRegisters,
  type RegisterSnapshot,
} from "@/components/assembler/AssemblerRegisters";
import type { AssemblerFlag } from "@/components/assembler/AssemblerFlags";
import { AssemblerStack } from "@/components/assembler/AssemblerStack";
import { AssemblerVariables } from "@/components/assembler/AssemblerVariables";
import {
  masmEngine,
  useExecutionEngine,
  type SupportedLanguage,
  type TraceStep,
} from "@/features/execution-engine";

type LocaleCode = "en" | "ar" | "es";
type MemoryMode = "hex" | "decimal" | "ascii";
const CARD =
  "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const HEADING =
  "text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white";
const PLAY_INTERVAL_MS = 160;

const LABELS: Record<
  LocaleCode,
  {
    controls: string;
    run: string;
    pause: string;
    step: string;
    back: string;
    reset: string;
    cycles: string;
    examples: string;
    prototype: string;
    language: string;
    source: string;
    breakpoints: string;
    cpu: string;
    general: string;
    pointers: string;
    segments: string;
    physical: string;
    flags: string;
    on: string;
    off: string;
    memory: string;
    address: string;
    value: string;
    reference: string;
    hex: string;
    decimal: string;
    ascii: string;
    stack: string;
    lifo: string;
    empty: string;
    terminal: string;
    terminalHint: string;
    keyboard: string;
    send: string;
    trace: string;
    collapse: string;
    expand: string;
    instruction: string;
    newValue: string;
    loading: string;
    ready: string;
    queued: string;
    coreError: string;
    programLoaded: string;
    awaiting: string;
    variables: string;
    callStack: string;
    name: string;
    type: string;
    noData: string;
  }
> = {
  en: {
    controls: "Execution controls",
    run: "Run",
    pause: "Pause",
    step: "Step",
    back: "Step Back",
    reset: "Reset",
    cycles: "Steps",
    examples: "Examples library",
    prototype:
      "Unified trace engine · MASM 8086, Python, C and C++ share one execution model.",
    language: "Language",
    source: "Source workspace",
    breakpoints: "Breakpoints",
    cpu: "CPU registers",
    general: "General-purpose registers",
    pointers: "Pointers & indexes",
    segments: "Segment registers",
    physical: "Physical",
    flags: "Flags register",
    on: "1 / on",
    off: "0 / off",
    memory: "Main memory",
    address: "Address",
    value: "Value",
    reference: "Reference address",
    hex: "Hex",
    decimal: "Decimal",
    ascii: "ASCII",
    stack: "Stack visualizer",
    lifo: "Last in · first out",
    empty: "Available stack memory",
    terminal: "Console",
    terminalHint: "Program output only.",
    keyboard: "Keyboard entry",
    send: "Queue input",
    trace: "Execution trace",
    collapse: "Collapse",
    expand: "Expand",
    instruction: "Instruction",
    newValue: "New value",
    loading: "Initializing headless CPU…",
    ready: "CPU bridge ready.",
    queued: "queued for the next run",
    coreError: "Execution error",
    programLoaded: "program loaded at 1000:0100",
    awaiting: "Awaiting a step…",
    variables: "Variables",
    callStack: "Call stack",
    name: "Name",
    type: "Type",
    noData: "No data yet",
  },
  ar: {
    controls: "عناصر التنفيذ",
    run: "تشغيل",
    pause: "إيقاف مؤقت",
    step: "خطوة",
    back: "خطوة للخلف",
    reset: "إعادة ضبط",
    cycles: "الخطوات",
    examples: "مكتبة الأمثلة",
    prototype:
      "محرك أثر موحّد · MASM 8086 وPython وC وC++ تشترك في نموذج تنفيذ واحد.",
    language: "اللغة",
    source: "مساحة الشيفرة",
    breakpoints: "نقاط التوقف",
    cpu: "سجلات المعالج",
    general: "السجلات العامة",
    pointers: "المؤشرات والفهارس",
    segments: "سجلات المقاطع",
    physical: "العنوان الفعلي",
    flags: "سجل الأعلام",
    on: "1 / مفعّل",
    off: "0 / متوقف",
    memory: "الذاكرة الرئيسية",
    address: "العنوان",
    value: "القيمة",
    reference: "عنوان المرجع",
    hex: "سداسي عشري",
    decimal: "عشري",
    ascii: "ASCII",
    stack: "عارض المكدس",
    lifo: "الأخير دخولًا · الأول خروجًا",
    empty: "ذاكرة مكدس متاحة",
    terminal: "الطرفية",
    terminalHint: "مخرجات البرنامج فقط.",
    keyboard: "إدخال لوحة المفاتيح",
    send: "إدراج الإدخال",
    trace: "أثر التنفيذ",
    collapse: "طي",
    expand: "توسيع",
    instruction: "التعليمة",
    newValue: "القيمة الجديدة",
    loading: "تجهيز المعالج headless…",
    ready: "جسر المعالج جاهز.",
    queued: "أُدرج للتشغيل التالي",
    coreError: "خطأ تنفيذ",
    programLoaded: "تم تحميل البرنامج عند 1000:0100",
    awaiting: "بانتظار خطوة…",
    variables: "المتغيرات",
    callStack: "مكدس الاستدعاء",
    name: "الاسم",
    type: "النوع",
    noData: "لا توجد بيانات بعد",
  },
  es: {
    controls: "Controles de ejecución",
    run: "Ejecutar",
    pause: "Pausar",
    step: "Paso",
    back: "Paso atrás",
    reset: "Restablecer",
    cycles: "Pasos",
    examples: "Biblioteca de ejemplos",
    prototype:
      "Motor de traza unificado · MASM 8086, Python, C y C++ comparten un modelo de ejecución.",
    language: "Idioma",
    source: "Espacio de código",
    breakpoints: "Puntos de interrupción",
    cpu: "Registros de CPU",
    general: "Registros generales",
    pointers: "Punteros e índices",
    segments: "Registros de segmento",
    physical: "Dirección física",
    flags: "Registro de banderas",
    on: "1 / activo",
    off: "0 / apagado",
    memory: "Memoria principal",
    address: "Dirección",
    value: "Valor",
    reference: "Dirección de referencia",
    hex: "Hex",
    decimal: "Decimal",
    ascii: "ASCII",
    stack: "Visualizador de pila",
    lifo: "Último en · primero fuera",
    empty: "Memoria de pila disponible",
    terminal: "Consola",
    terminalHint: "Solo la salida del programa.",
    keyboard: "Entrada de teclado",
    send: "Encolar entrada",
    trace: "Traza de ejecución",
    collapse: "Contraer",
    expand: "Expandir",
    instruction: "Instrucción",
    newValue: "Nuevo valor",
    loading: "Inicializando CPU sin interfaz…",
    ready: "Puente de CPU listo.",
    queued: "en cola para la próxima ejecución",
    coreError: "Error de ejecución",
    programLoaded: "programa cargado en 1000:0100",
    awaiting: "Esperando un paso…",
    variables: "Variables",
    callStack: "Pila de llamadas",
    name: "Nombre",
    type: "Tipo",
    noData: "Sin datos todavía",
  },
};

// ---------------------------------------------------------------------------
// Per-language starter templates.
// ---------------------------------------------------------------------------
interface LanguageDefinition {
  label: string;
  groups: AssemblerTemplateGroup[];
  sources: Record<string, string>;
  defaultTemplate: string;
}

const MASM_GROUPS: AssemblerTemplateGroup[] = [
  { label: "Basics", items: ["Basic Math & Flags", "Negative Hex & Exchange"] },
  { label: "Logic & Shift", items: ["Shift & Rotate", "Loop & Logic"] },
  {
    label: "Memory & Stack",
    items: ["Stack (Call & Return)", "PUSH & POP", "LEA & Memory mapping"],
  },
  {
    label: "Algorithms",
    items: [
      "Palindrome Checker",
      "Array Min/Max Search",
      "BCD/ASCII Arithmetic",
    ],
  },
];
// The MASM template picker has only ever swapped the header comment on one fixed program; every
// entry maps to the same source so the dropdown continues to behave exactly as it did before.
const MASM_PROGRAM = [
  "; Basic Math & Flags",
  ".model small",
  ".stack 100h",
  ".data",
  "message db 'MAE 8086 ready.$', 0",
  ".code",
  "main proc",
  "  mov ax, @data",
  "  mov ds, ax",
  "  mov dx, offset message",
  "  mov ah, 09h",
  "  int 21h",
  "  mov ax, 0005h",
  "  mov bx, 0003h",
  "  add ax, bx",
  "  push ax",
  "  pop cx",
  "  mov ax, 4C00h",
  "  int 21h",
  "main endp",
].join("\n");
const MASM_SOURCES: Record<string, string> = Object.fromEntries(
  MASM_GROUPS.flatMap(group => group.items).map(item => [item, MASM_PROGRAM])
);

const PYTHON_GROUPS: AssemblerTemplateGroup[] = [
  { label: "Basics", items: ["Hello World", "Variables & Loops"] },
  { label: "Functions", items: ["Function Call"] },
];
const PYTHON_SOURCES: Record<string, string> = {
  "Hello World": 'print("Hello, MAE Academy!")\n',
  "Variables & Loops":
    "total = 0\nfor i in range(5):\n    total += i\nprint(total)\n",
  "Function Call":
    "def add(a, b):\n    result = a + b\n    return result\n\nx = 3\ny = 4\nz = add(x, y)\nprint(z)\n",
};

const CPP_GROUPS: AssemblerTemplateGroup[] = [
  { label: "Basics", items: ["Hello World", "Loop Sum"] },
  { label: "Functions", items: ["Function Call"] },
];
const CPP_SOURCES: Record<string, string> = {
  "Hello World":
    '#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello, MAE Academy!" << endl;\n    return 0;\n}\n',
  "Loop Sum":
    "#include <iostream>\nusing namespace std;\nint main() {\n    int total = 0;\n    for (int i = 0; i < 5; i++) {\n        total += i;\n    }\n    cout << total << endl;\n    return 0;\n}\n",
  "Function Call":
    "#include <iostream>\nusing namespace std;\nint add(int a, int b) {\n    int result = a + b;\n    return result;\n}\nint main() {\n    int x = 3;\n    int y = 4;\n    int z = add(x, y);\n    cout << z << endl;\n    return 0;\n}\n",
};

const C_GROUPS: AssemblerTemplateGroup[] = [
  { label: "Basics", items: ["Hello World", "Loop Sum"] },
];
const C_SOURCES: Record<string, string> = {
  // JSCPP's stdio.h drops the space after a literal comma inside a single printf; phrased around it.
  "Hello World":
    '#include <stdio.h>\nint main() {\n    printf("Hello from the C engine!\\n");\n    return 0;\n}\n',
  "Loop Sum":
    '#include <stdio.h>\nint main() {\n    int total = 0;\n    for (int i = 0; i < 5; i++) {\n        total += i;\n    }\n    printf("%d\\n", total);\n    return 0;\n}\n',
};

const LANGUAGE_DEFINITIONS: Record<SupportedLanguage, LanguageDefinition> = {
  masm8086: {
    label: "MASM 8086",
    groups: MASM_GROUPS,
    sources: MASM_SOURCES,
    defaultTemplate: "Basic Math & Flags",
  },
  python: {
    label: "Python",
    groups: PYTHON_GROUPS,
    sources: PYTHON_SOURCES,
    defaultTemplate: "Hello World",
  },
  cpp: {
    label: "C++",
    groups: CPP_GROUPS,
    sources: CPP_SOURCES,
    defaultTemplate: "Hello World",
  },
  c: {
    label: "C",
    groups: C_GROUPS,
    sources: C_SOURCES,
    defaultTemplate: "Hello World",
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

function SyntaxLine({ text }: { text: string }) {
  if (text.trim().startsWith(";"))
    return <span className="assembler-token-comment">{text}</span>;
  const fragments = text.split(
    /(\b(?:AX|AH|AL|BX|BH|BL|CX|CH|CL|DX|DH|DL|SI|DI|BP|SP|IP|CS|DS|ES|SS)\b|\b(?:[0-9A-F]+h|\d+)\b|\b(?:MOV|ADD|SUB|PUSH|POP|INT|CMP|JMP|JZ|JNZ|LOOP|LEA|CALL|RET|XCHG|HLT)\b|\.[A-Za-z]+|@[A-Za-z]+)/gi
  );
  return (
    <>
      {fragments.map((fragment, index) => (
        <span
          key={index}
          className={
            /^(MOV|ADD|SUB|PUSH|POP|INT|CMP|JMP|JZ|JNZ|LOOP|LEA|CALL|RET|XCHG|HLT)$/i.test(
              fragment
            )
              ? "assembler-token-instruction"
              : /^(AX|AH|AL|BX|BH|BL|CX|CH|CL|DX|DH|DL|SI|DI|BP|SP|IP|CS|DS|ES|SS)$/i.test(
                    fragment
                  )
                ? "assembler-token-register"
                : /^(?:[0-9A-F]+h|\d+)$/i.test(fragment)
                  ? "assembler-token-number"
                  : /^(\.|@)/.test(fragment)
                    ? "assembler-token-directive"
                    : undefined
          }
        >
          {fragment}
        </span>
      ))}
    </>
  );
}

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
  const lines = code.split("\n");
  const lineAt = (offset: number) => code.slice(0, offset).split("\n").length;
  const lineAtCursor = (target: EventTarget | null) =>
    lineAt(target instanceof HTMLTextAreaElement ? target.selectionStart : 0);
  return (
    <div
      className="relative h-[36rem] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
      dir="ltr"
    >
      <div className="absolute start-3 top-3 z-20 w-12 font-mono text-[13px] leading-8">
        {lines.map((_, index) => {
          const line = index + 1;
          return (
            <div
              key={line}
              className="grid grid-cols-[18px_1fr] text-slate-400"
            >
              <button
                type="button"
                aria-label={`Toggle breakpoint ${line}`}
                onClick={() => onToggleBreakpoint(line)}
              >
                {breakpoints.includes(line) ? (
                  <Circle className="h-3 w-3 fill-rose-500 text-rose-500" />
                ) : (
                  <span className="block h-3 w-3 rounded-full border border-transparent hover:border-slate-400" />
                )}
              </button>
              <span className="text-end">
                {line.toString().padStart(2, "0")}
              </span>
            </div>
          );
        })}
      </div>
      <Editor
        value={code}
        onValueChange={onChange}
        highlight={(source: string) => (
          <>
            {source.split("\n").map((line: string, index: number) => (
              <div
                key={`${index}-${line}`}
                className={`block min-h-8 ps-14 ${activeLine === index + 1 ? "border-s-2 border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "border-s-2 border-transparent"}`}
              >
                {language === "masm8086" ? (
                  <SyntaxLine text={line || " "} />
                ) : (
                  line || " "
                )}
              </div>
            ))}
          </>
        )}
        padding={0}
        onClick={event => onActiveLine(lineAtCursor(event.target))}
        onKeyUp={event => onActiveLine(lineAtCursor(event.target))}
        style={{
          minHeight: "100%",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          lineHeight: "2rem",
          whiteSpace: "pre",
          position: "relative",
          zIndex: 1,
        }}
        textareaClassName="!ps-14 !outline-none !caret-violet-500"
      />
    </div>
  );
}

export function AssemblerStudioCompact() {
  const { locale } = useLocale();
  const copy = LABELS[locale as LocaleCode] ?? LABELS.en;
  const {
    isRunning: engineBusy,
    result,
    runCode,
    reset: resetEngine,
  } = useExecutionEngine();

  const [language, setLanguage] = useState<SupportedLanguage>("masm8086");
  const [template, setTemplate] = useState(
    LANGUAGE_DEFINITIONS.masm8086.defaultTemplate
  );
  const [code, setCode] = useState(MASM_PROGRAM);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [activeLine, setActiveLine] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [mode, setMode] = useState<MemoryMode>("hex");
  const [memoryReference, setMemoryReference] = useState("01E5h");
  const [stackReference, setStackReference] = useState("2FFFEh");
  const [stdinInput, setStdinInput] = useState("");
  const [stdinQueue, setStdinQueue] = useState("");
  const [traceOpen, setTraceOpen] = useState(true);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const compiledKeyRef = useRef<string | null>(null);
  const pendingActionRef = useRef<"run" | "step" | null>(null);
  // stdin is intentionally excluded: it is consumed (and cleared) by the run that uses it, so
  // comparing against the now-empty queue would force a needless re-run on every later Resume.
  const computeKey = () => `${language}::${code}`;

  const currentStep: TraceStep | null =
    result && currentStepIndex >= 0
      ? (result.steps[currentStepIndex] ?? null)
      : null;
  const previousStep: TraceStep | null =
    result && currentStepIndex > 0
      ? (result.steps[currentStepIndex - 1] ?? null)
      : null;
  const combinedError = engineError ?? result?.error ?? null;

  // Boots (or, for interpreted languages, simply marks ready — Pyodide/JSCPP need no upfront init).
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
            : "Unable to initialize the engine";
        setEngineError(message);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // A completed run seeds the scrubber: Run auto-plays from the top, Step just reveals step 0.
  useEffect(() => {
    if (!result) return;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (!result.steps.length) {
      setCurrentStepIndex(-1);
      return;
    }
    setCurrentStepIndex(0);
    if (action === "run") setIsPlaying(true);
  }, [result]);

  useEffect(() => {
    if (currentStep) setActiveLine(currentStep.line || 1);
  }, [currentStep]);

  // Auto-play animates the scrubber through the already-computed trace, honoring breakpoints.
  useEffect(() => {
    if (!isPlaying || !result) return;
    const timer = window.setInterval(() => {
      setCurrentStepIndex(index => {
        const next = index + 1;
        if (next >= result.steps.length) {
          setIsPlaying(false);
          return index;
        }
        if (breakpoints.includes(result.steps[next].line)) setIsPlaying(false);
        return next;
      });
    }, PLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, result, breakpoints]);

  const toggleBreakpoint = (line: number) =>
    setBreakpoints(items =>
      items.includes(line)
        ? items.filter(item => item !== line)
        : [...items, line]
    );

  const changeLanguage = (next: SupportedLanguage) => {
    if (next === language) return;
    setLanguage(next);
    setIsPlaying(false);
    resetEngine();
    compiledKeyRef.current = null;
    setCurrentStepIndex(-1);
    setBreakpoints([]);
    setActiveLine(1);
    const definition = LANGUAGE_DEFINITIONS[next];
    setTemplate(definition.defaultTemplate);
    setCode(definition.sources[definition.defaultTemplate]);
  };

  const selectTemplate = (next: string) => {
    setTemplate(next);
    setIsPlaying(false);
    resetEngine();
    compiledKeyRef.current = null;
    setCurrentStepIndex(-1);
    if (language === "masm8086") {
      // Preserves the original MASM behavior: only the header comment changes, the body does not.
      setCode(source => source.replace(/^;.*$/m, `; ${next}`));
    } else {
      setCode(LANGUAGE_DEFINITIONS[language].sources[next] ?? "");
    }
  };

  const runProgram = async () => {
    pendingActionRef.current = "run";
    compiledKeyRef.current = computeKey();
    const consumedStdin = stdinQueue;
    setStdinQueue("");
    await runCode(language, code, { stdin: consumedStdin });
  };

  const onRun = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (engineBusy || !engineReady) return;
    const key = computeKey();
    const hasFreshStdin = stdinQueue.length > 0;
    if (
      !hasFreshStdin &&
      compiledKeyRef.current === key &&
      result &&
      result.steps.length
    ) {
      setCurrentStepIndex(index =>
        index >= result.steps.length - 1 ? 0 : index
      );
      setIsPlaying(true);
      return;
    }
    void runProgram();
  };

  const onStep = () => {
    if (isPlaying) setIsPlaying(false);
    if (engineBusy || !engineReady) return;
    const key = computeKey();
    const hasFreshStdin = stdinQueue.length > 0;
    if (!hasFreshStdin && compiledKeyRef.current === key && result) {
      setCurrentStepIndex(index =>
        Math.min(result.steps.length - 1, index + 1)
      );
      return;
    }
    pendingActionRef.current = "step";
    compiledKeyRef.current = key;
    const consumedStdin = stdinQueue;
    setStdinQueue("");
    void runCode(language, code, { stdin: consumedStdin });
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
  };

  const onScrub = (index: number) => {
    setIsPlaying(false);
    setCurrentStepIndex(index);
  };

  const memoryBase = parseAddress(memoryReference, 0x1e5);
  const memoryRows = useMemo(() => {
    if (language !== "masm8086") return [];
    const bytes = masmEngine.peekMemory(memoryBase, 10);
    return Array.from({ length: 10 }, (_, index) => ({
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
  const stackBase = parseAddress(stackReference, 0x2fffe);
  const stackRows = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => {
        const address = stackBase + index * 2;
        return {
          address,
          value: `${outputValue(stackWindow.get(address) ?? 0, "hex")}${outputValue(stackWindow.get(address + 1) ?? 0, "hex")}`,
        };
      }),
    [stackBase, stackWindow]
  );

  const registers = toRegisterSnapshot(currentStep?.registers);
  const flags = toFlagRecord(currentStep?.flags);
  const cycles = currentStepIndex >= 0 ? currentStepIndex + 1 : 0;
  const isMasm = language === "masm8086";

  return (
    <section
      className="assembler-studio space-y-6"
      style={{ fontFamily: "Tajawal, sans-serif" }}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 space-y-6">
          <section className={CARD}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className={HEADING}>{copy.source}</h3>
                <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
                  {LANGUAGE_DEFINITIONS[language].label}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  combinedError
                    ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
                    : engineReady
                      ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200"
                      : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                }`}
              >
                {combinedError
                  ? copy.coreError
                  : engineReady
                    ? `${copy.breakpoints}: ${breakpoints.length}`
                    : copy.loading}
              </span>
            </div>
            <SourceEditor
              code={code}
              onChange={setCode}
              language={language}
              activeLine={activeLine}
              onActiveLine={setActiveLine}
              breakpoints={breakpoints}
              onToggleBreakpoint={toggleBreakpoint}
            />
            {result && result.steps.length > 0 && (
              <div className="mt-4">
                <input
                  type="range"
                  min={0}
                  max={result.steps.length - 1}
                  value={Math.max(0, currentStepIndex)}
                  onChange={event => onScrub(Number(event.target.value))}
                  aria-label={copy.trace}
                  className="w-full accent-violet-600"
                />
                <p className="mt-1 text-center font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {Math.max(0, currentStepIndex) + 1} / {result.steps.length}
                </p>
              </div>
            )}
          </section>
          <section className={CARD}>
            <div>
              <h3 className={HEADING}>{copy.terminal}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {copy.terminalHint}
              </p>
            </div>
            <div className="mt-4 h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-[#090a0d] p-4 font-mono text-xs leading-6 text-emerald-300 dark:border-slate-800">
              {currentStep?.stdout && (
                <p className="whitespace-pre-wrap">{currentStep.stdout}</p>
              )}
              <span className="inline-block h-3 w-1.5 animate-pulse bg-emerald-300 align-middle" />
            </div>
            <form
              onSubmit={event => {
                event.preventDefault();
                const entry = stdinInput.trim();
                if (entry) {
                  setStdinQueue(buffer => `${buffer}${entry}\n`);
                  setStdinInput("");
                }
              }}
              className="mt-4 flex gap-2"
            >
              <input
                aria-label={copy.keyboard}
                value={stdinInput}
                onChange={event => setStdinInput(event.target.value)}
                placeholder={copy.keyboard}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
              />
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-400 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              >
                {copy.send}
              </button>
            </form>
          </section>
        </main>
        <aside className="space-y-6">
          <AssemblerToolbar
            copy={{
              controls: copy.controls,
              run: copy.run,
              pause: copy.pause,
              step: copy.step,
              stepBack: copy.back,
              reset: copy.reset,
              cycles: copy.cycles,
              examples: copy.examples,
              prototype: copy.prototype,
              language: copy.language,
            }}
            groups={LANGUAGE_DEFINITIONS[language].groups}
            selectedTemplate={template}
            cycles={cycles}
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
          />
          {isMasm ? (
            <AssemblerRegisters
              registers={registers}
              flags={flags}
              flashTick={currentStepIndex}
              copy={{
                cpu: copy.cpu,
                general: copy.general,
                pointers: copy.pointers,
                segments: copy.segments,
                physical: copy.physical,
                flags: copy.flags,
                on: copy.on,
                off: copy.off,
              }}
            />
          ) : (
            <AssemblerVariables
              variables={currentStep?.variables ?? {}}
              previousVariables={previousStep?.variables ?? null}
              callStack={currentStep?.callStack ?? []}
              copy={{
                variablesTitle: copy.variables,
                callStackTitle: copy.callStack,
                empty: copy.noData,
                name: copy.name,
                type: copy.type,
                value: copy.value,
              }}
            />
          )}
        </aside>
      </div>
      <section className="grid gap-6 xl:grid-cols-3">
        {isMasm && (
          <section className={`${CARD} min-w-0`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className={HEADING}>{copy.memory}</h3>
              <div className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-800">
                {(["hex", "decimal", "ascii"] as const).map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${mode === item ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-100" : "text-slate-500 dark:text-slate-400"}`}
                  >
                    {copy[item]}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {copy.reference}
              </span>
              <input
                aria-label={`${copy.memory} ${copy.reference}`}
                value={memoryReference}
                onChange={event => setMemoryReference(event.target.value)}
                onBlur={event =>
                  setMemoryReference(
                    formatAddress(parseAddress(event.target.value, memoryBase))
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold uppercase text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-[1fr_1fr] bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <span>{copy.address}</span>
                <span>{copy.value}</span>
              </div>
              {memoryRows.map(row => (
                <div
                  key={row.address}
                  className="grid grid-cols-[1fr_1fr] border-t border-slate-100 px-3 py-1.5 font-mono text-xs dark:border-slate-800"
                >
                  <span>{formatAddress(row.address)}</span>
                  <span>{outputValue(row.value, mode)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {isMasm && (
          <AssemblerStack
            reference={stackReference}
            rows={stackRows}
            onReferenceChange={setStackReference}
            copy={{
              stack: copy.stack,
              lifo: copy.lifo,
              empty: copy.empty,
              reference: copy.reference,
              address: copy.address,
            }}
          />
        )}
        <section className={`${CARD} min-w-0 ${isMasm ? "" : "xl:col-span-3"}`}>
          <div className="flex items-center justify-between">
            <h3 className={HEADING}>{copy.trace}</h3>
            <button
              type="button"
              onClick={() => setTraceOpen(value => !value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
            >
              {traceOpen ? copy.collapse : copy.expand}
            </button>
          </div>
          {traceOpen && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <span>{copy.step}</span>
                <span>{copy.instruction}</span>
                <span>{copy.newValue}</span>
              </div>
              {result && result.steps.length ? (
                result.steps
                  .slice(
                    Math.max(0, currentStepIndex - 14),
                    currentStepIndex + 1
                  )
                  .map(step => (
                    <button
                      key={step.stepIndex}
                      type="button"
                      onClick={() => onScrub(step.stepIndex)}
                      className={`grid w-full grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] border-t border-slate-100 px-3 py-2 text-start font-mono text-[11px] dark:border-slate-800 ${step.stepIndex === currentStepIndex ? "bg-violet-50 dark:bg-violet-500/10" : ""}`}
                    >
                      <span>{step.stepIndex.toString().padStart(4, "0")}</span>
                      <span className="truncate">L{step.line}</span>
                      <span className="truncate text-violet-700 dark:text-violet-300">
                        {isMasm && step.registers
                          ? Object.entries(step.registers)
                              .slice(0, 1)
                              .map(([, v]) => v)
                              .join("")
                          : stringifyVariable(
                              Object.values(step.variables)[0]?.value
                            )}
                      </span>
                    </button>
                  ))
              ) : (
                <p className="px-3 py-5 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {engineReady ? copy.awaiting : copy.loading}
                </p>
              )}
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

export default AssemblerStudioCompact;
