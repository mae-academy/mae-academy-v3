import { getDef } from '@/simulators/digital-logic/models/componentDefs';
import { terminalKey, type CircuitComponent, type CircuitWire } from '@/simulators/digital-logic/models/circuitTypes';
import { getTerminalWorldPos, type Point } from '@/simulators/digital-logic/models/wiring';

export type NormalizedBranchKind = 'resistor' | 'voltage' | 'current' | 'other';

export interface NormalizedBranch {
  id: string;
  kind: NormalizedBranchKind;
  positiveTerminal: string;
  negativeTerminal: string;
  positiveNet: string;
  negativeNet: string;
  path: Point[];
}

export interface NormalizedSegment {
  id: string;
  from: Point;
  to: Point;
  branchId?: string;
  direction?: 1 | -1;
}

export interface NormalizedFace {
  index: number;
  points: Point[];
  branchDirections: Map<string, number>;
  branchIds: string[];
  signedArea: number;
}

export interface EssentialJunction {
  net: string;
  degree: number;
  point: Point;
}

export interface NormalizedTopologyCounts {
  branchCount: number;
  netCount: number;
  connectedComponents: number;
  expectedMeshCount: number;
  extractedFaceCount: number;
}

type HalfEdge = { key: string; from: string; to: string; segment: NormalizedSegment; direction: 1 | -1; angle: number };

const EPSILON = 1e-6;

const pointKey = ([x, y]: Point) => `${Math.round(x / EPSILON)}:${Math.round(y / EPSILON)}`;
const equalPoints = (left: Point, right: Point) => pointKey(left) === pointKey(right);
const signedArea = (points: Point[]) => points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length];
  return area + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;

class DisjointSet {
  private readonly parent = new Map<string, string>();

  find(value: string): string {
    const prior = this.parent.get(value);
    if (!prior) { this.parent.set(value, value); return value; }
    if (prior === value) return value;
    const root = this.find(prior);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent.set(b, a);
  }
}

function parameterOnSegment(point: Point, from: Point, to: Point): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return Math.abs(dx) >= Math.abs(dy) ? (point[0] - from[0]) / (dx || 1) : (point[1] - from[1]) / (dy || 1);
}

function liesStrictlyOnSegment(point: Point, from: Point, to: Point): boolean {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const cross = (point[0] - from[0]) * dy - (point[1] - from[1]) * dx;
  const t = parameterOnSegment(point, from, to);
  return Math.abs(cross) <= EPSILON && t > EPSILON && t < 1 - EPSILON;
}

function lineIntersection(left: NormalizedSegment, right: NormalizedSegment): Point | null {
  const [x1, y1] = left.from; const [x2, y2] = left.to;
  const [x3, y3] = right.from; const [x4, y4] = right.to;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) <= EPSILON) return null;
  const leftT = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const rightT = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denominator;
  if (leftT <= EPSILON || leftT >= 1 - EPSILON || rightT <= EPSILON || rightT >= 1 - EPSILON) return null;
  return [x1 + leftT * (x2 - x1), y1 + leftT * (y2 - y1)];
}

/** Split every rail and branch at all genuine geometric vertices, including crossings. */
export function splitNormalizedSegments(segments: NormalizedSegment[]): NormalizedSegment[] {
  const vertices = segments.flatMap((segment) => [segment.from, segment.to]);
  const intersections: Point[] = [];
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const hit = lineIntersection(segments[left], segments[right]);
      if (hit) intersections.push(hit);
    }
  }
  const allVertices = [...vertices, ...intersections];
  return segments.flatMap((segment) => {
    const local = [segment.from, ...allVertices.filter((point) => liesStrictlyOnSegment(point, segment.from, segment.to)), segment.to]
      .sort((left, right) => parameterOnSegment(left, segment.from, segment.to) - parameterOnSegment(right, segment.from, segment.to))
      .filter((point, index, points) => index === 0 || !equalPoints(point, points[index - 1]));
    return local.slice(1).flatMap((to, index) => equalPoints(local[index], to) ? [] : [{ ...segment, id: `${segment.id}@${index}`, from: local[index], to }]);
  });
}

function pathSegments(id: string, path: Point[], branchId?: string): NormalizedSegment[] {
  const segments: NormalizedSegment[] = [];
  for (let index = 1; index < path.length; index += 1) {
    if (!equalPoints(path[index - 1], path[index])) segments.push({ id: `${id}:${index}`, from: path[index - 1], to: path[index], branchId, direction: 1 });
  }
  return segments;
}

function terminalPoint(component: CircuitComponent, terminalId: string): Point | null {
  const terminal = getDef(component.type)?.terminals.find((item) => item.id === terminalId);
  return terminal ? getTerminalWorldPos(component.x, component.y, terminal.x, terminal.y, component.rotation, component.flipH, component.flipV) : null;
}

