import { describe, expect, it } from "vitest";
import { BasisFrameGeometry } from "./BasisFrameGeometry";

describe("Phase 1C 3D basis-frame geometry", () => {
  it("builds the unit-cube frame from the standard 3D basis", () => {
    const frame = new BasisFrameGeometry([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(frame.basisVectors).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(frame.volume).toBe(1);
    expect(frame.vertices).toHaveLength(8);
    expect(frame.edges).toHaveLength(12);
    expect(frame.coordinatePoint([2, -1, 3])).toEqual([2, -1, 3]);
  });

  it("traces a coordinate path through a non-orthogonal valid basis", () => {
    const frame = new BasisFrameGeometry([[1, 1, 0], [0, 1, 1], [0, 0, 1]]);
    expect(frame.volume).toBe(1);
    expect(frame.coordinatePath([2, 3, 4])).toEqual([[0, 0, 0], [2, 0, 0], [5, 3, 0], [5, 7, 4]]);
  });

  it("rejects a dependent 3D basis rather than drawing an invalid frame", () => {
    expect(() => new BasisFrameGeometry([[1, 2, 3], [2, 4, 6], [0, 0, 0]])).toThrow(/degenerate/i);
  });
});
