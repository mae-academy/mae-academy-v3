import { MNASolver, matrixResidualInfinity, type MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { AcademicNodalDictionary } from '@/simulators/circuit-engine/models/AcademicNodalDictionary';
import { nonReferenceNodes, type AnalysisTrace, type NodalNodeLabel } from '@/simulators/circuit-engine/models/analysisTypes';
import { latexMatrix } from '@/simulators/circuit-engine/models/analysisFormatting';
import {
  detectGroundedSourceResistorBranches,
  generateReducedNodalMatrix,
  reindexUINodes,
  identifyCompoundSupernodes,
  identifyFloatingSupernodes,
  identifyGroundedDependentVoltageSources,
  resolveTargetResistor,
  type FloatingSupernode,
  type CompoundSupernode,
} from '@/simulators/circuit-engine/engine/reducedNodalMatrix';

export { identifyFloatingSupernodes, identifyCompoundSupernodes, type FloatingSupernode, type CompoundSupernode };

export interface SymbolicKCLContext {
  elements: MNAElement[];
  dictionary: AcademicNodalDictionary;
  uiIndices: Map<string, number>;
  knownNodes: Map<string, number>;
}

export function algebraicNumber(value: number): string {
  return String(Math.round(value * 1e9) / 1e9);
}

export interface DependentSourceInfo {
  element: Extract<MNAElement, { type: 'vccs' | 'cccs' | 'vcvs' | 'ccvs' }>;
  varName: string;
  subDef: string;
  subExpr: string;
  gain: number;
}

export function getDependentSourceInfo(
  element: Extract<MNAElement, { type: 'vccs' | 'cccs' | 'vcvs' | 'ccvs' }>,
  elements: MNAElement[],
  dictionary: AcademicNodalDictionary,
  symbolicVoltage: (node: string) => string
): DependentSourceInfo {
  const targetResistor = resolveTargetResistor(elements, element);
  const resLabel = targetResistor ? (targetResistor.resistor ? dictionary.element(targetResistor.resistor) : targetResistor.label) : 'R_x';

  if (element.type === 'vcvs' || element.type === 'vccs') {
    const gain = element.gain ?? (element as any).transconductance ?? 1;
    const cp = element.controlPositive ?? targetResistor?.positive ?? '0';
    const cn = element.controlNegative ?? targetResistor?.negative ?? '0';
    const varName = targetResistor ? `V_{${resLabel}}` : 'V_x';
    const num = cn === '0' ? symbolicVoltage(cp) : `${symbolicVoltage(cp)}-${symbolicVoltage(cn)}`;
    const subDef = cn === '0' ? symbolicVoltage(cp) : `\\left(${num}\\right)`;
    return { element, varName, subDef, subExpr: num, gain };
  } else {
    // cccs or ccvs
    const gain = element.gain ?? (element as any).transresistance ?? 1;
    const varName = targetResistor ? `I_{${resLabel}}` : 'I_x';
    const tp = targetResistor?.positive ?? ('controlPositive' in element ? element.controlPositive ?? '0' : '0');
    const tn = targetResistor?.negative ?? ('controlNegative' in element ? element.controlNegative ?? '0' : '0');
    const num = tn === '0' ? symbolicVoltage(tp) : `${symbolicVoltage(tp)}-${symbolicVoltage(tn)}`;
    const subDef = `\\frac{${num}}{${resLabel}}`;
    return { element, varName, subDef, subExpr: subDef, gain };
  }
}

/**
 * Creates KCL strictly from topology and declared source values. Because it has
 * no MNA solution input, solved floats cannot leak into academic derivations.
 */
export function generateKCLString(
  boundary: Set<string>,
  context: SymbolicKCLContext,
  options: { substituted?: boolean } = {}
): string {
  const { elements, dictionary, uiIndices, knownNodes } = context;
  const seriesBranches = detectGroundedSourceResistorBranches(elements);
  const effectiveBoundary = new Set(boundary);
  for (const branch of seriesBranches) {
    if (boundary.has(branch.primaryNode)) {
      // Guard effectiveBoundary expansion:
      // Before absorbing simpleNode into effectiveBoundary, verify that no current source
      // has both from and to (or positive and negative) mapping to the expanded set.
      // If detected, skip the absorption for that node to preserve the sign-determining cross-boundary property of the current source.
      const candidateBoundary = new Set(effectiveBoundary);
      candidateBoundary.add(branch.simpleNode);
      const trapsCurrentSource = elements.some((element) => {
        if (element.type === 'current') {
          const wasCrossing = effectiveBoundary.has(element.from) !== effectiveBoundary.has(element.to);
          const willBeTrapped = candidateBoundary.has(element.from) && candidateBoundary.has(element.to);
          return wasCrossing && willBeTrapped;
        }
        if (element.type === 'vccs' || element.type === 'cccs') {
          const wasCrossing = effectiveBoundary.has(element.positive) !== effectiveBoundary.has(element.negative);
          const willBeTrapped = candidateBoundary.has(element.positive) && candidateBoundary.has(element.negative);
          return wasCrossing && willBeTrapped;
        }
        return false;
      });
      if (!trapsCurrentSource) {
        effectiveBoundary.add(branch.simpleNode);
      }
    }
  }
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
    const positiveInside = effectiveBoundary.has(element.positive);
    const negativeInside = effectiveBoundary.has(element.negative);
    if (positiveInside === negativeInside) return [];
    const inside = positiveInside ? element.positive : element.negative;
    const outside = positiveInside ? element.negative : element.positive;
    const numerator = outside === '0' ? symbolicVoltage(inside) : `${symbolicVoltage(inside)}-${symbolicVoltage(outside)}`;
    return [`\\frac{${numerator}}{${dictionary.element(element)}}`];
  });
  // Independent current sources:
  // Conventional current EXITS `element.from` and ENTERS `element.to`.
  // Convention: \sum I_leaving = 0.
  // If exit pin (element.from) is inside the boundary, current leaves the boundary -> +
  // If entry pin (element.to) is inside the boundary, current enters the boundary -> -
  const currents = elements.flatMap((element) => {
    if (element.type !== 'current') return [];
    const exitPinInBoundary = effectiveBoundary.has(element.from);
    const entryPinInBoundary = effectiveBoundary.has(element.to);
    if (exitPinInBoundary === entryPinInBoundary) return [];
    return [`${exitPinInBoundary ? '+' : '-'}${dictionary.element(element)}`];
  });
  // Dependent current sources (VCCS and CCCS):
  // Conventional current EXITS `element.positive` and ENTERS `element.negative`.
  // Convention: \sum I_leaving = 0.
  // If exit pin (element.positive) is inside the boundary, current leaves the boundary -> +
  // If entry pin (element.negative) is inside the boundary, current enters the boundary -> -
  const dependentCurrents = elements.flatMap((element) => {
    if (element.type !== 'vccs' && element.type !== 'cccs') return [];
    const exitPinInBoundary = effectiveBoundary.has(element.positive);
    const entryPinInBoundary = effectiveBoundary.has(element.negative);
    if (exitPinInBoundary === entryPinInBoundary) return [];
    let sign: '+' | '-' = exitPinInBoundary ? '+' : '-';
    const info = getDependentSourceInfo(element, elements, dictionary, symbolicVoltage);
    let effectiveGain = info.gain;
    // When gain k < 0, flip the topological sign and use |k|
    if (effectiveGain < 0) {
      sign = sign === '+' ? '-' : '+';
      effectiveGain = Math.abs(effectiveGain);
    }
    const gainPrefix = Math.abs(effectiveGain - 1) < 1e-12 ? '' : `${algebraicNumber(effectiveGain)} \\cdot `;
    if (options.substituted) {
      return [`${sign}${gainPrefix}\\left(${info.subExpr}\\right)`];
    }
    return [`${sign}${gainPrefix}${info.varName}`];
  });
  return [...terms, ...currents, ...dependentCurrents].join(' + ').replace(/\+ \+/g, '+ ').replace(/\+ -/g, '- ').replace(/^\+\s*/, '') || '0';
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
      const compoundSupernodes = identifyCompoundSupernodes(this.elements);
      const reducedResidual = matrixResidualInfinity(reduced.conductance, reduced.unknownNodes.map((node) => result.nodeVoltages[node] ?? 0), reduced.rhs);
      if (reducedResidual > 1e-7 || reduced.residualInfinity > 1e-7) throw new Error(`Reduced nodal residual certificate failed (||G·V-z||∞=${Math.max(reducedResidual, reduced.residualInfinity).toExponential(3)}).`);
      const supernodeMembers = new Set(compoundSupernodes.flatMap((item) => item.nodes));
      const knownVoltageNodes = new Set(reduced.knownNodes.keys());
      const symbolicVoltage = (node: string): string => {
        if (node === '0') return '0';
        if (reduced.knownNodes.has(node)) return algebraicNumber(reduced.knownNodes.get(node)!);
        if (uiIndices.has(node)) return dictionary.coloredVoltage(node);
        const series = detectGroundedSourceResistorBranches(this.elements).find((branch) => branch.simpleNode === node);
        if (!series) return '\\mathrm{V_{series}}';
        return `\\left(${symbolicVoltage(series.primaryNode)}${series.simpleOffset >= 0 ? '+' : '-'}${algebraicNumber(Math.abs(series.simpleOffset))}\\right)`;
      };
      // A grounded dependent source defines its output node's voltage, so that node's row in the
      // rendered matrix is the source's constraint, not a KCL balance. Print the same equation the
      // matrix actually contains rather than a KCL line the system no longer uses.
      const groundedDependent = new Map(
        identifyGroundedDependentVoltageSources(this.elements).map((item) => [item.outputNode, item])
      );
      const kclLines = reduced.unknownNodes
        .filter((node) => !supernodeMembers.has(node) && !knownVoltageNodes.has(node))
        .flatMap((node) => {
          const dependent = groundedDependent.get(node);
          if (dependent) {
            const info = getDependentSourceInfo(dependent.element, this.elements, dictionary, symbolicVoltage);
            const gain = dependent.outputSign * info.gain;
            const gainStr = Math.abs(gain - 1) < 1e-12 ? '' : `${algebraicNumber(gain)} \\cdot `;
            return [
              `\\text{Constraint from }${dictionary.element(dependent.element)} &: ${dictionary.coloredVoltage(node)}=${gainStr}${info.varName}`,
              `\\text{Substitute } ${info.varName} = ${info.subDef} &: ${dictionary.coloredVoltage(node)}=${algebraicNumber(gain)}\\left(${info.subExpr}\\right)`,
            ];
          }
          const boundary = new Set([node]);
          const depCrossing = this.elements.filter(
            (e): e is Extract<MNAElement, { type: 'vccs' | 'cccs' }> =>
              (e.type === 'vccs' || e.type === 'cccs') &&
              boundary.has(e.positive) !== boundary.has(e.negative)
          );
          if (depCrossing.length === 0) {
            return [`\\text{KCL at }${dictionary.coloredNodeName(node)} &: ${generateKCLString(boundary, symbolicContext)}=0`];
          }
          const rawKcl = generateKCLString(boundary, symbolicContext, { substituted: false });
          const lines = [`\\text{KCL at }${dictionary.coloredNodeName(node)} &: ${rawKcl}=0`];
          for (const dep of depCrossing) {
            const info = getDependentSourceInfo(dep, this.elements, dictionary, symbolicVoltage);
            const subKcl = generateKCLString(boundary, symbolicContext, { substituted: true });
            lines.push(`\\text{Substitute } ${info.varName} = ${info.subDef} \\text{ into the equation: } &: ${subKcl}=0`);
          }
          return lines;
        });
      const knownLines = Array.from(reduced.knownNodes.entries()).map(([node, voltage]) => {
        const source = this.elements.find((element): element is Extract<MNAElement, { type: 'voltage' }> => element.type === 'voltage' && ((element.positive === node && element.negative === '0') || (element.negative === node && element.positive === '0')));
        return `\\text{Source condition from }${source ? dictionary.element(source) : 'V_s'}:\\quad V_{\\mathrm{known}}=${algebraicNumber(voltage)}\\,\\mathrm{V}`;
      });
      const supernodeLines = compoundSupernodes.flatMap((supernode) => {
        const boundary = new Set(supernode.nodes);
        const nodeNames = supernode.nodes.map((node) => uiIndices.has(node) ? dictionary.coloredNodeName(node) : '\\text{source-connected node}').join(', ');
        const depCrossing = this.elements.filter(
          (e): e is Extract<MNAElement, { type: 'vccs' | 'cccs' }> =>
            (e.type === 'vccs' || e.type === 'cccs') &&
            boundary.has(e.positive) !== boundary.has(e.negative)
        );
        const kclLinesForSupernode: string[] = [];
        if (depCrossing.length === 0) {
          kclLinesForSupernode.push(`\\text{Boundary KCL for }${nodeNames} &: ${generateKCLString(boundary, symbolicContext)}=0`);
        } else {
          const rawKcl = generateKCLString(boundary, symbolicContext, { substituted: false });
          kclLinesForSupernode.push(`\\text{Boundary KCL for }${nodeNames} &: ${rawKcl}=0`);
          for (const dep of depCrossing) {
            const info = getDependentSourceInfo(dep, this.elements, dictionary, symbolicVoltage);
            const subKcl = generateKCLString(boundary, symbolicContext, { substituted: true });
            kclLinesForSupernode.push(`\\text{Substitute } ${info.varName} = ${info.subDef} \\text{ into the equation: } &: ${subKcl}=0`);
          }
        }

        const constraintLines = supernode.sources.flatMap((source) => {
          // Topological polarity: positiveNode = element.positive, negativeNode = element.negative
          // established by identifyFloatingSupernodes(). The constraint V_positive - V_negative = V_source is invariant.
          const { element, positiveNode, negativeNode } = source;
          if (element.type === 'voltage') {
            return [`\\text{Constraint} &: \\left(${symbolicVoltage(positiveNode)}\\right)-\\left(${symbolicVoltage(negativeNode)}\\right)=${element.voltage}\\,\\mathrm{V}`];
          }
          const info = getDependentSourceInfo(element, this.elements, dictionary, symbolicVoltage);
          const gainStr = Math.abs(info.gain - 1) < 1e-12 ? '' : `${algebraicNumber(info.gain)} \\cdot `;
          const rawConstraint = `\\left(${symbolicVoltage(positiveNode)}\\right)-\\left(${symbolicVoltage(negativeNode)}\\right)=${gainStr}${info.varName}`;
          const subConstraint = `\\left(${symbolicVoltage(positiveNode)}\\right)-\\left(${symbolicVoltage(negativeNode)}\\right)=${algebraicNumber(info.gain)}\\left(${info.subExpr}\\right)`;
          return [
            `\\text{Constraint} &: ${rawConstraint}`,
            `\\text{Substitute } ${info.varName} = ${info.subDef} &: ${subConstraint}`,
          ];
        });
        return [...kclLinesForSupernode, ...constraintLines];
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
        { title: '4. Reduced nodal coefficient system', math: matrixSystem, prose: `Only ${reduced.unknownNodes.length} essential unknown node voltage${reduced.unknownNodes.length === 1 ? '' : 's'} appear. ${reduced.eliminatedNodes.length ? 'Simple degree-two nodes are eliminated before the academic matrix is rendered.' : 'No simple-node elimination is required.'} The residual certificate is ||G·V-z||∞≤${Math.max(reducedResidual, reduced.residualInfinity).toExponential(2)}.` },
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
  if (!equations.includes('\\frac{\\textcolor{#2563eb}{V_{1}}-\\textcolor{#7c3aed}{V_{2}}}{R_{2}}') || /V_\{10\}|V_\{20\}|raw-left|opaque|nA|nB/.test(equations)) throw new Error('Nodal self-validation failed: equations are not academically translated.');
  return { passed: true, equations, nodeVoltages: { V1: va, V2: vb } };
}
