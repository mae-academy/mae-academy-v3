import { describe, expect, it } from 'vitest';
import {
  ExtractionError,
  LAYOUT_COLUMN_PITCH,
  extractBooleanExpression,
  extractCircuitExpression,
  generateCircuitFromExpression,
  listCircuitOutputs,
  placeGeneratedCircuit,
} from '@/simulators/digital-logic/models/circuitExpressionExtractor';
import { deriveUniversalSynthesis } from './synthesisEngine';
import { synthesisDiagramToCircuit } from '@/simulators/digital-logic/models/circuitExpressionExtractor';
import { DiscreteEventLogicEngine } from './desLogicCore';
import { generateTruthTable, parseBooleanExpression } from '../../../shared/logic/logicEngine';
import type { CircuitComponent, CircuitWire } from '@shared/logic/circuitTypes';

const part = (id: string, type: string, label: string, props: Record<string, unknown> = {}, y = 0): CircuitComponent => ({ id, type, x: 0, y, rotation: 0, flipH: false, flipV: false, label, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [] });

const truth = (source: string, variables: string[]) => generateTruthTable(parseBooleanExpression(source).ast, variables).map(row => row.value);

/** Simulates a generated circuit with the DES engine for every input combination. */
const simulate = (circuit: { components: CircuitComponent[]; wires: CircuitWire[] }, variables: string[]) =>
  Array.from({ length: 2 ** variables.length }, (_, index) => {
    const components = circuit.components.map(component => {
      if (component.type !== 'digital-input' || !variables.includes(component.label)) return component;
      const bit = (index >> (variables.length - variables.indexOf(component.label) - 1)) & 1;
      return { ...component, props: { ...component.props, state: bit ? 'HIGH' : 'LOW' } };
    });
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit(components, circuit.wires);
    const output = components.find(component => component.type === 'digital-output') as CircuitComponent;
    return engine.getSnapshot().terminalVoltages[`${output.id}:in`] === 1;
  });

