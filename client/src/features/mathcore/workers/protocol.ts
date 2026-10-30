/**
 * Messages between the mathcore page and its engine Worker (ADR-11: parsing and sampling off the main thread).
 * Every request carries a sequence number; a response for an older sequence is stale and dropped (STEPS.md §7.1).
 */
import type { CurveDescription } from "@shared/mathcore/describe/describe";
import type { MatrixAnalysis, SystemAnalysis } from "@shared/mathcore/linalg/analyze";
import type { Camera3, GraphIR, Viewport } from "@shared/mathcore/ir/types";
import type { Frame3, Frame3Colors } from "@shared/mathcore/render3d/frame";
import type { ParsedEntry } from "./parseProtocol";

export interface ViewRequest {
  viewport: Viewport;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** `drag`: quarter resolution while a slider or the view moves; `full` on release (STEPS.md §7.1 technique 2). */
  quality: "drag" | "full";
  /** 3D view (Phase 5): the Worker also renders the 3D items into `frame3d`. */
  mode?: "2d" | "3d";
  /** Orbit camera; when absent the Worker fits the camera to the scene and reports it. */
  camera?: Camera3;
  /** Token colors resolved by the page (the Worker has no CSS): scene colors, the three plane colors, item colors. */
  colors3d?: Frame3Colors;
}

/** A rendered 3D frame (RGBA at `width` × `height`, stretched over the canvas) and its labels in CSS pixels. */
export type Frame3Result = Frame3;

export type EngineRequest =
  /** `parsed` holds the parse Worker's result for every item's LaTeX. */
  /** `fresh`: an unrelated document (import, link); sliders forget what the previous document remembered. */
  | { type: "load"; seq: number; graph: GraphIR; parsed: Record<string, ParsedEntry>; view: ViewRequest; fresh?: boolean }
  | { type: "param"; seq: number; name: string; value: number; view: ViewRequest }
  | { type: "view"; seq: number; view: ViewRequest }
  | { type: "bench"; seq: number }
  /** Tangent and value of an explicit item at x (tracing, STEPS.md §8.1). Has its own sequence numbers. */
  | { type: "trace"; seq: number; id: string; x: number };

export interface ItemResult {
  id: string;
  kind: string;
  errors: Array<{ message: string; start?: number; end?: number }>;
  warnings: string[];
  /** Interleaved x, y polylines in world coordinates. */
  segments: Float64Array[];
  point?: { x: number; y: number };
  value?: number;
  description?: CurveDescription;
  precisionWarning?: boolean;
  /** Inequality shading: one byte per sample, row 0 at the top (ImageData order), over `viewport`. */
  field?: { width: number; height: number; data: Uint8Array; viewport: Viewport };
  /** For implicit items: `=`, `<`, `<=`, `>` or `>=` (strict inequalities draw a dashed boundary). */
  relation?: string;
  /** For a point whose coordinates are single parameters, the parameters a drag changes. */
  dragParams?: { x?: string; y?: string };
  /** Label drawn next to `point` (the solution of a 2×2 system). */
  label?: string;
  /** Matrix or system report with LaTeX (STEPS.md §8.2). */
  linalg?: { type: "matrix"; analysis: MatrixAnalysis } | { type: "system"; analysis: SystemAnalysis };
  /** Canvas geometry of a 2×2 matrix: transformed grid, Aî and Aĵ, the image of the unit square, eigen-directions. */
  transform?: TransformResult;
}

export interface TransformResult {
  grid: Float64Array[];
  iHat: [number, number];
  jHat: [number, number];
  parallelogram: Float64Array;
  /** +1 orientation kept, −1 reversed, 0 singular. */
  orientation: -1 | 0 | 1;
  eigenLines: Float64Array[];
}

export type EngineResponse =
  | {
      type: "result";
      seq: number;
      /** The document with automatically created parameters (STEPS.md §5.2). */
      graph: GraphIR;
      items: ItemResult[];
      /** Item evaluations since the Worker started (Phase 2 exit: only dependents are updated). */
      evaluations: number;
      /** Ids re-evaluated by this request (empty for a pure view change). */
      reevaluated: string[];
      /** The request this answers; a `load` answer may carry slider values that the document text changed. */
      cause: "load" | "param" | "view";
      /** 3D view only. */
      frame3d?: Frame3Result;
      /** The quarter-resolution frame of a progressive answer; the full frame follows under the same sequence. */
      partial?: boolean;
      ms: number;
    }
  /** The request had nothing to act on (no document loaded yet); it only stops the watchdog. */
  | { type: "skipped"; seq: number }
  | { type: "bench"; seq: number; results: unknown }
  | { type: "trace"; seq: number; id: string; x: number; y: number; slope: number | null }
  | { type: "error"; seq: number; message: string };
