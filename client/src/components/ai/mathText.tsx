import { Fragment, memo } from "react";
import KatexMath from "@/components/ui/KatexMath";

export type MathSegment =
  | { kind: "text"; text: string }
  | { kind: "inline"; math: string }
  | { kind: "display"; math: string };

/**
 * Splits a student's plain message into text and `$...$` / `$$...$$` formulas. Deliberately tiny: a message is text
 * with math and line breaks, never Markdown (no headings, lists or emphasis are interpreted). Currency survives:
 * an opening `$` must be followed by a non-space, the closing one must follow a non-space and not precede a digit,
 * and an unmatched `$` stays literal. `\$` is a literal dollar sign. Pure.
 */
export function splitMath(source: string): MathSegment[] {
  const out: MathSegment[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ kind: "text", text: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\" && source[i + 1] === "$") {
      buffer += "$";
      i += 2;
      continue;
    }
    if (ch === "$" && source[i + 1] === "$") {
      const end = source.indexOf("$$", i + 2);
      const body = end === -1 ? "" : source.slice(i + 2, end);
      if (end !== -1 && body.trim() !== "") {
        flush();
        out.push({ kind: "display", math: body.trim() });
        i = end + 2;
        continue;
      }
    } else if (ch === "$" && i + 1 < source.length && !/\s/.test(source[i + 1])) {
      let end = i + 1;
      let found = -1;
      while (end < source.length) {
        if (source[end] === "\\") {
          end += 2;
          continue;
        }
        if (source[end] === "\n" && source[end + 1] === "\n") break;
        if (source[end] === "$") {
          found = end;
          break;
        }
        end++;
      }
      if (found !== -1 && !/\s/.test(source[found - 1]) && !/\d/.test(source[found + 1] ?? "") && source[found + 1] !== "$") {
        flush();
        out.push({ kind: "inline", math: source.slice(i + 1, found) });
        i = found + 1;
        continue;
      }
    }
    buffer += ch;
    i++;
  }
  flush();
  return out;
}

export function hasMath(source: string): boolean {
  return source.includes("$") && splitMath(source).some((segment) => segment.kind !== "text");
}

/** Text with typeset formulas. KaTeX errors degrade per formula (renderKatexHtml); nothing user-supplied is injected as HTML. */
export const MathText = memo(function MathText({ text }: { text: string }) {
  return (
    <>
      {splitMath(text).map((segment, index) => (
        <Fragment key={index}>
          {segment.kind === "text" ? (
            segment.text
          ) : segment.kind === "inline" ? (
            <span dir="ltr" className="inline-block max-w-full align-middle"><KatexMath math={segment.math} /></span>
          ) : (
            <span dir="ltr" className="my-1 block max-w-full overflow-x-auto overflow-y-hidden text-center"><KatexMath math={segment.math} displayMode /></span>
          )}
        </Fragment>
      ))}
    </>
  );
});
