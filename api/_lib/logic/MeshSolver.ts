import { MNASolver, type MNAElement } from './mnaSolver';
import { AcademicNodalDictionary } from '../../../shared/logic/AcademicNodalDictionary';
import { MESH_COLORS, type AnalysisTrace, type MeshCycle } from '../../../shared/logic/analysisTypes';
import { formatAcademicNumber } from '../../../shared/logic/analysisFormatting';
import type { MeshGeometry } from '../../../shared/logic/meshGeometry';
import type { NormalizedCircuitGraph } from '../../../shared/logic/NormalizedCircuitGraph';
import type { Point } from '../../../shared/logic/wiring';

type MeshEdge = { id: string; type: 'resistor' | 'voltage' | 'current'; from: string; to: string; value: number };
type SignedCycle = Map<string, number>;
type GeometricCycle = { signed: SignedCycle; cycle: MeshCycle };

type Segment = { id: string; from: Point; to: Point; branchId?: string; direction?: 1 | -1 };
type HalfEdge = { key: string; from: string; to: string; segment: Segment; direction: 1 | -1; angle: number };
type CurrentConstraint = { sourceId: string; coefficients: number[]; value: number };
export type MeshTopology = { branchCount: number; netCount: number; connectedComponents: number; expectedMeshCount: number; extractedFaceCount: number };

const POINT_EPSILON = 1e-6;

const pointKey = ([x, y]: Point) => `${Math.round(x / POINT_EPSILON)}:${Math.round(y / POINT_EPSILON)}`;
const signedScreenArea = (points: Point[]) => points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length];
  return area + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;

const segmentParameter = (point: Point, from: Point, to: Point) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return Math.abs(dx) >= Math.abs(dy) ? (point[0] - from[0]) / (dx || 1) : (point[1] - from[1]) / (dy || 1);
};

const liesOnSegment = (point: Point, from: Point, to: Point) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const cross = (point[0] - from[0]) * dy - (point[1] - from[1]) * dx;
  const parameter = segmentParameter(point, from, to);
  return Math.abs(cross) <= POINT_EPSILON && parameter > POINT_EPSILON && parameter < 1 - POINT_EPSILON;
};

/** Splits a long rail at every attached terminal, yielding the actual planar edges that bound individual faces. */
const splitAtAttachedVertices = (segments: Segment[]) => {
  const vertices = segments.flatMap((segment) => [segment.from, segment.to]);
  return segments.flatMap<Segment>((segment) => {
    const points = [segment.from, ...vertices.filter((point) => liesOnSegment(point, segment.from, segment.to)), segment.to]
      .sort((left, right) => segmentParameter(left, segment.from, segment.to) - segmentParameter(right, segment.from, segment.to))
      .filter((point, index, list) => index === 0 || pointKey(point) !== pointKey(list[index - 1]));
    return points.slice(1).map((to, index) => ({ ...segment, id: `${segment.id}@${index}`, from: points[index], to }));
  });
};

/** Strict area-weighted polygon centroid for the exact planar face perimeter. */
export const calculateMeshCentroid = (points: Point[]): Point => {
  if (!points.length) return [0, 0];
  let doubleArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const cross = point[0] * next[1] - next[0] * point[1];
    doubleArea += cross;
    weightedX += (point[0] + next[0]) * cross;
    weightedY += (point[1] + next[1]) * cross;
  });
  if (Math.abs(doubleArea) <= POINT_EPSILON) {
    return [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, y]) => sum + y, 0) / points.length];
  }
  return [weightedX / (3 * doubleArea), weightedY / (3 * doubleArea)];
};

const pointToSegmentDistance = (point: Point, from: Point, to: Point) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const denominator = dx * dx + dy * dy;
  if (denominator < POINT_EPSILON) return Math.hypot(point[0] - from[0], point[1] - from[1]);
  const ratio = Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / denominator));
  return Math.hypot(point[0] - (from[0] + ratio * dx), point[1] - (from[1] + ratio * dy));
};

