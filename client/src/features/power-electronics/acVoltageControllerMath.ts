export type AcPhase = "single" | "three";
export type AcTopology = "unidirectional" | "bidirectional";
export type ThreePhaseConnection = "star-3w" | "star-4w" | "delta";
export type AcControlMode = "phase-angle" | "integral-cycle";
export type AcLoad = "R" | "RL";
export type AcVoltageFormat = "rms" | "peak";

export interface AcVoltageControllerParameters {
  phase: AcPhase;
  topology: AcTopology;
  threePhaseConnection: ThreePhaseConnection;
  controlMode: AcControlMode;
  firingAngle: number;
  onCycles: number;
  offCycles: number;
  voltageFormat: AcVoltageFormat;
  inputVoltage: number;
  frequency: number;
  loadType: AcLoad;
  resistance: number;
  inductanceMilliHenry: number;
}

export interface AcControllerSample {
  time: number;
  sourceVoltage: number;
  outputVoltage: number;
  phaseAOutput: number;
  phaseBOutput: number;
  phaseCOutput: number;
  outputCurrent: number;
  thyristorVoltage: number;
  gatePulse: number;
  conducting: boolean;
}

export interface AcControllerMetrics {
  outputVoltageRms: number;
  outputCurrentRms: number;
  activePower: number;
  apparentPower: number;
  powerFactor: number;
  firingAngle: number;
  extinctionAngle: number;
  conductionAngle: number;
  voltageThd: number;
  currentThd: number;
  sourceVoltageRms: number;
  controlValue: number;
}

export type AcControllerWarningCode = "POOR_POWER_FACTOR" | "CONDUCTION_FAILURE" | "BIDIRECTIONAL_ASYMMETRY";
export interface AcControllerWarning { code: AcControllerWarningCode; message: string; }

export interface AcControllerSimulation {
  period: number;
  angularFrequency: number;
  samples: AcControllerSample[];
  metrics: AcControllerMetrics;
  warnings: AcControllerWarning[];
}

const TWO_PI = Math.PI * 2;
const SAMPLES_PER_PERIOD = 900;

