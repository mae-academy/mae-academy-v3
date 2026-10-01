import { describe, expect, it } from "vitest";
import { analyzeConvolutionRegime } from "./convolutionPiecewise";
import { parseSignalExpression } from "../../../shared/signals/signalEngine";

function signal(source: string) { const p = parseSignalExpression(source); if (!p.ok) throw new Error(p.error); return p.ast; }

describe("piecewise convolution regimes", () => {
  const rect = signal("rect(t)");
  it("walks rect*rect through before / entering / exiting / after with triangle closed forms", () => {
    expect(analyzeConvolutionRegime(rect, rect, -2).kind).toBe("before");
    const entering = analyzeConvolutionRegime(rect, rect, -0.5); expect(entering.kind).toBe("entering"); expect(entering.closedFormLatex).toBe("t+1"); expect(entering.tau1Latex).toBe("-0.5"); expect(entering.tau2Latex).toBe("t+0.5");
    const exiting = analyzeConvolutionRegime(rect, rect, 0.5); expect(exiting.kind).toBe("exiting"); expect(exiting.closedFormLatex).toBe("-t+1");
    expect(analyzeConvolutionRegime(rect, rect, 2).kind).toBe("after");
  });
  it("detects full enclosure for unequal pulses", () => {
    expect(analyzeConvolutionRegime(signal("rect(t/2)"), rect, 0).kind).toBe("full-h");
  });
  it("parses palette tokens", () => {
    for (const s of ["\\text{rect}(t)", "\\Lambda(t)", "\\text{sinc}(t)", "u(t)"]) expect(parseSignalExpression(s).ok).toBe(true);
  });
});
