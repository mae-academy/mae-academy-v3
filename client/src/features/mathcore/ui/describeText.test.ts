import i18n from "i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/en.json";
import { analyzeMatrix, analyzeSystem } from "@shared/mathcore/linalg/analyze";
import { describeItem, describeLinalg } from "./describeText";

const inst = i18n.createInstance();
void inst.init({ lng: "en", resources: { en: { mathcore: en } }, ns: ["mathcore"], defaultNS: "mathcore", interpolation: { escapeValue: false } });
const t = inst.getFixedT("en", "mathcore");

describe("localized curve descriptions", () => {
  it("function graphs: pieces, zeros and extrema", () => {
    const s = describeItem(t, "Expression 1", { domain: [[-4, 4]], zeros: [-3.14, 0, 3.14], extrema: [{ x: 1.57, y: 1, type: "max" }], pieces: 1 });
    expect(s).toBe("Expression 1: one piece from x = -4 to 4; crosses zero at x = -3.14, 0, 3.14; local maxima near (1.57, 1).");
  });
  it("curves that are not graphs: pieces and extent", () => {
    const s = describeItem(t, "E2", { domain: [], zeros: [], extrema: [], pieces: 2, extent: { xmin: -5, xmax: 5, ymin: -3, ymax: 3 } });
    expect(s).toBe("E2: 2 pieces spanning x from -5 to 5 and y from -3 to 3.");
  });
  it("inequalities: shaded share first, even when the boundary is off-screen (Phase 3 review)", () => {
    expect(describeItem(t, "E3", { domain: [], zeros: [], extrema: [], pieces: 0, shaded: 1 })).toBe("E3: the shaded region fills the whole view.");
    expect(describeItem(t, "E3", { domain: [], zeros: [], extrema: [], pieces: 0, shaded: 0 })).toBe("E3: no shaded region in this view.");
    const partial = describeItem(t, "E3", { domain: [], zeros: [], extrema: [], pieces: 1, shaded: 0.997, extent: { xmin: -1, xmax: 1, ymin: -1, ymax: 1 } });
    expect(partial).toBe("E3: the shaded region covers about 99% of the view; its boundary spans x from -1 to 1 and y from -1 to 1.");
  });
  it("hidden curves", () => {
    expect(describeItem(t, "E4", { domain: [], zeros: [], extrema: [], pieces: 0 })).toBe("E4: not visible in this view.");
  });
});

describe("matrix and system descriptions", () => {
  it("matrix: determinant, orientation, eigenvalues (real and complex)", () => {
    expect(describeLinalg(t, "Expression 1", { type: "matrix", analysis: analyzeMatrix([[1, 2], [3, 4]]) })).toBe(
      "Expression 1: matrix with determinant -2, orientation reversed; eigenvalues 5.37228, -0.372281.",
    );
    expect(describeLinalg(t, "Expression 2", { type: "matrix", analysis: analyzeMatrix([[1, -2], [2, 1]]) })).toBe(
      "Expression 2: matrix with determinant 5, orientation kept; eigenvalues 1 + 2i, 1 − 2i.",
    );
    expect(describeLinalg(t, "E", { type: "matrix", analysis: analyzeMatrix([[1, 2], [2, 4]]) })).toContain("singular matrix");
  });
  it("systems: unique, none, infinite", () => {
    expect(describeLinalg(t, "E", { type: "system", analysis: analyzeSystem([[1, 2], [3, 4]], [5, 6], ["x", "y"]) })).toBe(
      "E: linear system with the unique solution x = -4, y = 4.5.",
    );
    expect(describeLinalg(t, "E", { type: "system", analysis: analyzeSystem([[1, 1], [1, 1]], [1, 2], ["x", "y"]) })).toBe("E: linear system with no solution.");
    expect(describeLinalg(t, "E", { type: "system", analysis: analyzeSystem([[1, 1], [2, 2]], [1, 2], ["x", "y"]) })).toBe(
      "E: linear system with infinitely many solutions.",
    );
  });
});
