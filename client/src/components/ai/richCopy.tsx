import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import katex from "katex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { copyText } from "./CodeBlock";
import { normalizeMathDelimiters } from "./mathDelimiters";
import { stripHtmlComments } from "./svgFence";

/**
 * Rich clipboard for assistant messages: `text/html` carries real MathML in place of every `$...$` / `$$...$$`
 * formula (so word processors that read MathML get equations, not dollar signs) and `text/plain` carries the clean
 * Markdown/LaTeX source for editors and terminals. Only MathML from KaTeX ever reaches the HTML (KaTeX escapes its
 * input), and everything else is produced by react-markdown, which never emits raw HTML from the message.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** KaTeX's MathML for one formula, with the `<annotation>` (the raw LaTeX) and the `<semantics>` wrapper removed. */
export function latexToMathMl(latex: string, display: boolean): string {
  let html: string;
  try {
    html = katex.renderToString(latex, { output: "mathml", displayMode: display, throwOnError: false });
  } catch {
    return escapeHtml(latex);
  }
  const math = /<math[\s\S]*<\/math>/.exec(html)?.[0];
  if (!math || math.includes("katex-error")) return escapeHtml(latex);
  // The annotation would paste as a second copy of the LaTeX when a consumer ignores MathML.
  return math.replace(/<annotation[\s\S]*?<\/annotation>/g, "").replace(/<\/?semantics>/g, "");
}

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : ""))
    .join("");
}

const mathClass = (className?: string) => className?.includes("language-math") ?? false;

const components = {
  // remark-math emits <code class="language-math math-inline|math-display">; display math arrives wrapped in <pre>.
  code({ className, children }: { className?: string; children?: ReactNode }) {
    if (mathClass(className)) {
      const display = className?.includes("math-display") ?? false;
      return <span dangerouslySetInnerHTML={{ __html: latexToMathMl(textOf(children).trim(), display) }} />;
    }
    return <code className={className}>{children}</code>;
  },
  pre({ children }: { children?: ReactNode }) {
    const only = Children.toArray(children)[0];
    if (isValidElement<{ className?: string }>(only) && mathClass(only.props.className)) return <div style={{ margin: "0.6em 0" }}>{children}</div>;
    return <pre>{children}</pre>;
  },
  // Raw HTML in a message was never rendered in the chat; keep it inert here too.
  a({ href, children }: { href?: string; children?: ReactNode }) {
    return /^(https?:|mailto:)/i.test(href ?? "") ? <a href={href}>{children}</a> : <>{children}</>;
  },
  img({ alt }: { alt?: string }) {
    return <>{alt ?? ""}</>;
  },
};

/** The message as an HTML fragment with MathML equations. */
export function markdownToMathHtml(markdown: string): string {
  const source = normalizeMathDelimiters(stripHtmlComments(markdown));
  const html = renderToStaticMarkup(
    <div>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} components={components}>
        {source}
      </ReactMarkdown>
    </div>,
  );
  // Dev builds tag every element with its source location (data-loc); that has no place in a pasted document.
  return html.replace(/\sdata-loc="[^"]*"/g, "");
}

/** Whether the browser can write several MIME types at once (Chrome, Edge, Safari, recent Firefox). */
export function canWriteRichClipboard(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function" && typeof ClipboardItem !== "undefined";
}

/**
 * Copies `markdown` as HTML-with-MathML plus plain text. Falls back to plain text when the multi-type clipboard is
 * unavailable or refused. Resolves true when something was copied.
 */
export async function copyRichMessage(markdown: string): Promise<boolean> {
  if (canWriteRichClipboard() && markdown.includes("$")) {
    try {
      const html = markdownToMathHtml(markdown);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([markdown], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // fall through to plain text
    }
  }
  return copyText(markdown);
}
