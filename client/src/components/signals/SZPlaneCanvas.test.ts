import { describe, expect, it } from "vitest";
import { autoSpan } from "./SZPlaneCanvas";
import { parseTransferFunction } from "@/../../api/_lib/signals/laplaceEngine";
import { rocFor } from "@shared/signals/transferFunction";

describe("S/Z-plane auto-scale", () => {
  it("floors at 2.5 for a compact constellation", () => {
    const system = parseTransferFunction("\\frac{1}{s+1}", "s");
    expect(autoSpan(system, rocFor(system, "right"))).toBe(2.5);
  });
  it("adds 30% headroom around the farthest pole/zero component", () => {
    const system = parseTransferFunction("\\frac{s+1}{s^2+4s+13}", "s"); // poles −2 ± j3
    expect(autoSpan(system, rocFor(system, "right"))).toBeCloseTo(3.9, 6);
  });
  it("keeps a distant ROC boundary and the unit circle in view", () => {
    const far = parseTransferFunction("\\frac{1}{(s+1)(s-8)}", "s");
    expect(autoSpan(far, rocFor(far, "two-sided"))).toBeCloseTo(10.4, 6);
    const z = parseTransferFunction("\\frac{1}{z-0.5}", "z");
    expect(autoSpan(z, rocFor(z, "right"))).toBe(2.5);
  });
});
