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
/**
 * Default parameters are chosen so the simulator initialises in CCM for all classes.
 * Critical inductance for Class A/C (buck): Lc = R(1-D)/(2fs) = 12×0.45/8000 ≈ 0.68 mH.
 * L = 35 mH >> Lc → safely in CCM with visible ripple and fast settle.
 */
export const defaultChopperParameters: ChopperParameters = { topology: "buck", quadrantClass: "A", control: "pwm", dutyCycle: 0.55, switchingFrequency: 4000, inputVoltage: 120, loadType: "RL", resistance: 12, inductanceMilliHenry: 35, backEmfVoltage: 24 };
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);
const normalizedDutyCycle = (value: number) => clamp(Number.isFinite(value) ? value : 0, 0, 1);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const rms = (values: number[]) => Math.sqrt(mean(values.map((value) => value * value)));

function effectiveFrequency(parameters: ChopperParameters) { return Math.max(parameters.control === "frequency" ? parameters.switchingFrequency * (0.45 + parameters.dutyCycle) : parameters.switchingFrequency, 50); }

/**
 * Critical inductance (boundary inductance for CCM/DCM transition).
 *
 * Class A (buck):          Lc = R(1-D) / (2f)
 * Class B (boost-regen):   Lc = R·D(1-D) / (2f)   [boost converter analogy]
 * Class C (two-quad A):    Lc = R(1-D) / (2f)       [same as buck]
 * Class D/E (full-bridge): Lc = R(1-|2D-1|) / (4f)  [bipolar PWM, effective fs doubles]
 * Boost topology:          Lc = R·D(1-D)² / (2f)
 * Buck-boost topology:     Lc = R(1-D)² / (2f)
 */
function criticalInductance(parameters: ChopperParameters, frequency: number) {
  const duty = normalizedDutyCycle(parameters.dutyCycle), resistance = Math.max(parameters.resistance, 0.05);
  if (parameters.quadrantClass === "B") return (duty * (1 - duty) * resistance) / (2 * frequency);
  if (parameters.quadrantClass === "D" || parameters.quadrantClass === "E") return (resistance * (1 - Math.abs(2 * duty - 1))) / (4 * frequency);
  if (parameters.topology === "boost") return (duty * (1 - duty) ** 2 * resistance) / (2 * frequency);
  if (parameters.topology === "buck-boost") return ((1 - duty) ** 2 * resistance) / (2 * frequency);
  // Class A, C, and default buck
  return ((1 - duty) * resistance) / (2 * frequency);
}

/**
 * Quadrant-enforce current based on class:
 * - Class A (1st quadrant): current ≥ 0 only — freewheeling diode blocks reverse
 * - Class B (2nd quadrant): current ≤ 0 only — topology enforces regen direction
 * - Class C/D/E: no clamping — bidirectional current allowed
 */
function enforceQuadrantCurrent(current: number, quadrantClass: QuadrantClass) {
  if (quadrantClass === "A") return Math.max(0, current);
  if (quadrantClass === "B") return Math.min(0, current);
  return current; // C, D, E: bidirectional — no clamping
}

/**
 * Returns the instantaneous applied voltage for the inductor differential equation.
 *
 * Class A — Buck (step-down, 1st quadrant):
 *   ON:  v_applied = Vs   → L·di/dt = Vs - R·i - E
 *   OFF: v_applied = 0    → L·di/dt = -R·i - E   (freewheeling diode)
 *
 * Class B — Regenerative boost (2nd quadrant, current flows source←load):
 *   ON:  CH1 shorts inductor to load EMF source
 *        L·di_L/dt = E - R·i_L   (positive i_L is the inductor current magnitude)
 *   OFF: D1 conducts, energy returns to Vs
 *        L·di_L/dt = E - Vs - R·i_L
 *   Note: Output current i_o = -i_L (conventional current from source's perspective).
 *
 * Class C — Two-quadrant Type A (V+, I±):
 *   Complementary switches; same average voltage as Class A buck.
 *   ON:  v_applied = Vs
 *   OFF: v_applied = 0
 *   Current allowed to swing below zero (no DCM clamp).
 *
 * Class D — Two-quadrant Type B (V±, I+):
 *   Both switches S1,S2 on simultaneously.
 *   ON:  v_applied = +Vs
 *   OFF: v_applied = -Vs   (freewheeling through D1,D2)
 *   Average: Vo = (2D-1)·Vs
 *
 * Class E — Four-quadrant full-bridge (V±, I±):
 *   Bipolar PWM, diagonal pairs (S1,S4)/(S2,S3).
 *   ON:  v_applied = +Vs
 *   OFF: v_applied = -Vs
 *   Average: Vo = (2D-1)·Vs
 *   No current restriction in either axis.
 */
