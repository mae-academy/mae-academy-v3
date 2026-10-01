import type { InverterPhase, SinglePhaseSubtype, ThreePhaseConduction, SwitchingTechnique, InverterLoad, InverterParameters, InverterSample, InverterMetrics, InverterWarning, InverterFault, InverterSimulation } from "../../../../shared/power/inverterTypes";
import { defaultInverterParameters } from "../../../../shared/power/inverterTypes";
export { defaultInverterParameters };
export type { InverterPhase, SinglePhaseSubtype, ThreePhaseConduction, SwitchingTechnique, InverterLoad, InverterParameters, InverterSample, InverterMetrics, InverterWarning, InverterFault, InverterSimulation };







const TWO_PI = Math.PI * 2;
const SAMPLES_PER_PERIOD = 1200;
const DISPLAY_PERIODS = 2;
const MIN_SETTLE_PERIODS = 8;
const MAX_SETTLE_PERIODS = 240;


function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function wrapAngle(angle: number) {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function angularDistance(a: number, b: number) {
  const difference = Math.abs(wrapAngle(a) - wrapAngle(b));
  return Math.min(difference, TWO_PI - difference);
}

function triangleWave(time: number, frequency: number) {
  const fractional = time * frequency - Math.floor(time * frequency);
  return 4 * Math.abs(fractional - 0.5) - 1;
}

function pulseEnvelope(angle: number, technique: SwitchingTechnique, time: number, carrierFrequency: number, modulationIndex: number) {
  const sign = Math.sin(angle) >= 0 ? 1 : -1;
  if (technique === "square") return sign;
  if (technique === "single-pulse") {
    const center = sign > 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
    return angularDistance(angle, center) <= Math.PI / 3 ? sign : 0;
  }
  if (technique === "multi-pulse") {
    const chopped = Math.sin(10 * angle) >= 0 ? 1 : 0;
    return chopped ? sign : 0;
  }
  const reference = clamp(modulationIndex, 0, 1.2) * Math.sin(angle);
  const carrier = triangleWave(time, Math.max(carrierFrequency, 10));
  return reference >= carrier ? 1 : -1;
}

function singlePhaseVoltage(parameters: InverterParameters, time: number, angle: number) {
  const rail = parameters.singlePhaseSubtype === "full-bridge" ? parameters.dcVoltage : parameters.dcVoltage / 2;
  return rail * pulseEnvelope(angle, parameters.technique, time, parameters.carrierFrequency, parameters.modulationIndex);
}

function threePhaseLeg(parameters: InverterParameters, time: number, angle: number) {
  const technique = parameters.technique;
  if (parameters.threePhaseConduction === "120" && technique === "square") {
    if (angularDistance(angle, Math.PI / 2) <= Math.PI / 3) return parameters.dcVoltage / 2;
    if (angularDistance(angle, (3 * Math.PI) / 2) <= Math.PI / 3) return -parameters.dcVoltage / 2;
    return 0;
  }
  return (parameters.dcVoltage / 2) * pulseEnvelope(angle, technique, time, parameters.carrierFrequency, parameters.modulationIndex);
}

function threePhaseVoltages(parameters: InverterParameters, time: number, angle: number) {
  const aLeg = threePhaseLeg(parameters, time, angle);
  const bLeg = threePhaseLeg(parameters, time, angle - (TWO_PI / 3));
  const cLeg = threePhaseLeg(parameters, time, angle + (TWO_PI / 3));
  if (parameters.threePhaseConduction === "120" && parameters.technique === "square") {
    return { va: aLeg, vb: bLeg, vc: cLeg };
  }
  const neutral = (aLeg + bLeg + cLeg) / 3;
  return { va: aLeg - neutral, vb: bLeg - neutral, vc: cLeg - neutral };
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function rms(values: number[]) {
  return Math.sqrt(mean(values.map((value) => value * value)));
}

interface SpectrumResult {
  rms: number;
  phase: number;
  harmonicRms: number[];
}

function dftSpectrum(values: number[], maximumOrder = 40): SpectrumResult {
  const n = values.length;
  const harmonicRms: number[] = [];
  const count = Math.min(maximumOrder, Math.floor(n / 2) - 1);
  let fundamentalPhase = 0;
  for (let order = 1; order <= count; order += 1) {
    let cosine = 0;
    let sine = 0;
    for (let index = 0; index < n; index += 1) {
      const angle = TWO_PI * order * index / n;
      cosine += values[index] * Math.cos(angle);
      sine += values[index] * Math.sin(angle);
    }
    const peak = (2 / n) * Math.hypot(cosine, sine);
    harmonicRms[order] = peak / Math.SQRT2;
    if (order === 1) fundamentalPhase = Math.atan2(sine, cosine);
  }
  return { rms: harmonicRms[1] ?? 0, phase: fundamentalPhase, harmonicRms };
}

function thd(totalRms: number, fundamentalRms: number) {
  return fundamentalRms > 1e-9 ? 100 * Math.sqrt(Math.max(totalRms * totalRms - fundamentalRms * fundamentalRms, 0)) / fundamentalRms : 0;
}

function harmonicFactor(spectrum: SpectrumResult) {
  const fundamental = spectrum.rms;
  if (fundamental <= 1e-9) return 0;
  for (let order = 2; order < spectrum.harmonicRms.length; order += 1) {
    if ((spectrum.harmonicRms[order] ?? 0) > fundamental * 0.001) return (spectrum.harmonicRms[order] ?? 0) / fundamental;
  }
  return 0;
}

export function simulateInverter(parameters: InverterParameters): InverterSimulation {
  const frequency = Math.max(parameters.fundamentalFrequency, 1);
  const period = 1 / frequency;
  const angularFrequency = TWO_PI * frequency;
  if (parameters.shootThroughFault) {
    const dt = period / SAMPLES_PER_PERIOD;
    const samples = Array.from({ length: DISPLAY_PERIODS * SAMPLES_PER_PERIOD + 1 }, (_, step) => ({
      time: step * dt,
      va: 0,
      vb: 0,
      vc: 0,
      outputVoltage: 0,
      outputCurrent: 0,
      carrier: 0,
      reference: 0,
    }));
    const message = "Shoot-through command detected: both switches in one inverter leg are on. The waveform is inhibited because a short-circuit current requires a parasitic leg model.";
    return {
      period,
      angularFrequency,
      samples,
      metrics: { voltageRms: 0, voltageFundamentalRms: 0, currentRms: 0, currentFundamentalRms: 0, voltageThd: 0, currentThd: 0, distortionFactor: 0, harmonicFactor: 0, activePower: 0, apparentPower: 0, powerFactor: 0, outputFrequency: frequency, inputPower: 0, outputPower: 0, efficiency: 0 },
      warnings: [{ code: "SHOOT_THROUGH", message }],
      fault: { code: "SHOOT_THROUGH", message, shortCircuitCurrent: null },
    };
  }
  const resistance = Math.max(parameters.resistance, 0.05);
  const inductance = Math.max(parameters.inductanceMilliHenry, 0) / 1000;
  const hasInductance = parameters.loadType !== "R" && inductance > 0;
  const hasBackEmf = parameters.loadType === "RLE";
  const settlePeriods = clamp(Math.ceil((hasInductance ? (7 * inductance) / resistance : 0) / period), MIN_SETTLE_PERIODS, MAX_SETTLE_PERIODS);
  const dt = period / SAMPLES_PER_PERIOD;
  const displayStart = settlePeriods * SAMPLES_PER_PERIOD;
  const totalSteps = (settlePeriods + DISPLAY_PERIODS) * SAMPLES_PER_PERIOD;
  const samples: InverterSample[] = [];
  let current = 0;

  for (let step = 0; step <= totalSteps; step += 1) {
    const absoluteTime = step * dt;
    const angle = wrapAngle(angularFrequency * absoluteTime);
    const phases = parameters.phase === "single"
      ? { va: singlePhaseVoltage(parameters, absoluteTime, angle), vb: 0, vc: 0 }
      : threePhaseVoltages(parameters, absoluteTime, angle);
    const outputVoltage = phases.va;
    const backEmf = hasBackEmf ? parameters.backEmfVoltage * Math.sign(current || outputVoltage || 1) : 0;
    if (!hasInductance) {
      current = (outputVoltage - backEmf) / resistance;
    } else {
      const derivative = (i: number) => (outputVoltage - resistance * i - (hasBackEmf ? parameters.backEmfVoltage * Math.sign(i || outputVoltage || 1) : 0)) / inductance;
      const k1 = derivative(current);
      const k2 = derivative(current + (dt * k1) / 2);
      const k3 = derivative(current + (dt * k2) / 2);
      const k4 = derivative(current + dt * k3);
      current += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }

    if (step >= displayStart) {
      const reference = parameters.modulationIndex * Math.sin(angle);
      const carrier = triangleWave(absoluteTime, Math.max(parameters.carrierFrequency, 10));
      samples.push({
        time: (step - displayStart) * dt,
        va: phases.va,
        vb: phases.vb,
        vc: phases.vc,
        outputVoltage,
        outputCurrent: current,
        reference: reference * parameters.dcVoltage * 0.35,
        carrier: carrier * parameters.dcVoltage * 0.35,
      });
    }
  }

  const steadyWindow = samples.slice(-SAMPLES_PER_PERIOD);
  const voltage = steadyWindow.map((sample) => sample.outputVoltage);
  const currentValues = steadyWindow.map((sample) => sample.outputCurrent);
  const voltageRms = rms(voltage);
  const currentRms = rms(currentValues);
  const voltageSpectrum = dftSpectrum(voltage);
  const currentSpectrum = dftSpectrum(currentValues);
  const activePower = voltageSpectrum.rms * currentSpectrum.rms * Math.cos(voltageSpectrum.phase - currentSpectrum.phase);
  const apparentPower = voltageRms * currentRms;
  // Ideal switches store no energy internally, so P_in = P_out exactly at every instant;
  // efficiency is reported at 100% whenever real power actually flows (spec 2.5.5: ideal ⇒ ~100%).
  const inputPower = activePower;
  const outputPower = activePower;
  const efficiency = Math.abs(activePower) > 1e-9 ? 100 : 0;

  const warnings: InverterWarning[] = [];
  if (parameters.technique === "spwm" && parameters.modulationIndex > 1) {
    warnings.push({ code: "OVERMODULATION", message: `Modulation index m=${parameters.modulationIndex.toFixed(2)} exceeds the linear range (m ≤ 1); output enters overmodulation with added low-order harmonics.` });
  }
  if (parameters.technique === "spwm" && parameters.fundamentalFrequency >= parameters.carrierFrequency / 2) {
    warnings.push({ code: "NYQUIST_VIOLATION", message: `Fundamental frequency ${parameters.fundamentalFrequency}Hz is not below half the carrier frequency (${(parameters.carrierFrequency / 2).toFixed(0)}Hz); PWM sampling is inadequate and will alias.` });
  }
  if (parameters.loadType === "RLE" && parameters.backEmfVoltage >= parameters.dcVoltage) {
    warnings.push({ code: "BACK_EMF_EXCEEDED", message: `Back-EMF ${parameters.backEmfVoltage}V is at or above the DC bus voltage ${parameters.dcVoltage}V; the inverter cannot deliver forward power into this load.` });
  }

  return {
    period,
    angularFrequency,
    samples,
    metrics: {
      voltageRms,
      voltageFundamentalRms: voltageSpectrum.rms,
      currentRms,
      currentFundamentalRms: currentSpectrum.rms,
      voltageThd: thd(voltageRms, voltageSpectrum.rms),
      currentThd: thd(currentRms, currentSpectrum.rms),
      distortionFactor: voltageRms > 1e-9 ? voltageSpectrum.rms / voltageRms : 0,
      harmonicFactor: harmonicFactor(voltageSpectrum),
      activePower,
      apparentPower,
      powerFactor: apparentPower > 1e-9 ? clamp(activePower / apparentPower, -1, 1) : 0,
      outputFrequency: frequency,
      inputPower,
      outputPower,
      efficiency,
    },
    warnings,
    fault: null,
  };
}
