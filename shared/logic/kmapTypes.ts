export type KMapVariableCount = 2 | 3 | 4 | 5;

export interface KMapProblem {
  variables: readonly string[];
  minterms: readonly number[];
  dontCares?: readonly number[];
}

export interface KMapImplicant {
  /** Bit pattern in variable order; `-` marks a removed literal. */
  pattern: string;
  /** Required truth-table cells this implicant covers. */
  coveredMinterms: number[];
  /** Terms used during QMC reduction, including any don't-care cells. */
  sourceTerms: number[];
  literalCount: number;
  latex: string;
  /** Formula-bar ASCII product, e.g. `A'BC`. */
  expression: string;
}

export interface KMapHardwareCost {
  terms: number;
  literals: number;
}

export interface KMapSolution {
  variables: string[];
  minterms: number[];
  dontCares: number[];
  primeImplicants: KMapImplicant[];
  essentialPrimeImplicants: KMapImplicant[];
  selectedPrimeImplicants: KMapImplicant[];
  /** All equivalent minimum-cost coverings, including the selected deterministic one. */
  minimumCoverings: KMapImplicant[][];
  uncoveredMinterms: number[];
  latex: string;
  /** Formula-bar ASCII Sum of Products, e.g. `A'B + CD` (never LaTeX). */
  expression: string;
  hardwareCost: KMapHardwareCost;
}