describe('Engine 1 · circuit → expression', () => {
  it('recovers F = A + B from inputs wired into an OR gate', () => {
    const components = [part('a', 'digital-input', 'A'), part('b', 'digital-input', 'B', {}, 75), part('g', 'gate-or', 'X1', { inputCount: 2 }), part('f', 'digital-output', 'F_1')];
    const wires = [wire('1', 'a', 'out', 'g', 'a'), wire('2', 'b', 'out', 'g', 'b'), wire('3', 'g', 'y', 'f', 'in')];
    expect(extractCircuitExpression(components, wires).expression).toBe('A + B');
  });

  it('maps NAND/NOR/XNOR/NOT to complemented forms and traces through T-junction nets', () => {
    const components = [
      part('a', 'digital-input', 'A'), part('b', 'digital-input', 'B', {}, 75), part('c', 'digital-input', 'C', {}, 150),
      part('nor', 'gate-nor', 'X1', { inputCount: 2 }), part('and', 'gate-and', 'X2', { inputCount: 2 }),
      part('xnor', 'gate-xnor', 'X3', { inputCount: 2 }), part('f', 'digital-output', 'F_1'),
    ];
    const wires = [
      wire('1', 'a', 'out', 'nor', 'a'), wire('2', 'b', 'out', 'nor', 'b'),
      wire('3', 'nor', 'y', 'and', 'a'),
      // C fans out through a junction to AND.b and XNOR.b
      wire('4', 'c', 'out', 'junc_1', 'p'), wire('5', 'junc_1', 'p', 'and', 'b'), wire('6', 'junc_1', 'p', 'xnor', 'b'),
      wire('7', 'and', 'y', 'xnor', 'a'), wire('8', 'xnor', 'y', 'f', 'in'),
    ];
    const result = extractCircuitExpression(components, wires);
    expect(result.expression).toBe("((A + B)' . C ^ C)'");
    expect(truth(result.expression, ['A', 'B', 'C'])).toEqual(truth("((A + B)' . C ^ C)'", ['A', 'B', 'C']));
  });

  it('lists every output and extracts the chosen one', () => {
    const components = [part('a', 'digital-input', 'A'), part('f2', 'digital-output', 'F_2'), part('f1', 'digital-output', 'F_1'), part('n', 'gate-not', 'X1')];
    const wires = [wire('1', 'a', 'out', 'f1', 'in'), wire('2', 'a', 'out', 'n', 'a'), wire('3', 'n', 'y', 'f2', 'in')];
    expect(listCircuitOutputs(components).map(output => output.label)).toEqual(['F_1', 'F_2']);
    expect(extractCircuitExpression(components, wires, 'f2').expression).toBe("A'");
    expect(extractCircuitExpression(components, wires, 'f1').expression).toBe('A');
  });

  it('assigns canonical letters to non-letter input labels and reports the renaming', () => {
    const components = [part('x', 'digital-input', 'SW1'), part('b', 'digital-input', 'B', {}, 75), part('g', 'gate-and', 'X1', { inputCount: 2 }), part('f', 'digital-output', 'F_1')];
    const wires = [wire('1', 'x', 'out', 'g', 'a'), wire('2', 'b', 'out', 'g', 'b'), wire('3', 'g', 'y', 'f', 'in')];
    const result = extractCircuitExpression(components, wires);
    expect(result.expression).toBe('A . B');
    expect(result.renamedInputs).toEqual({ SW1: 'A' });
  });

  it('treats inputs that share a letter as the same variable (appended sub-circuits reuse A, B, …)', () => {
    const components = [part('a1', 'digital-input', 'A'), part('a2', 'digital-input', 'A', {}, 300), part('b', 'digital-input', 'B', {}, 375), part('g', 'gate-or', 'X1', { inputCount: 2 }), part('f', 'digital-output', 'F_2')];
    const wires = [wire('1', 'a2', 'out', 'g', 'a'), wire('2', 'b', 'out', 'g', 'b'), wire('3', 'g', 'y', 'f', 'in')];
    expect(extractCircuitExpression(components, wires).expression).toBe('A + B');
  });

  it('refuses combinational feedback loops with a clear error instead of recursing forever', () => {
    const components = [part('a', 'digital-input', 'A'), part('g1', 'gate-nor', 'X1', { inputCount: 2 }), part('g2', 'gate-nor', 'X2', { inputCount: 2 }), part('f', 'digital-output', 'F_1')];
    const wires = [wire('1', 'a', 'out', 'g1', 'a'), wire('2', 'g2', 'y', 'g1', 'b'), wire('3', 'g1', 'y', 'g2', 'a'), wire('4', 'g1', 'y', 'f', 'in')];
    expect(() => extractCircuitExpression(components, wires)).toThrow(ExtractionError);
    expect(() => extractCircuitExpression(components, wires)).toThrow(/feedback loop/);
  });

  it('breaks sequential feedback at flip-flops and derives next-state equations', () => {
    const components = [
      part('j', 'digital-input', 'J'), part('k', 'digital-input', 'K', {}, 75),
      part('ff', 'logic-ff-jk', 'FF1'), part('f', 'digital-output', 'F_1'),
    ];
    const wires = [wire('1', 'j', 'out', 'ff', 'j'), wire('2', 'k', 'out', 'ff', 'k'), wire('3', 'ff', 'q', 'f', 'in')];
    const result = extractCircuitExpression(components, wires);
    expect(result.expression).toBe('Q');
    expect(result.stateEquations).toEqual([{ state: 'Q', flipFlop: 'FF1', expression: "J . Q' + K' . Q" }]);
  });

  it('reports missing outputs with the canonical message', () => {
    expect(() => extractCircuitExpression([part('a', 'digital-input', 'A')], [])).toThrow('No digital output (e.g. F₁, F₂) found on canvas');
    expect(extractBooleanExpression([], [])).toBeNull();
  });
});

