import {
  defaultRectifierParameters,
  simulateControlledRectifier,
  type RectifierLoad,
  type RectifierParameters,
  type RectifierPhase,
  type RectifierType,
  type VoltageFormat,
} from "../client/src/features/power-electronics/rectifierMath.ts";

const EPSILON = 1e-6;
const phaseModes: RectifierPhase[] = ["single", "three"];
const rectifierTypes: RectifierType[] = ["half", "full"];
const loadTypes: RectifierLoad[] = ["R", "RL", "RC", "RLC", "RLE"];
const voltageFormats: VoltageFormat[] = ["rms", "peak"];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function relativeError(actual: number, expected: number) {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), EPSILON);
}

function expectedOutputFrequency(phase: RectifierPhase, rectifierType: RectifierType, frequency: number) {
  if (phase === "three") return frequency * (rectifierType === "full" ? 6 : 3);
  return frequency * (rectifierType === "full" ? 2 : 1);
}

function idealResistiveAverage(phase: RectifierPhase, rectifierType: RectifierType, peakVoltage: number) {
  if (phase === "single") return rectifierType === "full" ? (2 * peakVoltage) / Math.PI : peakVoltage / Math.PI;
  return rectifierType === "full"
    ? (3 * Math.sqrt(3) * peakVoltage) / Math.PI
    : (3 * Math.sqrt(3) * peakVoltage) / (2 * Math.PI);
}

function run(parameters: RectifierParameters, label: string) {
  const simulation = simulateControlledRectifier(parameters);
  const samples = simulation.samples;
  const metrics = simulation.metrics;
  assert(samples.length === 1441, `${label}: expected exactly two display periods`);
  assert(samples.every((sample) => Number.isFinite(sample.va) && Number.isFinite(sample.vb) && Number.isFinite(sample.vc) && Number.isFinite(sample.outputVoltage) && Number.isFinite(sample.outputCurrent)), `${label}: all sampled waveform values must be finite`);
  assert(samples.every((sample) => sample.outputCurrent >= -EPSILON), `${label}: output current must remain nonnegative for the modeled diode/SCR load modes`);
  assert(Number.isFinite(metrics.voltageRms) && Number.isFinite(metrics.currentRms) && Number.isFinite(metrics.powerFactor), `${label}: all core metrics must be finite`);
  assert(metrics.powerFactor >= -EPSILON && metrics.powerFactor <= 1 + EPSILON, `${label}: power factor must remain in [-1, 1]`);
  assert(metrics.outputFrequency === expectedOutputFrequency(parameters.phase, parameters.rectifierType, parameters.frequency), `${label}: output ripple frequency mismatch`);
  return simulation;
}

let matrixCases = 0;
for (const phase of phaseModes) {
  for (const rectifierType of rectifierTypes) {
    for (const loadType of loadTypes) {
      for (const voltageFormat of voltageFormats) {
        for (const freeWheelingDiode of [false, true]) {
          for (const firingAngle of [0, 42, 90]) {
            const parameters: RectifierParameters = {
              ...defaultRectifierParameters,
              phase,
              rectifierType,
              loadType,
              voltageFormat,
              inputVoltage: voltageFormat === "rms" ? 120 : 120 * Math.SQRT2,
              firingAngle,
              freeWheelingDiode,
              backEmfVoltage: loadType === "RLE" ? 36 : 0,
            };
            run(parameters, `${phase}/${rectifierType}/${loadType}/${voltageFormat}/FWD-${freeWheelingDiode}/${firingAngle}deg`);
            matrixCases += 1;
          }
        }
      }
    }
  }
}

for (const phase of phaseModes) {
  for (const rectifierType of rectifierTypes) {
    const base: RectifierParameters = {
      ...defaultRectifierParameters,
      phase,
      rectifierType,
      loadType: "R",
      freeWheelingDiode: false,
      voltageFormat: "peak",
      inputVoltage: 170,
      firingAngle: 0,
    };
    const simulation = run(base, `ideal-${phase}/${rectifierType}`);
    const expected = idealResistiveAverage(phase, rectifierType, 170);
    assert(relativeError(simulation.metrics.voltageDc, expected) < 0.015, `ideal-${phase}/${rectifierType}: Vdc ${simulation.metrics.voltageDc.toFixed(5)} differs from ideal ${expected.toFixed(5)}`);
    const delayed = run({ ...base, firingAngle: 42 }, `delayed-${phase}/${rectifierType}`);
    assert(delayed.metrics.voltageDc < simulation.metrics.voltageDc, `delayed-${phase}/${rectifierType}: firing-angle increase must reduce resistive Vdc`);
  }
}

