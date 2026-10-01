/**
 * PID Studio mathematics engine — polynomial controller forms, closed-loop construction,
 * input generators, design-spec matching, and an RK4-driven LTI response solver.
 */
import type { ControllerPrimary, ControllerSubtype, PidGains, SignalType, TransferPolynomial, PidScopeData } from "../../../../shared/control/pidTypes";
import { getControllerSubtypes, defaultControllerSubtype } from "../../../../shared/control/pidTypes";
export type { ControllerPrimary, ControllerSubtype, PidGains, SignalType, TransferPolynomial, PidScopeData };
export { getControllerSubtypes, defaultControllerSubtype };
import { multiplyPolynomials, polyAdd } from "./controlMath";

const tidy = (poly: number[]) => {
  const output = poly.map((value) => (Math.abs(value) < 1e-10 ? 0 : value));
  while (output.length > 1 && output[0] === 0) output.shift();
  return output;
};

const padAndAdd = (left: number[], right: number[]) => polyAdd(tidy(left), tidy(right));

export function polynomialLatex(coefficients: number[], variable = "s") {
  const values = tidy(coefficients);
  const degree = values.length - 1;
  const terms: string[] = [];
  values.forEach((coefficient, index) => {
    if (Math.abs(coefficient) < 1e-10) return;
    const power = degree - index;
    const magnitude = Math.abs(coefficient);
    const coefficientPart = power === 0 || magnitude !== 1 ? Number(magnitude.toFixed(5)).toString() : "";
    const variablePart = power === 0 ? "" : power === 1 ? variable : `${variable}^{${power}}`;
    const body = `${coefficientPart}${variablePart}` || "1";
    if (terms.length === 0) terms.push(coefficient < 0 ? `-${body}` : body);
    else terms.push(`${coefficient < 0 ? "-" : "+"} ${body}`);
  });
  return terms.join(" ") || "0";
}

export function controllerTransfer(primary: ControllerPrimary, subtype: ControllerSubtype, gains: PidGains): TransferPolynomial {
  const { kp, ki, kd, n } = gains;
  const filter = [1 / Math.max(n, 1e-8), 1];
  const controller = (numerator: number[], denominator: number[], latex: string): TransferPolynomial => ({ numerator: tidy(numerator), denominator: tidy(denominator), latex });
  if (primary === "P") return controller([kp], [1], `${kp.toFixed(4)}`);
  if (primary === "I") return controller([ki], [1, 0], `\\frac{${ki.toFixed(4)}}{s}`);
  if (primary === "D") return controller([kd, 0], [1], `${kd.toFixed(4)}s`);
  if (primary === "PI") {
    if (subtype === "series") return controller([kp, kp * ki], [1, 0], `\\frac{${kp.toFixed(4)}s + ${(kp * ki).toFixed(4)}}{s}`);
    return controller([kp, ki], [1, 0], `\\frac{${kp.toFixed(4)}s + ${ki.toFixed(4)}}{s}`);
  }
  if (primary === "PD") {
    if (subtype === "parallel-modified") {
      const numerator = padAndAdd(multiplyPolynomials([kp], filter), [kd, 0]);
      return controller(numerator, filter, `${kp.toFixed(4)} + \\frac{${kd.toFixed(4)}s}{1 + \\frac{1}{${n.toFixed(4)}}s}`);
    }
    if (subtype === "series-standard") return controller([kp * kd, kp], [1], `${kp.toFixed(4)}(1 + ${kd.toFixed(4)}s)`);
    if (subtype === "series-modified") {
      const numerator = padAndAdd(multiplyPolynomials([kp], filter), [kp * kd, 0]);
      return controller(numerator, filter, `${kp.toFixed(4)}\\left(1 + \\frac{${kd.toFixed(4)}s}{1 + \\frac{1}{${n.toFixed(4)}}s}\\right)`);
    }
    return controller([kd, kp], [1], `${kp.toFixed(4)} + ${kd.toFixed(4)}s`);
  }
  if (primary === "PID") {
    if (subtype === "parallel-modified") {
      const numerator = padAndAdd(padAndAdd(multiplyPolynomials([kp], multiplyPolynomials([1, 0], filter)), multiplyPolynomials([ki], filter)), multiplyPolynomials([kd, 0], [1, 0]));
      const denominator = multiplyPolynomials([1, 0], filter);
      return controller(numerator, denominator, `${kp.toFixed(4)} + \\frac{${ki.toFixed(4)}}{s} + \\frac{${kd.toFixed(4)}s}{1 + \\frac{1}{${n.toFixed(4)}}s}`);
    }
    if (subtype === "series-standard") {
      const numerator = multiplyPolynomials([kp], multiplyPolynomials([1, ki], [kd, 1]));
      return controller(numerator, [1, 0], `${kp.toFixed(4)}\\left(1 + \\frac{${ki.toFixed(4)}}{s}\\right)(1 + ${kd.toFixed(4)}s)`);
    }
    if (subtype === "series-modified") {
      const numerator = multiplyPolynomials([kp], multiplyPolynomials([1, ki], padAndAdd(filter, [kd, 0])));
      const denominator = multiplyPolynomials([1, 0], filter);
      return controller(numerator, denominator, `${kp.toFixed(4)}\\left(1 + \\frac{${ki.toFixed(4)}}{s}\\right)\\left(1 + \\frac{${kd.toFixed(4)}s}{1 + \\frac{1}{${n.toFixed(4)}}s}\\right)`);
    }
    return controller([kd, kp, ki], [1, 0], `${kp.toFixed(4)} + \\frac{${ki.toFixed(4)}}{s} + ${kd.toFixed(4)}s`);
  }
  return controller([1], [1], "1");
}

