/**
 * Every template sample runs as shipped (Part B): it is loaded into the real engine, with the helper items the page
 * adds, and gives no error and the expected kind, sliders and value.
 */
import { ComputeEngine } from "@cortex-js/compute-engine";
import { describe, expect, it } from "vitest";
import { GraphEngine } from "@shared/mathcore/engine/graphEngine";
import { deriveHelpers } from "@shared/mathcore/classify/derive";
import { emptyGraph } from "@shared/mathcore/ir/types";
import { analyzeMatrix } from "@shared/mathcore/linalg/analyze";
import { CATEGORIES } from "./categories";
import { matrixOpResult, parseMatrixLine, parseMatrixOp, buildMatrixLine } from "./matrixOps";

const ce = new ComputeEngine();
const parser = (l: string): unknown => ce.parse(l, { form: "raw" }).json;

describe("templates run as shipped", () => {
  for (const c of CATEGORIES) {
    for (const s of c.samples) {
      it(`${c.id}/${s.id}`, () => {
        const user = s.items.map((latex, i) => ({ id: `u${i}`, latex }));
        const helpers = deriveHelpers(user);
        const e = new GraphEngine(parser, { ...emptyGraph(), items: [...user, ...helpers.map((h) => h.item)] });
        const withMatrixOp = user.map((u) => parseMatrixOp(u.latex));
        user.forEach((u, i) => {
          const errors = e.item(u.id)?.errors ?? [];
          // A matrix operation line is answered from the matrix report, not by the engine item.
          if (!withMatrixOp[i]) expect(errors, u.latex).toEqual([]);
        });
        for (const h of helpers) expect(e.item(h.item.id)?.errors, h.item.latex).toEqual([]);
        const last = user.length - 1;
        const kindItem = s.items.length > 1 && withMatrixOp[last] ? user[0] : user[last];
        if (s.expect.kind && !helpers.some((h) => h.role === "integral")) expect(e.item(kindItem.id)?.type.kind).toBe(s.expect.kind);
        if (s.expect.params) expect(Object.keys(e.graph.params).sort()).toEqual([...s.expect.params].sort());
        if (s.expect.value !== undefined) {
          const integral = helpers.find((h) => h.role === "integral");
          if (integral) {
            const r = e.runtime(integral.item.id);
            expect(r?.kind === "Value" && Math.abs(r.value - s.expect.value)).toBeLessThan(1e-9);
          } else {
            const op = withMatrixOp[last]!;
            const mat = e.runtime(user[0].id);
            expect(mat?.kind).toBe("Matrix");
            const a = analyzeMatrix((mat as { values: number[][] }).values, op.name);
            expect(Number(a.det.latex.replace(/[^0-9.-]/g, ""))).toBe(s.expect.value);
            expect(matrixOpResult(op, a)).toMatchObject({ ok: true });
          }
        }
      });
    }
  }

  it("matrix operations: forms, results, and the ones that do not exist say so", () => {
    expect(parseMatrixOp("\\det(A)")).toEqual({ op: "det", name: "A" });
    expect(parseMatrixOp("\\det A")).toEqual({ op: "det", name: "A" });
    expect(parseMatrixOp("A^{-1}")).toEqual({ op: "inverse", name: "A" });
    expect(parseMatrixOp("A^T")).toEqual({ op: "transpose", name: "A" });
    expect(parseMatrixOp("A^{\\top}")).toEqual({ op: "transpose", name: "A" });
    expect(parseMatrixOp("y=x")).toBeNull();
    const a = analyzeMatrix([[1, 2], [3, 4]], "A");
    expect(matrixOpResult({ op: "transpose", name: "A" }, a)).toEqual({ ok: false, reason: "transpose" });
    expect(matrixOpResult({ op: "inverse", name: "A" }, a)).toMatchObject({ ok: true });
    expect(matrixOpResult({ op: "inverse", name: "A" }, analyzeMatrix([[1, 2], [2, 4]], "A"))).toEqual({ ok: false, reason: "singular" });
    expect(matrixOpResult({ op: "det", name: "Q" }, null)).toEqual({ ok: false, reason: "notMatrix" });
  });

  it("matrix editor round trip", () => {
    const m = parseMatrixLine("A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}");
    expect(m).toEqual({ name: "A", rows: [["1", "2"], ["3", "4"]] });
    expect(buildMatrixLine("A", m!.rows)).toBe("A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}");
    expect(parseMatrixLine("y=x")).toBeNull();
  });
});
