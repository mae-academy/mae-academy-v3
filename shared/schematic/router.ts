// General netlist -> schematic router. The model describes a circuit purely topologically (parts and the NET each pin
// sits on); this module places the parts and routes every net with an orthogonal grid router, then hands a normal
// coordinate spec to the existing validator/renderer. No archetype is involved, so ANY circuit can be drawn.
//
// Pipeline: parse request -> normalise parts -> orientation candidates (lead directions read from the symbol
// primitives) -> placement (ladder columns: series parts on an axis, shunt parts hanging from it, net-centroid orientation) -> keep-out grid ->
// Dijkstra routing per net (bends and crossings penalised, bodies impassable, crossings only mid-run) -> wires.

import { placePart } from './geometry';
import { analyze } from './netlist';
import type { Issue, PartSpec, Rot, SchematicSpec } from './types';
import { PART_TYPES } from './types';
import { SYMBOL_LIST } from './symbols';

type Dir = 'U' | 'D' | 'L' | 'R';
const DIRS: Dir[] = ['U', 'D', 'L', 'R'];
const DX: Record<Dir, number> = { U: 0, D: 0, L: -1, R: 1 };
const DY: Record<Dir, number> = { U: -1, D: 1, L: 0, R: 0 };
const OPP: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' };
const isHoriz = (d: Dir): boolean => d === 'L' || d === 'R';
const P_PX = 20;
const KEEP = 2; // keep-out margin (grid units) around every body: room for labels and for a straight lead

export type Normalizer = (raw: unknown) => { spec: SchematicSpec | null; errors: Issue[]; warnings: Issue[] };

const REQUEST_KEYS = new Set(['netlist', 'title', 'standard', 'labels']);
const PART_KEYS = new Set(['id', 'type', 'value', 'pins', 'attrs', 'label']);
const NET_RE = /^[A-Za-z0-9_+\-.]{1,24}$/;
const GROUND_RE = /^(0|gnd|ground|agnd|dgnd|pgnd|earth)$/i;
const SPECIAL = new Set(['ground', 'rail', 'port', 'junction']);
const SOURCE_TYPES = new Set(['vsource', 'vsource_ac', 'battery', 'isource']);

/** True when a parsed JSON value is a netlist request (has an own "netlist" key). */
export function isNetlistRequest(json: unknown): boolean {
  return typeof json === 'object' && json !== null && !Array.isArray(json) && Object.prototype.hasOwnProperty.call(json, 'netlist');
}

const err = (code: string, message: string, where?: string): Issue => ({ code, message, where });
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------------------------
// Orientation candidates
// ---------------------------------------------------------------------------------------------------------------

interface TermGeom { name: string; dx: number; dy: number; dir: Dir; optional: boolean }
interface Orient { rot: Rot; flip: boolean; terms: TermGeom[]; box: [number, number, number, number] }

function leadDirOf(pp: ReturnType<typeof placePart> & object, tx: number, ty: number): Dir | null {
  const T: [number, number] = [tx * P_PX, ty * P_PX];
  const towards = (o: [number, number]): Dir | null => {
    const dx = T[0] - o[0], dy = T[1] - o[1];
    if (dx === 0 && dy === 0) return null;
    if (dy === 0) return dx > 0 ? 'R' : 'L';
    if (dx === 0) return dy > 0 ? 'D' : 'U';
    return null;
  };
  for (const p of pp.prims) {
    if (p.k === 'line') {
      if (p.x1 === T[0] && p.y1 === T[1]) { const d = towards([p.x2, p.y2]); if (d) return d; }
      if (p.x2 === T[0] && p.y2 === T[1]) { const d = towards([p.x1, p.y1]); if (d) return d; }
    } else if (p.k === 'poly' && p.pts.length >= 2) {
      const a = p.pts[0], b = p.pts[p.pts.length - 1];
      if (a[0] === T[0] && a[1] === T[1]) { const d = towards(p.pts[1]); if (d) return d; }
      if (b[0] === T[0] && b[1] === T[1]) { const d = towards(p.pts[p.pts.length - 2]); if (d) return d; }
    }
  }
  return null;
}

