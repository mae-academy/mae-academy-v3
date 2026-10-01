import { describe, expect, it } from 'vitest';
import { getDef } from '@shared/logic/componentDefs';
import type { CircuitComponent, CircuitWire } from '@shared/logic/circuitTypes';
import { NormalizedCircuitGraph, splitNormalizedSegments } from '@shared/logic/NormalizedCircuitGraph';
import { getTerminalWorldPos } from '@shared/logic/wiring';

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
