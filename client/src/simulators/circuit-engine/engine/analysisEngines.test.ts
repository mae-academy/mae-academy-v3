import { describe, expect, it } from 'vitest';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { MNASolver } from '@/simulators/circuit-engine/engine/mnaSolver';
import { NodalSolver, identifyFloatingSupernodes, identifyCompoundSupernodes, validateNodalLogic } from '@/simulators/circuit-engine/engine/NodalSolver';
import { MeshSolver, buildMeshSystem, solveMeshCurrents } from '@/simulators/circuit-engine/engine/MeshSolver';
import { SuperpositionSolver } from '@/simulators/circuit-engine/engine/SuperpositionSolver';
import { SourceTransformationSolver } from '@/simulators/circuit-engine/engine/SourceTransformationSolver';
import { TheveninSolver } from '@/simulators/circuit-engine/engine/TheveninSolver';
import { academicDisplayNodes, extractPolarityAwareKnownNodes, filterEssentialNodes, generateReducedNodalMatrix, reindexUINodes } from '@/simulators/circuit-engine/engine/reducedNodalMatrix';
import type { MeshGeometry } from '@/simulators/circuit-engine/components/meshGeometry';

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
      { node: 'n2', index: 2, label: 'V_2', color: '#7c3aed', centroid: [120, 40] },
      { node: 'n3', index: 3, label: 'V_3', color: '#db2777', centroid: [120, 80] },
    ]).analyze();
    expect(trace.nodalNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: 'n2', index: 1, label: 'V_1', color: '#2563eb', centroid: [120, 40] }),
      expect.objectContaining({ node: 'n3', index: 2, label: 'V_2', color: '#7c3aed', centroid: [120, 80] }),
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
    expect(matrix).toContain('\\textcolor{#7c3aed}{V_{2}}');
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
    expect(report.equations).toContain('\\frac{\\textcolor{#2563eb}{V_{1}}-\\textcolor{#7c3aed}{V_{2}}}{R_{2}}');
    expect(report.equations).toMatch(/V_\{1\}\}=15\.582/);
    expect(report.equations).not.toMatch(/V_\{10\}|V_\{20\}|raw-left|opaque|nA|nB/);
    expect(report.nodeVoltages.V1).toBeCloseTo(15.5820895522388, 10);
    expect(report.nodeVoltages.V2).toBeCloseTo(9.13432835820896, 10);
  });

  it('Test A (2-Mesh Shared Current Source): correctly solves 2-mesh system with shared 2A current source matching theoretical values and MNA', () => {
    const testACircuit: MNAElement[] = [
      { id: 'V1', name: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 10 },
      { id: 'R1', name: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 5 },
      { id: 'Is', name: 'Is', type: 'current', from: '0', to: 'n2', current: 2 },
      { id: 'R2', name: 'R2', type: 'resistor', positive: 'n2', negative: '0', resistance: 10 },
    ];
    const testAGeometry: MeshGeometry = {
      branches: [
        { id: 'V1', path: [[0, 0], [0, 100]] },
        { id: 'R1', path: [[0, 0], [100, 0]] },
        { id: 'Is', path: [[100, 100], [100, 0]] },
        { id: 'R2', path: [[200, 0], [200, 100]] },
      ],
      wires: [
        { id: 'w_bot1', path: [[0, 100], [100, 100]] },
        { id: 'w_top2', path: [[100, 0], [200, 0]] },
        { id: 'w_bot2', path: [[100, 100], [200, 100]] },
      ],
    };

    const system = buildMeshSystem(testACircuit, testAGeometry);
    expect(system.cycles).toHaveLength(2);
    // Row 0: Constraint -I_1 + I_2 = 2
    expect(system.impedance[0]).toEqual([-1, 1]);
    expect(system.source[0]).toBe(2);
    // Row 1: Merged Supermesh KVL row 5*I_1 + 10*I_2 = 10
    expect(system.impedance[1]).toEqual([5, 10]);
    expect(system.source[1]).toBe(10);

    const solved = solveMeshCurrents(system.impedance, system.source);
    // Theoretical: I_1 = -2/3 A, I_2 = 4/3 A
    expect(solved[0]).toBeCloseTo(-2 / 3, 10);
    expect(solved[1]).toBeCloseTo(4 / 3, 10);

    const trace = new MeshSolver(testACircuit, testAGeometry).analyze();
    expect(trace.status).toBe('ready');
    expect(trace.meshCurrents?.I_1).toBeCloseTo(-2 / 3, 10);
    expect(trace.meshCurrents?.I_2).toBeCloseTo(4 / 3, 10);

    const mna = new MNASolver(testACircuit).solve();
    const ir1Mna = ((mna.nodeVoltages.n1 ?? 0) - (mna.nodeVoltages.n2 ?? 0)) / 5;
    const ir2Mna = (mna.nodeVoltages.n2 ?? 0) / 10;
    expect(trace.meshCurrents?.I_1).toBeCloseTo(ir1Mna, 10);
    expect(trace.meshCurrents?.I_2).toBeCloseTo(ir2Mna, 10);
  });

  it('Test B (3-Mesh Double Supermesh): 3 adjacent meshes sharing 2 ideal current sources correctly merges into 1 supermesh KVL row', () => {
    const testBCircuit: MNAElement[] = [
      { id: 'V1', name: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 20 },
      { id: 'R1', name: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 4 },
      { id: 'Is1', name: 'Is1', type: 'current', from: '0', to: 'n2', current: 2 },
      { id: 'R2', name: 'R2', type: 'resistor', positive: 'n2', negative: 'n3', resistance: 2 },
      { id: 'Is2', name: 'Is2', type: 'current', from: '0', to: 'n3', current: 1 },
      { id: 'R3', name: 'R3', type: 'resistor', positive: 'n3', negative: '0', resistance: 6 },
    ];
    const testBGeometry: MeshGeometry = {
      branches: [
        { id: 'V1', path: [[0, 0], [0, 100]] },
        { id: 'R1', path: [[0, 0], [100, 0]] },
        { id: 'Is1', path: [[100, 100], [100, 0]] },
        { id: 'R2', path: [[100, 0], [200, 0]] },
        { id: 'Is2', path: [[200, 100], [200, 0]] },
        { id: 'R3', path: [[300, 0], [300, 100]] },
      ],
      wires: [
        { id: 'w_b1', path: [[0, 100], [100, 100]] },
        { id: 'w_b2', path: [[100, 100], [200, 100]] },
        { id: 'w_t3', path: [[200, 0], [300, 0]] },
        { id: 'w_b3', path: [[200, 100], [300, 100]] },
      ],
    };

    const system = buildMeshSystem(testBCircuit, testBGeometry);
    expect(system.cycles).toHaveLength(3);
    expect(system.currentConstraints).toHaveLength(2);

    // Row 0: Constraint 1 (-I_1 + I_2 = 2)
    expect(system.impedance[0]).toEqual([-1, 1, 0]);
    expect(system.source[0]).toBe(2);

    // Row 1: Constraint 2 (-I_2 + I_3 = 1)
    expect(system.impedance[1]).toEqual([0, -1, 1]);
    expect(system.source[1]).toBe(1);

    // Row 2: Merged Supermesh KVL row (4*I_1 + 2*I_2 + 6*I_3 = 20)
    expect(system.impedance[2]).toEqual([4, 2, 6]);
    expect(system.source[2]).toBe(20);

    const solved = solveMeshCurrents(system.impedance, system.source);
    // Theoretical: I_1 = -1/6 A, I_2 = 11/6 A, I_3 = 17/6 A
    expect(solved[0]).toBeCloseTo(-1 / 6, 10);
    expect(solved[1]).toBeCloseTo(11 / 6, 10);
    expect(solved[2]).toBeCloseTo(17 / 6, 10);

    const trace = new MeshSolver(testBCircuit, testBGeometry).analyze();
    expect(trace.status).toBe('ready');
    expect(trace.meshCurrents?.I_1).toBeCloseTo(-1 / 6, 10);
    expect(trace.meshCurrents?.I_2).toBeCloseTo(11 / 6, 10);
    expect(trace.meshCurrents?.I_3).toBeCloseTo(17 / 6, 10);

    const mna = new MNASolver(testBCircuit).solve();
    const ir1Mna = ((mna.nodeVoltages.n1 ?? 0) - (mna.nodeVoltages.n2 ?? 0)) / 4;
    const ir2Mna = ((mna.nodeVoltages.n2 ?? 0) - (mna.nodeVoltages.n3 ?? 0)) / 2;
    const ir3Mna = (mna.nodeVoltages.n3 ?? 0) / 6;
    expect(trace.meshCurrents?.I_1).toBeCloseTo(ir1Mna, 10);
    expect(trace.meshCurrents?.I_2).toBeCloseTo(ir2Mna, 10);
    expect(trace.meshCurrents?.I_3).toBeCloseTo(ir3Mna, 10);
  });

  it('Test C (Compound Supernode): series floating voltage sources sharing an intermediate node with resistive loads to ground', () => {
    const testCCircuit: MNAElement[] = [
      { type: 'voltage', id: 'V1', positive: 'nA', negative: 'nB', voltage: 5 },
      { type: 'voltage', id: 'V2', positive: 'nB', negative: 'nC', voltage: 10 },
      { type: 'resistor', id: 'RA', positive: 'nA', negative: '0', resistance: 10 },
      { type: 'resistor', id: 'RB', positive: 'nB', negative: '0', resistance: 20 },
      { type: 'resistor', id: 'RC', positive: 'nC', negative: '0', resistance: 5 },
    ];

    const compound = identifyCompoundSupernodes(testCCircuit);
    expect(compound).toHaveLength(1);
    expect(compound[0].nodes.sort()).toEqual(['nA', 'nB', 'nC']);
    expect(compound[0].sources).toHaveLength(2);

    const reduced = generateReducedNodalMatrix(testCCircuit);
    expect(reduced.unknownNodes).toEqual(['nA', 'nB', 'nC']);
    expect(reduced.conductance).toEqual([
      [0.1, 0.05, 0.2],
      [1, -1, 0],
      [0, 1, -1],
    ]);
    expect(reduced.rhs).toEqual([0, 5, 10]);
    expect(reduced.residualInfinity).toBeLessThanOrEqual(1e-7);

    const trace = new NodalSolver(testCCircuit).analyze();
    expect(trace.status).toBe('ready');

    // Theoretical values: V_A = 65/7 V, V_B = 30/7 V, V_C = -40/7 V
    expect(trace.result?.nodeVoltages.nA).toBeCloseTo(65 / 7, 10);
    expect(trace.result?.nodeVoltages.nB).toBeCloseTo(30 / 7, 10);
    expect(trace.result?.nodeVoltages.nC).toBeCloseTo(-40 / 7, 10);

    const supernodeStep = trace.steps.find((s) => s.title.includes('Supernode'))?.math ?? '';
    expect(supernodeStep).toContain('Boundary KCL');
    expect(supernodeStep).toContain('Constraint');

    const reducedStep = trace.steps.find((s) => s.title.includes('Reduced nodal coefficient system'));
    expect(reducedStep).toBeDefined();
    expect(reducedStep?.prose).toMatch(/The residual certificate is \|\|G·V-z\|\|∞≤/);
  });

  it('Test D (Nodal VCVS Supernode): detects VCVS supernode between non-reference nodes with constraint & symbolic substitution', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vs', positive: 'n1', negative: '0', voltage: 12 },
      { type: 'resistor', id: 'R1', positive: 'n1', negative: 'n2', resistance: 1000 },
      { type: 'vcvs', id: 'E1', positive: 'n3', negative: 'n2', controlPositive: 'n1', controlNegative: 'n2', gain: 2 },
      { type: 'resistor', id: 'R2', positive: 'n2', negative: '0', resistance: 2000 },
      { type: 'resistor', id: 'R3', positive: 'n3', negative: '0', resistance: 3000 },
    ];

    const floating = identifyFloatingSupernodes(circuit);
    expect(floating).toHaveLength(1);
    expect(floating[0].element.id).toBe('E1');
    expect(floating[0].positiveNode).toBe('n3');
    expect(floating[0].negativeNode).toBe('n2');

    const trace = new NodalSolver(circuit).analyze();
    expect(trace.status).toBe('ready');

    const supernodeStep = trace.steps.find((s) => s.title.includes('Supernode'))?.math ?? '';
    expect(supernodeStep).toContain('Boundary KCL');
    expect(supernodeStep).toContain('Constraint');
    expect(supernodeStep).toContain('V_{R_{1}}');
    expect(supernodeStep).toContain('\\text{Substitute } V_{R_{1}}');

    const mna = new MNASolver(circuit).solve();
    expect(trace.result?.nodeVoltages.n2).toBeCloseTo(mna.nodeVoltages.n2, 9);
    expect(trace.result?.nodeVoltages.n3).toBeCloseTo(mna.nodeVoltages.n3, 9);
  });

  it('Test E (Nodal CCVS Supernode): detects CCVS supernode with KaTeX constraint and symbolic substitution of target current', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vs', positive: 'n1', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'R1', positive: 'n1', negative: 'n2', resistance: 100 },
      { type: 'ccvs', id: 'H1', positive: 'n3', negative: 'n2', targetId: 'R1', gain: 50 },
      { type: 'resistor', id: 'R2', positive: 'n2', negative: '0', resistance: 200 },
      { type: 'resistor', id: 'R3', positive: 'n3', negative: '0', resistance: 500 },
    ];

    const floating = identifyFloatingSupernodes(circuit);
    expect(floating).toHaveLength(1);
    expect(floating[0].element.id).toBe('H1');

    const trace = new NodalSolver(circuit).analyze();
    expect(trace.status).toBe('ready');

    const supernodeStep = trace.steps.find((s) => s.title.includes('Supernode'))?.math ?? '';
    expect(supernodeStep).toContain('Constraint');
    expect(supernodeStep).toContain('I_{R_{1}}');
    expect(supernodeStep).toContain('\\text{Substitute } I_{R_{1}}');

    const mna = new MNASolver(circuit).solve();
    expect(trace.result?.nodeVoltages.n2).toBeCloseTo(mna.nodeVoltages.n2, 9);
    expect(trace.result?.nodeVoltages.n3).toBeCloseTo(mna.nodeVoltages.n3, 9);
  });

  it('Test F (Nodal Standard KCL with CCCS & VCCS): formats raw terms and dynamic substitution in independent node KCL', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vin', positive: 'n1', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'Rsense', label: 'R_{sense}', positive: 'n1', negative: '0', resistance: 100 },
      { type: 'cccs', id: 'F1', positive: 'n2', negative: '0', targetId: 'Rsense', gain: 2 },
      { type: 'resistor', id: 'Rload', positive: 'n2', negative: '0', resistance: 50 },
    ];

    const trace = new NodalSolver(circuit).analyze();
    expect(trace.status).toBe('ready');

    const kclStep = trace.steps.find((s) => s.title.includes('Independent-node KCL'))?.math ?? '';
    expect(kclStep).toContain('I_{R');
    expect(kclStep).toContain('\\text{Substitute } I_{R');
    expect(kclStep).toContain('\\frac');

    const mna = new MNASolver(circuit).solve();
    expect(trace.result?.nodeVoltages.n2).toBeCloseTo(mna.nodeVoltages.n2, 9);
  });

  it('Test G (Mesh CCCS Supermesh): detects supermesh with CCCS, constraint equation and symbolic substitution', () => {
    const circuit: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 20 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 5 },
      { id: 'F1', type: 'cccs', positive: 'n2', negative: '0', targetId: 'R1', gain: 2 },
      { id: 'R2', type: 'resistor', positive: 'n2', negative: '0', resistance: 10 },
    ];
    const geom: MeshGeometry = {
      branches: [
        { id: 'V1', path: [[0, 0], [0, 100]] },
        { id: 'R1', path: [[0, 0], [100, 0]] },
        { id: 'F1', path: [[100, 0], [100, 100]] },
        { id: 'R2', path: [[200, 0], [200, 100]] },
      ],
      wires: [
        { id: 'wb1', path: [[0, 100], [100, 100]] },
        { id: 'wt2', path: [[100, 0], [200, 0]] },
        { id: 'wb2', path: [[100, 100], [200, 100]] },
      ],
    };

    const system = buildMeshSystem(circuit, geom);
    expect(system.cycles).toHaveLength(2);
    expect(system.currentConstraints).toHaveLength(1);
    expect(system.currentConstraints[0].isDependent).toBe(true);

    const trace = new MeshSolver(circuit, geom).analyze();
    expect(trace.status).toBe('ready');

    const supermeshStep = trace.steps.find((s) => s.title.includes('Supermesh'))?.math ?? '';
    expect(supermeshStep).toContain('I_{R_{1}}');
    expect(supermeshStep).toContain('\\text{Substitute } I_{R_{1}}');

    const mna = new MNASolver(circuit).solve();
    const ir1Mna = ((mna.nodeVoltages.n1 ?? 0) - (mna.nodeVoltages.n2 ?? 0)) / 5;
    const ir2Mna = (mna.nodeVoltages.n2 ?? 0) / 10;
    expect(trace.meshCurrents?.I_1).toBeCloseTo(ir1Mna, 9);
    expect(trace.meshCurrents?.I_2).toBeCloseTo(ir2Mna, 9);
  });

  it('Test H (Mesh VCCS Supermesh): detects supermesh with VCCS, constraint equation and symbolic substitution of target voltage', () => {
    const circuit: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 24 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 4 },
      { id: 'G1', type: 'vccs', positive: 'n2', negative: '0', targetId: 'R1', gain: 0.5 },
      { id: 'R2', type: 'resistor', positive: 'n2', negative: '0', resistance: 8 },
    ];
    const geom: MeshGeometry = {
      branches: [
        { id: 'V1', path: [[0, 0], [0, 100]] },
        { id: 'R1', path: [[0, 0], [100, 0]] },
        { id: 'G1', path: [[100, 0], [100, 100]] },
        { id: 'R2', path: [[200, 0], [200, 100]] },
      ],
      wires: [
        { id: 'wb1', path: [[0, 100], [100, 100]] },
        { id: 'wt2', path: [[100, 0], [200, 0]] },
        { id: 'wb2', path: [[100, 100], [200, 100]] },
      ],
    };

    const system = buildMeshSystem(circuit, geom);
    expect(system.cycles).toHaveLength(2);
    expect(system.currentConstraints).toHaveLength(1);

    const trace = new MeshSolver(circuit, geom).analyze();
    expect(trace.status).toBe('ready');

    const supermeshStep = trace.steps.find((s) => s.title.includes('Supermesh'))?.math ?? '';
    expect(supermeshStep).toContain('V_{R_{1}}');
    expect(supermeshStep).toContain('\\text{Substitute } V_{R_{1}}');

    const mna = new MNASolver(circuit).solve();
    const ir1Mna = ((mna.nodeVoltages.n1 ?? 0) - (mna.nodeVoltages.n2 ?? 0)) / 4;
    const ir2Mna = (mna.nodeVoltages.n2 ?? 0) / 8;
    expect(trace.meshCurrents?.I_1).toBeCloseTo(ir1Mna, 9);
    expect(trace.meshCurrents?.I_2).toBeCloseTo(ir2Mna, 9);
  });

  it('Test I (Mesh CCVS in Standard KVL): includes symbolic CCVS term and substitution in KVL step', () => {
    const circuit: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 24 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 4 },
      { id: 'H1', type: 'ccvs', positive: 'n2', negative: 'n3', targetId: 'R2', gain: 2 },
      { id: 'R_shared', type: 'resistor', positive: 'n3', negative: '0', resistance: 8 },
      { id: 'R2', type: 'resistor', positive: 'n3', negative: '0', resistance: 8 },
    ];
    const geom: MeshGeometry = {
      branches: [
        { id: 'V1', path: [[0, 0], [0, 100]] },
        { id: 'R1', path: [[0, 0], [100, 0]] },
        { id: 'H1', path: [[100, 0], [100, 50]] },
        { id: 'R_shared', path: [[100, 50], [100, 100]] },
        { id: 'R2', path: [[200, 0], [200, 100]] },
      ],
      wires: [
        { id: 'wb1', path: [[0, 100], [100, 100]] },
        { id: 'wt2', path: [[100, 50], [200, 0]] },
        { id: 'wb2', path: [[100, 100], [200, 100]] },
      ],
    };

    const trace = new MeshSolver(circuit, geom).analyze();
    expect(trace.status).toBe('ready');

    const kvlStep = trace.steps.find((s) => s.title.includes('KVL loop equations'))?.math ?? '';
    expect(kvlStep).toContain('H_{1}');
    expect(kvlStep).toContain('\\text{Substitute } I_{R_{2}}');

    const mna = new MNASolver(circuit).solve();
    expect(trace.result?.nodeVoltages.n1).toBeCloseTo(mna.nodeVoltages.n1, 8);
  });
});
