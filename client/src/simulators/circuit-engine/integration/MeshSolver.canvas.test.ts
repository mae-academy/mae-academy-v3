import { describe, expect, it } from 'vitest';
import katex from 'katex';
import {
  assembleMeshImpedance,
  assembleMeshSource,
  buildMeshSystem,
  calculateMeshArrowRadius,
  calculateMeshCavity,
  calculateMeshCentroid,
  MeshSolver,
  reconstructBranchCurrents,
  solveMeshCurrents,
} from '../../../../../api/_lib/circuit/engine/MeshSolver';
import { MNASolver, type MNAElement } from '../../../../../api/_lib/circuit/engine/mnaSolver';
import { compileMeshGeometry, type MeshGeometry } from '@/simulators/circuit-engine/components/meshGeometry';
import type { CircuitComponent, CircuitWire } from '@shared/circuit/circuitTypes';
import { NormalizedCircuitGraph } from '@/simulators/circuit-engine/models/NormalizedCircuitGraph';
import { compileDcTopology } from '../../../../../api/_lib/circuit/engine/compileDc';

const threeMeshCircuit: MNAElement[] = [
  { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 1000 },
  { id: 'R2', type: 'resistor', positive: 'n2', negative: 'n3', resistance: 1000 },
  { id: 'R3', type: 'resistor', positive: 'n3', negative: 'n4', resistance: 1000 },
  { id: 'R4', type: 'resistor', positive: 'n1', negative: '0', resistance: 2000 },
  { id: 'R5', type: 'resistor', positive: 'n2', negative: '0', resistance: 2000 },
  { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 24 },
  { id: 'V2', type: 'voltage', positive: 'n4', negative: '0', voltage: 12 },
];

/**
 * Two clockwise rectangular faces. R_shared is the common vertical branch;
 * V_left is crossed − → + in mesh 1 while V_right is crossed + → − in mesh 2.
 */
const fiveResistorTwoMesh: MNAElement[] = [
  { id: 'V_left', type: 'voltage', positive: 'n:a', negative: '0', voltage: 24 },
  { id: 'R1', type: 'resistor', positive: 'n:a', negative: 'n:b', resistance: 5 },
  { id: 'R_shared', type: 'resistor', positive: 'n:b', negative: 'n:e', resistance: 11 },
  { id: 'R3', type: 'resistor', positive: 'n:e', negative: '0', resistance: 7 },
  { id: 'R4', type: 'resistor', positive: 'n:b', negative: 'n:c', resistance: 13 },
  { id: 'V_right', type: 'voltage', positive: 'n:c', negative: 'n:f', voltage: 10 },
  { id: 'R5', type: 'resistor', positive: 'n:f', negative: 'n:e', resistance: 17 },
];

const fiveResistorGeometry: MeshGeometry = {
  branches: [
    { id: 'V_left', path: [[0, 0], [0, 100]] },
    { id: 'R1', path: [[0, 0], [100, 0]] },
    { id: 'R_shared', path: [[100, 0], [100, 100]] },
    { id: 'R3', path: [[100, 100], [0, 100]] },
    { id: 'R4', path: [[100, 0], [200, 0]] },
    { id: 'V_right', path: [[200, 0], [200, 100]] },
    { id: 'R5', path: [[200, 100], [100, 100]] },
  ],
  wires: [],
};

/** Five-resistor, one-source two-mesh textbook topology; the right perimeter is a conductor. */
const fiveResistorOneSource: MNAElement[] = [
  { id: 'V_left', type: 'voltage', positive: 'n:a', negative: '0', voltage: 24 },
  { id: 'R1', type: 'resistor', positive: 'n:a', negative: 'n:b', resistance: 5 },
  { id: 'R_shared', type: 'resistor', positive: 'n:b', negative: 'n:e', resistance: 11 },
  { id: 'R3', type: 'resistor', positive: 'n:e', negative: '0', resistance: 7 },
  { id: 'R4', type: 'resistor', positive: 'n:b', negative: 'n:c', resistance: 13 },
  { id: 'R5', type: 'resistor', positive: 'n:c', negative: 'n:e', resistance: 17 },
];

