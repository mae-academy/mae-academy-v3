import { getDef, LED_FORWARD_VOLTAGES } from '../../../../shared/circuit/componentDefs';
import { compileDcTopology } from './compileDc';
import { MNAError, MNASolver, type MNAElement } from './mnaSolver';
import { manualRelayClosed } from '../../../../shared/circuit/componentInteraction';
import {
  terminalKey,
  type CircuitComponent,
  type CircuitWire,
  type InstrumentReading,
  type SamplePoint,
  type SimulationSnapshot,
  type SimulationWarning,
} from '../../../../shared/circuit/circuitTypes';
import { getBrokenWireIds, isComponentOpen } from '../../../../shared/circuit/brokenBranches';

/**
 * The solver uses modified nodal analysis with Norton-equivalent voltage sources.
 * Every wire joins two terminal keys into one ideal node; wire geometry has no
 * electrical resistance.  This keeps the electrical model independent of the
 * drawing route while preserving exact terminal connectivity.
 */

type Props = Record<string, unknown>;
type NodeIndex = number;

const OPEN_RESISTANCE = 1e12;
const CLOSED_RESISTANCE = 1e-3;
const GMIN = 1e-10;
const HISTORY_LIMIT = 1800;

/**
 * Returns |V_A-V_B| for a 1 A test source after independent sources have been
 * deactivated. Values remain in base ohms: no display-prefix scaling occurs.
 */
export function measureResistanceWithTestSource(elements: MNAElement[], positive: string, negative: string): number {
  if (positive === negative) return 0;
  const deactivated = elements.map((element): MNAElement => {
    if (element.type === 'voltage') return { ...element, voltage: 0 };
    if (element.type === 'current') return { ...element, current: 0 };
    return element;
  });
  try {
    const testId = '__dmm_ohm_test_current__';
    const result = new MNASolver([...deactivated, { type: 'current', id: testId, from: positive, to: negative, current: 1 }]).solve();
    return Math.abs((result.nodeVoltages[positive] ?? 0) - (result.nodeVoltages[negative] ?? 0));
  } catch (error) {
    if (error instanceof MNAError) return Infinity;
    return Infinity;
  }
}

interface Network {
  terminalRoots: Map<string, string>;
  nodeByRoot: Map<string, NodeIndex>;
  roots: string[];
  referenceRoot: string | null;
  wiredTerminals: Set<string>;
}

interface SolveResult {
  voltages: number[];
  terminalVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  terminalCurrents: Record<string, number>;
  powered: Record<string, boolean>;
  intensity: Record<string, number>;
  converged: boolean;
  warnings: SimulationWarning[];
}

class UnionFind {
  private parents = new Map<string, string>();

  add(value: string) {
    if (!this.parents.has(value)) this.parents.set(value, value);
  }

  find(value: string): string {
    this.add(value);
    const parent = this.parents.get(value)!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parents.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents.set(rightRoot, leftRoot);
  }
}

class LinearSystem {
  readonly matrix: number[][];
  readonly rhs: number[];

  constructor(readonly size: number) {
    this.matrix = Array.from({ length: size }, () => Array(size).fill(0));
    this.rhs = Array(size).fill(0);
    for (let index = 0; index < size; index += 1) this.matrix[index][index] = GMIN;
  }

  conductance(a: NodeIndex, b: NodeIndex, conductance: number) {
    if (!Number.isFinite(conductance) || conductance <= 0) return;
    if (a >= 0) this.matrix[a][a] += conductance;
    if (b >= 0) this.matrix[b][b] += conductance;
    if (a >= 0 && b >= 0) {
      this.matrix[a][b] -= conductance;
      this.matrix[b][a] -= conductance;
    }
  }

  /** Positive current flows from a to b. */
  current(a: NodeIndex, b: NodeIndex, current: number) {
    if (!Number.isFinite(current)) return;
    if (a >= 0) this.rhs[a] -= current;
    if (b >= 0) this.rhs[b] += current;
  }
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function propNumber(props: Props, key: string, fallback: number): number {
  return finite(props[key], fallback);
}

function propString(props: Props, key: string, fallback = ''): string {
  return typeof props[key] === 'string' ? props[key] : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rms(values: number[], removeMean = false): number {
  if (!values.length) return 0;
  const mean = removeMean ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}

function estimateFrequency(samples: SamplePoint[]): number {
  if (samples.length < 8) return 0;
  const values = samples.map(sample => sample.value);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const crossings: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    if (values[index - 1] <= mean && values[index] > mean) {
      const denominator = values[index] - values[index - 1];
      const fraction = denominator === 0 ? 0 : (mean - values[index - 1]) / denominator;
      crossings.push(samples[index - 1].time + fraction * (samples[index].time - samples[index - 1].time));
    }
  }
  if (crossings.length < 2) return 0;
  const periods = crossings.slice(1).map((time, index) => time - crossings[index]).filter(period => period > 0);
  if (!periods.length) return 0;
  return 1 / (periods.reduce((sum, period) => sum + period, 0) / periods.length);
}

function waveform(kind: string, amplitude: number, frequency: number, phaseDegrees: number, offset: number, time: number): number {
  const phase = (phaseDegrees * Math.PI) / 180;
  const angle = 2 * Math.PI * Math.max(0, frequency) * time + phase;
  switch (kind) {
    case 'square': return offset + amplitude * (Math.sin(angle) >= 0 ? 1 : -1);
    case 'triangle': return offset + amplitude * (2 / Math.PI) * Math.asin(Math.sin(angle));
    case 'sawtooth': {
      const normalized = angle / (2 * Math.PI);
      return offset + amplitude * 2 * (normalized - Math.floor(normalized + 0.5));
    }
    default: return offset + amplitude * Math.sin(angle);
  }
}

function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const size = rhs.length;
  if (!size) return [];
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) maxRow = row;
    }
    if (Math.abs(augmented[maxRow][pivot]) < 1e-18) return null;
    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      if (Math.abs(factor) < 1e-18) continue;
      for (let column = pivot; column <= size; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  return augmented.map(row => row[size]);
}

function sameControlState(left: Map<string, boolean>, right: Map<string, boolean>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of Array.from(left.entries())) if (right.get(key) !== value) return false;
  return true;
}

export class SimulationEngine {
  private components: CircuitComponent[] = [];
  private wires: CircuitWire[] = [];
  private time = 0;
  private network: Network = { terminalRoots: new Map(), nodeByRoot: new Map(), roots: [], referenceRoot: null, wiredTerminals: new Set() };
  private capacitorVoltage = new Map<string, number>();
  private inductorCurrent = new Map<string, number>();
  private relayStates = new Map<string, boolean>();
  private scrLatched = new Set<string>();
  private fuseBlown = new Set<string>();
  private terminalHistory = new Map<string, SamplePoint[]>();
  private nodeHistory = new Map<string, SamplePoint[]>();
  private branchHistory = new Map<string, SamplePoint[]>();
  protected wirePhases = new Map<string, number>();
  protected visualAcTime = 0;
  protected wirePeakCurrents = new Map<string, number>();
  protected wirePolarities = new Map<string, number>();
  private lastSnapshot: SimulationSnapshot = this.emptySnapshot();

  reset() {
    this.time = 0;
    this.capacitorVoltage.clear();
    this.inductorCurrent.clear();
    this.relayStates.clear();
    this.scrLatched.clear();
    this.fuseBlown.clear();
    this.terminalHistory.clear();
    this.nodeHistory.clear();
    this.branchHistory.clear();
    this.wirePhases.clear();
    this.visualAcTime = 0;
    this.wirePeakCurrents.clear();
    this.wirePolarities.clear();
    this.lastSnapshot = this.emptySnapshot();
  }

  setCircuit(components: CircuitComponent[], wires: CircuitWire[]) {
    this.components = components.map(component => ({ ...component, props: { ...component.props }, state: component.state ? { ...component.state } : undefined }));
    this.wires = wires.map(wire => ({ ...wire, path: wire.path.map(point => [...point] as [number, number]) }));
    this.network = this.buildNetwork();
    this.wirePhases.clear();
    this.visualAcTime = 0;
    this.wirePeakCurrents.clear();
    this.wirePolarities.clear();
  }