function orientationsOf(part: PartSpec, std: SchematicSpec['standard']): Orient[] {
  const out: Orient[] = [];
  const seen = new Set<string>();
  for (const flip of [false, true]) {
    for (const rot of [0, 90, 180, 270] as Rot[]) {
      const pp = placePart({ ...part, at: [0, 0], rot, flip }, std, P_PX);
      if (!pp) continue;
      const box = pp.box;
      const terms: TermGeom[] = pp.terminals.map((t) => {
        let dir = leadDirOf(pp, t.x, t.y);
        if (!dir) {
          const dl = Math.abs(t.x - box[0]), dr = Math.abs(t.x - box[2]), du = Math.abs(t.y - box[1]), dd = Math.abs(t.y - box[3]);
          const m = Math.min(dl, dr, du, dd);
          dir = m === dl ? 'L' : m === dr ? 'R' : m === du ? 'U' : 'D';
        }
        return { name: t.name, dx: t.x, dy: t.y, dir, optional: t.optional };
      });
      const sig = JSON.stringify([box, terms.map((t) => [t.name, t.dx, t.dy, t.dir])]);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ rot, flip, terms, box });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------------------------------

interface RPart {
  id: string;
  part: PartSpec;
  orients: Orient[];
  cur: Orient;
  /** pin name -> net name */
  pins: Map<string, string>;
  depth: number;
  /** 'axis' parts sit on the main signal line, 'shunt' parts hang below it, 'top' parts sit above it */
  role: 'axis' | 'shunt' | 'top';
  /** centre of this part's column */
  colX: number;
  px: number;
  py: number;
}
interface Net {
  name: string;
  ground: boolean;
  /** (part id, pin) pairs of real parts */
  pins: { part: string; pin: string }[];
  label: boolean;
}
interface Terminal { id: string; owner: string; net: string; x: number; y: number; dir: Dir; port?: boolean }

const at = (p: RPart): [number, number] => {
  return [p.px, p.py];
};

function termAbs(p: RPart, t: TermGeom): [number, number] {
  const [ax, ay] = at(p);
  return [ax + t.dx, ay + t.dy];
}

// ---------------------------------------------------------------------------------------------------------------
// Binary heap for Dijkstra
// ---------------------------------------------------------------------------------------------------------------

class Heap {
  private c: number[] = [];
  private s: number[] = [];
  get size(): number { return this.c.length; }
  push(cost: number, state: number): void {
    const { c, s } = this;
    let i = c.length;
    c.push(cost); s.push(state);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= c[i]) break;
      [c[p], c[i]] = [c[i], c[p]];
      [s[p], s[i]] = [s[i], s[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const { c, s } = this;
    const top: [number, number] = [c[0], s[0]];
    const lc = c.pop()!, ls = s.pop()!;
    if (c.length) {
      c[0] = lc; s[0] = ls;
      let i = 0;
      const n = c.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < n && c[l] < c[m]) m = l;
        if (r < n && c[r] < c[m]) m = r;
        if (m === i) break;
        [c[m], c[i]] = [c[i], c[m]];
        [s[m], s[i]] = [s[i], s[m]];
        i = m;
      }
    }
    return top;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------------------------------------------

const BEND = 3;
const CROSS = 7;
const F_H = 1, F_V = 2, F_VERTEX = 4, F_LANE = 8;

interface Box4 { x0: number; y0: number; x1: number; y1: number }

interface RouteOutcome {
  ok: boolean;
  failed?: string;
  wires: [number, number][][];
  groundAt?: [number, number];
  portParts: { id: string; net: string; at: [number, number] }[];
}

class Grid {
  readonly W: number;
  readonly H: number;
  readonly blocked: Uint8Array;
  readonly owner: Int16Array;
  readonly flags: Uint8Array;
  readonly inTree: Uint8Array;
  constructor(readonly ox: number, readonly oy: number, w: number, h: number) {
    this.W = w; this.H = h;
    this.blocked = new Uint8Array(w * h);
    this.owner = new Int16Array(w * h).fill(-1);
    this.flags = new Uint8Array(w * h);
    this.inTree = new Uint8Array(w * h);
  }
  inside(x: number, y: number): boolean { return x >= this.ox && y >= this.oy && x < this.ox + this.W && y < this.oy + this.H; }
  idx(x: number, y: number): number { return (y - this.oy) * this.W + (x - this.ox); }
  xy(i: number): [number, number] { return [(i % this.W) + this.ox, Math.floor(i / this.W) + this.oy]; }
}

interface RouteInput {
  parts: RPart[];
  nets: Map<string, Net>;
  terminals: Terminal[];
  ports: { id: string; net: string; x: number; y: number; dir: Dir }[];
  groundBus: boolean;
  topBus: string | null;
  bounds: Box4;
}

function routeAll(inp: RouteInput): RouteOutcome {
  const { bounds } = inp;
  const margin = KEEP + 3;
  const groundY = bounds.y1 + KEEP + 6;
  const topY = bounds.y0 - KEEP - 6;
  const gx0 = bounds.x0 - margin - 4, gx1 = bounds.x1 + margin + 4;
  const gy0 = (inp.topBus ? topY : bounds.y0 - margin);
  const gy1 = inp.groundBus ? groundY : bounds.y1 + margin;
  const grid = new Grid(gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1);
  const { W, H } = grid;

  const netNames = Array.from(inp.nets.keys());
  const netIdx = new Map(netNames.map((n, i) => [n, i]));

  // static keep-outs: body boxes inflated by KEEP
  const keepBox = (b: [number, number, number, number], ax: number, ay: number): Box4 => ({
    x0: Math.floor(ax + b[0]) - KEEP, y0: Math.floor(ay + b[1]) - KEEP, x1: Math.ceil(ax + b[2]) + KEEP, y1: Math.ceil(ay + b[3]) + KEEP,
  });
  const mark = (k: Box4): void => {
    for (let y = Math.max(k.y0, grid.oy); y <= Math.min(k.y1, grid.oy + H - 1); y++) for (let x = Math.max(k.x0, grid.ox); x <= Math.min(k.x1, grid.ox + W - 1); x++) grid.blocked[grid.idx(x, y)] = 1;
  };
  const ownKeep = new Map<string, Box4>();
  for (const p of inp.parts) { const [ax, ay] = at(p); const k = keepBox(p.cur.box, ax, ay); ownKeep.set(p.id, k); mark(k); }
  for (const pt of inp.ports) { const k = { x0: pt.x - KEEP, y0: pt.y - KEEP, x1: pt.x + KEEP, y1: pt.y + KEEP }; ownKeep.set(pt.id, k); mark(k); }

  // bus rows: reserved for their net, never crossed
  const groundNet = netNames.find((n) => inp.nets.get(n)!.ground);
  const busRow: { net: string; y: number; dir: Dir }[] = [];
  if (inp.groundBus && groundNet) busRow.push({ net: groundNet, y: groundY, dir: 'D' });
  if (inp.topBus) busRow.push({ net: inp.topBus, y: topY, dir: 'U' });
  const busOf = new Map<number, { y: number; dir: Dir }>();
  for (const b of busRow) {
    const ni = netIdx.get(b.net)!;
    busOf.set(ni, { y: b.y, dir: b.dir });
    for (let x = grid.ox; x < grid.ox + W; x++) {
      const i = grid.idx(x, b.y);
      grid.owner[i] = ni;
      grid.flags[i] = F_VERTEX | F_LANE;
    }
  }

  // terminals by net, each with its lane (cells inside the keep-out, reserved for the net)
  interface Lane { t: Terminal; cells: [number, number][]; end: [number, number]; exit: number }
  const lanesByNet = new Map<number, Lane[]>();
  for (const t of inp.terminals) {
    const ni = netIdx.get(t.net);
    if (ni === undefined) continue;
    const cells: [number, number][] = [];
    const own = ownKeep.get(t.owner)!;
    let x = t.x, y = t.y;
    for (let k = 0; k < 12; k++) {
      x += DX[t.dir]; y += DY[t.dir];
      if (!grid.inside(x, y)) return { ok: false, failed: t.net, wires: [], portParts: [] };
      const inOwn = x >= own.x0 && x <= own.x1 && y >= own.y0 && y <= own.y1;
      if (!inOwn) {
        // the lead is as long as the part's own keep-out; the cell just beyond must be free, or the parts are too close together
        if (grid.blocked[grid.idx(x, y)]) { if (process.env.ROUTER_DEBUG) console.log('lane blocked', t.id, x, y, t.dir, JSON.stringify(own)); return { ok: false, failed: t.net, wires: [], portParts: [] }; }
        break;
      }
      cells.push([x, y]);
    }
    if (cells.length === 0) return { ok: false, failed: t.net, wires: [], portParts: [] };
    for (const [cx, cy] of cells) {
      const i = grid.idx(cx, cy);
      if (grid.owner[i] !== -1 && grid.owner[i] !== ni) return { ok: false, failed: t.net, wires: [], portParts: [] };
      grid.owner[i] = ni;
      grid.flags[i] |= F_LANE | (isHoriz(t.dir) ? F_H : F_V);
    }
    // the first free cell beyond the lead is reserved too, so no other net can wall the terminal in
    const end = cells[cells.length - 1];
    const ex = end[0] + DX[t.dir], ey = end[1] + DY[t.dir];
    let exit = -1;
    if (grid.inside(ex, ey)) {
      const xi = grid.idx(ex, ey);
      if (!grid.blocked[xi] && grid.owner[xi] === -1) { grid.owner[xi] = ni; grid.flags[xi] |= F_LANE | (isHoriz(t.dir) ? F_H : F_V); exit = xi; }
    }
    (lanesByNet.get(ni) ?? lanesByNet.set(ni, []).get(ni)!).push({ t, cells, end, exit });
  }

  const wires: [number, number][][] = [];
  const edges = new Map<number, Set<string>>(); // per net, "x1,y1|x2,y2" (sorted)
  const addPath = (ni: number, pts: [number, number][]): void => {
    const set = edges.get(ni) ?? edges.set(ni, new Set()).get(ni)!;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const key = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? `${a[0]},${a[1]}|${b[0]},${b[1]}` : `${b[0]},${b[1]}|${a[0]},${a[1]}`;
      set.add(key);
    }
  };

  const joinsOnBus = new Map<number, number[]>();

  const order = Array.from(lanesByNet.keys()).sort((a, b) => {
    const ba = busOf.has(a) ? 1 : 0, bb = busOf.has(b) ? 1 : 0;
    if (ba !== bb) return ba - bb;
    const span = (n: number): number => {
      const ls = lanesByNet.get(n)!;
      const xs = ls.map((l) => l.t.x), ys = ls.map((l) => l.t.y);
      return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
    };
    return lanesByNet.get(a)!.length - lanesByNet.get(b)!.length || span(a) - span(b);
  });

  const dist = new Float64Array(W * H * 4);
  const prev = new Int32Array(W * H * 4);

  for (const ni of order) {
    const lanes = lanesByNet.get(ni)!;
    const bus = busOf.get(ni);
    const isGoalBus = (x: number, y: number, d: Dir): boolean => !!bus && y === bus.y && d === bus.dir;
    const connected = new Set<Lane>();
    const markTree = (cells: [number, number][]): void => { for (const [x, y] of cells) grid.inTree[grid.idx(x, y)] = ni + 1; };
    const inTree = (i: number): boolean => grid.inTree[i] === ni + 1;
    const pending = new Set(lanes);

    const takeFirst = (): Lane => {
      // start from the lane nearest the centroid so the tree grows outward
      const cx = lanes.reduce((s, l) => s + l.t.x, 0) / lanes.length, cy = lanes.reduce((s, l) => s + l.t.y, 0) / lanes.length;
      let best = lanes[0], bd = Infinity;
      for (const l of lanes) { const d = Math.abs(l.t.x - cx) + Math.abs(l.t.y - cy); if (d < bd) { bd = d; best = l; } }
      return best;
    };

    if (!bus) {
      const first = takeFirst();
      pending.delete(first);
      connected.add(first);
      const pts: [number, number][] = [[first.t.x, first.t.y], ...first.cells];
      if (first.exit >= 0) pts.push(grid.xy(first.exit));
      addPath(ni, pts);
      markTree(pts.slice(1));
      const lastCell = pts[pts.length - 1];
      grid.flags[grid.idx(lastCell[0], lastCell[1])] |= F_VERTEX;
    }

    while (pending.size) {
      // nearest pending lane to the current tree (Manhattan between lane ends)
      let pick: Lane | null = null, pd = Infinity;
      for (const l of Array.from(pending)) {
        let d = Infinity;
        if (bus) d = Math.abs(l.end[1] - bus.y);
        for (const c of Array.from(connected)) d = Math.min(d, Math.abs(c.end[0] - l.end[0]) + Math.abs(c.end[1] - l.end[1]));
        if (d < pd) { pd = d; pick = l; }
      }
      const lane = pick!;
      pending.delete(lane);

      // Dijkstra from the lane end
      dist.fill(Infinity);
      const startIdx = grid.idx(lane.end[0], lane.end[1]);
      const startDir = lane.t.dir;
      const s0 = startIdx * 4 + DIRS.indexOf(startDir);
      dist[s0] = 0;
      prev[s0] = -1;
      const hp = new Heap();
      hp.push(0, s0);
      let goalState = -1;
      let popped = 0, maxY = -1e9;
      const crossOk = (i: number, d: Dir): boolean => {
        const o = grid.owner[i];
        if (o === -1 || o === ni) return true;
        const f = grid.flags[i];
        if (f & (F_VERTEX | F_LANE)) return false;
        return isHoriz(d) ? !(f & F_H) && !!(f & F_V) : !(f & F_V) && !!(f & F_H);
      };
      while (hp.size) {
        const [cst, st] = hp.pop();
        if (cst > dist[st]) continue;
        const ci = st >> 2, d = DIRS[st & 3];
        const [cx, cy] = grid.xy(ci);
        popped++; maxY = Math.max(maxY, cy);
        const isStart = st === s0;
        if (!isStart && (inTree(ci) || isGoalBus(cx, cy, d))) { goalState = st; break; }
        const here = grid.owner[ci];
        const crossingHere = here !== -1 && here !== ni;
        for (const d2 of DIRS) {
          if (d2 === OPP[d]) continue;
          if (crossingHere && d2 !== d) continue;
          const nx = cx + DX[d2], ny = cy + DY[d2];
          if (!grid.inside(nx, ny)) continue;
          const ni2 = grid.idx(nx, ny);
          const o = grid.owner[ni2];
          let extra = 0;
          if (grid.blocked[ni2]) {
            if (!(o === ni && (grid.flags[ni2] & F_LANE) && inTree(ni2))) continue;
          } else if (o !== -1 && o !== ni) {
            if (!crossOk(ni2, d2)) continue;
            extra += CROSS;
          } else if (o === ni && (grid.flags[ni2] & F_LANE) && !inTree(ni2) && ni2 !== lane.exit && !(bus && ny === bus.y)) {
            continue; // another terminal's reserved exit that is not connected yet
          }
          if (o === ni && busOf.has(ni) && bus && ny === bus.y && d2 !== bus.dir) continue; // bus row is entered vertically only
          const cost = cst + 1 + (d2 !== d ? BEND : 0) + extra;
          const ns = ni2 * 4 + DIRS.indexOf(d2);
          if (cost < dist[ns]) { dist[ns] = cost; prev[ns] = st; hp.push(cost, ns); }
        }
      }
      if (goalState < 0) { if (process.env.ROUTER_DEBUG) console.log('route fail', lane.t.id, lane.t.x, lane.t.y, lane.t.dir, 'end', lane.end, 'popped', popped, 'maxY', maxY, 'bus', bus, 'grid', grid.ox, grid.oy, W, H, DIRS.map((d2) => { const nx = lane.end[0] + DX[d2], ny = lane.end[1] + DY[d2]; const i2 = grid.idx(nx, ny); return d2 + ':' + grid.blocked[i2] + '/' + grid.owner[i2] + '/' + grid.flags[i2]; }).join(' '), 'net', ni, 'owner here', grid.owner[startIdx]); return { ok: false, failed: lane.t.net, wires: [], portParts: [] }; }

      // rebuild the path, terminal -> lane -> routed cells
      const cells: [number, number][] = [];
      for (let st = goalState; st !== -1; st = prev[st]) cells.push(grid.xy(st >> 2));
      cells.reverse();
      const pts: [number, number][] = [[lane.t.x, lane.t.y], ...lane.cells.slice(0, -1), ...cells];
      addPath(ni, pts);
      // occupancy for the other nets' crossing decisions
      for (let i = 1; i < pts.length; i++) {
        const [x, y] = pts[i];
        const ci = grid.idx(x, y);
        grid.owner[ci] = ni;
        const a = pts[i - 1], b = pts[i + 1];
        if (!b) { grid.flags[ci] |= F_VERTEX; continue; }
        if (a[0] === b[0]) grid.flags[ci] |= F_V;
        else if (a[1] === b[1]) grid.flags[ci] |= F_H;
        else grid.flags[ci] |= F_VERTEX;
      }
      markTree(pts.slice(1));
      const last = pts[pts.length - 1];
      if (bus && last[1] === bus.y) (joinsOnBus.get(ni) ?? joinsOnBus.set(ni, []).get(ni)!).push(last[0]);
      connected.add(lane);
    }
  }

  // bus wires: from the first to the last drop
  let groundAt: [number, number] | undefined;
  for (const [ni, xs] of Array.from(joinsOnBus)) {
    const b = busOf.get(ni)!;
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const set = edges.get(ni) ?? edges.set(ni, new Set()).get(ni)!;
    for (let x = lo; x < hi; x++) set.add(`${x},${b.y}|${x + 1},${b.y}`);
    if (b.dir === 'D') groundAt = [xs.slice().sort((p, q) => p - q)[Math.floor((xs.length - 1) / 2)], b.y];
  }

  // edges -> maximal polylines (split at junctions, ends and terminal points)
  const termPts = new Set(inp.terminals.map((t) => `${t.x},${t.y}`));
  if (groundAt) termPts.add(`${groundAt[0]},${groundAt[1]}`);
  for (const set of Array.from(edges.values())) {
    const adj = new Map<string, string[]>();
    const link = (a: string, b: string): void => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
    for (const e of Array.from(set)) { const [a, b] = e.split('|'); link(a, b); }
    const parse = (k: string): [number, number] => { const [x, y] = k.split(',').map(Number); return [x, y]; };
    const isVertex = (k: string): boolean => (adj.get(k)?.length ?? 0) !== 2 || termPts.has(k);
    const used = new Set<string>();
    const ekey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const starts = Array.from(adj.keys()).filter(isVertex).sort();
    for (const s of starts) {
      for (const n0 of adj.get(s)!) {
        if (used.has(ekey(s, n0))) continue;
        const poly = [s];
        let a = s, b = n0;
        for (;;) {
          used.add(ekey(a, b));
          poly.push(b);
          if (isVertex(b)) break;
          const nxt = adj.get(b)!.find((q) => q !== a)!;
          a = b; b = nxt;
        }
        // drop collinear interior points
        const pts = poly.map(parse);
        const slim: [number, number][] = [pts[0]];
        for (let i = 1; i < pts.length - 1; i++) {
          const p = slim[slim.length - 1], c = pts[i], n = pts[i + 1];
          if ((p[0] === c[0] && c[0] === n[0]) || (p[1] === c[1] && c[1] === n[1])) continue;
          slim.push(c);
        }
        slim.push(pts[pts.length - 1]);
        wires.push(slim);
      }
    }
  }

  const portParts = inp.ports.map((p) => ({ id: p.id, net: p.net, at: [p.x, p.y] as [number, number] }));
  return { ok: true, wires, groundAt, portParts };
}

// ---------------------------------------------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------------------------------------------

function assignDepths(parts: RPart[], nets: Map<string, Net>): void {
  const byNet = new Map<string, RPart[]>();
  for (const p of parts) for (const n of Array.from(new Set(p.pins.values()))) (byNet.get(n) ?? byNet.set(n, []).get(n)!).push(p);
  const degree = (n: string): number => nets.get(n)!.pins.length;
  const bfs = (starts: RPart[], useNet: (n: string) => boolean): void => {
    const q = [...starts];
    while (q.length) {
      const p = q.shift()!;
      for (const n of Array.from(new Set(p.pins.values()))) {
        if (!useNet(n)) continue;
        for (const o of byNet.get(n) ?? []) if (o.depth < 0) { o.depth = p.depth + 1; q.push(o); }
      }
    }
  };
  for (const p of parts) p.depth = -1;
  let anchors = parts.filter((p) => SOURCE_TYPES.has(p.part.type));
  if (anchors.length === 0) anchors = [parts[0]];
  anchors.forEach((a) => { a.depth = 0; });
  bfs(anchors, (n) => !nets.get(n)!.ground && degree(n) <= 4);
  // parts only reachable through a rail: attach them through any net
  for (let guard = 0; guard < parts.length + 2; guard++) {
    const rest = parts.filter((p) => p.depth < 0);
    if (rest.length === 0) break;
    const done = parts.filter((p) => p.depth >= 0);
    let attached = false;
    for (const p of rest) {
      const via = done.filter((d) => Array.from(d.pins.values()).some((n) => !nets.get(n)!.ground && Array.from(p.pins.values()).includes(n)));
      if (via.length) { p.depth = Math.min(...via.map((d) => d.depth)) + 1; attached = true; break; }
    }
    if (!attached) rest[0].depth = Math.max(...done.map((d) => d.depth), 0) + 1;
    bfs(parts.filter((p) => p.depth >= 0), (n) => !nets.get(n)!.ground && degree(n) <= 4);
  }
}

const SHUNT_DROP = 4; // a shunt part's top terminal hangs this far below the main axis (one lead plus a straight join)

/** Sets a part's integer position from its column, role and current orientation. */
function placeOne(p: RPart): void {
  const b = p.cur.box;
  p.px = Math.round(p.colX - (b[0] + b[2]) / 2);
  const dys = p.cur.terms.map((t) => t.dy);
  if (p.role === 'shunt') p.py = SHUNT_DROP - Math.min(...dys);
  else if (p.role === 'top') p.py = -SHUNT_DROP - Math.max(...dys);
  else p.py = -Math.round(dys.reduce((acc, v) => acc + v, 0) / Math.max(1, dys.length));
}

function classify(parts: RPart[], nets: Map<string, Net>, topNet: string | null): void {
  for (const p of parts) {
    const names = Array.from(p.pins.values());
    const two = p.cur.terms.filter((t) => p.pins.has(t.name)).length === 2;
    const toGround = names.some((n) => nets.get(n)!.ground);
    const toTop = topNet !== null && names.includes(topNet);
    p.role = two && toGround ? 'shunt' : two && toTop ? 'top' : 'axis';
  }
}

function layoutParts(parts: RPart[], gap: number): void {
  const roleRank = { shunt: 0, top: 1, axis: 2 } as const;
  const order = [...parts].sort((a, b) => a.depth - b.depth || roleRank[a.role] - roleRank[b.role] || a.id.localeCompare(b.id));
  let x = 0;
  for (const p of order) {
    const w = p.cur.box[2] - p.cur.box[0];
    p.colX = x + w / 2;
    placeOne(p);
    x += w + gap;
  }
}

function chooseOrientations(parts: RPart[], nets: Map<string, Net>, topNet: string | null): void {
  const yMax = Math.max(...parts.map((p) => p.py + p.cur.box[3])) + 12;
  const yMin = Math.min(...parts.map((p) => p.py + p.cur.box[1])) - 12;
  for (const p of parts) {
    let best = p.cur, bc = Infinity;
    for (const o of p.orients) {
      const save = p.cur;
      p.cur = o;
      placeOne(p);
      const [ax, ay] = at(p);
      let cost = 0;
      for (const t of o.terms) {
        const netName = p.pins.get(t.name);
        if (!netName) continue;
        const net = nets.get(netName)!;
        const ex = ax + t.dx + DX[t.dir] * 3, ey = ay + t.dy + DY[t.dir] * 3;
        let tx: number, ty: number;
        if (net.ground) { tx = ex; ty = yMax; }
        else if (netName === topNet) { tx = ex; ty = yMin; }
        else {
          const others = parts.filter((q) => q !== p).flatMap((q) => q.cur.terms.filter((u) => q.pins.get(u.name) === netName).map((u) => termAbs(q, u)));
          if (others.length === 0) { tx = ex; ty = ey; }
          else { tx = others.reduce((acc, q) => acc + q[0], 0) / others.length; ty = others.reduce((acc, q) => acc + q[1], 0) / others.length; }
        }
        cost += Math.abs(ex - tx) + Math.abs(ey - ty);
      }
      p.cur = save;
      if (cost < bc - 1e-9) { bc = cost; best = o; }
    }
    p.cur = best;
    placeOne(p);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------------------------

/** Pin names per part type, generated from the symbol library (used by the model-facing documentation). */
function pinTable(): string {
  return SYMBOL_LIST.filter((s) => !['junction', 'ic'].includes(s.type)).map((s) => {
    const built = s.build({ attrs: {}, std: 'IEC', value: 'text' });
    return `${s.type}: ${built.terminals.length ? built.terminals.map((q) => q.name + (q.optional ? '?' : '')).join(' ') : '(no pins)'}`;
  }).join('\n');
}

export const NETLIST_DOC: string = [
  'NETLIST FORMAT (preferred for EVERY circuit, block diagram or logic network). Describe only the TOPOLOGY: each part and the NET (a name) every pin sits on. The platform places the parts, routes all wires with an orthogonal router (bodies are impassable, junction dots only at 3+ way joins, plain crossings elsewhere) and verifies the drawing. Never give coordinates, wires or rotations.',
  '{"netlist":[{"id":"R1","type":"resistor","value":"10 kΩ","pins":{"1":"VIN","2":"OUT"}}, ...],"title":"optional","standard":"IEC|IEEE","labels":["VIN","OUT"]}',
  '- "pins" maps EVERY pin name of the part to a net name (letters, digits, _ + - .; case-sensitive). All pins that share a net name are wired together. Ground is the net named 0 (or GND); never add a ground part, rail or port yourself: the platform adds the ground symbol and the open-circle ports.',
  '- "labels" lists the nets to show as named terminals (inputs, outputs, supply rails, test points). A net that touches only ONE pin is always shown as a named terminal.',
  '- Every net needs at least two pins or must be an I/O terminal. Every active loop must return to net 0. Optional pins (marked ? below) may be omitted.',
  '- Value rules: every part except sum needs a value with a unit ("10 kΩ", "100 nF", "12 V"; blocks and chips carry their name or transfer function). Optional "attrs": switch {"state":"open|closed","control":"PWM"}; switch_spdt {"state":"1|2"}; nmos/pmos {"body_diode":true}; opamp {"supply":true}; block {"w":6,"h":2} (h even); sum {"signs":{"W":"+","S":"-"}}; ic (below); any part {"label":"V_{\\\\text{out}}"} overrides the displayed designator (in JSON every backslash is doubled).',
  '- Series chain = the same net name on pin 2 of A and pin 1 of B. Parallel branch = the same two net names on both parts. Do NOT use junction parts: a junction is any net with 3+ pins.',
  '- Generic chip (ESP32, MCU, regulator, sensor): {"id":"U1","type":"ic","value":"ESP32","attrs":{"w":10,"h":10,"pins":[{"name":"EN","side":"L","pos":3},{"name":"3V3","side":"T","pos":5},{"name":"GND","side":"B","pos":5},{"name":"IO4","side":"R","pos":3}]},"pins":{"EN":"EN","3V3":"V3V3","GND":"0","IO4":"SENSE"}} (side L/R/T/B, integer pos 1..len-1, pins at least 2 apart on one side; value = caption inside).',
  'EXAMPLE (voltage divider):',
  '{"netlist":[{"id":"V1","type":"vsource","value":"12 V","pins":{"+":"VIN","-":"0"}},{"id":"R1","type":"resistor","value":"10 kΩ","pins":{"1":"VIN","2":"OUT"}},{"id":"R2","type":"resistor","value":"10 kΩ","pins":{"1":"OUT","2":"0"}}],"labels":["VIN","OUT"]}',
  'PINS (name, ? = optional):',
  pinTable(),
].join('\n');

function autoLabelNet(name: string): boolean {
  return !/^(n\d+|net\d+|\d+)$/i.test(name) && !GROUND_RE.test(name);
}
void autoLabelNet;

export interface NetlistExpansion { spec: Record<string, unknown> | null; errors: Issue[]; warnings: Issue[] }

/** Expand `{ "netlist": [...], "title"?, "standard"?, "labels"? }` into a placed-and-routed coordinate spec (or precise errors). Never throws. */
export function expandNetlistRequest(raw: Record<string, unknown>, normalize: Normalizer): NetlistExpansion {
  try {
    return expand(raw, normalize);
  } catch (e) {
    return { spec: null, errors: [err('NETLIST_INTERNAL', `The netlist could not be placed (${e instanceof Error ? e.message : 'unknown'}).`)], warnings: [] };
  }
}

function expand(raw: Record<string, unknown>, normalize: Normalizer): NetlistExpansion {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  for (const k of Object.keys(raw)) {
    if (!REQUEST_KEYS.has(k)) errors.push(err('NETLIST_REQUEST', `A netlist request has only "netlist", "title", "standard" and "labels"; remove ${JSON.stringify(k.slice(0, 30))} (never add parts, wires or coordinates next to it).`));
  }
  const list = raw.netlist;
  if (!Array.isArray(list) || list.length === 0) errors.push(err('NETLIST_REQUEST', '"netlist" must be a non-empty array of parts {id,type,value,pins}.'));
  if (raw.standard !== undefined && raw.standard !== 'IEC' && raw.standard !== 'IEEE') errors.push(err('SHAPE_STANDARD', 'standard must be "IEC" or "IEEE".'));
  if (raw.title !== undefined && (typeof raw.title !== 'string' || raw.title.length > 80)) errors.push(err('NETLIST_REQUEST', '"title" must be a string of at most 80 characters.'));
  const labelNames = new Set<string>();
  if (raw.labels !== undefined) {
    if (!Array.isArray(raw.labels) || raw.labels.some((l) => typeof l !== 'string')) errors.push(err('NETLIST_REQUEST', '"labels" must be an array of net names.'));
    else for (const l of raw.labels as string[]) labelNames.add(l.trim());
  }
  if (errors.length || !Array.isArray(list)) return { spec: null, errors, warnings };
  if (list.length > 150) return { spec: null, errors: [err('SIZE_CAP', `The netlist has ${list.length} parts; the limit is 150. Simplify the schematic.`)], warnings };

  // ---- parts -> draft spec (validated by the normal parser) ----
  const entries: { id: string; type: string; pins: Record<string, string> }[] = [];
  const draftParts: Record<string, unknown>[] = [];
  list.forEach((e, i) => {
    const w = `netlist[${i}]`;
    if (!isPlain(e)) { errors.push(err('NETLIST_PART', `${w} must be an object {id,type,value,pins}.`, w)); return; }
    for (const k of Object.keys(e)) if (!PART_KEYS.has(k)) errors.push(err('NETLIST_PART', `${w}: unknown key ${JSON.stringify(k.slice(0, 24))}; a netlist part has only id, type, value, pins, attrs, label.`, w));
    const id = e.id, type = e.type;
    if (typeof id !== 'string' || typeof type !== 'string') { errors.push(err('NETLIST_PART', `${w} needs a string "id" and "type".`, w)); return; }
    if (!(PART_TYPES as readonly string[]).includes(type)) { errors.push(err('TYPE_UNKNOWN', `part "${id.slice(0, 20)}": unknown type ${JSON.stringify(type.slice(0, 30))}. Valid types: ${PART_TYPES.join(', ')}.`, w)); return; }
    const pins = e.pins;
    if (!isPlain(pins)) { errors.push(err('NETLIST_PINS', `${id}: "pins" must be an object mapping each pin name to a net name, e.g. {"1":"VIN","2":"OUT"}.`, w)); return; }
    const clean: Record<string, string> = {};
    for (const [pin, net] of Object.entries(pins)) {
      if (typeof net !== 'string' || !NET_RE.test(net.trim())) { errors.push(err('NETLIST_NET', `${id}.${pin}: net names are 1-24 characters of letters, digits, _ + - . (got ${JSON.stringify(String(net).slice(0, 30))}).`, w)); continue; }
      clean[pin] = net.trim();
    }
    entries.push({ id, type, pins: clean });
    draftParts.push({ id, type, value: e.value, at: [0, 0], rot: 0, flip: false, label: e.label ?? 'auto', attrs: e.attrs ?? {} });
  });
  if (errors.length) return { spec: null, errors, warnings };

  const draft = normalize({ title: raw.title ?? '', standard: raw.standard ?? 'IEC', pitch: 20, parts: draftParts, wires: [], labels: [], domains: [] });
  warnings.push(...draft.warnings);
  if (!draft.spec) return { spec: null, errors: draft.errors, warnings };
  errors.push(...draft.errors);
  if (errors.length) return { spec: null, errors, warnings };
  const std = draft.spec.standard;

  // ---- nets ----
  const nets = new Map<string, Net>();
  const netOf = (name: string): Net => {
    const key = GROUND_RE.test(name) ? '0' : name;
    let n = nets.get(key);
    if (!n) { n = { name: key, ground: key === '0', pins: [], label: false }; nets.set(key, n); }
    return n;
  };
  const rparts: RPart[] = [];
  const seenIds = new Set<string>();
  for (const spec of draft.spec.parts) {
    if (seenIds.has(spec.id)) { errors.push(err('G1_DUPLICATE_ID', `G1: id "${spec.id}" is used by more than one part; every part needs a unique id.`, spec.id)); continue; }
    seenIds.add(spec.id);
    const entry = entries.find((e) => e.id === spec.id)!;
    if (SPECIAL.has(spec.type)) {
      // ground / rail / port / junction are added by the platform; honour what they name
      for (const net of Object.values(entry.pins)) { const n = netOf(net); if (spec.type !== 'ground') n.label = true; }
      continue;
    }
    const orients = orientationsOf(spec, std);
    if (orients.length === 0) { errors.push(err('NETLIST_PART', `${spec.id}: cannot place a part of type ${spec.type}.`, spec.id)); continue; }
    const pinNames = orients[0].terms.map((t) => t.name);
    const pins = new Map<string, string>();
    for (const [pin, net] of Object.entries(entry.pins)) {
      if (!pinNames.includes(pin)) { errors.push(err('NETLIST_PIN_UNKNOWN', `${spec.id} (${spec.type}) has no pin ${JSON.stringify(pin.slice(0, 20))}. Its pins are: ${pinNames.join(', ')}.`, spec.id)); continue; }
      pins.set(pin, netOf(net).name);
    }
    for (const t of orients[0].terms) {
      if (!pins.has(t.name) && !t.optional) errors.push(err('NETLIST_PIN_MISSING', `${spec.id} (${spec.type}) pin ${t.name} is not connected to any net. Give every pin a net name in "pins" (its pins are: ${pinNames.join(', ')}).`, spec.id));
    }
    rparts.push({ id: spec.id, part: spec, orients, cur: orients[0], pins, depth: 0, role: 'axis', colX: 0, px: 0, py: 0 });
    for (const [pin, net] of Array.from(pins)) nets.get(net)!.pins.push({ part: spec.id, pin });
  }
  if (errors.length) return { spec: null, errors, warnings };
  if (rparts.length === 0) return { spec: null, errors: [err('NETLIST_REQUEST', 'The netlist has no parts to draw.')], warnings };

  for (const name of Array.from(labelNames)) { const key = GROUND_RE.test(name) ? '0' : name; const n = nets.get(key); if (n && !n.ground) n.label = true; }
  for (const n of Array.from(nets.values())) {
    if (n.pins.length === 0) { nets.delete(n.name); continue; }
    if (n.pins.length === 1 && !n.ground) n.label = true;
  }
  const groundNet = Array.from(nets.values()).find((n) => n.ground);

  assignDepths(rparts, nets);

  // top bus: the highest net that many parts hang from
  let topNet: string | null = null;
  const topCandidates = Array.from(nets.values()).filter((n) => !n.ground && n.pins.length >= 4).sort((a, b) => b.pins.length - a.pins.length);
  if (topCandidates.length) topNet = topCandidates[0].name;

  // ---- place + route, widening the channels until everything routes ----
  let outcome: RouteOutcome | null = null;
  let placement: { terminals: Terminal[]; ports: { id: string; net: string; x: number; y: number; dir: Dir }[]; bounds: Box4 } | null = null;
  for (const gap of [6, 8, 11, 15, 20, 26]) {
    for (const p of rparts) p.cur = p.orients[0];
    classify(rparts, nets, topNet);
    layoutParts(rparts, gap);
    for (let it = 0; it < 3; it++) { chooseOrientations(rparts, nets, topNet); classify(rparts, nets, topNet); layoutParts(rparts, gap); }
    placement = buildTerminals(rparts, nets);
    if (process.env.ROUTER_DEBUG) console.log('gap', gap, rparts.map((q) => `${q.id}@${q.px},${q.py} ${q.cur.rot}/${q.cur.flip} box ${q.cur.box}`).join(' | '), 'ports', JSON.stringify(placement.ports), 'bounds', JSON.stringify(placement.bounds));
    outcome = routeAll({ parts: rparts, nets, terminals: placement.terminals, ports: placement.ports, groundBus: !!groundNet, topBus: topNet, bounds: placement.bounds });
    if (outcome.ok) break;
  }
  if (!outcome || !outcome.ok || !placement) {
    return { spec: null, errors: [err('NETLIST_ROUTE', `The router could not find a clean path for net ${JSON.stringify(outcome?.failed ?? '?')}. Reduce the number of connections on that net or split the circuit into stages.`)], warnings };
  }

  // ---- assemble the coordinate spec ----
  const parts: Record<string, unknown>[] = [];
  const allPts: [number, number][] = [];
  for (const p of rparts) {
    const [ax, ay] = at(p);
    parts.push({ ...(draftParts.find((d) => d.id === p.id) as Record<string, unknown>), at: [ax, ay], rot: p.cur.rot, flip: p.cur.flip });
    allPts.push([ax + p.cur.box[0], ay + p.cur.box[1]], [ax + p.cur.box[2], ay + p.cur.box[3]]);
  }
  for (const pt of outcome.portParts) {
    parts.push({ id: pt.id, type: 'port', value: pt.net, at: pt.at, rot: 0, flip: false, label: 'auto', attrs: {} });
    allPts.push(pt.at);
  }
  if (outcome.groundAt) {
    parts.push({ id: 'GND0', type: 'ground', at: outcome.groundAt, rot: 0, flip: false, label: 'none', attrs: {} });
    allPts.push([outcome.groundAt[0] - 1, outcome.groundAt[1]], [outcome.groundAt[0] + 1, outcome.groundAt[1] + 2]);
  }
  for (const w of outcome.wires) allPts.push(...w);
  const minX = Math.floor(Math.min(...allPts.map((q) => q[0]))) - 3, minY = Math.floor(Math.min(...allPts.map((q) => q[1]))) - 3;
  const sx = -minX, sy = -minY;
  const shift = (q: [number, number]): [number, number] => [q[0] + sx, q[1] + sy];
  for (const p of parts) p.at = shift(p.at as [number, number]);
  const wires = outcome.wires.map((w) => ({ pts: w.map(shift) }));
  const maxCoord = Math.max(...allPts.map((q) => Math.max(q[0] + sx, q[1] + sy)));
  if (maxCoord > 380) return { spec: null, errors: [err('SIZE_CAP', 'The circuit is too large to draw on one sheet. Split it into stages and draw each stage separately.')], warnings };
  const result = { title: typeof raw.title === 'string' ? raw.title : '', standard: std, pitch: 20, parts, wires, labels: [] as unknown[], domains: [] as unknown[] };
  // Self-check: read the connectivity back out of the drawn wires and compare it with the requested nets.
  const check = normalize(JSON.parse(JSON.stringify(result)));
  if (check.spec) {
    const bad = connectivityMismatch(check.spec, rparts, nets);
    if (bad) return { spec: null, errors: [err('NETLIST_ROUTE', `Internal routing check failed: ${bad}. Simplify the circuit or split it into stages.`)], warnings };
  }
  return { spec: result, errors: [], warnings };
}

/** Null when the wires of `spec` connect exactly the requested nets (ground = N0), otherwise a description of the first difference. */
export function connectivityMismatch(spec: SchematicSpec, parts: { id: string; pins: Map<string, string> }[], nets: Map<string, unknown>): string | null {
  const a = analyze(spec);
  const groupOf = new Map<string, string>(); // requested net -> drawn net
  const used = new Map<string, string>(); // drawn net -> requested net
  for (const p of parts) {
    for (const [pin, net] of Array.from(p.pins)) {
      const drawn = a.netlist.netOfTerminal[`${p.id}.${pin}`];
      if (!drawn) return `${p.id}.${pin} is not connected to anything`;
      const want = groupOf.get(net);
      if (want === undefined) groupOf.set(net, drawn);
      else if (want !== drawn) return `net ${net} is split (${p.id}.${pin} is not joined to the rest)`;
      const other = used.get(drawn);
      if (other !== undefined && other !== net) return `nets ${other} and ${net} are shorted together`;
      used.set(drawn, net);
    }
  }
  void nets;
  return null;
}

/** Turns the placed parts into routing terminals, adds named ports, and measures the placement. */
function buildTerminals(parts: RPart[], nets: Map<string, Net>): { terminals: Terminal[]; ports: { id: string; net: string; x: number; y: number; dir: Dir }[]; bounds: Box4 } {
  const terminals: Terminal[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) {
    const [ax, ay] = at(p);
    x0 = Math.min(x0, ax + p.cur.box[0]); y0 = Math.min(y0, ay + p.cur.box[1]);
    x1 = Math.max(x1, ax + p.cur.box[2]); y1 = Math.max(y1, ay + p.cur.box[3]);
    for (const t of p.cur.terms) {
      const net = p.pins.get(t.name);
      if (!net) continue;
      terminals.push({ id: `${p.id}.${t.name}`, owner: p.id, net, x: ax + t.dx, y: ay + t.dy, dir: t.dir });
    }
  }
  const bounds: Box4 = { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
  const ports: { id: string; net: string; x: number; y: number; dir: Dir }[] = [];
  const free = (x: number, y: number): boolean => parts.every((p) => {
    const [ax, ay] = at(p);
    return x < Math.floor(ax + p.cur.box[0]) - 2 * KEEP - 1 || x > Math.ceil(ax + p.cur.box[2]) + 2 * KEEP + 1 || y < Math.floor(ay + p.cur.box[1]) - 2 * KEEP - 1 || y > Math.ceil(ay + p.cur.box[3]) + 2 * KEEP + 1;
  }) && ports.every((q) => Math.abs(q.x - x) > 2 * KEEP + 1 || Math.abs(q.y - y) > 2 * KEEP + 1);
  let n = 0;
  for (const net of Array.from(nets.values())) {
    if (!net.label || net.ground) continue;
    const mine = terminals.filter((t) => t.net === net.name);
    if (mine.length === 0) continue;
    const id = `P${++n}_${net.name}`.slice(0, 20);
    let placed = false;
    if (mine.length === 1) {
      const t = mine[0];
      for (const extra of [KEEP + 4, KEEP + 6, KEEP + 9, KEEP + 13]) {
        const px = t.x + DX[t.dir] * extra, py = t.y + DY[t.dir] * extra;
        if (free(px, py)) { ports.push({ id, net: net.name, x: px, y: py, dir: OPP[t.dir] }); placed = true; break; }
      }
    }
    if (!placed) {
      const cx = mine.reduce((acc, t) => acc + t.x, 0) / mine.length, cy = Math.round(mine.reduce((acc, t) => acc + t.y, 0) / mine.length);
      const left = cx < (bounds.x0 + bounds.x1) / 2;
      const base = Math.max(bounds.y0, Math.min(bounds.y1, cy));
      search: for (let j = 0; j < 8; j++) {
        const px = left ? bounds.x0 - 2 * KEEP - 3 - 5 * j : bounds.x1 + 2 * KEEP + 3 + 5 * j;
        for (let k = 0; k < 24; k++) {
          const py = base + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (KEEP + 3);
          if (free(px, py)) { ports.push({ id, net: net.name, x: px, y: py, dir: left ? 'R' : 'L' }); placed = true; break search; }
        }
      }
      if (!placed) ports.push({ id, net: net.name, x: left ? bounds.x0 - 40 : bounds.x1 + 40, y: base, dir: left ? 'R' : 'L' });
    }
    const pt = ports[ports.length - 1];
    terminals.push({ id: pt.id, owner: pt.id, net: net.name, x: pt.x, y: pt.y, dir: pt.dir, port: true });
  }
  for (const pt of ports) {
    x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x); y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y);
  }
  return { terminals, ports, bounds: { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) } };
}
