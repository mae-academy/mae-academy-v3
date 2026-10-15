import { splitMath } from "./mathText";

/**
 * Pure value model of the composer: the editor's content is text plus inline formulas, and everywhere else in the app it is one
 * string with `$…$` / `$$…$$` delimiters. These functions convert both ways and never touch the DOM.
 */

/** Zero-width space: padding text nodes around a formula so the caret always has a text position beside it. Never serialized. */
export const ZWSP = "​";

export type ComposerSegment =
  | { kind: "text"; text: string }
  | { kind: "math"; latex: string; display: boolean };

/** Splits a message string into text and formula segments with the same rules as the chat bubble (`splitMath`). */
export function parseComposerValue(source: string): ComposerSegment[] {
  return splitMath(source).map((segment): ComposerSegment =>
    segment.kind === "text" ? segment : { kind: "math", latex: segment.math, display: segment.kind === "display" },
  );
}

/** Removes the padding characters and normalises non-breaking spaces (the browser inserts them for a trailing space). */
export function cleanText(text: string): string {
  return text.replace(/​/g, "").replace(/ /g, " ");
}

const nonEmptyMath = (segments: ComposerSegment[]) => segments.filter((s): s is Extract<ComposerSegment, { kind: "math" }> => s.kind === "math" && s.latex.trim() !== "");

/**
 * Joins segments back into the wire string. Empty formulas vanish. Two things keep the result parseable by `splitMath`:
 * a space between adjacent formulas (`$a$$b$` would read as display math) and after a formula that precedes a digit (`$x$2`
 * looks like currency). If a literal `$` in the text still changes how the string parses, every literal `$` is escaped as `\$`.
 */
export function serializeSegments(segments: ComposerSegment[]): string {
  const build = (escapeDollars: boolean) => {
    let out = "";
    let afterMath = false;
    for (const segment of segments) {
      if (segment.kind === "text") {
        let text = cleanText(segment.text);
        if (escapeDollars) text = text.replace(/\$/g, "\\$");
        if (text === "") continue;
        if (afterMath && /^\d/.test(text)) out += " ";
        out += text;
        afterMath = false;
        continue;
      }
      const latex = segment.latex.trim();
      if (latex === "") continue;
      if (afterMath) out += " ";
      const delimiter = segment.display ? "$$" : "$";
      out += delimiter + latex + delimiter;
      afterMath = true;
    }
    return out;
  };

  const expected = nonEmptyMath(segments);
  const matches = (out: string) => {
    const parsed = nonEmptyMath(parseComposerValue(out));
    return parsed.length === expected.length && parsed.every((m, i) => m.latex === expected[i].latex.trim() && m.display === expected[i].display);
  };
  const plain = build(false);
  if (matches(plain)) return plain;
  return build(true);
}

/** Round trip of a wire string through the editor model: what `getValue()` returns right after `setValue(source)`. */
export function canonicalValue(source: string): string {
  return serializeSegments(parseComposerValue(source));
}

/** A message has content when it holds non-whitespace text or a non-empty formula. */
export function hasComposerContent(source: string): boolean {
  return source.trim().length > 0;
}

const PLACEHOLDER_RE = /\\placeholder(\[[^\]]*\])?\{[^{}]*\}/;

/** The template as it will serialize while every box is still empty (for the length limit and the fallback chip). */
export function stripPlaceholders(template: string): string {
  return template.replace(new RegExp(PLACEHOLDER_RE.source, "g"), "");
}

/** True when `template` has at least one box for the caret. */
export function hasPlaceholder(template: string): boolean {
  return PLACEHOLDER_RE.test(template);
}

/** Selected plain text that may be carried into a formula's first box: short, one line, no LaTeX syntax of its own. */
export function isMovableSelection(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 80 && !/[\\${}%#&~^_\n]/.test(trimmed);
}

/**
 * How many `moveToNextPlaceholder` from the start of the formula reach the box that is written first. MathLive visits a superscript box
 * before the subscript one, so for `_{□}^{□}` (integral, sum, product) the lower limit, written first, is the second stop.
 */
export function stepsToFirstBox(template: string): number {
  return /_\{\\placeholder\{\}\}\^\{\\placeholder\{\}\}/.test(template) ? 2 : 1;
}

/** Puts `selected` into the first box of `template` (and leaves the other boxes empty). */
export function fillFirstPlaceholder(template: string, selected: string): string {
  return template.replace(PLACEHOLDER_RE, () => selected.trim());
}