  getSnapshot(): SimulationSnapshot {
    return this.lastSnapshot;
  }

  getTime() { return this.time; }

  /** Advance physical time by a number of seconds. Long browser frames are subdivided for waveform and RMS accuracy. */
  step(elapsedSeconds = 1 / 1000): SimulationSnapshot {
    const elapsed = clamp(finite(elapsedSeconds, 1 / 1000), 1e-6, 0.2);
    const highestFrequency = this.components.reduce((highest, component) => {
      if (['ac-voltage', 'ac-current', 'three-phase-source', 'three-phase-rail'].includes(component.type)) {
        return Math.max(highest, propNumber(component.props, 'frequency', 0));
      }
      return highest;
    }, 0);
    const stableStep = highestFrequency > 0 ? Math.min(0.001, 1 / (highestFrequency * 48)) : 0.001;
    const steps = Math.max(1, Math.min(160, Math.ceil(elapsed / stableStep)));
    const dt = elapsed / steps;
    for (let index = 0; index < steps; index += 1) this.singleStep(dt);
    return this.lastSnapshot;
  }

  private emptySnapshot(): SimulationSnapshot {
    return {
      time: 0,
      nodeVoltages: {},
      terminalVoltages: {},
      branchCurrents: {},
      wireCurrents: {},
      wirePhases: {},
      componentPowered: {},
      componentIntensity: {},
      nodeHistory: {},
      branchHistory: {},
      instrumentReadings: {},
      warnings: [],
      converged: true,
    };
  }

  private buildNetwork(): Network {
    const union = new UnionFind();
    const existing = new Set<string>();
    const wiredTerminals = new Set<string>();
    for (const component of this.components) {
      const definition = getDef(component.type);
      if (!definition) continue;
      for (const terminal of definition.terminals) {
        const key = terminalKey(component.id, terminal.id);
        union.add(key);
        existing.add(key);
      }
    }
    for (const wire of this.wires) {
      const from = terminalKey(wire.fromComp, wire.fromTerm);
      const to = terminalKey(wire.toComp, wire.toTerm);
      if (existing.has(from) && existing.has(to)) {
        union.union(from, to);
        wiredTerminals.add(from);
        wiredTerminals.add(to);
      }
    }
    const groundComponents = this.components.filter(c => c.type === 'ground');
    if (groundComponents.length > 1) {
      const gnd0 = terminalKey(groundComponents[0].id, 'gnd');
      for (let i = 1; i < groundComponents.length; i++) {
        const gndi = terminalKey(groundComponents[i].id, 'gnd');
        if (existing.has(gnd0) && existing.has(gndi)) {
          union.union(gnd0, gndi);
        }
      }
    }
    const terminalRoots = new Map<string, string>();
    for (const key of Array.from(existing)) terminalRoots.set(key, union.find(key));
    const roots = Array.from(new Set(Array.from(terminalRoots.values())));
    let referenceRoot: string | null = null;
    for (const component of this.components) {
      if (component.type !== 'ground') continue;
      const root = terminalRoots.get(terminalKey(component.id, 'gnd'));
      if (root) {
        referenceRoot = root;
        break;
      }
    }
    if (!referenceRoot && roots.length) referenceRoot = roots[0];
    const nodeByRoot = new Map<string, number>();
    let index = 0;
    for (const root of roots) if (root !== referenceRoot) nodeByRoot.set(root, index++);
    return { terminalRoots, nodeByRoot, roots, referenceRoot, wiredTerminals };
  }

  private node(component: CircuitComponent, terminal: string): NodeIndex {
    const root = this.network.terminalRoots.get(terminalKey(component.id, terminal));
    if (!root || root === this.network.referenceRoot) return -1;
    return this.network.nodeByRoot.get(root) ?? -1;
  }

  private voltage(solution: number[], node: NodeIndex): number {
    return node >= 0 ? solution[node] ?? 0 : 0;
  }

  private terminalVoltage(component: CircuitComponent, terminal: string, solution: number[]): number {
    return this.voltage(solution, this.node(component, terminal));
  }

  private stampResistor(system: LinearSystem, a: NodeIndex, b: NodeIndex, resistance: number) {
    system.conductance(a, b, 1 / Math.max(1e-9, Math.abs(resistance)));
  }

  /** A Thevenin source V with resistance R, represented as a Norton source. */
  private stampVoltageSource(system: LinearSystem, positive: NodeIndex, negative: NodeIndex, voltage: number, resistance: number) {
    const r = Math.max(1e-5, Math.abs(resistance));
    const conductance = 1 / r;
    system.conductance(positive, negative, conductance);
    system.current(negative, positive, voltage * conductance);
  }

  private addTerminalCurrent(target: Record<string, number>, component: CircuitComponent, terminal: string, currentIntoComponent: number) {
    const key = terminalKey(component.id, terminal);
    target[key] = (target[key] ?? 0) + currentIntoComponent;
  }

  private stampTwoTerminal(
    system: LinearSystem,
    component: CircuitComponent,
    aTerminal: string,
    bTerminal: string,
    resistance: number,
    terminalCurrents: Record<string, number>,
    solutionGuess: number[],
  ): number {
    const a = this.node(component, aTerminal);
    const b = this.node(component, bTerminal);
    this.stampResistor(system, a, b, resistance);
    const current = (this.voltage(solutionGuess, a) - this.voltage(solutionGuess, b)) / Math.max(1e-9, Math.abs(resistance));
    this.addTerminalCurrent(terminalCurrents, component, aTerminal, current);
    this.addTerminalCurrent(terminalCurrents, component, bTerminal, -current);
    return current;
  }

  private contactClosed(component: CircuitComponent, controls: Map<string, boolean>): boolean {
    const state = propString(component.props, 'state');
    switch (component.type) {
      case 'sw-spst-no': return state === 'closed';
      case 'sw-spst-nc': return state !== 'open';
      case 'pb-no': return state === 'pressed';
      case 'pb-nc': return state !== 'pressed';
      case 'circuit-breaker':
      case 'circuit-breaker-3phase': return state === 'closed';
      case 'aux-contact-no':
      case 'aux-contact-nc':
      case 'aux-contact-3phase': {
        const linked = propString(component.props, 'linkedTo') || propString(component.props, 'controlSourceId');
        const controller = this.components.find(item => item.label === linked || item.id === linked);
        const energized = Boolean(controller && controls.get(controller.id));
        const isNC = String(component.props?.contactType ?? (component.type === 'aux-contact-nc' ? 'NC' : 'NO')).toUpperCase() === 'NC';
        return isNC ? !energized : energized;
      }
      default: return false;
    }
  }

  private calculateControls(solution: number[]): Map<string, boolean> {
    const next = new Map<string, boolean>();
    for (const component of this.components) {
      if (!['relay-spst', 'relay-spdt', 'relay-dpst', 'contactor', 'coil'].includes(component.type)) continue;
      const manualState = propString(component.props, 'manualState');
      if (manualState === 'open' || manualState === 'closed') {
        next.set(component.id, manualState === 'closed');
        continue;
      }
      const isCoil = component.type === 'coil';
      const posTerm = isCoil ? 'pos' : 'coil+';
      const negTerm = isCoil ? 'neg' : 'coil-';
      const coilVoltage = Math.abs(this.terminalVoltage(component, posTerm, solution) - this.terminalVoltage(component, negTerm, solution));
      const rated = isCoil
        ? Math.max(0.1, propNumber(component.props, 'activationThreshold', propNumber(component.props, 'coilVoltage', 5)))
        : Math.max(0.1, propNumber(component.props, 'coilVoltage', component.type === 'contactor' ? 24 : 12));
      const previous = this.relayStates.get(component.id) ?? false;
      const pullIn = isCoil ? rated : rated * 0.75;
      const dropOut = isCoil ? rated * 0.6 : rated * 0.45;
      next.set(component.id, previous ? coilVoltage >= dropOut : coilVoltage >= pullIn);
    }
    return next;
  }

