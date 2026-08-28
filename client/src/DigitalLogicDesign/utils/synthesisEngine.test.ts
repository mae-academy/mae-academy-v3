import { describe, expect, it } from 'vitest';
import { deriveUniversalSynthesis } from './synthesisEngine';

describe('Universal Synthesis derivation engine', () => {
  it('derives the exact four-stage SOP-to-NAND teaching sequence', () => {
    const derivation = deriveUniversalSynthesis('A*B + C*D', 'NAND');
    expect(derivation.steps).toHaveLength(4);
    expect(derivation.steps.map(step => step.latexEquation)).toEqual([
      'F = A \\cdot B + C \\cdot D',
      'F = ((A \\cdot B + C \\cdot D)^{\\prime})^{\\prime}',
      'F = ((A \\cdot B)^{\\prime} \\cdot (C \\cdot D)^{\\prime})^{\\prime}',
      'F = ((A \\cdot B)^{\\prime} \\cdot (C \\cdot D)^{\\prime})^{\\prime}',
    ]);
    expect(derivation.diagram.mode).toBe('NAND');
    expect(derivation.diagram.nodes.find(node => node.kind === 'output')?.label).toBe('F');
  });

  it('derives the exact four-stage POS-to-NOR teaching sequence', () => {
    const derivation = deriveUniversalSynthesis('(A+B)*(C+D)', 'NOR');
    expect(derivation.steps).toHaveLength(4);
    expect(derivation.steps.map(step => step.latexEquation)).toEqual([
      'F = \\left(A + B\\right) \\cdot \\left(C + D\\right)',
      'F = ((\\left(A + B\\right) \\cdot \\left(C + D\\right))^{\\prime})^{\\prime}',
      'F = ((A + B)^{\\prime} + (C + D)^{\\prime})^{\\prime}',
      'F = ((A + B)^{\\prime} + (C + D)^{\\prime})^{\\prime}',
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
    expect(derivation.finalLatex).toBe(String.raw`F = \left(A \cdot B\right)^{\prime}`);
    expect(derivation.diagram.nodes.filter(node => node.kind === 'gate' && node.gate === 'NAND')).toHaveLength(1);
  });
});
