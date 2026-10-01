/**
 * Tab D documented MNA core.
 *
 * This implementation deliberately mirrors only the primitive equations stated
 * in tab_c_engine.md. Device families whose blueprint entry says “subcircuit”
 * or “digital event queue” are intentionally not represented here.
 */

export type TabDPrimitive =
  | { kind: 'resistor'; id: string; positive: string; negative: string; resistance: number }
  | { kind: 'current'; id: string; positive: string; negative: string; current: number }
  | { kind: 'voltage'; id: string; positive: string; negative: string; voltage: number }
  | { kind: 'capacitor'; id: string; positive: string; negative: string; capacitance: number }
  | { kind: 'inductor'; id: string; positive: string; negative: string; inductance: number; seriesResistance?: number }
  | { kind: 'vccs'; id: string; positive: string; negative: string; controlPositive: string; controlNegative: string; transconductance?: number; gain?: number }
  | { kind: 'vcvs'; id: string; positive: string; negative: string; controlPositive: string; controlNegative: string; gain: number }
  | { kind: 'cccs'; id: string; positive: string; negative: string; controlBranchId?: string; targetId?: string; gain: number; controlPositive?: string; controlNegative?: string; targetResistance?: number }
  | { kind: 'ccvs'; id: string; positive: string; negative: string; controlBranchId?: string; targetId?: string; transresistance?: number; gain?: number; controlPositive?: string; controlNegative?: string; targetResistance?: number }
  | { kind: 'resistive-switch'; id: string; positive: string; negative: string; closed: boolean };

export interface TabDOperatingPoint {
  time: number;
  converged: true;
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  terminalVoltages: Record<string, number>;
  /** Newton results only: the primitive set (with companion stamps) linearized at the accepted operating point. */
  tangent?: TabDPrimitive[];
}

export interface TabDMnaState {
  capacitors: Record<string, number>;
  inductors: Record<string, number>;
  time: number;
}

export class TabDMnaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TabDMnaError';
  }
}

interface BranchUnknown {
  id: string;
  primitive: Extract<TabDPrimitive, { kind: 'voltage' | 'inductor' | 'vcvs' | 'ccvs' | 'resistor' | 'resistive-switch' }>;
}

interface LuFactorization {
  lu: number[][];
  pivot: number[];
}

const MIN_DT = 1e-12;
/**
 * Closed-switch on-resistance: 10 µΩ. The former 1 fΩ (10¹⁵ S) stamp made the conductance matrix numerically
 * singular (catastrophic cancellation of 10¹⁵ − 10³⁰/10¹⁵ in the Schur pivot) and turned the reported switch
 * current ΔV/R into rounding noise. 10⁵ S is still an effectively ideal contact but keeps the matrix well conditioned.
 */
export const RESISTIVE_SWITCH_ON = 1e-5;
export const RESISTIVE_SWITCH_OFF = 1e15;
/** Smallest |R| accepted for a resistor: below this the branch is a zero-ohm short that must be modelled explicitly. */
export const MIN_RESISTANCE = 1e-9;
/**
 * Resistors below this value (and every closed switch) are stamped as a branch whose current is an MNA unknown
 * (V₊ − V₋ − R·I = 0) instead of a conductance. For R → 0 the conductance form forces the current out of a difference
 * of two nearly equal node voltages (ΔV/R is rounding noise); the branch form returns it directly, exactly as a
 * voltage-source current.
 */
const LOW_RESISTANCE_BRANCH = 1e-3;
/** A closed switch carrying more than this is an ideal-source dead short, not a circuit operating point. */
export const MAX_SWITCH_CURRENT = 1e5;
/** Row-scaled pivot magnitude below which the MNA matrix is treated as numerically singular (≈ 64·ε). */
const SCALED_PIVOT_EPSILON = 1e-14;

function requireFinite(value: number, description: string): number {
  if (!Number.isFinite(value)) throw new TabDMnaError(`Invalid Circuit: ${description} must be a finite number (got ${String(value)}).`);
  return value;
}

