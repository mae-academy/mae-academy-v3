/**
 * Where a tangent is drawn, in DATA coordinates (Part E1). The slope comes from the engine (central difference at x₀);
 * the endpoints and the slope triangle depend only on (x₀, y₀, slope) and two constants. There is no viewport argument
 * on purpose: zooming or resizing must change only the scale that maps these points to pixels.
 */
import { TANGENT_HALF_SPAN, TANGENT_TRIANGLE_RUN } from "../constants";

export interface Pt {
  x: number;
  y: number;
}

export interface TangentGeometry {
  slope: number;
  from: Pt;
  to: Pt;
  /** Corner, right angle and top of the slope triangle: (x₀, y₀) → (x₀+run, y₀) → (x₀+run, y₀+slope·run). */
  triangle: [Pt, Pt, Pt];
}

export function tangentGeometry(t: { x0: number; y0: number; slope: number }): TangentGeometry {
  const { x0, y0, slope } = t;
  const at = (x: number): Pt => ({ x, y: y0 + slope * (x - x0) });
  const run = TANGENT_TRIANGLE_RUN;
  return {
    slope,
    from: at(x0 - TANGENT_HALF_SPAN),
    to: at(x0 + TANGENT_HALF_SPAN),
    triangle: [{ x: x0, y: y0 }, { x: x0 + run, y: y0 }, { x: x0 + run, y: y0 + slope * run }],
  };
}
