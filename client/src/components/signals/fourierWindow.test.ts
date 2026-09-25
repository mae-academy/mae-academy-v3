import { describe, expect, it } from "vitest";
import { isValidWindow, periodMultipleLatex, periodTicks, presetWindow, suggestPeriod } from "@/components/signals/fourierWindow";

describe("Fourier observation window", () => {
  it("presets are grounded to T₀", () => {
    expect(presetWindow("one", 4)).toEqual({ start: -2, end: 2 });
    expect(presetWindow("two", 4)).toEqual({ start: -4, end: 4 });
    expect(isValidWindow({ start: 1, end: 0.5 }, 2)).toBe(false);
  });

  it("labels period multiples symbolically", () => {
    expect(periodMultipleLatex(0)).toBe("0");
    expect(periodMultipleLatex(1)).toBe("T_0");
    expect(periodMultipleLatex(-0.5)).toBe("-T_0/2");
    expect(periodMultipleLatex(1.5)).toBe("3T_0/2");
    expect(periodMultipleLatex(3)).toBe("3T_0");
    expect(periodMultipleLatex(0.75)).toBe("3T_0/4");
  });

  it("places ticks at −T₀, −T₀/2, 0, T₀/2, T₀ for a two-period window", () => {
    const ticks = periodTicks({ start: -4, end: 4 }, 4);
    expect(ticks.map((t) => t.value)).toEqual([-4, -2, 0, 2, 4]);
    expect(ticks.map((t) => t.latex)).toEqual(["-T_0", "-T_0/2", "0", "T_0/2", "T_0"]);
  });

  it("coarsens the step for wide custom windows and keeps asymmetric bounds", () => {
    const wide = periodTicks({ start: -1, end: 20 }, 1);
    expect(wide.length).toBeLessThanOrEqual(7);
    expect(wide.every((t) => t.value >= -1 && t.value <= 20)).toBe(true);
    expect(wide.some((t) => t.value === 0)).toBe(true);
  });

  it("detects T₀ from spectral lines (gcd) and from pulse support", () => {
    expect(suggestPeriod(() => 0, [4])).toBeCloseTo(Math.PI / 2, 5);
    expect(suggestPeriod(() => 0, [4, 6, -4, -6])).toBeCloseTo(Math.PI, 5);
    expect(suggestPeriod((t) => (Math.abs(t) <= 0.5 ? 1 : 0))).toBeCloseTo(2, 5);
    expect(suggestPeriod((t) => Math.max(0, 1 - Math.abs(t)))).toBeCloseTo(4, 5);
    expect(suggestPeriod((t) => Math.cos(t) + 2)).toBeNull();
  });
});
