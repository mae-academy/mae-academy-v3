/**
 * Client-side Bode, Nyquist, Nichols, and stability-margin algorithms.
 * No backend calls are used: every transfer-function evaluation runs in the browser.
 */
import {
  complexDiv,
  complexMag,
  complexMul,
  complexSub,
  evalPolyComplex,
  findPolynomialRoots,
  type Complex,
} from "./controlMath";

export type FrequencyFactorKind = "gain" | "zero" | "pole";

export type FrequencyFactor = {
  id: string;
  kind: FrequencyFactorKind;
  label: string;
  roots: Complex[];
  constant?: number;
};

export type FrequencyPoint = {
  omega: number;
  re: number;
  im: number;
  magnitudeDb: number;
  phaseDeg: number;
  phaseUnwrappedDeg: number;
  asymMagnitudeDb: number;
  asymPhaseDeg: number;
};

export type StabilityMargins = {
  gainCrossover?: { omega: number; phaseDeg: number; phaseMarginDeg: number };
  phaseCrossover?: { omega: number; magnitudeDb: number; gainMarginDb: number };
};

export type FactorSlopeEvent = {
  omega: number;
  deltaDbPerDecade: number;
  label: string;
};

const EPSILON = 1e-8;
const RAD_TO_DEG = 180 / Math.PI;

export function formatEngineering(value: number, precision = 3) {
  if (!Number.isFinite(value)) return "\\infty";
  if (Math.abs(value) < 1e-10) return "0";
  const rounded = Number(value.toPrecision(precision));
  return `${rounded}`;
}

export function logspace(startExp = -2, endExp = 4, samples = 320): number[] {
  const steps = Math.max(2, samples - 1);
  return Array.from({ length: samples }, (_, index) => Math.pow(10, startExp + ((endExp - startExp) * index) / steps));
}

function joinSign(left: string, coefficient: number, suffix: string) {
  const abs = formatEngineering(Math.abs(coefficient));
  const shown = Math.abs(coefficient) === 1 && suffix ? suffix : `${abs}${suffix}`;
  if (!left) return coefficient < 0 ? `-${shown}` : shown;
  return coefficient < 0 ? `${left} - ${shown}` : `${left} + ${shown}`;
}

function polynomialLabelForPair(root: Complex) {
  const b = -2 * root.re;
  const c = root.re * root.re + root.im * root.im;
  let expression = "s^2";
  if (Math.abs(b) > EPSILON) expression = joinSign(expression, b, "s");
  if (Math.abs(c) > EPSILON) expression = joinSign(expression, c, "");
  return expression;
}

function labelForFactor(kind: "zero" | "pole", roots: Complex[]) {
  const numerator = kind === "zero";
  if (roots.length === 2) {
    const expression = polynomialLabelForPair(roots[0]);
    return numerator ? expression : `\\frac{1}{${expression}}`;
  }

  const root = roots[0];
  if (Math.abs(root.re) < EPSILON && Math.abs(root.im) < EPSILON) {
    return numerator ? "s" : "\\frac{1}{s}";
  }
  const expression = root.re < 0
    ? `s + ${formatEngineering(Math.abs(root.re))}`
    : `s - ${formatEngineering(root.re)}`;
  return numerator ? expression : `\\frac{1}{${expression}}`;
}

function rootGroups(roots: Complex[]) {
  const sorted = [...roots].sort((a, b) => Math.abs(a.im) - Math.abs(b.im) || a.re - b.re);
  const used = new Set<number>();
  const groups: Complex[][] = [];

  sorted.forEach((root, index) => {
    if (used.has(index)) return;
    if (Math.abs(root.im) < EPSILON) {
      used.add(index);
      groups.push([root]);
      return;
    }
    const conjugateIndex = sorted.findIndex((candidate, candidateIndex) => (
      candidateIndex !== index
      && !used.has(candidateIndex)
      && Math.abs(candidate.re - root.re) < 1e-5
      && Math.abs(candidate.im + root.im) < 1e-5
    ));
    used.add(index);
    if (conjugateIndex >= 0) {
      used.add(conjugateIndex);
      groups.push(root.im > 0 ? [root, sorted[conjugateIndex]] : [sorted[conjugateIndex], root]);
      return;
    }
    groups.push([root]);
  });
  return groups;
}

