import type { MNAElement } from './mnaSolver';
import { nonReferenceNodes } from './analysisTypes';

export interface ReducedNodalMatrix {
  knownNodes: Map<string, number>;
  unknownNodes: string[];
  eliminatedNodes: string[];
  conductance: number[][];
  rhs: number[];
  residualInfinity: number;
}

export interface GroundedSourceResistorBranch {
  simpleNode: string;
  primaryNode: string;
  resistor: Extract<MNAElement, { type: 'resistor' }>;
  source: Extract<MNAElement, { type: 'voltage' }>;
  /** V_simple = V_primary + simpleOffset. */
  simpleOffset: number;
}

const EPSILON = 1e-12;

/** Polarity-aware grounded-source extraction: V(+) - V(-) = source voltage. */
export function extractPolarityAwareKnownNodes(elements: MNAElement[]): Map<string, number> {
  const knownNodes = new Map<string, number>();
  for (const element of elements) {
    if (element.type !== 'voltage') continue;
    if (element.positive === '0' && element.negative !== '0') knownNodes.set(element.negative, -element.voltage);
    if (element.negative === '0' && element.positive !== '0') knownNodes.set(element.positive, element.voltage);
  }
  return knownNodes;
}

/** Counts physical analysis branches incident on a node, not matrix rows. */
export function academicBranchDegree(elements: MNAElement[], node: string): number {
  return elements.reduce((degree, element) => {
    if (element.type === 'current') return degree + Number(element.from === node) + Number(element.to === node);
    if ('positive' in element && 'negative' in element) return degree + Number(element.positive === node) + Number(element.negative === node);
    return degree;
  }, 0);
}

/** Returns only unknown nodes that satisfy the strict Degree >= 3 essential-node law. */
export function filterEssentialNodes(elements: MNAElement[], knownNodes: Map<string, number>): string[] {
  return nonReferenceNodes(elements).filter((node) => !knownNodes.has(node) && academicBranchDegree(elements, node) >= 3);
}

/** Reindexes UI-only N_i/V_i names after filtering; internal graph IDs never affect the sequence. */
export function reindexUINodes(nodes: string[]): Map<string, number> {
  return new Map(nodes.map((node, index) => [node, index + 1]));
}

export const academicDisplayNodes = filterEssentialNodes;

/**
 * Detects a degree-two resistor-to-ground / independent-voltage-source series
 * leg. The returned offset is algebraic and is shared by symbolic KCL and RHS
 * stamping: V_simple = V_primary + simpleOffset.
 */
export function detectGroundedSourceResistorBranches(elements: MNAElement[]): GroundedSourceResistorBranch[] {
  const branches: GroundedSourceResistorBranch[] = [];
  for (const simpleNode of nonReferenceNodes(elements)) {
    if (academicBranchDegree(elements, simpleNode) !== 2) continue;
    const resistor = elements.find((element): element is Extract<MNAElement, { type: 'resistor' }> => element.type === 'resistor' && ((element.positive === simpleNode && element.negative === '0') || (element.negative === simpleNode && element.positive === '0')));
    const source = elements.find((element): element is Extract<MNAElement, { type: 'voltage' }> => element.type === 'voltage' && ((element.positive === simpleNode && element.negative !== '0') || (element.negative === simpleNode && element.positive !== '0')));
    if (!resistor || !source) continue;
    const primaryNode = source.positive === simpleNode ? source.negative : source.positive;
    if (primaryNode === '0') continue;
    const simpleOffset = source.positive === simpleNode ? source.voltage : -source.voltage;
    branches.push({ simpleNode, primaryNode, resistor, source, simpleOffset });
  }
  return branches;
}

function solveDenseSystem(matrix: number[][], rhs: number[]): number[] {
  const size = matrix.length;
  if (!size) return [];
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    if (Math.abs(augmented[best][pivot]) < EPSILON) throw new Error('Pedagogical node reduction encountered an unresolved simple-node chain.');
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column <= size; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  return augmented.map((row) => row[size]);
}

/**
 * Builds the textbook nodal system [G][V_unknown]=[z] for the academic trace.
 * It stamps source-resistor series branches directly as G·V_primary=-offset/R,
 * exactly matching the algebra rendered in the KCL derivation.
 */
