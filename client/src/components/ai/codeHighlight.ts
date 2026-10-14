/**
 * Syntax highlighting for code blocks without a new dependency: C/C++/Arduino and Python use the Lezer parsers that
 * already ship with the CodeMirror packages (loaded on demand, so they stay out of the page's main chunk);
 * MATLAB and a few other languages use a tiny hand-rolled tokenizer; anything else, or any failure, is plain text.
 * Token classes are Lezer's `classHighlighter` names (`tok-keyword`, `tok-string`, ...), styled in index.css.
 */

export interface HighlightSpan {
  text: string;
  /** Space separated `tok-*` classes; empty for plain text. */
  className: string;
}

/** Highlighting a huge block would block the main thread for little gain. */
export const MAX_HIGHLIGHT_CHARS = 20_000;

type Engine = "cpp" | "python" | "matlab" | "clike" | "hash" | "asm";

const ENGINE_BY_LANGUAGE: Readonly<Record<string, Engine>> = {
  cpp: "cpp", "c++": "cpp", cxx: "cpp", cc: "cpp", hpp: "cpp", c: "cpp", h: "cpp", arduino: "cpp", ino: "cpp",
  python: "python", py: "python",
  matlab: "matlab", m: "matlab", octave: "matlab",
  javascript: "clike", js: "clike", jsx: "clike", typescript: "clike", ts: "clike", tsx: "clike", java: "clike", rust: "clike", go: "clike",
  verilog: "clike", systemverilog: "clike", sv: "clike", csharp: "clike", cs: "clike",
  bash: "hash", sh: "hash", shell: "hash", zsh: "hash", yaml: "hash", yml: "hash",
  asm: "asm", assembly: "asm", masm: "asm", nasm: "asm", masm8086: "asm",
};

/** Which highlighter handles a fence info string, or null for plain text. */
export function engineForLanguage(language: string | undefined | null): Engine | null {
  const key = (language ?? "").trim().toLowerCase();
  return Object.hasOwn(ENGINE_BY_LANGUAGE, key) ? ENGINE_BY_LANGUAGE[key] : null;
}

/* ------------------------- hand-rolled tokenizer ------------------------- */

interface Profile {
  line: readonly string[];
  block?: readonly [string, string];
  keywords: ReadonlySet<string>;
  /** MATLAB: a quote right after an identifier, `)`, `]`, `'` or `.` is a transpose, not a string. */
  transpose?: boolean;
}

const words = (list: string) => new Set(list.split(" "));

const PROFILES: Readonly<Record<Exclude<Engine, "cpp" | "python">, Profile>> = {
  matlab: {
    line: ["%", "#"],
    transpose: true,
    keywords: words("function end if elseif else for while switch case otherwise break continue return try catch global persistent classdef properties methods true false"),
  },
  clike: {
    line: ["//"],
    block: ["/*", "*/"],
    keywords: words("if else for while do switch case default break continue return function const let var class struct enum interface extends implements import export from new this super static public private protected void int float double char bool boolean string true false null undefined fn let mut pub use mod impl match async await module endmodule input output wire reg assign always begin end posedge negedge"),
  },
  hash: { line: ["#"], keywords: words("if then else elif fi for while do done case esac function in echo export true false null") },
  asm: { line: [";"], keywords: new Set<string>() },
};

const isWordChar = (ch: string | undefined) => ch !== undefined && /[A-Za-z0-9_]/.test(ch);

function push(spans: HighlightSpan[], text: string, className: string) {
  if (!text) return;
  const last = spans[spans.length - 1];
  if (last && last.className === className) last.text += text;
  else spans.push({ text, className });
}

/** Comments, strings, numbers and keywords; everything else stays plain. Never throws and always reproduces the input exactly. */
export function tokenizeSimple(code: string, profile: Profile): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i, i + 2);
    const lineMarker = profile.line.find((marker) => code.startsWith(marker, i));
    if (lineMarker) {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push(spans, code.slice(i, stop), "tok-comment");
      i = stop;
      continue;
    }
    if (profile.block && rest === profile.block[0]) {
      const end = code.indexOf(profile.block[1], i + 2);
      const stop = end === -1 ? code.length : end + profile.block[1].length;
      push(spans, code.slice(i, stop), "tok-comment");
      i = stop;
      continue;
    }
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let isString = true;
      if (ch === "'" && profile.transpose) {
        const before = code[i - 1];
        isString = !(isWordChar(before) || before === ")" || before === "]" || before === "'" || before === ".");
      }
      if (isString) {
        let j = i + 1;
        while (j < code.length && code[j] !== ch && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
        const stop = Math.min(code.length, code[j] === ch ? j + 1 : j);
        push(spans, code.slice(i, stop), "tok-string");
        i = stop;
        continue;
      }
    }
    if (/[0-9]/.test(ch) && !isWordChar(code[i - 1])) {
      const match = /^(?:0x[0-9a-fA-F]+|0b[01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(code.slice(i));
      if (match) {
        push(spans, match[0], "tok-number");
        i += match[0].length;
        continue;
      }
    }
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(code.slice(i, i + 64))!;
      push(spans, match[0], profile.keywords.has(match[0]) ? "tok-keyword" : "");
      i += match[0].length;
      continue;
    }
    push(spans, ch, "");
    i += 1;
  }
  return spans;
}

/* ----------------------------- lezer engines ----------------------------- */

interface LezerParser {
  parse(input: string): unknown;
}

/** The dynamic imports, injectable so the failure path is testable. */
export interface HighlightLoaders {
  lezer(): Promise<{ highlightCode: (...args: any[]) => void; classHighlighter: unknown }>;
  parser(engine: "cpp" | "python"): Promise<LezerParser>;
}

export const defaultLoaders: HighlightLoaders = {
  lezer: () => import("@lezer/highlight") as unknown as ReturnType<HighlightLoaders["lezer"]>,
  parser: async (engine) =>
    engine === "cpp" ? (await import("@codemirror/lang-cpp")).cppLanguage.parser : (await import("@codemirror/lang-python")).pythonLanguage.parser,
};

/**
 * Highlights `code` for a fence language. Resolves to spans whose text concatenates back to `code`, or null when
 * the language is unknown, the block is too large, a chunk fails to load, or the parser throws (render plain text then).
 */
export async function highlightToSpans(code: string, language: string | undefined | null, loaders: HighlightLoaders = defaultLoaders): Promise<HighlightSpan[] | null> {
  const engine = engineForLanguage(language);
  if (!engine || !code || code.length > MAX_HIGHLIGHT_CHARS) return null;
  try {
    if (engine !== "cpp" && engine !== "python") return tokenizeSimple(code, PROFILES[engine]);
    const [lezer, parser] = await Promise.all([loaders.lezer(), loaders.parser(engine)]);
    const tree = parser.parse(code);
    const spans: HighlightSpan[] = [];
    lezer.highlightCode(
      code,
      tree,
      lezer.classHighlighter,
      (text: string, classes: string) => push(spans, text, classes),
      () => push(spans, "\n", ""),
    );
    // Trust the result only if it reproduces the source; otherwise plain text is safer than a garbled block.
    return spans.map((span) => span.text).join("") === code ? spans : null;
  } catch {
    return null;
  }
}
