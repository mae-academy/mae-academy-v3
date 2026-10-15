/**
 * Lazy, serialised, cached Mermaid rendering. The library is a dynamic import (its own chunk, never in the main
 * bundle). Rendering path (decided from real-browser tests, see the report):
 *   validate source -> mermaid.render (securityLevel "strict", htmlLabels on so $$math$$ labels render through KaTeX
 *   MathML) -> inspect SVG -> give it explicit pixel size -> display through <img src="data:image/svg+xml">.
 * An <img> cannot run scripts or load subresources, so the foreignObject labels never touch the page DOM.
 */
import { sizeSvg, svgIsSafe, type SvgSize } from "./svgInspect";
import { validateMermaid, type MermaidReason } from "./mermaidValidate";

export type MermaidRenderResult = SvgSize;

export type MermaidFailure = { kind: "blocked"; reason: MermaidReason } | { kind: "syntax"; message: string } | { kind: "load" } | { kind: "internal" };

export class MermaidRenderError extends Error {
  constructor(readonly failure: MermaidFailure) {
    super(failure.kind);
  }
}

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

type Loader = () => Promise<MermaidApi>;

const defaultLoader: Loader = async () => (await import("mermaid")).default as unknown as MermaidApi;
let loader: Loader = defaultLoader;
let api: Promise<MermaidApi> | null = null;
const cache = new Map<string, MermaidRenderResult>();
const CACHE_LIMIT = 64;
let counter = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Tests inject a fake module; null restores the real import. Clears caches. */
export function setMermaidLoaderForTests(next: Loader | null): void {
  loader = next ?? defaultLoader;
  api = null;
  cache.clear();
  counter = 0;
  queue = Promise.resolve();
}

export function cachedMermaid(source: string): MermaidRenderResult | undefined {
  return cache.get(source);
}

function load(): Promise<MermaidApi> {
  if (!api) {
    api = loader().then(
      (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "Arial, Helvetica, sans-serif",
          flowchart: { htmlLabels: true, useMaxWidth: false },
          state: { useMaxWidth: false },
          sequence: { useMaxWidth: false },
          maxTextSize: 8 * 1024,
          maxEdges: 120,
          // Math labels are written $$...$$; KaTeX emits MathML, so no web font has to reach the <img>.
          legacyMathML: false,
        });
        return mermaid;
      },
      () => {
        api = null; // a failed download may be retried
        throw new MermaidRenderError({ kind: "load" });
      },
    );
  }
  return api;
}

export function renderMermaid(raw: string): Promise<MermaidRenderResult> {
  const check = validateMermaid(raw);
  if (!check.ok) return Promise.reject(new MermaidRenderError({ kind: "blocked", reason: check.reason }));
  const source = check.source;
  const hit = cache.get(source);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = cache.get(source);
    if (again) return again;
    const mermaid = await load();
    const id = `mae-mermaid-${++counter}`;
    let rendered: { svg: string };
    try {
      rendered = await mermaid.render(id, source);
    } catch (error) {
      // mermaid leaves its scratch / error nodes in the document on failure.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      const message = (error instanceof Error ? error.message : String(error)).split("\n").slice(0, 3).join("\n").slice(0, 300);
      throw new MermaidRenderError({ kind: "syntax", message });
    }
    document.getElementById(`d${id}`)?.remove();
    if (!svgIsSafe(rendered.svg)) throw new MermaidRenderError({ kind: "blocked", reason: "html" });
    const sized = sizeSvg(rendered.svg);
    if (!sized) throw new MermaidRenderError({ kind: "internal" });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(source, sized);
    return sized;
  });
  queue = job.catch(() => undefined);
  return job;
}