/**
 * Rejects malformed primitives before any stamping. Non-finite parameters are never replaced by a default, and a
 * resistance is never re-interpreted (|R|, clamp to 1 fΩ): the solver either solves the declared circuit or raises
 * a structured diagnostic.
 */
function validatePrimitives(primitives: TabDPrimitive[]) {
  for (const primitive of primitives) {
    const label = `${primitive.kind} ${primitive.id}`;
    switch (primitive.kind) {
      case 'resistor':
        requireFinite(primitive.resistance, `${label} resistance`);
        if (primitive.resistance < 0) throw new TabDMnaError(`Invalid Circuit: ${label} has negative resistance (${primitive.resistance} Ω); a passive resistor must be positive.`);
        if (primitive.resistance < MIN_RESISTANCE) throw new TabDMnaError(`Invalid Circuit: ${label} is a zero-ohm resistor (${primitive.resistance} Ω); model an ideal short with a 0 V source or a closed switch.`);
        break;
      case 'current': requireFinite(primitive.current, `${label} current`); break;
      case 'voltage': requireFinite(primitive.voltage, `${label} voltage`); break;
      case 'capacitor': requireFinite(primitive.capacitance, `${label} capacitance`); break;
      case 'inductor':
        requireFinite(primitive.inductance, `${label} inductance`);
        if (primitive.seriesResistance !== undefined) requireFinite(primitive.seriesResistance, `${label} series resistance`);
        break;
      case 'vccs': requireFinite(primitive.gain ?? primitive.transconductance ?? 0, `${label} gain`); break;
      case 'vcvs': requireFinite(primitive.gain, `${label} gain`); break;
      case 'cccs': requireFinite(primitive.gain, `${label} gain`); break;
      case 'ccvs': requireFinite(primitive.gain ?? primitive.transresistance ?? 0, `${label} gain`); break;
      default: break;
    }
  }
}

function createMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

/**
 * LU factorization with scaled partial pivoting (pivot candidates are divided by their original row infinity-norm);
 * throws instead of silently accepting a singular system. Singularity is judged on the scaled pivot, so a well-posed
 * matrix whose entries span many decades is not mistaken for a singular one (and vice versa).
 */
function factorLu(matrix: number[][]): LuFactorization {
  const size = matrix.length;
  const lu = matrix.map(row => [...row]);
  const pivot = Array.from({ length: size }, (_, index) => index);
  const scale = lu.map(row => row.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0));
  for (const rowScale of scale) if (!(rowScale > 0) || !Number.isFinite(rowScale)) throw new TabDMnaError('Singular MNA matrix: define a reference and remove conflicting ideal constraints.');
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    let best = Math.abs(lu[column][column]) / scale[column];
    for (let row = column + 1; row < size; row += 1) {
      const candidate = Math.abs(lu[row][column]) / scale[row];
      if (candidate > best) { best = candidate; pivotRow = row; }
    }
    if (!(best > SCALED_PIVOT_EPSILON)) throw new TabDMnaError('Singular MNA matrix: define a reference and remove conflicting ideal constraints.');
    if (pivotRow !== column) {
      [lu[column], lu[pivotRow]] = [lu[pivotRow], lu[column]];
      [pivot[column], pivot[pivotRow]] = [pivot[pivotRow], pivot[column]];
      [scale[column], scale[pivotRow]] = [scale[pivotRow], scale[column]];
    }
    for (let row = column + 1; row < size; row += 1) {
      lu[row][column] /= lu[column][column];
      for (let nextColumn = column + 1; nextColumn < size; nextColumn += 1) {
        lu[row][nextColumn] -= lu[row][column] * lu[column][nextColumn];
      }
    }
  }
  return { lu, pivot };
}

function solveLu(factorization: LuFactorization, rhs: number[]): number[] {
  const { lu, pivot } = factorization;
  const size = rhs.length;
  const forward = Array(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    let value = rhs[pivot[row]];
    for (let column = 0; column < row; column += 1) value -= lu[row][column] * forward[column];
    forward[row] = value;
  }
  const solution = Array(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = forward[row];
    for (let column = row + 1; column < size; column += 1) value -= lu[row][column] * solution[column];
    solution[row] = value / lu[row][row];
  }
  return solution;
}

