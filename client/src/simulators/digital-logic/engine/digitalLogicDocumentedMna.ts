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
  | { kind: 'vccs'; id: string; positive: string; negative: string; controlPositive: string; controlNegative: string; transconductance: number }
  | { kind: 'vcvs'; id: string; positive: string; negative: string; controlPositive: string; controlNegative: string; gain: number }
  | { kind: 'cccs'; id: string; positive: string; negative: string; controlBranchId: string; gain: number }
  | { kind: 'ccvs'; id: string; positive: string; negative: string; controlBranchId: string; transresistance: number }
  | { kind: 'resistive-switch'; id: string; positive: string; negative: string; closed: boolean };

export interface TabDOperatingPoint {
  time: number;
  converged: true;
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  terminalVoltages: Record<string, number>;
}

export class TabDMnaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TabDMnaError';
  }
}

interface BranchUnknown {
  id: string;
  primitive: Extract<TabDPrimitive, { kind: 'voltage' | 'inductor' | 'vcvs' | 'ccvs' }>;
}

interface LuFactorization {
  lu: number[][];
  pivot: number[];
}

const MIN_DT = 1e-12;
const RESISTIVE_SWITCH_ON = 1e-15;
const RESISTIVE_SWITCH_OFF = 1e15;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function createMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

/** LU factorization with partial pivoting; throws instead of silently accepting a singular system. */
function factorLu(matrix: number[][]): LuFactorization {
  const size = matrix.length;
  const lu = matrix.map(row => [...row]);
  const pivot = Array.from({ length: size }, (_, index) => index);
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(lu[row][column]) > Math.abs(lu[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(lu[pivotRow][column]) < 1e-18) throw new TabDMnaError('Singular MNA matrix: define a reference and remove conflicting ideal constraints.');
    if (pivotRow !== column) {
      [lu[column], lu[pivotRow]] = [lu[pivotRow], lu[column]];
      [pivot[column], pivot[pivotRow]] = [pivot[pivotRow], pivot[column]];
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

  getTime() {
    return this.time;
  }

  solve(primitives: TabDPrimitive[], elapsedSeconds = 1e-3, commitHistory = true): TabDOperatingPoint {
    const dt = Math.max(MIN_DT, finite(elapsedSeconds, 1e-3));
    const nodeNames = new Set<string>();
    for (const primitive of primitives) {
      nodeNames.add(primitive.positive);
      nodeNames.add(primitive.negative);
      if ('controlPositive' in primitive) {
        nodeNames.add(primitive.controlPositive);
        nodeNames.add(primitive.controlNegative);
      }
    }
    if (nodeNames.size && !nodeNames.has('0')) throw new TabDMnaError('Tab D documented MNA requires an explicit ground reference named 0.');
    const orderedNodes = Array.from(nodeNames).filter(node => node !== '0').sort();
    const nodeIndex = new Map(orderedNodes.map((node, index) => [node, index]));
    const branchPrimitives = primitives.filter((primitive): primitive is BranchUnknown['primitive'] => ['voltage', 'inductor', 'vcvs', 'ccvs'].includes(primitive.kind));
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

    for (const primitive of primitives) {
      switch (primitive.kind) {
        case 'resistor':
          stampConductance(primitive.positive, primitive.negative, 1 / Math.max(1e-15, Math.abs(primitive.resistance)));
          break;
        case 'resistive-switch': {
          const resistance = primitive.closed ? RESISTIVE_SWITCH_ON : RESISTIVE_SWITCH_OFF;
          stampConductance(primitive.positive, primitive.negative, 1 / resistance);
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
          if (p >= 0 && cp >= 0) matrix[p][cp] += primitive.transconductance;
          if (p >= 0 && cn >= 0) matrix[p][cn] -= primitive.transconductance;
          if (n >= 0 && cp >= 0) matrix[n][cp] -= primitive.transconductance;
          if (n >= 0 && cn >= 0) matrix[n][cn] += primitive.transconductance;
          break;
        }
        case 'cccs': {
          const control = branchIndex.get(primitive.controlBranchId);
          if (control === undefined) throw new TabDMnaError(`CCCS ${primitive.id} requires an existing current-control branch.`);
          const p = node(primitive.positive); const n = node(primitive.negative);
          if (p >= 0) matrix[p][control] += primitive.gain;
          if (n >= 0) matrix[n][control] -= primitive.gain;
          break;
        }
        case 'voltage': {
          const column = branchIndex.get(primitive.id)!;
          stampBranchConnection(primitive.positive, primitive.negative, column);
          rhs[column] = primitive.voltage;
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
        case 'ccvs': {
          const column = branchIndex.get(primitive.id)!;
          const control = branchIndex.get(primitive.controlBranchId);
          if (control === undefined) throw new TabDMnaError(`CCVS ${primitive.id} requires an existing current-control branch.`);
          stampBranchConnection(primitive.positive, primitive.negative, column);
          matrix[column][control] -= primitive.transresistance;
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
    const nodeVoltages: Record<string, number> = { '0': 0 };
    for (const [name, index] of Array.from(nodeIndex.entries())) nodeVoltages[name] = solution[index];
    const branchCurrents: Record<string, number> = {};
    for (const [id, index] of Array.from(branchIndex.entries())) branchCurrents[id] = solution[index];
    for (const primitive of primitives) {
      if (primitive.kind === 'resistor') branchCurrents[primitive.id] = (voltage(solution, primitive.positive) - voltage(solution, primitive.negative)) / Math.max(1e-15, Math.abs(primitive.resistance));
      if (primitive.kind === 'resistive-switch') {
        const resistance = primitive.closed ? RESISTIVE_SWITCH_ON : RESISTIVE_SWITCH_OFF;
        branchCurrents[primitive.id] = (voltage(solution, primitive.positive) - voltage(solution, primitive.negative)) / resistance;
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
      if (primitive.kind === 'vccs') branchCurrents[primitive.id] = primitive.transconductance * (voltage(solution, primitive.controlPositive) - voltage(solution, primitive.controlNegative));
      if (primitive.kind === 'cccs') branchCurrents[primitive.id] = primitive.gain * (branchCurrents[primitive.controlBranchId] ?? 0);
    }
    if (commitHistory) this.time += dt;
    return { time: this.time, converged: true, nodeVoltages, branchCurrents, terminalVoltages: {} };
  }
}
