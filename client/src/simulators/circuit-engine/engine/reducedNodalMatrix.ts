import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { nonReferenceNodes } from '@/simulators/circuit-engine/models/analysisTypes';

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

export interface FloatingSupernode {
  sourceId: string;
  positiveNode: string;
  negativeNode: string;
  element: Extract<MNAElement, { type: 'voltage' | 'vcvs' | 'ccvs' }>;
}

export interface CompoundSupernode {
  id: string;
  nodes: string[];
  sources: FloatingSupernode[];
}

export interface TargetResistorRef {
  positive: string;
  negative: string;
  resistance: number;
  resistor?: Extract<MNAElement, { type: 'resistor' }>;
  label: string;
}

export function resolveTargetResistor(
  elements: MNAElement[],
  element: Extract<MNAElement, { type: 'cccs' | 'ccvs' | 'vccs' | 'vcvs' }>
): TargetResistorRef | null {
  const targetRef = ('targetId' in element ? element.targetId : undefined) || ('controlSourceId' in element ? element.controlSourceId : undefined) || '';
  if (targetRef) {
    const found = elements.find((e) => (e.id === targetRef || e.label === targetRef) && e.type === 'resistor') as Extract<MNAElement, { type: 'resistor' }> | undefined;
    if (found && Math.abs(found.resistance) > 1e-12) {
      return { positive: found.positive, negative: found.negative, resistance: found.resistance, resistor: found, label: found.label || found.id };
    }
  }
  if ('controlPositive' in element && 'controlNegative' in element && element.controlPositive && element.controlNegative) {
    const cp = element.controlPositive;
    const cn = element.controlNegative;
    const found = elements.find((e) => e.type === 'resistor' && ((e.positive === cp && e.negative === cn) || (e.positive === cn && e.negative === cp))) as Extract<MNAElement, { type: 'resistor' }> | undefined;
    if (found && Math.abs(found.resistance) > 1e-12) {
      return {
        positive: cp,
        negative: cn,
        resistance: found.resistance,
        resistor: found,
        label: found.label || found.id,
      };
    }
    if ('targetResistance' in element && element.targetResistance !== undefined && Math.abs(element.targetResistance) > 1e-12) {
      return { positive: cp, negative: cn, resistance: element.targetResistance, label: 'R_x' };
    }
  }
  return null;
}

export function identifyFloatingSupernodes(elements: MNAElement[]): FloatingSupernode[] {
  return elements.flatMap((element) => {
    if ((element.type !== 'voltage' && element.type !== 'vcvs' && element.type !== 'ccvs') || element.positive === '0' || element.negative === '0') return [];
    return [{ sourceId: element.id, positiveNode: element.positive, negativeNode: element.negative, element }];
  });
}

/**
 * Detects a degree-two resistor-to-ground / independent-voltage-source series
 * leg. The returned offset is algebraic and is shared by symbolic KCL and RHS
 * stamping: V_simple = V_primary + simpleOffset.
 */
export function detectGroundedSourceResistorBranches(elements: MNAElement[]): GroundedSourceResistorBranch[] {
  const branches: GroundedSourceResistorBranch[] = [];
  const floatingSources = identifyFloatingSupernodes(elements);

  const nodeFloatingCount = new Map<string, number>();
  for (const s of floatingSources) {
    nodeFloatingCount.set(s.positiveNode, (nodeFloatingCount.get(s.positiveNode) ?? 0) + 1);
    nodeFloatingCount.set(s.negativeNode, (nodeFloatingCount.get(s.negativeNode) ?? 0) + 1);
  }

  for (const simpleNode of nonReferenceNodes(elements)) {
    if (academicBranchDegree(elements, simpleNode) !== 2) continue;
    const resistor = elements.find((element): element is Extract<MNAElement, { type: 'resistor' }> => element.type === 'resistor' && ((element.positive === simpleNode && element.negative === '0') || (element.negative === simpleNode && element.positive === '0')));
    const source = elements.find((element): element is Extract<MNAElement, { type: 'voltage' }> => element.type === 'voltage' && ((element.positive === simpleNode && element.negative !== '0') || (element.negative === simpleNode && element.positive !== '0')));
    if (!resistor || !source) continue;
    const primaryNode = source.positive === simpleNode ? source.negative : source.positive;
    if (primaryNode === '0') continue;

    // If either node is involved in multiple floating sources, it is part of a compound supernode
    if ((nodeFloatingCount.get(primaryNode) ?? 0) > 1 || (nodeFloatingCount.get(simpleNode) ?? 0) > 1) continue;

    const simpleOffset = source.positive === simpleNode ? source.voltage : -source.voltage;
    branches.push({ simpleNode, primaryNode, resistor, source, simpleOffset });
  }
  return branches;
}