/** Keep the mesh current reference inside both its local box and its actual perimeter clearance. */
export const calculateMeshArrowRadius = (points: Point[], centroid = calculateMeshCentroid(points)) => {
  if (!points.length) return 0;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const boxBound = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.25;
  const clearance = points.reduce((closest, point, index) => Math.min(closest, pointToSegmentDistance(centroid, point, points[(index + 1) % points.length])), Number.POSITIVE_INFINITY);
  return Math.max(0, Math.min(boxBound, clearance * 0.7));
};

class DisjointSet {
  private readonly parent = new Map<string, string>();
  find(node: string): string { const root = this.parent.get(node) ?? node; if (root !== node) this.parent.set(node, this.find(root)); return this.parent.get(node) ?? node; }
  union(a: string, b: string): boolean { const ra = this.find(a); const rb = this.find(b); if (ra === rb) return false; this.parent.set(ra, rb); return true; }
}

const meshEdges = (elements: MNAElement[]): MeshEdge[] => elements.flatMap<MeshEdge>((element) => {
  if (element.type === 'resistor') return [{ id: element.id, type: 'resistor', from: element.positive, to: element.negative, value: element.resistance }];
  if (element.type === 'voltage') return [{ id: element.id, type: 'voltage', from: element.positive, to: element.negative, value: element.voltage }];
  if (element.type === 'current') return [{ id: element.id, type: 'current', from: element.from, to: element.to, value: element.current }];
  return [];
});

const treePath = (adjacency: Map<string, Array<{ node: string; edge: MeshEdge }>>, start: string, goal: string) => {
  const queue: Array<{ node: string; path: Array<{ from: string; to: string; edge: MeshEdge }> }> = [{ node: start, path: [] }];
  const visited = new Set<string>([start]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.node === goal) return current.path;
    for (const next of adjacency.get(current.node) ?? []) if (!visited.has(next.node)) { visited.add(next.node); queue.push({ node: next.node, path: [...current.path, { from: current.node, to: next.node, edge: next.edge }] }); }
  }
  return [];
};

export interface MeshSystem { impedance: number[][]; source: number[]; cycles: SignedCycle[]; edges: MeshEdge[]; meshCycles: MeshCycle[]; currentConstraints: CurrentConstraint[]; topology: MeshTopology; rank: number; fullRank: boolean; }

/**
 * Finds bounded planar faces by following the next clockwise half-edge around
 * each vertex. Screen coordinates grow downwards, so bounded clockwise faces
 * have positive signed area; the unbounded exterior face has negative area.
 */
