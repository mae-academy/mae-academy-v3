import { defaultChopperParameters, simulateChopper, type ChopperParameters } from "../client/src/lib/chopperMath.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function relativeError(value: number, expected: number) { return Math.abs(value - expected) / Math.max(Math.abs(expected), 1e-9); }
function simulate(overrides: Partial<ChopperParameters>, label: string) { const result = simulateChopper({ ...defaultChopperParameters, ...overrides }); assert(result.samples.length === 7 * 260 + 1, `${label}: must display seven steady-state switching periods`); assert(result.samples.every((point) => Number.isFinite(point.outputVoltage) && Number.isFinite(point.outputCurrent)), `${label}: all samples must remain finite`); return result; }

const buckR = simulate({ topology: "buck", loadType: "R", inputVoltage: 120, dutyCycle: 0.5, resistance: 12 }, "buck R");
assert(relativeError(buckR.metrics.outputVoltageDc, 60) < 0.015, "buck R: average output must follow D*Vs");
assert(buckR.metrics.conductionMode === "DCM", "buck R: zero-current intervals must classify as DCM");

const buckCcm = simulate({ topology: "buck", loadType: "RL", inputVoltage: 120, dutyCycle: 0.55, resistance: 12, inductanceMilliHenry: 35 }, "buck RL CCM");
assert(buckCcm.metrics.currentMin > 0, "buck RL high-L: current must remain above zero in CCM");
const buckDcm = simulate({ topology: "buck", loadType: "RL", inputVoltage: 120, dutyCycle: 0.3, resistance: 40, inductanceMilliHenry: 0.05 }, "buck RL DCM");
assert(buckDcm.metrics.conductionMode === "DCM", "buck RL low-L: zero-current clamp must classify DCM");

const rleLowE = simulate({ topology: "buck", loadType: "RLE", backEmfVoltage: 0, inductanceMilliHenry: 12 }, "buck RLE no EMF");
const rleHighE = simulate({ topology: "buck", loadType: "RLE", backEmfVoltage: 35, inductanceMilliHenry: 12 }, "buck RLE high EMF");
assert(rleHighE.metrics.outputCurrentDc <= rleLowE.metrics.outputCurrentDc, "RLE: back-EMF must not increase average load current");

for (const topology of ["boost", "buck-boost"] as const) { const result = simulate({ topology, loadType: "RL", dutyCycle: 0.58, inductanceMilliHenry: 10 }, `${topology} RL`); assert(result.metrics.outputVoltageRms > 0 && result.metrics.criticalInductanceMilliHenry > 0, `${topology}: metrics must remain populated`); }
const pwm = simulate({ control: "pwm", switchingFrequency: 4000, dutyCycle: 0.4 }, "PWM");
const fm = simulate({ control: "frequency", switchingFrequency: 4000, dutyCycle: 0.4 }, "frequency modulation");
assert(fm.switchingFrequency !== pwm.switchingFrequency, "frequency modulation: effective switching frequency must vary with duty cycle");

console.table([{ check: "Buck Vdc", value: buckR.metrics.outputVoltageDc.toFixed(3) }, { check: "CCM Imin", value: buckCcm.metrics.currentMin.toFixed(4) }, { check: "DCM Imin", value: buckDcm.metrics.currentMin.toFixed(4) }, { check: "RLE Idc", value: rleHighE.metrics.outputCurrentDc.toFixed(4) }]);
