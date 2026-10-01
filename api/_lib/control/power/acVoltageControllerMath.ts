import type { AcPhase, AcTopology, ThreePhaseConnection, AcControlMode, AcLoad, AcVoltageFormat, AcVoltageControllerParameters, AcControllerSample, AcControllerMetrics, AcControllerWarningCode, AcControllerWarning, AcControllerSimulation } from "../../../../shared/power/acVoltageControllerTypes";
import { defaultAcVoltageControllerParameters } from "../../../../shared/power/acVoltageControllerTypes";
export { defaultAcVoltageControllerParameters };
export type { AcPhase, AcTopology, ThreePhaseConnection, AcControlMode, AcLoad, AcVoltageFormat, AcVoltageControllerParameters, AcControllerSample, AcControllerMetrics, AcControllerWarningCode, AcControllerWarning, AcControllerSimulation };






const TWO_PI = Math.PI * 2;
const SAMPLES_PER_PERIOD = 900;


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

interface BranchState {
  current: number;
  conduction: boolean;
  previousLocalHalfAngle: number;
  previousGlobalHalfIndex: number;
}

function createBranchState(): BranchState {
  return { current: 0, conduction: false, previousLocalHalfAngle: 0, previousGlobalHalfIndex: -1 };
}

/**
 * One SCR/diode line modeled independently: fires the thyristor at alpha, and — for the
 * unidirectional (diode-SCR pair) topology — hands off to the uncontrolled diode as soon as
 * the thyristor's own current extinguishes past the source zero-crossing (beta may exceed pi).
 * Used once for single-phase, and 3x for star-4w / delta, where each line has an independent
 * return path so no phase-to-phase coupling exists.
 */
function stepBranch(
  state: BranchState,
  branchThetaAbsolute: number,
  sourceValue: number,
  alpha: number,
  dt: number,
  resistance: number,
  inductance: number,
  hasInductance: boolean,
  topology: AcTopology,
  controlMode: AcControlMode,
  enabled: boolean,
  gatePeak: number,
): { outputVoltage: number; gatePulse: number } {
  const globalHalfIndex = Math.floor(branchThetaAbsolute / Math.PI);
  const localHalfAngle = branchThetaAbsolute - globalHalfIndex * Math.PI;
  const signedHalf = globalHalfIndex % 2 === 0 ? 1 : -1;
  const isNewHalf = globalHalfIndex !== state.previousGlobalHalfIndex;
  const crossedFiringAngle = isNewHalf ? alpha <= 1e-9 : state.previousLocalHalfAngle < alpha && localHalfAngle >= alpha;
  const firingNow = controlMode === "phase-angle" && enabled && crossedFiringAngle;
  const positiveHalfAllowed = signedHalf > 0 || topology === "bidirectional";
  const diodeEligible = topology === "unidirectional" && signedHalf < 0;
  let gatePulse = 0;

  // A resistive branch has no stored energy to carry a device's conduction past its own half
  // (unlike RL, where conduction legitimately continues past pi until current naturally
  // extinguishes at beta, detected below via the sign-flip check). Explicitly dropping
  // conduction at the half boundary — rather than trying to catch it one sample early via a
  // localHalfAngle threshold — avoids a floating-point coin-flip on whether that threshold
  // check fires on the last sample of the half, which let conduction silently leak into the
  // next half every period.
  if (!hasInductance && isNewHalf && controlMode === "phase-angle") {
    state.conduction = false;
  }

  if (controlMode === "integral-cycle") {
    state.conduction = enabled && positiveHalfAllowed;
  } else if (firingNow && positiveHalfAllowed) {
    if (state.conduction && Math.abs(state.current) > 1e-6 && Math.sign(state.current) !== signedHalf) state.current = 0;
    state.conduction = true;
    gatePulse = signedHalf * gatePeak * 0.12;
  } else if (diodeEligible && !state.conduction) {
    state.conduction = true;
  }

  let outputVoltage = state.conduction ? sourceValue : 0;

  if (!hasInductance) {
    state.current = outputVoltage / resistance;
  } else if (state.conduction) {
    const derivative = (i: number) => (outputVoltage - resistance * i) / inductance;
    const k1 = derivative(state.current);
    const k2 = derivative(state.current + (dt * k1) / 2);
    const k3 = derivative(state.current + (dt * k2) / 2);
    const k4 = derivative(state.current + dt * k3);
    const nextCurrent = state.current + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    if (Math.sign(state.current || signedHalf) !== Math.sign(nextCurrent || signedHalf) && Math.abs(state.current) > 1e-8) {
      state.current = 0;
      state.conduction = false;
      outputVoltage = 0;
    } else {
      state.current = nextCurrent;
    }
  } else {
    state.current = 0;
  }

  state.previousLocalHalfAngle = localHalfAngle;
  state.previousGlobalHalfIndex = globalHalfIndex;
  return { outputVoltage, gatePulse };
}

/** Memoryless per-instant gating check used only for the isolated-neutral (star-3w) resistive
 * pairing solve below: whether this line's own SCR window is active right now. */
