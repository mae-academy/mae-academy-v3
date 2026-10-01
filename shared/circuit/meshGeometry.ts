import type { Point } from './circuitTypes';

export interface MeshBranchGeometry {
  /** MNA element id; the path is oriented from the element's positive to negative terminal. */
  id: string;
  path: Point[];
}

export interface MeshWireGeometry {
  id: string;
  path: Point[];
}

/** One bounded planar face of the schematic, as extracted by the canvas. `branchDirections` is a Map locally and [id, ±1] pairs on the wire. */
export interface MeshFaceData {
  index: number;
  points: Point[];
  branchDirections: Iterable<[string, number]>;
  branchIds: string[];
  signedArea: number;
}

export interface MeshTopologyCounts {
  branchCount: number;
  netCount: number;
  connectedComponents: number;
  expectedMeshCount: number;
  extractedFaceCount: number;
}

export interface MeshGeometry {
  branches: MeshBranchGeometry[];
  wires: MeshWireGeometry[];
  /** Pre-extracted faces and topology counts (the canvas's NormalizedCircuitGraph provides exactly this shape). */
  graph?: { faces: MeshFaceData[]; topology: MeshTopologyCounts };
}
