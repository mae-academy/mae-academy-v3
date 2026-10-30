/**
 * The 3D frame of a document (Phase 5): its visible 3×3 matrices and 3×3 systems, rendered by the CPU rasterizer
 * (ADR-4) at canvas size, or at FRAME3_DRAG_SCALE of it while the camera moves. Labels are projected to CSS pixels
 * here and drawn by the page. Runs in the engine Worker.
 */
import { CAMERA_FIT_DISTANCE, FRAME3_DRAG_SCALE } from "../constants";
import type { GraphEngine } from "../engine/graphEngine";
import type { Camera3, Viewport } from "../ir/types";
import { DEFAULT_CAMERA3 } from "../ir/types";
import type { SystemAnalysis } from "../linalg/analyze";
import { analyzeSystem } from "../linalg/analyze";
import type { Mat } from "../linalg/matrix";
import { DEFAULT_CAMERA, projector, render } from "./raster";
import type { RGB, Vec3 } from "./raster";
import { buildScene3 } from "./scene";
import type { Scene3Colors, Scene3Item } from "./scene";

export interface Frame3Request {
  viewport?: Viewport;
  width: number;
  height: number;
  quality: "drag" | "full";
  camera?: Camera3;
}

export type Frame3Colors = Scene3Colors & { planes: [RGB, RGB, RGB]; items: Record<string, RGB> };

export interface Frame3 {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  labels: Array<{ x: number; y: number; text: string }>;
  /** The camera used: the request's, or the one fitted to the scene. */
  camera: Camera3;
}

type Analyze = (id: string, A: Mat, b: number[], unknowns: string[]) => SystemAnalysis;

export function renderFrame3(
  e: GraphEngine,
  req: Frame3Request,
  colors: Frame3Colors,
  analyze: Analyze = (_id, A, b, u) => analyzeSystem(A, b, u),
): Frame3 {
  const items: Scene3Item[] = [];
  for (const it of e.graph.items) {
    if (it.style?.hidden) continue;
    const rt = e.runtime(it.id);
    if (rt?.kind === "Matrix" && rt.size === 3) {
      const t = e.item(it.id)?.type;
      const name = t && (t.kind === "Matrix2" || t.kind === "Matrix3") && t.name ? t.name : undefined;
      items.push({ kind: "matrix", values: rt.values, color: colors.items[it.id] ?? colors.arrow, name });
    } else if (rt?.kind === "GaussSystem" && rt.unknowns.length === 3) {
      // On the axes only when the unknowns are x, y and z (in any order); columns follow the axes.
      const order = ["x", "y", "z"].map((u) => rt.unknowns.indexOf(u));
      if (order.some((k) => k < 0)) continue;
      const a = analyze(it.id, rt.A, rt.b, rt.unknowns);
      const solution = a.solution.kind === "unique" ? (order.map((k) => a.solution.kind === "unique" ? a.solution.values[k] : 0) as Vec3) : null;
      items.push({ kind: "system", A: rt.A.map((r) => order.map((k) => r[k])), b: rt.b, solution, colors: colors.planes });
    }
  }
  const scene = buildScene3(items, colors);
  const camera = req.camera ?? { ...DEFAULT_CAMERA3, distance: scene.half * CAMERA_FIT_DISTANCE };
  const k = req.quality === "drag" ? FRAME3_DRAG_SCALE : 1;
  const width = Math.max(1, Math.round(req.width * k));
  const height = Math.max(1, Math.round(req.height * k));
  const cam = { ...DEFAULT_CAMERA, ...camera, target: [0, 0, 0] as Vec3 };
  const f = render(scene.meshes, scene.lines, cam, width, height, colors.background);
  const project = projector(cam, req.width, req.height);
  const labels: Frame3["labels"] = [];
  for (const l of scene.labels) {
    const p = project(l.at);
    if (p) labels.push({ x: p[0], y: p[1], text: l.text });
  }
  return { width, height, rgba: f.rgba, labels, camera };
}
