import { MNASolver, matrixResidualInfinity, type MNAElement } from './mnaSolver';
import { AcademicNodalDictionary } from '../../../shared/logic/AcademicNodalDictionary';
import { nonReferenceNodes, type AnalysisTrace, type NodalNodeLabel } from '../../../shared/logic/analysisTypes';
import { latexMatrix } from '../../../shared/logic/analysisFormatting';
import { detectGroundedSourceResistorBranches, generateReducedNodalMatrix, reindexUINodes } from './reducedNodalMatrix';

export interface FloatingSupernode {
  sourceId: string;
  positiveNode: string;
  negativeNode: string;
  element: Extract<MNAElement, { type: 'voltage' | 'vcvs' }>;
}

export function identifyFloatingSupernodes(elements: MNAElement[]): FloatingSupernode[] {
  return elements.flatMap((element) => {
    if ((element.type !== 'voltage' && element.type !== 'vcvs') || element.positive === '0' || element.negative === '0') return [];
    return [{ sourceId: element.id, positiveNode: element.positive, negativeNode: element.negative, element }];
  });
}

interface SymbolicKCLContext {
  elements: MNAElement[];
  dictionary: AcademicNodalDictionary;
  uiIndices: Map<string, number>;
  knownNodes: Map<string, number>;
}

function algebraicNumber(value: number): string {
  return String(Math.round(value * 1e9) / 1e9);
}

/**
 * Creates KCL strictly from topology and declared source values. Because it has
 * no MNA solution input, solved floats cannot leak into academic derivations.
 */
export function generateKCLString(boundary: Set<string>, context: SymbolicKCLContext): string {
  const { elements, dictionary, uiIndices, knownNodes } = context;
  const seriesBranches = detectGroundedSourceResistorBranches(elements);
  const symbolicVoltage = (node: string): string => {
    if (node === '0') return '0';
    if (knownNodes.has(node)) return algebraicNumber(knownNodes.get(node)!);
    if (uiIndices.has(node)) return dictionary.coloredVoltage(node);
    const series = seriesBranches.find((branch) => branch.simpleNode === node);
    if (series) {
      const primary = symbolicVoltage(series.primaryNode);
      return `\\left(${primary}${series.simpleOffset >= 0 ? '+' : '-'}${algebraicNumber(Math.abs(series.simpleOffset))}\\right)`;
    }
    return '\\mathrm{V_{series}}';
  };
  const terms = elements.flatMap((element) => {
    if (element.type !== 'resistor') return [];
    const positiveInside = boundary.has(element.positive); const negativeInside = boundary.has(element.negative);
    if (positiveInside === negativeInside) return [];
    const inside = positiveInside ? element.positive : element.negative;
    const outside = positiveInside ? element.negative : element.positive;
    const numerator = outside === '0' ? symbolicVoltage(inside) : `${symbolicVoltage(inside)}-${symbolicVoltage(outside)}`;
    return [`\\frac{${numerator}}{${dictionary.element(element)}}`];
  });
  const currents = elements.flatMap((element) => {
    if (element.type !== 'current') return [];
    const fromInside = boundary.has(element.from); const toInside = boundary.has(element.to);
    if (fromInside === toInside) return [];
    return [`${fromInside ? '+' : '-'}${dictionary.element(element)}`];
  });
  return [...terms, ...currents].join(' + ').replace(/\+ -/g, '- ') || '0';
}

/** Pedagogical KCL front-end: full MNA is retained strictly for numerical solve and verification. */
export class NodalSolver {
  constructor(private readonly elements: MNAElement[], private readonly visualNodes: NodalNodeLabel[] = []) {}