/** Groups connected floating voltage sources into compound supernodes using union-find. */
export function identifyCompoundSupernodes(elements: MNAElement[]): CompoundSupernode[] {
  const floatingSources = identifyFloatingSupernodes(elements);
  if (!floatingSources.length) return [];

  const seriesBranches = detectGroundedSourceResistorBranches(elements);
  const seriesNodes = new Set(seriesBranches.map((b) => b.simpleNode));
  const activeSources = floatingSources.filter(
    (s) => !seriesNodes.has(s.positiveNode) && !seriesNodes.has(s.negativeNode)
  );
  if (!activeSources.length) return [];

  const parent = new Map<string, string>();
  const find = (i: string): string => {
    const p = parent.get(i) ?? i;
    if (p === i) return i;
    const root = find(p);
    parent.set(i, root);
    return root;
  };
  const union = (i: string, j: string) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent.set(rootI, rootJ);
  };

  for (const s of activeSources) {
    union(s.positiveNode, s.negativeNode);
  }

  const groups = new Map<string, { nodes: Set<string>; sources: FloatingSupernode[] }>();
  for (const s of activeSources) {
    const root = find(s.positiveNode);
    if (!groups.has(root)) {
      groups.set(root, { nodes: new Set(), sources: [] });
    }
    const group = groups.get(root)!;
    group.nodes.add(s.positiveNode);
    group.nodes.add(s.negativeNode);
    group.sources.push(s);
  }

  return Array.from(groups.entries()).map(([root, g], index) => ({
    id: `supernode-${index + 1}`,
    nodes: Array.from(g.nodes),
    sources: g.sources,
  }));
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

/** Returns unknown nodes that satisfy Degree >= 3 or belong to a floating supernode. */
export function filterEssentialNodes(elements: MNAElement[], knownNodes: Map<string, number>): string[] {
  const compound = identifyCompoundSupernodes(elements);
  const supernodeNodes = new Set(compound.flatMap((cs) => cs.nodes));
  const seriesBranches = detectGroundedSourceResistorBranches(elements);
  const seriesNodes = new Set(seriesBranches.map((b) => b.simpleNode));

  const essential = nonReferenceNodes(elements).filter(
    (node) => !knownNodes.has(node) && !seriesNodes.has(node) && (academicBranchDegree(elements, node) >= 3 || supernodeNodes.has(node))
  );
  if (essential.length === 0) {
    return nonReferenceNodes(elements).filter((node) => !knownNodes.has(node) && !seriesNodes.has(node));
  }
  return essential;
}

/** Reindexes UI-only N_i/V_i names after filtering; internal graph IDs never affect the sequence. */
export function reindexUINodes(nodes: string[]): Map<string, number> {
  return new Map(nodes.map((node, index) => [node, index + 1]));
}

