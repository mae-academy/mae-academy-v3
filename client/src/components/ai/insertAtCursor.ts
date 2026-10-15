import type { MathKey } from "./mathKeyboardData";

/** Wrap an inserted template in `$…$` when the caret is not already inside a math span, so the chat renders and the model reads it as math. */
export const WRAP_IN_DOLLARS = true;

export interface InsertResult {
  value: string;
  caretStart: number;
  caretEnd: number;
}

export interface InsertOptions {
  wrap?: boolean;
  maxChars?: number;
}

/** True when `caret` sits inside an unclosed `$…$` or `$$…$$` span. Escaped `\$` is ignored; `$$` opens/closes display math. */
export function isInsideMath(value: string, caret: number): boolean {
  let state: "none" | "inline" | "display" = "none";
  const end = Math.min(caret, value.length);
  for (let i = 0; i < end; i++) {
    const ch = value[i];
    if (ch === "\\") {
      i++; // skips the escaped character (\$ included)
      continue;
    }
    if (ch !== "$") continue;
    if (value[i + 1] === "$" && i + 1 < end) {
      state = state === "none" ? "display" : "none";
      i++;
    } else if (state === "inline") {
      state = "none";
    } else if (state === "none") {
      state = "inline";
    }
  }
  return state !== "none";
}

/**
 * Inserts a key at the selection. Returns the new text and the selection to restore, or `null` when the result would exceed `maxChars`.
 * - A key with a first parameter selects its placeholder (or sits in its empty brace); an existing selection is moved into that
 *   parameter and the caret lands after the group's closing character.
 * - A symbol key replaces the selection and leaves the caret after itself.
 * - Outside math the template is wrapped in `$…$`; the caret stays inside the delimiters so typing continues the formula.
 */
export function insertAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: Pick<MathKey, "latex" | "selStart" | "selEnd">,
  options: InsertOptions = {},
): InsertResult | null {
  const { wrap = WRAP_IN_DOLLARS, maxChars } = options;
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, value.length));
  const end = Math.min(value.length, Math.max(selectionStart, selectionEnd));
  const selected = value.slice(start, end);
  const { latex, selStart, selEnd } = key;
  const hasParam = selStart !== undefined && selEnd !== undefined;

  let body = latex;
  let caretStart = latex.length;
  let caretEnd = latex.length;
  if (hasParam && selected.length > 0) {
    body = latex.slice(0, selStart) + selected + latex.slice(selEnd);
    const afterParam = selStart + selected.length;
    caretStart = caretEnd = afterParam + (/^[})\]|]/.test(latex.slice(selEnd)) ? 1 : 0);
  } else if (hasParam) {
    caretStart = selStart;
    caretEnd = selEnd;
  }

  const delimiter = wrap && !isInsideMath(value, start) ? "$" : "";
  const next = value.slice(0, start) + delimiter + body + delimiter + value.slice(end);
  if (maxChars !== undefined && next.length > maxChars) return null;
  return { value: next, caretStart: start + delimiter.length + caretStart, caretEnd: start + delimiter.length + caretEnd };
}
