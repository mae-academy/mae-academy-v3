/**
 * MAE K-Map Engine — deterministic Boolean minimization only.
 * This module has no React or SVG dependency: QMC identifies prime implicants,
 * while Petrick resolves residual cyclic coverage by minimum hardware cost.
 */
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
  hardwareCost: KMapHardwareCost;
}

interface RawImplicant {
  pattern: string;
  sourceTerms: number[];
}

interface NormalizedProblem {
  variables: string[];
  minterms: number[];
  dontCares: number[];
  width: KMapVariableCount;
}

const countLiterals = (pattern: string) => Array.from(pattern).filter(bit => bit !== '-').length;
const byNumber = (left: number, right: number) => left - right;
const uniqueNumbers = (values: readonly number[]) => Array.from(new Set(values)).sort(byNumber);
const uniqueSorted = (values: readonly number[]) => uniqueNumbers(values);

const assertVariableList = (variables: readonly string[]): KMapVariableCount => {
  if (variables.length < 2 || variables.length > 5) throw new Error('K-Map supports exactly 2 to 5 variables.');
  if (new Set(variables).size !== variables.length) throw new Error('K-Map variable names must be unique.');
  if (variables.some(variable => !/^[A-Za-z]$/.test(variable))) throw new Error('K-Map variables must be single Latin letters.');
  return variables.length as KMapVariableCount;
};

const normalizeProblem = (problem: KMapProblem): NormalizedProblem => {
  const width = assertVariableList(problem.variables);
  const upperBound = 2 ** width;
  const minterms = uniqueNumbers(problem.minterms);
  const dontCares = uniqueNumbers(problem.dontCares ?? []);
  const invalid = [...minterms, ...dontCares].find(term => !Number.isInteger(term) || term < 0 || term >= upperBound);
  if (invalid !== undefined) throw new Error(`Minterm ${invalid} is outside the ${width}-variable K-Map range.`);
  const overlap = minterms.find(term => dontCares.includes(term));
  if (overlap !== undefined) throw new Error(`Minterm ${overlap} cannot also be marked as a don't-care.`);
  return { variables: [...problem.variables], minterms, dontCares, width };
};

const binaryPattern = (term: number, width: number) => term.toString(2).padStart(width, '0');

const mergeTerms = (left: RawImplicant, right: RawImplicant): RawImplicant | null => {
  let differenceIndex = -1;
  for (let index = 0; index < left.pattern.length; index += 1) {
    const a = left.pattern[index];
    const b = right.pattern[index];
    if (a === b) continue;
    if (a === '-' || b === '-' || differenceIndex !== -1) return null;
    differenceIndex = index;
  }
  if (differenceIndex === -1) return null;
  const pattern = `${left.pattern.slice(0, differenceIndex)}-${left.pattern.slice(differenceIndex + 1)}`;
  return { pattern, sourceTerms: uniqueNumbers([...left.sourceTerms, ...right.sourceTerms]) };
};

const dedupeRawImplicants = (implicants: readonly RawImplicant[]): RawImplicant[] => {
  const patterns = new Map<string, number[]>();
  implicants.forEach(implicant => {
    patterns.set(implicant.pattern, uniqueNumbers([...(patterns.get(implicant.pattern) ?? []), ...implicant.sourceTerms]));
  });
  return Array.from(patterns, ([pattern, sourceTerms]) => ({ pattern, sourceTerms })).sort((left, right) => left.pattern.localeCompare(right.pattern));
};

const primePatterns = (terms: readonly number[], width: number): RawImplicant[] => {
  let current = dedupeRawImplicants(terms.map(term => ({ pattern: binaryPattern(term, width), sourceTerms: [term] })));
  const primes: RawImplicant[] = [];

  while (current.length > 0) {
    const combined = new Set<number>();
    const next: RawImplicant[] = [];
    for (let left = 0; left < current.length; left += 1) {
      for (let right = left + 1; right < current.length; right += 1) {
        const merged = mergeTerms(current[left], current[right]);
        if (!merged) continue;
        combined.add(left);
        combined.add(right);
        next.push(merged);
      }
    }
    current.forEach((implicant, index) => {
      if (!combined.has(index)) primes.push(implicant);
    });
    current = dedupeRawImplicants(next);
  }

  return dedupeRawImplicants(primes);
};

const patternCovers = (pattern: string, term: number) => {
  const bits = binaryPattern(term, pattern.length);
  return Array.from(pattern).every((bit, index) => bit === '-' || bit === bits[index]);
};

const implicantLatex = (pattern: string, variables: readonly string[]) => {
  const literals = Array.from(pattern).flatMap((bit, index) => {
    if (bit === '-') return [];
    return bit === '1' ? [variables[index]] : [`\\overline{${variables[index]}}`];
  });
  return literals.length ? literals.join(' \\cdot ') : '1';
};

const asPublicImplicant = (raw: RawImplicant, minterms: readonly number[], variables: readonly string[]): KMapImplicant => ({
  pattern: raw.pattern,
  coveredMinterms: minterms.filter(term => patternCovers(raw.pattern, term)),
  sourceTerms: uniqueNumbers(raw.sourceTerms),
  literalCount: countLiterals(raw.pattern),
  latex: implicantLatex(raw.pattern, variables),
});