/** A closed switch carrying more than MAX_SWITCH_CURRENT is an ideal-source dead short, not an operating point. */
function assertNoDeadShort(primitives: TabDPrimitive[], branchCurrents: Record<string, number>) {
  for (const primitive of primitives) {
    if (primitive.kind !== 'resistive-switch' || !primitive.closed) continue;
    const current = Math.abs(branchCurrents[primitive.id] ?? 0);
    if (current > MAX_SWITCH_CURRENT) {
      throw new TabDMnaError(`Invalid Circuit: short circuit — closed switch ${primitive.id} would carry ${current.toExponential(2)} A (> ${MAX_SWITCH_CURRENT.toExponential(0)} A); ideal sources are shorted through it.`);
    }
  }
}

/**
 * Independent modified-nodal solver for the confirmed Tab C primitive stamps.
 * Capacitors and inductors use the blueprint's backward-difference companion
 * equations, not a trapezoidal approximation.
 */
export class TabDDocumentedMna {
  private readonly capacitorVoltage = new Map<string, number>();
  private readonly inductorCurrent = new Map<string, number>();
  private time = 0;

  reset() {
    this.capacitorVoltage.clear();
    this.inductorCurrent.clear();
    this.time = 0;
  }

  /** Reactive history and clock as plain data, so a stateless host can carry them between calls. */
  exportState(): TabDMnaState {
    return { capacitors: Object.fromEntries(this.capacitorVoltage), inductors: Object.fromEntries(this.inductorCurrent), time: this.time };
  }

  importState(state: TabDMnaState, keep: (primitiveId: string) => boolean = () => true) {
    this.reset();
    for (const [id, value] of Object.entries(state.capacitors)) if (keep(id) && Number.isFinite(value)) this.capacitorVoltage.set(id, value);
    for (const [id, value] of Object.entries(state.inductors)) if (keep(id) && Number.isFinite(value)) this.inductorCurrent.set(id, value);
    this.time = Number.isFinite(state.time) ? state.time : 0;
  }

  /**
   * Commits the reactive history of an operating point that was solved without committing (`solve(..., false)`), and advances
   * the clock — the same state update a committing solve performs, without factorising the matrix a second time.
   */
  commitHistory(primitives: TabDPrimitive[], point: TabDOperatingPoint, elapsedSeconds: number): TabDOperatingPoint {
    const dt = Math.max(MIN_DT, requireFinite(elapsedSeconds, 'time step'));
    assertNoDeadShort(primitives, point.branchCurrents);
    const voltage = (name: string) => name === '0' ? 0 : point.nodeVoltages[name] ?? 0;
    for (const primitive of primitives) {
      if (primitive.kind === 'capacitor') this.capacitorVoltage.set(primitive.id, voltage(primitive.positive) - voltage(primitive.negative));
      if (primitive.kind === 'inductor') this.inductorCurrent.set(primitive.id, point.branchCurrents[primitive.id] ?? 0);
    }
    this.time += dt;
    return { ...point, time: this.time };
  }

  /**
   * Keeps the stored capacitor voltages / inductor currents (and the clock) of every primitive whose id belongs to a
   * surviving component — ids equal to it or namespaced `<component>:<part>` — so a schematic edit or switch toggle
   * does not zero the energy stored in the circuit (I_L(t⁻) = I_L(t⁺), V_C(t⁻) = V_C(t⁺)).
   */
  retainState(componentIds: Set<string>) {
    const survives = (primitiveId: string) => {
      if (componentIds.has(primitiveId)) return true;
      for (let colon = primitiveId.indexOf(':'); colon > 0; colon = primitiveId.indexOf(':', colon + 1)) {
        if (componentIds.has(primitiveId.slice(0, colon))) return true;
      }
      return false;
    };
    for (const id of Array.from(this.capacitorVoltage.keys())) if (!survives(id)) this.capacitorVoltage.delete(id);
    for (const id of Array.from(this.inductorCurrent.keys())) if (!survives(id)) this.inductorCurrent.delete(id);
  }

  getTime() {
    return this.time;
  }

