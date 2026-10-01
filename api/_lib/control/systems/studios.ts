/**
 * Whole-studio computations for the control workspaces. Each function is the work a studio used to do in the browser
 * (root locus sweeps, Bode/Nyquist data, state-space analysis, PID scope), assembled into one JSON-friendly result.
 */
import type { Complex } from './controlMath';
import { findBreakawayPoints, findPolynomialRoots, generateFlawlessRootLocus, simulateLtiStepResponse } from './controlMath';
import { buildFrequencyFactors, computeFrequencyResponse, extractStabilityMargins, factorSlopeEvents, logspace } from './frequencyResponseMath';
import {
  ackermannPolePlacement, characteristicPolynomial, controllabilityMatrix, eigenvalues, integrateStateRK4, observabilityMatrix, rank, type Matrix,
} from './matrixMath';
import { controllerTransfer, estimatePidFromSpecs, inputSignalTransfer, simulatePidScope, type ControllerPrimary, type ControllerSubtype, type PidGains, type SignalType } from './pidMath';

const stripLeadingZeros = (poly: number[]) => {
  const out = [...poly];
  while (out.length > 1 && Math.abs(out[0]) < 1e-12) out.shift();
  return out;
};

/** Characteristic polynomial D(s) + K·N(s), monic and without leading zeros. */
function characteristic(num: number[], den: number[], k: number): number[] {
  const maxDeg = Math.max(den.length, num.length);
  const charPoly = new Array<number>(maxDeg).fill(0);
  const dOffset = maxDeg - den.length;
  for (let idx = 0; idx < den.length; idx++) charPoly[dOffset + idx] += den[idx];
  const nOffset = maxDeg - num.length;
  for (let idx = 0; idx < num.length; idx++) charPoly[nOffset + idx] += k * num[idx];
  let st = 0;
  while (st < charPoly.length && Math.abs(charPoly[st]) < 1e-12) st++;
  if (st === charPoly.length) return [];
  const lead = charPoly[st];
  return charPoly.slice(st).map((val) => val / lead);
}
const closedLoopRoots = (num: number[], den: number[], k: number): Complex[] => { const poly = characteristic(num, den, k); return poly.length ? findPolynomialRoots(poly) : []; };

/** Closed-loop poles and unit-step response at one loop gain. */
export function closedLoopAt(numerator: number[], denominator: number[], gain: number, maxTime: number) {
  const num = stripLeadingZeros(numerator); const den = stripLeadingZeros(denominator);
  const maxDeg = Math.max(num.length, den.length);
  const align = (arr: number[]) => { const out = new Array<number>(maxDeg).fill(0); for (let i = 0; i < arr.length; i++) out[maxDeg - arr.length + i] = arr[i]; return out; };
  const dAligned = align(den); const nAligned = align(num);
  const numCl = nAligned.map((value) => gain * value);
  const denCl = dAligned.map((value, i) => value + gain * nAligned[i]);
  return { roots: closedLoopRoots(num, den, gain), stepResponse: simulateLtiStepResponse(numCl, denCl, 1.0, maxTime, 0.01) };
}

/** Open-loop singularities, asymptotes, the full root-locus sweep, breakaway points, imaginary-axis crossings and departure angles. */
export function computeRootLocus(numerator: number[], denominator: number[]) {
  const num = stripLeadingZeros(numerator); const den = stripLeadingZeros(denominator);
  const openLoopZeros = findPolynomialRoots(num);
  const openLoopPoles = findPolynomialRoots(den);
  const n = openLoopPoles.length; const m = openLoopZeros.length; const i = n - m;
  let asymptotes: { centroid: number; angles: number[] } | null = null;
  if (i > 0) {
    const sumPoles = openLoopPoles.reduce((acc, val) => acc + val.re, 0.0);
    const sumZeros = openLoopZeros.reduce((acc, val) => acc + val.re, 0.0);
    asymptotes = { centroid: (sumPoles - sumZeros) / i, angles: Array.from({ length: i }, (_, k) => ((2 * k + 1) * Math.PI) / i) };
  }
  const breakawayPoints = findBreakawayPoints(num, den);
  if (openLoopPoles.length === 0) return { openLoopZeros, openLoopPoles, asymptotes, branches: [] as Complex[][], imagCrossings: [] as Array<{ k: number; omega: number }>, angleDepartures: [] as Array<{ pole: Complex; angleDeg: number }>, breakawayPoints };

  const computeRoots = (k: number) => closedLoopRoots(num, den, k);
  let branches = generateFlawlessRootLocus(openLoopPoles, computeRoots);

  // Breakaway injection pass
  if (breakawayPoints.length > 0) {
    branches = branches.map((branch) => {
      const result: Complex[] = [];
      for (let idx = 0; idx < branch.length; idx++) {
        const pt = branch[idx]; const prevPt = idx > 0 ? branch[idx - 1] : null;
        const wasReal = prevPt !== null && Math.abs(prevPt.im) < 1e-4; const isComplex = Math.abs(pt.im) > 1e-4;
        if (wasReal && isComplex && prevPt) {
          let bestBreak: number | null = null; let bestDist = Infinity;
          for (const bp of breakawayPoints) { const d = Math.abs(bp - prevPt.re); if (d < bestDist) { bestDist = d; bestBreak = bp; } }
          if (bestBreak !== null && bestDist < 1.0) { result.push({ re: bestBreak, im: 0 }); result.push({ re: bestBreak, im: pt.im >= 0 ? 0.0001 : -0.0001 }); }
        }
        result.push(pt);
      }
      return result;
    });
  }

  // Imaginary-axis crossing (marginal gain by bisection)
  const crossingSet = new Map<string, { k: number; omega: number }>();
  let kLo = 0; let kHi = 1e6;
  for (let iter = 0; iter < 60; iter++) { const kMid = (kLo + kHi) / 2; if (computeRoots(kMid).some((r) => r.re > 0)) kHi = kMid; else kLo = kMid; }
  const kMarginal = (kLo + kHi) / 2;
  if (kMarginal > 0.01 && kMarginal < 999999) {
    computeRoots(kMarginal).forEach((r) => {
      if (Math.abs(r.re) < 0.05 && Math.abs(r.im) > 0.05) { const key = r.im.toFixed(2); if (!crossingSet.has(key)) crossingSet.set(key, { k: kMarginal, omega: Math.abs(r.im) }); }
    });
  }

  // Angle of departure / arrival
  const angleDepartures: Array<{ pole: Complex; angleDeg: number }> = [];
  openLoopPoles.forEach((p) => {
    if (Math.abs(p.im) > 1e-5) {
      let sumZ = 0; openLoopZeros.forEach((z) => { sumZ += Math.atan2(p.im - z.im, p.re - z.re); });
      let sumP = 0; openLoopPoles.forEach((other) => { if (other !== p) sumP += Math.atan2(p.im - other.im, p.re - other.re); });
      let deg = ((Math.PI + sumZ - sumP) * 180) / Math.PI;
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      angleDepartures.push({ pole: p, angleDeg: deg });
    }
  });
  return { openLoopZeros, openLoopPoles, asymptotes, branches, imagCrossings: Array.from(crossingSet.values()), angleDepartures, breakawayPoints };
}

