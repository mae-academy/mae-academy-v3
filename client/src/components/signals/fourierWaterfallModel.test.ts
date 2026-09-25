import { describe, expect, it } from "vitest";
import { fourierSeries, partialSum } from "@/features/signals/engines/fourierEngine";
import { parseUnifiedSignalNode } from "@/lib/signals/unifiedSignalParser";
import {
  buildWaterfallScene,
  harmonicColor,
  harmonicProgress,
  laneDepth,
  laneOrder,
  mergeWeight,
  WATERFALL_DEPTH,
} from "@/components/signals/fourierWaterfallModel";

function series(latex: string, period = 2) {
  const parsed = parseUnifiedSignalNode(latex);
  if (!parsed.ok) throw new Error(parsed.error);
  return fourierSeries(parsed.ast, period, 25);
}

describe("Fourier waterfall model", () => {
  const rect = series("\\text{rect}(t)");

  it("positive mode folds c_{±k} into real harmonics that sum to x_N(t)", () => {
    const scene = buildWaterfallScene(rect, 7, "positive", { samples: 201 });
    expect(scene.harmonics.map((h) => h.k)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const c1 = rect.coefficients.find((c) => c.harmonic === 1)!;
    expect(scene.harmonics[1].amplitude).toBeCloseTo(2 * c1.magnitude, 10);
    for (const i of [0, 37, 100, 163, 200]) expect(scene.composite[i]).toBeCloseTo(partialSum(rect, scene.time[i], 7), 4);
  });

  it("bilateral mode shows c_k e^{jkω₀t} for k = −N…N and still sums to x_N(t)", () => {
    const scene = buildWaterfallScene(rect, 5, "bilateral", { samples: 201 });
    expect(scene.harmonics.map((h) => h.k)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    expect(scene.harmonics.find((h) => h.k === 3)!.amplitude).toBeCloseTo(rect.coefficients.find((c) => c.harmonic === 3)!.magnitude, 10);
    for (const i of [0, 50, 120]) expect(scene.composite[i]).toBeCloseTo(partialSum(rect, scene.time[i], 5), 4);
  });

  it("negative mode isolates k ≤ 0 with DC at the front lane", () => {
    expect(laneOrder("negative", 3)).toEqual([0, -1, -2, -3]);
    const scene = buildWaterfallScene(rect, 3, "negative", { samples: 101 });
    expect(scene.harmonics[0].k).toBe(0);
    expect(scene.harmonics[0].lane).toBe(1);
  });

  it("amplitude bound is a clean value that contains every trace", () => {
    const scene = buildWaterfallScene(rect, 25, "positive", { samples: 481 });
    const peak = Math.max(...scene.harmonics.map((h) => h.amplitude), ...Array.from(scene.composite, Math.abs));
    expect(scene.amplitudeBound).toBeGreaterThanOrEqual(peak);
    expect(scene.amplitudeBound).toBeLessThan(peak * 1.6);
  });

  it("spans the shared observation window and keeps each cycle at the true ω₀", () => {
    const scene = buildWaterfallScene(rect, 4, "positive", { window: { start: -2, end: 2 } });
    expect(scene.time[0]).toBeCloseTo(-2);
    expect(scene.time[scene.time.length - 1]).toBeCloseTo(2);
    const k1 = scene.harmonics.find((h) => h.k === 1)!;
    // y_1 repeats exactly after T₀ = 2 s: samples one period apart match.
    const perPeriod = (scene.time.length - 1) / 2;
    expect(k1.values[Math.round(perPeriod)]).toBeCloseTo(k1.values[Math.round(2 * perPeriod)], 4);
    expect(scene.time.length).toBeGreaterThanOrEqual(32 * 4 * 2);
  });

  it("depth lanes span the fixed depth with the synthesis plane in front", () => {
    expect(laneDepth(0, 9)).toBeCloseTo(WATERFALL_DEPTH / 2);
    expect(laneDepth(8, 9)).toBeCloseTo(-WATERFALL_DEPTH / 2);
  });

  it("assigns the persistent spectral colour identity", () => {
    expect(harmonicColor(1)).toBe("#2563EB");
    expect(harmonicColor(25)).toBe("#E11D48");
    expect(harmonicColor(20)).toBe(harmonicColor(20));
    expect(harmonicColor(40)).toBe("#E11D48");
    expect(harmonicColor(-3)).toBe(harmonicColor(3));
  });

  it("synthesis staggers arrivals and fully merges every harmonic at α = 1", () => {
    const count = 10;
    expect(harmonicProgress(0, 0, count)).toBe(0);
    expect(harmonicProgress(0.3, 0, count)).toBeGreaterThan(harmonicProgress(0.3, 9, count));
    for (let order = 0; order < count; order++) {
      expect(harmonicProgress(1, order, count)).toBe(1);
      expect(mergeWeight(harmonicProgress(1, order, count))).toBe(1);
    }
    expect(mergeWeight(0.5)).toBe(0);
  });
});