  analyze(): AnalysisTrace {
    try {
      const result = new MNASolver(this.elements).solve();
      const reduced = generateReducedNodalMatrix(this.elements);
      const uiIndices = reindexUINodes(reduced.unknownNodes);
      const dictionary = new AcademicNodalDictionary(this.elements, reduced.unknownNodes);
      const symbolicContext: SymbolicKCLContext = { elements: this.elements, dictionary, uiIndices, knownNodes: reduced.knownNodes };
      const supernodes = identifyFloatingSupernodes(this.elements);
      const reducedResidual = supernodes.length ? undefined : matrixResidualInfinity(reduced.conductance, reduced.unknownNodes.map((node) => result.nodeVoltages[node] ?? 0), reduced.rhs);
      if (reducedResidual !== undefined && (reducedResidual > 1e-8 || reduced.residualInfinity > 1e-8)) throw new Error(`Reduced nodal residual certificate failed (||G·V-z||∞=${Math.max(reducedResidual, reduced.residualInfinity).toExponential(3)}).`);
      const supernodeMembers = new Set(supernodes.flatMap((item) => [item.positiveNode, item.negativeNode]));
      const knownVoltageNodes = new Set(reduced.knownNodes.keys());
      const symbolicVoltage = (node: string): string => {
        if (node === '0') return '0';
        if (reduced.knownNodes.has(node)) return algebraicNumber(reduced.knownNodes.get(node)!);
        if (uiIndices.has(node)) return dictionary.coloredVoltage(node);
        const series = detectGroundedSourceResistorBranches(this.elements).find((branch) => branch.simpleNode === node);
        if (!series) return '\\mathrm{V_{series}}';
        return `\\left(${symbolicVoltage(series.primaryNode)}${series.simpleOffset >= 0 ? '+' : '-'}${algebraicNumber(Math.abs(series.simpleOffset))}\\right)`;
      };
      const kclLines = reduced.unknownNodes.filter((node) => !supernodeMembers.has(node) && !knownVoltageNodes.has(node)).map((node) => `\\text{KCL at }${dictionary.coloredNodeName(node)} &: ${generateKCLString(new Set([node]), symbolicContext)}=0`);
      const knownLines = Array.from(reduced.knownNodes.entries()).map(([node, voltage]) => {
        const source = this.elements.find((element): element is Extract<MNAElement, { type: 'voltage' }> => element.type === 'voltage' && ((element.positive === node && element.negative === '0') || (element.negative === node && element.positive === '0')));
        return `\\text{Source condition from }${source ? dictionary.element(source) : 'V_s'}:\\quad V_{\\mathrm{known}}=${algebraicNumber(voltage)}\\,\\mathrm{V}`;
      });
      const supernodeLines = supernodes.flatMap((supernode) => {
        const { element, positiveNode, negativeNode } = supernode;
        const members = new Set([positiveNode, negativeNode]);
        const nodeName = (node: string) => uiIndices.has(node) ? dictionary.coloredNodeName(node) : '\\text{source-connected node}';
        const constraint = element.type === 'voltage'
          ? `\\left(${symbolicVoltage(positiveNode)}\\right)-\\left(${symbolicVoltage(negativeNode)}\\right)=${element.voltage}\\,\\mathrm{V}`
          : `\\left(${symbolicVoltage(positiveNode)}\\right)-\\left(${symbolicVoltage(negativeNode)}\\right)=${element.gain}\\left(${symbolicVoltage(element.controlPositive)}-${symbolicVoltage(element.controlNegative)}\\right)`;
        return [`\\text{Boundary KCL for }${nodeName(positiveNode)},${nodeName(negativeNode)} &: ${generateKCLString(members, symbolicContext)}=0`, `\\text{Constraint} &: ${constraint}`];
      });
      const unknownSymbols = reduced.unknownNodes.map((node) => dictionary.coloredVoltage(node));
      const matrixSystem = `${latexMatrix(reduced.conductance)}\\begin{bmatrix}${unknownSymbols.join(' \\\\ ')}\\end{bmatrix}= ${latexMatrix(reduced.rhs.map((value) => [value]))}`;
      const solution = reduced.unknownNodes.map((node) => `${dictionary.coloredVoltage(node)}=${result.nodeVoltages[node] ?? 0}\\,\\mathrm{V}`).join(',\\qquad ');
      const nodalNodes = reduced.unknownNodes.map((node) => {
        const visual = this.visualNodes.find((item) => item.node === node);
        const index = uiIndices.get(node)!;
        return { node, index, label: `V_${index}`, color: dictionary.nodeColor(node), centroid: visual?.centroid ?? [0, 0] as [number, number] };
      });
      const steps = [
        ...(knownLines.length ? [{ title: '1. Known source conditions', math: `\\begin{aligned}${knownLines.join(' \\\\ ')}\\end{aligned}`, prose: 'Grounded ideal voltage sources set their connected node voltages before KCL equations are assembled.' }] : []),
        ...(kclLines.length ? [{ title: '2. Independent-node KCL equations', math: `\\begin{aligned}${kclLines.join(' \\\\ ')}\\end{aligned}`, prose: 'Each equation remains symbolic, using declared source values rather than post-solve voltages.' }] : []),
        ...(supernodeLines.length ? [{ title: '3. Supernode boundary and constraint equations', math: `\\begin{aligned}${supernodeLines.join(' \\\\ ')}\\end{aligned}`, prose: 'The boundary KCL and voltage constraint remain symbolic; the internal source branch is excluded from boundary current balance.' }] : []),
        { title: '4. Reduced nodal coefficient system', math: matrixSystem, prose: `Only ${reduced.unknownNodes.length} essential unknown node voltage${reduced.unknownNodes.length === 1 ? '' : 's'} appear. ${reduced.eliminatedNodes.length ? 'Simple degree-two nodes are eliminated before the academic matrix is rendered.' : 'No simple-node elimination is required.'} ${reducedResidual === undefined ? 'Its full residual certificate includes the separate floating-supernode constraint shown above.' : `The residual certificate is ||G·V-z||∞≤${Math.max(reducedResidual, reduced.residualInfinity).toExponential(2)}.`}` },
        { title: '5. Solved node-voltage vector', math: solution || 'V_0=0', prose: 'Only this final step reports numerical MNA solution values.' },
      ];
      return { method: 'nodal', status: 'ready', heading: 'Nodal Analysis · KCL / Supernodes', steps, result, nodalNodes };
    } catch (error) { return { method: 'nodal', status: 'error', heading: 'Nodal Analysis', steps: [], warning: error instanceof Error ? error.message : 'Nodal analysis failed.' }; }
  }
}