for (const phase of phaseModes) {
  const peakVoltage = 170;
  const alphaDeg = 30;
  const alphaRad = (alphaDeg * Math.PI) / 180;
  const continuous = run({
    ...defaultRectifierParameters,
    phase,
    rectifierType: "full",
    loadType: "RL",
    voltageFormat: "peak",
    inputVoltage: peakVoltage,
    firingAngle: alphaDeg,
    resistance: 10,
    inductanceMilliHenry: 5000,
    freeWheelingDiode: false,
  }, `continuous-${phase}/full/RL`);
  const expected = (phase === "single" ? 2 : 3 * Math.sqrt(3)) * peakVoltage * Math.cos(alphaRad) / Math.PI;
  assert(relativeError(continuous.metrics.voltageDc, expected) < 0.04, `continuous-${phase}/full/RL: Vdc ${continuous.metrics.voltageDc.toFixed(5)} differs from cosine relation ${expected.toFixed(5)}`);
  assert(continuous.metrics.conductionMode === "CCM", `continuous-${phase}/full/RL: high inductance must produce continuous current`);
  assert(relativeError(continuous.metrics.currentDc, continuous.metrics.voltageDc / 10) < 0.04, `continuous-${phase}/full/RL: mean current must satisfy Vdc/R in periodic steady state`);
}

const equivalentRms = run({ ...defaultRectifierParameters, loadType: "R", freeWheelingDiode: false, voltageFormat: "rms", inputVoltage: 120, firingAngle: 20 }, "RMS reference");
const equivalentPeak = run({ ...defaultRectifierParameters, loadType: "R", freeWheelingDiode: false, voltageFormat: "peak", inputVoltage: 120 * Math.SQRT2, firingAngle: 20 }, "Peak equivalent");
assert(relativeError(equivalentRms.metrics.voltageDc, equivalentPeak.metrics.voltageDc) < 0.003, "RMS and equivalent peak input modes must produce the same Vdc");

const rl = run({ ...defaultRectifierParameters, loadType: "RL", backEmfVoltage: 0 }, "RL reference");
const rle = run({ ...defaultRectifierParameters, loadType: "RLE", backEmfVoltage: 60 }, "RLE reference");
assert(rle.metrics.currentDc < rl.metrics.currentDc, "RLE back EMF must reduce mean load current relative to RL");
const defaultWaveform = run(defaultRectifierParameters, "default waveform persistence");
const lateCycleConduction = defaultWaveform.samples.filter((sample) => sample.time > defaultWaveform.period && sample.outputVoltage > 1).length;
assert(lateCycleConduction > 200, "default waveform: rectified output must conduct for a substantial portion of the second displayed cycle");

console.table([
  { check: "matrix configurations", value: matrixCases },
  { check: "single/full/R ideal Vdc", value: idealResistiveAverage("single", "full", 170).toFixed(3) },
  { check: "three/full/R ideal Vdc", value: idealResistiveAverage("three", "full", 170).toFixed(3) },
  { check: "RMS/peak equivalence Vdc", value: equivalentRms.metrics.voltageDc.toFixed(3) },
  { check: "RL / RLE Idc", value: `${rl.metrics.currentDc.toFixed(3)} / ${rle.metrics.currentDc.toFixed(3)}` },
  { check: "late-cycle output samples", value: lateCycleConduction },
]);
console.table([0, 180, 360, 540, 720, 900, 1080, 1260, 1440].map((index) => ({
  sample: index,
  timeMs: (defaultWaveform.samples[index].time * 1000).toFixed(3),
  vOut: defaultWaveform.samples[index].outputVoltage.toFixed(3),
  iOut: defaultWaveform.samples[index].outputCurrent.toFixed(3),
})));
