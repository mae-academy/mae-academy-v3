/** Universal Synthesis — pure AST-driven pedagogical NAND/NOR derivation engine. */
import { astToOverlineLatex, parseBooleanExpression, type ASTNode } from '../../../shared/logic/logicEngine';

import type { DerivationStep, SynthesisDerivation, SynthesisDiagram, SynthesisDiagramNode, SynthesisDiagramWire, SynthesisMode } from '../../../shared/logic/synthesisTypes';
export type { DerivationStep, SynthesisDerivation, SynthesisDiagram, SynthesisDiagramNode, SynthesisDiagramWire, SynthesisMode };

const child = (node: ASTNode, key: 'left' | 'right') => {
  const value = node[key];
  if (!value) throw new Error(`Malformed ${node.type} expression.`);
  return value;
};

const flatten = (node: ASTNode, type: 'AND' | 'OR'): ASTNode[] => node.type === type
  ? [...flatten(child(node, 'left'), type), ...flatten(child(node, 'right'), type)]
  : [node];

const isLiteral = (node: ASTNode): boolean => node.type === 'VARIABLE' || node.type === 'CONSTANT'
  || (node.type === 'NOT' && (child(node, 'left').type === 'VARIABLE' || child(node, 'left').type === 'CONSTANT'));

const requireSop = (node: ASTNode) => {
  const terms = flatten(node, 'OR');
  if (!terms.every(term => flatten(term, 'AND').every(isLiteral))) {
    throw new Error('All-NAND synthesis requires a Sum of Products expression with literal product terms.');
  }
  return terms;
};

const requirePos = (node: ASTNode) => {
  const clauses = flatten(node, 'AND');
  if (!clauses.every(clause => flatten(clause, 'OR').every(isLiteral))) {
    throw new Error('All-NOR synthesis requires a Product of Sums expression with literal sum clauses.');
  }
  return clauses;
};

/** Textbook complement bar: every De Morgan step renders as a crisp KaTeX overline. */
const negate = (latex: string) => `\\overline{${latex}}`;
const joinedLatex = (nodes: readonly ASTNode[], operation: 'AND' | 'OR') => nodes.map(node => astToOverlineLatex(node, 3)).join(operation === 'AND' ? ' \\cdot ' : ' + ');

/** Equivalent all-universal-gate equation: one bar per gate output. */
const universalPrimeLatex = (terms: readonly ASTNode[], internalOperation: 'AND' | 'OR') => {
  const operation = internalOperation === 'AND' ? ' \\cdot ' : ' + ';
  return negate(terms.map(term => negate(joinedLatex(flatten(term, internalOperation), internalOperation))).join(operation));
};

const buildDiagram = (mode: SynthesisMode, terms: readonly ASTNode[], internalOperation: 'AND' | 'OR'): SynthesisDiagram => {
  const nodes: SynthesisDiagramNode[] = [];
  const wires: SynthesisDiagramWire[] = [];
  const inputIds = new Map<string, string>();
  const inversionIds = new Map<string, string>();
  const addInput = (label: string) => {
    const existing = inputIds.get(label);
    if (existing) return existing;
    const id = `input-${label}`;
    inputIds.set(label, id);
    nodes.push({ id, kind: 'input', label, layer: 0 });
    return id;
  };
  const literalSource = (literal: ASTNode) => {
    if (literal.type === 'VARIABLE' || literal.type === 'CONSTANT') return addInput(literal.value ?? '0');
    if (literal.type !== 'NOT') throw new Error('Synthesis diagram expects literal inputs.');
    const source = child(literal, 'left');
    if (source.type !== 'VARIABLE' && source.type !== 'CONSTANT') throw new Error('Synthesis diagram expects literal inputs.');
    const sourceId = addInput(source.value ?? '0');
    const id = `invert-${sourceId}`;
    if (!inversionIds.has(id)) {
      inversionIds.set(id, id);
      nodes.push({ id, kind: 'gate', label: `${mode} inverter`, layer: 1, gate: mode });
      wires.push({ from: sourceId, to: id }, { from: sourceId, to: id });
    }
    return id;
  };

  const termGateIds = terms.map((term, index) => {
    const id = `term-${index + 1}`;
    nodes.push({ id, kind: 'gate', label: `${mode} ${index + 1}`, layer: 2, gate: mode });
    flatten(term, internalOperation).map(literalSource).forEach(sourceId => wires.push({ from: sourceId, to: id }));
    return id;
  });
  const finalId = 'final-gate';
  nodes.push({ id: finalId, kind: 'gate', label: `Final ${mode}`, layer: 3, gate: mode });
  const finalInputs = termGateIds.length === 1 ? [termGateIds[0], termGateIds[0]] : termGateIds;
  finalInputs.forEach(sourceId => wires.push({ from: sourceId, to: finalId }));
  nodes.push({ id: 'output-F', kind: 'output', label: 'F', layer: 4 });
  wires.push({ from: finalId, to: 'output-F' });
  return { mode, nodes, wires };
};

