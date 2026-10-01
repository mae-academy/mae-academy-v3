import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export type KatexMathProps = {
  math: string;
  block?: boolean;
  displayMode?: boolean;
  className?: string;
};

const CACHE_LIMIT = 512;
const renderCache = new Map<string, string>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Any LaTeX that KaTeX cannot parse must degrade to a clean, sanitized fallback
// instead of spilling raw control syntax into the DOM.
function fallbackHtml(math: string): string {
  return escapeHtml(
    math
      .replace(/\\\\/g, "  ")
      .replace(/\\([A-Za-z]+)/g, "")
      .replace(/\\[^A-Za-z]?/g, " ")
      .replace(/[{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "…",
  );
}

/**
 * Synchronous, LRU-cached KaTeX rendering. Callable during render so the very
 * first paint already contains the typeset glyphs (no raw-text flash).
 */
export function renderKatexHtml(math: string, displayMode = false): string {
  const key = `${displayMode ? "d" : "i"}:${math}`;
  const hit = renderCache.get(key);
  if (hit !== undefined) {
    // Refresh recency.
    renderCache.delete(key);
    renderCache.set(key, hit);
    return hit;
  }
  let html: string;
  try {
    const rendered = katex.renderToString(math, { displayMode, throwOnError: false });
    // KaTeX marks failed parses with a `katex-error` class even when it does not throw.
    html = rendered.includes("katex-error") ? fallbackHtml(math) : rendered;
  } catch {
    html = fallbackHtml(math);
  }
  renderCache.set(key, html);
  if (renderCache.size > CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  return html;
}

export function KatexMath({
  math,
  block = false,
  displayMode,
  className = "",
}: KatexMathProps) {
  const isBlock = displayMode !== undefined ? displayMode : block;
  // Literal LaTeX row breaks (\\\\) for matrices/vectors are preserved as-is.
  const html = useMemo(() => renderKatexHtml(math, isBlock), [math, isBlock]);

  return (
    <span
      className={`katex-math-render ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default KatexMath;
