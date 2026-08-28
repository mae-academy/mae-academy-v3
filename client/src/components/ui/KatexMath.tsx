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
    try {
      return katex.renderToString(normalizedMath, {
        displayMode: isBlock,
        throwOnError: false,
      });
    } catch {
      return normalizedMath;
    }
  }, [normalizedMath, isBlock]);

  return (
    <span
      className={`katex-math-render ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default KatexMath;
