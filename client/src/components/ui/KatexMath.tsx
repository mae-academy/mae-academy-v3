import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export type KatexMathProps = {
  math: string;
  block?: boolean;
  displayMode?: boolean;
  className?: string;
};

export function KatexMath({
  math,
  block = false,
  displayMode,
  className = "",
}: KatexMathProps) {
  const isBlock = displayMode !== undefined ? displayMode : block;
  // Preserve literal LaTeX row breaks (\\\\) generated for matrices and vectors.
  // JavaScript string escaping has already been resolved before this component receives `math`.
  const normalizedMath = math;

  const html = useMemo(() => {
    // Any LaTeX that KaTeX cannot parse (or a malformed/raw string that slipped
    // through) must degrade to a clean, sanitized fallback instead of spilling
    // raw control syntax into the DOM.
    const fallback = () =>
      escapeHtml(
        normalizedMath
          .replace(/\\\\/g, "  ")
          .replace(/\\([A-Za-z]+)/g, "")
          .replace(/\\[^A-Za-z]?/g, " ")
          .replace(/[{}]/g, " ")
          .replace(/\s+/g, " ")
          .trim() || "…",
      );
    try {
      const rendered = katex.renderToString(normalizedMath, {
        displayMode: isBlock,
        throwOnError: false,
      });
      // KaTeX marks failed parses with a `katex-error` class even when it does
      // not throw; treat those as unrecoverable and render the fallback.
      return rendered.includes("katex-error") ? fallback() : rendered;
    } catch {
      return fallback();
    }
  }, [normalizedMath, isBlock]);

  return (
    <span
      className={`katex-math-render ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default KatexMath;
