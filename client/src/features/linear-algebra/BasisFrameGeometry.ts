/** Pure 3D basis-frame geometry for Phase 1C visualization. */

export type Vector3 = [number, number, number];
export type FrameEdge = { from: Vector3; to: Vector3 };

const EPSILON = 1e-9;

function add(left: Vector3, right: Vector3): Vector3 { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function scale(vector: Vector3, factor: number): Vector3 { return [vector[0] * factor, vector[1] * factor, vector[2] * factor]; }
function assertThreeByThree(matrix: number[][], name: string) {
  if (matrix.length !== 3 || matrix.some((row) => row.length !== 3 || row.some((value) => !Number.isFinite(value)))) throw new Error(`${name} must be a finite 3×3 matrix.`);
}
function assertThreeVector(vector: number[], name: string) {
  if (vector.length !== 3 || vector.some((value) => !Number.isFinite(value))) throw new Error(`${name} must be a finite three-coordinate vector.`);
}

export class BasisFrameGeometry {
  readonly basisVectors: [Vector3, Vector3, Vector3];
  readonly volume: number;
  readonly vertices: Vector3[];
  readonly edges: FrameEdge[];

  constructor(basis: number[][]) {
    assertThreeByThree(basis, "Basis matrix");
    this.basisVectors = [
      [basis[0][0], basis[1][0], basis[2][0]],
      [basis[0][1], basis[1][1], basis[2][1]],
      [basis[0][2], basis[1][2], basis[2][2]],
    ];
    const [b1, b2, b3] = this.basisVectors;
    this.volume = b1[0] * (b2[1] * b3[2] - b2[2] * b3[1]) - b2[0] * (b1[1] * b3[2] - b1[2] * b3[1]) + b3[0] * (b1[1] * b2[2] - b1[2] * b2[1]);
    if (Math.abs(this.volume) <= EPSILON) throw new Error("A degenerate basis cannot form a 3D frame.");
    this.vertices = Array.from({ length: 8 }, (_, binary) => {
      let point: Vector3 = [0, 0, 0];
      this.basisVectors.forEach((vector, index) => { if (binary & (1 << index)) point = add(point, vector); });
      return point;
    });
    this.edges = [];
    for (let vertex = 0; vertex < 8; vertex++) {
      for (let axis = 0; axis < 3; axis++) {
        const neighbor = vertex ^ (1 << axis);
        if (vertex < neighbor) this.edges.push({ from: this.vertices[vertex], to: this.vertices[neighbor] });
      }
    }
  }

  coordinatePoint(coordinates: number[]): Vector3 {
    assertThreeVector(coordinates, "Basis coordinates");
    return this.basisVectors.reduce<Vector3>((point, vector, index) => add(point, scale(vector, coordinates[index])), [0, 0, 0]);
  }

  coordinatePath(coordinates: number[]): Vector3[] {
    assertThreeVector(coordinates, "Basis coordinates");
    const points: Vector3[] = [[0, 0, 0]];
    this.basisVectors.forEach((vector, index) => points.push(add(points.at(-1)!, scale(vector, coordinates[index]))));
    return points;
  }
}