const compareImplicants = (left: KMapImplicant, right: KMapImplicant) =>
  left.literalCount - right.literalCount || left.pattern.localeCompare(right.pattern);

const isSubset = (subset: ReadonlySet<number>, superset: ReadonlySet<number>) => Array.from(subset).every(item => superset.has(item));

const normalizeProducts = (products: ReadonlySet<number>[]): Set<number>[] => {
  const distinct = new Map<string, Set<number>>();
  products.forEach(product => distinct.set(Array.from(product).sort(byNumber).join(','), new Set(product)));
  return Array.from(distinct.values()).filter((product, index, all) =>
    !all.some((candidate, candidateIndex) => candidateIndex !== index && candidate.size < product.size && isSubset(candidate, product)),
  );
};

const productCost = (ids: ReadonlySet<number>, primes: readonly KMapImplicant[]): KMapHardwareCost => ({
  terms: ids.size,
  literals: Array.from(ids).reduce((total, id) => total + primes[id].literalCount, 0),
});

const compareProducts = (left: ReadonlySet<number>, right: ReadonlySet<number>, primes: readonly KMapImplicant[]) => {
  const leftCost = productCost(left, primes);
  const rightCost = productCost(right, primes);
  if (leftCost.terms !== rightCost.terms) return leftCost.terms - rightCost.terms;
  if (leftCost.literals !== rightCost.literals) return leftCost.literals - rightCost.literals;
  const leftKey = Array.from(left).map(id => primes[id].pattern).sort().join('|');
  const rightKey = Array.from(right).map(id => primes[id].pattern).sort().join('|');
  return leftKey.localeCompare(rightKey);
};

const selectByPetrick = (minterms: readonly number[], primes: readonly KMapImplicant[]) => {
  const essentialIds = new Set<number>();
  minterms.forEach(term => {
    const candidates = primes.flatMap((prime, index) => prime.coveredMinterms.includes(term) ? [index] : []);
    if (candidates.length === 1) essentialIds.add(candidates[0]);
  });

  const uncovered = minterms.filter(term => !Array.from(essentialIds).some(index => primes[index].coveredMinterms.includes(term)));
  let products: Set<number>[] = [new Set()];
  uncovered.forEach(term => {
    const candidates = primes.flatMap((prime, index) => prime.coveredMinterms.includes(term) ? [index] : []);
    if (!candidates.length) throw new Error(`No prime implicant covers required minterm ${term}.`);
    products = normalizeProducts(products.flatMap(product => candidates.map(candidate => new Set([...Array.from(product), candidate]))));
  });

  const coveringSets = products.map(product => new Set([...Array.from(essentialIds), ...Array.from(product)])).sort((left, right) => compareProducts(left, right, primes));
  const best = coveringSets[0] ?? new Set<number>(essentialIds);
  const bestCost = productCost(best, primes);
  const minimumCoverings = coveringSets.filter(candidate => {
    const cost = productCost(candidate, primes);
    return cost.terms === bestCost.terms && cost.literals === bestCost.literals;
  });
  return { essentialIds, selectedIds: best, minimumCoverings };
};

/** Resolves a minimal Sum-of-Products without coupling the result to any UI implementation. */
export const solveKMap = (problem: KMapProblem): KMapSolution => {
  const normalized = normalizeProblem(problem);
  if (!normalized.minterms.length) {
    return {
      variables: normalized.variables,
      minterms: normalized.minterms,
      dontCares: normalized.dontCares,
      primeImplicants: [],
      essentialPrimeImplicants: [],
      selectedPrimeImplicants: [],
      minimumCoverings: [[]],
      uncoveredMinterms: [],
      latex: '0',
      hardwareCost: { terms: 0, literals: 0 },
    };
  }

  const rawPrimes = primePatterns(uniqueSorted([...normalized.minterms, ...normalized.dontCares]), normalized.width);
  const primeImplicants = rawPrimes.map(raw => asPublicImplicant(raw, normalized.minterms, normalized.variables)).sort(compareImplicants);
  const selection = selectByPetrick(normalized.minterms, primeImplicants);
  const selectedPrimeImplicants = Array.from(selection.selectedIds).map(index => primeImplicants[index]).sort(compareImplicants);
  const covered = new Set(selectedPrimeImplicants.flatMap(implicant => implicant.coveredMinterms));

  return {
    variables: normalized.variables,
    minterms: normalized.minterms,
    dontCares: normalized.dontCares,
    primeImplicants,
    essentialPrimeImplicants: Array.from(selection.essentialIds).map(index => primeImplicants[index]).sort(compareImplicants),
    selectedPrimeImplicants,
    minimumCoverings: selection.minimumCoverings.map(covering => Array.from(covering).map(index => primeImplicants[index]).sort(compareImplicants)),
    uncoveredMinterms: normalized.minterms.filter(term => !covered.has(term)),
    latex: selectedPrimeImplicants.map(implicant => implicant.latex).join(' + '),
    hardwareCost: productCost(selection.selectedIds, primeImplicants),
  };
};
