/**
 * Digital Logic engine stress audit (REPORT ONLY: this file adds tests, it changes no engine code).
 *
 * ≥300 procedurally generated scenarios across five pillars. Every scenario is an `it` whose
 * failure is a finding; the ledger printed in `afterAll` aggregates pass/fail per pillar and lists
 * every failing scenario with its message.
 *
 *   P1 combinational arrays, deep gate networks, parity trees, hazards and races (DES engine)
 *   P2 K-map minimization against an independent exact Quine-McCluskey reference + NAND/NOR synthesis
 *   P3 sequential: latches, D/JK/T/SR flip-flops, counters, shift rings, metastability, oscillators
 *   P4 FSM (state/excitation tables, traces, HDL) and the DES event queue (ordering, simultaneity)
 *   P5 digital↔analog bridge: gate macromodels on MNA, pull-up/pull-down nets, pivot thresholds
 */
import { afterAll, describe, expect, it } from 'vitest';
import { DiscreteEventLogicEngine, type LogicState } from './desLogicCore';
import { DigitalLogicSimulationEngine } from './digitalLogicSimulation';
import { TabDDocumentedMna } from './digitalLogicDocumentedMna';
import { shockleyCurrent, TabDNewtonMna } from './digitalLogicNewtonMna';
import { MNASolver } from './mnaSolver';
import { solveKMap } from './kmapSolver';
import { deriveUniversalSynthesis } from './synthesisEngine';
import { synthesisDiagramToCircuit } from '@/simulators/digital-logic/models/circuitExpressionExtractor';
import { generateCircuitFromExpression, extractBooleanExpression } from '@/simulators/digital-logic/models/circuitExpressionExtractor';
import { createDefaultFSM } from '../../../shared/logic/fsmTypes';
import {
  generateExcitationTable, generateStateAssignments, generateStateTable, generateVerilog, minimizeExcitationEquations,
  type FlipFlopKind, type FSMDefinition, type FSMEncoding, type FSMValue,
} from './fsmEngine';
import { evaluateAst, parseBooleanExpression } from '../../../shared/logic/logicEngine';
import type { CircuitComponent, CircuitWire, SimulationSnapshot } from '../../../shared/logic/circuitTypes';

// ───────────────────────────── ledger ─────────────────────────────

type Pillar = 'P1 combinational/hazard' | 'P2 K-map/synthesis' | 'P3 sequential' | 'P4 FSM/DES queue' | 'P5 MNA bridge';
const ledger = new Map<Pillar, { pass: number; fail: { name: string; message: string }[] }>();
const entry = (pillar: Pillar) => { if (!ledger.has(pillar)) ledger.set(pillar, { pass: 0, fail: [] }); return ledger.get(pillar)!; };

/** One audited circuit/function. Failures are recorded (for the ledger) and re-thrown (for vitest). */
function scenario(pillar: Pillar, name: string, body: () => void) {
  it(`${name}`, () => {
    try { body(); entry(pillar).pass += 1; } catch (error) {
      entry(pillar).fail.push({ name, message: (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 220) });
      throw error;
    }
  });
}

afterAll(() => {
  const lines: string[] = ['', '════════ DIGITAL LOGIC AUDIT LEDGER ════════'];
  let pass = 0; let fail = 0;
  ledger.forEach((value, pillar) => {
    pass += value.pass; fail += value.fail.length;
    const total = value.pass + value.fail.length;
    lines.push(`${pillar.padEnd(26)} ${String(value.pass).padStart(4)}/${String(total).padEnd(4)} ${(100 * value.pass / Math.max(1, total)).toFixed(2)}%`);
  });
  lines.push(`${'TOTAL'.padEnd(26)} ${String(pass).padStart(4)}/${String(pass + fail).padEnd(4)} ${(100 * pass / Math.max(1, pass + fail)).toFixed(2)}%`);
  ledger.forEach((value, pillar) => value.fail.forEach(f => lines.push(`  ✗ [${pillar}] ${f.name} :: ${f.message}`)));
  console.log(lines.join('\n'));
});

// ───────────────────────────── helpers ─────────────────────────────

const rng = (seed: number) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });
const level = (value: number | boolean): 'HIGH' | 'LOW' => (value ? 'HIGH' : 'LOW');
const bits = (value: number, width: number) => Array.from({ length: width }, (_, i) => (value >> i) & 1);

