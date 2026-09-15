export type ChopperTopology = "buck" | "boost" | "buck-boost";
export type QuadrantClass = "A" | "B" | "C" | "D" | "E";
export type ChopperControl = "pwm" | "frequency";
export type ChopperLoad = "R" | "RL" | "RLE";

export interface ChopperParameters {
  topology: ChopperTopology;
  quadrantClass: QuadrantClass;
  control: ChopperControl;
  dutyCycle: number;
  switchingFrequency: number;
  inputVoltage: number;
  loadType: ChopperLoad;
  resistance: number;
  inductanceMilliHenry: number;
  backEmfVoltage: number;
}

export interface ChopperSample { time: number; outputVoltage: number; outputCurrent: number; gatePulse: number; switchOn: boolean; }
export interface ChopperMetrics { outputVoltageDc: number; outputVoltageRms: number; outputCurrentDc: number; rippleCurrent: number; currentMax: number; currentMin: number; criticalInductanceMilliHenry: number; conductionMode: "CCM" | "DCM"; inputPower: number; outputPower: number; efficiency: number; dutyCycle: number; }
export type ChopperWarningCode = "DUTY_CYCLE_HIGH" | "BACK_EMF_REVERSES_CURRENT" | "CCM_DCM_BOUNDARY";
export interface ChopperWarning { code: ChopperWarningCode; message: string; }
export interface ChopperSimulation { period: number; switchingFrequency: number; samples: ChopperSample[]; metrics: ChopperMetrics; warnings: ChopperWarning[]; }

const SAMPLES_PER_PERIOD = 260;
const DISPLAY_PERIODS = 7;
export const defaultChopperParameters: ChopperParameters = { topology: "buck", quadrantClass: "A", control: "pwm", dutyCycle: 0.55, switchingFrequency: 4000, inputVoltage: 120, loadType: "RL", resistance: 12, inductanceMilliHenry: 8, backEmfVoltage: 24 };
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);
const normalizedDutyCycle = (value: number) => clamp(Number.isFinite(value) ? value : 0, 0, 1);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const rms = (values: number[]) => Math.sqrt(mean(values.map((value) => value * value)));

function effectiveFrequency(parameters: ChopperParameters) { return Math.max(parameters.control === "frequency" ? parameters.switchingFrequency * (0.45 + parameters.dutyCycle) : parameters.switchingFrequency, 50); }
function criticalInductance(parameters: ChopperParameters, frequency: number) { const duty = normalizedDutyCycle(parameters.dutyCycle), resistance = Math.max(parameters.resistance, 0.05); if (parameters.topology === "buck") return ((1 - duty) * resistance) / (2 * frequency); if (parameters.topology === "boost") return (duty * (1 - duty) ** 2 * resistance) / (2 * frequency); return ((1 - duty) ** 2 * resistance) / (2 * frequency); }
/** Class A blocks reverse current (forward-only); Class B blocks forward current (regen-only). C/D/E leave current direction unconstrained — this model has no separate regenerative source, so B/D current stays pinned near zero. */
function enforceQuadrantCurrent(current: number, quadrantClass: QuadrantClass) { if (quadrantClass === "A") return Math.max(0, current); if (quadrantClass === "B") return Math.min(0, current); return current; }

