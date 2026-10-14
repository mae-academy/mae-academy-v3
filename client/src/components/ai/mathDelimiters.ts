/**
 * remark-math only understands `$...$` and `$$...$$`. Models sometimes emit the LaTeX forms `\(...\)` and
 * `\[...\]`; rewrite those, leaving fenced code blocks and inline code spans untouched.
 *
 * It also treats a one-line `$$x$$` as *inline* math (display math needs `$$` on lines of their own), yet that
 * one-liner is how models usually write an equation, so a line holding only `$$...$$` is expanded to a block.
 */

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const ONE_LINE_DISPLAY = /^\s*\$\$((?:(?!\$\$).)+)\$\$\s*$/;

function rewriteMath(text: string): string {
  return text
    .replace(/(^|[^\\])\\\[([\s\S]+?)\\\]/g, (_m, lead: string, body: string) => `${lead}\n\n$$\n${body.trim()}\n$$\n\n`)
    .replace(/(^|[^\\])\\\(([\s\S]+?)\\\)/g, (_m, lead: string, body: string) => `${lead}$${body.trim()}$`);
}

function rewriteOutsideInlineCode(text: string): string {
  // Odd entries of the split are `inline code` spans.
  return text
    .split(/(`+[^`\n]*`+)/)
    .map((part, index) => (index % 2 === 1 ? part : rewriteMath(part)))
    .join("");
}

export function normalizeMathDelimiters(source: string): string {
  if (!source.includes("\\(") && !source.includes("\\[") && !source.includes("$$")) return source;
  const lines = source.split("\n");
  const out: string[] = [];
  let prose: string[] = [];
  let fence: { char: string; length: number } | null = null;

  const flushProse = () => {
    if (prose.length > 0) out.push(rewriteOutsideInlineCode(prose.join("\n")));
    prose = [];
  };

  for (const line of lines) {
    if (fence) {
      out.push(line);
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      flushProse();
      fence = { char: open[1][0], length: open[1].length };
      out.push(line);
      continue;
    }
    const display = ONE_LINE_DISPLAY.exec(line);
    if (display) prose.push("", "$$", display[1].trim(), "$$", "");
    else prose.push(line);
  }
  flushProse();
  return out.join("\n");
}
