export interface MNAIdentity {
  id: string;
  name?: string;
  label?: string;
  /** Mirrors `CircuitComponent.state.isBurned`; forces a 1 GΩ open-circuit stamp regardless of type. */
  isBurned?: boolean;
}
export type MNAElement =
  | (MNAIdentity & { type: 'resistor'; positive: string; negative: string; resistance: number })
  | (MNAIdentity & { type: 'current'; from: string; to: string; current: number })
  | (MNAIdentity & { type: 'voltage'; positive: string; negative: string; voltage: number })
  | (MNAIdentity & { type: 'vccs'; positive: string; negative: string; controlPositive: string; controlNegative: string; transconductance?: number; gain?: number; targetId?: string; controlSourceId?: string })
  | (MNAIdentity & { type: 'vcvs'; positive: string; negative: string; controlPositive: string; controlNegative: string; gain: number; targetId?: string; controlSourceId?: string })
  | (MNAIdentity & { type: 'cccs'; positive: string; negative: string; controlSourceId?: string; targetId?: string; gain: number; controlPositive?: string; controlNegative?: string; targetResistance?: number })
  | (MNAIdentity & { type: 'ccvs'; positive: string; negative: string; controlSourceId?: string; targetId?: string; transresistance?: number; gain?: number; controlPositive?: string; controlNegative?: string; targetResistance?: number })
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