/** Decomposes a real transfer function into an explicit scalar and real / conjugate factors. */
export function buildFrequencyFactors(numerator: number[], denominator: number[]): FrequencyFactor[] {
  const num = numerator.length ? numerator : [1];
  const den = denominator.length ? denominator : [1];
  const leadingGain = (num[0] || 1) / (den[0] || 1);
  const factors: FrequencyFactor[] = [{
    id: "gain",
    kind: "gain",
    label: "K",
    roots: [],
    constant: leadingGain,
  }];

  rootGroups(findPolynomialRoots(num)).forEach((roots, index) => {
    factors.push({ id: `zero-${index}`, kind: "zero", roots, label: labelForFactor("zero", roots) });
  });
  rootGroups(findPolynomialRoots(den)).forEach((roots, index) => {
    factors.push({ id: `pole-${index}`, kind: "pole", roots, label: labelForFactor("pole", roots) });
  });
  return factors;
}

function evaluateFactor(factor: FrequencyFactor, omega: number): Complex {
  if (factor.kind === "gain") return { re: factor.constant ?? 1, im: 0 };
  const s = { re: 0, im: omega };
  const product = factor.roots.reduce<Complex>(
    (accumulator, root) => complexMul(accumulator, complexSub(s, root)),
    { re: 1, im: 0 },
  );
  return factor.kind === "zero" ? product : complexDiv({ re: 1, im: 0 }, product);
}

function approximateRootContribution(root: Complex, polarity: 1 | -1, omega: number) {
  const naturalFrequency = complexMag(root);
  if (naturalFrequency < EPSILON) {
    return { magnitudeDb: polarity * 20 * Math.log10(omega), phaseDeg: polarity * 90 };
  }

  const magnitudeDb = polarity * (20 * Math.log10(naturalFrequency) + 20 * Math.max(0, Math.log10(omega / naturalFrequency)));
  const lower = naturalFrequency / 10;
  const upper = naturalFrequency * 10;
  const fraction = Math.max(0, Math.min(1, Math.log10(omega / lower) / Math.log10(upper / lower)));

  if (Math.abs(root.im) < EPSILON) {
    const lowPhase = root.re > 0 ? 180 : 0;
    const highPhase = 90;
    return { magnitudeDb, phaseDeg: polarity * (lowPhase + (highPhase - lowPhase) * fraction) };
  }

  return { magnitudeDb, phaseDeg: 0 };
}

function approximateFactor(factor: FrequencyFactor, omega: number) {
  if (factor.kind === "gain") {
    const value = factor.constant ?? 1;
    return {
      magnitudeDb: 20 * Math.log10(Math.max(Math.abs(value), EPSILON)),
      phaseDeg: value < 0 ? 180 : 0,
    };
  }

  const polarity: 1 | -1 = factor.kind === "zero" ? 1 : -1;
  const magnitudeDb = factor.roots.reduce((sum, root) => sum + approximateRootContribution(root, polarity, omega).magnitudeDb, 0);

  if (factor.roots.length === 2 && Math.abs(factor.roots[0].im) > EPSILON) {
    const root = factor.roots[0];
    const naturalFrequency = complexMag(root);
    const lower = naturalFrequency / 10;
    const upper = naturalFrequency * 10;
    const fraction = Math.max(0, Math.min(1, Math.log10(omega / lower) / Math.log10(upper / lower)));
    const terminalPhase = root.re > 0 ? -180 : 180;
    return { magnitudeDb, phaseDeg: polarity * terminalPhase * fraction };
  }
  return {
    magnitudeDb,
    phaseDeg: factor.roots.reduce((sum, root) => sum + approximateRootContribution(root, polarity, omega).phaseDeg, 0),
  };
}

function unwrapDegrees(values: number[]) {
  let offset = 0;
  return values.map((value, index) => {
    if (index > 0) {
      const difference = value - values[index - 1];
      if (difference > 180) offset -= 360;
      if (difference < -180) offset += 360;
    }
    return value + offset;
  });
}

/** Evaluates exact and straight-line Bode coordinates for the selected factor set. */
export function computeFrequencyResponse(
  factors: FrequencyFactor[],
  selectedFactorIds: string[],
  frequencies = logspace(),
): FrequencyPoint[] {
  const selected = factors.filter((factor) => selectedFactorIds.includes(factor.id));
  const raw = frequencies.map((omega) => {
    const response = selected.reduce<Complex>((product, factor) => complexMul(product, evaluateFactor(factor, omega)), { re: 1, im: 0 });
    const asym = selected.reduce(
      (sum, factor) => {
        const contribution = approximateFactor(factor, omega);
        return { magnitudeDb: sum.magnitudeDb + contribution.magnitudeDb, phaseDeg: sum.phaseDeg + contribution.phaseDeg };
      },
      { magnitudeDb: 0, phaseDeg: 0 },
    );
    return {
      omega,
      re: response.re,
      im: response.im,
      magnitudeDb: 20 * Math.log10(Math.max(complexMag(response), EPSILON)),
      phaseDeg: Math.atan2(response.im, response.re) * RAD_TO_DEG,
      asymMagnitudeDb: asym.magnitudeDb,
      asymPhaseDeg: asym.phaseDeg,
    };
  });
  const unwrapped = unwrapDegrees(raw.map((point) => point.phaseDeg));
  return raw.map((point, index) => ({ ...point, phaseUnwrappedDeg: unwrapped[index] }));
}