export function inputSignalTransfer(type: SignalType, magnitude: number, parameter: number): TransferPolynomial {
  const format = (value: number) => Number(value.toFixed(6)).toString();
  const amplitude = format(magnitude);
  const frequency = format(parameter);
  if (type === "impulse") return { numerator: [magnitude], denominator: [1], latex: amplitude };
  if (type === "step") return { numerator: [magnitude], denominator: [1, 0], latex: `\\frac{${amplitude}}{s}` };
  if (type === "ramp") return { numerator: [magnitude], denominator: [1, 0, 0], latex: `\\frac{${amplitude}}{s^2}` };
  if (type === "parabolic") return { numerator: [magnitude], denominator: [1, 0, 0, 0], latex: `\\frac{${amplitude}}{s^3}` };
  if (type === "exponential") return { numerator: [magnitude], denominator: [1, parameter], latex: `\\frac{${amplitude}}{s + ${frequency}}` };
  if (type === "sine") return { numerator: [magnitude * parameter], denominator: [1, 0, parameter * parameter], latex: `\\frac{${amplitude}\\cdot${frequency}}{s^2 + ${frequency}^2}` };
  return { numerator: [magnitude, 0], denominator: [1, 0, parameter * parameter], latex: `\\frac{${amplitude}s}{s^2 + ${frequency}^2}` };
}

function inputValue(type: SignalType, magnitude: number, parameter: number, time: number, dt: number) {
  if (type === "impulse") return time <= dt ? magnitude / Math.max(dt, 1e-4) : 0;
  if (type === "step") return magnitude;
  if (type === "ramp") return magnitude * time;
  if (type === "parabolic") return magnitude * time * time;
  if (type === "exponential") return magnitude * Math.exp(-parameter * time);
  if (type === "sine") return magnitude * Math.sin(parameter * time);
  return magnitude * Math.cos(parameter * time);
}

export function closedLoopTransfer(
  controller: TransferPolynomial,
  plantNumerator: number[],
  plantDenominator: number[],
  feedback: TransferPolynomial = { numerator: [1], denominator: [1], latex: "1" },
) {
  const openNum = multiplyPolynomials(controller.numerator, plantNumerator);
  const openDen = multiplyPolynomials(controller.denominator, plantDenominator);
  const closedNum = multiplyPolynomials(openNum, feedback.denominator);
  const closedDen = padAndAdd(
    multiplyPolynomials(openDen, feedback.denominator),
    multiplyPolynomials(openNum, feedback.numerator),
  );
  return {
    openLoop: { numerator: tidy(openNum), denominator: tidy(openDen), latex: `\\frac{(${controller.latex})(${polynomialLatex(plantNumerator)})}{${polynomialLatex(plantDenominator)}}` },
    closedLoop: { numerator: tidy(closedNum), denominator: tidy(closedDen), latex: `\\frac{${polynomialLatex(closedNum)}}{${polynomialLatex(closedDen)}}` },
  };
}

