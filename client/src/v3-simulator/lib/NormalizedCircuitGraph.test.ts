import { describe, expect, it } from 'vitest';
import { getDef } from './componentDefs';
import type { CircuitComponent, CircuitWire } from './circuitTypes';
import { NormalizedCircuitGraph, splitNormalizedSegments } from './NormalizedCircuitGraph';
import { getTerminalWorldPos } from './wiring';

const component = (id: string, type: string, x: number, y: number, rotation = 0): CircuitComponent => ({ id, type, x, y, rotation, flipH: false, flipV: false, label: id, props: {} });
const point = (item: CircuitComponent, terminalId: string) => {
  const terminal = getDef(item.type)!.terminals.find((candidate) => candidate.id === terminalId)!;
  return getTerminalWorldPos(item.x, item.y, terminal.x, terminal.y, item.rotation, item.flipH, item.flipV);
};
const wire = (id: string, from: CircuitComponent, fromTerm: string, to: CircuitComponent, toTerm: string): CircuitWire => ({
  id, fromComp: from.id, fromTerm, toComp: to.id, toTerm,
  path: [point(from, fromTerm), point(to, toTerm)], routing: 'straight',
});

describe('NormalizedCircuitGraph', () => {
  it('splits collinear rails at branch vertices and retains every resistor-containing bounded face', () => {
    const source = component('I1', 'dc-current', 0, 100);
    const r1 = component('R1', 'resistor', 100, 100, 90);
    const r2 = component('R2', 'resistor', 200, 100, 90);
    const ground = component('GND', 'ground', 0, 220);
    const wires = [
      wire('top-1', source, 'pos', r1, 'a'), wire('top-2', r1, 'a', r2, 'a'),
      wire('bottom-1', source, 'neg', r1, 'b'), wire('bottom-2', r1, 'b', r2, 'b'),
      wire('reference-stub', source, 'neg', ground, 'gnd'),
    ];
    const graph = NormalizedCircuitGraph.fromCanvas([source, r1, r2, ground], wires);
    expect(graph.topology.expectedMeshCount).toBe(2);
    expect(graph.topology.extractedFaceCount).toBe(2);
    expect(graph.faces.map((face) => face.branchIds.sort())).toEqual(expect.arrayContaining([
      expect.arrayContaining(['I1', 'R1']), expect.arrayContaining(['R1', 'R2']),
    ]));
    expect(graph.essentialJunctions).toHaveLength(1);
    expect(graph.essentialJunctions[0].degree).toBe(3);
    // T-junction vertex at R1 pin 'a' is at [100, 70], badge offset by textOffset
    expect(graph.essentialJunctions[0].point).toEqual([100, 70]);
    expect(graph.essentialJunctions[0].textOffset).toEqual([0, -14]);
  });

  it('places badge on principal active component terminal pin offset by (-14, -10) for 2-terminal branch and filters ghost nets', () => {
    const source = component('V1', 'dc-voltage', 100, 200); // pos pin at [100, 170], neg pin at [100, 230]
    const r1 = component('R1', 'resistor', 200, 170); // a pin at [170, 170], b pin at [230, 170]
    const ground = component('GND', 'ground', 100, 300);
    // Unconnected component (has isolated pins with 0 connections)
    const orphan = component('R_orphan', 'resistor', 500, 500);

    const wires = [
      wire('w1', source, 'pos', r1, 'a'),
      wire('w_gnd', source, 'neg', ground, 'gnd'),
    ];

    const graph = NormalizedCircuitGraph.fromCanvas([source, r1, ground, orphan], wires);
    // Ghost net with <= 1 terminal (orphan or dangling r1.b) must be completely filtered out
    const activeJunctions = graph.essentialJunctions;
    expect(activeJunctions).toHaveLength(1);
    // Source pos is at [100, 170], resistor is at [170, 170], midpoint is [135, 170]
    expect(activeJunctions[0].point).toEqual([135, 170]);
    expect(activeJunctions[0].textOffset).toEqual([0, -12]);
  });

  it('splits an actual crossing into a graph vertex instead of silently allowing a half-edge pass-through', () => {
    const split = splitNormalizedSegments([
      { id: 'horizontal', from: [0, 0], to: [100, 0] },
      { id: 'vertical', from: [50, -50], to: [50, 50] },
    ]);
    expect(split).toHaveLength(4);
    expect(split.filter((segment) => segment.from[0] === 50 && segment.from[1] === 0 || segment.to[0] === 50 && segment.to[1] === 0)).toHaveLength(4);
  });
});
