/** Logic Analyzer AST layer — pure Boolean evaluation and academically grouped LaTeX. */
export type NodeType = 'VARIABLE' | 'CONSTANT' | 'NOT' | 'AND' | 'OR' | 'XOR';

export interface ASTNode {
  type: NodeType;
  value?: string;
  left?: ASTNode;
  right?: ASTNode;
  negationStyle?: 'prefix' | 'postfix';
}

const precedence = (node: ASTNode) => node.type === 'OR' ? 1 : node.type === 'XOR' ? 2 : node.type === 'AND' ? 3 : node.type === 'NOT' ? 4 : 5;
const requireChild = (node: ASTNode, key: 'left' | 'right') => {
  const child = node[key];
  if (!child) throw new Error(`Malformed ${node.type} expression.`);
  return child;
};

export const evaluateAst = (node: ASTNode, context: Record<string, boolean>): boolean => {
  if (node.type === 'CONSTANT') return node.value === '1';
  if (node.type === 'VARIABLE') return Boolean(context[node.value ?? '']);
  if (node.type === 'NOT') return !evaluateAst(requireChild(node, 'left'), context);
  const left = evaluateAst(requireChild(node, 'left'), context);
  const right = evaluateAst(requireChild(node, 'right'), context);
  if (node.type === 'AND') return left && right;
  if (node.type === 'OR') return left || right;
  return left !== right;
};

export const variablesFromAst = (node: ASTNode): string[] => {
  const names = new Set<string>();
  const visit = (current: ASTNode) => {
    if (current.type === 'VARIABLE' && current.value) names.add(current.value);
    if (current.left) visit(current.left);
    if (current.right) visit(current.right);
  };
  visit(node);
  return Array.from(names).sort((left, right) => left.localeCompare(right));
};

const latexWithGrouping = (node: ASTNode, parentPrecedence = 0): string => {
  if (node.type === 'VARIABLE' || node.type === 'CONSTANT') return node.value ?? '';
  if (node.type === 'NOT') {
    const child = requireChild(node, 'left');
    const childLatex = latexWithGrouping(child);
    if (node.negationStyle === 'postfix') {
      const operand = precedence(child) < precedence(node) ? `\\left(${childLatex}\\right)` : childLatex;
      return `${operand}^{\\prime}`;
    }
    return `\\overline{${childLatex}}`;
  }
  const operator = node.type === 'AND' ? ' \\cdot ' : node.type === 'XOR' ? ' \\oplus ' : ' + ';
  const expression = `${latexWithGrouping(requireChild(node, 'left'), precedence(node))}${operator}${latexWithGrouping(requireChild(node, 'right'), precedence(node))}`;
  return precedence(node) < parentPrecedence ? `\\left(${expression}\\right)` : expression;
};

export const astToLatex = (node: ASTNode) => latexWithGrouping(node);

export const astToOverlineLatex = (node: ASTNode, parentPrecedence = 0): string => {
  if (node.type === 'VARIABLE' || node.type === 'CONSTANT') return node.value ?? '';
  if (node.type === 'NOT') {
    const child = requireChild(node, 'left');
    const childLatex = astToOverlineLatex(child);
    return `\\overline{${childLatex}}`;
  }
  const operator = node.type === 'AND' ? ' \\cdot ' : node.type === 'XOR' ? ' \\oplus ' : ' + ';
  const expression = `${astToOverlineLatex(requireChild(node, 'left'), precedence(node))}${operator}${astToOverlineLatex(requireChild(node, 'right'), precedence(node))}`;
  return precedence(node) < parentPrecedence ? `\\left(${expression}\\right)` : expression;
};

/**
 * Canonical ASCII form used as the single source of truth in the formula bar.
 * Round-trips through `parseBooleanExpression`; never emits LaTeX control sequences.
 */
export const astToAscii = (node: ASTNode, parentPrecedence = 0): string => {
  if (node.type === 'VARIABLE' || node.type === 'CONSTANT') return node.value ?? '';
  if (node.type === 'NOT') {
    const child = requireChild(node, 'left');
    const atomic = child.type === 'VARIABLE' || child.type === 'CONSTANT' || child.type === 'NOT';
    return `${atomic ? astToAscii(child) : `(${astToAscii(child)})`}'`;
  }
  const operator = node.type === 'AND' ? ' . ' : node.type === 'XOR' ? ' ^ ' : ' + ';
  const expression = `${astToAscii(requireChild(node, 'left'), precedence(node))}${operator}${astToAscii(requireChild(node, 'right'), precedence(node))}`;
  return precedence(node) < parentPrecedence ? `(${expression})` : expression;
};

/**
 * Strips raw LaTeX commands (e.g. \cdot, \overline) if typed or pasted,
 * converting them into clean formula shorthand.
 */
export const sanitizeBooleanInput = (input: string): string => {
  let cleaned = input;
  cleaned = cleaned.replace(/\\cdot/g, ' . ').replace(/\\times/g, ' . ');
  cleaned = cleaned.replace(/\\(?:overline|bar)\{([^{}]+)\}/g, "($1)'");
  cleaned = cleaned.replace(/\\[a-zA-Z]+/g, ' ').replace(/\\/g, '');
  return cleaned;
};