function computeDerivative(
  current: number,
  switchOn: boolean,
  quadrantClass: QuadrantClass,
  topology: ChopperTopology,
  Vs: number,
  E: number,
  R: number,
  L: number,
): number {
  switch (quadrantClass) {
    case "B":
      // Class B: i_L is the inductor current (magnitude, internal sign tracks regen direction)
      // We store it as negative (conventional output current sign), so derivative uses -current
      // to recover the inductor current magnitude.
      if (switchOn) {
        // L·di_L/dt = E - R·i_L  →  for stored i (= -i_L): d(i)/dt = -(E - R·(-i))/L = (-E - R·i)/L
        return (-E - R * current) / L;
      } else {
        // L·di_L/dt = E - Vs - R·i_L  →  d(i)/dt = -(E - Vs - R·(-i))/L = (Vs - E - R·i)/L
        return (Vs - E - R * current) / L;
      }

    case "D":
    case "E":
      // Full-bridge: v_applied alternates between +Vs and -Vs
      // L·di/dt = v_applied - R·i - E
      // (E is back-EMF of load; for D/E it can be bidirectional)
      if (switchOn) {
        return (Vs - R * current - E) / L;
      } else {
        return (-Vs - R * current - E) / L;
      }

    case "C":
      // Two-quadrant A: complementary switches, same as buck but no DCM clamp
      if (switchOn) {
        return (Vs - R * current - E) / L;
      } else {
        return (-R * current - E) / L;
      }

    case "A":
    default:
      // Class A or topology-dependent (buck/boost/buck-boost)
      switch (topology) {
        case "buck":
          return (switchOn ? Vs - R * current - E : -R * current - E) / L;
        case "boost":
          // ON: switch shorts inductor to supply; diode blocked
          // L·di/dt = Vs - R·i   (E not in circuit during ON for ideal boost)
          // OFF: diode conducts, load sees Vs + L·di/dt
          // L·di/dt = Vs - R·i - E   (E is the output/load voltage for RLE)
          return (switchOn ? Vs - R * current : Vs - R * current - E) / L;
        case "buck-boost":
          // ON: switch connects inductor to Vs; output disconnected
          // L·di/dt = Vs - R·i
          // OFF: stored energy released to load (inverted polarity)
          // L·di/dt = -R·i - E
          return (switchOn ? Vs - R * current : -R * current - E) / L;
        default:
          return (switchOn ? Vs - R * current - E : -R * current - E) / L;
      }
  }
}

/**
 * Compute instantaneous output voltage given circuit state.
 *
 * For inductive loads, the output voltage is derived from the circuit topology:
 *
 * Class A Buck:      ON → Vs across switch+load; OFF → 0 (freewheeling)
 *                    Actual terminal: v_L = R·i + E (KVL)
 * Class B Regen:     ON → 0 (switch shorts); OFF → Vs (diode conducts)
 * Class C:           ON → Vs; OFF → 0
 * Class D/E:         ON → +Vs; OFF → -Vs
 * Boost (Class A):   ON → inductor charges (vout ≈ 0 or E); OFF → Vs
 * Buck-Boost:        ON → 0; OFF → inverted output
 */
function computeOutputVoltage(
  current: number,
  switchOn: boolean,
  quadrantClass: QuadrantClass,
  topology: ChopperTopology,
  Vs: number,
  E: number,
  R: number,
  hasInductor: boolean,
): number {
  switch (quadrantClass) {
    case "B":
      if (hasInductor) {
        // ON: switch closed, terminal voltage = 0 (shorted)
        // OFF: diode conducts back to source, terminal = Vs
        return switchOn ? 0 : (current < -1e-6 ? Vs : E);
      } else {
        // Resistive-only Class B (degenerate case)
        return switchOn ? 0 : (E > Vs ? Vs : E);
      }

    case "D":
    case "E":
      // Bipolar: +Vs or -Vs
      return switchOn ? Vs : -Vs;

    case "C":
      // Same switching pattern as buck; current can be negative
      if (hasInductor) {
        return switchOn ? Vs : 0;
      } else {
        return switchOn ? Vs : 0;
      }

    case "A":
    default:
      if (!hasInductor) {
        switch (topology) {
          case "buck": return switchOn ? Vs : 0;
          case "boost": return switchOn ? 0 : Vs;
          case "buck-boost": return switchOn ? 0 : -Vs;
          default: return switchOn ? Vs : 0;
        }
      }
      // Inductive: output follows KVL: v_L_terminal = R·i + E (for buck/buck-boost)
      // Boost inductive: OFF delivers Vs to output
      switch (topology) {
        case "buck":
          // Buck output voltage is the inductor terminal: R·i + E when i > 0
          return current > 1e-9 ? R * current + E : (switchOn ? Vs : 0);
        case "boost":
          // Boost: OFF → output = Vs; ON → output ≈ input short (E for RLE)
          return switchOn ? (current > 1e-9 ? E : 0) : Vs;
        case "buck-boost":
          // Buck-boost: OFF → output is inverted storage voltage
          return switchOn ? 0 : -(R * current + E);
        default:
          return switchOn ? Vs : 0;
      }
  }
}

