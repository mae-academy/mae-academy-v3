import {
  defaultRectifierParameters,
  simulateControlledRectifier,
  type RectifierParameters,
} from "../client/src/lib/rectifierMath.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function run(name: string, parameters: RectifierParameters) {
  const simulation = simulateControlledRectifier(parameters);
  assert(simulation.samples.length === 1441, `${name}: expected exactly two sampled periods`);
  assert(simulation.samples.every((sample) => sample.outputCurrent >= -1e-9), `${name}: output current must not become negative`);
  assert(Number.isFinite(simulation.metrics.voltageRms) && Number.isFinite(simulation.metrics.currentRms), `${name}: RMS metrics must be finite`);
  return simulation;
}

const single = run("single-phase full-wave RL", defaultRectifierParameters);
assert(single.metrics.outputFrequency === 120, "single-phase full-wave: output frequency should equal 2f");
assert(Math.max(...single.samples.map((sample) => Math.abs(sample.va))) > 100, "single-phase: input trace was not generated");
assert(single.samples.filter((sample) => sample.time > 0.02).some((sample) => sample.outputVoltage > 1), "single-phase: output-voltage pulses must persist through the second period");

const three = run("three-phase full-wave R", {
  ...defaultRectifierParameters,
  phase: "three",
  rectifierType: "full",
  loadType: "R",
  frequency: 50,
  firingAngle: 30,
});
assert(three.metrics.outputFrequency === 300, "three-phase full-wave: output frequency should equal 6f");
assert(Math.max(...three.samples.map((sample) => Math.abs(sample.vb))) > 100 && Math.max(...three.samples.map((sample) => Math.abs(sample.vc))) > 100, "three-phase: all input phase traces must be generated");
assert(Math.min(...three.samples.map((sample) => sample.va)) < -100 && Math.min(...three.samples.map((sample) => sample.vb)) < -100 && Math.min(...three.samples.map((sample) => sample.vc)) < -100, "three-phase: all ABC input traces must retain their negative half-cycles");
assert(Math.abs(three.samples.at(-1)!.time - 0.04) < 1e-8, "three-phase: the two-period timebase should span 40 ms at 50 Hz");
assert(Math.abs(three.samples[1100].va) > 10 && Math.abs(three.samples[1100].vb) > 10 && Math.abs(three.samples[1100].vc) > 10, "three-phase: late-cycle ABC values must remain populated");

const rl = run("RL reference", { ...defaultRectifierParameters, loadType: "RL", backEmfVoltage: 0 });
const rle = run("RLE motor load", { ...defaultRectifierParameters, loadType: "RLE", backEmfVoltage: 60 });
assert(rle.metrics.currentDc < rl.metrics.currentDc, "RLE: back EMF should reduce mean load current relative to RL");
const rlc = run("RLC filtered load", { ...defaultRectifierParameters, loadType: "RLC", capacitanceMicroFarad: 220 });
assert(rlc.metrics.powerFactor >= 0 && rlc.metrics.powerFactor <= 1, "RLC: power factor must remain in the closed interval [0, 1]");
console.table([
  { model: "single-phase RL", fOutHz: single.metrics.outputFrequency, vDc: single.metrics.voltageDc.toFixed(3), iDc: single.metrics.currentDc.toFixed(3) },
  { model: "three-phase R", fOutHz: three.metrics.outputFrequency, vDc: three.metrics.voltageDc.toFixed(3), iDc: three.metrics.currentDc.toFixed(3) },
  { model: "RLE motor", fOutHz: rle.metrics.outputFrequency, vDc: rle.metrics.voltageDc.toFixed(3), iDc: rle.metrics.currentDc.toFixed(3) },
  { model: "RLC filtered", fOutHz: rlc.metrics.outputFrequency, vDc: rlc.metrics.voltageDc.toFixed(3), iDc: rlc.metrics.currentDc.toFixed(3), pf: rlc.metrics.powerFactor.toFixed(3) },
]);
