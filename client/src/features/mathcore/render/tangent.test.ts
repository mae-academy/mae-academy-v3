/**
 * Part E1 regression: the tangent is computed in data coordinates. The renderer is driven with a recording 2D context
 * at two zoom levels (and two canvas sizes); the pixels it draws to are mapped back to data coordinates and must be
 * identical. Before the fix the segment ran from xmin to xmax of the viewport and the slope triangle's run was one grid
 * step of the viewport, so both changed with the zoom.
 */
import { describe, expect, it } from "vitest";
import { tangentGeometry } from "@shared/mathcore/calculus/tangentGeometry";
import { TANGENT_HALF_SPAN, TANGENT_TRIANGLE_RUN } from "@shared/mathcore/constants";
import { Canvas2DRenderer } from "./renderer";
import type { Scene } from "./renderer";

type Call = [string, ...number[]];

function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return (...args: unknown[]) => {
        if (prop === "strokeStyle") return undefined;
        calls.push([prop, ...(args.filter((a) => typeof a === "number") as number[])]);
        return undefined;
      };
    },
    set() {
      return true;
    },
  };
  const ctx = new Proxy({}, handler);
  const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

/** Tangent line and triangle as drawn, mapped back to data coordinates. */
function drawnTangent(viewport: Scene["viewport"], w: number, h: number, tangent: NonNullable<Scene["tangent"]>) {
  const { canvas, calls } = recordingCanvas();
  // getComputedStyle needs a DOM element for the token reads; the renderer only needs strings back.
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => ({ getPropertyValue: () => "", fontSize: "12px" });
  const r = new Canvas2DRenderer(canvas);
  r.resize(w, h, 1);
  r.draw({ viewport, grid: false, curves: [], points: [], tangent });
  // The tangent is the last beginPath … stroke group with moveTo/lineTo pairs: take the final two path groups.
  const pathCalls = calls.filter((c) => c[0] === "moveTo" || c[0] === "lineTo");
  const toData = (px: number, py: number) => ({
    x: viewport.xmin + (px / w) * (viewport.xmax - viewport.xmin),
    y: viewport.ymax - (py / h) * (viewport.ymax - viewport.ymin),
  });
  // Last 5 path ops: line (moveTo, lineTo), triangle (moveTo, lineTo, lineTo).
  const last = pathCalls.slice(-5).map((c) => toData(c[1], c[2]));
  return { line: [last[0], last[1]], triangle: [last[2], last[3], last[4]] };
}

describe("tangent in data coordinates (Part E1)", () => {
  const tangent = { x0: 1.5, y0: 2.25, slope: 3, color: "c" };
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  };

  it("endpoints and slope triangle are identical at two zoom levels and two canvas sizes", () => {
    const wide = { xmin: -10, xmax: 10, ymin: -6, ymax: 6, aspect: "free" as const };
    const zoomed = { xmin: 0.5, xmax: 2.5, ymin: 0, ymax: 4, aspect: "free" as const };
    const a = drawnTangent(wide, 1000, 600, tangent);
    const b = drawnTangent(zoomed, 400, 700, tangent);
    near(a.line[0], b.line[0]);
    near(a.line[1], b.line[1]);
    a.triangle.forEach((p, i) => near(p, b.triangle[i]));
    // And they are the documented ones.
    const g = tangentGeometry(tangent);
    near(a.line[0], g.from);
    near(a.line[1], g.to);
    near(a.triangle[2], { x: tangent.x0 + TANGENT_TRIANGLE_RUN, y: tangent.y0 + tangent.slope * TANGENT_TRIANGLE_RUN });
  });

  it("the drawn slope is the engine's slope at both zoom levels", () => {
    for (const vp of [{ xmin: -50, xmax: 50, ymin: -30, ymax: 30, aspect: "free" as const }, { xmin: 1.4, xmax: 1.6, ymin: 2, ymax: 2.6, aspect: "free" as const }]) {
      const d = drawnTangent(vp, 800, 500, tangent);
      expect((d.line[1].y - d.line[0].y) / (d.line[1].x - d.line[0].x)).toBeCloseTo(tangent.slope, 9);
    }
    expect(tangentGeometry(tangent).to.x - tangentGeometry(tangent).from.x).toBe(2 * TANGENT_HALF_SPAN);
  });
});
