/**
 * Legacy SVG handling. Diagrams are now text-to-image (see SchematicImage), but chats stored before that still hold
 * fenced `xml:svg` blocks. They render as ordinary code blocks; this module only keeps them out of requests sent back
 * to the model, and strips HTML comments from prose. Pure string work.
 */

export const OMITTED_DIAGRAM = "[diagram omitted]";

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

/**
 * Removes HTML comments from the prose of a message (code fences and inline code are left alone, a comment that is
 * still streaming in is hidden too). Raw HTML is never rendered, so without this a model that writes the SVG template's
 * `<!-- Standard: ... -->` header outside the fence would show it to the student as literal text.
 */
export function stripHtmlComments(text: string): string {
  if (!text.includes("<!--")) return text;
  const clean = (segment: string, isTail: boolean): string => {
    // Inline code spans are matched first so a comment quoted in backticks survives.
    let out = segment.replace(/(`+[^`\n]*`+)|<!--[\s\S]*?-->[ \t]*\r?\n?/g, (match, code: string | undefined) => (code ? match : ""));
    if (isTail) out = out.replace(/<!--(?![\s\S]*-->)[\s\S]*$/, "");
    return out;
  };
  let out = "";
  let cursor = 0;
  for (const block of scanFences(text)) {
    out += clean(text.slice(cursor, block.start), false) + text.slice(block.start, block.end);
    cursor = block.end;
  }
  return out + clean(text.slice(cursor), true);
}

function firstToken(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/**
 * Whether a body is an `<svg` document once any XML prolog and leading comments are skipped. The platform's own SVG
 * template opens with a header comment (`<!-- Standard: IEC 60617 | Pitch P = 20 px ... -->`), and models do not
 * always tag the fence, so an untyped block has to be recognised by what it contains, not by its first characters.
 */
function skipPrelude(body: string): { rest: string; hadPrelude: boolean } {
  let rest = body.trimStart();
  let hadPrelude = false;
  for (;;) {
    const skipped = rest.replace(/^(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->)\s*/i, "");
    if (skipped === rest) break;
    rest = skipped;
    hadPrelude = true;
  }
  return { rest, hadPrelude };
}

function bodyIsSvg(body: string): boolean {
  return /^<svg[\s>/]/i.test(skipPrelude(body).rest);
}

/** Whether a finished fence is a diagram: explicit `xml:svg` / `svg`, or an XML-ish/untyped block whose body is an `<svg`. */
export function isSvgFence(language: string | undefined, body: string): boolean {
  const lang = (language ?? "").toLowerCase();
  if (lang === "xml:svg" || lang === "svg") return true;
  if (lang === "" || lang === "xml" || lang === "html") return bodyIsSvg(body);
  return false;
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
