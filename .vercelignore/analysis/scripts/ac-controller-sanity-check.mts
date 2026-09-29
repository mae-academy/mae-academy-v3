import { defaultAcVoltageControllerParameters, simulateAcVoltageController, solveExtinctionAngle, type AcVoltageControllerParameters } from "../client/src/features/power-electronics/acVoltageControllerMath.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function close(value: number, expected: number, tolerance: number, message: string) { assert(Math.abs(value - expected) <= tolerance, `${message}: received ${value}, expected ${expected} ± ${tolerance}`); }
function simulate(overrides: Partial<AcVoltageControllerParameters>, label: string) {
  const simulation = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, ...overrides });
  assert(simulation.samples.length > 1000, `${label}: expected a substantial sampled waveform`);
  assert(simulation.samples.every((sample) => Number.isFinite(sample.sourceVoltage) && Number.isFinite(sample.outputVoltage) && Number.isFinite(sample.outputCurrent)), `${label}: samples must be finite`);
  return simulation;
}

const resistance = 18;
const inductance = 0.028;
const omega = 2 * Math.PI * 60;
const alpha = 75 * Math.PI / 180;
const beta = solveExtinctionAngle(alpha, resistance, inductance, omega);
const phi = Math.atan(omega * inductance / resistance);
const residual = Math.sin(beta - phi) - Math.sin(alpha - phi) * Math.exp(-(beta - alpha) / (omega * (inductance / resistance)));
assert(beta > Math.PI && beta < alpha + 2 * Math.PI, "RL beta solver: extinction must occur after pi and before a full cycle after firing");
close(residual, 0, 1e-7, "RL beta solver: transcendental residual");

const resistive = simulate({ loadType: "R", controlMode: "phase-angle", firingAngle: 90, topology: "bidirectional" }, "resistive phase-angle");
const earlyPositiveHalf = resistive.samples.filter((sample) => sample.time < resistive.period / 4);
assert(earlyPositiveHalf.every((sample) => Math.abs(sample.outputVoltage) < 1e-7), "R phase-angle: output must remain off before alpha");
assert(resistive.samples.some((sample) => sample.outputVoltage > 1), "R phase-angle: output must conduct after alpha");

const integral = simulate({ controlMode: "integral-cycle", onCycles: 2, offCycles: 2, loadType: "R" }, "integral-cycle");
const outputRmsByCycle = Array.from({ length: 4 }, (_, cycle) => {
  const points = integral.samples.slice(cycle * 900, (cycle + 1) * 900);
  return Math.sqrt(points.reduce((sum, point) => sum + point.outputVoltage ** 2, 0) / Math.max(points.length, 1));
});
assert(outputRmsByCycle[0] > 10 && outputRmsByCycle[1] > 10 && outputRmsByCycle[2] < 1e-7 && outputRmsByCycle[3] < 1e-7, "integral-cycle: ON/OFF schedule must preserve full source cycles then block full source cycles");

const rmsInput = simulate({ voltageFormat: "rms", inputVoltage: 120, loadType: "RL" }, "RMS input");
const peakInput = simulate({ voltageFormat: "peak", inputVoltage: 120 * Math.SQRT2, loadType: "RL" }, "peak input");
close(rmsInput.metrics.outputVoltageRms, peakInput.metrics.outputVoltageRms, 1e-4, "RMS/peak equivalence: output voltage RMS");
close(rmsInput.metrics.outputCurrentRms, peakInput.metrics.outputCurrentRms, 1e-4, "RMS/peak equivalence: output current RMS");

const threePhase = simulate({ phase: "three", threePhaseConnection: "delta", loadType: "RL" }, "three-phase delta");
assert(threePhase.metrics.sourceVoltageRms > 0 && threePhase.metrics.outputCurrentRms > 0, "three-phase: source and load metrics must remain nonzero");

console.table([
  { check: "beta (deg)", value: (beta * 180 / Math.PI).toFixed(3) },
  { check: "phase-angle PF", value: resistive.metrics.powerFactor.toFixed(4) },
  { check: "integral duty k", value: integral.metrics.controlValue.toFixed(4) },
  { check: "three-phase current RMS", value: threePhase.metrics.outputCurrentRms.toFixed(4) },
]);
