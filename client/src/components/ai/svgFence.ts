/**
 * Helpers for the fenced SVG diagrams the model can emit: a block whose info string is `xml:svg`
 * (also accepted: `svg`, or `xml` / `html` / no language when the body starts with `<svg`).
 * Pure string work, shared by the renderer, the streaming pre-pass and the request builder.
 */

export const OMITTED_DIAGRAM = "[diagram omitted]";

/**
 * Info string of the closed stand-in fence that replaces a diagram whose closing fence has not streamed in yet.
 * The random suffix keeps model output from ever producing it, so a finished message cannot get stuck on a placeholder.
 */
export const PENDING_DIAGRAM_LANG = `mae-diagram-pending-${Math.random().toString(36).slice(2, 10)}`;

interface FenceBlock {
  /** Offset of the opening fence line. */
  start: number;
  /** Offset just after the closing fence (end of text when the fence is still open). */
  end: number;
  info: string;
  body: string;
  closed: boolean;
  /** False while the opening line itself is still arriving (no newline after it yet). */
  hasBody: boolean;
}

const OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function scanFences(text: string): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let offset = 0;
  let current: { start: number; char: string; length: number; info: string; bodyStart: number } | null = null;
  const finish = (end: number, bodyEnd: number, closed: boolean) => {
    if (!current) return;
    const hasBody = current.bodyStart <= text.length && current.bodyStart !== -1;
    blocks.push({
      start: current.start,
      end,
      info: current.info,
      body: hasBody ? text.slice(current.bodyStart, Math.max(current.bodyStart, bodyEnd)) : "",
      closed,
      hasBody,
    });
    current = null;
  };

  while (offset <= text.length) {
    const newline = text.indexOf("\n", offset);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(offset, lineEnd).replace(/\r$/, "");
    const next = newline === -1 ? text.length + 1 : newline + 1;

    if (current) {
      const close = CLOSE.exec(line);
      if (close && close[1][0] === current.char && close[1].length >= current.length) {
        // The body excludes the newline that precedes the closing fence.
        finish(lineEnd, Math.max(current.bodyStart, offset - 1), true);
      }
    } else {
      const open = OPEN.exec(line);
      // A backtick fence's info string cannot contain a backtick (that would be inline code).
      if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
        current = { start: offset, char: open[1][0], length: open[1].length, info: open[2].trim(), bodyStart: newline === -1 ? -1 : newline + 1 };
      }
    }
    offset = next;
  }
  finish(text.length, text.length, false);
  return blocks;
}

function firstToken(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** Whether a finished fence is a diagram: explicit `xml:svg` / `svg`, or an XML-ish/untyped block whose body is an `<svg`. */
export function isSvgFence(language: string | undefined, body: string): boolean {
  const lang = (language ?? "").toLowerCase();
  if (lang === "xml:svg" || lang === "svg") return true;
  if (lang === "" || lang === "xml" || lang === "html") return /^\s*<svg[\s>/]/i.test(body);
  return false;
}

/** Same decision for a fence that is still streaming: be generous so that no half-built code block flashes. */
function looksLikeOpenDiagram(block: FenceBlock): boolean {
  const lang = firstToken(block.info);
  if (lang === "xml:svg" || lang === "svg") return true;
  const body = block.body.trimStart();
  const svgStart = body !== "" && ("<svg".startsWith(body.toLowerCase()) || /^<svg[\s>/]/i.test(body));
  if (lang === "" || lang === "xml" || lang === "html") {
    if (lang !== "" && body === "") return true;
    return svgStart;
  }
  // The info string itself may still be arriving: `x`, `xml:`, `xml:sv` ...
  return !block.hasBody && "xml:svg".startsWith(lang);
}

/**
 * Replaces every SVG diagram fence with a short literal, for model turns sent back as history (a diagram is large
 * and the model does not need to re-read its own drawing). An unterminated fence is cut to the end of the text.
 */
export function stripSvgFences(text: string, replacement: string = OMITTED_DIAGRAM): string {
  if (!text.includes("```") && !text.includes("~~~")) return text;
  const svg = scanFences(text).filter((block) => isSvgFence(firstToken(block.info), block.body));
  if (svg.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const block of svg) {
    out += text.slice(cursor, block.start) + replacement;
    cursor = block.end;
  }
  return out + text.slice(cursor);
}

/**
 * While an answer streams, markdown would show an unterminated diagram fence as a code block that grows by the
 * line. Swap that open fence for a closed, empty one in the pending language so the renderer can show a
 * "drawing" placeholder instead. Text with no open diagram fence is returned untouched.
 */
export function markPendingDiagram(text: string): string {
  if (!text.includes("```") && !text.includes("~~~")) return text;
  const blocks = scanFences(text);
  const last = blocks[blocks.length - 1];
  if (!last || last.closed || !looksLikeOpenDiagram(last)) return text;
  return `${text.slice(0, last.start)}\`\`\`${PENDING_DIAGRAM_LANG}\n\`\`\``;
}