const GATE_FN: Record<string, (v: boolean[]) => boolean> = {
  'gate-and': v => v.every(Boolean), 'gate-or': v => v.some(Boolean), 'gate-nand': v => !v.every(Boolean), 'gate-nor': v => !v.some(Boolean),
  'gate-xor': v => v.filter(Boolean).length % 2 === 1, 'gate-xnor': v => v.filter(Boolean).length % 2 === 0, 'gate-not': v => !v[0],
};
const TWO_INPUT = ['gate-and', 'gate-or', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor'];

type Ref = { input: number } | { gate: number };
interface GateNode { type: string; ins: Ref[]; delay: number }
interface Net { inputs: number; gates: GateNode[]; out: Ref }

function evalNet(net: Net, vector: boolean[]): boolean {
  const memo = new Map<number, boolean>();
  const read = (ref: Ref): boolean => 'input' in ref ? vector[ref.input] : (() => {
    if (memo.has(ref.gate)) return memo.get(ref.gate)!;
    const gate = net.gates[ref.gate]; const value = GATE_FN[gate.type](gate.ins.map(read)); memo.set(ref.gate, value); return value;
  })();
  return read(net.out);
}

function buildNet(net: Net, shuffle?: () => number): { components: CircuitComponent[]; wires: CircuitWire[] } {
  const components: CircuitComponent[] = [
    ...Array.from({ length: net.inputs }, (_, i) => component(`i${i}`, 'digital-input', { state: 'LOW' })),
    ...net.gates.map((gate, i) => component(`g${i}`, gate.type, { propagationDelayNs: gate.delay })),
    component('o', 'digital-output'),
  ];
  const pin = (index: number) => 'abcdefgh'[index];
  const src = (ref: Ref): [string, string] => 'input' in ref ? [`i${ref.input}`, 'out'] : [`g${ref.gate}`, 'y'];
  const wires: CircuitWire[] = [];
  net.gates.forEach((gate, g) => gate.ins.forEach((ref, p) => { const [c, t] = src(ref); wires.push(wire(`w${g}_${p}`, c, t, `g${g}`, pin(p))); }));
  const [oc, ot] = src(net.out); wires.push(wire('wo', oc, ot, 'o', 'in'));
  if (shuffle) { const mix = <T,>(items: T[]) => items.map(item => [shuffle(), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item); return { components: mix(components), wires: mix(wires) }; }
  return { components, wires };
}

/** Random network whose longest path has exactly `depth` gates. */
function randomNet(random: () => number, inputs: number, depth: number, types = TWO_INPUT, delays = [10]): Net {
  const gates: GateNode[] = [];
  const delay = () => delays[Math.floor(random() * delays.length)];
  const make = (d: number): Ref => {
    if (d === 0) return { input: Math.floor(random() * inputs) };
    const type = random() < 0.15 ? 'gate-not' : types[Math.floor(random() * types.length)];
    const ins: Ref[] = type === 'gate-not' ? [make(d - 1)] : [make(d - 1), make(Math.floor(random() * d))];
    gates.push({ type, ins, delay: delay() });
    return { gate: gates.length - 1 };
  };
  return { inputs, gates, out: make(depth) };
}

const outputOf = (snapshot: SimulationSnapshot) => snapshot.terminalVoltages['o:in'];

/** Drives the network through every vector (Gray order, so exactly one input toggles per step). */
function checkNetAllVectors(net: Net, components: CircuitComponent[], wires: CircuitWire[], vectors = 1 << net.inputs) {
  const engine = new DiscreteEventLogicEngine();
  engine.setCircuit(components, wires);
  const current = Array<boolean>(net.inputs).fill(false);
  for (let step = 0; step < vectors; step += 1) {
    const gray = step ^ (step >> 1);
    const target = bits(gray, net.inputs).map(Boolean);
    target.forEach((value, i) => { if (value !== current[i]) { engine.driveDigitalInput(`i${i}`, value ? 1 : 0); current[i] = value; } });
    const snapshot = engine.getSnapshot();
    expect(snapshot.warnings.filter(w => w.code === 'logic-event-budget')).toEqual([]);
    expect(outputOf(snapshot), `vector ${target.map(Number).join('')}`).toBe(evalNet(net, target) ? 1 : 0);
  }
}

// ═══════════════════════ P1: combinational arrays, hazards, races ═══════════════════════

describe('P1 combinational gate arrays, propagation delay, hazards', () => {
  const P: Pillar = 'P1 combinational/hazard';
  const random = rng(1001);

  for (let n = 0; n < 40; n += 1) {
    const depth = 5 + (n % 11); const inputs = 3 + (n % 3);
    const net = randomNet(random, inputs, depth, TWO_INPUT, [5, 10, 15, 20]);
    scenario(P, `deep gate network #${n}: depth ${depth}, ${inputs} inputs, mixed delays`, () => {
      const { components, wires } = buildNet(net);
      checkNetAllVectors(net, components, wires);
    });
  }

  for (let n = 0; n < 12; n += 1) {
    const width = 4 + n; // 4..15 inputs
    const balanced = n % 2 === 0;
    const gates: GateNode[] = []; let layer: Ref[] = Array.from({ length: width }, (_, i) => ({ input: i }));
    if (balanced) {
      while (layer.length > 1) { const next: Ref[] = []; for (let i = 0; i < layer.length; i += 2) { if (i + 1 < layer.length) { gates.push({ type: 'gate-xor', ins: [layer[i], layer[i + 1]], delay: 10 }); next.push({ gate: gates.length - 1 }); } else next.push(layer[i]); } layer = next; }
    } else { let acc = layer[0]; for (let i = 1; i < width; i += 1) { gates.push({ type: 'gate-xor', ins: [acc, layer[i]], delay: 10 }); acc = { gate: gates.length - 1 }; } layer = [acc]; }
    scenario(P, `parity tree #${n}: ${width}-input ${balanced ? 'balanced' : 'chained'} XOR`, () => {
      const net: Net = { inputs: width, gates, out: layer[0] };
      const { components, wires } = buildNet(net);
      const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
      const vr = rng(77 + n); let cur = Array<boolean>(width).fill(false);
      for (let t = 0; t < 24; t += 1) {
        const target = Array.from({ length: width }, () => vr() < 0.5);
        target.forEach((v, i) => { if (v !== cur[i]) engine.driveDigitalInput(`i${i}`, v ? 1 : 0); }); cur = target;
        expect(outputOf(engine.getSnapshot())).toBe(target.filter(Boolean).length % 2);
      }
    });
  }

  /** Records every value that appears on the wire into the output. */
  const watchOutput = (engine: DiscreteEventLogicEngine, wireId: string) => { const seen: LogicState[] = []; engine.subscribeToWire(wireId, value => seen.push(value)); return seen; };
  const DELAYS = [5, 10, 15, 20, 25, 30, 40];
  for (let n = 0; n < 10; n += 1) {
    const dNot = DELAYS[n % 7]; const dAnd1 = DELAYS[(n * 3 + 1) % 7]; const dAnd2 = DELAYS[(n * 5 + 2) % 7]; const dOr = 10;
    scenario(P, `static-1 hazard #${n}: F=AB+A'C (B=C=1), delays not=${dNot} and1=${dAnd1} and2=${dAnd2}`, () => {
      const components = [component('A', 'digital-input', { state: 'HIGH' }), component('B', 'digital-input', { state: 'HIGH' }), component('C', 'digital-input', { state: 'HIGH' }),
        component('n', 'gate-not', { propagationDelayNs: dNot }), component('a1', 'gate-and', { propagationDelayNs: dAnd1 }), component('a2', 'gate-and', { propagationDelayNs: dAnd2 }), component('or', 'gate-or', { propagationDelayNs: dOr }), component('o', 'digital-output')];
      const wires = [wire('w1', 'A', 'out', 'n', 'a'), wire('w2', 'A', 'out', 'a1', 'a'), wire('w3', 'B', 'out', 'a1', 'b'), wire('w4', 'n', 'y', 'a2', 'a'), wire('w5', 'C', 'out', 'a2', 'b'), wire('w6', 'a1', 'y', 'or', 'a'), wire('w7', 'a2', 'y', 'or', 'b'), wire('w8', 'or', 'y', 'o', 'in')];
      const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
      expect(engine.getLogicState('or', 'y')).toBe(1);
      const seen = watchOutput(engine, 'w8');
      engine.driveDigitalInput('A', 0);
      const finalValue = engine.getLogicState('or', 'y');
      expect(finalValue).toBe(1);
      // a1 falls before a2 rises: both OR inputs are low for `width` ns. Inertial delay: a pulse wider than the
      // OR's own delay must propagate; one ≤ the delay may be absorbed (never required, never an error).
      const width = dNot + dAnd2 - dAnd1;
      if (width > dOr) expect(seen.includes(0), `pulse ${width} ns > ${dOr} ns must propagate, saw ${JSON.stringify(seen)}`).toBe(true);
      else expect(seen.every(v => v === 1 || v === 0)).toBe(true);
    });
  }

  for (let n = 0; n < 8; n += 1) {
    const dNot = DELAYS[n % 7]; const dOr1 = DELAYS[(n + 2) % 7]; const dOr2 = DELAYS[(n * 2 + 1) % 7];
    scenario(P, `static-0 hazard #${n}: F=(A+B)(A'+C) (B=C=0), delays not=${dNot} or1=${dOr1} or2=${dOr2}`, () => {
      const components = [component('A', 'digital-input', { state: 'LOW' }), component('B', 'digital-input', { state: 'LOW' }), component('C', 'digital-input', { state: 'LOW' }),
        component('n', 'gate-not', { propagationDelayNs: dNot }), component('o1', 'gate-or', { propagationDelayNs: dOr1 }), component('o2', 'gate-or', { propagationDelayNs: dOr2 }), component('and', 'gate-and', { propagationDelayNs: 10 }), component('o', 'digital-output')];
      const wires = [wire('w1', 'A', 'out', 'n', 'a'), wire('w2', 'A', 'out', 'o1', 'a'), wire('w3', 'B', 'out', 'o1', 'b'), wire('w4', 'n', 'y', 'o2', 'a'), wire('w5', 'C', 'out', 'o2', 'b'), wire('w6', 'o1', 'y', 'and', 'a'), wire('w7', 'o2', 'y', 'and', 'b'), wire('w8', 'and', 'y', 'o', 'in')];
      const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
      expect(engine.getLogicState('and', 'y')).toBe(0);
      const seen = watchOutput(engine, 'w8');
      engine.driveDigitalInput('A', 1);
      expect(engine.getLogicState('and', 'y')).toBe(0);
      const width = dNot + dOr2 - dOr1; // both AND inputs high for `width` ns; inertial rule as above (AND delay 10 ns)
      if (width > 10) expect(seen.includes(1), `pulse ${width} ns > 10 ns must propagate, saw ${JSON.stringify(seen)}`).toBe(true);
    });
  }

  for (let n = 0; n < 8; n += 1) {
    const chain = 1 + (n % 4); const unit = [5, 10, 20][n % 3]; // delay chain of inverters (2·k keeps polarity)
    scenario(P, `race: A XOR delay(A), ${2 * chain} inverters × ${unit} ns`, () => {
      const components = [component('A', 'digital-input', { state: 'LOW' }), ...Array.from({ length: 2 * chain }, (_, i) => component(`n${i}`, 'gate-not', { propagationDelayNs: unit })), component('x', 'gate-xor', { propagationDelayNs: 10 }), component('o', 'digital-output')];
      const wires = [wire('a0', 'A', 'out', 'n0', 'a'), ...Array.from({ length: 2 * chain - 1 }, (_, i) => wire(`c${i}`, `n${i}`, 'y', `n${i + 1}`, 'a')), wire('xa', 'A', 'out', 'x', 'a'), wire('xb', `n${2 * chain - 1}`, 'y', 'x', 'b'), wire('wo', 'x', 'y', 'o', 'in')];
      const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
      expect(engine.getLogicState('x', 'y')).toBe(0);
      const seen = watchOutput(engine, 'wo');
      engine.driveDigitalInput('A', 1);
      expect(engine.getLogicState('x', 'y')).toBe(0); // settled: A == delayed A
      // inertial delay: the XOR passes the A≠delayed(A) pulse only if it is at least as wide as its own delay
      if (2 * chain * unit >= 10) expect(seen, 'one pulse of width = chain delay').toEqual([1, 0]);
      else expect(seen).toEqual([]);
    });
  }

  const exprRandom = rng(4242);
  const exprs = ['A*B+C', "A'B+AB'", 'A^B^C', '(A+B)*(C+D)', "A*B'+C*D'+A'*C", "(A^B)*(C+D')", "A'*B'*C'+A*B*C", "((A*B)+(C*D))^(A+D)"]
    .concat(Array.from({ length: 12 }, () => { const vars = ['A', 'B', 'C', 'D']; const term = () => Array.from({ length: 2 + Math.floor(exprRandom() * 2) }, () => { const v = vars[Math.floor(exprRandom() * 4)]; return exprRandom() < 0.4 ? `${v}'` : v; }).join('*'); return Array.from({ length: 2 + Math.floor(exprRandom() * 3) }, term).join(' + '); }));
  exprs.forEach((source, n) => scenario(P, `expression→circuit→simulate→extract #${n}: ${source}`, () => {
    const parsed = parseBooleanExpression(source);
    const { components, wires } = generateCircuitFromExpression(source);
    const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
    const inputs = components.filter(c => c.type === 'digital-input'); const out = components.find(c => c.type === 'digital-output')!;
    const vars = parsed.variables;
    for (let v = 0; v < 1 << vars.length; v += 1) {
      const ctx = Object.fromEntries(vars.map((name, i) => [name, Boolean((v >> i) & 1)]));
      inputs.forEach(input => { const want = ctx[input.label] ? 1 : 0; if (engine.getLogicState(input.id, 'out') !== want) engine.driveDigitalInput(input.id, want); });
      expect(engine.getSnapshot().terminalVoltages[`${out.id}:in`], `${source} @ ${JSON.stringify(ctx)}`).toBe(evaluateAst(parsed.ast, ctx) ? 1 : 0);
    }
    const extracted = extractBooleanExpression(components, wires);
    expect(extracted).not.toBeNull();
    const back = parseBooleanExpression(extracted!);
    for (let v = 0; v < 1 << vars.length; v += 1) {
      const ctx = Object.fromEntries(vars.map((name, i) => [name, Boolean((v >> i) & 1)]));
      expect(evaluateAst(back.ast, ctx), `extracted ${extracted}`).toBe(evaluateAst(parsed.ast, ctx));
    }
  }));
});

// ═══════════════════════ P2: K-map / synthesis ═══════════════════════

/** Independent exact minimizer: prime implicants by exhaustive cube enumeration, minimum cover by branch & bound. */
function referenceMinimum(width: number, on: number[], dc: number[]) {
  const care = new Set([...on, ...dc]);
  const cells = (cube: string) => { const out: number[] = []; for (let m = 0; m < 1 << width; m += 1) { const b = m.toString(2).padStart(width, '0'); if ([...cube].every((c, i) => c === '-' || c === b[i])) out.push(m); } return out; };
  const isImplicant = (cube: string) => cells(cube).every(m => care.has(m));
  const cubes: string[] = []; const gen = (prefix: string) => { if (prefix.length === width) { cubes.push(prefix); return; } ['0', '1', '-'].forEach(c => gen(prefix + c)); }; gen('');
  const implicants = cubes.filter(isImplicant);
  const primes = implicants.filter(cube => ![...cube].some((c, i) => c !== '-' && isImplicant(cube.slice(0, i) + '-' + cube.slice(i + 1))))
    .map(cube => ({ cube, covers: cells(cube).filter(m => on.includes(m)), literals: [...cube].filter(c => c !== '-').length })).filter(p => p.covers.length > 0);
  let best = { terms: Infinity, literals: Infinity };
  const search = (uncovered: number[], terms: number, literals: number) => {
    if (terms > best.terms || (terms === best.terms && literals >= best.literals)) return;
    if (!uncovered.length) { best = { terms, literals }; return; }
    const target = uncovered.reduce((a, b) => primes.filter(p => p.covers.includes(a)).length <= primes.filter(p => p.covers.includes(b)).length ? a : b);
    primes.filter(p => p.covers.includes(target)).forEach(p => search(uncovered.filter(m => !p.covers.includes(m)), terms + 1, literals + p.literals));
  };
  search(on, 0, 0);
  return { primes: primes.map(p => p.cube).sort(), best: on.length ? best : { terms: 0, literals: 0 } };
}

const VARS = ['A', 'B', 'C', 'D', 'E'];
function auditKMap(width: number, on: number[], dc: number[]) {
  const variables = VARS.slice(0, width);
  const solution = solveKMap({ variables, minterms: on, dontCares: dc });
  const reference = referenceMinimum(width, on, dc);
  const care = new Set([...on, ...dc]);
  expect(solution.uncoveredMinterms).toEqual([]);
  // every selected implicant stays inside on ∪ dc and the union covers the on-set
  const covered = new Set<number>();
  solution.selectedPrimeImplicants.forEach(imp => {
    for (let m = 0; m < 1 << width; m += 1) { const b = m.toString(2).padStart(width, '0'); if ([...imp.pattern].every((c, i) => c === '-' || c === b[i])) { expect(care.has(m), `${imp.pattern} covers off-set cell ${m}`).toBe(true); covered.add(m); } }
  });
  on.forEach(m => expect(covered.has(m), `minterm ${m} uncovered`).toBe(true));
  // prime implicant set equals the reference set (when the on-set is non-empty)
  if (on.length) {
    const solverPrimes = solution.primeImplicants.filter(p => p.coveredMinterms.length > 0).map(p => p.pattern).sort();
    expect(solverPrimes).toEqual(reference.primes);
  }
  // exact minimum cost (terms, then literals)
  expect(solution.hardwareCost, `minimum cost for on=${JSON.stringify(on)} dc=${JSON.stringify(dc)}`).toEqual(reference.best);
  // the printed SOP evaluates to the function on the care set
  const expr = parseBooleanExpression(solution.expression);
  for (let m = 0; m < 1 << width; m += 1) {
    if (dc.includes(m)) continue;
    const ctx = Object.fromEntries(variables.map((v, i) => [v, Boolean((m >> (width - 1 - i)) & 1)]));
    expect(evaluateAst(expr.ast, ctx), `SOP "${solution.expression}" @ m${m}`).toBe(on.includes(m));
  }
  return solution;
}

describe('P2 K-map solver vs exact Quine-McCluskey reference', () => {
  const P: Pillar = 'P2 K-map/synthesis';
  for (let mask = 0; mask < 16; mask += 1) scenario(P, `2-variable function #${mask}`, () => auditKMap(2, bits(mask, 4).flatMap((b, m) => b ? [m] : []), []));
  for (let mask = 0; mask < 256; mask += 1) scenario(P, `3-variable function #${mask}`, () => auditKMap(3, bits(mask, 8).flatMap((b, m) => b ? [m] : []), []));
  const random = rng(31337);
  for (let n = 0; n < 40; n += 1) scenario(P, `3-variable with don't-cares #${n}`, () => {
    const on: number[] = []; const dc: number[] = [];
    for (let m = 0; m < 8; m += 1) { const r = random(); if (r < 0.35) on.push(m); else if (r < 0.6) dc.push(m); }
    auditKMap(3, on, dc);
  });
  for (let n = 0; n < 70; n += 1) scenario(P, `4-variable random #${n} (dc density ${n % 3 === 0 ? 0 : n % 3 === 1 ? 20 : 40}%)`, () => {
    const dcDensity = [0, 0.2, 0.4][n % 3]; const on: number[] = []; const dc: number[] = [];
    for (let m = 0; m < 16; m += 1) { const r = random(); if (r < dcDensity) dc.push(m); else if (random() < 0.45) on.push(m); }
    auditKMap(4, on, dc);
  });
  for (let n = 0; n < 8; n += 1) scenario(P, `5-variable random #${n}`, () => {
    const on: number[] = []; const dc: number[] = [];
    for (let m = 0; m < 32; m += 1) { const r = random(); if (r < 0.1) dc.push(m); else if (random() < 0.4) on.push(m); }
    auditKMap(5, on, dc);
  });
  // classic hard fixtures: cyclic cores, parity (no merges), tautology
  scenario(P, 'cyclic prime-implicant chart (Petrick) 4-var', () => auditKMap(4, [0, 1, 2, 5, 6, 7], []));
  scenario(P, '4-variable parity (no adjacent minterms)', () => auditKMap(4, [1, 2, 4, 7, 8, 11, 13, 14], []));
  scenario(P, '4-variable tautology', () => auditKMap(4, Array.from({ length: 16 }, (_, i) => i), []));
  scenario(P, '4-variable only don\'t-cares + one minterm', () => auditKMap(4, [5], [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));

  /** Parses a K-map SOP (or POS from the complement), lowers it to NAND/NOR, simulates, compares on the care set. */
  const synthesisCheck = (mode: 'NAND' | 'NOR', width: number, on: number[], dc: number[]) => {
    const variables = VARS.slice(0, width); const off = Array.from({ length: 1 << width }, (_, m) => m).filter(m => !on.includes(m) && !dc.includes(m));
    let expression: string;
    if (mode === 'NAND') expression = solveKMap({ variables, minterms: on, dontCares: dc }).expression;
    else expression = solveKMap({ variables, minterms: off, dontCares: dc }).selectedPrimeImplicants
      .map(imp => `(${[...imp.pattern].flatMap((c, i) => c === '-' ? [] : [c === '1' ? `${variables[i]}'` : variables[i]]).join('+')})`).join('*');
    const derivation = deriveUniversalSynthesis(expression, mode);
    const { components, wires } = synthesisDiagramToCircuit(derivation.diagram);
    expect(components.filter(c => c.type !== 'digital-input' && c.type !== 'digital-output').every(c => c.type === (mode === 'NAND' ? 'gate-nand' : 'gate-nor')), 'only universal gates').toBe(true);
    const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
    const out = components.find(c => c.type === 'digital-output')!;
    for (let m = 0; m < 1 << width; m += 1) {
      if (dc.includes(m)) continue;
      components.filter(c => c.type === 'digital-input').forEach(input => { const idx = variables.indexOf(input.label); const want = (m >> (width - 1 - idx)) & 1; if (engine.getLogicState(input.id, 'out') !== want) engine.driveDigitalInput(input.id, want); });
      expect(engine.getSnapshot().terminalVoltages[`${out.id}:in`], `${mode} ${expression} @ m${m}`).toBe(on.includes(m) ? 1 : 0);
    }
  };
  const synthRandom = rng(555);
  const nontrivial = (width: number) => { for (;;) { const on: number[] = []; for (let m = 0; m < 1 << width; m += 1) if (synthRandom() < 0.4) on.push(m); if (on.length > 0 && on.length < 1 << width) return on; } };
  for (let n = 0; n < 24; n += 1) scenario(P, `K-map SOP → universal NAND circuit → simulate #${n}`, () => synthesisCheck('NAND', 3 + (n % 2), nontrivial(3 + (n % 2)), []));
  for (let n = 0; n < 12; n += 1) scenario(P, `K-map POS → universal NOR circuit → simulate #${n}`, () => synthesisCheck('NOR', 3 + (n % 2), nontrivial(3 + (n % 2)), []));
});

// ═══════════════════════ P3: sequential ═══════════════════════

describe('P3 sequential logic & edge-triggered systems', () => {
  const P: Pillar = 'P3 sequential';
  const pulse = (engine: DiscreteEventLogicEngine, clock = 'clk') => { engine.driveDigitalInput(clock, 1); engine.driveDigitalInput(clock, 0); };
  const ffKinds = ['d', 't', 'jk', 'sr'] as const;
  const characteristic = (kind: typeof ffKinds[number], q: LogicState, i: Record<string, 0 | 1>): LogicState => {
    if (kind === 'd') return i.d;
    if (kind === 't') return i.t ? (q === 'X' ? 'X' : (q ? 0 : 1)) : q;
    if (kind === 'jk') return i.j && !i.k ? 1 : !i.j && i.k ? 0 : i.j && i.k ? (q === 'X' ? 'X' : (q ? 0 : 1)) : q;
    return i.s && !i.r ? 1 : i.r && !i.s ? 0 : i.s && i.r ? 'X' : q;
  };
  ffKinds.forEach(kind => { for (let n = 0; n < 8; n += 1) scenario(P, `${kind.toUpperCase()} flip-flop random sequence #${n}`, () => {
    const pins = kind === 'd' ? ['d'] : kind === 't' ? ['t'] : kind === 'jk' ? ['j', 'k'] : ['s', 'r'];
    const components = [...pins.map(p => component(p, 'digital-input', { state: 'LOW' })), component('clk', 'digital-input', { state: 'LOW' }), component('ff', `logic-ff-${kind}`)];
    const wires = [...pins.map(p => wire(`w${p}`, p, 'out', 'ff', p)), wire('wclk', 'clk', 'out', 'ff', 'clk')];
    const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
    const random = rng(900 + n * 7 + kind.length); let q: LogicState = 0;
    for (let step = 0; step < 24; step += 1) {
      const inputs: Record<string, 0 | 1> = {}; pins.forEach(p => { inputs[p] = random() < 0.5 ? 1 : 0; engine.driveDigitalInput(p, inputs[p]); });
      expect(engine.getLogicState('ff', 'q'), 'inputs alone must not clock the flip-flop').toBe(q);
      q = characteristic(kind, q, inputs); pulse(engine);
      expect(engine.getLogicState('ff', 'q'), `after pulse ${step} with ${JSON.stringify(inputs)}`).toBe(q);
      const qn = engine.getLogicState('ff', 'qn'); expect(qn).toBe(q === 'X' ? 'X' : q ? 0 : 1);
    }
  }); });

  for (const width of [2, 3, 4, 5]) scenario(P, `${width}-bit asynchronous ripple counter (T-FF chain on /Q)`, () => {
    const components = [component('clk', 'digital-input', { state: 'LOW' }), component('one', 'digital-input', { state: 'HIGH' }), ...Array.from({ length: width }, (_, i) => component(`f${i}`, 'logic-ff-t'))];
    const wires = [wire('c0', 'clk', 'out', 'f0', 'clk'), ...Array.from({ length: width }, (_, i) => wire(`t${i}`, 'one', 'out', `f${i}`, 't')), ...Array.from({ length: width - 1 }, (_, i) => wire(`r${i}`, `f${i}`, 'qn', `f${i + 1}`, 'clk'))];
    const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
    for (let p = 1; p <= 3 * (1 << width); p += 1) {
      pulse(engine);
      const value = Array.from({ length: width }, (_, i) => engine.getLogicState(`f${i}`, 'q')).reduce<number>((acc, q, i) => acc | ((q === 1 ? 1 : 0) << i), 0);
      expect(value, `after ${p} clocks`).toBe(p % (1 << width));
    }
  });
  for (let n = 0; n < 3; n += 1) scenario(P, `4-bit synchronous counter block, reset at pulse ${5 + n * 4}`, () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('clk', 'digital-input', { state: 'LOW' }), component('reset', 'digital-input', { state: 'LOW' }), component('cnt', 'logic-counter')], [wire('c', 'clk', 'out', 'cnt', 'clk'), wire('r', 'reset', 'out', 'cnt', 'reset')]);
    let expected = 0;
    for (let p = 1; p <= 40; p += 1) {
      if (p === 5 + n * 4) { engine.driveDigitalInput('reset', 1); pulse(engine); engine.driveDigitalInput('reset', 0); expected = 0; } else { pulse(engine); expected = (expected + 1) & 15; }
      const value = [0, 1, 2, 3].reduce<number>((acc, i) => acc | ((engine.getLogicState('cnt', `q${i}`) === 1 ? 1 : 0) << i), 0);
      expect(value, `pulse ${p}`).toBe(expected);
    }
  });

  scenario(P, 'Johnson counter (shift register + inverted feedback): 8-state sequence', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('clk', 'digital-input', { state: 'LOW' }), component('sr', 'logic-shift-register'), component('inv', 'gate-not')], [wire('c', 'clk', 'out', 'sr', 'clk'), wire('q3', 'sr', 'q3', 'inv', 'a'), wire('fb', 'inv', 'y', 'sr', 'd')]);
    const model = [0, 0, 0, 0];
    for (let p = 0; p < 24; p += 1) {
      pulse(engine); model.unshift(model[3] ? 0 : 1); model.length = 4;
      expect([0, 1, 2, 3].map(i => engine.getLogicState('sr', `q${i}`)), `pulse ${p}`).toEqual(model);
    }
  });
  scenario(P, 'ring counter: a single circulating one over 4 states', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('clk', 'digital-input', { state: 'LOW' }), component('seed', 'digital-input', { state: 'HIGH' }), component('sr', 'logic-shift-register'), component('or', 'gate-or')], [wire('c', 'clk', 'out', 'sr', 'clk'), wire('s', 'seed', 'out', 'or', 'a'), wire('q3', 'sr', 'q3', 'or', 'b'), wire('fb', 'or', 'y', 'sr', 'd')]);
    pulse(engine); engine.driveDigitalInput('seed', 0);
    for (let p = 0; p < 20; p += 1) {
      const hot = [0, 1, 2, 3].filter(i => engine.getLogicState('sr', `q${i}`) === 1);
      expect(hot, `after ${p + 1} clocks`).toEqual([p % 4]);
      pulse(engine);
    }
  });

  // asynchronous feedback: bounded, deterministic, and never a silent hang
  const latch = (dA: number, dB: number) => [
    component('S', 'digital-input', { state: 'LOW' }), component('R', 'digital-input', { state: 'LOW' }), component('n1', 'gate-nor', { propagationDelayNs: dA }), component('n2', 'gate-nor', { propagationDelayNs: dB }),
  ].concat([]) as CircuitComponent[];
  const latchWires = [wire('s', 'S', 'out', 'n2', 'a'), wire('r', 'R', 'out', 'n1', 'a'), wire('q', 'n1', 'y', 'n2', 'b'), wire('qn', 'n2', 'y', 'n1', 'b')];
  for (let n = 0; n < 8; n += 1) scenario(P, `NOR SR-latch set/reset/hold sequence #${n} (skew ${n % 2 ? 'unequal' : 'equal'} delays)`, () => {
    const engine = new DiscreteEventLogicEngine(); engine.setCircuit(latch(10, n % 2 ? 13 : 10), latchWires);
    const random = rng(6000 + n); let q: 0 | 1 | null = null;
    // power-up: S=R=0 with both outputs 0 is itself an undefined state; a legal first move is set or reset
    for (let step = 0; step < 14; step += 1) {
      const cmd = (q === null ? 1 + Math.floor(random() * 2) : Math.floor(random() * 3)); // 0 hold, 1 set, 2 reset
      engine.driveDigitalInput('S', cmd === 1 ? 1 : 0); engine.driveDigitalInput('R', cmd === 2 ? 1 : 0);
      if (cmd === 1) q = 1; else if (cmd === 2) q = 0;
      engine.driveDigitalInput('S', 0); engine.driveDigitalInput('R', 0);
      const snapshot = engine.getSnapshot();
      expect(snapshot.status, `step ${step}: latch must settle`).toBe('settled');
      expect(engine.getLogicState('n1', 'y'), `Q after step ${step}`).toBe(q);
      expect(engine.getLogicState('n2', 'y'), `Qbar after step ${step}`).toBe(q ? 0 : 1);
    }
  });
  for (let n = 0; n < 4; n += 1) scenario(P, `simultaneous S=R=1 release (metastability) #${n}: ${n < 2 ? 'equal' : 'skewed'} delays terminates and flags oscillation`, () => {
    const run = () => { const engine = new DiscreteEventLogicEngine(); engine.setCircuit(latch(10, n < 2 ? 10 : 14), latchWires); engine.driveDigitalInput('S', 1); engine.driveDigitalInput('R', 1); engine.driveDigitalInput('S', 0); engine.driveDigitalInput('R', 0); return engine; };
    const a = run(); const b = run();
    const sa = a.getSnapshot(); const sb = b.getSnapshot();
    expect(JSON.stringify(sa.terminalVoltages)).toBe(JSON.stringify(sb.terminalVoltages)); // deterministic
    const settled = a.getLogicState('n1', 'y') !== a.getLogicState('n2', 'y');
    const flagged = sa.status === 'oscillating';
    expect(settled || flagged, 'either resolves to complementary outputs or reports the oscillation').toBe(true);
  });
  for (const stages of [1, 3, 5, 7]) scenario(P, `ring oscillator, ${stages} inverters: bounded run, flagged, deterministic`, () => {
    const build = () => { const components = Array.from({ length: stages }, (_, i) => component(`n${i}`, 'gate-not', { propagationDelayNs: 10 })); const wires = Array.from({ length: stages }, (_, i) => wire(`w${i}`, `n${i}`, 'y', `n${(i + 1) % stages}`, 'a')); const e = new DiscreteEventLogicEngine(); e.setCircuit(components, wires); return e; };
    const started = performance.now(); const a = build(); const b = build();
    expect(performance.now() - started).toBeLessThan(5000);
    expect(a.getSnapshot().status, 'oscillation must be reported, not hidden').toBe('oscillating');
    expect(a.getSnapshot().converged).toBe(false);
    expect(a.getSnapshot().warnings.some(w => w.code === 'logic-oscillation')).toBe(true);
    expect(JSON.stringify(a.getSnapshot().terminalVoltages)).toBe(JSON.stringify(b.getSnapshot().terminalVoltages));
    Object.values(a.getSnapshot().terminalVoltages).forEach(v => expect(Number.isFinite(v)).toBe(true));
  });
  for (const stages of [2, 4]) scenario(P, `even inverter loop (${stages}): bistable, must hold a legal complementary state`, () => {
    const components = Array.from({ length: stages }, (_, i) => component(`n${i}`, 'gate-not', { propagationDelayNs: 10 })); const wires = Array.from({ length: stages }, (_, i) => wire(`w${i}`, `n${i}`, 'y', `n${(i + 1) % stages}`, 'a'));
    const engine = new DiscreteEventLogicEngine(); engine.setCircuit(components, wires);
    const outs = components.map(c => engine.getLogicState(c.id, 'y'));
    const alternating = outs.every((value, i) => value !== outs[(i + 1) % stages]);
    expect(alternating || engine.getSnapshot().status === 'oscillating').toBe(true);
  });
  for (let n = 0; n < 4; n += 1) scenario(P, `D-FF with data changing in the clock's own delta cycle #${n} is deterministic and order independent`, () => {
    const components = [component('x', 'digital-input', { state: 'LOW' }), component('ff', 'logic-ff-d', { propagationDelayNs: [0, 5, 10, 20][n] })];
    const wires = [wire('d', 'x', 'out', 'ff', 'd'), wire('c', 'x', 'out', 'ff', 'clk')];
    const results = [wires, [...wires].reverse()].map(order => { const e = new DiscreteEventLogicEngine(); e.setCircuit(components, order); e.driveDigitalInput('x', 1); e.driveDigitalInput('x', 0); e.driveDigitalInput('x', 1); return [e.getLogicState('ff', 'q'), e.getLogicState('ff', 'qn')]; });
    expect(results[0]).toEqual(results[1]);
  });
});

