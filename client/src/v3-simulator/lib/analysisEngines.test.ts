import { describe, expect, it } from 'vitest';
import type { MNAElement } from './mnaSolver';
import { NodalSolver } from './NodalSolver';
import { MeshSolver } from './MeshSolver';
import { SuperpositionSolver } from './SuperpositionSolver';
import { SourceTransformationSolver } from './SourceTransformationSolver';
import { TheveninSolver } from './TheveninSolver';
import { identifyFloatingSupernodes, validateNodalLogic } from './NodalSolver';
import { academicDisplayNodes, extractPolarityAwareKnownNodes, filterEssentialNodes, generateReducedNodalMatrix, reindexUINodes } from './reducedNodalMatrix';

const bridge: MNAElement[] = [
  { type: 'voltage', id: 'Vs', positive: 'n1', negative: '0', voltage: 24 },
  { type: 'resistor', id: 'R1', positive: 'n1', negative: 'n2', resistance: 1000 },
  { type: 'resistor', id: 'R2', positive: 'n2', negative: '0', resistance: 2000 },
  { type: 'resistor', id: 'R3', positive: 'n1', negative: 'n3', resistance: 2000 },
  { type: 'resistor', id: 'R4', positive: 'n3', negative: '0', resistance: 1000 },
  { type: 'resistor', id: 'R5', positive: 'n2', negative: 'n3', resistance: 1000 },
];