const buildDirectUniversalDiagram = (mode: SynthesisMode, operands: readonly ASTNode[]): SynthesisDiagram => {
  const nodes: SynthesisDiagramNode[] = [];
  const wires: SynthesisDiagramWire[] = [];
  const inputIds = new Map<string, string>();
  const inversionIds = new Map<string, string>();
  const addInput = (label: string) => {
    const existing = inputIds.get(label);
    if (existing) return existing;
    const id = `input-${label}`;
    inputIds.set(label, id);
    nodes.push({ id, kind: 'input', label, layer: 0 });
    return id;
  };
  const literalSource = (literal: ASTNode) => {
    if (literal.type === 'VARIABLE' || literal.type === 'CONSTANT') return addInput(literal.value ?? '0');
    const source = child(literal, 'left');
    if (literal.type !== 'NOT' || (source.type !== 'VARIABLE' && source.type !== 'CONSTANT')) throw new Error('Direct universal synthesis expects literal inputs.');
    const sourceId = addInput(source.value ?? '0');
    const id = `invert-${sourceId}`;
    if (!inversionIds.has(id)) {
      inversionIds.set(id, id);
      nodes.push({ id, kind: 'gate', label: `${mode} inverter`, layer: 1, gate: mode });
      wires.push({ from: sourceId, to: id }, { from: sourceId, to: id });
    }
    return id;
  };
  const gateId = 'direct-universal-gate';
  nodes.push({ id: gateId, kind: 'gate', label: `Direct ${mode}`, layer: 2, gate: mode });
  operands.map(literalSource).forEach(sourceId => wires.push({ from: sourceId, to: gateId }));
  nodes.push({ id: 'output-F', kind: 'output', label: 'F', layer: 3 });
  wires.push({ from: gateId, to: 'output-F' });
  return { mode, nodes, wires };
};

const nativeUniversalOperands = (ast: ASTNode, operation: 'AND' | 'OR') => {
  if (ast.type !== 'NOT') return null;
  const operand = child(ast, 'left');
  if (operand.type !== operation) return null;
  const operands = flatten(operand, operation);
  return operands.every(isLiteral) ? operands : null;
};

const deriveNand = (ast: ASTNode, originalLatex: string): SynthesisDerivation => {
  const directOperands = nativeUniversalOperands(ast, 'AND');
  if (directOperands) {
    const finalLatex = `F = ${originalLatex}`;
    return {
      mode: 'NAND', originalAst: ast, originalLatex, finalLatex,
      steps: [
        { title: '1. Native NAND Expression', description: 'The expression is already a complemented product of literals.', latexEquation: finalLatex },
        { title: '2. Direct NAND Mapping', description: 'Map the existing complemented product directly to one NAND gate without adding a double inversion.', latexEquation: finalLatex },
      ],
      diagram: buildDirectUniversalDiagram('NAND', directOperands),
    };
  }
  const terms = requireSop(ast);
  const negatedTerms = terms.map(term => negate(joinedLatex(flatten(term, 'AND'), 'AND')));
  const deMorgan = `F = ${negate(negatedTerms.join(' \\cdot '))}`;
  const finalLatex = `F = ${universalPrimeLatex(terms, 'AND')}`;
  return {
    mode: 'NAND', originalAst: ast, originalLatex, finalLatex,
    steps: [
      { title: '1. Original SOP Expression', description: 'We begin with the original equation in Sum of Products form.', latexEquation: `F = ${originalLatex}` },
      { title: '2. Apply Double Inversion', description: 'We add a double complement to the complete expression. Double negation does not change its Boolean value.', latexEquation: `F = ${negate(negate(originalLatex))}` },
      { title: "3. Apply De Morgan's Law", description: 'We break the lower bar, exchange OR for AND, and distribute the negation across the product terms.', latexEquation: deMorgan },
      { title: '4. Final NAND Logic', description: 'Every operation is now implemented with interconnected NAND gates and is ready for schematic interpretation.', latexEquation: finalLatex },
    ],
    diagram: buildDiagram('NAND', terms, 'AND'),
  };
};

const deriveNor = (ast: ASTNode, originalLatex: string): SynthesisDerivation => {
  const clauses = requirePos(ast);
  const negatedClauses = clauses.map(clause => negate(joinedLatex(flatten(clause, 'OR'), 'OR')));
  const deMorgan = `F = ${negate(negatedClauses.join(' + '))}`;
  const finalLatex = `F = ${universalPrimeLatex(clauses, 'OR')}`;
  return {
    mode: 'NOR', originalAst: ast, originalLatex, finalLatex,
    steps: [
      { title: '1. Original POS Expression', description: 'We begin with the original equation in Product of Sums form.', latexEquation: `F = ${originalLatex}` },
      { title: '2. Apply Double Inversion', description: 'We add a double complement to the complete expression without changing its Boolean value.', latexEquation: `F = ${negate(negate(originalLatex))}` },
      { title: "3. Apply De Morgan's Law", description: 'We break the lower bar, exchange AND for OR, and distribute the negation across the sum clauses.', latexEquation: deMorgan },
      { title: '4. Final NOR Logic', description: 'Every operation is now implemented with interconnected NOR gates and is ready for schematic interpretation.', latexEquation: finalLatex },
    ],
    diagram: buildDiagram('NOR', clauses, 'OR'),
  };
};

export const deriveUniversalSynthesis = (expression: string, mode: SynthesisMode): SynthesisDerivation => {
  const parsed = parseBooleanExpression(expression);
  const originalLatex = astToOverlineLatex(parsed.ast);
  return mode === 'NAND' ? deriveNand(parsed.ast, originalLatex) : deriveNor(parsed.ast, originalLatex);
};