function interpolateAtOmega(points: FrequencyPoint[], omega: number, accessor: (point: FrequencyPoint) => number) {
  if (!points.length) return 0;
  if (omega <= points[0].omega) return accessor(points[0]);
  if (omega >= points[points.length - 1].omega) return accessor(points[points.length - 1]);
  const upperIndex = points.findIndex((point) => point.omega >= omega);
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const fraction = (Math.log10(omega) - Math.log10(lower.omega)) / (Math.log10(upper.omega) - Math.log10(lower.omega));
  return accessor(lower) + (accessor(upper) - accessor(lower)) * fraction;
}

function findCrossing(points: FrequencyPoint[], accessor: (point: FrequencyPoint) => number, target: number) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = accessor(points[index - 1]) - target;
    const current = accessor(points[index]) - target;
    if (previous === 0) return points[index - 1].omega;
    if (previous * current <= 0) {
      const fraction = previous / (previous - current);
      return Math.pow(10, Math.log10(points[index - 1].omega) + fraction * (Math.log10(points[index].omega) - Math.log10(points[index - 1].omega)));
    }
  }
  return undefined;
}

/** Finds the first gain crossover and first -180° phase crossover using log-frequency interpolation. */
export function extractStabilityMargins(points: FrequencyPoint[]): StabilityMargins {
  const gainCrossoverOmega = findCrossing(points, (point) => point.magnitudeDb, 0);
  const gainCrossover = gainCrossoverOmega === undefined ? undefined : (() => {
    const phaseDeg = interpolateAtOmega(points, gainCrossoverOmega, (point) => point.phaseUnwrappedDeg);
    let phaseMarginDeg = 180 + phaseDeg;
    while (phaseMarginDeg > 180) phaseMarginDeg -= 360;
    while (phaseMarginDeg <= -180) phaseMarginDeg += 360;
    return { omega: gainCrossoverOmega, phaseDeg, phaseMarginDeg };
  })();

  const minPhase = Math.min(...points.map((point) => point.phaseUnwrappedDeg));
  const candidates: number[] = [];
  for (let target = -180; target >= minPhase - 1e-6; target -= 360) {
    const crossover = findCrossing(points, (point) => point.phaseUnwrappedDeg, target);
    if (crossover !== undefined) candidates.push(crossover);
  }
  const phaseCrossoverOmega = candidates.sort((a, b) => a - b)[0];
  const phaseCrossover = phaseCrossoverOmega === undefined ? undefined : (() => {
    const magnitudeDb = interpolateAtOmega(points, phaseCrossoverOmega, (point) => point.magnitudeDb);
    return { omega: phaseCrossoverOmega, magnitudeDb, gainMarginDb: -magnitudeDb };
  })();
  return { gainCrossover, phaseCrossover };
}

export function factorSlopeEvents(factors: FrequencyFactor[]): { initialSlopeDbPerDecade: number; events: FactorSlopeEvent[] } {
  let initialSlopeDbPerDecade = 0;
  const events: FactorSlopeEvent[] = [];
  factors.forEach((factor) => {
    if (factor.kind === "gain") return;
    const polarity = factor.kind === "zero" ? 1 : -1;
    factor.roots.forEach((root) => {
      const naturalFrequency = complexMag(root);
      if (naturalFrequency < EPSILON) {
        initialSlopeDbPerDecade += polarity * 20;
      } else {
        events.push({ omega: naturalFrequency, deltaDbPerDecade: polarity * 20, label: factor.label });
      }
    });
  });
  return { initialSlopeDbPerDecade, events: events.sort((a, b) => a.omega - b.omega) };
}

/** Convenience evaluator retained for unit-level verification of polynomial inputs. */
export function evaluatePolynomialTransfer(numerator: number[], denominator: number[], omega: number): Complex {
  return complexDiv(evalPolyComplex(numerator, { re: 0, im: omega }), evalPolyComplex(denominator, { re: 0, im: omega }));
}
