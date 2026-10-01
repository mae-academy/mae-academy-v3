type MNAIdentity = { id: string; label?: string };
export type MNAElement =
  | (MNAIdentity & { type: 'resistor'; positive: string; negative: string; resistance: number })
  | (MNAIdentity & { type: 'current'; from: string; to: string; current: number })
  | (MNAIdentity & { type: 'voltage'; positive: string; negative: string; voltage: number })
  | (MNAIdentity & { type: 'vccs'; positive: string; negative: string; controlPositive: string; controlNegative: string; transconductance: number })
  | (MNAIdentity & { type: 'vcvs'; positive: string; negative: string; controlPositive: string; controlNegative: string; gain: number })
  | (MNAIdentity & { type: 'cccs'; positive: string; negative: string; controlSourceId: string; gain: number })
  | (MNAIdentity & { type: 'ccvs'; positive: string; negative: string; controlSourceId: string; transresistance: number })
  | (MNAIdentity & { type: 'current-sense'; positive: string; negative: string });

export interface MNAResult {
  nodeVoltages: Record<string, number>;
  voltageSourceCurrents: Record<string, number>;
  branchCurrents: Record<string, number>;
  matrix?: number[][];
  rhs?: number[];
  nodeOrder?: string[];
  voltageBranchOrder?: string[];
  residualInfinity?: number;
}

export class MNAError extends Error {
  constructor(readonly code: 'NO_REFERENCE' | 'CONFLICTING_VOLTAGE_SOURCES' | 'SINGULAR_MATRIX' | 'INVALID_ELEMENT' | 'INVALID_CONTROL' | 'RESIDUAL_VIOLATION', message: string) {
    super(message);
    this.name = 'MNAError';
  }
}

/** Rejects only a structurally singular matrix; node conductances down to 1e-18 S (R ≤ 1e18 Ω) are legitimate. */
const PIVOT_EPSILON = 1e-18;
const VALUE_EPSILON = 1e-9;

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new MNAError('INVALID_ELEMENT', `Invalid Circuit: ${label} must be finite`);
  return value;
}

function isVoltageBranch(element: MNAElement): element is Extract<MNAElement, { type: 'voltage' | 'vcvs' | 'ccvs' | 'current-sense' }> {
  return element.type === 'voltage' || element.type === 'vcvs' || element.type === 'ccvs' || element.type === 'current-sense';
}

/**
 * Strict DC Modified Nodal Analysis solver.
 *
 * It constructs [A][x] = [z] with node voltages followed by currents through
 * voltage-defined branches. Node "0" is the sole global reference. Currents
 * are positive from an element's positive/from terminal to its negative/to terminal.
 */
export class MNASolver {
  constructor(private readonly elements: MNAElement[]) {}

