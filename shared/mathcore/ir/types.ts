/**
 * Graph IR 1.0 (STEPS.md §5, ADR-9): the single state document. Owner decisions Q5–Q12 fill the points the plan
 * leaves open; see docs/mathcore/reports/owner-decisions-2026-10-30.md.
 */

export const IR_VERSION = "1.0";
export const SUPPORTED_IR_VERSIONS: readonly string[] = [IR_VERSION];

/** Type names from STEPS.md §6.1, plus `Matrix` as an alias of the size-specific type (Q5). */
export const ITEM_KINDS = [
  "Scalar", "Explicit", "Polar", "Parametric", "Implicit", "RiemannSum", "Matrix", "Matrix2", "Matrix3", "GaussSystem",
  "ODE1", "ODESystem2", "PDEHeat", "PDEWave", "IEFredholm", "IEVolterra", "ComplexMap", "ConformalGrid", "NumericIter",
  "Distribution", "MonteCarlo", "Surface3D", "VectorField3D",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export interface Viewport {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  /** `equal`: one unit is the same length on both axes. */
  aspect: "equal" | "free";
}

export interface Animation {
  from: number;
  to: number;
  period_s: number;
  loop: boolean;
}

export interface Param {
  value: number;
  min: number;
  max: number;
  step: number;
  animate?: Animation;
}

export interface ItemStyle {
  /** `#RRGGBB` or a design-token name resolved against client/src/index.css at render time (Q7). */
  color?: string;
  /** Stroke width in CSS units of the canvas, in (0, 10]. */
  width?: number;
  fill?: boolean;
  hidden?: boolean;
  dash?: "solid" | "dashed" | "dotted";
}

export interface Item {
  id: string;
  latex: string;
  kind?: ItemKind;
  style?: ItemStyle;
}

/** Orbit camera of the 3D view (Phase 5): angles in radians, distance in world units from the origin. */
export interface Camera3 {
  azimuth: number;
  elevation: number;
  distance: number;
}

export interface View {
  mode: "2d" | "3d";
  /** 3D view only; the default camera when absent. */
  camera?: Camera3;
  grid: boolean;
  showSteps: boolean;
  locale: "ar" | "en" | "es";
}

export interface GraphIR {
  version: string;
  viewport: Viewport;
  params: Record<string, Param>;
  items: Item[];
  view: View;
}

export const DEFAULT_VIEWPORT: Viewport = { xmin: -10, xmax: 10, ymin: -6, ymax: 6, aspect: "equal" };
export const DEFAULT_VIEW: View = { mode: "2d", grid: true, showSteps: false, locale: "en" };
/** Camera limits: elevation stays short of the poles (the up vector would flip), distance within a sane zoom range. */
export const CAMERA_LIMITS = { elevation: 1.5, distanceMin: 2, distanceMax: 200 } as const;
/**
 * Default orbit: oblique (not 45°, where the common planes x = y and x = −y are seen edge-on), slightly above the
 * xy-plane. The distance is replaced by the fitted one when the page has no camera.
 */
export const DEFAULT_CAMERA3: Camera3 = { azimuth: 1.1, elevation: 0.45, distance: 22 };

export function emptyGraph(): GraphIR {
  return { version: IR_VERSION, viewport: { ...DEFAULT_VIEWPORT }, params: {}, items: [], view: { ...DEFAULT_VIEW } };
}
