import React from "react";
import { KatexMath } from "@/components/ui/KatexMath";

export interface SvgKatexTickProps {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  /** true: (x, y) is the text baseline (x-axis ticks); false: y is the vertical center (y-axis ticks). */
  baseline?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

const BOX_W = 56;
const BOX_H = 18;

/** Axis tick label rendered as pure KaTeX inside an SVG <foreignObject>. */
export function SvgKatexTick({ x, y, anchor = "middle", baseline = false, active = false, children }: SvgKatexTickProps) {
  const left = anchor === "end" ? x - BOX_W : anchor === "start" ? x : x - BOX_W / 2;
  const top = baseline ? y - BOX_H + 4 : y - BOX_H / 2;
  const justify = anchor === "end" ? "flex-end" : anchor === "start" ? "flex-start" : "center";
  const text = String(children);
  return (
    <foreignObject x={left} y={top} width={BOX_W} height={BOX_H} pointerEvents="none" overflow="visible">
      <div
        className={`flex h-full items-center text-[11px] leading-none ${active ? "font-bold text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-300"}`}
        style={{ justifyContent: justify }}
      >
        <KatexMath math={text} />
      </div>
    </foreignObject>
  );
}

export default SvgKatexTick;
