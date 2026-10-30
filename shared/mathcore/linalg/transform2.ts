/**
 * Geometry of a 2×2 linear map for the canvas (STEPS.md §8.2): the coordinate grid deformed by A (lines stay
 * parallel and evenly spaced), î → first column, ĵ → second column, the unit square's image shaded by the
 * determinant, and eigen-directions as lines through the origin.
 */
import type { Viewport } from "../ir/types";
import type { Eigen2, Mat } from "./matrix";
import { determinant, eigen2 } from "./matrix";

export interface Transform2Geometry {
  /** Images of the grid lines x = k and y = k, each a 2-point polyline [x0, y0, x1, y1]. */
  grid: Float64Array[];
  /** A·î and A·ĵ (the matrix columns). */
  iHat: [number, number];
  jHat: [number, number];
  /** Image of the unit square: (0,0), Aî, Aî + Aĵ, Aĵ. */
  parallelogram: Float64Array;
  det: number;
  orientation: -1 | 0 | 1;
  singular: boolean;
  eigen: Eigen2;
  /** Eigen-directions clipped to the view (2-point polylines). Empty for complex eigenvalues. */
  eigenLines: Float64Array[];
}

/** Grid lines drawn on each side of the origin, at unit spacing in the source plane. */
const GRID_HALF_COUNT = 20;

export function transform2(A: Mat, view: Viewport): Transform2Geometry {
  const [[a, b], [c, d]] = A;
  const map = (x: number, y: number): [number, number] => [a * x + b * y, c * x + d * y];
  const span = Math.max(view.xmax - view.xmin, view.ymax - view.ymin);
  // Long enough that every grid line crosses the whole view even after a strong contraction.
  const reach = Math.max(GRID_HALF_COUNT, span) * 4;
  const grid: Float64Array[] = [];
  for (let k = -GRID_HALF_COUNT; k <= GRID_HALF_COUNT; k++) {
    const [x0, y0] = map(k, -reach);
    const [x1, y1] = map(k, reach);
    const [u0, v0] = map(-reach, k);
    const [u1, v1] = map(reach, k);
    grid.push(Float64Array.of(x0, y0, x1, y1), Float64Array.of(u0, v0, u1, v1));
  }
  const det = determinant(A);
  const eigen = eigen2(A);
  const line = (v: [number, number]) => Float64Array.of(-reach * v[0], -reach * v[1], reach * v[0], reach * v[1]);
  const eigenLines =
    eigen.kind === "distinct"
      ? eigen.vectors.map(line)
      : eigen.kind === "defective"
        ? [line(eigen.vector)]
        : eigen.kind === "scalar"
          ? // Every direction is an eigen-direction: show the two axes as representatives.
            [line([1, 0]), line([0, 1])]
          : [];
  return {
    grid,
    iHat: [a, c],
    jHat: [b, d],
    parallelogram: Float64Array.of(0, 0, a, c, a + b, c + d, b, d, 0, 0),
    det: det.value,
    orientation: det.sign,
    singular: det.singular,
    eigen,
    eigenLines,
  };
}
