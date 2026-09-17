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
import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "react-simple-code-editor";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import SegmentedControl from "@/components/ui/SegmentedControl";
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
  "Hello World":
    '#include <stdio.h>\nint main() {\n    printf("Hello, MAE Academy!\\n");\n    return 0;\n}\n',
  "Loop Sum":
    '#include <stdio.h>\nint main() {\n    int total = 0;\n    for (int i = 0; i < 5; i++) {\n        total += i;\n    }\n    printf("%d\\n", total);\n    return 0;\n}\n',
};

const LANGUAGE_DEFINITIONS: Record<SupportedLanguage, LanguageDefinition> = {
  masm8086: {
    label: "MASM 8086",
    filename: "program.asm",
    groups: MASM_GROUPS,
    sources: MASM_SOURCES,
    defaultTemplate: "Basic Math & Flags",
  },
  python: {
    label: "Python",
    filename: "script.py",
    groups: PYTHON_GROUPS,
    sources: PYTHON_SOURCES,
    defaultTemplate: "Hello World",
  },
  cpp: {
    label: "C++",
    filename: "main.cpp",
    groups: CPP_GROUPS,
    sources: CPP_SOURCES,
    defaultTemplate: "Hello World",
  },
  c: {
    label: "C",
    filename: "main.c",
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

interface TokenPattern {
  type: string;
  regex: RegExp;
}

const MASM_PATTERNS: TokenPattern[] = [
  { type: "comment", regex: /;.*/ },
  { type: "string", regex: /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/ },
  {
    type: "instruction",
    regex:
      /\b(?:MOV|ADD|SUB|PUSH|POP|INT|CMP|JMP|JZ|JNZ|JE|JNE|JG|JL|JGE|JLE|JA|JB|JAE|JBE|JC|JNC|JO|JNO|JS|JNS|LOOP|LOOPZ|LOOPNZ|LEA|CALL|RET|RETN|RETF|XCHG|HLT|INC|DEC|MUL|IMUL|DIV|IDIV|AND|OR|XOR|NOT|TEST|SHL|SHR|SAL|SAR|ROL|ROR|RCL|RCR|NOP|CLC|STC|CLI|STI)\b/i,
  },
  {
    type: "register",
    regex:
      /\b(?:AX|AH|AL|BX|BH|BL|CX|CH|CL|DX|DH|DL|SI|DI|BP|SP|IP|CS|DS|ES|SS|FS|GS)\b/i,
  },
  {
    type: "directive",
    regex:
      /(?:\.[A-Za-z]+|@[A-Za-z]+|\b(?:DB|DW|DD|DQ|DT|EQU|PROC|ENDP|ASSUME|SEGMENT|ENDS|OFFSET|PTR|MACRO|ENDM|ALIGN|ORG|INCLUDE)\b)/i,
  },
  { type: "number", regex: /\b(?:0x[0-9A-Fa-f]+|[0-9A-Fa-f]+h|\d+b?)\b/i },
];

const PYTHON_PATTERNS: TokenPattern[] = [
  { type: "comment", regex: /#.*/ },
  {
    type: "string",
    regex:
      /"""[\s\S]*?"""|'''[\s\S]*?'''|f?"(?:\\.|[^"\\])*"|f?'(?:\\.|[^'\\])*'/,
  },
  {
    type: "control-flow",
    regex:
      /\b(?:if|elif|else|for|while|try|except|finally|with|as|break|continue|pass|raise|yield|match|case|return)\b/,
  },
  {
    type: "keyword-type",
    regex:
      /\b(?:def|class|import|from|lambda|async|await|global|nonlocal|assert|del|True|False|None|self|cls|int|float|str|bool|list|dict|set|tuple|bytes|object|type|in|is|not|and|or)\b/,
  },
  {
    type: "function",
    regex:
      /\b(?:print|len|range|enumerate|zip|map|filter|sum|min|max|abs|round|open|input|isinstance|issubclass|super|all|any|sorted|reversed|id|hex|bin|oct|chr|ord)\b|\b[a-zA-Z_]\w*(?=\s*\()/,
  },
  {
    type: "number",
    regex:
      /\b(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/,
  },
];

const CPP_PATTERNS: TokenPattern[] = [
  { type: "comment", regex: /\/\/.*|\/\*[\s\S]*?\*\// },
  {
    type: "preprocessor",
    regex:
      /#\s*(?:include|define|undef|ifdef|ifndef|if|else|elif|endif|pragma)\b[^\r\n]*/,
  },
  { type: "string", regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
  {
    type: "control-flow",
    regex:
      /\b(?:if|else|for|while|do|switch|case|default|break|continue|return|goto|try|catch|throw)\b/,
  },
  {
    type: "keyword-type",
    regex:
      /\b(?:int|float|double|char|void|bool|short|long|signed|unsigned|const|static|volatile|struct|enum|union|typedef|auto|class|public|private|protected|virtual|override|final|template|typename|namespace|using|new|delete|operator|sizeof|decltype|constexpr|inline|explicit|friend|nullptr|true|false|size_t|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t)\b/,
  },
  {
    type: "function",
    regex:
      /\b(?:std::cout|std::cin|std::endl|std::cerr|std::vector|std::string|std::map|std::set|std::pair|std::make_pair|printf|scanf|malloc|free|memcpy|memset|strlen|main)\b|\b[a-zA-Z_]\w*(?=\s*\()/,
  },
  {
    type: "number",
    regex:
      /\b(?:0x[0-9a-fA-F]+[uUlL]*|0b[01]+[uUlL]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*)\b/,
  },
];

const C_PATTERNS: TokenPattern[] = [
  { type: "comment", regex: /\/\/.*|\/\*[\s\S]*?\*\// },
  {
    type: "preprocessor",
    regex:
      /#\s*(?:include|define|undef|ifdef|ifndef|if|else|elif|endif|pragma)\b[^\r\n]*/,
  },
  { type: "string", regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
  {
    type: "control-flow",
    regex:
      /\b(?:if|else|for|while|do|switch|case|default|break|continue|return|goto)\b/,
  },
  {
    type: "keyword-type",
    regex:
      /\b(?:int|float|double|char|void|bool|short|long|signed|unsigned|const|static|volatile|struct|enum|union|typedef|auto|sizeof|extern|register|size_t|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|NULL|true|false)\b/,
  },
  {
    type: "function",
    regex:
      /\b(?:printf|scanf|puts|gets|getchar|putchar|malloc|calloc|realloc|free|memcpy|memset|memmove|strcpy|strncpy|strcat|strlen|strcmp|atoi|atof|exit|main)\b|\b[a-zA-Z_]\w*(?=\s*\()/,
  },
  {
    type: "number",
    regex:
      /\b(?:0x[0-9a-fA-F]+[uUlL]*|0b[01]+[uUlL]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*)\b/,
  },
];

const COMPILED_LANGUAGES: Record<
  SupportedLanguage,
  { regex: RegExp; patterns: TokenPattern[] }
> = {
  masm8086: {
    patterns: MASM_PATTERNS,
    regex: new RegExp(
      MASM_PATTERNS.map(p => `(${p.regex.source})`).join("|"),
      "gi"
    ),
  },
  python: {
    patterns: PYTHON_PATTERNS,
    regex: new RegExp(
      PYTHON_PATTERNS.map(p => `(${p.regex.source})`).join("|"),
      "g"
    ),
  },
  cpp: {
    patterns: CPP_PATTERNS,
    regex: new RegExp(
      CPP_PATTERNS.map(p => `(${p.regex.source})`).join("|"),
      "g"
    ),
  },
  c: {
    patterns: C_PATTERNS,
    regex: new RegExp(
      C_PATTERNS.map(p => `(${p.regex.source})`).join("|"),
      "g"
    ),
  },
};

function getClassForTokenType(type: string): string {
  switch (type) {
    case "comment":
      return "syntax-comment";
    case "string":
      return "syntax-string";
    case "control-flow":
    case "instruction":
      return "syntax-control-flow";
    case "keyword-type":
    case "directive":
      return "syntax-keyword-type";
    case "register":
    case "function":
      return "syntax-function";
    case "number":
      return "syntax-literal-number";
    case "preprocessor":
      return "syntax-preprocessor";
    default:
      return "";
  }
}

function tokenizeLine(
  text: string,
  language: SupportedLanguage
): Array<{ text: string; className?: string }> {
  if (!text) return [{ text: " " }];

  const trimmed = text.trim();
  if (language === "masm8086" && trimmed.startsWith(";")) {
    return [{ text, className: "syntax-comment" }];
  }
  if (language === "python" && trimmed.startsWith("#")) {
    return [{ text, className: "syntax-comment" }];
  }
  if ((language === "cpp" || language === "c") && trimmed.startsWith("//")) {
    return [{ text, className: "syntax-comment" }];
  }

  const langConfig =
    COMPILED_LANGUAGES[language] || COMPILED_LANGUAGES.masm8086;
  const regex = new RegExp(langConfig.regex.source, langConfig.regex.flags);
  const result: Array<{ text: string; className?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ text: text.slice(lastIndex, match.index) });
    }

    let matchedType = "";
    for (let i = 0; i < langConfig.patterns.length; i++) {
      if (match[i + 1] !== undefined) {
        matchedType = langConfig.patterns[i].type;
        break;
      }
    }

    result.push({
      text: match[0],
      className: matchedType ? getClassForTokenType(matchedType) : undefined,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push({ text: text.slice(lastIndex) });
  }

  return result.length > 0 ? result : [{ text: " " }];
}

function SyntaxLine({
  text,
  language,
}: {
  text: string;
  language: SupportedLanguage;
}) {
  const tokens = tokenizeLine(text, language);
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} className={token.className}>
          {token.text}
        </span>
      ))}
    </>
  );
}

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
  const lines = code.split("\n");
  const lineAt = (offset: number) => code.slice(0, offset).split("\n").length;
  const lineAtCursor = (target: EventTarget | null) =>
    lineAt(target instanceof HTMLTextAreaElement ? target.selectionStart : 0);

  return (
    <div
      className="relative flex-1 min-h-0 overflow-auto bg-[#f8fbff] dark:bg-[#07080a] select-text"
      dir="ltr"
    >
      {/* Code Gutter (Line numbers & Breakpoint triggers) */}
      <div className="absolute start-0 top-0 z-20 w-13 py-2 font-mono text-[12px] leading-7 bg-slate-100/80 dark:bg-[#090a0d]/90 border-r border-slate-200 dark:border-[#1a1d24] select-none pointer-events-auto">
        {lines.map((_, index) => {
          const line = index + 1;
          const isCurrent = activeLine === line;
          const hasBp = breakpoints.includes(line);
          return (
            <div
              key={line}
              className={`grid grid-cols-[18px_1fr] items-center px-1 text-slate-400 dark:text-slate-500 h-7 ${isCurrent
                ? "bg-violet-500/20 text-violet-700 dark:text-violet-300 font-medium"
                : "font-normal"
                }`}
            >
              <button
                type="button"
                aria-label={`Toggle breakpoint on line ${line}`}
                onClick={() => onToggleBreakpoint(line)}
                className="flex items-center justify-center cursor-pointer"
              >
                {hasBp ? (
                  <span className="block h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs" />
                ) : (
                  <span className="block h-2.5 w-2.5 rounded-full border border-transparent hover:border-slate-400 dark:hover:border-slate-500" />
                )}
              </button>
              <span className="text-end pe-1.5 tabular-nums font-normal">
                {line.toString().padStart(2, "0")}
              </span>
            </div>
          );
        })}
      </div>

      {/* Editor Surface */}
      <div className="ps-13">
        <Editor
          value={code}
          onValueChange={onChange}
          highlight={(source: string) => (
            <>
              {source.split("\n").map((line: string, index: number) => {
                const isCurrent = activeLine === index + 1;
                return (
                  <div
                    key={`${index}-${line}`}
                    className={`block min-h-7 px-3 font-normal ${isCurrent
                      ? "border-s-2 border-violet-500 bg-violet-100/40 dark:bg-violet-500/15 text-slate-900 dark:text-white font-normal"
                      : "border-s-2 border-transparent text-slate-800 dark:text-slate-200 font-normal"
                      }`}
                  >
                    <SyntaxLine text={line || " "} language={language} />
                  </div>
                );
              })}
            </>
          )}
          padding={8}
          onClick={event => onActiveLine(lineAtCursor(event.target))}
          onKeyUp={event => onActiveLine(lineAtCursor(event.target))}
          style={{
            minHeight: "100%",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12.5,
            lineHeight: "1.75rem",
            whiteSpace: "pre",
            position: "relative",
            zIndex: 1,
            fontWeight: 400,
          }}
          textareaClassName="!ps-3 !outline-none !caret-violet-500 !font-normal"
        />
      </div>
    </div>
  );
}

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
  const initialCode = initialDef.sources[initialDef.defaultTemplate] ?? MASM_PROGRAM;
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

  const compiledKeyRef = useRef<string | null>(null);
  const pendingActionRef = useRef<"run" | "step" | "instant" | null>(null);
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
  const combinedError = engineError ?? result?.error ?? null;
  const isMasm = language === "masm8086";
  const totalSteps = result?.steps.length ?? 0;

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
    const intervalMs = Math.max(25, Math.round(BASE_PLAY_INTERVAL_MS / multiplier));

    const timer = window.setInterval(() => {
      setCurrentStepIndex(index => {
        const next = index + 1;
        if (next >= result.steps.length) {
          setIsPlaying(false);
          return index;
        }
        if (breakpoints.includes(result.steps[next].line)) {
          setIsPlaying(false);
          toast.info(`Paused at breakpoint on line ${result.steps[next].line}`);
        }
        return next;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
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
    let nextSrc = "";
    if (language === "masm8086") {
      nextSrc = code.replace(/^;.*$/m, `; ${next}`);
    } else {
      nextSrc = LANGUAGE_DEFINITIONS[language].sources[next] ?? "";
    }
    setCode(nextSrc);
    setCodeHistory(prev => [...prev, nextSrc]);
    setHistoryIndex(prev => prev + 1);
    toast.success(`Loaded example: ${next}`);
  };

  const runProgram = async (isInstant = false) => {
    pendingActionRef.current = isInstant ? "instant" : "run";
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

      {/* ===================================================================== */}
      {/* 2. 4-QUADRANT IDE SPLIT                                               */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 flex-1 min-h-0 overflow-hidden">
        {/* ================================================================= */}
        {/* QUADRANT 1 (Left Half): Code Editor (macOS Window Frame)          */}
        {/* ================================================================= */}
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

        {/* ================================================================= */}
        {/* Right Half: Quadrants 2 & 3 (45% / 55% Split)                     */}
        {/* ================================================================= */}
        <div className="flex flex-col gap-2.5 h-full min-h-0 overflow-hidden">
          {/* =============================================================== */}
          {/* QUADRANT 2 (Top Right): Terminal Window (Height: 45%)            */}
          {/* =============================================================== */}
          <section className="h-[45%] shrink-0 flex flex-col rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12] overflow-hidden shadow-xs">
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

            {/* Deep Black Monospace Output Screen */}
            <div
              ref={terminalScrollRef}
              className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-xs text-slate-100 leading-relaxed bg-[#050608] select-text"
            >
              <div className="text-slate-600 mb-2 select-none text-[11px]">
                [Runtime: {LANGUAGE_DEFINITIONS[language].label} // stdout]
              </div>
              {engineBusy ? (
                <div className="text-violet-400 italic flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-violet-500 animate-ping" />
                  Executing program...
                </div>
              ) : currentStep?.stdout ? (
                <p className="whitespace-pre-wrap text-slate-100 font-mono">
                  {currentStep.stdout}
                </p>
              ) : combinedError ? (
                <div className="text-[#F43F5E] italic font-sans text-xs">
                  Execution stopped. Check diagnostics below.
                </div>
              ) : (
                <div className="text-slate-600 italic">
                  Output console ready. Click &apos;Run&apos; to execute.
                </div>
              )}
              {!combinedError && (
                <span className="inline-block h-3.5 w-2 bg-violet-400 animate-pulse ms-1 align-middle" />
              )}
            </div>

            {/* Interactive Keyboard Input Bar */}
            <form
              onSubmit={event => {
                event.preventDefault();
                const entry = stdinInput.trim();
                if (entry) {
                  setStdinQueue(buffer => `${buffer}${entry}\n`);
                  setStdinInput("");
                  toast.success(`Queued stdin: "${entry}"`);
                }
              }}
              className="flex items-center gap-1.5 p-1.5 border-t border-[#1a1d24] bg-[#090a0d] shrink-0"
            >
              <span className="font-mono text-xs font-bold text-violet-400 ps-2">
                &gt;
              </span>
              <input
                aria-label="Terminal keyboard entry"
                value={stdinInput}
                onChange={event => setStdinInput(event.target.value)}
                placeholder="Keyboard entry (stdin buffer)…"
                className="flex-1 min-w-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-100 placeholder-slate-600 outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md bg-[#13161c] border border-[#1a1d24] px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-[#1b2028] hover:text-white transition cursor-pointer"
              >
                <CornerDownLeft className="h-3 w-3" />
                <span>Queue</span>
              </button>
            </form>
          </section>

          {/* =============================================================== */}
          {/* PERSISTENT ERROR DIAGNOSTICS BANNER (Between Terminal & Tabs)    */}
          {/* =============================================================== */}
          {combinedError && (
            <div className="shrink-0 rounded-xl border border-[#F43F5E]/30 bg-rose-500/10 p-3 text-xs flex items-start gap-2.5 shadow-xs font-sans">
              <span className="h-2 w-2 rounded-full bg-[#F43F5E] shrink-0 mt-1" />
              <div className="flex-1 min-w-0 font-sans">
                <span className="font-bold uppercase tracking-wider text-[10.5px] text-[#F43F5E] block mb-1 font-sans">
                  DIAGNOSTICS / EXECUTION ERROR
                </span>
                <div className="font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-rose-900 dark:text-rose-200 font-normal">
                  {formatDiagnostic(combinedError)}
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* QUADRANT 3 (Bottom Right): State Inspector Tabs                 */}
          {/* =============================================================== */}
          <section className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200/90 bg-white/90 dark:border-white/[0.08] dark:bg-[#08080A] overflow-hidden shadow-xs">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full flex flex-col min-h-0"
            >
              {/* Tab Header with Full-Width Inspector Tabs */}
              <div className="w-full px-2 py-1.5 border-b border-slate-200/90 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#08080A] shrink-0">
                <SegmentedControl
                  options={[
                    {
                      label: isMasm ? "Registers & Flags" : "Variables View",
                      value: "state",
                      icon: <Cpu className="h-4 w-4" />,
                    },
                    {
                      label: "Execution Trace",
                      value: "trace",
                      icon: <ListOrdered className="h-4 w-4" />,
                    },
                    {
                      label: "Stack",
                      value: "stack",
                      icon: <Layers className="h-4 w-4" />,
                    },
                    {
                      label: "Main Memory",
                      value: "memory",
                      icon: <Database className="h-4 w-4" />,
                    },
                  ]}
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
                              <span className={`block text-[10px] font-bold uppercase tracking-wide ${
                                isSeg
                                  ? "text-violet-600 dark:text-violet-400"
                                  : "text-slate-600 dark:text-slate-300"
                              }`}>
                                {reg}
                              </span>
                              <span className={`font-mono text-xs font-semibold block truncate ${
                                isSeg
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
                              className={`rounded-lg border px-2 py-1.5 text-center transition ${
                                active
                                  ? "border-violet-500 bg-violet-100/80 text-violet-950 dark:border-violet-400/60 dark:bg-violet-950/50 dark:text-violet-100 shadow-xs"
                                  : "border-slate-200 bg-slate-50/60 text-slate-500 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-400"
                              }`}
                            >
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    active
                                      ? "bg-violet-600 shadow-[0_0_6px_rgba(124,58,237,0.7)]"
                                      : "bg-slate-300 dark:bg-slate-700"
                                  }`}
                                />
                                <span className={`font-mono text-xs font-bold ${
                                  active
                                    ? "text-violet-950 dark:text-violet-100"
                                    : "text-slate-700 dark:text-slate-300"
                                }`}>
                                  {flag}
                                </span>
                              </div>
                              <span className={`font-mono text-xs font-bold block ${
                                active
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
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      spDelta < 0
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
        </div>
      </div>
    </div>
  );
}

export const CodeStudio = AssemblerStudio;
export default AssemblerStudio;
