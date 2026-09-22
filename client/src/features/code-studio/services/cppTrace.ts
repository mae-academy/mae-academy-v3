import type { TraceStep } from "@/features/execution-engine/types";

export interface CppTraceStep {
  lineNumber: number;
  outputChunk?: string;
  isTerminated?: boolean;
}

export interface RemoteOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const OUTPUT_CALL = /\b(?:std\s*::\s*)?(?:cout|cerr|printf|fprintf|puts|putchar|fputs)\b/;

/** Blanks comments and string/char contents' comment markers, preserving line structure. */
function stripComments(source: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inBlock = false;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    const next = source[index + 1];
    if (ch === "\n") {
      lines.push(current);
      current = "";
      quote = null; // unterminated literals never span lines
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        index++;
      }
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === "\\" && next !== undefined && next !== "\n") {
        current += next;
        index++;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "/" && next === "/") {
      while (index + 1 < source.length && source[index + 1] !== "\n") index++;
    } else if (ch === "/" && next === "*") {
      inBlock = true;
      index++;
    } else current += ch;
  }
  lines.push(current);
  return lines;
}

interface Statement {
  lineNumber: number;
  text: string;
}

/** Executable statements inside main(): one per statement, keyed to its first physical line. */
function extractMainStatements(code: string): Statement[] {
  const lines = stripComments(code.replace(/\r/g, ""));
  const mainIndex = lines.findIndex(line => /\bmain\s*\(/.test(line));
  if (mainIndex < 0) return [];

  const statements: Statement[] = [];
  let depth = 0;
  let started = false;
  let parenDepth = 0;
  let pending: Statement | null = null;

  for (let index = mainIndex; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (started && depth <= 0) break;

    if (started && trimmed && !trimmed.startsWith("#")) {
      const isContinuation =
        pending !== null &&
        (parenDepth > 0 ||
          /(<<|,|\+|&&|\|\|)\s*$/.test(pending.text) ||
          /^(<<|\+|&&|\|\||\?|:)/.test(trimmed));
      const bare = trimmed.replace(/[{}\s]/g, "");
      if (isContinuation && pending) {
        pending.text += " " + trimmed;
      } else if (bare) {
        pending = { lineNumber: index + 1, text: trimmed };
        statements.push(pending);
      } else pending = null;
      for (const ch of line) {
        if (ch === "(") parenDepth++;
        else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
      }
    }
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") depth--;
    }
  }
  return statements;
}

/** Newlines a print statement is expected to emit, from `endl`, "\n" and puts()'s implicit one. */
function expectedNewlines(text: string): number {
  if (!OUTPUT_CALL.test(text)) return 0;
  const escapes = (text.match(/\\n/g) ?? []).length;
  const endls = (text.match(/\bendl\b/g) ?? []).length;
  const puts = /\bputs\s*\(/.test(text) ? 1 : 0;
  return escapes + endls + puts;
}

export function buildCppTrace(code: string, outcome: RemoteOutcome): CppTraceStep[] {
  const statements = extractMainStatements(code);
  if (!statements.length) {
    return [{ lineNumber: 1, outputChunk: outcome.stdout, isTerminated: true }];
  }

  const outputLines = outcome.stdout.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const printIndexes = statements
    .map((statement, index) => (OUTPUT_CALL.test(statement.text) ? index : -1))
    .filter(index => index >= 0);
  const lastPrint = printIndexes.at(-1) ?? statements.length - 1;

  let cursor = 0;
  return statements.map((statement, index) => {
    let take = 0;
    if (index === lastPrint) take = outputLines.length - cursor; // remainder (loops, formatting)
    else if (printIndexes.includes(index))
      take = Math.min(expectedNewlines(statement.text), outputLines.length - cursor);
    const chunk = outputLines.slice(cursor, cursor + take).join("");
    cursor += take;
    return {
      lineNumber: statement.lineNumber,
      outputChunk: chunk || undefined,
      isTerminated: index === statements.length - 1 || undefined,
    };
  });
}

/** Converts the reconstructed frames into the unified cumulative-stdout TraceStep contract. */
export function toTraceSteps(
  code: string,
  outcome: RemoteOutcome,
  callFrame = "main"
): TraceStep[] {
  const sourceLines = code.replace(/\r/g, "").split("\n");
  let stdout = "";
  return buildCppTrace(code, outcome).map((frame, index) => {
    if (frame.outputChunk) stdout += frame.outputChunk;
    let visible = stdout;
    if (frame.isTerminated) {
      if (outcome.stderr) visible += (visible && !visible.endsWith("\n") ? "\n" : "") + outcome.stderr;
      visible += `${visible && !visible.endsWith("\n") ? "\n" : ""}[Process exited with code ${outcome.exitCode}]`;
    }
    return {
      stepIndex: index,
      line: frame.lineNumber,
      instruction: (sourceLines[frame.lineNumber - 1] ?? "").trim(),
      callStack: [callFrame],
      variables: {},
      stdout: visible,
    };
  });
}