  solve(): MNAResult {
    this.assertIndependentVoltageConsistency();
    const nodeOrder = this.collectNonReferenceNodes();
    const nodeIndex = new Map(nodeOrder.map((node, index) => [node, index]));
    const voltageBranches = this.elements.filter(isVoltageBranch);
    const branchIndex = new Map(voltageBranches.map((element, index) => [element.id, nodeOrder.length + index]));
    const size = nodeOrder.length + voltageBranches.length;
    if (!size) return { nodeVoltages: { '0': 0 }, voltageSourceCurrents: {}, branchCurrents: {}, matrix: [], rhs: [], nodeOrder: [], voltageBranchOrder: [] };

    const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
    const rhs = Array<number>(size).fill(0);
    const node = (id: string) => id === '0' ? -1 : nodeIndex.get(id) ?? (() => { throw new MNAError('INVALID_ELEMENT', `Invalid Circuit: unknown node ${id}`); })();
    const add = (row: number, column: number, value: number) => { if (row >= 0 && column >= 0) matrix[row][column] += value; };
    const addRhs = (row: number, value: number) => { if (row >= 0) rhs[row] += value; };

    const stampResistor = (positive: number, negative: number, resistance: number) => {
      const r = finite(resistance, 'resistance');
      if (Math.abs(r) < VALUE_EPSILON) throw new MNAError('INVALID_ELEMENT', 'Invalid Circuit: zero-ohm resistor requires an explicit 0 V current-sense branch');
      const conductance = 1 / r;
      add(positive, positive, conductance); add(negative, negative, conductance);
      add(positive, negative, -conductance); add(negative, positive, -conductance);
    };
    const stampCurrent = (from: number, to: number, current: number) => {
      // Positive source current enters `to` and leaves `from`.
      const value = finite(current, 'current');
      addRhs(from, -value); addRhs(to, value);
    };
    const stampVoltageBranch = (positive: number, negative: number, branch: number, voltage: number) => {
      add(positive, branch, 1); add(negative, branch, -1);
      add(branch, positive, 1); add(branch, negative, -1);
      addRhs(branch, finite(voltage, 'voltage'));
    };
    const controlBranch = (id: string) => {
      const found = branchIndex.get(id);
      if (found === undefined) throw new MNAError('INVALID_CONTROL', `Invalid Circuit: controlling current ${id} requires a voltage source or 0 V current-sense branch`);
      return found;
    };

    for (const element of this.elements) {
      if (element.type === 'current') {
        stampCurrent(node(element.from), node(element.to), element.current);
        continue;
      }
      const positive = node(element.positive);
      const negative = node(element.negative);
      switch (element.type) {
        case 'resistor': stampResistor(positive, negative, element.resistance); break;
        case 'voltage': stampVoltageBranch(positive, negative, branchIndex.get(element.id)!, element.voltage); break;
        case 'current-sense': stampVoltageBranch(positive, negative, branchIndex.get(element.id)!, 0); break;
        case 'vccs': {
          const cp = node(element.controlPositive); const cn = node(element.controlNegative); const gain = finite(element.transconductance, 'transconductance');
          add(positive, cp, gain); add(positive, cn, -gain); add(negative, cp, -gain); add(negative, cn, gain);
          break;
        }
        case 'vcvs': {
          const branch = branchIndex.get(element.id)!;
          stampVoltageBranch(positive, negative, branch, 0);
          const gain = finite(element.gain, 'VCVS gain');
          add(branch, node(element.controlPositive), -gain); add(branch, node(element.controlNegative), gain);
          break;
        }
        case 'cccs': {
          const gain = finite(element.gain, 'CCCS gain'); const control = controlBranch(element.controlSourceId);
          add(positive, control, gain); add(negative, control, -gain);
          break;
        }
        case 'ccvs': {
          const branch = branchIndex.get(element.id)!;
          stampVoltageBranch(positive, negative, branch, 0);
          add(branch, controlBranch(element.controlSourceId), -finite(element.transresistance, 'CCVS transresistance'));
          break;
        }
      }
    }

    const solution = gaussianSolve(matrix, rhs);
    const residualInfinity = matrixResidualInfinity(matrix, solution, rhs);
    if (residualInfinity > 1e-9) throw new MNAError('RESIDUAL_VIOLATION', `Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=${residualInfinity.toExponential(3)})`);
    const nodeVoltages: Record<string, number> = { '0': 0 };
    nodeOrder.forEach((id, index) => { nodeVoltages[id] = solution[index]; });
    const branchCurrents: Record<string, number> = {};
    voltageBranches.forEach((element, index) => { branchCurrents[element.id] = solution[nodeOrder.length + index]; });
    const voltageSourceCurrents = Object.fromEntries(voltageBranches.filter(element => element.type === 'voltage' || element.type === 'vcvs' || element.type === 'ccvs').map(element => [element.id, branchCurrents[element.id]]));
    return { nodeVoltages, voltageSourceCurrents, branchCurrents, matrix, rhs, nodeOrder, voltageBranchOrder: voltageBranches.map((element) => element.id), residualInfinity };
  }

  equivalentResistance(positive: string, negative: string): number {
    const testId = '__mna_test_current__';
    const result = new MNASolver([...this.elements, { type: 'current', id: testId, from: positive, to: negative, current: 1 }]).solve();
    return Math.abs((result.nodeVoltages[positive] ?? 0) - (result.nodeVoltages[negative] ?? 0));
  }

  private collectNonReferenceNodes(): string[] {
    const nodes = new Set<string>();
    const add = (id: string) => { if (id !== '0') nodes.add(id); };
    for (const element of this.elements) {
      switch (element.type) {
        case 'current': add(element.from); add(element.to); break;
        case 'vccs': add(element.positive); add(element.negative); add(element.controlPositive); add(element.controlNegative); break;
        case 'vcvs': add(element.positive); add(element.negative); add(element.controlPositive); add(element.controlNegative); break;
        default: add(element.positive); add(element.negative); break;
      }
    }
    const hasReference = this.elements.some(element => ('positive' in element && element.positive === '0') || ('negative' in element && element.negative === '0') || (element.type === 'current' && (element.from === '0' || element.to === '0')));
    if (!hasReference) throw new MNAError('NO_REFERENCE', 'Invalid Circuit: a Ground reference node (0) is required');
    return Array.from(nodes).sort();
  }

  private assertIndependentVoltageConsistency() {
    const known = new Map<string, number>();
    for (const element of this.elements.filter((item): item is Extract<MNAElement, { type: 'voltage' }> => item.type === 'voltage')) {
      const [left, right] = [element.positive, element.negative].sort();
      const orientedValue = element.positive === left ? element.voltage : -element.voltage;
      const previous = known.get(`${left}|${right}`);
      if (previous !== undefined && Math.abs(previous - orientedValue) > VALUE_EPSILON) throw new MNAError('CONFLICTING_VOLTAGE_SOURCES', 'Invalid Circuit Layout: Conflicting Voltage Sources');
      known.set(`${left}|${right}`, orientedValue);
    }
  }
}

/** Infinity norm of the post-solve residual certificate r=A·x-z. */
export function matrixResidualInfinity(matrix: number[][], solution: number[], rhs: number[]): number {
  return matrix.reduce((maximum, row, index) => Math.max(maximum, Math.abs(row.reduce((sum, value, column) => sum + value * (solution[column] ?? 0), 0) - (rhs[index] ?? 0))), 0);
}

function gaussianSolve(matrix: number[][], rhs: number[]): number[] {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < PIVOT_EPSILON) throw new MNAError('SINGULAR_MATRIX', 'Invalid Circuit: Singular Matrix');
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map(row => row[size]);
}