function phaseGatedNow(thetaAbsolutePhase: number, alpha: number, topology: AcTopology, ignoreAlphaGate: boolean) {
  const theta = wrap(thetaAbsolutePhase, TWO_PI);
  const half = Math.floor(theta / Math.PI);
  const localAngle = theta - half * Math.PI;
  const sign = half % 2 === 0 ? 1 : -1;
  const allowed = sign > 0 || topology === "bidirectional";
  return allowed && (ignoreAlphaGate || localAngle >= alpha);
}

export function simulateAcVoltageController(parameters: AcVoltageControllerParameters): AcControllerSimulation {
  const frequency = Math.max(parameters.frequency, 1);
  const period = 1 / frequency;
  const omega = TWO_PI * frequency;
  const inputPeak = sourceScale(parameters);
  const resistance = Math.max(parameters.resistance, 0.05);
  const inductance = Math.max(parameters.inductanceMilliHenry, 0) / 1000;
  const hasInductance = parameters.loadType === "RL" && inductance > 0;
  // Both topologies fire over the full alpha in [0deg, 180deg] (spec 2.1/2.2): the bidirectional
  // R-load RMS formula continues to fall monotonically to 0 as alpha -> 180deg, and the 3-phase
  // isolated-neutral conduction modes (spec 2.2) span up to 150deg, so there is no 90deg cutoff.
  const firingAngleDeg = clamp(parameters.firingAngle, 0, 180);
  const alpha = firingAngleDeg * Math.PI / 180;
  const onCycles = clamp(Math.round(parameters.onCycles), 1, 12);
  const offCycles = clamp(Math.round(parameters.offCycles), 1, 12);
  const totalCycles = parameters.controlMode === "integral-cycle" ? onCycles + offCycles : 2;
  const settleCycles = hasInductance ? clamp(Math.ceil((7 * inductance / resistance) / period), 3, 48) : 0;
  const totalSteps = (settleCycles + totalCycles) * SAMPLES_PER_PERIOD;
  const captureStart = settleCycles * SAMPLES_PER_PERIOD;
  const dt = period / SAMPLES_PER_PERIOD;
  const samples: AcControllerSample[] = [];
  const lastExtinctionAngle = hasInductance ? solveExtinctionAngle(alpha, resistance, inductance, omega) : Math.PI;

  // Single-phase uses one line. Three-phase delta and star-4w/star-3w(RL) drive three
  // independent lines (a neutral wire or a delta branch each give current its own return
  // path, so there is no coupling between lines — this is exactly the single-phase model
  // run three times at 120° apart). Isolated-neutral (star-3w) resistive loads are the one
  // topology where lines couple (current must return through another line), so that case is
  // solved per-instant below instead of through the stateful per-line model.
  const mainBranch = createBranchState();
  const branchA = createBranchState();
  const branchB = createBranchState();
  const branchC = createBranchState();
  const isDelta = parameters.phase === "three" && parameters.threePhaseConnection === "delta";
  const isIsolatedNeutralResistive = parameters.phase === "three" && parameters.threePhaseConnection === "star-3w" && !hasInductance;

  for (let step = 0; step <= totalSteps; step += 1) {
    const time = step * dt;
    const thetaAbsolute = omega * time;
    const theta = wrap(thetaAbsolute, TWO_PI);
    const cycle = Math.floor(thetaAbsolute / TWO_PI);
    const enabled = parameters.controlMode === "integral-cycle" ? integralCycleEnabled(cycle, onCycles, offCycles) : true;
    const ignoreAlphaGate = parameters.controlMode === "integral-cycle";
    const sourceVoltage = inputPeak * Math.sin(theta);

    let outputVoltage = 0;
    let phaseAOutput = 0;
    let phaseBOutput = 0;
    let phaseCOutput = 0;
    let outputCurrent = 0;
    let gatePulse = 0;
    let conducting = false;

    if (parameters.phase !== "three") {
      const result = stepBranch(mainBranch, thetaAbsolute, sourceVoltage, alpha, dt, resistance, inductance, hasInductance, parameters.topology, parameters.controlMode, enabled, inputPeak);
      outputVoltage = result.outputVoltage;
      phaseAOutput = outputVoltage;
      gatePulse = result.gatePulse;
      outputCurrent = mainBranch.current;
      conducting = mainBranch.conduction;
    } else if (isDelta) {
      // Line voltages lead their same-letter phase voltage by 30° and are √3× the amplitude;
      // each delta branch is fired and extinguished independently off its own line voltage.
      const vA = sourceVoltage;
      const vB = inputPeak * Math.sin(wrap(theta - TWO_PI / 3, TWO_PI));
      const vC = inputPeak * Math.sin(wrap(theta + TWO_PI / 3, TWO_PI));
      const vAB = vA - vB;
      const vBC = vB - vC;
      const vCA = vC - vA;
      const gatePeak = inputPeak * Math.sqrt(3);
      const resultAB = stepBranch(branchA, thetaAbsolute + Math.PI / 6, vAB, alpha, dt, resistance, inductance, hasInductance, parameters.topology, parameters.controlMode, enabled, gatePeak);
      const resultBC = stepBranch(branchB, thetaAbsolute - TWO_PI / 3 + Math.PI / 6, vBC, alpha, dt, resistance, inductance, hasInductance, parameters.topology, parameters.controlMode, enabled, gatePeak);
      const resultCA = stepBranch(branchC, thetaAbsolute + TWO_PI / 3 + Math.PI / 6, vCA, alpha, dt, resistance, inductance, hasInductance, parameters.topology, parameters.controlMode, enabled, gatePeak);
      phaseAOutput = resultAB.outputVoltage;
      phaseBOutput = resultBC.outputVoltage;
      phaseCOutput = resultCA.outputVoltage;
      outputVoltage = phaseAOutput;
      gatePulse = resultAB.gatePulse;
      conducting = branchA.conduction;
      // KCL at line terminal A: line current is the difference of the two delta branch currents meeting there.
      outputCurrent = branchA.current - branchC.current;
    } else {
      const thetaB = thetaAbsolute - TWO_PI / 3;
      const thetaC = thetaAbsolute + TWO_PI / 3;
      const vA = sourceVoltage;
      const vB = inputPeak * Math.sin(wrap(theta - TWO_PI / 3, TWO_PI));
      const vC = inputPeak * Math.sin(wrap(theta + TWO_PI / 3, TWO_PI));

      if (isIsolatedNeutralResistive) {
        // With the neutral floating, a line can only carry current when at least one other
        // line is simultaneously gated to complete the loop — this reproduces the qualitative
        // 3-conducting / 2-conducting / 0-conducting regions of spec 2.2 from first principles
        // instead of a hardcoded alpha threshold table, and the Mode-1 boundary (all-3-gated
        // disappears past alpha=60deg) falls out exactly. Gating windows are still referenced
        // to each line's own phase-voltage zero-crossing rather than the conducting pair's
        // line-to-line zero-crossing, so the numeric alpha at which output fully collapses to
        // zero comes out near 120deg here versus the textbook's 150deg for this same topology.
        const gatedA = enabled && phaseGatedNow(thetaAbsolute, alpha, parameters.topology, ignoreAlphaGate);
        const gatedB = enabled && phaseGatedNow(thetaB, alpha, parameters.topology, ignoreAlphaGate);
        const gatedC = enabled && phaseGatedNow(thetaC, alpha, parameters.topology, ignoreAlphaGate);
        const gatedCount = Number(gatedA) + Number(gatedB) + Number(gatedC);
        let vAout = 0;
        let vBout = 0;
        let vCout = 0;
        if (gatedCount === 3) {
          vAout = vA; vBout = vB; vCout = vC;
        } else if (gatedCount === 2) {
          // The floating (ungated) line carries no current, so by Ohm's law its
          // phase-to-neutral voltage is exactly zero; the two conducting lines split the
          // instantaneous line-to-line voltage between them symmetrically.
          if (gatedA && gatedB) { vAout = (vA - vB) / 2; vBout = -vAout; }
          else if (gatedB && gatedC) { vBout = (vB - vC) / 2; vCout = -vBout; }
          else { vCout = (vC - vA) / 2; vAout = -vCout; }
        }
        phaseAOutput = vAout;
        phaseBOutput = vBout;
        phaseCOutput = vCout;
        outputVoltage = vAout;
        outputCurrent = vAout / resistance;
        conducting = gatedCount >= 2 && gatedA;
      } else {
        const resultA = stepBranch(branchA, thetaAbsolute, vA, alpha, dt, resistance, inductance, hasInductance, parameters.topology, parameters.controlMode, enabled, inputPeak);
        const resultB = stepBranch(branchB, thetaB, vB, alpha, dt, resistance, inductance, hasInductance, parameters.topology, parameters.controlMode, enabled, inputPeak);
        const resultC = stepBranch(branchC, thetaC, vC, alpha, dt, resistance, inductance, hasInductance, parameters.topology, parameters.controlMode, enabled, inputPeak);
        phaseAOutput = resultA.outputVoltage;
        phaseBOutput = resultB.outputVoltage;
        phaseCOutput = resultC.outputVoltage;
        outputVoltage = phaseAOutput;
        gatePulse = resultA.gatePulse;
        conducting = branchA.conduction;
        outputCurrent = branchA.current;
      }
    }

    if (step >= captureStart) samples.push({ time: (step - captureStart) * dt, sourceVoltage, outputVoltage, phaseAOutput, phaseBOutput, phaseCOutput, outputCurrent, thyristorVoltage: sourceVoltage - outputVoltage, gatePulse, conducting });
  }

  const analysis = samples.slice(-Math.min(samples.length, parameters.controlMode === "integral-cycle" ? totalCycles * SAMPLES_PER_PERIOD : SAMPLES_PER_PERIOD));
  const source = analysis.map((sample) => sample.sourceVoltage);
  const voltage = analysis.map((sample) => sample.outputVoltage);
  const currentValues = analysis.map((sample) => sample.outputCurrent);
  const sourceRms = rms(source);
  const outputVoltageRms = rms(voltage);
  const outputVoltageAvg = mean(voltage);
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
      outputVoltageAvg,
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
