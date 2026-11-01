import { describe, expect, it } from "vitest";
import { buildSvg } from "../export/svg";
import { sampleExplicit } from "../sample/adaptive";
import { describeExplicit, describeInEnglish } from "./describe";

describe("curve descriptions (accessibility)", () => {
  it("finds domain, zeros and extrema of sin(x) on [-4, 4]", () => {
    const d = describeExplicit(sampleExplicit(Math.sin, -4, 4, { tolerance: 0.001, yRange: 4 }).segments);
    expect(d.pieces).toBe(1);
    expect(d.domain).toEqual([[-4, 4]]);
    expect(d.zeros).toEqual([-3.14, 0, 3.14]);
    expect(d.extrema.map((e) => e.type)).toEqual(["min", "max"]);
    expect(d.extrema[0].x).toBeCloseTo(-Math.PI / 2, 2);
    expect(describeInEnglish("y = sin x", d)).toMatch(/crosses zero at x = -3.14, 0, 3.14/);
  });

  it("counts pieces split by an asymptote", () => {
    const d = describeExplicit(sampleExplicit((x) => 1 / x, -2, 2.1, { tolerance: 0.001, yRange: 4 }).segments);
    expect(d.pieces).toBe(2);
    expect(d.zeros).toEqual([]);
  });
});

describe("SVG export", () => {
  it("writes an accessible SVG with one path per segment and escaped text", () => {
    const segs = sampleExplicit((x) => x * x, -1, 1, { tolerance: 0.01, yRange: 2 }).segments;
    const svg = buildSvg({
      width: 400, height: 200, viewport: { xmin: -2, xmax: 2, ymin: -1, ymax: 1, aspect: "free" },
      background: "white", axis: "gray", curves: [{ segments: segs, stroke: "blue", width: 2, dash: "dashed" }],
      title: "x < 1 & y", description: "parabola",
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<title id=\"t\">x &lt; 1 &amp; y</title>");
    expect((svg.match(/<path /g) ?? []).length).toBe(1);
    expect(svg).toContain('stroke-dasharray="8 6"');
  });
});

describe("curves that are not a function graph", () => {
  it("describes an implicit curve by its pieces and the box it spans", async () => {
    const { describeExtent } = await import("./describe");
    const circle = Float64Array.from(Array.from({ length: 41 }, (_, i) => [3 * Math.cos((i / 40) * 2 * Math.PI), 3 * Math.sin((i / 40) * 2 * Math.PI)]).flat());
    const d = describeExtent([circle]);
    expect(d.pieces).toBe(1);
    expect(d.extent).toEqual({ xmin: -3, xmax: 3, ymin: -3, ymax: 3 });
    expect(describeExtent([]).pieces).toBe(0);
  });
});