const PIVOT_EPSILON = 1e-12;
const VALUE_EPSILON = 1e-9;
/** Stand-in resistance for a burned-out component: physically an open circuit. */
export const BURNED_OUT_RESISTANCE = 1e9;

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
    // A burned voltage branch no longer imposes its nominal voltage — it is stamped as a plain
    // resistor below — so it must not reserve a branch-current row/column.
    const voltageBranches = this.elements.filter(element => isVoltageBranch(element) && !element.isBurned);
    const branchIndex = new Map<string, number>();
    voltageBranches.forEach((element, index) => {
      branchIndex.set(element.id, nodeOrder.length + index);
      if (element.label) branchIndex.set(element.label, nodeOrder.length + index);
    });
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
      // [G][V]=[I] is written as sum(I_leaving)=0, so the known [I] vector takes the source with a
      // topological sign: it LEAVES `from` (rhs -= I) and ENTERS `to` (rhs += I). Reference-node
      // rows are dropped by addRhs. Callers must pass `from`/`to` as the internal flow direction —
      // the schematic's arrow pin is the `to` end (see compileDcTopology).
      const value = finite(current, 'current');
      addRhs(from, -value); addRhs(to, value);
    };
    const stampVoltageBranch = (positive: number, negative: number, branch: number, voltage: number) => {
      add(positive, branch, 1); add(negative, branch, -1);
      add(branch, positive, 1); add(branch, negative, -1);
      addRhs(branch, finite(voltage, 'voltage'));
    };
    const resolveTargetResistor = (targetRef?: string, fallbackCp?: string, fallbackCn?: string, fallbackR?: number) => {
      if (targetRef) {
        const found = this.elements.find(e => (e.id === targetRef || e.label === targetRef) && e.type === 'resistor') as Extract<MNAElement, { type: 'resistor' }> | undefined;
        if (found) {
          const r = finite(found.resistance, 'target resistor resistance');
          if (Math.abs(r) < VALUE_EPSILON) throw new MNAError('INVALID_CONTROL', `Invalid Circuit: target resistor ${targetRef} has zero resistance`);
          return { positive: found.positive, negative: found.negative, resistance: r };
        }
      }
      if (fallbackCp && fallbackCn && fallbackR !== undefined) {
        const r = finite(fallbackR, 'target resistor resistance');
        if (Math.abs(r) < VALUE_EPSILON) throw new MNAError('INVALID_CONTROL', `Invalid Circuit: target resistor has zero resistance`);
        return { positive: fallbackCp, negative: fallbackCn, resistance: r };
      }
      return null;
    };

    for (const element of this.elements) {
      if (element.isBurned) {
        // Blown: exactly a 1 GΩ resistor between its own two terminals, regardless of what it
        // would normally stamp (resistor, source, or dependent-source branch).
        const [positiveId, negativeId] = element.type === 'current' ? [element.from, element.to] : [element.positive, element.negative];
        stampResistor(node(positiveId), node(negativeId), BURNED_OUT_RESISTANCE);
        continue;
      }
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
          let cpId = element.controlPositive;
          let cnId = element.controlNegative;
          if ((!cpId || !cnId) && (element.targetId || (element as any).controlSourceId)) {
            const tr = resolveTargetResistor(element.targetId || (element as any).controlSourceId);
            if (tr) { cpId = tr.positive; cnId = tr.negative; }
          }
          const cp = node(cpId);
          const cn = node(cnId);
          const k = finite(element.gain ?? element.transconductance ?? 0, 'VCCS gain');
          add(positive, cp, k);
          add(positive, cn, -k);
          add(negative, cp, -k);
          add(negative, cn, k);
          break;
        }
        case 'vcvs': {
          const branch = branchIndex.get(element.id)!;
          stampVoltageBranch(positive, negative, branch, 0);
          let cpId = element.controlPositive;
          let cnId = element.controlNegative;
          if ((!cpId || !cnId) && (element.targetId || (element as any).controlSourceId)) {
            const tr = resolveTargetResistor(element.targetId || (element as any).controlSourceId);
            if (tr) { cpId = tr.positive; cnId = tr.negative; }
          }
          const k = finite(element.gain, 'VCVS gain');
          add(branch, node(cpId), -k);
          add(branch, node(cnId), k);
          break;
        }
        case 'cccs': {
          const k = finite(element.gain, 'CCCS gain');
          const targetRef = element.targetId || element.controlSourceId || '';
          const targetBranch = targetRef ? branchIndex.get(targetRef) : undefined;
          if (targetBranch !== undefined) {
            // Target is an auxiliary branch current variable
            add(positive, targetBranch, k);
            add(negative, targetBranch, -k);
          } else {
            // Target is a resistor
            const targetResistor = resolveTargetResistor(targetRef, element.controlPositive, element.controlNegative, element.targetResistance);
            if (!targetResistor) {
              throw new MNAError('INVALID_CONTROL', `Invalid Circuit: CCCS ${element.id} targets invalid component ${targetRef || 'unknown'}`);
            }
            const geq = k / targetResistor.resistance;
            const tp = node(targetResistor.positive);
            const tn = node(targetResistor.negative);
            add(positive, tp, geq);
            add(positive, tn, -geq);
            add(negative, tp, -geq);
            add(negative, tn, geq);
          }
          break;
        }
        case 'ccvs': {
          const branch = branchIndex.get(element.id)!;
          stampVoltageBranch(positive, negative, branch, 0);
          const k = finite(element.gain ?? element.transresistance ?? 0, 'CCVS gain');
          const targetRef = element.targetId || element.controlSourceId || '';
          const targetBranch = targetRef ? branchIndex.get(targetRef) : undefined;
          if (targetBranch !== undefined) {
            // Target is an auxiliary branch current variable
            add(branch, targetBranch, -k);
          } else {
            // Target is a resistor
            const targetResistor = resolveTargetResistor(targetRef, element.controlPositive, element.controlNegative, element.targetResistance);
            if (!targetResistor) {
              throw new MNAError('INVALID_CONTROL', `Invalid Circuit: CCVS ${element.id} targets invalid component ${targetRef || 'unknown'}`);
            }
            const mueq = k / targetResistor.resistance;
            const tp = node(targetResistor.positive);
            const tn = node(targetResistor.negative);
            add(branch, tp, -mueq);
            add(branch, tn, mueq);
          }
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
    for (const element of this.elements) {
      if (element.isBurned) {
        const [positiveId, negativeId] = element.type === 'current' ? [element.from, element.to] : [element.positive, element.negative];
        const vp = nodeVoltages[positiveId] ?? 0;
        const vn = nodeVoltages[negativeId] ?? 0;
        branchCurrents[element.id] = (vp - vn) / BURNED_OUT_RESISTANCE;
      } else if (element.type === 'resistor') {
        const vp = nodeVoltages[element.positive] ?? 0;
        const vn = nodeVoltages[element.negative] ?? 0;
        branchCurrents[element.id] = (vp - vn) / element.resistance;
      } else if (element.type === 'current') {
        branchCurrents[element.id] = element.current;
      } else if (element.type === 'vccs') {
        const cp = nodeVoltages[element.controlPositive] ?? 0;
        const cn = nodeVoltages[element.controlNegative] ?? 0;
        const k = element.gain ?? element.transconductance ?? 0;
        branchCurrents[element.id] = k * (cp - cn);
      } else if (element.type === 'cccs') {
        const targetRef = element.targetId || element.controlSourceId || '';
        const k = element.gain ?? 1;
        if (targetRef && branchCurrents[targetRef] !== undefined) {
          branchCurrents[element.id] = k * branchCurrents[targetRef];
        } else {
          const targetResistor = resolveTargetResistor(targetRef, element.controlPositive, element.controlNegative, element.targetResistance);
          if (targetResistor) {
            const vp = nodeVoltages[targetResistor.positive] ?? 0;
            const vn = nodeVoltages[targetResistor.negative] ?? 0;
            branchCurrents[element.id] = k * (vp - vn) / targetResistor.resistance;
          }
        }
      }
    }
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
    const add = (id?: string) => { if (id && id !== '0') nodes.add(id); };
    for (const element of this.elements) {
      switch (element.type) {
        case 'current': add(element.from); add(element.to); break;
        case 'vccs':
        case 'vcvs':
          add(element.positive); add(element.negative);
          if (element.controlPositive) add(element.controlPositive);
          if (element.controlNegative) add(element.controlNegative);
          break;
        case 'cccs':
        case 'ccvs': {
          add(element.positive); add(element.negative);
          if (element.controlPositive) add(element.controlPositive);
          if (element.controlNegative) add(element.controlNegative);
          const targetRef = element.targetId || element.controlSourceId;
          if (targetRef) {
            const targetResistor = this.elements.find(e => (e.id === targetRef || e.label === targetRef) && e.type === 'resistor') as Extract<MNAElement, { type: 'resistor' }> | undefined;
            if (targetResistor) {
              add(targetResistor.positive);
              add(targetResistor.negative);
            }
          }
          break;
        }
        default: add(element.positive); add(element.negative); break;
      }
    }
    const hasReference = this.elements.some(element => ('positive' in element && element.positive === '0') || ('negative' in element && element.negative === '0') || (element.type === 'current' && (element.from === '0' || element.to === '0')));
    if (!hasReference) throw new MNAError('NO_REFERENCE', 'Invalid Circuit: a Ground reference node (0) is required');
    return Array.from(nodes).sort();
  }

  private assertIndependentVoltageConsistency() {
    const known = new Map<string, number>();
    for (const element of this.elements.filter((item): item is Extract<MNAElement, { type: 'voltage' }> => item.type === 'voltage' && !item.isBurned)) {
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
      if (Math.abs(factor) < PIVOT_EPSILON) continue;
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map(row => row[size]);
}
