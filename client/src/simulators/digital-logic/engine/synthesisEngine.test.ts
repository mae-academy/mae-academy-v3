import { describe, expect, it } from 'vitest';
import { deriveUniversalSynthesis, synthesisDiagramToCircuit } from './synthesisEngine';

describe('Universal Synthesis derivation engine', () => {
  it('derives the exact four-stage SOP-to-NAND teaching sequence', () => {
    const derivation = deriveUniversalSynthesis('A*B + C*D', 'NAND');
    expect(derivation.steps).toHaveLength(4);
    expect(derivation.steps.map(step => step.latexEquation)).toEqual([
      'F = A \\cdot B + C \\cdot D',
      'F = \\overline{\\overline{A \\cdot B + C \\cdot D}}',
      'F = \\overline{\\overline{A \\cdot B} \\cdot \\overline{C \\cdot D}}',
      'F = \\overline{\\overline{A \\cdot B} \\cdot \\overline{C \\cdot D}}',
    ]);
    expect(derivation.diagram.mode).toBe('NAND');
    expect(derivation.diagram.nodes.find(node => node.kind === 'output')?.label).toBe('F');
  });

  it('derives the exact four-stage POS-to-NOR teaching sequence', () => {
    const derivation = deriveUniversalSynthesis('(A+B)*(C+D)', 'NOR');
    expect(derivation.steps).toHaveLength(4);
    expect(derivation.steps.map(step => step.latexEquation)).toEqual([
      'F = \\left(A + B\\right) \\cdot \\left(C + D\\right)',
      'F = \\overline{\\overline{\\left(A + B\\right) \\cdot \\left(C + D\\right)}}',
      'F = \\overline{\\overline{A + B} + \\overline{C + D}}',
      'F = \\overline{\\overline{A + B} + \\overline{C + D}}',
    ]);
    expect(derivation.diagram.nodes.filter(node => node.gate === 'NOR')).not.toHaveLength(0);
  });

  it('rejects expressions that are not in the requested canonical form', () => {
    expect(() => deriveUniversalSynthesis('A*(B+C)', 'NAND')).toThrow('Sum of Products');
    expect(() => deriveUniversalSynthesis('A+(B*C)', 'NOR')).toThrow('Product of Sums');
  });

  it('maps an expression that is already a NAND directly without injecting a double inversion layer', () => {
    const derivation = deriveUniversalSynthesis('(A*B)′', 'NAND');

    expect(derivation.steps).toHaveLength(2);
    expect(derivation.finalLatex).toBe(String.raw`F = \overline{A \cdot B}`);
    expect(derivation.diagram.nodes.filter(node => node.kind === 'gate' && node.gate === 'NAND')).toHaveLength(1);
  });

  it('converts the synthesized diagram into live NAND canvas parts with fan-in-sized gates and pin-exact wires', () => {
    const { components, wires } = synthesisDiagramToCircuit(deriveUniversalSynthesis("A'B + C", 'NAND').diagram);
    expect(components.filter(part => part.type === 'digital-input').map(part => part.label).sort()).toEqual(['A', 'B', 'C']);
    expect(components.filter(part => part.type === 'digital-output')).toHaveLength(1);
    const gates = components.filter(part => part.type === 'gate-nand');
    expect(gates.length).toBeGreaterThan(0);
    gates.forEach(gate => {
      const inbound = wires.filter(wire => wire.toComp === gate.id);
      expect(inbound).toHaveLength(Number(gate.props.inputCount));
      expect(new Set(inbound.map(wire => wire.toTerm)).size).toBe(inbound.length);
    });
    const ids = new Set(components.map(part => part.id));
    wires.forEach(wire => { expect(ids.has(wire.fromComp) && ids.has(wire.toComp)).toBe(true); });
  });
});
