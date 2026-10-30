/**
 * Messages between the mathcore page and its engine Worker (ADR-11: parsing and sampling off the main thread).
 * Every request carries a sequence number; a response for an older sequence is stale and dropped (STEPS.md §7.1).
 */
import type { CurveDescription } from "@shared/mathcore/describe/describe";
import type { GraphIR, Viewport } from "@shared/mathcore/ir/types";

export interface ViewRequest {
  viewport: Viewport;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** `drag`: quarter resolution while a slider or the view moves; `full` on release (STEPS.md §7.1 technique 2). */
  quality: "drag" | "full";
}

export type EngineRequest =
  | { type: "load"; seq: number; graph: GraphIR; view: ViewRequest }
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
  /** For a point whose coordinates are single parameters, the parameters a drag changes. */
  dragParams?: { x?: string; y?: string };
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
      ms: number;
    }
  | { type: "bench"; seq: number; results: unknown }
  | { type: "trace"; seq: number; id: string; x: number; y: number; slope: number | null }
  | { type: "error"; seq: number; message: string };