// ═══════════════════════ P4: FSM + DES queue ═══════════════════════

describe('P4 FSM engine and discrete-event queue', () => {
  const P: Pillar = 'P4 FSM/DES queue';
  const random = rng(24680);
  const makeFsm = (n: number): FSMDefinition => {
    const count = 2 + (n % 5); const kind = n % 2 ? 'Mealy' : 'Moore';
    const states = Array.from({ length: count }, (_, i) => ({ id: `S${i}`, name: `S${i}`, output: (random() < 0.5 ? '1' : '0') as FSMValue, x: i * 50, y: 0 }));
    const transitions = states.flatMap((s, i) => (['0', '1'] as const).filter(() => n % 7 !== 6 || random() < 0.8).map(input => ({ id: `t${i}${input}`, from: s.id, to: states[Math.floor(random() * count)].id, input, output: (random() < 0.5 ? '1' : '0') as FSMValue })));
    return { kind, inputName: 'A', outputName: 'Y', states, transitions };
  };
  const encodings: FSMEncoding[] = ['Binary', 'Gray', 'One-Hot'];
  const fsmCache = new Map<number, FSMDefinition>();
  const resolve = (x: FSMValue): ('0' | '1')[] => x === 'X' ? ['0', '1'] : [x];
  const apply = (kind: FlipFlopKind, q: '0' | '1', s: Record<string, FSMValue>, label: number): ('0' | '1')[] => {
    const out = new Set<'0' | '1'>();
    if (kind === 'D') resolve(s[`D${label}`]).forEach(d => out.add(d));
    if (kind === 'T') resolve(s[`T${label}`]).forEach(t => out.add(t === '1' ? (q === '1' ? '0' : '1') : q));
    if (kind === 'JK') resolve(s[`J${label}`]).forEach(j => resolve(s[`K${label}`]).forEach(k => out.add(j === '1' && k === '1' ? (q === '1' ? '0' : '1') : j === '1' ? '1' : k === '1' ? '0' : q)));
    if (kind === 'SR') resolve(s[`S${label}`]).forEach(set => resolve(s[`R${label}`]).forEach(rst => { if (set === '1' && rst === '1') out.add('0'); else out.add(set === '1' ? '1' : rst === '1' ? '0' : q); }));
    return Array.from(out);
  };
  for (let n = 0; n < 24; n += 1) encodings.forEach(encoding => scenario(P, `FSM #${n} (${makeFsmLabel(n)}) × ${encoding}: assignments, state table, excitation, trace, Verilog`, () => {
    const machine = makeFsmCached(n);
    const assignments = generateStateAssignments(machine.states, encoding);
    expect(new Set(assignments.map(a => a.code)).size, 'codes unique').toBe(assignments.length);
    if (encoding === 'One-Hot') assignments.forEach(a => expect([...a.code].filter(c => c === '1').length).toBe(1));
    if (encoding === 'Gray') for (let i = 1; i < assignments.length; i += 1) expect([...assignments[i].code].filter((c, k) => c !== assignments[i - 1].code[k]).length, 'Gray adjacency').toBe(1);
    const table = generateStateTable(machine, encoding);
    const width = assignments[0].code.length;
    expect(table).toHaveLength(2 * 2 ** width);
    table.filter(r => r.unused).forEach(r => { expect(r.nextCode).toBe('X'.repeat(width)); expect(r.output).toBe('X'); });
    const byCode = new Map(assignments.map(a => [a.code, a.stateId]));
    table.filter(r => !r.unused).forEach(row => {
      const from = byCode.get(row.presentCode)!; const t = machine.transitions.find(x => x.from === from && x.input === row.input);
      const expectedNext = t ? t.to : from;
      expect(row.nextCode, `${from} --${row.input}-->`).toBe(assignments.find(a => a.stateId === expectedNext)!.code);
      expect(row.output).toBe(machine.kind === 'Moore' ? machine.states.find(s => s.id === from)!.output : t?.output ?? '0');
    });
    // trace: walk the table and the transition list side by side
    let state = machine.states[0].id; let code = assignments[0].code;
    for (let step = 0; step < 30; step += 1) {
      const input: FSMValue = random() < 0.5 ? '0' : '1';
      const t = machine.transitions.find(x => x.from === state && x.input === input); const next = t ? t.to : state;
      const row = table.find(r => r.presentCode === code && r.input === input)!;
      expect(row.nextState).toBe(machine.states.find(s => s.id === next)!.name);
      state = next; code = row.nextCode;
    }
    (['D', 'T', 'JK', 'SR'] as FlipFlopKind[]).forEach(ff => {
      const excitation = generateExcitationTable(table, ff);
      excitation.filter(r => !r.unused).forEach(row => [...row.presentCode].forEach((c, index) => {
        const label = width - 1 - index; const got = apply(ff, c as '0' | '1', row.signals, label);
        expect(got.every(v => v === row.nextCode[index]), `${ff} excitation for bit ${label} of ${row.presentState}/${row.input}: reaches ${got} want ${row.nextCode[index]}`).toBe(true);
      }));
      const equations = minimizeExcitationEquations(excitation, 'A');
      if (width + 1 <= 5) {
        expect(equations.length).toBe(Object.keys(excitation[0].signals).length);
        equations.forEach(eq => { expect(eq.minterms.filter(m => eq.dontCares.includes(m))).toEqual([]); expect(eq.latex.length).toBeGreaterThan(3); });
      } else expect(equations).toEqual([]);
    });
    const verilog = generateVerilog(machine, encoding);
    machine.states.forEach(s => expect(verilog).toContain(`localparam [${width - 1}:0] ${s.name.toUpperCase()} = ${width}'b${assignments.find(a => a.stateId === s.id)!.code};`));
    expect(verilog).toContain('endmodule');
  }));
  function makeFsmCached(n: number) { if (!fsmCache.has(n)) fsmCache.set(n, makeFsm(n)); return fsmCache.get(n)!; }
  function makeFsmLabel(n: number) { const m = makeFsmCached(n); return `${m.kind}, ${m.states.length} states`; }

  scenario(P, 'default FSM: complete state table, 3 encodings', () => { const m = createDefaultFSM(); encodings.forEach(e => expect(generateStateTable(m, e).filter(r => !r.unused)).toHaveLength(6)); });

  // DES queue: ordering and simultaneity
  for (let n = 0; n < 10; n += 1) scenario(P, `DES: component/wire creation order does not change the settled result or per-wire history #${n}`, () => {
    const r = rng(8800 + n); const net = randomNet(r, 4, 6 + (n % 4), TWO_INPUT, [0, 5, 10, 10, 20]);
    const histories: string[] = []; const finals: string[] = [];
    [undefined, rng(1), rng(2)].forEach(shuffle => {
      const { components, wires } = buildNet(net, shuffle); const e = new DiscreteEventLogicEngine(); e.setCircuit(components, wires);
      const log: string[] = []; wires.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(w => e.subscribeToWire(w.id, (v) => log.push(`${w.id}=${v}`)));
      for (let step = 1; step < 16; step += 1) { const g = step ^ (step >> 1); const prev = (step - 1) ^ ((step - 1) >> 1); bits(g ^ prev, 4).forEach((flip, i) => { if (flip) e.driveDigitalInput(`i${i}`, bits(g, 4)[i] as 0 | 1); }); }
      finals.push(String(outputOf(e.getSnapshot()))); histories.push(log.sort().join(','));
    });
    expect(finals[1]).toBe(finals[0]); expect(finals[2]).toBe(finals[0]);
    expect(histories[1], 'event history differs with wire order').toBe(histories[0]);
  });
  for (let n = 0; n < 8; n += 1) scenario(P, `DES: event timestamps are monotone and zero-delay delta cycles terminate #${n}`, () => {
    const r = rng(9900 + n); const net = randomNet(r, 3, 8, TWO_INPUT, n % 2 ? [0] : [0, 3, 7]); const { components, wires } = buildNet(net);
    const e = new DiscreteEventLogicEngine(); e.setCircuit(components, wires);
    let last = -1; wires.forEach(w => e.subscribeToWire(w.id, (_v, at) => { expect(at, `time went backwards on ${w.id}`).toBeGreaterThanOrEqual(last); last = at; }));
    for (let step = 1; step < 8; step += 1) { const g = step ^ (step >> 1); const prev = (step - 1) ^ ((step - 1) >> 1); bits(g ^ prev, 3).forEach((flip, i) => { if (flip) e.driveDigitalInput(`i${i}`, bits(g, 3)[i] as 0 | 1); }); expect(e.getSnapshot().warnings.some(w => w.code === 'logic-event-budget')).toBe(false); expect(outputOf(e.getSnapshot())).toBe(evalNet(net, bits(g, 3).map(Boolean)) ? 1 : 0); }
  });
  for (let n = 0; n < 4; n += 1) scenario(P, `DES: multi-driver net resolves ${['1 vs 0', '1 vs 1', '0 vs 0', '1 vs Z-less 0 with third driver'][n]} and conflicts are reported`, () => {
    const states = [['HIGH', 'LOW'], ['HIGH', 'HIGH'], ['LOW', 'LOW'], ['HIGH', 'LOW', 'HIGH']][n];
    const components = [...states.map((s, i) => component(`d${i}`, 'digital-input', { state: s })), component('buf', 'gate-or'), component('o', 'digital-output')];
    const wires = [...states.map((_, i) => wire(`w${i}`, `d${i}`, 'out', 'buf', 'a')), wire('b', `d0`, 'out', 'buf', 'b'), wire('wo', 'buf', 'y', 'o', 'in')];
    const e = new DiscreteEventLogicEngine(); e.setCircuit(components, wires);
    const snapshot = e.getSnapshot(); const conflicting = new Set(states).size > 1;
    expect(snapshot.warnings.some(w => w.code === 'logic-driver-conflict'), 'conflict warning').toBe(conflicting);
    Object.values(snapshot.terminalVoltages).forEach(v => expect(Number.isFinite(v)).toBe(true));
    if (conflicting) expect(snapshot.converged, 'a driver conflict must not report a converged solution').toBe(false);
  });
  for (let n = 0; n < 6; n += 1) scenario(P, `DES: ${['half adder', 'full adder', 'comparator', '4-bit adder', 'decoder 3→8', 'mux 4:1'][n]} exhaustive truth table`, () => {
    const spec = [
      { type: 'logic-half-adder', ins: ['a', 'b'], f: (v: number[]) => ({ sum: v[0] ^ v[1], carry: v[0] & v[1] }) },
      { type: 'logic-full-adder', ins: ['a', 'b', 'cin'], f: (v: number[]) => ({ sum: v[0] ^ v[1] ^ v[2], cout: (v[0] & v[1]) | (v[2] & (v[0] ^ v[1])) }) },
      { type: 'logic-comparator', ins: ['a', 'b'], f: (v: number[]) => ({ gt: +(v[0] > v[1]), eq: +(v[0] === v[1]), lt: +(v[0] < v[1]) }) },
      { type: 'logic-nbit-adder', props: { bitWidth: 4 }, ins: [...[0, 1, 2, 3].map(i => `a${i}`), ...[0, 1, 2, 3].map(i => `b${i}`), 'cin'], f: (v: number[]) => { const a = v[0] | v[1] << 1 | v[2] << 2 | v[3] << 3; const b = v[4] | v[5] << 1 | v[6] << 2 | v[7] << 3; const s = a + b + v[8]; return { sum0: s & 1, sum1: (s >> 1) & 1, sum2: (s >> 2) & 1, sum3: (s >> 3) & 1, cout: (s >> 4) & 1 }; } },
      { type: 'logic-decoder', props: { selectorCount: 3 }, ins: ['s0', 's1', 's2', 'en'], f: (v: number[]) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`y${i}`, +(v[3] === 1 && (v[0] | v[1] << 1 | v[2] << 2) === i)])) },
      { type: 'logic-mux', props: { selectorCount: 2 }, ins: ['d0', 'd1', 'd2', 'd3', 's0', 's1'], f: (v: number[]) => ({ y: v[v[4] | v[5] << 1] }) },
    ][n];
    const components = [...spec.ins.map(p => component(p, 'digital-input', { state: 'LOW' })), component('u', spec.type, spec.props ?? {})];
    const wires = spec.ins.map(p => wire(`w${p}`, p, 'out', 'u', p));
    const e = new DiscreteEventLogicEngine(); e.setCircuit(components, wires);
    const limit = Math.min(1 << spec.ins.length, 512);
    for (let k = 0; k < limit; k += 1) {
      const vector = bits(k, spec.ins.length); spec.ins.forEach((p, i) => { if (e.getLogicState(p, 'out') !== vector[i]) e.driveDigitalInput(p, vector[i] as 0 | 1); });
      Object.entries(spec.f(vector)).forEach(([pin, want]) => expect(e.getLogicState('u', pin), `${spec.type}.${pin} @ ${vector.join('')}`).toBe(want));
    }
  });
});

