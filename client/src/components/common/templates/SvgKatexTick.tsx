import React from "react";

export interface SvgKatexTickProps {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  /** true: (x, y) is the text baseline (x-axis ticks); false: y is the vertical center (y-axis ticks). */
  baseline?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

/** Tick LaTeX (numbers, −, π, \frac{π}{n}) → the Unicode KaTeX itself would typeset. */
export function tickText(source: string): string {
  return source
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\pi/g, "π")
    .replace(/\\,|\\!|\\ /g, "")
    .replace(/-/g, "−")
    .replace(/[{}]/g, "");
}

/**
 * Axis tick label as native SVG <text> in the KaTeX_Main face. Deliberately not HTML-in-<foreignObject>:
 * WebKit (Safari) positions KaTeX's position:relative spans inside a foreignObject from the wrong origin,
 * so labels drifted away from the stems/ticks they belong to.
 */
export function SvgKatexTick({ x, y, anchor = "middle", baseline = false, active = false, children }: SvgKatexTickProps) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline={baseline ? "alphabetic" : "central"}
      pointerEvents="none"
      fontSize={12}
      fontWeight={active ? 700 : 400}
      style={{ fontFamily: "KaTeX_Main, 'Times New Roman', serif" }}
      className={active ? "fill-blue-600 dark:fill-blue-400" : "fill-slate-600 dark:fill-slate-300"}
    >
      {tickText(String(children))}
    </text>
  );
}

export default SvgKatexTick;