const matchDegrees = (left: number[], right: number[]) => {
  const length = Math.max(left.length, right.length);
  return { left: [...Array(length - left.length).fill(0), ...left], right: [...Array(length - right.length).fill(0), ...right] };
};

/** Bode / Nyquist / Nichols data of K·N(s)/D(s), its stability margins, asymptote slope events and closed-loop step response. */
export function computeBode(numerator: number[], denominator: number[], gain: number, selectedFactorIds: string[], samples: number, timeHorizon: number) {
  const openNum = numerator.map((coefficient) => coefficient * gain);
  const factors = buildFrequencyFactors(openNum, denominator);
  const ids = selectedFactorIds.length === 0 ? factors.map((factor) => factor.id) : selectedFactorIds;
  const response = computeFrequencyResponse(factors, ids, logspace(-2, 4, samples));
  const margins = extractStabilityMargins(response);
  const slopeLogic = factorSlopeEvents(factors.filter((factor) => ids.includes(factor.id)));
  const scaled = numerator.map((coefficient) => coefficient * gain);
  const { left: denAligned, right: numAligned } = matchDegrees(denominator, scaled);
  const closedNum = numAligned; const closedDen = denAligned.map((coefficient, index) => coefficient + numAligned[index]);
  const stepResponse = simulateLtiStepResponse(closedNum, closedDen, 1, timeHorizon, Math.min(0.02, timeHorizon / 700));
  return { factors, response, margins, slopeLogic, closedLoop: { numerator: closedNum, denominator: closedDen }, stepResponse };
}

/** Controllability / observability / eigenvalues of (A,B,C), plus Ackermann pole placement when requested and possible. */
export function analyzeStateSpace(A: Matrix, B: Matrix, C: Matrix, order: number, desiredPoles: number[] | null) {
  let analysis: Record<string, unknown>;
  try {
    const controllability = controllabilityMatrix(A, B);
    const observability = observabilityMatrix(A, C);
    const controllabilityRank = rank(controllability); const observabilityRank = rank(observability);
    analysis = { characteristic: characteristicPolynomial(A), eigenvalues: eigenvalues(A), controllability, observability, controllabilityRank, observabilityRank, controllable: controllabilityRank === order, observable: observabilityRank === order };
  } catch (error) { analysis = { error: error instanceof Error ? error.message : 'Analysis unavailable' }; }
  let placement: ReturnType<typeof ackermannPolePlacement> | null = null;
  if (desiredPoles && analysis.controllable === true) { try { placement = ackermannPolePlacement(A, B, desiredPoles); } catch { placement = null; } }
  return { analysis, placement };
}

export const stateTrajectory = (A: Matrix, x0: number[], duration: number, step: number) => integrateStateRK4(A, x0, duration, step);

export function runPid(primary: ControllerPrimary, subtype: ControllerSubtype, gains: PidGains, plantNum: number[], plantDen: number[], signal: { type: SignalType; magnitude: number; parameter: number }, maxTime: number) {
  const controller = controllerTransfer(primary, subtype, gains);
  return { controller, inputTransfer: inputSignalTransfer(signal.type, signal.magnitude, signal.parameter), scope: simulatePidScope(controller, plantNum, plantDen, signal, maxTime) };
}
export const tunePid = estimatePidFromSpecs;