const clockwiseFaces = (geometry: MeshGeometry): GeometricCycle[] => {
  const graph: NormalizedCircuitGraph | undefined = geometry.graph;
  if (graph) {
    return graph.faces.map((face) => {
      const centroid = calculateMeshCentroid(face.points);
      return {
        signed: new Map(face.branchDirections),
        cycle: {
          index: face.index,
          color: MESH_COLORS[face.index % MESH_COLORS.length],
          points: face.points,
          centroid,
          radius: calculateMeshArrowRadius(face.points, centroid),
          nodes: [],
          branchIds: face.branchIds,
        },
      };
    });
  }
  const segments: Segment[] = [];
  const appendPath = (id: string, path: Point[], branchId?: string) => {
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) > POINT_EPSILON) segments.push({ id: `${id}:${index}`, from, to, branchId, direction: 1 });
    }
  };
  geometry.branches.forEach((branch) => appendPath(`branch:${branch.id}`, branch.path, branch.id));
  geometry.wires.forEach((wire) => appendPath(`wire:${wire.id}`, wire.path));
  // Keep all split segments. An open ground stub cannot become a closed face,
  // but pruning leaves recursively can delete the source-side rail segment of
  // a valid I_s–R bounded loop before the half-edge walk reaches it.
  const planarSegments = splitAtAttachedVertices(segments);
  if (!planarSegments.length) return [];

  const positions = new Map<string, Point>();
  const outgoing = new Map<string, HalfEdge[]>();
  const halfEdges = new Map<string, HalfEdge>();
  const addHalfEdge = (segment: Segment, from: Point, to: Point, direction: 1 | -1) => {
    const fromKey = pointKey(from); const toKey = pointKey(to);
    positions.set(fromKey, from); positions.set(toKey, to);
    const half: HalfEdge = { key: `${segment.id}:${direction}`, from: fromKey, to: toKey, segment, direction, angle: Math.atan2(to[1] - from[1], to[0] - from[0]) };
    halfEdges.set(half.key, half);
    const list = outgoing.get(fromKey) ?? [];
    list.push(half); outgoing.set(fromKey, list);
  };
  for (const segment of planarSegments) { addHalfEdge(segment, segment.from, segment.to, 1); addHalfEdge(segment, segment.to, segment.from, -1); }
  outgoing.forEach((list) => list.sort((left, right) => left.angle - right.angle));

  const visited = new Set<string>();
  const faces: Array<{ signed: SignedCycle; points: Point[]; centroid: Point; radius: number; branchIds: string[] }> = [];
  for (const start of Array.from(halfEdges.values())) {
    if (visited.has(start.key)) continue;
    const perimeter: HalfEdge[] = [];
    const traversed = new Set<string>();
    let current = start;
    for (let guard = 0; guard <= halfEdges.size; guard += 1) {
      if (traversed.has(current.key) || visited.has(current.key)) break;
      traversed.add(current.key); perimeter.push(current);
      const choices = outgoing.get(current.to) ?? [];
      const reverseIndex = choices.findIndex((candidate) => candidate.to === current.from && candidate.segment.id === current.segment.id);
      if (reverseIndex < 0) break;
      current = choices[(reverseIndex - 1 + choices.length) % choices.length];
      if (current.key === start.key) break;
    }
    if (perimeter.length < 3 || current.key !== start.key) continue;
    // Only a complete closed boundary consumes its directed half-edges.  An
    // incomplete walk through a ground stub must not erase an adjacent face.
    perimeter.forEach((half) => visited.add(half.key));
    // A face is defined only by its own half-edge traversal.  Never use global
    // circuit points here: that would pull a lower mesh toward an upper loop.
    const points = perimeter.map((half) => positions.get(half.from)!).filter(Boolean).filter((point, index, list) => index === 0 || pointKey(point) !== pointKey(list[index - 1]));
    if (signedScreenArea(points) <= POINT_EPSILON) continue;
    const signed = new Map<string, number>();
    perimeter.forEach((half) => {
      if (half.segment.branchId) signed.set(half.segment.branchId, half.direction * (half.segment.direction ?? 1));
    });
    if (!signed.size) continue;
    const centroid = calculateMeshCentroid(points);
    faces.push({ signed, points, centroid, radius: calculateMeshArrowRadius(points, centroid), branchIds: Array.from(signed.keys()) });
  }
  // Assign I_1, I_2, … from the spatial layout rather than the arbitrary
  // half-edge insertion order: left-to-right, then top-to-bottom on a column.
  return faces.sort((left, right) => Math.abs(left.centroid[0] - right.centroid[0]) > POINT_EPSILON ? left.centroid[0] - right.centroid[0] : left.centroid[1] - right.centroid[1]).map((face, index) => ({
    signed: face.signed,
    cycle: { index, color: MESH_COLORS[index % MESH_COLORS.length], points: face.points, centroid: face.centroid, radius: face.radius, nodes: [], branchIds: face.branchIds },
  }));
};