const fiveResistorOneSourceGeometry: MeshGeometry = {
  branches: fiveResistorGeometry.branches.filter((branch) => branch.id !== 'V_right'),
  wires: [{ id: 'right-perimeter', path: [[200, 0], [200, 100]] }],
};

const threeFaceElements: MNAElement[] = ['LT', 'MT', 'RT', 'RM', 'BL', 'BR', 'LV', 'CT', 'CB', 'MID'].map((id, index) => ({ type: 'resistor' as const, id, positive: `n${index}`, negative: `n${index + 1}`, resistance: 10 }));
const threeFaceGeometry: MeshGeometry = {
  branches: [
    { id: 'LT', path: [[0, 0], [100, 0]] }, { id: 'MT', path: [[100, 0], [300, 0]] },
    { id: 'RT', path: [[300, 0], [300, 100]] }, { id: 'RM', path: [[300, 100], [300, 200]] },
    { id: 'BL', path: [[0, 200], [100, 200]] }, { id: 'BR', path: [[100, 200], [300, 200]] },
    { id: 'LV', path: [[0, 0], [0, 200]] }, { id: 'CT', path: [[100, 0], [100, 100]] },
    { id: 'CB', path: [[100, 100], [100, 200]] }, { id: 'MID', path: [[100, 100], [300, 100]] },
  ],
  wires: [],
};

