import {
  defaultInverterParameters,
  simulateInverter,
  type InverterParameters,
} from "../client/src/features/power-electronics/inverterMath.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function relativeError(value: number, expected: number) {
  return Math.abs(value - expected) / Math.max(Math.abs(expected), 1e-9);
}

function run(parameters: Partial<InverterParameters>, label: string) {
  const result = simulateInverter({ ...defaultInverterParameters, ...parameters });
  assert(result.samples.length === 2401, `${label}: expected exactly two displayed periods plus endpoint`);
  assert(result.samples.every((sample) => Number.isFinite(sample.outputVoltage) && Number.isFinite(sample.outputCurrent)), `${label}: waveform samples must stay finite`);
  return result;
}

const dcVoltage = 200;
const singleFull = run({ phase: "single", singlePhaseSubtype: "full-bridge", technique: "square", loadType: "R", dcVoltage, resistance: 20 }, "single full bridge square");
const expectedFullFundamentalRms = 4 * dcVoltage / (Math.PI * Math.SQRT2);
assert(relativeError(singleFull.metrics.voltageFundamentalRms, expectedFullFundamentalRms) < 0.012, "single full bridge: DFT fundamental RMS must match 4Vdc/(pi*sqrt(2))");
assert(relativeError(singleFull.metrics.voltageRms, dcVoltage) < 0.002, "single full bridge: total RMS must equal Vdc");
assert(relativeError(singleFull.metrics.activePower, (expectedFullFundamentalRms * expectedFullFundamentalRms) / 20) < 0.003, "single R load: active power must equal V1^2/R under the fundamental-power metric definition");
assert(relativeError(singleFull.metrics.powerFactor, (expectedFullFundamentalRms / dcVoltage) ** 2) < 0.003, "single R load: DFT power factor must reflect square-wave distortion");
const lateCycleSquareSamples = singleFull.samples.filter((sample) => sample.time > singleFull.period && Math.abs(sample.outputVoltage) === dcVoltage).length;
assert(lateCycleSquareSamples > 1000, "single full bridge: square-wave voltage must remain present throughout the second displayed period");

const singleHalf = run({ phase: "single", singlePhaseSubtype: "half-bridge", technique: "square", loadType: "R", dcVoltage, resistance: 20 }, "single half bridge square");
const expectedHalfFundamentalRms = 2 * dcVoltage / (Math.PI * Math.SQRT2);
assert(relativeError(singleHalf.metrics.voltageFundamentalRms, expectedHalfFundamentalRms) < 0.012, "single half bridge: DFT fundamental RMS must match 2Vdc/(pi*sqrt(2))");

const three180 = run({ phase: "three", threePhaseConduction: "180", technique: "square", loadType: "R", dcVoltage }, "three phase 180 degree");
const allowed180 = [-(2 * dcVoltage) / 3, -dcVoltage / 3, dcVoltage / 3, (2 * dcVoltage) / 3];
assert(three180.samples.every((sample) => allowed180.some((value) => Math.abs(sample.va - value) < 1e-9)), "three phase 180 degree: phase voltage must use the documented 60-degree levels");

const three120 = run({ phase: "three", threePhaseConduction: "120", technique: "square", loadType: "R", dcVoltage }, "three phase 120 degree");
const allowed120 = [-dcVoltage / 2, 0, dcVoltage / 2];
assert(three120.samples.every((sample) => allowed120.some((value) => Math.abs(sample.va - value) < 1e-9)), "three phase 120 degree: phase voltage must use -Vdc/2, 0, and Vdc/2");

const pwm = run({ phase: "single", technique: "spwm", modulationIndex: 0.85, carrierFrequency: 1800, loadType: "RL" }, "single phase SPWM");
const pwmLevels = new Set(pwm.samples.map((sample) => sample.outputVoltage));
assert(pwmLevels.size === 2 && [...pwmLevels].every((value) => Math.abs(value) === defaultInverterParameters.dcVoltage), "SPWM: ideal full bridge must switch only between DC rails");

const rle = run({ phase: "single", technique: "square", loadType: "RLE", backEmfVoltage: 40 }, "single phase RLE");
assert(rle.metrics.currentRms > 0, "RLE: dynamic load current must be nonzero under square-wave excitation");

console.table([
  { check: "single full V1 RMS", value: singleFull.metrics.voltageFundamentalRms.toFixed(4) },
  { check: "single full active power", value: singleFull.metrics.activePower.toFixed(4) },
  { check: "three phase 180 V RMS", value: three180.metrics.voltageRms.toFixed(4) },
  { check: "three phase 120 V RMS", value: three120.metrics.voltageRms.toFixed(4) },
  { check: "SPWM voltage THD", value: pwm.metrics.voltageThd.toFixed(4) },
]);