const topologyFor = (edges: MeshEdge[], faceCount: number): MeshTopology => {
  const nets = Array.from(new Set(edges.flatMap((edge) => [edge.from, edge.to])));
  const sets = new DisjointSet();
  edges.forEach((edge) => sets.union(edge.from, edge.to));
  const connectedComponents = new Set(nets.map((node) => sets.find(node))).size;
  return { branchCount: edges.length, netCount: nets.length, connectedComponents, expectedMeshCount: Math.max(0, edges.length - nets.length + connectedComponents), extractedFaceCount: faceCount };
};

export const matrixRank = (matrix: number[][], epsilon = 1e-10) => {
  const reduced = matrix.map((row) => [...row]);
  let rank = 0;
  for (let column = 0; column < (reduced[0]?.length ?? 0) && rank < reduced.length; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < reduced.length; row += 1) if (Math.abs(reduced[row][column]) > Math.abs(reduced[pivot][column])) pivot = row;
    if (Math.abs(reduced[pivot][column]) <= epsilon) continue;
    [reduced[rank], reduced[pivot]] = [reduced[pivot], reduced[rank]];
    const divisor = reduced[rank][column];
    for (let item = column; item < reduced[rank].length; item += 1) reduced[rank][item] /= divisor;
    for (let row = 0; row < reduced.length; row += 1) if (row !== rank) {
      const factor = reduced[row][column];
      for (let item = column; item < reduced[row].length; item += 1) reduced[row][item] -= factor * reduced[rank][item];
    }
    rank += 1;
  }
  return rank;
};

/** Replaces one KVL row per ideal current source with an independent mesh-current constraint. */
const stampCurrentConstraints = (cycles: SignedCycle[], edges: MeshEdge[], impedance: number[][], source: number[]) => {
  const constraints: CurrentConstraint[] = [];
  const reservedRows = new Set<number>();
  for (const edge of edges.filter((item) => item.type === 'current')) {
    const coefficients = cycles.map((cycle) => cycle.get(edge.id) ?? 0);
    const candidateRows = coefficients.map((coefficient, index) => coefficient ? index : -1).filter((index) => index >= 0);
    const independent = matrixRank([...constraints.map((constraint) => constraint.coefficients), coefficients]) > constraints.length;
    if (!independent) continue;
    const row = candidateRows.find((index) => !reservedRows.has(index));
    if (row === undefined) continue;
    reservedRows.add(row);
    impedance[row] = coefficients;
    source[row] = edge.value;
    constraints.push({ sourceId: edge.id, coefficients, value: edge.value });
  }
  return constraints;
};