  solve(primitives: TabDPrimitive[], elapsedSeconds = 1e-3, commitHistory = true): TabDOperatingPoint {
    const dt = Math.max(MIN_DT, requireFinite(elapsedSeconds, 'time step'));
    validatePrimitives(primitives);
    const nodeNames = new Set<string>();
    for (const primitive of primitives) {
      nodeNames.add(primitive.positive);
      nodeNames.add(primitive.negative);
      if ('controlPositive' in primitive && primitive.controlPositive) {
        nodeNames.add(primitive.controlPositive);
      }
      if ('controlNegative' in primitive && primitive.controlNegative) {
        nodeNames.add(primitive.controlNegative);
      }
    }
    if (nodeNames.size && !nodeNames.has('0')) throw new TabDMnaError('Tab D documented MNA requires an explicit ground reference named 0.');
    const orderedNodes = Array.from(nodeNames).filter(node => node !== '0').sort();
    const nodeIndex = new Map(orderedNodes.map((node, index) => [node, index]));
    const branchPrimitives = primitives.filter((primitive): primitive is BranchUnknown['primitive'] =>
      ['voltage', 'inductor', 'vcvs', 'ccvs'].includes(primitive.kind)
      || (primitive.kind === 'resistor' && primitive.resistance < LOW_RESISTANCE_BRANCH)
      || (primitive.kind === 'resistive-switch' && primitive.closed));
    const branchUnknowns: BranchUnknown[] = branchPrimitives.map(primitive => ({ id: primitive.id, primitive }));
    const branchIndex = new Map(branchUnknowns.map(({ id }, index) => [id, orderedNodes.length + index]));
    const size = orderedNodes.length + branchUnknowns.length;
    if (!size) return { time: this.time, converged: true, nodeVoltages: { '0': 0 }, branchCurrents: {}, terminalVoltages: {} };
    const matrix = createMatrix(size);
    const rhs = Array(size).fill(0);
    const node = (name: string) => name === '0' ? -1 : nodeIndex.get(name) ?? -1;
    const voltage = (solution: number[], name: string) => {
      const index = node(name);
      return index < 0 ? 0 : solution[index] ?? 0;
    };
    const stampConductance = (positive: string, negative: string, conductance: number) => {
      const p = node(positive); const n = node(negative);
      if (p >= 0) matrix[p][p] += conductance;
      if (n >= 0) matrix[n][n] += conductance;
      if (p >= 0 && n >= 0) { matrix[p][n] -= conductance; matrix[n][p] -= conductance; }
    };
    const stampCurrent = (positive: string, negative: string, current: number) => {
      const p = node(positive); const n = node(negative);
      if (p >= 0) rhs[p] -= current;
      if (n >= 0) rhs[n] += current;
    };
    const stampBranchConnection = (positive: string, negative: string, column: number) => {
      const p = node(positive); const n = node(negative);
      if (p >= 0) { matrix[p][column] += 1; matrix[column][p] += 1; }
      if (n >= 0) { matrix[n][column] -= 1; matrix[column][n] -= 1; }
    };

    const targetResistance = (resistance: number, label: string) => {
      requireFinite(resistance, `${label} resistance`);
      if (!(resistance >= MIN_RESISTANCE)) throw new TabDMnaError(`Invalid Circuit: ${label} must have a resistance of at least ${MIN_RESISTANCE} Ω to sense a current.`);
      return resistance;
    };

    const resolveTargetResistor = (targetRef?: string, fallbackCp?: string, fallbackCn?: string, fallbackR?: number) => {
      if (targetRef) {
        const found = primitives.find(p => p.id === targetRef && p.kind === 'resistor') as Extract<TabDPrimitive, { kind: 'resistor' }> | undefined;
        if (found) {
          return { positive: found.positive, negative: found.negative, resistance: targetResistance(found.resistance, found.id) };
        }
      }
      if (fallbackCp && fallbackCn && fallbackR !== undefined) {
        return { positive: fallbackCp, negative: fallbackCn, resistance: targetResistance(fallbackR, 'current-control target') };
      }
      return null;
    };

    for (const primitive of primitives) {
      switch (primitive.kind) {
        case 'resistor':
          if (primitive.resistance < LOW_RESISTANCE_BRANCH) {
            const column = branchIndex.get(primitive.id)!;
            stampBranchConnection(primitive.positive, primitive.negative, column);
            matrix[column][column] -= primitive.resistance;
          } else {
            stampConductance(primitive.positive, primitive.negative, 1 / primitive.resistance);
          }
          break;
        case 'resistive-switch': {
          if (primitive.closed) {
            const column = branchIndex.get(primitive.id)!;
            stampBranchConnection(primitive.positive, primitive.negative, column);
            matrix[column][column] -= RESISTIVE_SWITCH_ON;
          } else {
            stampConductance(primitive.positive, primitive.negative, 1 / RESISTIVE_SWITCH_OFF);
          }
          break;
        }
        case 'current':
          stampCurrent(primitive.positive, primitive.negative, primitive.current);
          break;
        case 'capacitor': {
          const conductance = Math.max(0, primitive.capacitance) / dt;
          const previous = this.capacitorVoltage.get(primitive.id) ?? 0;
          stampConductance(primitive.positive, primitive.negative, conductance);
          stampCurrent(primitive.positive, primitive.negative, -conductance * previous);
          break;
        }
        case 'vccs': {
          const p = node(primitive.positive); const n = node(primitive.negative);
          const cp = node(primitive.controlPositive); const cn = node(primitive.controlNegative);
          const gain = primitive.gain ?? primitive.transconductance ?? 0;
          if (p >= 0 && cp >= 0) matrix[p][cp] += gain;
          if (p >= 0 && cn >= 0) matrix[p][cn] -= gain;
          if (n >= 0 && cp >= 0) matrix[n][cp] -= gain;
          if (n >= 0 && cn >= 0) matrix[n][cn] += gain;
          break;
        }
        case 'vcvs': {
          const column = branchIndex.get(primitive.id)!;
          stampBranchConnection(primitive.positive, primitive.negative, column);
          const cp = node(primitive.controlPositive); const cn = node(primitive.controlNegative);
          if (cp >= 0) matrix[column][cp] -= primitive.gain;
          if (cn >= 0) matrix[column][cn] += primitive.gain;
          break;
        }
        case 'cccs': {
          const targetRef = primitive.targetId || primitive.controlBranchId || '';
          const gain = primitive.gain;
          const control = targetRef ? branchIndex.get(targetRef) : undefined;
          if (control !== undefined) {
            const p = node(primitive.positive); const n = node(primitive.negative);
            if (p >= 0) matrix[p][control] += gain;
            if (n >= 0) matrix[n][control] -= gain;
          } else {
            const targetResistor = resolveTargetResistor(targetRef, primitive.controlPositive, primitive.controlNegative, primitive.targetResistance);
            if (targetResistor) {
              const geq = gain / targetResistor.resistance;
              const p = node(primitive.positive); const n = node(primitive.negative);
              const tp = node(targetResistor.positive); const tn = node(targetResistor.negative);
              if (p >= 0 && tp >= 0) matrix[p][tp] += geq;
              if (p >= 0 && tn >= 0) matrix[p][tn] -= geq;
              if (n >= 0 && tp >= 0) matrix[n][tp] -= geq;
              if (n >= 0 && tn >= 0) matrix[n][tn] += geq;
            } else {
              throw new TabDMnaError(`CCCS ${primitive.id} requires an existing current-control branch or resistor.`);
            }
          }
          break;
        }
        case 'ccvs': {
          const column = branchIndex.get(primitive.id)!;
          stampBranchConnection(primitive.positive, primitive.negative, column);
          const targetRef = primitive.targetId || primitive.controlBranchId || '';
          const gain = primitive.gain ?? primitive.transresistance ?? 0;
          const control = targetRef ? branchIndex.get(targetRef) : undefined;
          if (control !== undefined) {
            matrix[column][control] -= gain;
          } else {
            const targetResistor = resolveTargetResistor(targetRef, primitive.controlPositive, primitive.controlNegative, primitive.targetResistance);
            if (targetResistor) {
              const mueq = gain / targetResistor.resistance;
              const tp = node(targetResistor.positive); const tn = node(targetResistor.negative);
              if (tp >= 0) matrix[column][tp] -= mueq;
              if (tn >= 0) matrix[column][tn] += mueq;
            } else {
              throw new TabDMnaError(`CCVS ${primitive.id} requires an existing current-control branch or resistor.`);
            }
          }
          break;
        }
        case 'voltage': {
          const column = branchIndex.get(primitive.id)!;
          stampBranchConnection(primitive.positive, primitive.negative, column);
          rhs[column] = primitive.voltage;
          break;
        }
        case 'inductor': {
          const column = branchIndex.get(primitive.id)!;
          const inductance = Math.max(0, primitive.inductance);
          const previousCurrent = this.inductorCurrent.get(primitive.id) ?? 0;
          const companionResistance = inductance / dt + Math.max(0, primitive.seriesResistance ?? 0);
          stampBranchConnection(primitive.positive, primitive.negative, column);
          matrix[column][column] -= companionResistance;
          rhs[column] = -(inductance / dt) * previousCurrent;
          break;
        }
      }
    }

    const solution = solveLu(factorLu(matrix), rhs);
    if (solution.some(value => !Number.isFinite(value))) throw new TabDMnaError('Singular MNA matrix: the solve produced non-finite values; define a reference and remove conflicting ideal constraints.');
    const nodeVoltages: Record<string, number> = { '0': 0 };
    for (const [name, index] of Array.from(nodeIndex.entries())) nodeVoltages[name] = solution[index];
    const branchCurrents: Record<string, number> = {};
    for (const [id, index] of Array.from(branchIndex.entries())) branchCurrents[id] = solution[index];
    for (const primitive of primitives) {
      // Branch-stamped elements (R < 1 mΩ, closed switches) already hold their solved current; conductance-stamped
      // ones are read back through Ohm's law.
      if (primitive.kind === 'resistor' && !branchIndex.has(primitive.id)) branchCurrents[primitive.id] = (voltage(solution, primitive.positive) - voltage(solution, primitive.negative)) / primitive.resistance;
      if (primitive.kind === 'resistive-switch') {
        if (!primitive.closed) branchCurrents[primitive.id] = (voltage(solution, primitive.positive) - voltage(solution, primitive.negative)) / RESISTIVE_SWITCH_OFF;
      }
      if (primitive.kind === 'current') branchCurrents[primitive.id] = primitive.current;
      if (primitive.kind === 'capacitor') {
        const present = voltage(solution, primitive.positive) - voltage(solution, primitive.negative);
        const conductance = Math.max(0, primitive.capacitance) / dt;
        const prior = this.capacitorVoltage.get(primitive.id) ?? 0;
        branchCurrents[primitive.id] = conductance * (present - prior);
        if (commitHistory) this.capacitorVoltage.set(primitive.id, present);
      }
      if (primitive.kind === 'inductor' && commitHistory) this.inductorCurrent.set(primitive.id, branchCurrents[primitive.id] ?? 0);
      if (primitive.kind === 'vccs') {
        const gain = primitive.gain ?? primitive.transconductance ?? 0;
        branchCurrents[primitive.id] = gain * (voltage(solution, primitive.controlPositive) - voltage(solution, primitive.controlNegative));
      }
      if (primitive.kind === 'cccs') {
        const targetRef = primitive.targetId || primitive.controlBranchId || '';
        const gain = primitive.gain;
        if (targetRef && branchCurrents[targetRef] !== undefined) {
          branchCurrents[primitive.id] = gain * (branchCurrents[targetRef] ?? 0);
        } else {
          const targetResistor = resolveTargetResistor(targetRef, primitive.controlPositive, primitive.controlNegative, primitive.targetResistance);
          if (targetResistor) {
            const iTarget = (voltage(solution, targetResistor.positive) - voltage(solution, targetResistor.negative)) / targetResistor.resistance;
            branchCurrents[primitive.id] = gain * iTarget;
          }
        }
      }
    }
    if (commitHistory) { assertNoDeadShort(primitives, branchCurrents); this.time += dt; }
    return { time: this.time, converged: true, nodeVoltages, branchCurrents, terminalVoltages: {} };
  }
}
