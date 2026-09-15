export type RectifierPhase = "single" | "three";
export type RectifierType = "half" | "full";
export type FullWaveSubtype = "bridge" | "center-tapped";
export type RectifierLoad = "R" | "RL" | "RC" | "RLC" | "RLE";
export type VoltageFormat = "rms" | "peak";
export type PulseCount = 6 | 12;

export type RectifierParameters = {
  phase: RectifierPhase;
  rectifierType: RectifierType;
  fullWaveSubtype: FullWaveSubtype;
  loadType: RectifierLoad;
  freeWheelingDiode: boolean;
  voltageFormat: VoltageFormat;
  inputVoltage: number;
  frequency: number;
  firingAngle: number;
  resistance: number;
  inductanceMilliHenry: number;
  capacitanceMicroFarad: number;
  backEmfVoltage: number;
  /** Only meaningful for phase === "three" && rectifierType === "full". */
  pulseCount: PulseCount;
};

export type RectifierSample = {
  time: number;
  va: number;
  vb: number;
  vc: number;
  source: number;
  outputVoltage: number;
  outputCurrent: number;
  capacitorVoltage: number;
  conducting: number;
};

export type RectifierMetrics = {
  voltageRms: number;
  voltageDc: number;
  currentRms: number;
  currentDc: number;
  dcPower: number;
  acPower: number;
  outputFrequency: number;
  rippleVoltage: number;
  formFactor: number;
  rippleFactor: number;
  efficiency: number;
  powerFactor: number;
  conductionMode: "CCM" | "DCM" | "RESISTIVE";
  extinctionAngleDeg: number | null;
};

export type RectifierWarningCode = "FWD_INERT_FOR_LOAD";
export type RectifierWarning = { code: RectifierWarningCode; message: string };

export type RectifierSimulation = {
  samples: RectifierSample[];
  metrics: RectifierMetrics;
  peakVoltage: number;
  angularFrequency: number;
  period: number;
  warnings: RectifierWarning[];
};

export const defaultRectifierParameters: RectifierParameters = {
  phase: "single",
  rectifierType: "full",
  fullWaveSubtype: "bridge",
  loadType: "RL",
  freeWheelingDiode: true,
  voltageFormat: "rms",
  inputVoltage: 120,
  frequency: 60,
  firingAngle: 42,
  resistance: 20,
  inductanceMilliHenry: 85,
  capacitanceMicroFarad: 470,
  backEmfVoltage: 24,
  pulseCount: 6,
};

const EPSILON = 1e-8;
const STEPS_PER_CYCLE = 720;
const MINIMUM_SETTLE_CYCLES = 8;
const MAXIMUM_SETTLE_CYCLES = 240;
const DISPLAY_CYCLES = 2;
const CAPACITOR_SOURCE_RESISTANCE = 0.35;
const RLC_SERIES_RESISTANCE = 0.35;

function modulo(value: number, base: number) {
  return ((value % base) + base) % base;
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
}

function rms(values: number[]) {
  return Math.sqrt(mean(values.map((value) => value * value)));
}

function phaseVoltages(theta: number, peakVoltage: number) {
  return [
    peakVoltage * Math.sin(theta),
    peakVoltage * Math.sin(theta - (2 * Math.PI) / 3),
    peakVoltage * Math.sin(theta + (2 * Math.PI) / 3),
  ];
}