export function simulateChopper(parameters: ChopperParameters): ChopperSimulation {
  const duty = normalizedDutyCycle(parameters.dutyCycle);
  const frequency = effectiveFrequency(parameters);
  const period = 1 / frequency;
  const resistance = Math.max(parameters.resistance, 0.05);
  const inductance = Math.max(parameters.inductanceMilliHenry, 0) / 1000;
  const hasInductor = parameters.loadType !== "R" && inductance > 0;
  const qClass = parameters.quadrantClass;
  const isClassB = qClass === "B";
  const isBidirectional = qClass === "C" || qClass === "D" || qClass === "E";

  /**
   * Resolve back-EMF:
   * - Class B: always needs E > 0 to drive regeneration. Default to 0.6·Vs if not provided.
   * - Class D/E: E can be 0 for pure R or RL loads; non-zero for RLE.
   * - Class A/C with RLE: use provided E (clamped ≥ 0).
   * - All others: 0
   */
  const backEmf: number = isClassB
    ? (parameters.backEmfVoltage > 0 ? parameters.backEmfVoltage : Math.max(48, Math.round(parameters.inputVoltage * 0.6)))
    : (parameters.loadType === "RLE" ? Math.max(parameters.backEmfVoltage, 0) : 0);

  const settlePeriods = hasInductor ? clamp(Math.ceil((7 * inductance / resistance) / period), 10, 420) : 10;
  const totalPeriods = settlePeriods + DISPLAY_PERIODS;
  const dt = period / SAMPLES_PER_PERIOD;
  const totalSteps = totalPeriods * SAMPLES_PER_PERIOD;
  const captureStart = settlePeriods * SAMPLES_PER_PERIOD;

  const samples: ChopperSample[] = [];
  let current = 0;
  let dcmSeen = false;

  // ─── Zero duty-cycle boundary case ─────────────────────────────────────────
  if (duty <= 1e-6) {
    let vOut: number;
    let iOut: number;
    if (isClassB) {
      // D=0: switch never closes; no energy stored; output = backEmf (clamped to Vs)
      vOut = Math.min(backEmf, parameters.inputVoltage);
      iOut = 0;
    } else if (qClass === "D" || qClass === "E") {
      // D=0: both half-cycles in negative rail; Vo = (2·0-1)·Vs = -Vs
      vOut = -parameters.inputVoltage;
      iOut = (-parameters.inputVoltage - backEmf) / resistance;
    } else {
      vOut = backEmf; // pure E at output (no switching)
      iOut = 0;
    }
    for (let step = captureStart; step <= totalSteps; step += 1) {
      samples.push({ time: (step - captureStart) * dt, outputVoltage: vOut, outputCurrent: iOut, gatePulse: 0, switchOn: false });
    }
    const critical = criticalInductance(parameters, frequency);
    const metrics: ChopperMetrics = {
      outputVoltageDc: vOut, outputVoltageRms: Math.abs(vOut), outputCurrentDc: iOut,
      rippleCurrent: 0, currentMax: iOut, currentMin: iOut,
      criticalInductanceMilliHenry: critical * 1000, conductionMode: "DCM",
      inputPower: 0, outputPower: 0, efficiency: 0, dutyCycle: 0,
    };
    return { period, switchingFrequency: frequency, samples, metrics, warnings: [] };
  }

  // ─── Main simulation loop (RK4 integration) ─────────────────────────────────
  for (let step = 0; step <= totalSteps; step += 1) {
    const time = step * dt;
    const local = (time % period) / period;
    const switchOn = local < duty;

    let outputVoltage = 0;

    if (!hasInductor) {
      // ── Resistive-only (no inductor) ─────────────────────────────────
      if (isClassB) {
        if (switchOn) {
          outputVoltage = 0;
          current = -backEmf / resistance; // forced by back-EMF through R
        } else {
          // If backEmf drives current back into Vs:
          if (backEmf > parameters.inputVoltage) {
            outputVoltage = parameters.inputVoltage;
            current = -(backEmf - parameters.inputVoltage) / resistance;
          } else {
            outputVoltage = backEmf;
            current = 0;
          }
        }
      } else {
        // Resistive load: instantaneous voltage, current clamped by class
        switch (qClass) {
          case "D":
          case "E":
            outputVoltage = switchOn ? parameters.inputVoltage : -parameters.inputVoltage;
            current = (outputVoltage - backEmf) / resistance;
            break;
          case "C":
            outputVoltage = switchOn ? parameters.inputVoltage : 0;
            current = (outputVoltage - backEmf) / resistance; // can be negative
            break;
          default: // Class A + topology
            if (parameters.topology === "buck") outputVoltage = switchOn ? parameters.inputVoltage : 0;
            else if (parameters.topology === "boost") outputVoltage = switchOn ? 0 : parameters.inputVoltage;
            else outputVoltage = switchOn ? 0 : -parameters.inputVoltage;
            current = enforceQuadrantCurrent((outputVoltage - backEmf) / resistance, qClass);
        }
      }
    } else {
      // ── Inductive load: RK4 integration ─────────────────────────────
      const deriv = (i: number) => computeDerivative(i, switchOn, qClass, parameters.topology, parameters.inputVoltage, backEmf, resistance, inductance);

      const k1 = deriv(current);
      const k2 = deriv(current + dt * k1 / 2);
      const k3 = deriv(current + dt * k2 / 2);
      const k4 = deriv(current + dt * k3);
      const nextCurrent = current + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6;

      if (isClassB) {
        // Class B: current must stay ≤ 0 (regen convention); DCM at zero crossing
        if (!switchOn && nextCurrent >= 0) {
          current = 0;
          dcmSeen = true;
        } else {
          current = nextCurrent;
        }
        current = Math.min(0, current);
      } else if (isBidirectional) {
        // Class C, D, E: no clamping — current flows freely through zero
        current = nextCurrent;
      } else {
        // Class A (and topology-specific): freewheeling diode blocks reverse current.
        // Flag DCM whenever nextCurrent would go below zero — this can happen both during
        // the OFF (freewheeling) interval AND during ON in deep DCM with very small L.
        if (nextCurrent <= 0) {
          current = 0;
          dcmSeen = true;
        } else {
          current = nextCurrent;
        }
        current = enforceQuadrantCurrent(current, qClass);
      }

      outputVoltage = computeOutputVoltage(current, switchOn, qClass, parameters.topology, parameters.inputVoltage, backEmf, resistance, hasInductor);
    }

    if (step >= captureStart) {
      samples.push({
        time: (step - captureStart) * dt,
        outputVoltage,
        outputCurrent: current,
        gatePulse: switchOn ? parameters.inputVoltage * 0.12 : 0,
        switchOn,
      });
    }
  }

  // ─── Post-simulation metrics ─────────────────────────────────────────────
  const analysis = samples.slice(-SAMPLES_PER_PERIOD);
  const voltages = analysis.map((p) => p.outputVoltage);
  const currents = analysis.map((p) => p.outputCurrent);
  const outputVoltageDc = mean(voltages);
  const outputCurrentDc = mean(currents);
  const outputPower = mean(voltages.map((v, i) => v * currents[i]));

  // Input power:
  // Class B: power recovered from load to source during OFF period
  // Boost: source always connected (both states)
  // Buck/others: source only connected during ON
  // Class D/E: source connected ON (positive rail) and recycles during OFF
  let inputPower: number;
  if (isClassB) {
    inputPower = mean(analysis.map((p) => p.switchOn ? 0 : parameters.inputVoltage * (-p.outputCurrent)));
  } else if (parameters.topology === "boost" || qClass === "C") {
    inputPower = mean(analysis.map((p) => parameters.inputVoltage * p.outputCurrent));
  } else if (qClass === "D" || qClass === "E") {
    // Input power = Vs * |i| during ON (positive rail)
    inputPower = mean(analysis.map((p) => p.switchOn ? parameters.inputVoltage * Math.abs(p.outputCurrent) : 0));
  } else {
    inputPower = mean(analysis.map((p) => p.switchOn ? parameters.inputVoltage * p.outputCurrent : 0));
  }

  const currentMin = Math.min(...currents);
  const currentMax = Math.max(...currents);
  const critical = criticalInductance(parameters, frequency);

  // CCM/DCM determination:
  // Use dcmSeen — a flag set ONLY when RK4 integration physically reaches zero and the
  // freewheeling diode clamps the current. Do NOT use a threshold comparison against
  // currentMin alone: that fires spuriously in deep-CCM waveforms where Imin is small but
  // strictly positive, producing a false DCM label and banner on initial load.
  //
  // Secondary criterion (Class A/C only): currentMin < 1e-4 A (100 μA).
  // In deep DCM with extremely small L, floating-point arithmetic may not produce a
  // nextCurrent that is exactly ≤ 0 due to step-size quantisation, but the waveform
  // minimum will still be effectively zero (< 100 μA). This sub-μA threshold is
  // physically indistinguishable from zero for any real power-electronics application.
  //
  // Class B: DCM when no reverse current builds up at all (currentMax ≥ 0 in regen convention)
  // Class D/E: complementary switching prevents zero-crossing gaps → track dcmSeen only
  // Class A/C: dcmSeen OR currentMin < 100μA (physically zero)
  const inDcm = (qClass === "A" || qClass === "C")
    ? (dcmSeen || currentMin < 1e-4)
    : dcmSeen;
  const conductionMode: "CCM" | "DCM" = isClassB
    ? (dcmSeen || currentMax >= -1e-6 ? "DCM" : "CCM")
    : (inDcm ? "DCM" : "CCM");

  const efficiency = isClassB
    ? (inputPower > 1e-9 ? clamp(100 * inputPower / Math.max(Math.abs(outputPower), inputPower), 0, 100) : 0)
    : (inputPower > 1e-9 ? clamp(100 * Math.abs(outputPower) / inputPower, 0, 100) : 0);

  const metrics: ChopperMetrics = {
    outputVoltageDc, outputVoltageRms: rms(voltages), outputCurrentDc,
    rippleCurrent: currentMax - currentMin, currentMax, currentMin,
    criticalInductanceMilliHenry: critical * 1000, conductionMode,
    inputPower, outputPower, efficiency, dutyCycle: duty,
  };

  // ─── Warning generation ─────────────────────────────────────────────────
  const warnings: ChopperWarning[] = [];

  // Warn for excessive duty cycle on boost/buck-boost (not applicable for Class D/E which use (2D-1) formula)
  if (!isClassB && qClass !== "D" && qClass !== "E"
    && (parameters.topology === "boost" || parameters.topology === "buck-boost")
    && duty > 0.9) {
    warnings.push({
      code: "DUTY_CYCLE_HIGH",
      message: `Duty cycle ${(duty * 100).toFixed(0)}% exceeds the 90% practical limit for ${parameters.topology} operation; component stress and efficiency loss increase sharply beyond this point.`,
    });
  }

  // Back-EMF reversal warning: only meaningful for strictly unidirectional (Class A) topologies.
  // Class B, C, D, E are designed to handle bidirectional current/voltage — no false warning.
  // For Class A, the freewheeling diode clamps current to 0 so outputCurrentDc never goes negative;
  // instead we compare the theoretical average Vo = D·Vs against E to detect the reversal condition.
  if (qClass === "A" && parameters.loadType === "RLE") {
    const theoreticalVo = duty * parameters.inputVoltage;
    if (theoreticalVo < backEmf - 1e-6) {
      warnings.push({
        code: "BACK_EMF_REVERSES_CURRENT",
        message: `Back-EMF ${parameters.backEmfVoltage}V exceeds the average output voltage (${theoreticalVo.toFixed(1)}V); a unidirectional chopper cannot sustain the required reverse current.`,
      });
    }
  }

  // CCM/DCM boundary proximity warning
  const lambda = hasInductor ? (frequency * inductance) / resistance : 0;
  const boundaryLambda = criticalInductance(parameters, frequency) * frequency / resistance;
  if (hasInductor && boundaryLambda > 1e-9 && Math.abs(lambda - boundaryLambda) < 0.05 * Math.max(boundaryLambda, 1e-6)) {
    warnings.push({
      code: "CCM_DCM_BOUNDARY",
      message: "Operating near the CCM/DCM boundary; expect elevated current ripple and mode sensitivity to small parameter changes.",
    });
  }

  return { period, switchingFrequency: frequency, samples, metrics, warnings };
}