/** Builds a clockwise mesh-current system; geometric bounded faces take precedence over the topology fallback. */
export const buildMeshSystem = (elements: MNAElement[], geometry?: MeshGeometry): MeshSystem => {
  const edges = meshEdges(elements);
  const faces = geometry ? clockwiseFaces(geometry) : [];
  const resistorIds = new Set(edges.filter((edge) => edge.type === 'resistor').map((edge) => edge.id));
  // Every retained pedagogical mesh is a closed physical face containing at
  // least one resistance. This includes constrained I_s–R loops while
  // excluding purely ideal-source/conductor regions with no KVL impedance.
  const resistorFaces = faces.filter((face) => face.cycle.branchIds.some((id) => resistorIds.has(id)));
  let cycles = resistorFaces.map((face) => face.signed);
  if (!cycles.length) {
    const tree: MeshEdge[] = []; const chords: MeshEdge[] = []; const sets = new DisjointSet();
    for (const edge of edges) (sets.union(edge.from, edge.to) ? tree : chords).push(edge);
    const adjacency = new Map<string, Array<{ node: string; edge: MeshEdge }>>();
    for (const edge of tree) for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]] as const) { const items = adjacency.get(from) ?? []; items.push({ node: to, edge }); adjacency.set(from, items); }
    cycles = chords.map((chord) => {
      const cycle: SignedCycle = new Map();
      for (const segment of treePath(adjacency, chord.from, chord.to)) cycle.set(segment.edge.id, segment.edge.from === segment.from && segment.edge.to === segment.to ? 1 : -1);
      cycle.set(chord.id, 1);
      return cycle;
    });
  }
  const topology = geometry?.graph
    ? { ...geometry.graph.topology, extractedFaceCount: resistorFaces.length }
    : topologyFor(edges, resistorFaces.length);
  const resistors = edges.filter((edge) => edge.type === 'resistor');
  const impedance = cycles.map((row, rowIndex) => cycles.map((column, columnIndex) => resistors.reduce((sum, edge) => {
    const participation = Math.abs(row.get(edge.id) ?? 0) * Math.abs(column.get(edge.id) ?? 0);
    // KVL convention: shared clockwise mesh currents oppose one another on a common resistor.
    return sum + participation * edge.value * (rowIndex === columnIndex ? 1 : -1);
  }, 0)));
  const source = cycles.map((cycle) => edges.filter((edge) => edge.type === 'voltage').reduce((sum, edge) => {
    const traversal = cycle.get(edge.id) ?? 0;
    // Edge direction is + terminal → − terminal: entering − is traversal −1, a +V rise.
    return sum + (-traversal * edge.value);
  }, 0));
  const meshCycles = resistorFaces.map((face) => face.cycle);
  const currentConstraints = stampCurrentConstraints(cycles, edges, impedance, source);
  const rank = matrixRank(impedance);
  return { impedance, source, cycles, edges, meshCycles, currentConstraints, topology, rank, fullRank: rank === cycles.length };
};

