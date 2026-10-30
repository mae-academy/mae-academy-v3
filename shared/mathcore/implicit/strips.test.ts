import { describe, expect, it } from "vitest";
import type { Viewport } from "../ir/types";
import { implicitField, mergeStrips, planStrips, stripUnit } from "./strips";
import type { FieldOptions } from "./strips";

const vp: Viewport = { xmin: -8, xmax: 8, ymin: -5, ymax: 5, aspect: "equal" };
const FULL: FieldOptions = { width: 1600, height: 1000, cellPx: 6, refine: 4, stride: 1, relation: "<" };
const DRAG: FieldOptions = { width: 1600, height: 1000, cellPx: 12, refine: 2, stride: 4, relation: "<" };

const run = (F: (x: number, y: number) => number, o: FieldOptions, count: number) =>
  mergeStrips(planStrips(vp, o.width, o.height, o.cellPx, o.stride, count).map((s) => implicitField(F, s.viewport, { ...o, height: s.bottom - s.top })), vp, o);

describe("parallel strips (STEPS.md §7.1 technique 4)", () => {
  it("strip borders are whole coarse cells and shading blocks; strips tile the canvas", () => {
    expect(stripUnit(6, 1)).toBe(6);
    expect(stripUnit(12, 4)).toBe(12);
    for (const h of [1000, 997, 250, 13]) {
      const s = planStrips(vp, 1600, h, 6, 1, 4);
      expect(s[0].top).toBe(0);
      expect(s[s.length - 1].bottom).toBe(h);
      s.forEach((x, i) => {
        if (i > 0) {
          expect(x.top).toBe(s[i - 1].bottom);
          expect(x.viewport.ymax).toBe(s[i - 1].viewport.ymin);
        }
        if (i < s.length - 1) expect(x.bottom % 6).toBe(0);
      });
      expect(s[0].viewport.ymax).toBe(vp.ymax);
      expect(s[s.length - 1].viewport.ymin).toBe(vp.ymin);
    }
    expect(planStrips(vp, 100, 10, 6, 1, 8).length).toBe(2);
  });

  it("merged strips give the same curves and shading as one run", () => {
    const shapes: Array<(x: number, y: number) => number> = [
      (x, y) => x * x + y * y - 9,
      (x, y) => x * x + y * y + Math.sin(3 * x) * Math.cos(2 * y) - 9,
      (x, y) => y - Math.tan(x),
      (x, y) => Math.sin(x * x + y * y),
      (x, y) => x * y - 1,
    ];
    for (const F of shapes) {
      for (const o of [FULL, DRAG]) {
        const one = run(F, o, 1);
        const four = run(F, o, 4);
        // Identical except where rings are narrower than a cell (sin(x² + y²) near the corners): at most one piece.
        expect(Math.abs(four.polylines.length - one.polylines.length), F.toString()).toBeLessThanOrEqual(1);
        const a = one.mask?.data as Uint8Array;
        const b = four.mask?.data as Uint8Array;
        expect(b.length).toBe(a.length);
        let diff = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
        expect(diff / a.length, F.toString()).toBeLessThan(1e-3);
      }
    }
  });

  it("a circle crossing every strip border is one closed curve", () => {
    for (const count of [2, 3, 4, 7]) {
      const r = run((x, y) => x * x + y * y - 16, { ...FULL, relation: "=" }, count);
      expect(r.polylines.length).toBe(1);
      const l = r.polylines[0];
      expect(l[0]).toBeCloseTo(l[l.length - 2], 12);
      expect(r.mask).toBeNull();
    }
  });
});
