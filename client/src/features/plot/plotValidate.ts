import { PLOT_MAX_CODE_CHARS, PLOT_MAX_CODE_LINES, PlotError } from "./plotProtocol";

/** Modules that are never allowed, matched at the start of an import line. Cheap first check; the AST validator in Python is the thorough one. */
const FORBIDDEN_IMPORT =
  /^\s*(?:import|from)\s+(?:os|sys|subprocess|socket|ctypes|importlib|builtins|shutil|pathlib|urllib|http|requests|micropip|js|pyodide|pyodide_js|pickle|marshal|multiprocessing|threading|asyncio|tempfile|io|inspect|gc|code|codeop|runpy|webbrowser|ftplib|smtplib)\b/m;

/**
 * Fast synchronous prefilter that runs before anything is downloaded: size limits and the most obvious forbidden
 * imports. Returns the refusal message, or null when the script may go on to the AST validator.
 */
export function prefilterPlotCode(code: string): { message: string; line?: number } | null {
  if (code.trim().length === 0) return { message: "The plot script is empty." };
  if (code.length > PLOT_MAX_CODE_CHARS) return { message: `The plot script is too long (${code.length} characters; the limit is ${PLOT_MAX_CODE_CHARS}).` };
  const lines = code.split("\n").length;
  if (lines > PLOT_MAX_CODE_LINES) return { message: `The plot script has too many lines (${lines}; the limit is ${PLOT_MAX_CODE_LINES}).` };
  if (code.includes("\u0000")) return { message: "The plot script contains a null character." };
  const match = FORBIDDEN_IMPORT.exec(code);
  if (match) {
    const line = code.slice(0, match.index + (match[0].length - match[0].trimStart().length)).split("\n").length;
    return { message: `Import of "${match[0].trim().split(/\s+/)[1]}" is not allowed in plot scripts.`, line };
  }
  return null;
}

/** Throws the PlotError the prefilter calls for. */
export function assertPlotCode(code: string): void {
  const refusal = prefilterPlotCode(code);
  if (refusal) throw new PlotError("rejected", refusal.message, refusal.line);
}