/** Pure deterministic self-validation requested for Phase 3 academic Nodal output. */
export function validateNodalLogic() {
  const circuit: MNAElement[] = [
    { type: 'voltage', id: 'raw-left-source', label: 'V1', positive: 'nL', negative: '0', voltage: 24 },
    { type: 'voltage', id: 'raw-right-source', label: 'V2', positive: 'nR', negative: '0', voltage: 12 },
    { type: 'resistor', id: 'opaque-r1', label: 'R1', positive: 'nL', negative: 'nA', resistance: 1000 },
    { type: 'resistor', id: 'opaque-r2', label: 'R2', positive: 'nA', negative: 'nB', resistance: 2000 },
    { type: 'resistor', id: 'opaque-r3', label: 'R3', positive: 'nB', negative: 'nR', resistance: 1000 },
    { type: 'resistor', id: 'opaque-r4', label: 'R4', positive: 'nA', negative: '0', resistance: 3000 },
    { type: 'resistor', id: 'opaque-r5', label: 'R5', positive: 'nB', negative: '0', resistance: 1500 },
  ];
  const trace = new NodalSolver(circuit).analyze();
  const equations = trace.steps.map((step) => step.math).join('\n');
  const va = trace.result?.nodeVoltages.nA ?? Number.NaN; const vb = trace.result?.nodeVoltages.nB ?? Number.NaN;
  if (!trace.result || Math.abs(va - 15.5820895522388) > 1e-9 || Math.abs(vb - 9.13432835820896) > 1e-9) throw new Error('Nodal self-validation failed: expected V_1=15.5820895522388 V and V_2=9.13432835820896 V.');
  if (!equations.includes('\\frac{\\textcolor{#2563eb}{V_{1}}-\\textcolor{#16a34a}{V_{2}}}{R_{2}}') || /V_\{10\}|V_\{20\}|raw-left|opaque|nA|nB/.test(equations)) throw new Error('Nodal self-validation failed: equations are not academically translated.');
  return { passed: true, equations, nodeVoltages: { V1: va, V2: vb } };
}
