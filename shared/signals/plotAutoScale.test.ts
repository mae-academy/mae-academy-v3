import { describe, expect, it } from 'vitest';
import { convolutionWindow, estimateSupport, niceCeil, niceTicks, symmetricYBound } from "./plotAutoScale";

describe('plotAutoScale', () => {
  it('snaps bounds to clean values with >=20% headroom', () => {
    expect(symmetricYBound(1)).toBe(1.5);
    expect(symmetricYBound(0.1)).toBe(0.15);
    expect(symmetricYBound(15)).toBe(20);
    expect(symmetricYBound(0)).toBe(1);
    for (const peak of [0.03, 0.7, 1, 2, 5.5, 15, 480]) expect(symmetricYBound(peak)).toBeGreaterThanOrEqual(peak * 1.2 - 1e-9);
  });
  it('niceCeil never returns less than the input', () => {
    for (const v of [0.011, 0.9, 1.01, 2.4, 7.9, 99]) expect(niceCeil(v)).toBeGreaterThanOrEqual(v);
  });
  it('produces clean ticks', () => {
    expect(niceTicks(-1.5, 1.5, 6)).toEqual([-1.5, -1, -0.5, 0, 0.5, 1, 1.5]);
    expect(niceTicks(-20, 20, 6).every((t) => t % 5 === 0)).toBe(true);
  });
  it('detects finite and unbounded support', () => {
    const rect = (t: number) => (Math.abs(t) <= 0.5 ? 1 : 0);
    const s = estimateSupport(rect);
    expect(s.unbounded).toBe(false);
    expect(s.hi).toBeCloseTo(0.5, 1);
    expect(estimateSupport((t) => (t >= 0 ? 1 : 0)).unbounded).toBe(true);
  });
  it('grows the convolution window with pulse width', () => {
    const rect = (w: number) => (t: number) => (Math.abs(t) <= w / 2 ? 1 : 0);
    const narrow = convolutionWindow(rect(1), rect(1));
    const wide = convolutionWindow(rect(8), rect(6));
    expect(narrow.to).toBeLessThan(wide.to);
    expect(wide.to).toBeGreaterThanOrEqual(7);
    expect(narrow.from).toBe(-narrow.to);
  });
});
