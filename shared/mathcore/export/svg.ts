/**
 * SVG export (STEPS.md §4 State: export to PNG, SVG, JSON). Headless: the caller passes colors already resolved
 * from the design tokens, so no color is written here. Fields (implicit shading) are exported by the PNG path only
 * (ADR-7: no SVG for fields).
 */
import { DASH_PATTERNS } from "../constants";
import type { Polyline } from "../sample/adaptive";
import type { Viewport } from "../ir/types";

export interface SvgCurve {
  segments: readonly Polyline[];
  stroke: string;
  width: number;
  dash?: "solid" | "dashed" | "dotted";
}

export interface SvgOptions {
  width: number;
  height: number;
  viewport: Viewport;
  background: string;
  axis: string;
  curves: SvgCurve[];
  /** Accessible title and description (the generated text descriptions). */
  title: string;
  description: string;
}

/** Digits kept in SVG coordinates (one hundredth of a CSS pixel). */
const COORD_DIGITS = 2;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildSvg(o: SvgOptions): string {
  const { xmin, xmax, ymin, ymax } = o.viewport;
  const sx = o.width / (xmax - xmin);
  const sy = o.height / (ymax - ymin);
  const px = (x: number) => ((x - xmin) * sx).toFixed(COORD_DIGITS);
  const py = (y: number) => ((ymax - y) * sy).toFixed(COORD_DIGITS);
  const dashes = {
    solid: "",
    dashed: ` stroke-dasharray="${DASH_PATTERNS.dashed.join(" ")}"`,
    dotted: ` stroke-dasharray="${DASH_PATTERNS.dotted.join(" ")}"`,
  };
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}" role="img" aria-labelledby="t d">`,
  );
  out.push(`<title id="t">${esc(o.title)}</title><desc id="d">${esc(o.description)}</desc>`);
  out.push(`<rect width="100%" height="100%" fill="${esc(o.background)}"/>`);
  if (xmin <= 0 && xmax >= 0) out.push(`<line x1="${px(0)}" y1="0" x2="${px(0)}" y2="${o.height}" stroke="${esc(o.axis)}" stroke-width="1"/>`);
  if (ymin <= 0 && ymax >= 0) out.push(`<line x1="0" y1="${py(0)}" x2="${o.width}" y2="${py(0)}" stroke="${esc(o.axis)}" stroke-width="1"/>`);
  for (const c of o.curves) {
    for (const s of c.segments) {
      if (s.length < 4) continue;
      let d = `M${px(s[0])} ${py(s[1])}`;
      for (let i = 2; i < s.length; i += 2) d += `L${px(s[i])} ${py(s[i + 1])}`;
      out.push(
        `<path d="${d}" fill="none" stroke="${esc(c.stroke)}" stroke-width="${c.width}" stroke-linejoin="round" stroke-linecap="round"${dashes[c.dash ?? "solid"]}/>`,
      );
    }
  }
  out.push("</svg>");
  return out.join("");
}