function branchTerminals(component: CircuitComponent): readonly [string, string] | null {
  if (component.type === 'resistor') return ['a', 'b'];
  if (component.type === 'dc-voltage' || component.type === 'dc-rail' || component.type === 'dc-current') return ['pos', 'neg'];
  if (component.type === 'vccs' || component.type === 'vcvs' || component.type === 'cccs' || component.type === 'ccvs') return ['pos', 'neg'];
  return null;
}

function branchKind(component: CircuitComponent): NormalizedBranchKind {
  if (component.type === 'resistor') return 'resistor';
  if (component.type === 'dc-voltage' || component.type === 'dc-rail') return 'voltage';
  if (component.type === 'dc-current') return 'current';
  return 'other';
}

/**
 * One authoritative topology contract. Electrical nets are built once from
 * terminals/wires; the exact same contract yields planar geometry, faces,
 * Euler counts, and visual essential-junction locations.
 */
export class NormalizedCircuitGraph {
  readonly branches: NormalizedBranch[];
  readonly nets: Map<string, string[]>;
  readonly faceSegments: NormalizedSegment[];
  readonly faces: NormalizedFace[];
  readonly essentialJunctions: EssentialJunction[];
  readonly topology: NormalizedTopologyCounts;
  readonly referenceNet: string | null;
  private readonly terminalPoints: Map<string, Point>;

  private constructor(
    branches: NormalizedBranch[],
    nets: Map<string, string[]>,
    faceSegments: NormalizedSegment[],
    faces: NormalizedFace[],
    essentialJunctions: EssentialJunction[],
    topology: NormalizedTopologyCounts,
    referenceNet: string | null,
    terminalPoints: Map<string, Point>,
  ) {
    this.branches = branches;
    this.nets = nets;
    this.faceSegments = faceSegments;
    this.faces = faces;
    this.essentialJunctions = essentialJunctions;
    this.topology = topology;
    this.referenceNet = referenceNet;
    this.terminalPoints = terminalPoints;
  }

  static fromCanvas(components: CircuitComponent[], wires: CircuitWire[]): NormalizedCircuitGraph {
    const terminals = new DisjointSet();
    const terminalPoints = new Map<string, Point>();
    components.forEach((component) => {
      (getDef(component.type)?.terminals ?? []).forEach((terminal) => {
        const key = terminalKey(component.id, terminal.id);
        terminals.find(key);
        terminalPoints.set(key, getTerminalWorldPos(component.x, component.y, terminal.x, terminal.y, component.rotation, component.flipH, component.flipV));
      });
    });
    wires.forEach((wire) => terminals.union(terminalKey(wire.fromComp, wire.fromTerm), terminalKey(wire.toComp, wire.toTerm)));

    const ground = components.find((component) => component.type === 'ground');
    const groundTerminal = ground ? getDef(ground.type)?.terminals[0] : undefined;
    const referenceRoot = ground && groundTerminal ? terminals.find(terminalKey(ground.id, groundTerminal.id)) : null;
    const netForTerminal = (key: string) => {
      const root = terminals.find(key);
      return root === referenceRoot ? '0' : `n:${root}`;
    };
    const nets = new Map<string, string[]>();
    terminalPoints.forEach((_point, key) => {
      const net = netForTerminal(key);
      const members = nets.get(net) ?? [];
      members.push(key);
      nets.set(net, members);
    });

    const branches = components.flatMap<NormalizedBranch>((component) => {
      const pair = branchTerminals(component);
      if (!pair) return [];
      const [positiveId, negativeId] = pair;
      const positiveTerminal = terminalKey(component.id, positiveId);
      const negativeTerminal = terminalKey(component.id, negativeId);
      const positive = terminalPoints.get(positiveTerminal);
      const negative = terminalPoints.get(negativeTerminal);
      return positive && negative ? [{
        id: component.id,
        kind: branchKind(component),
        positiveTerminal,
        negativeTerminal,
        positiveNet: netForTerminal(positiveTerminal),
        negativeNet: netForTerminal(negativeTerminal),
        path: [positive, negative],
      }] : [];
    });

    const groundIds = new Set(components.filter((component) => component.type === 'ground').map((component) => component.id));
    const rawFaceSegments = [
      ...branches.flatMap((branch) => pathSegments(`branch:${branch.id}`, branch.path, branch.id)),
      ...wires.filter((wire) => !groundIds.has(wire.fromComp) && !groundIds.has(wire.toComp)).flatMap((wire) => pathSegments(`wire:${wire.id}`, wire.path)),
    ];
    const faceSegments = splitNormalizedSegments(rawFaceSegments);
    const faces = extractBoundedFaces(faceSegments);
    const topology = topologyCounts(branches);
    topology.extractedFaceCount = faces.length;
    const essentialJunctions = calculateEssentialJunctions(branches, nets, terminalPoints, faceSegments);
    return new NormalizedCircuitGraph(branches, nets, faceSegments, faces, essentialJunctions, topology, referenceRoot ? '0' : null, terminalPoints);
  }

