import { Children, Component, isValidElement, memo, useMemo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { KatexMath } from "@/components/ui/KatexMath";
import { CodeBlock } from "./CodeBlock";
import { normalizeMathDelimiters } from "./mathDelimiters";
import { SchematicDiagram, SchematicPending } from "./SchematicDiagram";
import { PENDING_SCHEMATIC_LANG, markPendingSchematic, stripHtmlComments } from "./svgFence";

const REMARK_PLUGINS = [remarkGfm, remarkMath];
/** Only these schemes may be linked; everything else (javascript:, data:, ...) renders as plain text. */
const SAFE_LINK = /^(https?:|mailto:)/i;

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

type CodeProps = { className?: string; children?: ReactNode };

/** remark-math emits `<code class="language-math math-inline|math-display">`; fenced code is `<pre><code class="language-x">`. */
const components: Components = {
  code({ className, children }: CodeProps) {
    if (className?.includes("language-math")) {
      return <KatexMath math={textOf(children).trim()} block={className.includes("math-display")} />;
    }
    return <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.875em] text-violet-700 dark:bg-white/[0.08] dark:text-violet-200">{children}</code>;
  },
  pre({ children }) {
    const child = Children.toArray(children)[0] as ReactElement<CodeProps> | undefined;
    const className = child && isValidElement(child) ? child.props.className ?? "" : "";
    const text = textOf(child && isValidElement(child) ? child.props.children : children).replace(/\n$/, "");
    if (className.includes("language-math")) {
      return (
        <div dir="ltr" className="my-3 overflow-x-auto py-1 text-center">
          <KatexMath math={text.trim()} block />
        </div>
      );
    }
    // `:` stays in the language name so a legacy `xml:svg` fence is just an ordinary code block.
    const language = /language-([\w+#.:-]+)/.exec(className)?.[1];
    if (language === PENDING_SCHEMATIC_LANG) return <SchematicPending />;
    if (language?.toLowerCase() === "schematic") return <SchematicDiagram text={text} />;
    return <CodeBlock code={text} language={language} />;
  },
  a({ href, children }) {
    if (!href || !SAFE_LINK.test(href)) return <span>{children}</span>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline decoration-blue-600/40 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/40">
        {children}
      </a>
    );
  },
  // Remote images would be an unprompted network request to a model-chosen host; show the alt text instead.
  img: ({ alt }) => <span>{alt}</span>,
  p: ({ children }) => <p dir="auto" className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul dir="auto" className="my-2 list-disc space-y-1 ps-6 marker:text-slate-400">{children}</ul>,
  ol: ({ children }) => <ol dir="auto" className="my-2 list-decimal space-y-1 ps-6 marker:text-slate-400">{children}</ol>,
  li: ({ children }) => <li dir="auto" className="leading-relaxed">{children}</li>,
  // Headings never become <h1>/<h2>: the page owns the heading outline.
  h1: ({ children }) => <h3 dir="auto" className="mb-1 mt-4 text-lg font-bold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 dir="auto" className="mb-1 mt-4 text-base font-bold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 dir="auto" className="mb-1 mt-3 text-base font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 dir="auto" className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 dir="auto" className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 dir="auto" className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h6>,
  blockquote: ({ children }) => <blockquote dir="auto" className="my-2 border-s-4 border-violet-300 ps-3 text-slate-600 dark:border-violet-500/50 dark:text-zinc-300">{children}</blockquote>,
  hr: () => <hr className="my-4 border-slate-200 dark:border-white/[0.08]" />,
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-white/[0.08]">
      <table dir="auto" className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-100 dark:bg-white/[0.05]">{children}</thead>,
  th: ({ children }) => <th dir="auto" className="border-b border-slate-200 px-3 py-2 text-start font-semibold dark:border-white/[0.08]">{children}</th>,
  td: ({ children }) => <td dir="auto" className="border-t border-slate-200 px-3 py-2 text-start align-top dark:border-white/[0.08]">{children}</td>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

/** If markdown rendering ever throws, fall back to the raw text; a new chunk of content retries. */
class MarkdownBoundary extends Component<{ content: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: { content: string }) {
    if (this.state.failed && previous.content !== this.props.content) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <p dir="auto" className="whitespace-pre-wrap break-words">{this.props.content}</p>;
    return this.props.children;
  }
}

function AiMarkdownImpl({ content, streaming }: { content: string; streaming?: boolean }) {
  const source = useMemo(() => normalizeMathDelimiters(stripHtmlComments(streaming ? markPendingSchematic(content) : content)), [content, streaming]);
  return (
    <div className="min-w-0 break-words">
      <MarkdownBoundary content={content}>
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
          {source}
        </ReactMarkdown>
      </MarkdownBoundary>
    </div>
  );
}

/** Assistant markdown with GFM and LaTeX. Raw HTML is never interpreted: without rehype-raw, react-markdown renders it as literal text. Memoized on the text. */
export const AiMarkdown = memo(AiMarkdownImpl);
export default AiMarkdown;