describe('Phase 3 academic analysis benchmarks', () => {
  it('Benchmark 1: agrees on Wheatstone R5 current between nodal and mesh analyses', () => {
    const nodal = new NodalSolver(bridge).analyze();
    const mesh = new MeshSolver(bridge).analyze();
    const ir5Nodal = ((nodal.result?.nodeVoltages.n2 ?? 0) - (nodal.result?.nodeVoltages.n3 ?? 0)) / 1000;
    const ir5Mesh = ((mesh.result?.nodeVoltages.n2 ?? 0) - (mesh.result?.nodeVoltages.n3 ?? 0)) / 1000;
    expect(nodal.status).toBe('ready'); expect(mesh.status).toBe('ready');
    expect(Math.abs(ir5Nodal - ir5Mesh)).toBeLessThan(1e-12);
    expect(nodal.steps.some(step => step.title.includes('KCL'))).toBe(true);
    expect(mesh.steps.some(step => step.title.includes('KVL'))).toBe(true);
    const kcl = nodal.steps.find((step) => step.title.includes('KCL'))?.math ?? '';
    expect(kcl).not.toMatch(/V_\{10\}|V_\{20\}/);
    expect(kcl).toContain('\\frac{\\textcolor{#2563eb}{V_{1}}}{R_{2}}');
  });

  it('reindexes supplied visual net centroids from V_1 after essential-node filtering', () => {
    const trace = new NodalSolver(bridge, [
      { node: 'n1', index: 1, label: 'V_1', color: '#2563eb', centroid: [20, 20] },
      { node: 'n2', index: 2, label: 'V_2', color: '#16a34a', centroid: [120, 40] },
      { node: 'n3', index: 3, label: 'V_3', color: '#db2777', centroid: [120, 80] },
    ]).analyze();
    expect(trace.nodalNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: 'n2', index: 1, label: 'V_1', color: '#2563eb', centroid: [120, 40] }),
      expect.objectContaining({ node: 'n3', index: 2, label: 'V_2', color: '#16a34a', centroid: [120, 80] }),
    ]));
  });

  it('reduces a two-known-source, two-unknown circuit to the textbook 2 × 2 nodal system', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'VL', positive: 'nL', negative: '0', voltage: 24 },
      { type: 'voltage', id: 'VR', positive: 'nR', negative: '0', voltage: 12 },
      { type: 'resistor', id: 'R1', positive: 'nL', negative: 'nA', resistance: 1000 },
      { type: 'resistor', id: 'R2', positive: 'nA', negative: 'nB', resistance: 2000 },
      { type: 'resistor', id: 'R3', positive: 'nB', negative: 'nR', resistance: 1000 },
      { type: 'resistor', id: 'R4', positive: 'nA', negative: '0', resistance: 3000 },
      { type: 'resistor', id: 'R5', positive: 'nB', negative: '0', resistance: 1500 },
    ];
    const reduced = generateReducedNodalMatrix(circuit);
    expect([...reduced.knownNodes.entries()]).toEqual([['nL', 24], ['nR', 12]]);
    expect(reduced.unknownNodes).toEqual(['nA', 'nB']);
    expect(reduced.conductance).toEqual([
      [1 / 1000 + 1 / 2000 + 1 / 3000, -1 / 2000],
      [-1 / 2000, 1 / 2000 + 1 / 1000 + 1 / 1500],
    ]);
    expect(reduced.rhs).toEqual([24 / 1000, 12 / 1000]);
    const trace = new NodalSolver(circuit).analyze();
    const matrix = trace.steps.find((step) => step.title.includes('Reduced nodal coefficient system'))?.math ?? '';
    const kcl = trace.steps.find((step) => step.title.includes('Independent-node KCL'))?.math ?? '';
    expect(matrix).toContain('\\textcolor{#2563eb}{V_{1}}');
    expect(matrix).toContain('\\textcolor{#16a34a}{V_{2}}');
    expect(matrix).not.toMatch(/V_\{3\}|V_\{4\}|I_\{V/);
    expect(kcl).toContain('\\textcolor{#2563eb}{V_{1}}-24');
    expect(trace.result?.matrix).toHaveLength(6);
  });

  it('renders a floating-source/resistor series leg symbolically and stamps its source constant into the reduced RHS', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vknown', positive: 'nKnown', negative: '0', voltage: 12 },
      { type: 'resistor', id: 'R1', positive: 'nKnown', negative: 'nEssential', resistance: 1 },
      { type: 'resistor', id: 'R2', positive: 'nEssential', negative: '0', resistance: 1 },
      { type: 'voltage', id: 'Vseries', positive: 'nEssential', negative: 'nSeries', voltage: 10 },
      { type: 'resistor', id: 'R3', positive: 'nSeries', negative: '0', resistance: 1 },
    ];
    const reduced = generateReducedNodalMatrix(circuit);
    expect(reduced.unknownNodes).toEqual(['nEssential']);
    expect(reduced.eliminatedNodes).toContain('nSeries');
    expect(reduced.conductance).toEqual([[3]]);
    expect(reduced.rhs).toEqual([22]);
    const trace = new NodalSolver(circuit).analyze();
    const derivation = trace.steps.filter((step) => !step.title.includes('Solved')).map((step) => step.math).join(' ');
    expect(derivation).toContain('\\left(\\textcolor{#2563eb}{V_{1}}-10\\right)');
    expect(derivation).toContain('\\frac{\\left(\\textcolor{#2563eb}{V_{1}}-10\\right)}{R_{3}}');
    expect(derivation).not.toContain('7.333');
    expect(derivation).not.toMatch(/V_\{series\}|-0\.[0-9]+\\,\\mathrm\{V\}/);
  });

  it('combines known-node resistor transfer and independent current-source injection in the generalized RHS', () => {
    const reduced = generateReducedNodalMatrix([
      { type: 'voltage', id: 'VK', positive: 'nK', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'RK', positive: 'nK', negative: 'nU', resistance: 1000 },
      { type: 'resistor', id: 'RG', positive: 'nU', negative: '0', resistance: 1000 },
      { type: 'current', id: 'Iout', from: 'nU', to: '0', current: 0.002 },
    ]);
    expect(reduced.unknownNodes).toEqual(['nU']);
    expect(reduced.conductance).toEqual([[0.002]]);
    expect(reduced.rhs).toEqual([0.008]);
  });

  it('uses source terminal polarity to assign both positive and negative grounded known-node voltages', () => {
    const known = extractPolarityAwareKnownNodes([
      { type: 'voltage', id: 'Vminus', positive: '0', negative: 'nMinus', voltage: 12 },
      { type: 'voltage', id: 'Vplus', positive: 'nPlus', negative: '0', voltage: 9 },
    ]);
    expect(Array.from(known.entries())).toEqual([['nMinus', -12], ['nPlus', 9]]);
    const trace = new NodalSolver([
      { type: 'voltage', id: 'Vminus', positive: '0', negative: 'nMinus', voltage: 12 },
      { type: 'resistor', id: 'R', positive: 'nMinus', negative: '0', resistance: 1000 },
    ]).analyze();
    expect(trace.steps[0].math).toContain('=-12\\,\\mathrm{V}');
  });

  it('omits a source-fed two-branch trivial node while retaining an adjacent essential unknown node', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vs', positive: '0', negative: 'nTrivial', voltage: 12 },
      { type: 'resistor', id: 'R1', positive: 'nTrivial', negative: 'nEssential', resistance: 1000 },
      { type: 'resistor', id: 'R2', positive: 'nEssential', negative: '0', resistance: 1000 },
      { type: 'current', id: 'I', from: 'nEssential', to: '0', current: 0.001 },
    ];
    const labels = academicDisplayNodes(circuit, extractPolarityAwareKnownNodes(circuit));
    expect(labels).toEqual(['nEssential']);
    expect(new NodalSolver(circuit).analyze().nodalNodes?.map((node) => node.node)).toEqual(['nEssential']);
  });

  it('enforces Degree >= 3 and assigns gap-free UI indices only after simple nodes are dropped', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vknown', positive: 'nKnown', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'Rsimple', positive: 'nKnown', negative: 'nSimple', resistance: 1000 },
      { type: 'resistor', id: 'Rlink', positive: 'nSimple', negative: 'nA', resistance: 1000 },
      { type: 'resistor', id: 'RAg', positive: 'nA', negative: '0', resistance: 1000 },
      { type: 'resistor', id: 'RAB', positive: 'nA', negative: 'nB', resistance: 1000 },
      { type: 'resistor', id: 'RBg', positive: 'nB', negative: '0', resistance: 1000 },
      { type: 'current', id: 'IB', from: 'nB', to: '0', current: 0.001 },
    ];
    const essential = filterEssentialNodes(circuit, extractPolarityAwareKnownNodes(circuit));
    expect(essential).toEqual(['nA', 'nB']);
    expect(Array.from(reindexUINodes(essential).entries())).toEqual([['nA', 1], ['nB', 2]]);
    const trace = new NodalSolver(circuit).analyze();
    expect(trace.nodalNodes?.map((node) => [node.node, node.label])).toEqual([['nA', 'V_1'], ['nB', 'V_2']]);
    expect(trace.steps.map((step) => step.math).join(' ')).not.toContain('V_3');
  });

  it('builds a floating supernode from exactly the source positive and negative terminal nodes', () => {
    const source: Extract<MNAElement, { type: 'voltage' }> = { type: 'voltage', id: 'Vfloat', positive: 'n1', negative: 'n3', voltage: 5 };
    const supernodes = identifyFloatingSupernodes([source]);
    expect(supernodes).toEqual([expect.objectContaining({ sourceId: 'Vfloat', positiveNode: 'n1', negativeNode: 'n3' })]);
    const trace = new NodalSolver([
      source,
      { type: 'resistor', id: 'R1', positive: 'n1', negative: '0', resistance: 1000 },
      { type: 'resistor', id: 'R2', positive: 'n3', negative: '0', resistance: 2000 },
      { type: 'current', id: 'I1', from: 'n1', to: '0', current: 0.001 },
      { type: 'current', id: 'I3', from: 'n3', to: '0', current: 0.001 },
    ]).analyze();
    const supernodeMath = trace.steps.find((step) => step.title.includes('Supernode'))?.math ?? '';
    expect(supernodeMath).toContain('V_{1}');
    expect(supernodeMath).toContain('V_{2}');
  });

  it('Benchmark 2: documents a dependent-source supermesh constraint without recursive evaluation', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vs', positive: 'n1', negative: '0', voltage: 12 }, { type: 'resistor', id: 'R', positive: 'n1', negative: '0', resistance: 1000 },
      { type: 'current-sense', id: 'Ix', positive: 'n2', negative: '0' }, { type: 'cccs', id: 'F', positive: 'n1', negative: '0', controlSourceId: 'Ix', gain: 2 },
    ];
    const trace = new MeshSolver(circuit).analyze();
    expect(trace.status).toBe('ready');
    expect(trace.steps.some(step => step.title.includes('Supermesh constraint') && step.math.includes('i_b-i_a'))).toBe(true);
  });

  it('Benchmark 3: sums independent-source sub-responses to the MNA branch-current baseline', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'V12', positive: 'n1', negative: '0', voltage: 12 }, { type: 'current', id: 'I2', from: 'n1', to: '0', current: 2 },
      { type: 'resistor', id: 'RL', positive: 'n1', negative: '0', resistance: 6 },
    ];
    const trace = new SuperpositionSolver(circuit).analyze('RL');
    expect(trace.status).toBe('ready');
    expect(trace.steps).toHaveLength(4);
    expect(trace.steps.at(-1)?.title).toContain('Baseline MNA');
  });

  it('Benchmark 4: retains a VCVS and uses the virtual 1 V test-source path for Thévenin resistance', () => {
    const circuit: MNAElement[] = [
      { type: 'vcvs', id: 'E1', positive: 'n1', negative: '0', controlPositive: 'n2', controlNegative: '0', gain: 2 },
      { type: 'resistor', id: 'Rfb', positive: 'n1', negative: 'n2', resistance: 1000 }, { type: 'resistor', id: 'RL', positive: 'n2', negative: '0', resistance: 2000 },
    ];
    const trace = new TheveninSolver(circuit).analyze('RL');
    expect(trace.status).toBe('ready');
    expect(trace.steps.some(step => step.title === 'Dependent-source test method' && step.math.includes('V_{test}'))).toBe(true);
  });

  it('renders the expected Thévenin-to-Norton source transformation algebra', () => {
    const trace = new SourceTransformationSolver([{ type: 'voltage', id: 'V_s', positive: 'n1', negative: '0', voltage: 10 }, { type: 'resistor', id: 'R_s', positive: 'n1', negative: '0', resistance: 5 }]).analyze();
    expect(trace.status).toBe('ready');
    expect(trace.steps[1].math).toContain('I_s');
  });

  it('validateNodalLogic: translates opaque topology IDs into textbook symbols and solves the two-source five-resistor circuit exactly', () => {
    const report = validateNodalLogic();
    expect(report.passed).toBe(true);
    expect(report.equations).toContain('\\frac{\\textcolor{#2563eb}{V_{1}}-\\textcolor{#16a34a}{V_{2}}}{R_{2}}');
    expect(report.equations).toMatch(/V_\{1\}\}=15\.582/);
    expect(report.equations).not.toMatch(/V_\{10\}|V_\{20\}|raw-left|opaque|nA|nB/);
    expect(report.nodeVoltages.V1).toBeCloseTo(15.5820895522388, 10);
    expect(report.nodeVoltages.V2).toBeCloseTo(9.13432835820896, 10);
  });
});