export function generateReducedNodalMatrix(elements: MNAElement[]): ReducedNodalMatrix {
  const knownNodes = extractPolarityAwareKnownNodes(elements);
  const sourceResistorBranches = detectGroundedSourceResistorBranches(elements);
  const sourceSeriesSimpleNodes = new Set(sourceResistorBranches.map((branch) => branch.simpleNode));
  const allUnknownNodes = nonReferenceNodes(elements).filter((node) => !knownNodes.has(node) && !sourceSeriesSimpleNodes.has(node));
  const unknownNodes = filterEssentialNodes(elements, knownNodes);
  const eliminatedNodes = [...Array.from(sourceSeriesSimpleNodes), ...allUnknownNodes.filter((node) => !unknownNodes.includes(node))];
  const index = new Map(allUnknownNodes.map((node, position) => [node, position]));
  const fullConductance = Array.from({ length: allUnknownNodes.length }, () => Array<number>(allUnknownNodes.length).fill(0));
  const fullRhs = Array<number>(allUnknownNodes.length).fill(0);
  const addToUnknown = (node: string, value: number) => {
    const position = index.get(node);
    if (position !== undefined) fullRhs[position] += value;
  };
  for (const element of elements) {
    if (element.type === 'resistor') {
      if (sourceResistorBranches.some((branch) => branch.resistor.id === element.id) || Math.abs(element.resistance) < EPSILON) continue;
      const conductanceValue = 1 / element.resistance;
      const endpoints: Array<[string, string]> = [[element.positive, element.negative], [element.negative, element.positive]];
      for (const [inside, outside] of endpoints) {
        const row = index.get(inside);
        if (row === undefined) continue;
        fullConductance[row][row] += conductanceValue;
        const column = index.get(outside);
        if (column !== undefined) fullConductance[row][column] -= conductanceValue;
        else if (outside !== '0' && knownNodes.has(outside)) fullRhs[row] += conductanceValue * knownNodes.get(outside)!;
      }
      continue;
    }
    if (element.type === 'current') {
      // MNA convention: positive source current leaves `from` and enters `to`.
      addToUnknown(element.from, -element.current);
      addToUnknown(element.to, element.current);
    }
  }
  for (const branch of sourceResistorBranches) {
    const row = index.get(branch.primaryNode);
    if (row === undefined || Math.abs(branch.resistor.resistance) < EPSILON) continue;
    const conductanceValue = 1 / branch.resistor.resistance;
    fullConductance[row][row] += conductanceValue;
    // (V_primary + offset)/R = 0  =>  G·V_primary = -offset/R.
    fullRhs[row] -= conductanceValue * branch.simpleOffset;
  }
  const primary = unknownNodes.map((node) => index.get(node)!);
  const simple = allUnknownNodes.filter((node) => !unknownNodes.includes(node)).map((node) => index.get(node)!);
  const conductance = primary.map((row) => primary.map((column) => fullConductance[row][column]));
  const rhs = primary.map((row) => fullRhs[row]);
  if (simple.length) {
    const simpleMatrix = simple.map((row) => simple.map((column) => fullConductance[row][column]));
    for (let column = 0; column < primary.length; column += 1) {
      const coupling = simple.map((row) => fullConductance[row][primary[column]]);
      const solved = solveDenseSystem(simpleMatrix, coupling);
      for (let row = 0; row < primary.length; row += 1) conductance[row][column] -= simple.map((simpleRow, i) => fullConductance[primary[row]][simpleRow] * solved[i]).reduce((sum, value) => sum + value, 0);
    }
    const solvedRhs = solveDenseSystem(simpleMatrix, simple.map((row) => fullRhs[row]));
    for (let row = 0; row < primary.length; row += 1) rhs[row] -= simple.map((simpleRow, i) => fullConductance[primary[row]][simpleRow] * solvedRhs[i]).reduce((sum, value) => sum + value, 0);
  }
  const reducedSolution = solveDenseSystem(conductance, rhs);
  const residualInfinity = conductance.reduce((maximum, row, rowIndex) => Math.max(maximum, Math.abs(row.reduce((sum, value, column) => sum + value * (reducedSolution[column] ?? 0), 0) - (rhs[rowIndex] ?? 0))), 0);
  return { knownNodes, unknownNodes, eliminatedNodes, conductance, rhs, residualInfinity };
}