describe('Engine 2 · expression → circuit', () => {
  it('round-trips representative expressions through generation and extraction', () => {
    for (const source of ['A . B + C', "(A + B)'", "(A + B)' . C + D", 'A ^ B', "(A . B . C)'", "A'B'C + AB"]) {
      const circuit = generateCircuitFromExpression(source);
      const recovered = extractBooleanExpression(circuit.components, circuit.wires, 'F_1') as string;
      const variables = parseBooleanExpression(source).variables;
      expect(truth(recovered, variables)).toEqual(truth(source, variables));
    }
    const sop = generateCircuitFromExpression('A . B + C');
    expect(extractBooleanExpression(sop.components, sop.wires)).toBe('A . B + C');
  });

  it('lays out stages on the 25px grid: inputs x=0, inverters x=175, terms, then the sum gate and output', () => {
    const { components } = generateCircuitFromExpression("A'B + C . D'");
    components.forEach(component => { expect(component.x % 25).toBe(0); expect(component.y % 25).toBe(0); });
    const xOf = (type: string) => components.filter(component => component.type === type).map(component => component.x);
    expect(new Set(xOf('digital-input'))).toEqual(new Set([0]));
    expect(new Set(xOf('gate-not'))).toEqual(new Set([LAYOUT_COLUMN_PITCH]));
    expect(new Set(xOf('gate-and'))).toEqual(new Set([2 * LAYOUT_COLUMN_PITCH]));
    expect(xOf('gate-or')).toEqual([3 * LAYOUT_COLUMN_PITCH]);
    expect(xOf('digital-output')).toEqual([4 * LAYOUT_COLUMN_PITCH]);
    const inputs = components.filter(component => component.type === 'digital-input').sort((a, b) => a.y - b.y);
    expect(inputs.map(input => input.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(inputs[1].y - inputs[0].y).toBe(75);
    // Inverters sit level with the input they complement.
    components.filter(component => component.type === 'gate-not').forEach(inverter => {
      expect(inputs.some(input => input.y === inverter.y)).toBe(true);
    });
  });

  it('shares inputs and repeated sub-expressions and uses NOR/NAND for complemented groups', () => {
    const { components } = generateCircuitFromExpression("(A + B)' . C + (A + B)' . D");
    expect(components.filter(component => component.type === 'digital-input')).toHaveLength(4);
    expect(components.filter(component => component.type === 'gate-nor')).toHaveLength(1);
  });

  it('generates a correct, collision-free 8-variable circuit (A–H)', () => {
    const source = 'A.B + C.D + E.F + G.H';
    const circuit = generateCircuitFromExpression(source);
    const variables = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    expect(circuit.components.filter(component => component.type === 'digital-input').map(component => component.label).sort()).toEqual(variables);
    const byColumn = new Map<number, CircuitComponent[]>();
    circuit.components.forEach(component => byColumn.set(component.x, [...(byColumn.get(component.x) ?? []), component]));
    byColumn.forEach(column => {
      const ys = column.map(component => component.y).sort((a, b) => a - b);
      ys.slice(1).forEach((y, index) => expect(y - ys[index]).toBeGreaterThanOrEqual(50));
    });
    expect(simulate(circuit, variables)).toEqual(truth(source, variables));
  });

  it('simulates correctly in the discrete-event engine for complemented multi-level logic', () => {
    const source = "(A + B)' . C + D";
    expect(simulate(generateCircuitFromExpression(source), ['A', 'B', 'C', 'D'])).toEqual(truth(source, ['A', 'B', 'C', 'D']));
  });

  it('rejects more than 8 variables', () => {
    expect(() => generateCircuitFromExpression('A + B + C + D + E + F + G + H + I')).toThrow('Maximum 8 input variables (A–H) supported.');
  });
});

describe('placement modes', () => {
  it('replace centres the circuit on the origin; append shifts right of existing work and relabels', () => {
    const generated = generateCircuitFromExpression('A . B');
    const replaced = placeGeneratedCircuit([], generated, 'replace');
    const xs = replaced.components.map(component => component.x);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2)).toBeLessThanOrEqual(25);

    const existing = [part('old', 'gate-and', 'X1', { inputCount: 2 }), part('f', 'digital-output', 'F_1')];
    existing[0].x = 400;
    const appended = placeGeneratedCircuit(existing, generated, 'append');
    const minX = Math.min(...appended.components.map(component => component.x));
    expect(minX).toBeGreaterThanOrEqual(400 + 250);
    expect(appended.components.find(component => component.type === 'digital-output')?.label).toBe('F_2');
    expect(appended.components.find(component => component.type === 'gate-and')?.label).not.toBe('X1');
  });
});

describe('Engine 3 · universal synthesis loader', () => {
  it.each([["A'B + C", 'NAND' as const], ['(A + B)(B + C)', 'NOR' as const]])('builds an all-%s-free circuit for %s that simulates the source function', (source, mode) => {
    const circuit = synthesisDiagramToCircuit(deriveUniversalSynthesis(source, mode).diagram);
    const gateTypes = new Set(circuit.components.filter(component => component.type.startsWith('gate-')).map(component => component.type));
    expect(gateTypes).toEqual(new Set([mode === 'NAND' ? 'gate-nand' : 'gate-nor']));
    const variables = parseBooleanExpression(source).variables;
    expect(simulate(circuit, variables)).toEqual(truth(source, variables));
  });
});

describe('8-variable truth table', () => {
  it('generates all 256 rows for A–H', () => {
    const parsed = parseBooleanExpression('A.B + C.D + E.F + G.H');
    expect(generateTruthTable(parsed.ast, parsed.variables)).toHaveLength(256);
  });
});
