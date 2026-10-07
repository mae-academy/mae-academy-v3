/**
 * Pipe-net graph and quasi-static pressure propagation.
 *
 * A net is a set of ports joined by wires. Each tick the solver decides, per net:
 *   - firm    : in free communication with a supply (takes the supply pressure exactly),
 *   - vented  : open to atmosphere / tank (trapped pressure is released),
 *   - trapped : neither — the net keeps the pressure it had, which is how check valves hold a load
 *               and a closed-centre valve locks a cylinder.
 * It also rates how freely fluid can reach each net from a supply and leave it to exhaust
 * (the flow coefficient Cv of the least restrictive path), which is what throttles act on.
 * Volumes and line losses are not modelled: connected nets settle instantly.
 */
import type { Connection, EngineDiagnostic, EngineWire, NodeId, PressureCap, PressureSource } from './types';
import { nodeId } from './types';

const EPS = 1e-6;

export interface NetGraph {
  /** Member ports of each net, sorted; nets are ordered by their first member, so indices are stable. */
  members: NodeId[][];
  netOf: Map<NodeId, number>;
}

export function buildNetGraph(nodes: NodeId[], wires: EngineWire[]): NetGraph {
  const parent = new Map<NodeId, NodeId>();
  const add = (node: NodeId) => { if (!parent.has(node)) parent.set(node, node); };
  const find = (node: NodeId): NodeId => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let current = node;
    while (current !== root) { const next = parent.get(current)!; parent.set(current, root); current = next; }
    return root;
  };

  nodes.forEach(add);
  for (const wire of wires) {
    const a = nodeId(wire.fromComp, wire.fromTerm);
    const b = nodeId(wire.toComp, wire.toTerm);
    add(a);
    add(b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const groups = new Map<NodeId, NodeId[]>();
  Array.from(parent.keys()).forEach(node => {
    const root = find(node);
    const group = groups.get(root);
    if (group) group.push(node); else groups.set(root, [node]);
  });
  const members = Array.from(groups.values()).map(group => group.sort()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const netOf = new Map<NodeId, number>();
  members.forEach((group, index) => group.forEach(node => netOf.set(node, index)));
  return { members, netOf };
}

/** Whether a port has a pipe on it. */
export const isConnected = (graph: NetGraph, node: NodeId): boolean => {
  const net = graph.netOf.get(node);
  return net !== undefined && graph.members[net].length > 1;
};

export interface PressureProblem {
  graph: NetGraph;
  connections: Connection[];
  /** Supplies: compressors, pumps, injected pilot signals. */
  sources: PressureSource[];
  /** Ports that are open to atmosphere / tank. */
  exhausts: NodeId[];
  /** Relief limits: the line the node is on can never exceed the limit. */
  caps: PressureCap[];
  /** Pressure of a port at the end of the previous tick (what a trapped net holds). */
  previous: (node: NodeId) => number;
  /** Pneumatics: an unconnected port blows off to atmosphere. Hydraulics: it is treated as plugged. */
  openPortsVent: boolean;
  /** Ports of storage volumes (reservoirs, time-delay chambers): they keep their pressure and only change through restrictors over time. */
  volumes?: NodeId[];
}

/** A restricted path that charges or drains a storage volume: the engine integrates its pressure over time. */
export interface VolumeLink {
  /** Net of the volume's port. */
  volume: number;
  /** Net on the other side of the restriction. */
  other: number;
  /** Flow coefficient Cv of the path other → volume, and whether it is timed (restricted) rather than instant. */
  cvIn: number;
  timedIn: boolean;
  /** Flow coefficient of the path volume → other. */
  cvOut: number;
  timedOut: boolean;
}

export interface PressureSolution {
  /** Pressure of each net in bar. */
  pressure: number[];
  /** Net is open to atmosphere / tank. */
  vented: boolean[];
  /** Net is held at supply pressure by a source. */
  firm: boolean[];
  /** Relief limit acting on the net (Infinity when unprotected). */
  relief: number[];
  /** The relief limit is actually holding the net down, i.e. a relief valve on it is open. */
  clamped: boolean[];
  /** Cv of the least restrictive path from a supply to the net (0 when no supply reaches it). */
  inflow: number[];
  /** Cv of the least restrictive path from the net to exhaust / tank (0 when it cannot vent). */
  outflow: number[];
  /** Restricted paths into / out of storage volumes (empty without volumes). */
  volumeLinks: VolumeLink[];
}

type Resolved =
  | { kind: 'open'; a: number; b: number; forward: number; reverse: number; restrictedForward: boolean; restrictedReverse: boolean }
  | { kind: 'oneWay'; from: number; to: number; drop: number; limit: number; firm: boolean }
  | { kind: 'or'; a: number; b: number; out: number }
  | { kind: 'and'; a: number; b: number; out: number; threshold: number }
  | { kind: 'quickExhaust'; supply: number; work: number };

const coefficient = (value: number) => Math.max(0, Math.min(1, value));

function resolve(graph: NetGraph, connections: Connection[]): Resolved[] {
  const net = (node: NodeId) => graph.netOf.get(node);
  const resolved: Resolved[] = [];
  for (const c of connections) {
    switch (c.kind) {
      case 'open': {
        const a = net(c.a); const b = net(c.b);
        if (a !== undefined && b !== undefined && a !== b) {
          const restricted = c.conductance !== undefined;
          resolved.push({
            kind: 'open', a, b, forward: coefficient(c.conductance?.[0] ?? 1), reverse: coefficient(c.conductance?.[1] ?? 1),
            restrictedForward: restricted && !c.free?.[0], restrictedReverse: restricted && !c.free?.[1],
          });
        }
        break;
      }
      case 'oneWay': {
        const from = net(c.from); const to = net(c.to);
        if (from !== undefined && to !== undefined && from !== to) {
          resolved.push({ kind: 'oneWay', from, to, drop: c.drop ?? 0, limit: c.limit ?? Infinity, firm: c.firm ?? false });
        }
        break;
      }
      case 'or':
      case 'and': {
        const a = net(c.inputs[0]); const b = net(c.inputs[1]); const out = net(c.out);
        if (a === undefined || b === undefined || out === undefined) break;
        resolved.push(c.kind === 'or' ? { kind: 'or', a, b, out } : { kind: 'and', a, b, out, threshold: c.threshold });
        break;
      }
      case 'quickExhaust': {
        const supply = net(c.supply); const work = net(c.work);
        if (supply !== undefined && work !== undefined && supply !== work) resolved.push({ kind: 'quickExhaust', supply, work });
        break;
      }
      case 'vent':
        break; // a boundary condition, handled with the exhausts
    }
  }
  return resolved;
}

/** Runs `pass` until it reports no change. Every rule moves values one way only, so this terminates. */
function relax(netCount: number, ruleCount: number, pass: () => boolean): void {
  const limit = netCount + ruleCount + 4;
  for (let round = 0; round < limit; round += 1) {
    if (!pass()) return;
  }
}

/** Solves the net pressures; a source that can unload and has a free path to tank is dropped and the circuit solved again. */
export function solvePressures(problem: PressureProblem): PressureSolution {
  const first = solveOnce(problem);
  const unloaded = problem.sources.filter(source => {
    const index = problem.graph.netOf.get(source.node);
    return source.unloads && index !== undefined && first.vented[index];
  });
  if (unloaded.length === 0) return first;
  return solveOnce({ ...problem, sources: problem.sources.filter(source => !unloaded.includes(source)) });
}

function solveOnce(problem: PressureProblem): PressureSolution {
  const { graph, sources, exhausts, caps, previous, openPortsVent } = problem;
  const count = graph.members.length;
  const rules = resolve(graph, problem.connections);
  const net = (node: NodeId) => graph.netOf.get(node);

  /* Storage volumes: nets that keep their pressure and cannot be filled or drained through a restrictor instantly. */
  const isVolume = new Array<boolean>(count).fill(false);
  for (const node of problem.volumes ?? []) {
    const index = net(node);
    if (index !== undefined) isVolume[index] = true;
  }
  /** Flow towards `target` through a restricted path: for a storage volume this is the timed path, handled by the engine. */
  const timed = (target: number, restricted: boolean) => isVolume[target] && restricted;

  /* Phase 0 — relief limits: a relief valve protects everything in free communication with it. */
  const relief = new Array<number>(count).fill(Infinity);
  for (const { node, limit } of caps) {
    const index = net(node);
    if (index !== undefined) relief[index] = Math.min(relief[index], Math.max(0, limit));
  }
  relax(count, rules.length, () => {
    let changed = false;
    const lower = (index: number, value: number) => { if (value < relief[index] - EPS) { relief[index] = value; changed = true; } };
    for (const rule of rules) {
      if (rule.kind === 'open') { lower(rule.b, relief[rule.a]); lower(rule.a, relief[rule.b]); }
      // Flow can reach a relief valve through a check valve, so it also limits the inlet side.
      else if (rule.kind === 'oneWay' && !rule.firm) lower(rule.from, relief[rule.to] + rule.drop);
    }
    return changed;
  });
  const clamped = new Array<boolean>(count).fill(false);
  /** Applies the relief limit of a net, noting when it is what holds the pressure down. */
  const limited = (index: number, value: number) => {
    if (value > relief[index] + EPS) { clamped[index] = true; return relief[index]; }
    return value;
  };

  const held = graph.members.map(group => group.reduce((max, node) => Math.max(max, previous(node)), 0));

  /* Phase 1 — firm supply: source pressure carried through open paths and regulators. */
  const supply = new Array<number>(count).fill(0);
  const sourceNets: number[] = [];
  for (const { node, pressure } of sources) {
    const index = net(node);
    if (index === undefined || pressure <= 0) continue;
    sourceNets.push(index);
    supply[index] = Math.max(supply[index], limited(index, pressure));
  }
  relax(count, rules.length, () => {
    let changed = false;
    const raise = (index: number, value: number) => {
      const next = limited(index, value);
      if (next > supply[index] + EPS) { supply[index] = next; changed = true; }
    };
    for (const rule of rules) {
      if (rule.kind === 'open') {
        if (!timed(rule.b, rule.restrictedForward)) raise(rule.b, supply[rule.a]);
        if (!timed(rule.a, rule.restrictedReverse)) raise(rule.a, supply[rule.b]);
      } else if (rule.kind === 'oneWay' && rule.firm) raise(rule.to, Math.min(supply[rule.from] - rule.drop, rule.limit));
    }
    return changed;
  });
  const firm = supply.map(value => value > 0);

  /* Phase 2 — venting: which nets can release trapped pressure. */
  const vented = graph.members.map((group, index) => openPortsVent && group.length === 1 && !isVolume[index]);
  for (const node of exhausts) {
    const index = net(node);
    if (index !== undefined) vented[index] = true;
  }
  for (const connection of problem.connections) {
    if (connection.kind !== 'vent') continue;
    const index = net(connection.node);
    if (index !== undefined) vented[index] = true;
  }
  /** Nets that vent directly, before anything is propagated: where exhaust flow finally leaves the circuit. */
  const outlets = vented.slice();
  /** Pressure a net will have before non-firm propagation: enough to decide the quick-exhaust seal. */
  const standing = (index: number) => (firm[index] ? supply[index] : vented[index] ? 0 : held[index]);
  relax(count, rules.length, () => {
    let changed = false;
    const vent = (index: number) => { if (!vented[index]) { vented[index] = true; changed = true; } };
    for (const rule of rules) {
      switch (rule.kind) {
        case 'open':
          // Venting b through a is flow b → a (reverse); venting a through b is flow a → b (forward).
          if (vented[rule.a] && !timed(rule.b, rule.restrictedReverse)) vent(rule.b);
          if (vented[rule.b] && !timed(rule.a, rule.restrictedForward)) vent(rule.a);
          break;
        case 'oneWay':
          // Flow can leave through the outlet, so a vented outlet drains the inlet side too.
          if (vented[rule.to]) vent(rule.from);
          break;
        case 'or':
        case 'and':
          // With no input holding it, the output bleeds back through an unpressurised inlet.
          if (vented[rule.a] || vented[rule.b]) vent(rule.out);
          break;
        case 'quickExhaust':
          if (standing(rule.supply) < held[rule.work] - EPS) { vent(rule.work); outlets[rule.work] = true; }
          break;
      }
    }
    return changed;
  });

  /* Phase 3 — pressure: firm nets take the supply, vented nets start empty, the rest keep what they held. */
  const pressure = graph.members.map((_, index) => limited(index, standing(index)));
  relax(count, rules.length, () => {
    let changed = false;
    const raise = (index: number, value: number) => {
      if (firm[index]) return;
      const next = limited(index, value);
      if (next > pressure[index] + EPS) { pressure[index] = next; changed = true; }
    };
    for (const rule of rules) {
      switch (rule.kind) {
        case 'open':
          // A volume feeding a vented line through a restrictor leaves that line at atmosphere: the restrictor drops the pressure.
          if (!timed(rule.b, rule.restrictedForward) && !(isVolume[rule.a] && rule.restrictedForward && vented[rule.b])) raise(rule.b, pressure[rule.a]);
          if (!timed(rule.a, rule.restrictedReverse) && !(isVolume[rule.b] && rule.restrictedReverse && vented[rule.a])) raise(rule.a, pressure[rule.b]);
          break;
        case 'oneWay':
          raise(rule.to, Math.min(pressure[rule.from] - rule.drop, rule.limit));
          break;
        case 'or':
          raise(rule.out, Math.max(pressure[rule.a], pressure[rule.b]));
          break;
        case 'and':
          if (pressure[rule.a] > rule.threshold && pressure[rule.b] > rule.threshold) raise(rule.out, Math.min(pressure[rule.a], pressure[rule.b]));
          break;
        case 'quickExhaust':
          raise(rule.work, pressure[rule.supply]);
          break;
      }
    }
    return changed;
  });

  /* Phase 4 — flow capacity: the widest path (largest bottleneck Cv) from a supply, and to an outlet. */
  const inflow = new Array<number>(count).fill(0);
  for (const index of sourceNets) inflow[index] = 1;
  relax(count, rules.length, () => {
    let changed = false;
    const widen = (index: number, value: number) => { if (value > inflow[index] + EPS) { inflow[index] = value; changed = true; } };
    for (const rule of rules) {
      switch (rule.kind) {
        case 'open':
          widen(rule.b, Math.min(inflow[rule.a], rule.forward));
          widen(rule.a, Math.min(inflow[rule.b], rule.reverse));
          break;
        case 'oneWay':
          widen(rule.to, inflow[rule.from]);
          break;
        case 'or':
          widen(rule.out, Math.max(inflow[rule.a], inflow[rule.b]));
          break;
        case 'and':
          widen(rule.out, Math.min(inflow[rule.a], inflow[rule.b]));
          break;
        case 'quickExhaust':
          widen(rule.work, inflow[rule.supply]);
          break;
      }
    }
    return changed;
  });

  const outflow: number[] = outlets.map(open => (open ? 1 : 0));
  relax(count, rules.length, () => {
    let changed = false;
    const widen = (index: number, value: number) => { if (value > outflow[index] + EPS) { outflow[index] = value; changed = true; } };
    for (const rule of rules) {
      switch (rule.kind) {
        case 'open':
          widen(rule.a, Math.min(outflow[rule.b], rule.forward));
          widen(rule.b, Math.min(outflow[rule.a], rule.reverse));
          break;
        case 'oneWay':
          widen(rule.from, outflow[rule.to]);
          break;
        case 'or':
        case 'and':
          widen(rule.out, Math.max(outflow[rule.a], outflow[rule.b]));
          break;
        case 'quickExhaust':
          break; // dumping is an outlet of its own, seeded above
      }
    }
    return changed;
  });

  const volumeLinks: VolumeLink[] = [];
  for (const rule of rules) {
    if (rule.kind !== 'open') continue;
    if (isVolume[rule.b] && (rule.restrictedForward || rule.restrictedReverse)) {
      volumeLinks.push({ volume: rule.b, other: rule.a, cvIn: rule.forward, timedIn: rule.restrictedForward, cvOut: rule.reverse, timedOut: rule.restrictedReverse });
    }
    if (isVolume[rule.a] && (rule.restrictedForward || rule.restrictedReverse)) {
      volumeLinks.push({ volume: rule.a, other: rule.b, cvIn: rule.reverse, timedIn: rule.restrictedReverse, cvOut: rule.forward, timedOut: rule.restrictedForward });
    }
  }

  return { pressure, vented, firm, relief, clamped, inflow, outflow, volumeLinks };
}

export interface PumpLine {
  componentId: string;
  /** The pump's pressure port. */
  node: NodeId;
}

/**
 * Hydraulic safety checks on each pump line.
 *   - No relief valve in free communication with the pump: warning.
 *   - Additionally deadheaded (no path to tank and no actuator taking flow): overpressure overload.
 * `consuming` tells whether any actuator moved this tick, i.e. the pump flow has somewhere to go.
 */
export function diagnoseHydraulics(graph: NetGraph, solution: PressureSolution, pumps: PumpLine[], consuming: boolean): EngineDiagnostic[] {
  const diagnostics: EngineDiagnostic[] = [];
  for (const pump of pumps) {
    const net = graph.netOf.get(pump.node);
    if (net === undefined || Number.isFinite(solution.relief[net])) continue;
    diagnostics.push({
      code: 'MISSING_RELIEF_VALVE',
      severity: 'warning',
      componentId: pump.componentId,
      message: 'Warning: Missing Pressure Relief Valve on hydraulic pump line',
    });
    if (solution.outflow[net] <= 0 && !consuming) {
      diagnostics.push({
        code: 'DEADHEAD_OVERPRESSURE',
        severity: 'error',
        componentId: pump.componentId,
        message: 'Overload: hydraulic pump line is deadheaded with no relief path (overpressure)',
      });
    }
  }
  return diagnostics;
}