const parallelRailElements: MNAElement[] = [
  { id: 'I_left', type: 'current', from: 'top', to: '0', current: 1 },
  { id: 'R1', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
  { id: 'R2', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
  { id: 'R3', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
  { id: 'I_right', type: 'current', from: 'top', to: '0', current: -0.5 },
  { id: 'R4', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
];
const parallelRailGeometry: MeshGeometry = {
  branches: [
    { id: 'I_left', path: [[0, 0], [0, 200]] }, { id: 'R1', path: [[100, 0], [100, 200]] },
    { id: 'R2', path: [[200, 0], [200, 200]] }, { id: 'R3', path: [[300, 0], [300, 200]] },
    { id: 'I_right', path: [[400, 0], [400, 200]] }, { id: 'R4', path: [[500, 0], [500, 200]] },
  ],
  wires: [{ id: 'top-rail', path: [[0, 0], [500, 0]] }, { id: 'bottom-rail', path: [[0, 200], [500, 200]] }],
};

describe('Mesh-current coefficient system', () => {
  it('ignores visual ground stubs without removing the rail wire used by planar face extraction', () => {
    const components: CircuitComponent[] = [{ id: 'GND1', type: 'ground', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'GND1', props: {} }];
    const wires: CircuitWire[] = [
      { id: 'rail', fromComp: 'left', fromTerm: 'b', toComp: 'right', toTerm: 'a', path: [[0, 0], [100, 0]], routing: 'straight' },
      { id: 'ground-stub', fromComp: 'left', fromTerm: 'b', toComp: 'GND1', toTerm: 'gnd', path: [[0, 0], [0, 60]], routing: 'orthogonal' },
    ];
    expect(compileMeshGeometry(components, wires).wires.map((wire) => wire.id)).toEqual(['rail']);
  });

  it('creates a 3 × 3 impedance system for a three-mesh planar circuit', () => {
    const system = buildMeshSystem(threeMeshCircuit);
    expect(system.cycles).toHaveLength(3);
    expect(system.impedance).toHaveLength(3);
    expect(system.impedance.every((row) => row.length === 3)).toBe(true);
    expect(system.source).toHaveLength(3);
  });

  it('exposes the solved I_1 through I_3 vector in the academic trace', () => {
    const trace = new MeshSolver(threeMeshCircuit).analyze();
    expect(trace.status).toBe('ready');
    expect(Object.keys(trace.meshCurrents ?? {})).toEqual(['I_1', 'I_2', 'I_3']);
    expect(trace.steps.some((step) => step.title.includes('Solved mesh-current vector') && step.math.includes('I_{1}'))).toBe(true);
  });

  it('uses negative off-diagonal coupling for a shared resistor in two clockwise meshes', () => {
    const system = buildMeshSystem(fiveResistorTwoMesh, fiveResistorGeometry);
    expect(system.impedance).toEqual([[23, -11], [-11, 41]]);
    expect(system.impedance[0][1]).toBeLessThan(0);
    expect(system.impedance[1][0]).toBeLessThan(0);
  });

  it('matches the exact five-resistor, one-source textbook mesh system', () => {
    const system = buildMeshSystem(fiveResistorOneSource, fiveResistorOneSourceGeometry);
    expect(system.impedance).toEqual([[23, -11], [-11, 41]]);
    expect(system.source).toEqual([24, 0]);
    expect(system.meshCycles).toHaveLength(2);
  });

  it('places voltage rises and drops in the correct clockwise source-vector rows', () => {
    const system = buildMeshSystem(fiveResistorTwoMesh, fiveResistorGeometry);
    expect(system.source).toEqual([24, -10]);
    expect(system.meshCycles).toHaveLength(2);
    expect(system.meshCycles.map((cycle) => cycle.centroid)).toEqual([[50, 50], [150, 50]]);
  });

  it('calculates the bounding-box center and a 25%-minimum-dimension radius for a 100 × 100 rectangular mesh', () => {
    const rectangle: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const centroid = calculateMeshCentroid(rectangle);
    expect(centroid).toEqual([50, 50]);
    expect(calculateMeshArrowRadius(rectangle, centroid)).toBe(25);
  });

  it('uses the exact perimeter-box center and safe radius for a non-square mesh face', () => {
    const rectangle: Array<[number, number]> = [[10, 20], [210, 20], [210, 80], [10, 80]];
    expect(calculateMeshCentroid(rectangle)).toEqual([110, 50]);
    expect(calculateMeshArrowRadius(rectangle)).toBe(15);
  });

  it('re-anchors the cavity center and radius inside a concave (L-shaped/staircase) mesh face', () => {
    // A bbox-midpoint would fall in the outer notch of this face.
    const lShape: Array<[number, number]> = [[0, 0], [200, 0], [200, 100], [100, 100], [100, 200], [0, 200]];
    const pointInPolygon = (point: [number, number], polygon: Array<[number, number]>) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if (((yi > point[1]) !== (yj > point[1])) && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    };
    const { center, radius } = calculateMeshCavity(lShape);
    expect(pointInPolygon(center, lShape)).toBe(true);
    for (let angle = 0; angle < 360; angle += 5) {
      const radians = (angle * Math.PI) / 180;
      const sample: [number, number] = [center[0] + radius * Math.cos(radians), center[1] + radius * Math.sin(radians)];
      expect(pointInPolygon(sample, lShape)).toBe(true);
    }
  });

  it('assigns three adjacent faces independent local boxes so top-right and bottom-right mesh labels cannot collide', () => {
    const cycles = buildMeshSystem(threeFaceElements, threeFaceGeometry).meshCycles;
    expect(cycles).toHaveLength(3);
    expect(cycles.map((cycle) => cycle.centroid)).toEqual([[50, 100], [200, 50], [200, 150]]);
    expect(cycles.map((cycle) => cycle.radius)).toEqual([25, 25, 25]);
    expect(cycles[1].centroid[1]).toBeLessThan(cycles[2].centroid[1]);
  });

  it('merges two rails into two nets, extracts five bounded parallel faces, and replaces current-source KVL rows with Supermesh constraints', () => {
    const system = buildMeshSystem(parallelRailElements, parallelRailGeometry);
    expect(system.topology).toMatchObject({ branchCount: 6, netCount: 2, connectedComponents: 1, expectedMeshCount: 5, extractedFaceCount: 5 });
    expect(system.fullRank).toBe(true);
    expect(system.rank).toBe(system.cycles.length);
    expect(system.meshCycles).toHaveLength(5);
    expect(system.meshCycles).toHaveLength(system.topology.expectedMeshCount);
    expect(system.meshCycles[0]).toMatchObject({ branchIds: expect.arrayContaining(['I_left', 'R1']), centroid: [50, 100] });
    expect(system.currentConstraints).toHaveLength(2);
    expect(system.currentConstraints.map((constraint) => constraint.sourceId)).toEqual(['I_left', 'I_right']);
    expect(system.currentConstraints[0].coefficients[0]).not.toBe(0);
    expect(() => solveMeshCurrents(system.impedance, system.source)).not.toThrow();
    const trace = new MeshSolver(parallelRailElements, parallelRailGeometry).analyze();
    expect(trace.status).toBe('ready');
    expect(trace.steps.some((step) => step.title.includes('Supermesh constraints'))).toBe(true);
  });

  it('emits a colored matrix string parsed cleanly by display-mode KaTeX', () => {
    const trace = new MeshSolver(fiveResistorOneSource, fiveResistorOneSourceGeometry).analyze();
    const matrix = trace.steps.find((step) => step.title.includes('assembled mesh-current coefficient system'))?.math ?? '';
    expect(matrix).toContain('\\color{#2563eb}{23}');
    expect(matrix).not.toContain('\\textcolor{');
    expect(katex.renderToString(matrix, { displayMode: true, throwOnError: false })).not.toContain('katex-error');
  });

  it('Test A (2-Mesh Shared Current Source): correctly merges supermesh KVL row and matches theoretical values and MNA', () => {
    const testACircuit: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 10 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 5 },
      { id: 'Is', type: 'current', from: '0', to: 'n2', current: 2 },
      { id: 'R2', type: 'resistor', positive: 'n2', negative: '0', resistance: 10 },
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
    // Row 0 is the current constraint: -I_1 + I_2 = 2
    expect(system.impedance[0]).toEqual([-1, 1]);
    expect(system.source[0]).toBe(2);
    // Row 1 is the merged Supermesh KVL row: 5*I_1 + 10*I_2 = 10
    expect(system.impedance[1]).toEqual([5, 10]);
    expect(system.source[1]).toBe(10);

    const solved = solveMeshCurrents(system.impedance, system.source);
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

  it('Test B (3-Mesh Double Supermesh): merges all constituent loop rows into a single supermesh KVL row with 2 constraints', () => {
    const testBCircuit: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 20 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 4 },
      { id: 'Is1', type: 'current', from: '0', to: 'n2', current: 2 },
      { id: 'R2', type: 'resistor', positive: 'n2', negative: 'n3', resistance: 2 },
      { id: 'Is2', type: 'current', from: '0', to: 'n3', current: 1 },
      { id: 'R3', type: 'resistor', positive: 'n3', negative: '0', resistance: 6 },
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

  it('correctly constructs [[5000, -4000], [-4000, 5000]] matrix and matches MNA for canvas 2-mesh ladder with shared R2(4k)', () => {
    const v1: CircuitComponent = { id: 'V1', type: 'dc-voltage', x: 100, y: 200, rotation: 270, flipH: false, flipV: false, label: 'V1', props: { voltage: 20 } };
    const r1: CircuitComponent = { id: 'R1', type: 'resistor', x: 200, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 1000 } };
    const r2: CircuitComponent = { id: 'R2', type: 'resistor', x: 300, y: 200, rotation: 90, flipH: false, flipV: false, label: 'R2', props: { resistance: 4000 } };
    const r3: CircuitComponent = { id: 'R3', type: 'resistor', x: 400, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R3', props: { resistance: 1000 } };
    const v2: CircuitComponent = { id: 'V2', type: 'dc-voltage', x: 500, y: 200, rotation: 270, flipH: false, flipV: false, label: 'V2', props: { voltage: 40 } };
    const gnd: CircuitComponent = { id: 'GND', type: 'ground', x: 100, y: 350, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} };

    const comps = [v1, r1, r2, r3, v2, gnd];

    const wires: CircuitWire[] = [
      { id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a', path: [[70, 200], [70, 100], [170, 100]], routing: 'orthogonal' },
      { id: 'w2', fromComp: 'R1', fromTerm: 'b', toComp: 'R2', toTerm: 'a', path: [[230, 100], [300, 100], [300, 170]], routing: 'orthogonal' },
      { id: 'w3', fromComp: 'R2', fromTerm: 'a', toComp: 'R3', toTerm: 'a', path: [[300, 170], [300, 100], [370, 100]], routing: 'orthogonal' },
      { id: 'w4', fromComp: 'R3', fromTerm: 'b', toComp: 'V2', toTerm: 'pos', path: [[430, 100], [470, 100], [470, 200]], routing: 'orthogonal' },
      { id: 'w5', fromComp: 'V1', fromTerm: 'neg', toComp: 'R2', toTerm: 'b', path: [[130, 200], [130, 225], [300, 225], [300, 230]], routing: 'orthogonal' },
      { id: 'w6', fromComp: 'R2', fromTerm: 'b', toComp: 'V2', toTerm: 'neg', path: [[300, 230], [300, 225], [530, 225], [530, 200]], routing: 'orthogonal' },
      { id: 'w7', fromComp: 'V1', fromTerm: 'neg', toComp: 'GND', toTerm: 'gnd', path: [[130, 200], [100, 350]], routing: 'orthogonal' },
    ];

    const graph = NormalizedCircuitGraph.fromCanvas(comps, wires);
    expect(graph.faces).toHaveLength(2);

    const meshGeom = compileMeshGeometry(comps, wires, graph);
    const mnaElements: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 20 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 1000 },
      { id: 'R2', type: 'resistor', positive: 'n2', negative: '0', resistance: 4000 },
      { id: 'R3', type: 'resistor', positive: 'n2', negative: 'n3', resistance: 1000 },
      { id: 'V2', type: 'voltage', positive: 'n3', negative: '0', voltage: 40 },
    ];

    const system = buildMeshSystem(mnaElements, meshGeom);
    // Mesh 1: R1 + R2 = 1000 + 4000 = 5000
    // Mesh 2: R2 + R3 = 4000 + 1000 = 5000
    // Shared: -R2 = -4000
    expect(system.impedance).toEqual([
      [5000, -4000],
      [-4000, 5000],
    ]);

    const trace = new MeshSolver(mnaElements, meshGeom).analyze();
    expect(trace.status).toBe('ready');

    const i1 = trace.meshCurrents?.['I_1']!;
    const i2 = trace.meshCurrents?.['I_2']!;

    // Mesh currents must match MNA branch currents
    expect(Math.abs(trace.result!.branchCurrents['V1'] + i1)).toBeLessThan(1e-9);
    expect(Math.abs(trace.result!.branchCurrents['V2'] - i2)).toBeLessThan(1e-9);
  });

  it('Pillage Chapter 1 & 2 Benchmark: validates 2-mesh ladder with V1(12V), R1(1k), R2(4k), R3(1k), V2(24V)', () => {
    // Schematic matching Pillage Sec 1.4 & 2.2:
    // Left loop (Mesh 1): 12 V DC source (V1), R1 = 1 kΩ on top rail, shared branch R2 = 4 kΩ to ground.
    // Right loop (Mesh 2): Shared branch R2 = 4 kΩ, R3 = 1 kΩ on top rail, right branch 24 V DC source (V2).
    const v1: CircuitComponent = { id: 'V1', type: 'dc-voltage', x: 100, y: 200, rotation: 270, flipH: false, flipV: false, label: 'V1', props: { voltage: 12 } };
    const r1: CircuitComponent = { id: 'R1', type: 'resistor', x: 200, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 1000 } };
    const r2: CircuitComponent = { id: 'R2', type: 'resistor', x: 300, y: 200, rotation: 90, flipH: false, flipV: false, label: 'R2', props: { resistance: 4000 } };
    const r3: CircuitComponent = { id: 'R3', type: 'resistor', x: 400, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R3', props: { resistance: 1000 } };
    const v2: CircuitComponent = { id: 'V2', type: 'dc-voltage', x: 500, y: 200, rotation: 270, flipH: false, flipV: false, label: 'V2', props: { voltage: 24 } };
    const gnd: CircuitComponent = { id: 'GND', type: 'ground', x: 100, y: 350, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} };

    const comps = [v1, r1, r2, r3, v2, gnd];

    const wires: CircuitWire[] = [
      { id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a', path: [[70, 200], [70, 100], [170, 100]], routing: 'orthogonal' },
      { id: 'w2', fromComp: 'R1', fromTerm: 'b', toComp: 'R2', toTerm: 'a', path: [[230, 100], [300, 100], [300, 170]], routing: 'orthogonal' },
      { id: 'w3', fromComp: 'R2', fromTerm: 'a', toComp: 'R3', toTerm: 'a', path: [[300, 170], [300, 100], [370, 100]], routing: 'orthogonal' },
      { id: 'w4', fromComp: 'R3', fromTerm: 'b', toComp: 'V2', toTerm: 'pos', path: [[430, 100], [470, 100], [470, 200]], routing: 'orthogonal' },
      { id: 'w5', fromComp: 'V1', fromTerm: 'neg', toComp: 'R2', toTerm: 'b', path: [[130, 200], [130, 225], [300, 225], [300, 230]], routing: 'orthogonal' },
      { id: 'w6', fromComp: 'R2', fromTerm: 'b', toComp: 'V2', toTerm: 'neg', path: [[300, 230], [300, 225], [530, 225], [530, 200]], routing: 'orthogonal' },
      { id: 'w7', fromComp: 'V1', fromTerm: 'neg', toComp: 'GND', toTerm: 'gnd', path: [[130, 200], [100, 350]], routing: 'orthogonal' },
    ];

    const graph = NormalizedCircuitGraph.fromCanvas(comps, wires);
    expect(graph.faces).toHaveLength(2);

    const meshGeom = compileMeshGeometry(comps, wires, graph);
    const mnaElements: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 12 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 1000 },
      { id: 'R2', type: 'resistor', positive: 'n2', negative: '0', resistance: 4000 },
      { id: 'R3', type: 'resistor', positive: 'n2', negative: 'n3', resistance: 1000 },
      { id: 'V2', type: 'voltage', positive: 'n3', negative: '0', voltage: 24 },
    ];

    const system = buildMeshSystem(mnaElements, meshGeom);

    // Expected Matrix Equations:
    // Z_m = [[1000 + 4000, -4000], [-4000, 4000 + 1000]] = [[5000, -4000], [-4000, 5000]]
    expect(system.impedance).toEqual([
      [5000, -4000],
      [-4000, 5000],
    ]);
    // E_m = [12, -24]
    expect(system.source).toEqual([12, -24]);

    // Verify determinant: det(Z_m) = 5000^2 - (-4000)^2 = 9 * 10^6
    const det = system.impedance[0][0] * system.impedance[1][1] - system.impedance[0][1] * system.impedance[1][0];
    expect(det).toBe(9_000_000);

    // Verify solved currents:
    // I1 = (12(5000) + (-24)(4000)) / (9 * 10^6) = -0.004 A (-4 mA)
    // I2 = (5000(-24) - (-4000)(12)) / (9 * 10^6) = -0.008 A (-8 mA)
    const solved = solveMeshCurrents(system.impedance, system.source);
    expect(solved[0]).toBeCloseTo(-0.004, 12);
    expect(solved[1]).toBeCloseTo(-0.008, 12);

    const trace = new MeshSolver(mnaElements, meshGeom).analyze();
    expect(trace.status).toBe('ready');
    expect(trace.meshCurrents?.I_1).toBeCloseTo(-0.004, 12);
    expect(trace.meshCurrents?.I_2).toBeCloseTo(-0.008, 12);

    // Verify MNA solution matches exactly:
    const mna = new MNASolver(mnaElements).solve();
    expect(mna.nodeVoltages['n1']).toBeCloseTo(12, 10);
    expect(mna.nodeVoltages['n2']).toBeCloseTo(16, 10);
    expect(mna.nodeVoltages['n3']).toBeCloseTo(24, 10);

    // Branch currents:
    // i_R1 = (V(n1) - V(n2)) / 1000 = -0.004 A = I1
    expect(mna.branchCurrents['R1']).toBeCloseTo(-0.004, 10);
    expect(mna.branchCurrents['R1']).toBeCloseTo(trace.meshCurrents!.I_1, 10);

    // i_R2 = (V(n2) - 0) / 4000 = 0.004 A = I1 - I2
    expect(mna.branchCurrents['R2']).toBeCloseTo(0.004, 10);
    expect(mna.branchCurrents['R2']).toBeCloseTo(trace.meshCurrents!.I_1 - trace.meshCurrents!.I_2, 10);

    // i_R3 = (V(n2) - V(n3)) / 1000 = -0.008 A = I2
    expect(mna.branchCurrents['R3']).toBeCloseTo(-0.008, 10);
    expect(mna.branchCurrents['R3']).toBeCloseTo(trace.meshCurrents!.I_2, 10);

    // Reconstruct branch currents helper test:
    const reconstructed = reconstructBranchCurrents(mnaElements, system.cycles, solved);
    expect(reconstructed['R1']).toBeCloseTo(mna.branchCurrents['R1'], 10);
    expect(reconstructed['R2']).toBeCloseTo(mna.branchCurrents['R2'], 10);
    expect(reconstructed['R3']).toBeCloseTo(mna.branchCurrents['R3'], 10);
    expect(reconstructed['V1']).toBeCloseTo(mna.branchCurrents['V1'], 10);
    expect(reconstructed['V2']).toBeCloseTo(mna.branchCurrents['V2'], 10);
  });

  it('screenshot circuit: V1(12V), R1(4Ω), R2(10Ω), V2(10V), R3(2Ω)', () => {
    const v1: CircuitComponent = { id: 'V1', type: 'dc-voltage', x: 100, y: 200, rotation: 0, flipH: false, flipV: false, label: 'V1', props: { voltage: 12 } };
    const r1: CircuitComponent = { id: 'R1', type: 'resistor', x: 200, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 4 } };
    const r2: CircuitComponent = { id: 'R2', type: 'resistor', x: 300, y: 200, rotation: 90, flipH: false, flipV: false, label: 'R2', props: { resistance: 10 } };
    const v2: CircuitComponent = { id: 'V2', type: 'dc-voltage', x: 400, y: 100, rotation: 270, flipH: false, flipV: false, label: 'V2', props: { voltage: 10 } };
    const r3: CircuitComponent = { id: 'R3', type: 'resistor', x: 500, y: 200, rotation: 90, flipH: false, flipV: false, label: 'R3', props: { resistance: 2 } };
    const gnd: CircuitComponent = { id: 'GND', type: 'ground', x: 300, y: 350, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} };

    const comps = [v1, r1, r2, v2, r3, gnd];
    const wires: CircuitWire[] = [
      { id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a', path: [[100, 170], [100, 100], [170, 100]], routing: 'orthogonal' },
      { id: 'w2', fromComp: 'R1', fromTerm: 'b', toComp: 'R2', toTerm: 'a', path: [[230, 100], [300, 100], [300, 170]], routing: 'orthogonal' },
      { id: 'w3', fromComp: 'R2', fromTerm: 'a', toComp: 'V2', toTerm: 'pos', path: [[300, 170], [300, 100], [370, 100]], routing: 'orthogonal' },
      { id: 'w4', fromComp: 'V2', fromTerm: 'neg', toComp: 'R3', toTerm: 'a', path: [[430, 100], [500, 100], [500, 170]], routing: 'orthogonal' },
      { id: 'w5', fromComp: 'V1', fromTerm: 'neg', toComp: 'R2', toTerm: 'b', path: [[100, 230], [300, 230]], routing: 'orthogonal' },
      { id: 'w6', fromComp: 'R2', fromTerm: 'b', toComp: 'R3', toTerm: 'b', path: [[300, 230], [500, 230]], routing: 'orthogonal' },
      { id: 'w7', fromComp: 'R2', fromTerm: 'b', toComp: 'GND', toTerm: 'gnd', path: [[300, 230], [300, 350]], routing: 'orthogonal' },
    ];

    const graph = NormalizedCircuitGraph.fromCanvas(comps, wires);
    expect(graph.faces).toHaveLength(2);

    const meshGeom = compileMeshGeometry(comps, wires, graph);
    const elementsFromCanvas = compileDcTopology(comps, wires, graph);
    console.log('ELEMENTS FROM CANVAS:', elementsFromCanvas);
    const mnaFromCanvas = new MNASolver(elementsFromCanvas).solve();
    console.log('MNA FROM CANVAS:', mnaFromCanvas);

    const mnaElements: MNAElement[] = [
      { id: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 12 },
      { id: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 4 },
      { id: 'R2', type: 'resistor', positive: 'n2', negative: '0', resistance: 10 },
      { id: 'V2', type: 'voltage', positive: 'n2', negative: 'n3', voltage: 10 },
      { id: 'R3', type: 'resistor', positive: 'n3', negative: '0', resistance: 2 },
    ];

    const system = buildMeshSystem(mnaElements, meshGeom);
    console.log('FACES:', graph.faces.map(f => Object.fromEntries(f.branchDirections)));
    console.log('IMPEDANCE:', system.impedance);
    console.log('SOURCE:', system.source);

    const traceWithGeom = new MeshSolver(mnaElements, meshGeom).analyze();
    console.log('TRACE WITH GEOM SOURCE:', traceWithGeom);

    const traceWithoutGeom = new MeshSolver(mnaElements).analyze();
    console.log('TRACE WITHOUT GEOM SOURCE:', traceWithoutGeom);
  });

  // A face's signed traversal is only a valid mesh coefficient while each branch's geometric
  // orientation matches its MNAElement's. A current source flows neg -> pos (its arrow direction),
  // unlike a voltage source, so orienting its geometry pos -> neg silently inverts the supermesh
  // constraint and every branch current reconstructed from it.
  it('keeps current-source branch geometry oriented like its MNA element, so the supermesh constraint and reconstruction agree with MNA', () => {
    const comps: CircuitComponent[] = [
      { id: 'i1', type: 'dc-current', x: 300, y: 300, rotation: 0, flipH: false, flipV: false, label: 'I1', props: { current: 2 } },
      { id: 'r1', type: 'resistor', x: 500, y: 250, rotation: 90, flipH: false, flipV: false, label: 'R1', props: { resistance: 10 } },
      { id: 'g1', type: 'ground', x: 400, y: 450, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} },
    ];
    const wires: CircuitWire[] = [
      { id: 'w1', fromComp: 'i1', fromTerm: 'pos', toComp: 'r1', toTerm: 'a', path: [[300, 250], [500, 250]], routing: 'orthogonal' },
      { id: 'w2', fromComp: 'r1', fromTerm: 'b', toComp: 'g1', toTerm: 'gnd', path: [[500, 310], [500, 435], [400, 435]], routing: 'orthogonal' },
      { id: 'w3', fromComp: 'i1', fromTerm: 'neg', toComp: 'g1', toTerm: 'gnd', path: [[300, 350], [300, 435], [400, 435]], routing: 'orthogonal' },
    ];

    const graph = NormalizedCircuitGraph.fromCanvas(comps, wires);
    const elements = compileDcTopology(comps, wires, graph);
    const meshGeom = compileMeshGeometry(comps, wires, graph);
    const system = buildMeshSystem(elements, meshGeom);
    expect(system.cycles).toHaveLength(1);

    // Walking the loop 0 -> n1 through the source and n1 -> 0 through the resistor follows both
    // elements' own from -> to direction, so both coefficients are +1 (a circulation, not a cut).
    const cycle = system.cycles[0];
    expect(cycle.get('i1')).toBe(1);
    expect(cycle.get('r1')).toBe(1);
    expect(system.currentConstraints[0]).toMatchObject({ sourceId: 'i1', coefficients: [1], value: 2 });

    const mna = new MNASolver(elements).solve();
    const meshCurrents = solveMeshCurrents(system.impedance, system.source);
    const reconstructed = reconstructBranchCurrents(elements, system.cycles, meshCurrents);
    expect(reconstructed.i1).toBeCloseTo(mna.branchCurrents.i1, 9);
    expect(reconstructed.r1).toBeCloseTo(mna.branchCurrents.r1, 9);
    // 2 A pushed into the 10 Ω: the resistor carries +2 A from its own + terminal, never -2 A.
    expect(mna.branchCurrents.r1).toBeCloseTo(2, 9);
    expect(new MeshSolver(elements, meshGeom).analyze().status).toBe('ready');
  });
});