  private singleStep(dt: number) {
    this.time += dt;
    const staticWarnings: SimulationWarning[] = [];
    if (this.components.length && !this.components.some(component => component.type === 'ground')) {
      staticWarnings.push({ code: 'NO_GROUND', message: 'No ground reference is present; the solver uses one terminal as a temporary 0 V reference.' });
    }

    let controls = new Map(this.relayStates);
    let result: SolveResult | null = null;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      result = this.solveWithControls(dt, controls, staticWarnings);
      const nextControls = this.calculateControls(result.voltages);
      if (sameControlState(controls, nextControls)) break;
      controls = nextControls;
    }
    if (!result) result = this.blankResult(staticWarnings);
    for (const component of this.components) {
      if (component.state?.isBurned) {
        result.branchCurrents[component.id] = 0;
        result.powered[component.id] = false;
        result.intensity[component.id] = 0;
      }
    }
    this.relayStates = controls;

    this.updateDynamicStates(result, dt);
    this.recordHistories(result);
    const instrumentReadings = this.computeInstrumentReadings(result);
    const wireCurrents = this.computeWireCurrents(result.terminalCurrents);
    const brokenWireIds = getBrokenWireIds(this.components, this.wires);
    brokenWireIds.forEach(wireId => {
      wireCurrents[wireId] = 0;
    });
    const nodeVoltages = this.nodeVoltageMap(result.voltages);

    let maxAbsWireCurrent = 0;
    for (const wire of this.wires) {
      const absI = Math.abs(wireCurrents[wire.id] ?? 0);
      if (absI > maxAbsWireCurrent) maxAbsWireCurrent = absI;
    }

    const acSource = this.components.find((c) => ['ac-voltage', 'ac-current', 'three-phase-source', 'three-phase-rail'].includes(c.type));
    const isAcCircuit = Boolean(acSource);

    if (isAcCircuit && acSource) {
      const waveformKind = String(acSource.props?.waveform ?? 'sine').toLowerCase();
      const sourceFreq = Math.max(0.001, propNumber(acSource.props, 'frequency', 60));
      const phaseDeg = propNumber(acSource.props, 'phase', 0);
      const sourcePhaseRad = (phaseDeg * Math.PI) / 180;
      const fVis = Math.min(Math.max(0.2, sourceFreq), 1.0);

      this.visualAcTime += dt;
      const visualAngle = 2 * Math.PI * fVis * this.visualAcTime + sourcePhaseRad;
      const cycle = ((visualAngle / (2 * Math.PI)) % 1 + 1) % 1;

      // Visual oscillation amplitude along the wire (0.45 cycles ~ 32.4px peak-to-peak stroke length)
      const A = 0.45;
      let vNorm = 0;
      if (waveformKind === 'triangle') {
        // Triangle Wave: constant speed in one direction, instantaneous velocity reversal at peaks, constant speed back
        const vTri = 4 * A * fVis;
        vNorm = cycle < 0.5 ? vTri : -vTri;
      } else if (waveformKind === 'square') {
        // Square Wave: constant velocity, hold, then switch direction sharply with a short pulse transition
        const alpha = 0.25;
        const vSq = (4 * A * fVis) / alpha;
        if (cycle < 0.5) {
          vNorm = cycle < 0.5 * alpha ? vSq : 0;
        } else {
          vNorm = (cycle - 0.5) < 0.5 * alpha ? -vSq : 0;
        }
      } else if (waveformKind === 'sawtooth') {
        const vFwd = (2 * A * fVis) / 0.8;
        const vRev = -(2 * A * fVis) / 0.2;
        vNorm = cycle < 0.8 ? vFwd : vRev;
      } else {
        // Sine Wave: smooth sinusoidal acceleration/deceleration v(t) = v_max * sin(wt + phi)
        // Decelerates smoothly, momentarily freezes at zero-crossings, smoothly accelerates in reverse
        const vMax = 2 * Math.PI * fVis * A;
        vNorm = vMax * Math.sin(visualAngle);
      }

      let maxWirePeak = 0;
      for (const wire of this.wires) {
        const currentAbs = Math.abs(wireCurrents[wire.id] ?? 0);
        const prevPeak = this.wirePeakCurrents.get(wire.id) ?? 0;
        const newPeak = Math.max(currentAbs, prevPeak * Math.exp(-dt / 0.5));
        this.wirePeakCurrents.set(wire.id, newPeak);
        if (newPeak > maxWirePeak) maxWirePeak = newPeak;

        const sourceAngle = 2 * Math.PI * sourceFreq * this.time + sourcePhaseRad;
        const isSourcePos = Math.sin(sourceAngle) >= 0;
        const topologicalSign = isSourcePos ? Math.sign(wireCurrents[wire.id] ?? 0) : -Math.sign(wireCurrents[wire.id] ?? 0);
        if (!this.wirePolarities.has(wire.id) && currentAbs > 1e-6) {
          this.wirePolarities.set(wire.id, topologicalSign || 1);
        }
      }

      for (const wire of this.wires) {
        const wireI = wireCurrents[wire.id] ?? 0;
        const currentPhase = this.wirePhases.get(wire.id) ?? 0;
        const peakI = this.wirePeakCurrents.get(wire.id) ?? 0;
        const wirePolarity = this.wirePolarities.get(wire.id) ?? (wireI >= 0 ? 1 : -1);

        if (brokenWireIds.has(wire.id) || peakI < 1e-7 || maxWirePeak < 1e-7) {
          this.wirePhases.delete(wire.id);
        } else {
          const relativeRatio = Math.min(1, Math.max(0, peakI / maxWirePeak));
          const speedScale = Math.pow(relativeRatio, 0.4);
          const phaseRate = wirePolarity * speedScale * vNorm;
          this.wirePhases.set(wire.id, currentPhase + phaseRate * dt);
        }
      }
    } else {
      const V_BASE = 2.5;
      const V_TOP = 8.0;
      for (const wire of this.wires) {
        const wireI = wireCurrents[wire.id] ?? 0;
        const currentPhase = this.wirePhases.get(wire.id) ?? 0;
        if (brokenWireIds.has(wire.id) || Math.abs(wireI) < 1e-7 || maxAbsWireCurrent < 1e-7) {
          this.wirePhases.delete(wire.id);
        } else {
          const relativeRatio = Math.min(1, Math.max(0, Math.abs(wireI) / maxAbsWireCurrent));
          const speed = V_BASE + (V_TOP - V_BASE) * Math.pow(relativeRatio, 0.35);
          const phaseRate = Math.sign(wireI) * speed;
          this.wirePhases.set(wire.id, currentPhase + phaseRate * dt);
        }
      }
    }

