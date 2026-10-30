import { describe, expect, it } from "vitest";
import { validateGraph } from "./schema";

/** The STEPS.md §5.1 example, verbatim. */
const EXAMPLE = {
  version: "1.0",
  viewport: { xmin: -10, xmax: 10, ymin: -6, ymax: 6, aspect: "equal" },
  params: { a: { value: 2, min: -5, max: 5, step: 0.01, animate: { from: -5, to: 5, period_s: 6, loop: true } } },
  items: [
    { id: "f1", latex: "y = a\\sin(x)", kind: "Explicit", style: { color: "#FF0000", width: 2 } },
    { id: "c1", latex: "x^2 + y^2 = 9", kind: "Implicit", style: { color: "#0066FF", fill: false } },
    { id: "m1", latex: "M = \\begin{bmatrix} a & 1 \\\\ 0 & 1 \\end{bmatrix}", kind: "Matrix", style: {} },
    { id: "d1", latex: "\\frac{dy}{dx} = x - y", kind: "ODE1", style: {} },
  ],
  view: { mode: "2d", grid: true, showSteps: false, locale: "ar" },
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const issuesOf = (doc: unknown) => {
  const r = validateGraph(doc);
  return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("Graph IR schema (STEPS.md §5)", () => {
  it("accepts the plan's example document", () => {
    const r = validateGraph(EXAMPLE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graph.items).toHaveLength(4);
  });

  it("fills defaults for optional params and view (Q9)", () => {
    const r = validateGraph({ version: "1.0", viewport: { xmin: -1, xmax: 1, ymin: -1, ymax: 1 }, items: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.graph.params).toEqual({});
      expect(r.graph.view).toEqual({ mode: "2d", grid: true, showSteps: false, locale: "en" });
      expect(r.graph.viewport.aspect).toBe("equal");
    }
  });

  it("rejects an unsupported version explicitly", () => {
    expect(issuesOf({ ...clone(EXAMPLE), version: "2.0" })[0]).toMatch(/^version: unsupported version "2.0"/);
    expect(issuesOf({ ...clone(EXAMPLE), version: undefined })).toContainEqual(expect.stringMatching(/^version/));
  });

  it("rejects duplicate ids and ids longer than 32", () => {
    const d = clone(EXAMPLE);
    d.items[1].id = "f1";
    expect(issuesOf(d)).toContain('items[1].id: duplicate id "f1"');
    d.items[1].id = "x".repeat(33);
    expect(issuesOf(d)[0]).toMatch(/items\[1\]\.id/);
    d.items[1].id = "has space";
    expect(issuesOf(d)[0]).toMatch(/items\[1\]\.id/);
  });

  it("limits items to 100 and parameters to 50", () => {
    const d = clone(EXAMPLE);
    d.items = Array.from({ length: 101 }, (_, i) => ({ id: `i${i}`, latex: "x", kind: "Explicit", style: { color: "#000000", width: 1 } }));
    expect(issuesOf(d)).toContain("items: at most 100 items");
    const p = clone(EXAMPLE) as { params: Record<string, unknown> };
    const letters = "abcdefghijklmnopqsuvwABCDEFGHIJKLMNOPQRSTUVWXYZ";
    p.params = Object.fromEntries([...letters].slice(0, 46).concat(["k_1", "k_2", "k_3", "k_4", "k_5"]).map((n) => [n, { value: 0, min: -1, max: 1, step: 0.1 }]));
    expect(Object.keys(p.params)).toHaveLength(51);
    expect(issuesOf(p)).toContain("params: at most 50 parameters");
  });

  it("limits latex to 2000 characters", () => {
    const d = clone(EXAMPLE);
    d.items[0].latex = "x".repeat(2001);
    expect(issuesOf(d)).toContain("items[0].latex: at most 2000 characters");
  });

  it("checks animate.period_s is within [0.5, 60]", () => {
    for (const bad of [0.4, 61]) {
      const d = clone(EXAMPLE);
      d.params.a.animate.period_s = bad;
      expect(issuesOf(d)).toContain("params.a.animate.period_s: must be between 0.5 and 60");
    }
    for (const ok of [0.5, 60]) {
      const d = clone(EXAMPLE);
      d.params.a.animate.period_s = ok;
      expect(issuesOf(d)).toEqual([]);
    }
  });

  it("checks parameter invariants (Q10)", () => {
    const d = clone(EXAMPLE);
    d.params.a = { value: 9, min: 5, max: -5, step: 0, animate: { from: -9, to: 5, period_s: 6, loop: true } };
    const issues = issuesOf(d);
    expect(issues).toContain("params.a: min must be less than max");
    expect(issues).toContain("params.a.step: must be positive");
    expect(issues).toContain("params.a.animate: from and to must lie within [min, max]");
  });

  it("rejects reserved and malformed parameter names", () => {
    const d = clone(EXAMPLE) as { params: Record<string, unknown> };
    d.params = { x: { value: 0, min: -1, max: 1, step: 0.1 }, "2b": { value: 0, min: -1, max: 1, step: 0.1 } };
    const issues = issuesOf(d);
    expect(issues).toContain("params.x: reserved symbol cannot be a parameter");
    expect(issues).toContain("params.2b: invalid parameter name");
  });

  it("rejects unknown keys anywhere (Q8)", () => {
    const d = clone(EXAMPLE) as Record<string, unknown> & typeof EXAMPLE;
    (d as Record<string, unknown>).extra = 1;
    (d.items[0].style as Record<string, unknown>).glow = true;
    (d.viewport as Record<string, unknown>).zoom = 2;
    const issues = issuesOf(d);
    expect(issues).toContain("extra: unknown key");
    expect(issues).toContain("items[0].style.glow: unknown key");
    expect(issues).toContain("viewport.zoom: unknown key");
  });

  it("validates style values (Q7)", () => {
    const d = clone(EXAMPLE);
    d.items[0].style = { color: "red;", width: 0 } as typeof d.items[0]["style"];
    const issues = issuesOf(d);
    expect(issues).toContain("items[0].style.color: must be #RRGGBB or a design-token name");
    expect(issues).toContain("items[0].style.width: must be in (0, 10]");
    d.items[0].style = { color: "primary", width: 2 };
    expect(issuesOf(d)).toEqual([]);
  });

  it("rejects 3D mode while D3 is deferred, and unknown locales", () => {
    const d = clone(EXAMPLE);
    (d.view as Record<string, unknown>).mode = "3d";
    (d.view as Record<string, unknown>).locale = "fr";
    const issues = issuesOf(d);
    expect(issues).toContain("view.mode: 3D is deferred by decision D3");
    expect(issues).toContain("view.locale: must be ar, en or es");
  });

  it("rejects an inverted viewport and non-finite numbers", () => {
    const d = clone(EXAMPLE) as Record<string, unknown> & typeof EXAMPLE;
    d.viewport = { xmin: 1, xmax: -1, ymin: 0, ymax: Infinity as unknown as number, aspect: "equal" };
    const issues = issuesOf(d);
    expect(issues).toContain("viewport: xmin must be less than xmax");
    expect(issues).toContain("viewport.ymax: must be a finite number");
  });

  it("rejects unknown kinds", () => {
    const d = clone(EXAMPLE);
    (d.items[0] as Record<string, unknown>).kind = "Spline";
    expect(issuesOf(d)).toContain("items[0].kind: unknown kind");
  });
});