export const academicDisplayNodes = filterEssentialNodes;

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
      // Same known-vector rule as mnaSolver.stampCurrent: the source LEAVES `from` (z -= I) and
      // ENTERS `to` (z += I). addToUnknown resolves the row through `index`, so a pin that sits on
      // a collapsed supernode/eliminated node reaches the row that survives the reduction.
      addToUnknown(element.from, -element.current);
      addToUnknown(element.to, element.current);
      continue;
    }
    if (element.type === 'vccs') {
      const k = element.gain ?? element.transconductance ?? 0;
      const targetResistor = resolveTargetResistor(elements, element);
      const cp = element.controlPositive ?? targetResistor?.positive ?? '0';
      const cn = element.controlNegative ?? targetResistor?.negative ?? '0';
      const stampVCCS = (node: string, sign: number) => {
        const row = index.get(node);
        if (row === undefined) return;
        const cpCol = index.get(cp);
        const cnCol = index.get(cn);
        if (cpCol !== undefined) fullConductance[row][cpCol] += sign * k;
        else if (cp !== '0' && knownNodes.has(cp)) fullRhs[row] -= sign * k * knownNodes.get(cp)!;
        if (cnCol !== undefined) fullConductance[row][cnCol] -= sign * k;
        else if (cn !== '0' && knownNodes.has(cn)) fullRhs[row] += sign * k * knownNodes.get(cn)!;
      };
      stampVCCS(element.positive, 1);
      stampVCCS(element.negative, -1);
      continue;
    }
    if (element.type === 'cccs') {
      const k = element.gain;
      const targetResistor = resolveTargetResistor(elements, element);
      if (targetResistor) {
        const geq = k / targetResistor.resistance;
        const tp = targetResistor.positive;
        const tn = targetResistor.negative;
        const stampCCCS = (node: string, sign: number) => {
          const row = index.get(node);
          if (row === undefined) return;
          const tpCol = index.get(tp);
          const tnCol = index.get(tn);
          if (tpCol !== undefined) fullConductance[row][tpCol] += sign * geq;
          else if (tp !== '0' && knownNodes.has(tp)) fullRhs[row] -= sign * geq * knownNodes.get(tp)!;
          if (tnCol !== undefined) fullConductance[row][tnCol] -= sign * geq;
          else if (tn !== '0' && knownNodes.has(tn)) fullRhs[row] += sign * geq * knownNodes.get(tn)!;
        };
        stampCCCS(element.positive, 1);
        stampCCCS(element.negative, -1);
      }
      continue;
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

  // Stamp compound supernode merged KCL rows and auxiliary constraint rows
  const compoundSupernodes = identifyCompoundSupernodes(elements);
  for (const cs of compoundSupernodes) {
    const csNodes = cs.nodes.filter((n) => unknownNodes.includes(n));
    if (csNodes.length < 2) continue;
    const nodeRowIndices = csNodes.map((n) => unknownNodes.indexOf(n));
    const primaryRow = nodeRowIndices[0];

    // Merge KCL rows: Row_primary = sum(Row_k)
    const mergedRow = conductance[0].map((_, col) =>
      nodeRowIndices.reduce((sum, r) => sum + conductance[r][col], 0)
    );
    const mergedRhs = nodeRowIndices.reduce((sum, r) => sum + rhs[r], 0);
    conductance[primaryRow] = mergedRow;
    rhs[primaryRow] = mergedRhs;

    // Allocate auxiliary constraint rows for each source in the supernode
    for (let j = 0; j < cs.sources.length && j + 1 < nodeRowIndices.length; j += 1) {
      const source = cs.sources[j];
      const constraintRow = nodeRowIndices[j + 1];
      conductance[constraintRow] = Array(unknownNodes.length).fill(0);
      rhs[constraintRow] = 0;

      const posIdx = unknownNodes.indexOf(source.positiveNode);
      const negIdx = unknownNodes.indexOf(source.negativeNode);

      if (posIdx >= 0) conductance[constraintRow][posIdx] += 1;
      else if (knownNodes.has(source.positiveNode)) rhs[constraintRow] -= knownNodes.get(source.positiveNode)!;

      if (negIdx >= 0) conductance[constraintRow][negIdx] -= 1;
      else if (knownNodes.has(source.negativeNode)) rhs[constraintRow] += knownNodes.get(source.negativeNode)!;

      if (source.element.type === 'voltage') {
        rhs[constraintRow] += source.element.voltage;
      } else if (source.element.type === 'vcvs') {
        const gain = source.element.gain;
        const targetResistor = resolveTargetResistor(elements, source.element);
        const cp = source.element.controlPositive ?? targetResistor?.positive ?? '0';
        const cn = source.element.controlNegative ?? targetResistor?.negative ?? '0';
        const cPosIdx = unknownNodes.indexOf(cp);
        const cNegIdx = unknownNodes.indexOf(cn);
        if (cPosIdx >= 0) conductance[constraintRow][cPosIdx] -= gain;
        else if (knownNodes.has(cp)) rhs[constraintRow] += gain * knownNodes.get(cp)!;
        if (cNegIdx >= 0) conductance[constraintRow][cNegIdx] += gain;
        else if (knownNodes.has(cn)) rhs[constraintRow] -= gain * knownNodes.get(cn)!;
      } else if (source.element.type === 'ccvs') {
        const gain = source.element.gain ?? source.element.transresistance ?? 0;
        const targetResistor = resolveTargetResistor(elements, source.element);
        if (targetResistor) {
          const mueq = gain / targetResistor.resistance;
          const tpIdx = unknownNodes.indexOf(targetResistor.positive);
          const tnIdx = unknownNodes.indexOf(targetResistor.negative);
          if (tpIdx >= 0) conductance[constraintRow][tpIdx] -= mueq;
          else if (knownNodes.has(targetResistor.positive)) rhs[constraintRow] += mueq * knownNodes.get(targetResistor.positive)!;
          if (tnIdx >= 0) conductance[constraintRow][tnIdx] += mueq;
          else if (knownNodes.has(targetResistor.negative)) rhs[constraintRow] -= mueq * knownNodes.get(targetResistor.negative)!;
        }
      }
    }
  }

  const reducedSolution = solveDenseSystem(conductance, rhs);
  const residualInfinity = conductance.reduce((maximum, row, rowIndex) => Math.max(maximum, Math.abs(row.reduce((sum, value, column) => sum + value * (reducedSolution[column] ?? 0), 0) - (rhs[rowIndex] ?? 0))), 0);
  return { knownNodes, unknownNodes, eliminatedNodes, conductance, rhs, residualInfinity };
}