    this.lastSnapshot = {
      time: this.time,
      nodeVoltages,
      terminalVoltages: result.terminalVoltages,
      branchCurrents: result.branchCurrents,
      wireCurrents,
      wirePhases: Object.fromEntries(this.wirePhases),
      componentPowered: result.powered,
      componentIntensity: result.intensity,
      nodeHistory: this.historyObject(this.nodeHistory),
      branchHistory: this.historyObject(this.branchHistory),
      instrumentReadings,
      warnings: result.warnings,
      converged: result.converged,
    };
  }

  private blankResult(warnings: SimulationWarning[]): SolveResult {
    return { voltages: [], terminalVoltages: {}, branchCurrents: {}, terminalCurrents: {}, powered: {}, intensity: {}, converged: false, warnings };
  }

  private solveWithControls(dt: number, controls: Map<string, boolean>, baseWarnings: SimulationWarning[]): SolveResult {
    const nodeCount = this.network.nodeByRoot.size;
    let guess = Array(nodeCount).fill(0);
    for (const [root, node] of Array.from(this.network.nodeByRoot.entries())) {
      const history = this.nodeHistory.get(root);
      if (history?.length) guess[node] = history[history.length - 1].value;
    }
    let currentResult: SolveResult | null = null;
    let converged = false;
    for (let nonlinearIteration = 0; nonlinearIteration < 35; nonlinearIteration += 1) {
      currentResult = this.stampAndSolve(dt, controls, guess, baseWarnings);
      if (!currentResult.converged) return currentResult;
      const difference = currentResult.voltages.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - (guess[index] ?? 0))), 0);
      guess = currentResult.voltages.map((value, index) => 0.55 * value + 0.45 * (guess[index] ?? 0));
      if (difference < 1e-4) {
        converged = true;
        break;
      }
    }
    if (!currentResult) return this.blankResult(baseWarnings);
    const finalized = this.stampAndSolve(dt, controls, currentResult.voltages, baseWarnings);
    finalized.converged = finalized.converged && converged;
    if (!converged) finalized.warnings.push({ code: 'NONLINEAR_ITERATION', message: 'A nonlinear device did not settle fully during this time step.' });
    return finalized;
  }

  private stampAndSolve(dt: number, controls: Map<string, boolean>, guess: number[], baseWarnings: SimulationWarning[]): SolveResult {
    const system = new LinearSystem(this.network.nodeByRoot.size);
    const terminalCurrents: Record<string, number> = {};
    const branchCurrents: Record<string, number> = {};
    const powered: Record<string, boolean> = {};
    const intensity: Record<string, number> = {};
    const warnings = [...baseWarnings];

    const stampCurrent = (component: CircuitComponent, aTerminal: string, bTerminal: string, current: number) => {
      const a = this.node(component, aTerminal);
      const b = this.node(component, bTerminal);
      system.current(a, b, current);
      this.addTerminalCurrent(terminalCurrents, component, aTerminal, current);
      this.addTerminalCurrent(terminalCurrents, component, bTerminal, -current);
    };
    const stampResistance = (component: CircuitComponent, aTerminal: string, bTerminal: string, resistance: number) => {
      const current = this.stampTwoTerminal(system, component, aTerminal, bTerminal, resistance, terminalCurrents, guess);
      return current;
    };
    const stampSource = (component: CircuitComponent, positive: string, negative: string | null, voltage: number, resistance: number) => {
      const p = this.node(component, positive);
      const n = negative ? this.node(component, negative) : -1;
      this.stampVoltageSource(system, p, n, voltage, resistance);
      const sourceCurrent = (this.voltage(guess, p) - this.voltage(guess, n) - voltage) / Math.max(1e-5, Math.abs(resistance));
      this.addTerminalCurrent(terminalCurrents, component, positive, sourceCurrent);
      if (negative) this.addTerminalCurrent(terminalCurrents, component, negative, -sourceCurrent);
      return sourceCurrent;
    };

    for (const component of this.components) {
      if (component.state?.isBurned) {
        branchCurrents[component.id] = 0;
        powered[component.id] = false;
        intensity[component.id] = 0;
        continue;
      }
      const props = component.props;
      const type = component.type;
      let current = 0;
      let isPowered = false;
      let componentIntensity = 0;
      switch (type) {
        case 'ground':
          break;
        case 'dc-voltage': {
          current = stampSource(component, 'pos', 'neg', propNumber(props, 'voltage', 12), propNumber(props, 'internalR', 0.01));
          isPowered = true;
          break;
        }
        case 'dc-rail': {
          current = stampSource(component, 'pos', null, propNumber(props, 'voltage', 24), propNumber(props, 'internalR', 0.05));
          isPowered = true;
          break;
        }
        case 'ac-voltage': {
          const voltage = waveform(propString(props, 'waveform', 'sine'), propNumber(props, 'amplitude', 10), propNumber(props, 'frequency', 60), propNumber(props, 'phase', 0), propNumber(props, 'offset', 0), this.time);
          current = stampSource(component, 'pos', 'neg', voltage, Math.max(0.01, propNumber(props, 'internalR', 0.01)));
          isPowered = true;
          break;
        }
        case 'dc-current': {
          current = propNumber(props, 'current', 1);
          stampCurrent(component, 'neg', 'pos', current);
          isPowered = Math.abs(current) > 1e-12;
          break;
        }
        case 'ac-current': {
          current = waveform(propString(props, 'waveform', 'sine'), propNumber(props, 'amplitude', 1), propNumber(props, 'frequency', 60), propNumber(props, 'phase', 0), propNumber(props, 'offset', 0), this.time);
          stampCurrent(component, 'neg', 'pos', current);
          isPowered = Math.abs(current) > 1e-12;
          break;
        }
        case 'three-phase-source':
        case 'three-phase-rail': {
          const lineVoltage = propNumber(props, 'lineVoltage', 400);
          const phaseVoltagePeak = lineVoltage * Math.SQRT2 / Math.sqrt(3);
          const frequency = propNumber(props, 'frequency', 50);
          const reverse = propString(props, 'phaseSequence', 'ABC') === 'ACB';
          const phaseAngles = reverse ? [0, 120, -120] : [0, -120, 120];
          const internalR = Math.max(0.01, propNumber(props, 'internalR', 0.05));
          const nWired = this.network.wiredTerminals.has(terminalKey(component.id, 'n'));
          const nTerm = nWired ? 'n' : null;
          const currents = ['l1', 'l2', 'l3'].map((terminal, index) => stampSource(component, terminal, nTerm, waveform('sine', phaseVoltagePeak, frequency, phaseAngles[index], 0, this.time), internalR));
          current = currents[0] ?? 0;
          isPowered = true;
          break;
        }
        case 'resistor':
          current = stampResistance(component, 'a', 'b', propNumber(props, 'resistance', 1000));
          isPowered = Math.abs(current) > 1e-10;
          break;
        case 'potentiometer': {
          const rawWiper = propNumber(props, 'wiper', 0.5);
          const positionRaw = clamp(rawWiper > 1 ? rawWiper / 100 : rawWiper, 0, 1);
          const position = propString(props, 'taper', 'linear') === 'logarithmic'
            ? (Math.pow(10, positionRaw) - 1) / 9
            : positionRaw;
          const total = Math.max(1e-3, propNumber(props, 'resistance', 10000));
          const currentA = stampResistance(component, 'a', 'wiper', Math.max(1e-3, total * position));
          const currentB = stampResistance(component, 'wiper', 'b', Math.max(1e-3, total * (1 - position)));
          current = Math.max(Math.abs(currentA), Math.abs(currentB));
          isPowered = current > 1e-10;
          break;
        }
        case 'capacitor': {
          const capacitance = Math.max(1e-15, propNumber(props, 'capacitance', 1e-6));
          const conductance = capacitance / Math.max(1e-8, dt);
          const previousVoltage = this.capacitorVoltage.get(component.id) ?? 0;
          const a = this.node(component, 'a');
          const b = this.node(component, 'b');
          system.conductance(a, b, conductance);
          system.current(a, b, -conductance * previousVoltage);
          current = conductance * ((this.voltage(guess, a) - this.voltage(guess, b)) - previousVoltage);
          this.addTerminalCurrent(terminalCurrents, component, 'a', current);
          this.addTerminalCurrent(terminalCurrents, component, 'b', -current);
          isPowered = Math.abs(current) > 1e-10;
          break;
        }
        case 'inductor': {
          const inductance = Math.max(1e-12, propNumber(props, 'inductance', 1e-3));
          const dcr = Math.max(0, propNumber(props, 'dcr', 0.1));
          const previousCurrent = this.inductorCurrent.get(component.id) ?? 0;
          const denominator = inductance + dt * dcr;
          const conductance = dt / denominator;
          const historyCurrent = inductance / denominator * previousCurrent;
          const a = this.node(component, 'a');
          const b = this.node(component, 'b');
          system.conductance(a, b, conductance);
          system.current(a, b, historyCurrent);
          current = conductance * (this.voltage(guess, a) - this.voltage(guess, b)) + historyCurrent;
          this.addTerminalCurrent(terminalCurrents, component, 'a', current);
          this.addTerminalCurrent(terminalCurrents, component, 'b', -current);
          isPowered = Math.abs(current) > 1e-10;
          break;
        }
        case 'diode':
        case 'diode-ideal':
        case 'diode-silicon':
        case 'diode-germanium':
        case 'diode-gaas':
        case 'led': {
          const anode = this.node(component, 'anode');
          const cathode = this.node(component, 'cathode');
          const voltage = this.voltage(guess, anode) - this.voltage(guess, cathode);
          const threshold = type === 'led'
            ? propNumber(props, 'forwardVoltage', LED_FORWARD_VOLTAGES[propString(props, 'color', 'red')] ?? 2)
            : propNumber(props, 'forwardVoltage', type === 'diode-germanium' ? 0.3 : type === 'diode-gaas' ? 1.2 : type === 'diode-ideal' ? 0 : 0.7);
          const on = voltage >= threshold - 1e-4;
          const resistance = on ? (type === 'led' ? 8 : 1) : OPEN_RESISTANCE;
          system.conductance(anode, cathode, 1 / resistance);
          if (on) system.current(anode, cathode, -threshold / resistance);
          current = on ? (voltage - threshold) / resistance : voltage / OPEN_RESISTANCE;
          this.addTerminalCurrent(terminalCurrents, component, 'anode', current);
          this.addTerminalCurrent(terminalCurrents, component, 'cathode', -current);
          isPowered = on && current > 1e-8;
          if (type === 'led') componentIntensity = clamp(current / Math.max(1e-9, propNumber(props, 'maxCurrent', 0.02)), 0, 1);
          break;
        }
        case 'zener': {
          const anode = this.node(component, 'anode');
          const cathode = this.node(component, 'cathode');
          const voltage = this.voltage(guess, anode) - this.voltage(guess, cathode);
          const vz = propNumber(props, 'breakdownVoltage', 5.1);
          if (voltage > 0.7) {
            system.conductance(anode, cathode, 1);
            system.current(anode, cathode, -0.7);
            current = voltage - 0.7;
          } else if (voltage < -vz) {
            system.conductance(anode, cathode, 1);
            system.current(anode, cathode, vz);
            current = voltage + vz;
          } else {
            system.conductance(anode, cathode, 1 / OPEN_RESISTANCE);
            current = voltage / OPEN_RESISTANCE;
          }
          this.addTerminalCurrent(terminalCurrents, component, 'anode', current);
          this.addTerminalCurrent(terminalCurrents, component, 'cathode', -current);
          isPowered = Math.abs(current) > 1e-8;
          break;
        }
        case 'photodiode': {
          const darkCurrent = propNumber(props, 'darkCurrent', 1e-9);
          current = -darkCurrent;
          stampCurrent(component, 'anode', 'cathode', current);
          isPowered = darkCurrent > 1e-12;
          break;
        }
        case 'sw-spst-no':
        case 'sw-spst-nc':
        case 'pb-no':
        case 'pb-nc':
        case 'circuit-breaker':
        case 'aux-contact-no':
        case 'aux-contact-nc': {
          const closed = this.contactClosed(component, controls);
          current = stampResistance(component, 'a', 'b', closed ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
          isPowered = closed;
          break;
        }
        case 'circuit-breaker-3phase':
        case 'aux-contact-3phase': {
          const closed = this.contactClosed(component, controls);
          const rOn = 1e-4;
          const rOff = OPEN_RESISTANCE;
          const resistance = closed ? rOn : rOff;
          const l1 = stampResistance(component, 'l1', 't1', resistance);
          const l2 = stampResistance(component, 'l2', 't2', resistance);
          const l3 = stampResistance(component, 'l3', 't3', resistance);
          current = Math.max(Math.abs(l1), Math.abs(l2), Math.abs(l3));
          isPowered = closed;
          break;
        }
        case 'sw-spdt': {
          const state = propString(props, 'state', 'a');
          const contact = state === 'b' ? 'b' : 'a';
          current = stampResistance(component, 'common', contact, state === 'open' ? OPEN_RESISTANCE : CLOSED_RESISTANCE);
          if (contact === 'a') stampResistance(component, 'common', 'b', OPEN_RESISTANCE);
          else stampResistance(component, 'common', 'a', OPEN_RESISTANCE);
          isPowered = state !== 'open';
          break;
        }
        case 'sw-dpst': {
          const closed = propString(props, 'state', 'open') === 'closed';
          const first = stampResistance(component, 'a1', 'b1', closed ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
          const second = stampResistance(component, 'a2', 'b2', closed ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
          current = Math.max(Math.abs(first), Math.abs(second));
          isPowered = closed;
          break;
        }
        case 'sw-dpdt': {
          const state = propString(props, 'state', 'a');
          const first = stampResistance(component, 'c1', state === 'b' ? 'b1' : 'a1', CLOSED_RESISTANCE);
          const second = stampResistance(component, 'c2', state === 'b' ? 'b2' : 'a2', CLOSED_RESISTANCE);
          stampResistance(component, 'c1', state === 'b' ? 'a1' : 'b1', OPEN_RESISTANCE);
          stampResistance(component, 'c2', state === 'b' ? 'a2' : 'b2', OPEN_RESISTANCE);
          current = Math.max(Math.abs(first), Math.abs(second));
          isPowered = true;
          break;
        }
        case 'relay-spst':
        case 'relay-spdt':
        case 'relay-dpst':
        case 'contactor': {
          const coilResistance = type === 'contactor' ? Math.max(100, propNumber(props, 'coilVoltage', 24) ** 2 / 8) : Math.max(10, propNumber(props, 'coilR', 400));
          const coilCurrent = stampResistance(component, 'coil+', 'coil-', coilResistance);
          const energized = manualRelayClosed(component.props, Boolean(controls.get(component.id)));
          if (type === 'relay-spst') {
            const normallyClosed = propString(props, 'contactType', 'NO') === 'NC';
            current = stampResistance(component, 'com', 'no', energized === !normallyClosed ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
          } else if (type === 'relay-spdt') {
            current = stampResistance(component, 'com', 'no', energized ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
            stampResistance(component, 'com', 'nc', energized ? OPEN_RESISTANCE : CLOSED_RESISTANCE);
          } else if (type === 'relay-dpst') {
            const normallyClosed = propString(props, 'contactType', 'NO') === 'NC';
            const closed = energized === !normallyClosed;
            const one = stampResistance(component, 'c1', 'no1', closed ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
            const two = stampResistance(component, 'c2', 'no2', closed ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
            current = Math.max(Math.abs(one), Math.abs(two));
          } else {
            const contacts = ['l1', 'l2', 'l3'].map((line, index) => stampResistance(component, line, `t${index + 1}`, energized ? CLOSED_RESISTANCE : OPEN_RESISTANCE));
            const auxiliaryNo = stampResistance(component, 'aux-no-a', 'aux-no-b', energized ? CLOSED_RESISTANCE : OPEN_RESISTANCE);
            stampResistance(component, 'aux-nc-a', 'aux-nc-b', energized ? OPEN_RESISTANCE : CLOSED_RESISTANCE);
            current = Math.max(...contacts.map(Math.abs), Math.abs(auxiliaryNo));
          }
          branchCurrents[component.id] = coilCurrent;
          isPowered = energized;
          componentIntensity = energized ? 1 : 0;
          break;
        }
        case 'coil': {
          const coilR = Math.max(1, propNumber(props, 'resistance', 100));
          const coilL = Math.max(1e-6, propNumber(props, 'inductance', 1.0));
          const denominator = coilL + dt * coilR;
          const conductance = dt / denominator;
          const previousCurrent = this.inductorCurrent.get(component.id) ?? 0;
          const historyCurrent = (coilL / denominator) * previousCurrent;
          const a = this.node(component, 'pos');
          const b = this.node(component, 'neg');
          system.conductance(a, b, conductance);
          system.current(a, b, historyCurrent);
          current = conductance * (this.voltage(guess, a) - this.voltage(guess, b)) + historyCurrent;
          this.addTerminalCurrent(terminalCurrents, component, 'pos', current);
          this.addTerminalCurrent(terminalCurrents, component, 'neg', -current);
          const coilVoltage = Math.abs(this.voltage(guess, a) - this.voltage(guess, b));
          const rated = Math.max(0.1, propNumber(props, 'activationThreshold', 5));
          const energized = coilVoltage >= rated * 0.6 || Boolean(controls.get(component.id));
          branchCurrents[component.id] = current;
          isPowered = energized;
          componentIntensity = energized ? 1 : 0;
          break;
        }
        case 'fuse': {
          const blown = this.fuseBlown.has(component.id);
          current = stampResistance(component, 'a', 'b', blown ? OPEN_RESISTANCE : 0.01);
          isPowered = !blown;
          break;
        }
        case 'fuse-3phase': {
          const blown = this.fuseBlown.has(component.id);
          const l1 = stampResistance(component, 'l1', 't1', blown ? OPEN_RESISTANCE : 0.01);
          const l2 = stampResistance(component, 'l2', 't2', blown ? OPEN_RESISTANCE : 0.01);
          const l3 = stampResistance(component, 'l3', 't3', blown ? OPEN_RESISTANCE : 0.01);
          current = Math.max(Math.abs(l1), Math.abs(l2), Math.abs(l3));
          isPowered = !blown;
          break;
        }
        case 'motor-dc': {
          const nominalVoltage = Math.max(0.1, propNumber(props, 'nominalV', 12));
          const resistance = nominalVoltage ** 2 / Math.max(0.01, propNumber(props, 'nominalPower', 100));
          current = stampResistance(component, 'pos', 'neg', resistance);
          const voltage = Math.abs(this.terminalVoltage(component, 'pos', guess) - this.terminalVoltage(component, 'neg', guess));
          isPowered = voltage > nominalVoltage * 0.08;
          componentIntensity = clamp(voltage / nominalVoltage, 0, 1);
          break;
        }
        case 'motor-3phase': {
          const nominalVoltage = Math.max(1, propNumber(props, 'nominalV', 400));
          const power = Math.max(1, propNumber(props, 'nominalPower', 5000));
          const phaseResistance = 3 * nominalVoltage ** 2 / power;
          const uv = stampResistance(component, 'u', 'v', phaseResistance);
          const vw = stampResistance(component, 'v', 'w', phaseResistance);
          const wu = stampResistance(component, 'w', 'u', phaseResistance);
          const vu = this.terminalVoltage(component, 'u', guess);
          const vv = this.terminalVoltage(component, 'v', guess);
          const vw_term = this.terminalVoltage(component, 'w', guess);
          const vuv = Math.abs(vu - vv);
          const vvw = Math.abs(vv - vw_term);
          const vwu = Math.abs(vw_term - vu);
          const lineVoltage = Math.sqrt((vuv ** 2 + vvw ** 2 + vwu ** 2) / 3);
          current = Math.max(Math.abs(uv), Math.abs(vw), Math.abs(wu));
          isPowered = (lineVoltage > nominalVoltage * 0.1) || (vuv > 1 && vvw > 1 && vwu > 1);
          componentIntensity = clamp(lineVoltage / nominalVoltage, 0, 1);
          break;
        }
        case 'lamp': {
          const ratedVoltage = Math.max(0.1, propNumber(props, 'ratedV', 230));
          const resistance = ratedVoltage ** 2 / Math.max(0.01, propNumber(props, 'ratedPower', 60));
          current = stampResistance(component, 'a', 'b', resistance);
          const voltage = Math.abs(this.terminalVoltage(component, 'a', guess) - this.terminalVoltage(component, 'b', guess));
          isPowered = voltage > ratedVoltage * 0.03;
          componentIntensity = clamp((voltage / ratedVoltage) ** 2, 0, 1);
          break;
        }
        case 'mosfet-n':
        case 'mosfet-p': {
          const gate = this.terminalVoltage(component, 'gate', guess);
          const source = this.terminalVoltage(component, 'source', guess);
          const threshold = propNumber(props, 'vth', type === 'mosfet-n' ? 2 : -2);
          const on = type === 'mosfet-n' ? gate - source >= threshold : gate - source <= threshold;
          current = stampResistance(component, 'drain', 'source', on ? propNumber(props, 'rdsOn', 0.1) : OPEN_RESISTANCE);
          isPowered = on;
          break;
        }
        case 'bjt-npn':
        case 'bjt-pnp': {
          const base = this.terminalVoltage(component, 'base', guess);
          const emitter = this.terminalVoltage(component, 'emitter', guess);
          const vbe = propNumber(props, 'vbe', type === 'bjt-npn' ? 0.7 : -0.7);
          const on = type === 'bjt-npn' ? base - emitter >= vbe : base - emitter <= vbe;
          stampResistance(component, 'base', 'emitter', on ? 1000 : OPEN_RESISTANCE);
          current = stampResistance(component, 'collector', 'emitter', on ? Math.abs(propNumber(props, 'vceSat', 0.2) / Math.max(1e-6, propNumber(props, 'icMax', 0.1))) : OPEN_RESISTANCE);
          isPowered = on;
          break;
        }
        case 'jfet-n':
        case 'jfet-p': {
          const gate = this.terminalVoltage(component, 'gate', guess);
          const source = this.terminalVoltage(component, 'source', guess);
          const pinch = propNumber(props, 'vp', type === 'jfet-n' ? -4 : 4);
          const on = type === 'jfet-n' ? gate - source > pinch : gate - source < pinch;
          current = stampResistance(component, 'drain', 'source', on ? 100 : OPEN_RESISTANCE);
          isPowered = on;
          break;
        }
        case 'opamp': {
          const plus = this.terminalVoltage(component, 'in+', guess);
          const minus = this.terminalVoltage(component, 'in-', guess);
          const vee = this.terminalVoltage(component, 'vee', guess);
          const vcc = this.terminalVoltage(component, 'vcc', guess);
          const supplyHigh = Math.max(vcc, propNumber(props, 'vcc', 15));
          const supplyLow = Math.min(vee, -propNumber(props, 'vcc', 15));
          const gain = propNumber(props, 'gain', 10);
          const target = clamp(gain * (plus - minus), supplyLow - vee, supplyHigh - vee);
          current = stampSource(component, 'out', 'vee', target, 1);
          isPowered = Math.abs(target) > 1e-6;
          break;
        }
        case 'transformer':
        case 'transformer-ct': {
          const ratio = 1 / Math.max(1e-6, propNumber(props, 'turnRatio', 5));
          const inputA = 'p1';
          const inputB = 'p2';
          const outputA = 's1';
          const outputB = 's2';
          const target = ratio * (this.terminalVoltage(component, inputA, guess) - this.terminalVoltage(component, inputB, guess));
          current = stampSource(component, outputA, outputB, target, 0.5);
          stampResistance(component, inputA, inputB, 100000);
          if (type === 'transformer-ct') {
            const s1 = this.node(component, 's1');
            const ct = this.node(component, 'ct');
            const s2 = this.node(component, 's2');
            system.conductance(s1, ct, 2);
            system.conductance(ct, s2, 2);
          }
          isPowered = Math.abs(target) > 1e-5;
          break;
        }
        case 'autotransformer': {
          const ratio = 1 / Math.max(1e-6, propNumber(props, 'turnRatio', 2));
          const target = ratio * (this.terminalVoltage(component, 'in1', guess) - this.terminalVoltage(component, 'in2', guess));
          current = stampSource(component, 'tap', 'out2', target, 0.5);
          stampResistance(component, 'in1', 'in2', 100000);
          stampResistance(component, 'in1', 'out1', 1e-5);
          stampResistance(component, 'in2', 'out2', 1e-5);
          isPowered = Math.abs(target) > 1e-5;
          break;
        }
        case 'scr':
        case 'triac':
        case 'diac': {
          const mainA = type === 'triac' ? 't1' : type === 'diac' ? 'a1' : 'anode';
          const mainB = type === 'triac' ? 't2' : type === 'diac' ? 'a2' : 'cathode';
          const voltage = this.terminalVoltage(component, mainA, guess) - this.terminalVoltage(component, mainB, guess);
          const gateWired = type !== 'diac' && this.network.wiredTerminals.has(terminalKey(component.id, 'gate'));
          const gateVoltage = gateWired ? this.terminalVoltage(component, 'gate', guess) - this.terminalVoltage(component, mainB, guess) : 0;
          const trigger = type === 'diac' ? Math.abs(voltage) >= propNumber(props, 'vbo', 30) : (gateWired && gateVoltage >= propNumber(props, 'vgt', 1.5) && voltage > 0);
          const latched = this.scrLatched.has(component.id) || trigger;
          current = stampResistance(component, mainA, mainB, latched ? 0.5 : OPEN_RESISTANCE);
          isPowered = latched;
          break;
        }
        case 'voltmeter': {
          current = stampResistance(component, 'pos', 'neg', 10_000_000);
          isPowered = this.network.wiredTerminals.has(terminalKey(component.id, 'pos')) && this.network.wiredTerminals.has(terminalKey(component.id, 'neg'));
          break;
        }
        case 'ammeter': {
          current = stampResistance(component, 'pos', 'neg', 0.01);
          isPowered = this.network.wiredTerminals.has(terminalKey(component.id, 'pos')) && this.network.wiredTerminals.has(terminalKey(component.id, 'neg'));
          break;
        }
        case 'dmm': {
          const mode = propString(props, 'mode', 'DCV');
          if (mode === 'OHM' || mode === 'CONT') {
            // OHM/continuity use an isolated test-source solve in computeInstrumentReadings.
            current = 0;
          } else {
            const resistance = mode === 'DCA' || mode === 'ACA' ? 0.01 : 10_000_000;
            current = stampResistance(component, 'hi', 'com', resistance);
          }
          isPowered = this.network.wiredTerminals.has(terminalKey(component.id, 'hi')) && this.network.wiredTerminals.has(terminalKey(component.id, 'com'));
          break;
        }
        case 'oscilloscope': {
          const grounded = this.network.wiredTerminals.has(terminalKey(component.id, 'gnd'));
          const channelCurrents = ['ch1', 'ch2', 'ch3', 'ch4'].map(channel => {
            const connected = grounded && this.network.wiredTerminals.has(terminalKey(component.id, channel));
            return stampResistance(component, channel, 'gnd', connected ? 10_000_000 : OPEN_RESISTANCE);
          });
          current = Math.max(...channelCurrents.map(Math.abs));
          isPowered = grounded;
          break;
        }
        default:
          warnings.push({ code: 'UNSUPPORTED_COMPONENT', message: `${getDef(type)?.name ?? type} uses an open-circuit fallback in this solver.`, componentId: component.id });
      }
      if (branchCurrents[component.id] === undefined) branchCurrents[component.id] = current;
      powered[component.id] = isPowered;
      intensity[component.id] = componentIntensity;
    }

    const solution = solveLinear(system.matrix, system.rhs);
    if (!solution || solution.some(value => !Number.isFinite(value) || Math.abs(value) > 1e15)) {
      warnings.push({ code: 'SINGULAR_OR_UNSTABLE', message: 'The circuit matrix is singular or unstable. Check for an undefined reference or conflicting ideal connections.' });
      return { voltages: guess, terminalVoltages: this.buildTerminalVoltages(guess), branchCurrents, terminalCurrents, powered, intensity, converged: false, warnings };
    }
    // Currents are recomputed in the next nonlinear stamp using this voltage. A short final pass is enough for UI values.
    const terminalVoltages = this.buildTerminalVoltages(solution);
    return { voltages: solution, terminalVoltages, branchCurrents, terminalCurrents, powered, intensity, converged: true, warnings };
  }

  private buildTerminalVoltages(solution: number[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const component of this.components) {
      const definition = getDef(component.type);
      if (!definition) continue;
      for (const terminal of definition.terminals) result[terminalKey(component.id, terminal.id)] = this.terminalVoltage(component, terminal.id, solution);
    }
    return result;
  }

  private updateDynamicStates(result: SolveResult, _dt: number) {
    for (const component of this.components) {
      if (component.type === 'capacitor') {
        const voltage = (result.terminalVoltages[terminalKey(component.id, 'a')] ?? 0) - (result.terminalVoltages[terminalKey(component.id, 'b')] ?? 0);
        this.capacitorVoltage.set(component.id, voltage);
      }
      if (component.type === 'inductor' || component.type === 'coil') this.inductorCurrent.set(component.id, result.branchCurrents[component.id] ?? 0);
      if (component.type === 'scr' || component.type === 'triac' || component.type === 'diac') {
        const mainA = component.type === 'triac' ? 't1' : component.type === 'diac' ? 'a1' : 'anode';
        const mainB = component.type === 'triac' ? 't2' : component.type === 'diac' ? 'a2' : 'cathode';
        const voltage = (result.terminalVoltages[terminalKey(component.id, mainA)] ?? 0) - (result.terminalVoltages[terminalKey(component.id, mainB)] ?? 0);
        if (Math.abs(voltage) < 0.05) this.scrLatched.delete(component.id);
        else if (result.powered[component.id]) this.scrLatched.add(component.id);
      }
      if ((component.type === 'fuse' || component.type === 'fuse-3phase') && !this.fuseBlown.has(component.id)) {
        const rated = Math.max(0.01, propNumber(component.props, 'ratedCurrent', 10));
        if (Math.abs(result.branchCurrents[component.id] ?? 0) > rated * 1.25) this.fuseBlown.add(component.id);
      }
    }
  }

  private appendHistory(store: Map<string, SamplePoint[]>, key: string, value: number) {
    const samples = store.get(key) ?? [];
    samples.push({ time: this.time, value: Number.isFinite(value) ? value : 0 });
    if (samples.length > HISTORY_LIMIT) samples.splice(0, samples.length - HISTORY_LIMIT);
    store.set(key, samples);
  }

  private recordHistories(result: SolveResult) {
    for (const [root, index] of Array.from(this.network.nodeByRoot.entries())) this.appendHistory(this.nodeHistory, root, result.voltages[index] ?? 0);
    if (this.network.referenceRoot) this.appendHistory(this.nodeHistory, this.network.referenceRoot, 0);
    for (const [key, value] of Object.entries(result.terminalVoltages)) this.appendHistory(this.terminalHistory, key, value);
    for (const [key, value] of Object.entries(result.branchCurrents)) this.appendHistory(this.branchHistory, key, value);
  }

  private historyObject(source: Map<string, SamplePoint[]>): Record<string, SamplePoint[]> {
    return Object.fromEntries(Array.from(source.entries()).map(([key, values]) => [key, [...values]]));
  }

  private differentialHistory(positive: string, negative: string): SamplePoint[] {
    const pos = this.terminalHistory.get(positive) ?? [];
    const neg = this.terminalHistory.get(negative) ?? [];
    const count = Math.min(pos.length, neg.length);
    return Array.from({ length: count }, (_, index) => ({ time: pos[pos.length - count + index].time, value: pos[pos.length - count + index].value - neg[neg.length - count + index].value }));
  }

  private currentHistory(componentId: string): SamplePoint[] {
    return [...(this.branchHistory.get(componentId) ?? [])];
  }

  private rangeLimit(range: string, unit: 'V' | 'A' | 'Ω'): number | null {
    if (!range || range === 'auto') return null;
    const normalized = range.trim().replace('m', 'e-3').replace('µ', 'e-6').replace('k', 'e3').replace('M', 'e6');
    const value = Number(normalized.replace(/[A-Za-zΩ]+/g, ''));
    if (!Number.isFinite(value)) return null;
    return value;
  }

  private reading(value: number, unit: string, status: InstrumentReading['status'] = 'ready', extra: Partial<InstrumentReading> = {}): InstrumentReading {
    return { value: Number.isFinite(value) ? value : Infinity, unit, status, ...extra };
  }

  private computeInstrumentReadings(result: SolveResult): Record<string, InstrumentReading> {
    const readings: Record<string, InstrumentReading> = {};
    for (const component of this.components) {
      const connected = (terminal: string) => this.network.wiredTerminals.has(terminalKey(component.id, terminal));
      if (component.type === 'voltmeter') {
        const pos = terminalKey(component.id, 'pos');
        const neg = terminalKey(component.id, 'neg');
        if (!connected('pos') || !connected('neg')) readings[component.id] = this.reading(0, 'V', 'open');
        else {
          const values = this.differentialHistory(pos, neg).map(sample => sample.value);
          const ac = propString(component.props, 'mode', 'DC') === 'AC';
          readings[component.id] = this.reading(ac ? rms(values, true) : (values.at(-1) ?? 0), 'V');
        }
      }
      if (component.type === 'ammeter') {
        if (!connected('pos') || !connected('neg')) readings[component.id] = this.reading(0, 'A', 'open');
        else {
          const values = this.currentHistory(component.id).map(sample => sample.value);
          const ac = propString(component.props, 'mode', 'DC') === 'AC';
          readings[component.id] = this.reading(ac ? rms(values, true) : (values.at(-1) ?? 0), 'A');
        }
      }
      if (component.type === 'dmm') {
        const hi = terminalKey(component.id, 'hi');
        const com = terminalKey(component.id, 'com');
        const mode = propString(component.props, 'mode', 'DCV');
        if (!connected('hi') || !connected('com')) {
          readings[component.id] = this.reading(0, mode.includes('A') ? 'A' : mode === 'OHM' || mode === 'CONT' ? 'Ω' : mode === 'HZ' ? 'Hz' : 'V', 'open');
          continue;
        }
        const voltageHistory = this.differentialHistory(hi, com);
        const voltageValues = voltageHistory.map(sample => sample.value);
        const latestVoltage = voltageValues.at(-1) ?? 0;
        const currentValues = this.currentHistory(component.id).map(sample => sample.value);
        const latestCurrent = currentValues.at(-1) ?? 0;
        let reading: InstrumentReading;
        if (mode === 'DCV') reading = this.reading(latestVoltage, 'V');
        else if (mode === 'ACV') reading = this.reading(rms(voltageValues, true), 'V');
        else if (mode === 'DCA') reading = this.reading(latestCurrent, 'A');
        else if (mode === 'ACA') reading = this.reading(rms(currentValues, true), 'A');
        else if (mode === 'HZ') reading = this.reading(estimateFrequency(voltageHistory), 'Hz');
        else {
          const hiRoot = this.network.terminalRoots.get(hi);
          const comRoot = this.network.terminalRoots.get(com);
          const nodeForRoot = (root: string | undefined) => !root || root === this.network.referenceRoot ? '0' : `n:${root}`;
          const isDirectlyOpen = this.isDmmMeasuringOpenCircuit(component);
          const resistance = isDirectlyOpen
            ? Infinity
            : measureResistanceWithTestSource(compileDcTopology(this.components, this.wires), nodeForRoot(hiRoot), nodeForRoot(comRoot));
          const open = isDirectlyOpen || !Number.isFinite(resistance) || resistance >= 1e7;
          reading = this.reading(open ? Infinity : resistance, 'Ω', open ? 'open' : 'ready', mode === 'CONT' ? { continuity: !open && resistance < 50 } : {});
        }
        const unit = reading.unit as 'V' | 'A' | 'Ω';
        const limit = this.rangeLimit(propString(component.props, 'range', 'auto'), unit);
        if (limit !== null && Math.abs(reading.value) > limit) reading.status = 'overflow';
        readings[component.id] = reading;
      }
      if (component.type === 'oscilloscope') {
        const ground = terminalKey(component.id, 'gnd');
        for (const channel of ['ch1', 'ch2', 'ch3', 'ch4']) {
          const key = `${component.id}:${channel}`;
          if (!connected('gnd') || !connected(channel)) {
            readings[key] = this.reading(0, 'V', 'open');
            continue;
          }
          const samples = this.differentialHistory(terminalKey(component.id, channel), ground);
          const timebase = Math.max(1e-6, propNumber(component.props, 'timebase', 0.02));
          const visible = samples.filter(sample => sample.time >= this.time - timebase);
          readings[key] = this.reading(rms(visible.map(sample => sample.value), true), 'V', 'ready', { samples, frequency: estimateFrequency(visible) });
        }
      }
    }
    return readings;
  }

  protected isDmmMeasuringOpenCircuit(dmm: CircuitComponent): boolean {
    const dmmWires = this.wires.filter(w => w.fromComp === dmm.id || w.toComp === dmm.id);
    const hiWire = dmmWires.find(w => (w.fromComp === dmm.id && (w.fromTerm === 'hi' || w.fromTerm === 'pos')) || (w.toComp === dmm.id && (w.toTerm === 'hi' || w.toTerm === 'pos')));
    const comWire = dmmWires.find(w => (w.fromComp === dmm.id && (w.fromTerm === 'com' || w.fromTerm === 'neg')) || (w.toComp === dmm.id && (w.toTerm === 'com' || w.toTerm === 'neg')));
    if (!hiWire || !comWire) return true;

    const getTargetComp = (w: CircuitWire) => w.fromComp === dmm.id ? w.toComp : w.fromComp;
    const targetA = getTargetComp(hiWire);
    const targetB = getTargetComp(comWire);

    if (targetA === targetB) {
      const comp = this.components.find(c => c.id === targetA);
      if (comp && (Boolean(comp.state?.isBurned) || isComponentOpen(comp))) return true;
    }

    const brokenWires = getBrokenWireIds(this.components, this.wires);
    if (brokenWires.has(hiWire.id) || brokenWires.has(comWire.id)) return true;

    return false;
  }

  private computeWireCurrents(terminalCurrents: Record<string, number>): Record<string, number> {
    const currents: Record<string, number> = {};

    const terminalWireCount: Record<string, number> = {};
    for (const wire of this.wires) {
      const fromKey = terminalKey(wire.fromComp, wire.fromTerm);
      const toKey = terminalKey(wire.toComp, wire.toTerm);
      terminalWireCount[fromKey] = (terminalWireCount[fromKey] ?? 0) + 1;
      terminalWireCount[toKey] = (terminalWireCount[toKey] ?? 0) + 1;
    }

    for (const wire of this.wires) {
      const from = terminalKey(wire.fromComp, wire.fromTerm);
      const to = terminalKey(wire.toComp, wire.toTerm);

      const fromI = terminalCurrents[from];
      const toI = terminalCurrents[to];

      const wiresAtFrom = terminalWireCount[from] ?? 0;
      const wiresAtTo = terminalWireCount[to] ?? 0;

      const fromCompObj = this.components.find(c => c.id === wire.fromComp);
      const toCompObj = this.components.find(c => c.id === wire.toComp);
      const fromIsCurrent = fromCompObj && (fromCompObj.type === 'dc-current' || fromCompObj.type === 'ac-current');
      const toIsCurrent = toCompObj && (toCompObj.type === 'dc-current' || toCompObj.type === 'ac-current');

      let wireI = 0;
      if (fromIsCurrent || toIsCurrent) {
        if (fromIsCurrent) {
          const srcI = fromI !== undefined ? -fromI : 0;
          wireI = wire.fromTerm === 'pos' ? srcI : -srcI;
        } else if (toIsCurrent) {
          const srcI = toI !== undefined ? toI : 0;
          wireI = wire.toTerm === 'pos' ? -srcI : srcI;
        }
      } else if (wiresAtTo === 1 && toI !== undefined && wiresAtFrom !== 1) {
        wireI = toI;
      } else if (wiresAtFrom === 1 && fromI !== undefined && wiresAtTo !== 1) {
        wireI = -fromI;
      } else if (wiresAtFrom === 1 && wiresAtTo === 1) {
        if (toI !== undefined && Math.abs(toI) > 1e-12) {
          wireI = toI;
        } else if (fromI !== undefined && Math.abs(fromI) > 1e-12) {
          wireI = -fromI;
        }
      } else {
        const leavingFrom = fromI !== undefined ? -fromI : 0;
        const enteringTo = toI !== undefined ? toI : 0;
        wireI = Math.abs(leavingFrom) > 1e-12 ? leavingFrom : enteringTo;
      }

      if (Math.abs(wireI) < 1e-7) {
        wireI = 0;
      }

      currents[wire.id] = wireI;
    }
    return currents;
  }

  private nodeVoltageMap(solution: number[]): Record<string, number> {
    const values: Record<string, number> = {};
    for (const root of this.network.roots) {
      const node = root === this.network.referenceRoot ? -1 : this.network.nodeByRoot.get(root) ?? -1;
      values[root] = this.voltage(solution, node);
    }
    return values;
  }
}