function indexOfMaximum(values: number[]) {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

function indexOfMinimum(values: number[]) {
  return values.reduce((best, value, index) => value < values[best] ? index : best, 0);
}

function includesInductance(load: RectifierLoad) {
  return load === "RL" || load === "RLC" || load === "RLE";
}

function includesCapacitance(load: RectifierLoad) {
  return load === "RC" || load === "RLC";
}

function outputFrequencyFor(parameters: RectifierParameters) {
  if (parameters.phase === "three") {
    if (parameters.rectifierType === "full") return parameters.frequency * (parameters.pulseCount === 12 ? 12 : 6);
    return parameters.frequency * 3;
  }
  return parameters.frequency * (parameters.rectifierType === "full" ? 2 : 1);
}

/**
 * One 6-pulse bridge, optionally fed from a secondary shifted by `secondaryShiftRad`
 * (30° for a delta secondary vs. a wye secondary) to build a 12-pulse configuration.
 */
function threePhaseBridgeOutput(theta: number, peakVoltage: number, alpha: number, secondaryShiftRad: number) {
  const shiftedTheta = theta + secondaryShiftRad;
  const actual = phaseVoltages(shiftedTheta, peakVoltage);
  const control = phaseVoltages(shiftedTheta - alpha, peakVoltage);
  const upper = indexOfMaximum(control);
  const lower = indexOfMinimum(control);
  return actual[upper] - actual[lower];
}

/**
 * Returns the source voltage selected by the gating sequence. For a three-phase
 * bridge, phase selection is made at the delayed control angle, then the
 * corresponding physical line-to-line voltage is evaluated at the actual time.
 * This preserves the 120° phase relationship and avoids treating a 3Φ bridge as
 * a rectified copy of a single phase.
 */
function selectedSourceVoltage(parameters: RectifierParameters, theta: number, peakVoltage: number, alpha: number) {
  if (parameters.phase === "single") {
    const cycleAngle = modulo(theta, 2 * Math.PI);
    const va = peakVoltage * Math.sin(theta);
    if (parameters.rectifierType === "half") {
      return cycleAngle >= alpha ? va : 0;
    }
    const polarity = Math.sin(theta - alpha) >= 0 ? 1 : -1;
    return polarity * va;
  }

  if (parameters.rectifierType === "full" && parameters.pulseCount === 12) {
    // Two series-connected 6-pulse bridges (wye + delta secondaries, 30° apart), each
    // sized to half the peak so the combined DC level matches a single 6-pulse bridge
    // while ripple frequency doubles. Transformer turns ratio is not modeled separately.
    const bridgeA = threePhaseBridgeOutput(theta, peakVoltage / 2, alpha, 0);
    const bridgeB = threePhaseBridgeOutput(theta, peakVoltage / 2, alpha, Math.PI / 6);
    return bridgeA + bridgeB;
  }

  const actual = phaseVoltages(theta, peakVoltage);
  const control = phaseVoltages(theta - alpha, peakVoltage);
  const upper = indexOfMaximum(control);
  if (parameters.rectifierType === "half") return actual[upper];
  const lower = indexOfMinimum(control);
  return actual[upper] - actual[lower];
}

function rk4Step(current: number, capacitorVoltage: number, appliedVoltage: number, resistance: number, inductance: number, capacitance: number, backEmf: number, dt: number) {
  const derivatives = (i: number, vc: number) => ({
    di: (appliedVoltage - resistance * i - vc - backEmf) / inductance,
    dvc: (i - vc / resistance) / capacitance,
  });
  const k1 = derivatives(current, capacitorVoltage);
  const k2 = derivatives(current + (k1.di * dt) / 2, capacitorVoltage + (k1.dvc * dt) / 2);
  const k3 = derivatives(current + (k2.di * dt) / 2, capacitorVoltage + (k2.dvc * dt) / 2);
  const k4 = derivatives(current + k3.di * dt, capacitorVoltage + k3.dvc * dt);
  return {
    current: current + (dt / 6) * (k1.di + 2 * k2.di + 2 * k3.di + k4.di),
    capacitorVoltage: capacitorVoltage + (dt / 6) * (k1.dvc + 2 * k2.dvc + 2 * k3.dvc + k4.dvc),
  };
}

/**
 * Time-domain controlled rectifier model.
 *
 * The model is intentionally idealized: thyristors have zero forward drop and
 * no commutation overlap. R is a direct resistive load; RL and RLE are series
 * loads; RC is a resistor with a shunt smoothing capacitor; RLC is a series-L,
 * shunt-C output filter feeding R. Each case is settled before two line periods
 * are retained for waveform display and steady-state metrics.
 */
export function simulateControlledRectifier(parameters: RectifierParameters): RectifierSimulation {
  const frequency = Math.max(1, parameters.frequency);
  const period = 1 / frequency;
  const omega = 2 * Math.PI * frequency;
  const peakVoltage = parameters.voltageFormat === "rms"
    ? Math.max(0, parameters.inputVoltage) * Math.SQRT2
    : Math.max(0, parameters.inputVoltage);
  const alpha = (clamp(parameters.firingAngle, 0, 180) * Math.PI) / 180;
  const resistance = Math.max(0.05, parameters.resistance);
  const inductance = Math.max(1e-5, parameters.inductanceMilliHenry * 1e-3);
  const capacitance = Math.max(1e-8, parameters.capacitanceMicroFarad * 1e-6);
  const backEmf = parameters.loadType === "RLE" ? Math.max(0, parameters.backEmfVoltage) : 0;
  const hasL = includesInductance(parameters.loadType);
  const hasC = includesCapacitance(parameters.loadType);
  // Free-wheeling diode is only a distinct device for RL/RLE; for RLC the inductor
  // and capacitor already govern current continuity, so the flag must be inert there.
  const fwdEligible = parameters.loadType === "RL" || parameters.loadType === "RLE";
  const inductiveSettlingTime = hasL ? (7 * inductance) / resistance : 0;
  const capacitiveSettlingTime = hasC ? 7 * resistance * capacitance : 0;
  const settleCycles = clamp(Math.ceil(Math.max(inductiveSettlingTime, capacitiveSettlingTime) / period), MINIMUM_SETTLE_CYCLES, MAXIMUM_SETTLE_CYCLES);
  const dt = period / STEPS_PER_CYCLE;
  const totalSteps = (settleCycles + DISPLAY_CYCLES) * STEPS_PER_CYCLE;
  const displayStartStep = settleCycles * STEPS_PER_CYCLE;
  const samples: RectifierSample[] = [];
  let inductorCurrent = 0;
  let capacitorVoltage = 0;
  let extinctionAngleDeg: number | null = null;

  for (let step = 0; step <= totalSteps; step += 1) {
    const time = step * dt;
    const theta = omega * time;
    const [va, vb, vc] = phaseVoltages(theta, peakVoltage);
    const rawSourceVoltage = selectedSourceVoltage(parameters, theta, peakVoltage, alpha);
    const currentCanContinue = inductorCurrent > EPSILON;
    const sourceCanSupply = rawSourceVoltage > EPSILON;
    const sourceConnected = sourceCanSupply || (fwdEligible && currentCanContinue && !parameters.freeWheelingDiode);
    let appliedVoltage = sourceConnected ? rawSourceVoltage : 0;

    if (fwdEligible && parameters.freeWheelingDiode && rawSourceVoltage <= EPSILON && currentCanContinue) {
      appliedVoltage = 0;
    }

    let outputVoltage = 0;
    let outputCurrent = 0;
    if (parameters.loadType === "R") {
      outputVoltage = Math.max(0, appliedVoltage);
      outputCurrent = outputVoltage / resistance;
      inductorCurrent = outputCurrent;
    } else if (parameters.loadType === "RC") {
      const rectifierCurrent = sourceCanSupply && rawSourceVoltage > capacitorVoltage
        ? (rawSourceVoltage - capacitorVoltage) / CAPACITOR_SOURCE_RESISTANCE
        : 0;
      const capacitorDerivative = (rectifierCurrent - capacitorVoltage / resistance) / capacitance;
      capacitorVoltage = Math.max(0, capacitorVoltage + capacitorDerivative * dt);
      outputVoltage = capacitorVoltage;
      outputCurrent = capacitorVoltage / resistance;
    } else if (parameters.loadType === "RLC") {
      const next = rk4Step(inductorCurrent, capacitorVoltage, appliedVoltage, RLC_SERIES_RESISTANCE, inductance, capacitance, 0, dt);
      inductorCurrent = Math.max(0, next.current);
      capacitorVoltage = Math.max(0, next.capacitorVoltage);
      outputVoltage = capacitorVoltage;
      outputCurrent = capacitorVoltage / resistance;
    } else {
      const derivative = (appliedVoltage - resistance * inductorCurrent - backEmf) / inductance;
      inductorCurrent = Math.max(0, inductorCurrent + derivative * dt);
      outputVoltage = appliedVoltage;
      outputCurrent = inductorCurrent;
    }

    if (hasL && currentCanContinue && inductorCurrent <= EPSILON && rawSourceVoltage <= EPSILON) {
      extinctionAngleDeg = (modulo(theta, 2 * Math.PI) * 180) / Math.PI;
    }

    if (step >= displayStartStep) {
      samples.push({
        time: (step - displayStartStep) * dt,
        va,
        vb,
        vc,
        source: rawSourceVoltage,
        outputVoltage,
        outputCurrent,
        capacitorVoltage,
        conducting: sourceConnected ? 1 : 0,
      });
    }
  }

  const finalCycle = samples.slice(STEPS_PER_CYCLE);
  const voltageValues = finalCycle.map((sample) => sample.outputVoltage);
  const currentValues = finalCycle.map((sample) => sample.outputCurrent);
  const voltageRms = rms(voltageValues);
  const voltageDc = mean(voltageValues);
  const currentRms = rms(currentValues);
  const currentDc = mean(currentValues);
  const realPower = mean(finalCycle.map((sample) => sample.outputVoltage * sample.outputCurrent));
  const apparentPower = voltageRms * currentRms;
  const formFactor = Math.abs(voltageDc) > EPSILON ? voltageRms / Math.abs(voltageDc) : 0;
  const rippleFactor = formFactor > 0 ? Math.sqrt(Math.max(0, formFactor * formFactor - 1)) : 0;
  const minimumCurrent = Math.min(...currentValues);
  const conductionMode = hasL
    ? minimumCurrent > 1e-4 ? "CCM" : "DCM"
    : "RESISTIVE";

  const warnings: RectifierWarning[] = [];
  if (parameters.freeWheelingDiode && !fwdEligible && parameters.loadType !== "R") {
    warnings.push({ code: "FWD_INERT_FOR_LOAD", message: `Free-wheeling diode has no effect for ${parameters.loadType} loads; only RL and RLE route current through it.` });
  }

  return {
    samples,
    peakVoltage,
    angularFrequency: omega,
    period,
    warnings,
    metrics: {
      voltageRms,
      voltageDc,
      currentRms,
      currentDc,
      dcPower: realPower,
      acPower: apparentPower,
      outputFrequency: outputFrequencyFor(parameters),
      rippleVoltage: Math.sqrt(Math.max(0, voltageRms * voltageRms - voltageDc * voltageDc)),
      formFactor,
      rippleFactor,
      // η = (V_DC/V_RMS)² = 1/FF² and PF = V_DC/V_RMS = 1/FF (spec §1.3.1): both quantify
      // DC purity, not real/apparent output power (which is ≈1 for any resistive-type
      // load and would mask ripple loss entirely). Half-wave R ≈ 40.5%/0.637, full-wave ≈ 81%/0.9.
      efficiency: formFactor > EPSILON ? clamp(100 / (formFactor * formFactor), 0, 100) : 0,
      powerFactor: formFactor > EPSILON ? clamp(1 / formFactor, 0, 1) : 0,
      conductionMode,
      extinctionAngleDeg: conductionMode === "CCM" ? null : extinctionAngleDeg,
    },
  };
}