// ═══════════════════════ P5: digital ↔ analog (MNA) bridge ═══════════════════════

const allFinite = (snapshot: SimulationSnapshot) => [snapshot.nodeVoltages, snapshot.terminalVoltages, snapshot.branchCurrents].forEach(map => Object.entries(map).forEach(([key, value]) => expect(Number.isFinite(value), `non-finite ${key}=${value}`).toBe(true)));

describe('P5 digital-to-analog MNA bridge', () => {
  const P: Pillar = 'P5 MNA bridge';
  const R_GRID = [1e2, 1e3, 1e4, 1e6, 1e9, 1e12];

  R_GRID.forEach(up => [1e3, 1e6, 1e12].forEach(down => scenario(P, `TabD documented MNA: pull-up ${up.toExponential(0)} Ω / pull-down ${down.toExponential(0)} Ω to a 5 V rail`, () => {
    const result = new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'VDD', positive: 'vdd', negative: '0', voltage: 5 },
      { kind: 'resistor', id: 'RU', positive: 'vdd', negative: 'n', resistance: up },
      { kind: 'resistor', id: 'RD', positive: 'n', negative: '0', resistance: down },
    ]);
    expect(Number.isFinite(result.nodeVoltages.n)).toBe(true);
    expect(result.nodeVoltages.n / (5 * down / (up + down)) - 1).toBeCloseTo(0, 6);
  })));
  [1e6, 1e9, 1e11, 1e12, 1e13, 1e14].forEach(r => scenario(P, `MNASolver (strict DC): symmetric pull-up/pull-down ${r.toExponential(0)} Ω divider (G = ${(1 / r).toExponential(0)} S)`, () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'VDD', positive: 'vdd', negative: '0', voltage: 5 },
      { type: 'resistor', id: 'RU', positive: 'vdd', negative: 'n', resistance: r },
      { type: 'resistor', id: 'RD', positive: 'n', negative: '0', resistance: r },
    ]).solve();
    expect(result.nodeVoltages.n).toBeCloseTo(2.5, 6);
  }));
  [1e9, 1e12, 1e13].forEach(r => scenario(P, `MNASolver: digital node held only through ${r.toExponential(0)} Ω pull-up to a driven gate output`, () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'VG', positive: 'drv', negative: '0', voltage: 5 },
      { type: 'resistor', id: 'RB', positive: 'drv', negative: 'in', resistance: r },
      { type: 'resistor', id: 'RL', positive: 'in', negative: '0', resistance: r },
    ]).solve();
    expect(result.nodeVoltages.in).toBeCloseTo(2.5, 6);
  }));
  [1e-3, 1e-6, 1e-9].forEach(gc => scenario(P, `MNASolver: weak coupling ${gc.toExponential(0)} S between two driven nets keeps the sub-threshold current (pivot-skip guard)`, () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: 'a', negative: '0', voltage: 5 },
      { type: 'resistor', id: 'RC', positive: 'a', negative: 'b', resistance: 1 / gc },
      { type: 'resistor', id: 'RB', positive: 'b', negative: '0', resistance: 1e-3 },
    ]).solve();
    const expected = 5 * 1e-3 / (1 / gc + 1e-3);
    expect(result.nodeVoltages.b / expected - 1).toBeCloseTo(0, 5);
  }));
  [1e-12, 1e-13].forEach(gc => scenario(P, `MNASolver: coupling conductance ${gc.toExponential(0)} S below the 1e-12 pivot epsilon`, () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: 'a', negative: '0', voltage: 5 },
      { type: 'resistor', id: 'RC', positive: 'a', negative: 'b', resistance: 1 / gc },
      { type: 'resistor', id: 'RB', positive: 'b', negative: '0', resistance: 1 / gc },
    ]).solve();
    expect(result.nodeVoltages.b).toBeCloseTo(2.5, 6);
  }));

  [6e-13, 9e-13].forEach(gc => scenario(P, `MNASolver: floating-ish node on two ${gc.toExponential(0)} S branches (off-diagonals below the Gauss–Jordan factor skip, diagonal above the pivot test)`, () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: 'a', negative: '0', voltage: 5 },
      { type: 'resistor', id: 'RC', positive: 'a', negative: 'b', resistance: 1 / gc },
      { type: 'resistor', id: 'RB', positive: 'b', negative: '0', resistance: 1 / gc },
    ]).solve();
    expect(result.nodeVoltages.b, 'silent wrong answer if the elimination factor was skipped').toBeCloseTo(2.5, 6);
  }));
  [6e-13, 9e-13].forEach(gc => scenario(P, `TabD documented MNA: the same ${gc.toExponential(0)} S divider (1e-18 pivot) as a control`, () => {
    const result = new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'V1', positive: 'a', negative: '0', voltage: 5 },
      { kind: 'resistor', id: 'RC', positive: 'a', negative: 'b', resistance: 1 / gc },
      { kind: 'resistor', id: 'RB', positive: 'b', negative: '0', resistance: 1 / gc },
    ]);
    expect(result.nodeVoltages.b).toBeCloseTo(2.5, 6);
  }));

  const gateRule = (type: string, a: boolean, b: boolean) => GATE_FN[type]([a, b]);
  const bridge = (type: string, a: boolean, b: boolean, extras: { load?: number; pullup?: number; floatingB?: boolean } = {}) => {
    const unary = type === 'gate-not';
    const components = [component('A', 'digital-input', { state: level(a), highVoltage: 5 }), component('B', 'digital-input', { state: level(b), highVoltage: 5 }), component('G', type, { threshold: 2.5, highVoltage: 5, delay: 0 }), component('OUT', 'digital-output'), component('GND', 'ground')];
    const wires = [wire('a0', 'A', 'gnd', 'GND', 'gnd'), wire('b0', 'B', 'gnd', 'GND', 'gnd'), wire('g0', 'G', 'gnd', 'GND', 'gnd'), wire('o0', 'OUT', 'gnd', 'GND', 'gnd'), wire('a1', 'A', 'out', 'G', 'a'), wire('y', 'G', 'y', 'OUT', 'in')];
    if (!unary && !extras.floatingB) wires.push(wire('b1', 'B', 'out', 'G', 'b'));
    if (extras.load) { components.push(component('RL', 'resistor', { resistance: extras.load })); wires.push(wire('l1', 'RL', 'a', 'G', 'y'), wire('l2', 'RL', 'b', 'GND', 'gnd')); }
    if (extras.pullup) { components.push(component('RP', 'resistor', { resistance: extras.pullup }), component('VP', 'dc-voltage', { voltage: 5 })); wires.push(wire('p1', 'RP', 'a', 'VP', 'pos'), wire('p2', 'RP', 'b', 'G', 'y'), wire('p3', 'VP', 'neg', 'GND', 'gnd')); }
    const engine = new DigitalLogicSimulationEngine(); engine.setCircuit(components, wires);
    let snapshot = engine.step(1e-3); snapshot = engine.step(1e-3); snapshot = engine.step(1e-3);
    return snapshot;
  };
  [...TWO_INPUT, 'gate-not'].forEach(type => [[false, false], [false, true], [true, false], [true, true]].filter(([, b], i) => type !== 'gate-not' || i < 2 && !b).forEach(([a, b]) => scenario(P, `${type} macromodel on MNA: A=${+a} B=${+b}`, () => {
    const snapshot = bridge(type, a, b);
    expect(snapshot.warnings, 'no solver warnings').toEqual([]);
    expect(snapshot.converged).toBe(true);
    allFinite(snapshot);
    expect(snapshot.terminalVoltages['G:y']).toBeCloseTo(gateRule(type, a, b) ? 5 : 0, 6);
  })));
  ['gate-and', 'gate-nor', 'gate-xor'].forEach(type => [100, 1e4].forEach(load => scenario(P, `${type} driving ${load} Ω analog load stays at its logic level`, () => {
    const snapshot = bridge(type, true, false, { load }); allFinite(snapshot); expect(snapshot.converged).toBe(true);
    expect(snapshot.terminalVoltages['G:y']).toBeCloseTo(gateRule(type, true, false) ? 5 : 0, 6);
  })));
  [1e3, 1e6, 1e9].forEach(pullup => scenario(P, `NAND output with ${pullup.toExponential(0)} Ω pull-up to 5 V: no singular system, no NaN`, () => {
    const snapshot = bridge('gate-nand', true, true, { pullup }); allFinite(snapshot); expect(snapshot.converged, JSON.stringify(snapshot.warnings)).toBe(true);
    expect(snapshot.terminalVoltages['G:y']).toBeCloseTo(0, 6);
  }));
  ['gate-and', 'gate-or'].forEach(type => scenario(P, `${type} with an unwired (floating) input pin solves without NaN or fabricated levels`, () => {
    const snapshot = bridge(type, true, true, { floatingB: true }); allFinite(snapshot);
    expect(snapshot.converged, JSON.stringify(snapshot.warnings)).toBe(true);
  }));

  const tiedOutputs = (a: boolean, b: boolean) => {
    const components = [component('A', 'digital-input', { state: level(a), highVoltage: 5 }), component('G1', 'gate-and', { delay: 0 }), component('G2', 'gate-and', { delay: 0 }), component('OUT', 'digital-output'), component('GND', 'ground'), component('B', 'digital-input', { state: level(b), highVoltage: 5 })];
    const wires = [wire('a0', 'A', 'gnd', 'GND', 'gnd'), wire('b0', 'B', 'gnd', 'GND', 'gnd'), wire('g1', 'G1', 'gnd', 'GND', 'gnd'), wire('g2', 'G2', 'gnd', 'GND', 'gnd'), wire('o0', 'OUT', 'gnd', 'GND', 'gnd'),
      wire('a1', 'A', 'out', 'G1', 'a'), wire('a2', 'A', 'out', 'G1', 'b'), wire('b1', 'B', 'out', 'G2', 'a'), wire('b2', 'B', 'out', 'G2', 'b'), wire('y1', 'G1', 'y', 'OUT', 'in'), wire('y2', 'G2', 'y', 'OUT', 'in')];
    const engine = new DigitalLogicSimulationEngine(); engine.setCircuit(components, wires); engine.step(1e-3); return engine.step(1e-3);
  };
  [[true, false], [false, true]].forEach(([a, b]) => scenario(P, `two gate outputs tied together at opposing levels (${+a}/${+b}): reported as a conflict, finite state`, () => {
    const snapshot = tiedOutputs(a, b); allFinite(snapshot);
    expect(snapshot.converged).toBe(false); expect(snapshot.warnings[0]).toMatchObject({ code: 'LOGIC_OUTPUT_CONTENTION' });
  }));
  [[true, true], [false, false]].forEach(([a, b]) => scenario(P, `two gate outputs tied together at the SAME level (${+a}/${+b}): structured contention diagnostic`, () => {
    const snapshot = tiedOutputs(a, b); allFinite(snapshot);
    expect(snapshot.converged).toBe(false);
    expect(snapshot.warnings[0]).toMatchObject({ code: 'LOGIC_OUTPUT_CONTENTION' });
    expect(snapshot.warnings[0].message).toContain('Output contention: direct driver tie detected');
  }));

  [0, 1.5, 5, 9, 12].forEach(vin => scenario(P, `Newton-Raphson clamp: ${vin} V through 1 kΩ into a diode-protected logic node`, () => {
    const result = new TabDNewtonMna().solve(
      [{ kind: 'voltage', id: 'V', positive: 'in', negative: '0', voltage: vin }, { kind: 'resistor', id: 'R', positive: 'in', negative: 'n', resistance: 1000 }, { kind: 'resistor', id: 'RL', positive: 'n', negative: '0', resistance: 1e6 }],
      [{ id: 'D', positive: 'n', negative: '0', controls: ['n'], current: v => shockleyCurrent(v.n ?? 0, 1e-12) }], 1e-3, { maxIterations: 200, damping: 0.55 },
    );
    expect(Number.isFinite(result.nodeVoltages.n)).toBe(true);
    expect(result.nodeVoltages.n).toBeLessThan(0.9);
    expect(result.nodeVoltages.n).toBeGreaterThanOrEqual(-1e-9);
  }));
  scenario(P, 'TabD MNA reports (does not fabricate) an unreferenced and a conflicting-source system', () => {
    expect(() => new TabDDocumentedMna().solve([{ kind: 'resistor', id: 'R', positive: 'a', negative: 'b', resistance: 1 }])).toThrow();
    expect(() => new TabDDocumentedMna().solve([{ kind: 'voltage', id: 'V1', positive: 'a', negative: '0', voltage: 5 }, { kind: 'voltage', id: 'V2', positive: 'a', negative: '0', voltage: 0 }])).toThrow();
  });
});