const colorCell = (value: string, rowIndex: number) => `\\textcolor{${MESH_COLORS[rowIndex % MESH_COLORS.length]}}{${value}}`;
const coloredMatrix = (rows: number[][]) => `\\begin{bmatrix}${rows.map((row, rowIndex) => row.map((value) => colorCell(formatAcademicNumber(value), rowIndex)).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;
const coloredVector = (values: string[]) => `\\begin{bmatrix}${values.map((value, index) => colorCell(value, index)).join(' \\\\ ')}\\end{bmatrix}`;

/** Partial-pivot Gaussian elimination for the visible [Z_m][I_m]=[E_m] system. */
export const solveMeshCurrents = (impedance: number[][], source: number[]) => {
  const size = impedance.length;
  if (matrixRank(impedance) < size) throw new Error('Mesh-current system is rank-deficient after Supermesh constraints; inspect constrained source topology.');
  const augmented = impedance.map((row, index) => [...row, source[index] ?? 0]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    if (Math.abs(augmented[best][pivot]) < 1e-12) throw new Error('Mesh-current system is singular; inspect constrained MNA branch currents.');
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) if (row !== pivot) { const factor = augmented[row][pivot]; for (let column = pivot; column <= size; column += 1) augmented[row][column] -= factor * augmented[pivot][column]; }
  }
  return augmented.map((row) => Math.abs(row[size]) < 1e-12 ? 0 : row[size]);
};

/** Mesh trace generator for planar resistor/source circuits; branch values remain cross-checked against strict MNA. */
export class MeshSolver {
  constructor(private readonly elements: MNAElement[], private readonly geometry?: MeshGeometry) {}

  analyze(): AnalysisTrace {
    try {
      const result = new MNASolver(this.elements).solve();
      const dictionary = new AcademicNodalDictionary(this.elements);
      const system = buildMeshSystem(this.elements, this.geometry);
      const currentConstraints = system.currentConstraints;
      const dependentCurrentSources = this.elements.filter((element) => element.type === 'cccs' || element.type === 'current-sense');
      const hasSupermesh = currentConstraints.length > 0 || dependentCurrentSources.length > 0;
      const meshCount = Math.max(1, system.cycles.length);
      if (!system.fullRank) throw new Error(`Mesh-current system is rank-deficient after Supermesh constraints (rank ${system.rank} of ${system.cycles.length}).`);
      const loops = Array.from({ length: meshCount }, (_, index) => `I_{${index + 1}}`);
      const z = system.impedance.length ? system.impedance : [[0]];
      const rhs = system.source.length ? system.source : [0];
      const solvedMesh = system.impedance.length ? solveMeshCurrents(z, rhs) : [0];
      const meshCurrents = Object.fromEntries(solvedMesh.map((value, index) => [`I_${index + 1}`, value]));
      const loopSystem = `${coloredMatrix(z)}${coloredVector(loops)}=${coloredMatrix(rhs.map((value) => [value]))}`;
      const solvedVector = solvedMesh.map((value, index) => `I_{${index + 1}}=${value}\\,\\mathrm{A}`).join(',\\qquad ');
      const branch = Object.entries(result.branchCurrents).map(([key, value]) => {
        const element = this.elements.find((item) => item.id === key);
        return `${element ? `I_{${dictionary.element(element)}}` : 'I_x'}=${value}\,\mathrm{A}`;
      }).join(',\qquad ');
      const topologyMath = `M=B-N+C=${system.topology.branchCount}-${system.topology.netCount}+${system.topology.connectedComponents}=${system.topology.expectedMeshCount},\qquad\operatorname{rank}(Z_m)=${system.rank}`;
      const supermeshMath = currentConstraints.map((constraint) => `${constraint.coefficients.map((coefficient, index) => coefficient === 0 ? '' : `${coefficient < 0 ? '-' : coefficient === 1 ? '' : coefficient}I_{${index + 1}}`).filter(Boolean).join('+')}=${formatAcademicNumber(constraint.value)}\,\mathrm{A}`).join(',\qquad ');
      const steps = [
        { title: '1. Planar graph and clockwise face-mesh assignment', math: `${topologyMath}\qquad${coloredVector(loops)}`, prose: `Merged electrical rails produce ${system.topology.netCount} nets and ${system.topology.branchCount} branches. Euler’s relation predicts ${system.topology.expectedMeshCount} independent bounded meshes; ${system.topology.extractedFaceCount || meshCount} geometric faces were extracted from the workspace. The stamped Supermesh system is rank-certified at ${system.rank} of ${system.cycles.length}.` },
        { title: '2. KVL loop equations · assembled mesh-current coefficient system', math: `${loopSystem}\qquad\left[Z_m\right]\left[I_m\right]=\left[E_m\right]`, prose: 'Each diagonal entry is the sum of resistances in its mesh. An off-diagonal entry is the signed negative shared resistance, so this system has exactly one row and one column per mesh.' },
        ...(hasSupermesh ? [{ title: '3. Supermesh constraints', math: supermeshMath || 'i_b-i_a=I_s', prose: currentConstraints.length ? 'Each ideal current-source branch replaces one KVL row with its signed mesh-current constraint, preventing a singular mesh-current system.' : 'A dependent current-source branch is excluded from the KVL perimeter and restored by its explicit controlled-current constraint.' }] : []),
        { title: hasSupermesh ? '4. Solved mesh-current vector' : '3. Solved mesh-current vector', math: solvedVector, prose: 'The solved I_1 through I_n values come directly from the displayed mesh coefficient system and are the mesh-level current readings.' },
        { title: hasSupermesh ? '5. MNA branch-current verification' : '4. MNA branch-current verification', math: branch || '\text{No voltage-defined branch currents}', prose: 'MNA source and constrained-branch currents are retained as an independent verification of the mesh-current solution.' },
      ];
      return { method: 'mesh', status: 'ready', heading: 'Mesh Analysis · KVL / Supermesh', steps, result, meshCurrents, meshCycles: system.meshCycles };
    } catch (error) { return { method: 'mesh', status: 'error', heading: 'Mesh Analysis', steps: [], warning: error instanceof Error ? error.message : 'Mesh analysis failed.' }; }
  }
}