export function simulatePidScope(controller: TransferPolynomial, plantNumerator: number[], plantDenominator: number[], signal: { type: SignalType; magnitude: number; parameter: number }, tMax = 12, dt = 0.01): PidScopeData {
  const { openLoop, closedLoop } = closedLoopTransfer(controller, plantNumerator, plantDenominator);
  const signalTf = inputSignalTransfer(signal.type, signal.magnitude, signal.parameter);
  const output = { numerator: tidy(multiplyPolynomials(closedLoop.numerator, signalTf.numerator)), denominator: tidy(multiplyPolynomials(closedLoop.denominator, signalTf.denominator)), latex: `(${closedLoop.latex})\\left(${signalTf.latex}\\right)` };
  const denominator = closedLoop.denominator;
  const numerator = closedLoop.numerator;
  const order = denominator.length - 1;
  if (order < 1 || Math.abs(denominator[0]) < 1e-12) return { t: [], y: [], r: [], overshoot: 0, peakTime: 0, settlingTime: 0, steadyStateError: 0, openLoop, closedLoop, output };
  const lead = denominator[0];
  const den = denominator.map((value) => value / lead);
  const num = [...numerator].map((value) => value / lead);
  while (num.length < denominator.length) num.unshift(0);
  const direct = num[0];
  const c = Array.from({ length: order }, (_, index) => num[num.length - 1 - index] - direct * den[den.length - 1 - index]);
  const state = Array(order).fill(0);
  const derivative = (snapshot: number[], input: number) => {
    const result = Array(order).fill(0);
    for (let index = 0; index < order - 1; index++) result[index] = snapshot[index + 1];
    result[order - 1] = input - snapshot.reduce((sum, value, index) => sum + den[den.length - 1 - index] * value, 0);
    return result;
  };
  const t: number[] = []; const y: number[] = []; const r: number[] = [];
  const steps = Math.floor(tMax / dt);
  for (let index = 0; index <= steps; index++) {
    const time = index * dt;
    const reference = inputValue(signal.type, signal.magnitude, signal.parameter, time, dt);
    const outputValue = direct * reference + state.reduce((sum, value, stateIndex) => sum + c[stateIndex] * value, 0);
    t.push(time); r.push(reference); y.push(outputValue);
    const k1 = derivative(state, reference);
    const k2 = derivative(state.map((value, stateIndex) => value + dt * 0.5 * k1[stateIndex]), inputValue(signal.type, signal.magnitude, signal.parameter, time + dt * 0.5, dt));
    const k3 = derivative(state.map((value, stateIndex) => value + dt * 0.5 * k2[stateIndex]), inputValue(signal.type, signal.magnitude, signal.parameter, time + dt * 0.5, dt));
    const k4 = derivative(state.map((value, stateIndex) => value + dt * k3[stateIndex]), inputValue(signal.type, signal.magnitude, signal.parameter, time + dt, dt));
    for (let stateIndex = 0; stateIndex < order; stateIndex++) state[stateIndex] += dt / 6 * (k1[stateIndex] + 2 * k2[stateIndex] + 2 * k3[stateIndex] + k4[stateIndex]);
  }
  const finalY = y[y.length - 1] || 0;
  const peakValue = Math.max(...y);
  const peakIndex = y.indexOf(peakValue);
  const overshoot = Math.abs(finalY) > 1e-9 && peakValue > finalY ? ((peakValue - finalY) / Math.abs(finalY)) * 100 : 0;
  const band = 0.02 * Math.max(Math.abs(finalY), 1e-8);
  let settlingTime = tMax;
  for (let index = y.length - 1; index >= 0; index--) if (Math.abs(y[index] - finalY) > band) { settlingTime = t[Math.min(index + 1, t.length - 1)]; break; }
  const referenceFinal = r[r.length - 1] || 0;
  return { t, y, r, overshoot, peakTime: t[peakIndex] || 0, settlingTime, steadyStateError: Math.abs(referenceFinal - finalY), openLoop, closedLoop, output };
}

export function estimatePidFromSpecs(plantNumerator: number[], plantDenominator: number[], zeta: number, omegaN: number): PidGains {
  const lead = plantDenominator[0] || 1;
  const normalized = plantDenominator.map((value) => value / lead);
  const desired = [1, 2 * zeta * omegaN, omegaN * omegaN];
  const target = multiplyPolynomials(normalized.slice(0, -1), desired);
  const residual = padAndAdd(target, multiplyPolynomials([1, 0], normalized).map((value) => -value));
  const width = Math.max(residual.length, plantNumerator.length + 2);
  const align = (poly: number[]) => Array.from({ length: width }, (_, index) => poly[index - (width - poly.length)] || 0);
  const kdBasis = align(multiplyPolynomials(plantNumerator, [1, 0, 0]));
  const kpBasis = align(multiplyPolynomials(plantNumerator, [1, 0]));
  const kiBasis = align(plantNumerator);
  const targetVector = align(residual);
  const basis = [kpBasis, kiBasis, kdBasis];
  const normal = basis.map((row) => basis.map((column) => row.reduce((sum, value, index) => sum + value * column[index], 0)));
  const projection = basis.map((row) => row.reduce((sum, value, index) => sum + value * targetVector[index], 0));
  const augmented = normal.map((row, index) => [...row, projection[index]]);
  for (let pivot = 0; pivot < 3; pivot++) {
    let best = pivot;
    for (let candidate = pivot + 1; candidate < 3; candidate++) if (Math.abs(augmented[candidate][pivot]) > Math.abs(augmented[best][pivot])) best = candidate;
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot] || 1;
    for (let column = pivot; column < 4; column++) augmented[pivot][column] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column < 4; column++) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  return {
    kp: Math.max(0, Number((augmented[0][3] || 0).toFixed(5))),
    ki: Math.max(0, Number((augmented[1][3] || 0).toFixed(5))),
    kd: Math.max(0, Number((augmented[2][3] || 0).toFixed(5))),
    n: 100,
  };
}
