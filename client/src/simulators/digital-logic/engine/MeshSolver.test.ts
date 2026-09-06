import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { buildMeshSystem, calculateMeshArrowRadius, calculateMeshCentroid, MeshSolver, solveMeshCurrents } from '@/simulators/digital-logic/engine/MeshSolver';
import type { MNAElement } from '@/simulators/digital-logic/engine/mnaSolver';
import { compileMeshGeometry, type MeshGeometry } from '@/simulators/digital-logic/components/meshGeometry';
import type { CircuitComponent, CircuitWire } from '@/simulators/digital-logic/models/circuitTypes';

const threeMeshCircuit: MNAElement[] = [
  { id: 'R1', name: 'R1', type: 'resistor', positive: 'n1', negative: 'n2', resistance: 1000 },
  { id: 'R2', name: 'R2', type: 'resistor', positive: 'n2', negative: 'n3', resistance: 1000 },
  { id: 'R3', name: 'R3', type: 'resistor', positive: 'n3', negative: 'n4', resistance: 1000 },
  { id: 'R4', name: 'R4', type: 'resistor', positive: 'n1', negative: '0', resistance: 2000 },
  { id: 'R5', name: 'R5', type: 'resistor', positive: 'n2', negative: '0', resistance: 2000 },
  { id: 'V1', name: 'V1', type: 'voltage', positive: 'n1', negative: '0', voltage: 24 },
  { id: 'V2', name: 'V2', type: 'voltage', positive: 'n4', negative: '0', voltage: 12 },
];

/**
 * Two clockwise rectangular faces. R_shared is the common vertical branch;
 * V_left is crossed − → + in mesh 1 while V_right is crossed + → − in mesh 2.
 */
const fiveResistorTwoMesh: MNAElement[] = [
  { id: 'V_left', name: 'V1', type: 'voltage', positive: 'n:a', negative: '0', voltage: 24 },
  { id: 'R1', name: 'R1', type: 'resistor', positive: 'n:a', negative: 'n:b', resistance: 5 },
  { id: 'R_shared', name: 'R2', type: 'resistor', positive: 'n:b', negative: 'n:e', resistance: 11 },
  { id: 'R3', name: 'R3', type: 'resistor', positive: 'n:e', negative: '0', resistance: 7 },
  { id: 'R4', name: 'R4', type: 'resistor', positive: 'n:b', negative: 'n:c', resistance: 13 },
  { id: 'V_right', name: 'V2', type: 'voltage', positive: 'n:c', negative: 'n:f', voltage: 10 },
  { id: 'R5', name: 'R5', type: 'resistor', positive: 'n:f', negative: 'n:e', resistance: 17 },
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
  { id: 'V_left', name: 'V1', type: 'voltage', positive: 'n:a', negative: '0', voltage: 24 },
  { id: 'R1', name: 'R1', type: 'resistor', positive: 'n:a', negative: 'n:b', resistance: 5 },
  { id: 'R_shared', name: 'R2', type: 'resistor', positive: 'n:b', negative: 'n:e', resistance: 11 },
  { id: 'R3', name: 'R3', type: 'resistor', positive: 'n:e', negative: '0', resistance: 7 },
  { id: 'R4', name: 'R4', type: 'resistor', positive: 'n:b', negative: 'n:c', resistance: 13 },
  { id: 'R5', name: 'R5', type: 'resistor', positive: 'n:c', negative: 'n:e', resistance: 17 },
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
  { id: 'I_left', name: 'I1', type: 'current', from: 'top', to: '0', current: 1 },
  { id: 'R1', name: 'R1', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
  { id: 'R2', name: 'R2', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
  { id: 'R3', name: 'R3', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
  { id: 'I_right', name: 'I2', type: 'current', from: 'top', to: '0', current: -0.5 },
  { id: 'R4', name: 'R4', type: 'resistor', positive: 'top', negative: '0', resistance: 10 },
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
    expect(matrix).toContain('\\textcolor{#3b82f6}{23}');
    expect(matrix).not.toContain('\\color{');
    expect(katex.renderToString(matrix, { displayMode: true, throwOnError: false })).not.toContain('katex-error');
  });
});