export const defaultAcVoltageControllerParameters: AcVoltageControllerParameters = {
  phase: "single",
  topology: "bidirectional",
  threePhaseConnection: "star-4w",
  controlMode: "phase-angle",
  firingAngle: 75,
  onCycles: 3,
  offCycles: 2,
  voltageFormat: "rms",
  inputVoltage: 120,
  frequency: 60,
  loadType: "RL",
  resistance: 18,
  inductanceMilliHenry: 28,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function wrap(value: number, modulus: number) {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function rms(values: number[]) {
  return Math.sqrt(mean(values.map((value) => value * value)));
}

function fundamentalRms(values: number[]) {
  const count = values.length;
  let cosine = 0;
  let sine = 0;
  for (let index = 0; index < count; index += 1) {
    const angle = TWO_PI * index / count;
    cosine += values[index] * Math.cos(angle);
    sine += values[index] * Math.sin(angle);
  }
  return (2 / count) * Math.hypot(cosine, sine) / Math.SQRT2;
}

/**
 * Solves i(beta)=0 for an RL branch fired from zero current at alpha:
 * sin(beta-phi)-sin(alpha-phi)exp(-(beta-alpha)/(omega*tau))=0.
 */
export function solveExtinctionAngle(alpha: number, resistance: number, inductance: number, angularFrequency: number) {
  if (inductance <= 1e-12) return Math.PI;
  const phi = Math.atan((angularFrequency * inductance) / Math.max(resistance, 1e-9));
  const tau = inductance / Math.max(resistance, 1e-9);
  const equation = (theta: number) => Math.sin(theta - phi) - Math.sin(alpha - phi) * Math.exp(-(theta - alpha) / (angularFrequency * tau));
  const start = alpha + 1e-6;
  let previousAngle = start;
  let previousValue = equation(previousAngle);
  let bracket: [number, number] | null = null;
  const searchEnd = alpha + TWO_PI;
  const divisions = 2400;
  for (let index = 1; index <= divisions; index += 1) {
    const angle = start + (index / divisions) * (searchEnd - start);
    const value = equation(angle);
    if (previousValue > 0 && value <= 0) { bracket = [previousAngle, angle]; break; }
    previousAngle = angle;
    previousValue = value;
  }
  if (!bracket) return Math.PI;
  let [low, high] = bracket;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2;
    if (equation(middle) > 0) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

function sourceScale(parameters: AcVoltageControllerParameters) {
  const inputPeak = parameters.voltageFormat === "rms" ? parameters.inputVoltage * Math.SQRT2 : parameters.inputVoltage;
  if (parameters.phase !== "three") return inputPeak;
  if (parameters.threePhaseConnection === "delta") return inputPeak;
  return inputPeak;
}

function integralCycleEnabled(cycle: number, onCycles: number, offCycles: number) {
  const block = Math.max(1, onCycles + offCycles);
  return wrap(cycle, block) < Math.max(1, onCycles);
}

export function simulateAcVoltageController(parameters: AcVoltageControllerParameters): AcControllerSimulation {
  const frequency = Math.max(parameters.frequency, 1);
  const period = 1 / frequency;
  const omega = TWO_PI * frequency;
  const inputPeak = sourceScale(parameters);
  const resistance = Math.max(parameters.resistance, 0.05);
  const inductance = Math.max(parameters.inductanceMilliHenry, 0) / 1000;
  const hasInductance = parameters.loadType === "RL" && inductance > 0;
  const rawFiringAngleDeg = clamp(parameters.firingAngle, 0, 180);
  // Bidirectional (back-to-back thyristor) firing is symmetric about the half-cycle; α beyond
  // 90° has no additional effect there and is capped rather than silently over-firing.
  const firingAngleDeg = parameters.topology === "bidirectional" ? Math.min(rawFiringAngleDeg, 90) : rawFiringAngleDeg;
  const alpha = firingAngleDeg * Math.PI / 180;
  const onCycles = clamp(Math.round(parameters.onCycles), 1, 12);
  const offCycles = clamp(Math.round(parameters.offCycles), 1, 12);
  const totalCycles = parameters.controlMode === "integral-cycle" ? onCycles + offCycles : 2;
  const settleCycles = hasInductance ? clamp(Math.ceil((7 * inductance / resistance) / period), 3, 48) : 0;
  const totalSteps = (settleCycles + totalCycles) * SAMPLES_PER_PERIOD;
  const captureStart = settleCycles * SAMPLES_PER_PERIOD;
  const dt = period / SAMPLES_PER_PERIOD;
  const samples: AcControllerSample[] = [];
  let current = 0;
  let conduction = false;
  let lastExtinctionAngle = hasInductance ? solveExtinctionAngle(alpha, resistance, inductance, omega) : Math.PI;
  // Threshold-crossing state for firing detection (see below): a fixed-width sample
  // window around `alpha` can be skipped entirely by floating-point rounding once
  // `thetaAbsolute` grows across many periods, silently dropping a firing pulse.
  let previousLocalHalfAngle = 0;
  let previousGlobalHalfIndex = -1;

  for (let step = 0; step <= totalSteps; step += 1) {
    const time = step * dt;
    const thetaAbsolute = omega * time;
    const theta = wrap(thetaAbsolute, TWO_PI);
    const cycle = Math.floor(thetaAbsolute / TWO_PI);
    const phaseAngles = [theta, wrap(theta - TWO_PI / 3, TWO_PI), wrap(theta + TWO_PI / 3, TWO_PI)];
    const sourcePhases = phaseAngles.map((phaseAngle) => inputPeak * Math.sin(phaseAngle));
    const sourceVoltage = sourcePhases[0];
    // Monotonic half-cycle index (unlike floor(theta/π), which wraps every period) so a new
    // half can be detected unambiguously and the firing check below is a true edge-crossing
    // test rather than a fragile one-sample bracket around alpha.
    const globalHalfIndex = Math.floor(thetaAbsolute / Math.PI);
    const localHalfAngle = thetaAbsolute - globalHalfIndex * Math.PI;
    const signedHalf = globalHalfIndex % 2 === 0 ? 1 : -1;
    const isNewHalf = globalHalfIndex !== previousGlobalHalfIndex;
    const enabled = parameters.controlMode === "integral-cycle" ? integralCycleEnabled(cycle, onCycles, offCycles) : true;
    const crossedFiringAngle = isNewHalf ? alpha <= 1e-9 : previousLocalHalfAngle < alpha && localHalfAngle >= alpha;
    const firingNow = parameters.controlMode === "phase-angle" && enabled && crossedFiringAngle;
    const positiveHalfAllowed = signedHalf > 0 || parameters.topology === "bidirectional";
    const gatePulse = firingNow && positiveHalfAllowed ? signedHalf * inputPeak * 0.12 : 0;
    const threePhaseOutputs = phaseAngles.map((phaseAngle, index) => {
      const phaseHalf = Math.floor(phaseAngle / Math.PI);
      const phaseLocalAngle = phaseAngle - phaseHalf * Math.PI;
      const phaseSign = phaseHalf % 2 === 0 ? 1 : -1;
      const phaseAllowed = phaseSign > 0 || parameters.topology === "bidirectional";
      const phaseEnabled = parameters.controlMode === "integral-cycle" ? integralCycleEnabled(cycle, onCycles, offCycles) : true;
      const phaseConducts = phaseEnabled && phaseAllowed && (parameters.controlMode === "integral-cycle" || phaseLocalAngle >= alpha);
      return parameters.phase === "three" && phaseConducts ? sourcePhases[index] : 0;
    });

    if (parameters.controlMode === "integral-cycle") {
      conduction = enabled && positiveHalfAllowed;
    } else if (firingNow && positiveHalfAllowed) {
      if (conduction && Math.abs(current) > 1e-6 && Math.sign(current) !== signedHalf) current = 0;
      conduction = true;
    }

    let outputVoltage = parameters.phase === "three" ? threePhaseOutputs[0] : conduction ? sourceVoltage : 0;
    if (parameters.phase !== "three" && parameters.topology === "unidirectional" && sourceVoltage < 0) outputVoltage = 0;
    if (parameters.phase === "three") {
      const phaseAConducts = Math.abs(outputVoltage) > 1e-9;
      if (!hasInductance) {
        current = outputVoltage / resistance;
      } else if (phaseAConducts) {
        const derivative = (i: number) => (outputVoltage - resistance * i) / inductance;
        const k1 = derivative(current);
        const k2 = derivative(current + dt * k1 / 2);
        const k3 = derivative(current + dt * k2 / 2);
        const k4 = derivative(current + dt * k3);
        const nextCurrent = current + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
        current = Math.sign(current || outputVoltage) !== Math.sign(nextCurrent || outputVoltage) && Math.abs(current) > 1e-8 ? 0 : nextCurrent;
      } else {
        current = 0;
      }
    } else if (!hasInductance) {
      current = outputVoltage / resistance;
      if (parameters.controlMode === "phase-angle" && localHalfAngle >= Math.PI - omega * dt) conduction = false;
    } else if (conduction) {
      const derivative = (i: number) => (outputVoltage - resistance * i) / inductance;
      const k1 = derivative(current);
      const k2 = derivative(current + dt * k1 / 2);
      const k3 = derivative(current + dt * k2 / 2);
      const k4 = derivative(current + dt * k3);
      const nextCurrent = current + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      if (Math.sign(current || signedHalf) !== Math.sign(nextCurrent || signedHalf) && Math.abs(current) > 1e-8) {
        current = 0;
        conduction = false;
        outputVoltage = 0;
      } else current = nextCurrent;
    } else {
      current = 0;
    }

    if (step >= captureStart) samples.push({ time: (step - captureStart) * dt, sourceVoltage, outputVoltage, phaseAOutput: parameters.phase === "three" ? threePhaseOutputs[0] : outputVoltage, phaseBOutput: parameters.phase === "three" ? threePhaseOutputs[1] : 0, phaseCOutput: parameters.phase === "three" ? threePhaseOutputs[2] : 0, outputCurrent: current, thyristorVoltage: sourceVoltage - outputVoltage, gatePulse, conducting: conduction });
    previousLocalHalfAngle = localHalfAngle;
    previousGlobalHalfIndex = globalHalfIndex;
  }

  const analysis = samples.slice(-Math.min(samples.length, parameters.controlMode === "integral-cycle" ? totalCycles * SAMPLES_PER_PERIOD : SAMPLES_PER_PERIOD));
  const source = analysis.map((sample) => sample.sourceVoltage);
  const voltage = analysis.map((sample) => sample.outputVoltage);
  const currentValues = analysis.map((sample) => sample.outputCurrent);
  const sourceRms = rms(source);
  const outputVoltageRms = rms(voltage);
  const outputCurrentRms = rms(currentValues);
  const voltageFundamental = fundamentalRms(voltage);
  const currentFundamental = fundamentalRms(currentValues);
  const activePower = mean(voltage.map((value, index) => value * currentValues[index]));
  const apparentPower = sourceRms * outputCurrentRms;
  const betaRadians = hasInductance ? lastExtinctionAngle : Math.PI;
  const betaDegrees = clamp(betaRadians * 180 / Math.PI, 0, 360);
  const alphaDegrees = alpha * 180 / Math.PI;
  const powerFactor = apparentPower > 1e-9 ? clamp(activePower / apparentPower, -1, 1) : 0;

  const warnings: AcControllerWarning[] = [];
  if (parameters.topology === "bidirectional" && rawFiringAngleDeg > 90) {
    warnings.push({ code: "BIDIRECTIONAL_ASYMMETRY", message: `Firing angle ${rawFiringAngleDeg.toFixed(0)}° exceeds 90° for bidirectional operation; capped to 90° to preserve half-cycle symmetry.` });
  }
  if (parameters.loadType === "RL" && hasInductance) {
    const phiDeg = Math.atan2(omega * inductance, resistance) * 180 / Math.PI;
    if (firingAngleDeg + phiDeg > 180) {
      warnings.push({ code: "CONDUCTION_FAILURE", message: `Firing angle ${firingAngleDeg.toFixed(0)}° plus load phase angle ${phiDeg.toFixed(0)}° exceeds 180°; the thyristor cannot conduct and output collapses toward zero.` });
    }
  }
  if (apparentPower > 1e-6 && Math.abs(powerFactor) < 0.5) {
    warnings.push({ code: "POOR_POWER_FACTOR", message: `Power factor ${powerFactor.toFixed(2)} is below 0.5; heavy phase-control degrades utility-side power factor at this firing angle.` });
  }

  return {
    period,
    angularFrequency: omega,
    samples,
    metrics: {
      outputVoltageRms,
      outputCurrentRms,
      activePower,
      apparentPower,
      powerFactor,
      firingAngle: alphaDegrees,
      extinctionAngle: betaDegrees,
      conductionAngle: Math.max(0, betaDegrees - alphaDegrees),
      voltageThd: voltageFundamental > 1e-9 ? 100 * Math.sqrt(Math.max(outputVoltageRms * outputVoltageRms - voltageFundamental * voltageFundamental, 0)) / voltageFundamental : 0,
      currentThd: currentFundamental > 1e-9 ? 100 * Math.sqrt(Math.max(outputCurrentRms * outputCurrentRms - currentFundamental * currentFundamental, 0)) / currentFundamental : 0,
      sourceVoltageRms: sourceRms,
      controlValue: parameters.controlMode === "integral-cycle" ? onCycles / (onCycles + offCycles) : 0,
    },
    warnings,
  };
}
