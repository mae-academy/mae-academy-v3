import { describe, expect, it } from "vitest";
import { formatTick, gridStep } from "./renderer";

describe("grid helpers", () => {
  it("picks 1, 2 or 5 × 10ⁿ steps", () => {
    expect(gridStep(20, 10)).toBe(2);
    expect(gridStep(1, 10)).toBe(0.1);
    expect(gridStep(700, 10)).toBe(50);
    expect(gridStep(3e-6, 10)).toBeCloseTo(2e-7, 20);
  });

  it("formats ticks without float noise", () => {
    expect(formatTick(0.30000000000000004, 0.1)).toBe("0.3");
    expect(formatTick(-4, 2)).toBe("-4");
    expect(formatTick(2e6, 1e6)).toBe("2.0e+6");
  });
});