  netForTerminal(componentId: string, terminalId: string): string {
    const key = terminalKey(componentId, terminalId);
    for (const [net, terminals] of Array.from(this.nets.entries())) if (terminals.includes(key)) return net;
    return `n:${key}`;
  }

  terminalPosition(componentId: string, terminalId: string): Point | null {
    return this.terminalPoints.get(terminalKey(componentId, terminalId)) ?? null;
  }
}

function extractBoundedFaces(segments: NormalizedSegment[]): NormalizedFace[] {
  const positions = new Map<string, Point>();
  const outgoing = new Map<string, HalfEdge[]>();
  const halfEdges = new Map<string, HalfEdge>();
  const addHalf = (segment: NormalizedSegment, from: Point, to: Point, direction: 1 | -1) => {
    const fromKey = pointKey(from); const toKey = pointKey(to);
    positions.set(fromKey, from); positions.set(toKey, to);
    const half: HalfEdge = { key: `${segment.id}:${direction}`, from: fromKey, to: toKey, segment, direction, angle: Math.atan2(to[1] - from[1], to[0] - from[0]) };
    halfEdges.set(half.key, half);
    const list = outgoing.get(fromKey) ?? [];
    list.push(half);
    outgoing.set(fromKey, list);
  };
  segments.forEach((segment) => { addHalf(segment, segment.from, segment.to, 1); addHalf(segment, segment.to, segment.from, -1); });
  outgoing.forEach((list) => list.sort((left, right) => left.angle - right.angle));

  const visited = new Set<string>();
  const faces: NormalizedFace[] = [];
  Array.from(halfEdges.values()).forEach((start) => {
    if (visited.has(start.key)) return;
    const perimeter: HalfEdge[] = [];
    const traversed = new Set<string>();
    let current = start;
    for (let guard = 0; guard <= halfEdges.size; guard += 1) {
      if (traversed.has(current.key) || visited.has(current.key)) break;
      traversed.add(current.key);
      perimeter.push(current);
      const options = outgoing.get(current.to) ?? [];
      const reverse = options.findIndex((candidate) => candidate.to === current.from && candidate.segment.id === current.segment.id);
      if (reverse < 0) break;
      current = options[(reverse - 1 + options.length) % options.length];
      if (current.key === start.key) break;
    }
    if (perimeter.length < 3 || current.key !== start.key) return;
    perimeter.forEach((half) => visited.add(half.key));
    const points = perimeter.map((half) => positions.get(half.from)!).filter((point, index, entries) => index === 0 || !equalPoints(point, entries[index - 1]));
    const area = signedArea(points);
    if (area <= EPSILON) return;
    const branchDirections = new Map<string, number>();
    perimeter.forEach((half) => {
      if (half.segment.branchId) branchDirections.set(half.segment.branchId, half.direction * (half.segment.direction ?? 1));
    });
    if (!branchDirections.size) return;
    faces.push({ index: faces.length, points, branchDirections, branchIds: Array.from(branchDirections.keys()), signedArea: area });
  });
  return faces.sort((left, right) => {
    const leftX = Math.min(...left.points.map(([x]) => x));
    const rightX = Math.min(...right.points.map(([x]) => x));
    return Math.abs(leftX - rightX) > EPSILON ? leftX - rightX : Math.min(...left.points.map(([, y]) => y)) - Math.min(...right.points.map(([, y]) => y));
  }).map((face, index) => ({ ...face, index }));
}

function topologyCounts(branches: NormalizedBranch[]): NormalizedTopologyCounts {
  const nets = Array.from(new Set(branches.flatMap((branch) => [branch.positiveNet, branch.negativeNet])));
  const union = new DisjointSet();
  branches.forEach((branch) => union.union(branch.positiveNet, branch.negativeNet));
  const connectedComponents = new Set(nets.map((net) => union.find(net))).size;
  return { branchCount: branches.length, netCount: nets.length, connectedComponents, expectedMeshCount: Math.max(0, branches.length - nets.length + connectedComponents), extractedFaceCount: 0 };
}

function calculateEssentialJunctions(branches: NormalizedBranch[], nets: Map<string, string[]>, terminalPoints: Map<string, Point>, segments: NormalizedSegment[]): EssentialJunction[] {
  return Array.from(nets.entries()).flatMap(([net, terminals]) => {
    if (net === '0') return [];
    const degree = branches.reduce((count, branch) => count + Number(branch.positiveNet === net) + Number(branch.negativeNet === net), 0);
    if (degree < 3) return [];
    const candidates = terminals.map((terminal) => terminalPoints.get(terminal)).filter((point): point is Point => Boolean(point));
    if (!candidates.length) return [];
    const scored = candidates.map((point) => ({ point, score: segments.reduce((count, segment) => count + Number(equalPoints(point, segment.from)) + Number(equalPoints(point, segment.to)), 0) }));
    scored.sort((left, right) => right.score - left.score || left.point[0] - right.point[0] || left.point[1] - right.point[1]);
    return [{ net, degree, point: scored[0].point }];
  });
}
