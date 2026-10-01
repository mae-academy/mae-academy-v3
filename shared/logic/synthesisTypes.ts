import type { ASTNode } from './logicEngine';

export type SynthesisMode = 'NAND' | 'NOR';

export interface DerivationStep {
  title: string;
  description: string;
  latexEquation: string;
}

export interface SynthesisDiagramNode {
  id: string;
  kind: 'input' | 'gate' | 'output';
  label: string;
  layer: number;
  gate?: SynthesisMode;
}

export interface SynthesisDiagramWire {
  from: string;
  to: string;
}

export interface SynthesisDiagram {
  mode: SynthesisMode;
  nodes: SynthesisDiagramNode[];
  wires: SynthesisDiagramWire[];
}

export interface SynthesisDerivation {
  mode: SynthesisMode;
  originalAst: ASTNode;
  originalLatex: string;
  finalLatex: string;
  steps: DerivationStep[];
  diagram: SynthesisDiagram;
}