export function simulateChopper(parameters: ChopperParameters): ChopperSimulation {
  const duty = normalizedDutyCycle(parameters.dutyCycle), frequency = effectiveFrequency(parameters), period = 1 / frequency, resistance = Math.max(parameters.resistance, 0.05), inductance = Math.max(parameters.inductanceMilliHenry, 0) / 1000, hasInductor = parameters.loadType !== "R" && inductance > 0, backEmf = parameters.loadType === "RLE" ? Math.max(parameters.backEmfVoltage, 0) : 0;
  const settlePeriods = hasInductor ? clamp(Math.ceil((7 * inductance / resistance) / period), 10, 420) : 10;
  const totalPeriods = settlePeriods + DISPLAY_PERIODS, dt = period / SAMPLES_PER_PERIOD, totalSteps = totalPeriods * SAMPLES_PER_PERIOD, captureStart = settlePeriods * SAMPLES_PER_PERIOD;
  const samples: ChopperSample[] = []; let current = 0; let dcmSeen = false;
  for (let step = 0; step <= totalSteps; step += 1) {
    const time = step * dt, local = (time % period) / period, switchOn = local < duty;
    let outputVoltage = 0;
    if (!hasInductor) {
      if (parameters.topology === "buck") outputVoltage = switchOn ? parameters.inputVoltage : 0;
      else if (parameters.topology === "boost") outputVoltage = switchOn ? 0 : parameters.inputVoltage;
      else outputVoltage = switchOn ? 0 : -parameters.inputVoltage;
      current = enforceQuadrantCurrent((outputVoltage - backEmf) / resistance, parameters.quadrantClass);
    } else {
      const derivative = (i: number) => {
        if (parameters.topology === "buck") return (switchOn ? parameters.inputVoltage - resistance * i - backEmf : -resistance * i - backEmf) / inductance;
        if (parameters.topology === "boost") return (switchOn ? parameters.inputVoltage : parameters.inputVoltage - resistance * i - backEmf) / inductance;
        return (switchOn ? parameters.inputVoltage : -resistance * i - backEmf) / inductance;
      };
      const k1 = derivative(current), k2 = derivative(current + dt * k1 / 2), k3 = derivative(current + dt * k2 / 2), k4 = derivative(current + dt * k3);
      const nextCurrent = current + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      if (!switchOn && nextCurrent <= 0) { current = 0; dcmSeen = true; } else current = nextCurrent;
      current = enforceQuadrantCurrent(current, parameters.quadrantClass);
      if (parameters.topology === "buck") outputVoltage = current > 1e-9 ? resistance * current + backEmf : backEmf;
      else if (parameters.topology === "boost") outputVoltage = switchOn ? (current > 1e-9 ? backEmf : 0) : parameters.inputVoltage + Math.max(0, inductance * -derivative(current));
      else outputVoltage = switchOn ? (current > 1e-9 ? backEmf : 0) : -(resistance * current + backEmf);
    }
    if (step >= captureStart) samples.push({ time: (step - captureStart) * dt, outputVoltage, outputCurrent: current, gatePulse: switchOn ? parameters.inputVoltage * 0.12 : 0, switchOn });
  }
  const analysis = samples.slice(-SAMPLES_PER_PERIOD); const voltages = analysis.map((point) => point.outputVoltage), currents = analysis.map((point) => point.outputCurrent); const outputVoltageDc = mean(voltages), outputCurrentDc = mean(currents), outputPower = mean(voltages.map((voltage, index) => voltage * currents[index]));
  // Boost keeps the source-inductor loop closed through both switch states (continuous input
  // current); buck and buck-boost isolate the source from the load while the switch is off.
  const inputPower = parameters.topology === "boost"
    ? mean(analysis.map((point) => parameters.inputVoltage * point.outputCurrent))
    : mean(analysis.map((point) => point.switchOn ? parameters.inputVoltage * point.outputCurrent : 0));
  const currentMin = Math.min(...currents), currentMax = Math.max(...currents); const critical = criticalInductance(parameters, frequency);
  const metrics: ChopperMetrics = { outputVoltageDc, outputVoltageRms: rms(voltages), outputCurrentDc, rippleCurrent: currentMax - currentMin, currentMax, currentMin, criticalInductanceMilliHenry: critical * 1000, conductionMode: dcmSeen || currentMin <= 1e-6 ? "DCM" : "CCM", inputPower, outputPower, efficiency: inputPower > 1e-9 ? clamp(100 * outputPower / inputPower, 0, 100) : 0, dutyCycle: duty };

  const warnings: ChopperWarning[] = [];
  if ((parameters.topology === "boost" || parameters.topology === "buck-boost") && duty > 0.9) {
    warnings.push({ code: "DUTY_CYCLE_HIGH", message: `Duty cycle ${(duty * 100).toFixed(0)}% exceeds the 90% practical limit for ${parameters.topology} operation; component stress and efficiency loss increase sharply beyond this point.` });
  }
  if (parameters.loadType === "RLE" && outputCurrentDc < -1e-6) {
    warnings.push({ code: "BACK_EMF_REVERSES_CURRENT", message: `Back-EMF ${parameters.backEmfVoltage}V exceeds the average output voltage; a unidirectional chopper cannot sustain reverse current.` });
  }
  const lambda = (frequency * inductance) / resistance;
  const boundaryLambda = (1 - duty) / 2;
  if (hasInductor && Math.abs(lambda - boundaryLambda) < 0.05 * Math.max(boundaryLambda, 1e-6)) {
    warnings.push({ code: "CCM_DCM_BOUNDARY", message: "Operating near the CCM/DCM boundary; expect elevated current ripple and mode sensitivity to small parameter changes." });
  }

  return { period, switchingFrequency: frequency, samples, metrics, warnings };
}
