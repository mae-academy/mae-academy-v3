/** Turns netlist-ready SPICE components into a deck ngspice can run in batch mode. */

import {
  DEFAULT_OPAMP_GAIN,
  DEFAULT_OPAMP_GBW,
  DEFAULT_OPAMP_INPUT_RESISTANCE,
  DEFAULT_OPAMP_OUTPUT_RESISTANCE,
  DEFAULT_OPAMP_RAIL_MARGIN,
  DEFAULT_OPAMP_SLEW_RATE,
  DEFAULT_OPAMP_SUPPLY,
  elementNets,
  IDEAL_OPAMP_GAIN,
  isSpiceElement,
  MIN_OPAMP_GAIN,
  SPICE_GROUND,
  SPICE_PREFIXES,
  type SpiceComponent,
  type SpiceNet,
  type SpiceOpAmp,
} from "@/simulators/circuit-engine/engine/spice/spiceTypes";
import type { SimulationMode } from "@/simulators/circuit-engine/engine/spice/spiceAdapter";

/** Everything except ground: the components that produce an actual element line. */
type SpiceElement = Exclude<SpiceComponent, { kind: "ground" }>;

export class NetlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetlistError";
  }
}

export interface SpiceNodeMap {
  /** SPICE node name for a canvas net; ground nets always resolve to `0`. */
  nameFor(net: SpiceNet): string;
  /** Canvas net behind a SPICE node name, for reading results back onto the schematic. */
  netFor(name: string): SpiceNet | undefined;
  /**
   * Whether `net` is a ground net or touches at least one emitted element. `nameFor` silently
   * defaults an unmapped net to `0`, which is wrong for a probe-only net (voltmeter, oscilloscope)
   * that never became a real SPICE node — check this first to tell a genuine ground tie from that.
   */
  isMapped(net: SpiceNet): boolean;
  /** Every non-ground mapping, in the order the nets were first encountered. */
  readonly entries: ReadonlyArray<{ net: SpiceNet; name: string }>;
}

export interface GenerateNetlistOptions {
  /** SPICE discards the first line of a deck, so a title is always emitted. */
  title?: string;
  /** Analysis directives placed before `.end`. Defaults to a single `.op`. */
  analysis?: string[];
  /**
   * `academic` swaps in idealized textbook models (ideal switches, no Early effect, RMS-scaled AC
   * sources, …); `practical` (the default) keeps the real-world non-linear models.
   */
  simulationMode?: SimulationMode;
  /**
   * Canvas nets to seed with a starting voltage via a `.IC V(node)=value` directive, keyed by the
   * same `SpiceNet` a caller reads back from `SpiceNodeMap`/`SpiceCircuitNets`.
   *
   * Every canvas edit (including releasing S1 on a self-holding contactor latch) rebuilds the
   * whole netlist and reruns `.tran` from t=0 on a brand-new ngspice instance — spiceWorker.ts
   * cannot reuse one across runs — so a coil held in only by its own contact (aux-NO wired back
   * onto the coil it drives) needs its previous run's coil voltage fed forward here, or the new
   * run's Newton iteration starts that control node's guess at 0 V and settles on the de-energized
   * branch even though the physical armature should still be latched in.
   *
   * A bare `IC=` on the coil's own inductor is not a substitute and was tried and rejected: with
   * the switch's control node left an unseeded 0 V guess, ngspice's first Newton iteration still
   * evaluates the aux contact open regardless of the imposed inductor current, and forcing a
   * nonzero current through what it thinks is an open branch produced a several-thousand-volt
   * numerical spike rather than a stable latched start (verified against ngspice.wasm directly).
   * Seeding the node voltage itself is what actually converges cleanly.
   *
   * Only takes effect when the emitted `.tran` also carries `uic`; a net with no emitted element
   * (never mapped) is silently skipped, as is one that resolves to ground (`.IC` cannot set node 0).
   */
  initialNodeVoltages?: ReadonlyMap<SpiceNet, number>;
}

/**
 * Assigns SPICE node names to canvas nets. Canvas nets are UUID-bearing strings such as
 * `n:9f2c7a1e-…:a`, which SPICE cannot use as identifiers, so they are renumbered `n1`, `n2`, … in
 * first-encounter order. Every net named by a ground component — and the literal `'0'` — maps to
 * SPICE's reference node `0`.
 *
 * Deterministic for a given component list, so a caller can rebuild the same map to interpret
 * results without threading it through the worker.
 */
export function buildSpiceNodeMap(components: SpiceComponent[]): SpiceNodeMap {
  const groundNets = new Set<SpiceNet>([SPICE_GROUND]);
  for (const component of components) {
    if (component.kind === "ground") groundNets.add(component.net);
  }

  const names = new Map<SpiceNet, string>();
  const nets = new Map<string, SpiceNet>();
  const entries: Array<{ net: SpiceNet; name: string }> = [];

  const assign = (net: SpiceNet) => {
    if (groundNets.has(net) || names.has(net)) return;
    const name = `n${entries.length + 1}`;
    names.set(net, name);
    nets.set(name, net);
    entries.push({ net, name });
  };

  for (const component of components) {
    if (!isSpiceElement(component)) continue;
    for (const net of elementNets(component)) assign(net);
  }

  return {
    nameFor: net =>
      groundNets.has(net) ? SPICE_GROUND : (names.get(net) ?? SPICE_GROUND),
    netFor: name => nets.get(name),
    isMapped: net => groundNets.has(net) || names.has(net),
    entries,
  };
}

/** SPICE identifiers cannot carry whitespace or punctuation, and must start with the type letter. */
function sanitizeLabel(
  label: string,
  prefix: string,
  fallback: number
): string {
  const cleaned = label.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "");
  if (cleaned.length === 0) return `${prefix}${fallback}`;
  return cleaned[0].toUpperCase() === prefix ? cleaned : `${prefix}${cleaned}`;
}

function formatValue(
  value: number,
  component: SpiceElement,
  field: string
): string {
  if (!Number.isFinite(value)) {
    throw new NetlistError(
      `${component.kind} "${component.label}" has a non-finite ${field} (${value}).`
    );
  }
  // String() yields "0.000001" for 1e-6 and "1e-15" for 1e-15; ngspice parses both, and neither
  // ends in a letter that ngspice would read as a unit suffix.
  return String(value);
}

/** Wraps `value` into `[0, period)`. */
function wrapToPeriod(value: number, period: number): number {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
}

/**
 * PULSE() parameters approximating square/triangle/sawtooth. Phase reference at phaseDegrees=0:
 * - square matches SIN()'s own convention — `sign(sin(angle))` is +1 at angle=0 — so it starts at
 *   its positive peak, same as sine starts at its zero-crossing.
 * - triangle and sawtooth instead use their reset edge (trough at t=0): see the comment above their
 *   shared branch below for why a zero-crossing reference (which would need PULSE's TD to land
 *   mid-ramp) doesn't work for them the way it does for square.
 * A positive phaseDegrees advances the waveform (moves its reference point earlier in time), same
 * direction SIN()'s phase argument does.
 *
 * PULSE's TD is a one-time initial hold at V1 before the (ramp/hold/ramp/hold) cycle of length PER
 * starts repeating — not a per-cycle phase applied every period. Square's periodic block holds at V1
 * for half of PER, exactly matching the pre-hold TD needs for any phase, so it stays exact for a
 * full period range; triangle/sawtooth's periodic block holds at V1 for only a sliver of PER, so
 * their pre-hold is only guaranteed exact at phase 0 (see below). Checked against real ngspice.wasm
 * output in ngspiceRegression.waveforms.test.ts, not merely reasoned through — the zero-crossing
 * convention this file started with was tried, failed that test, and is why this comment exists.
 */
function pulseParameters(
  waveform: "square" | "triangle" | "sawtooth",
  amplitude: number,
  offset: number,
  frequency: number,
  phaseDegrees: number
): {
  v1: number;
  v2: number;
  td: number;
  tr: number;
  tf: number;
  pw: number;
  per: number;
} {
  const period = 1 / frequency;
  const edge = period * 1e-6; // Near-instant but nonzero — ngspice requires TR/TF > 0.
  const phaseTime = (phaseDegrees / 360) * period;

  if (waveform === "square") {
    const tr = edge;
    const tf = edge;
    const pw = period / 2 - tr - tf;
    const td = wrapToPeriod(period / 2 - phaseTime, period);
    return {
      v1: amplitude + offset,
      v2: -amplitude + offset,
      td,
      tr,
      tf,
      pw,
      per: period,
    };
  }

  // Triangle and sawtooth both use the reset-edge reference (trough at t=0, phase 0) rather than
  // sine's zero-crossing: their periodic block's trailing V1 hold is (near-)zero, so a TD chosen to
  // land mid-ramp — as a zero-crossing reference would need — has nothing of matching duration to
  // seamlessly continue from, and produces a wrong first partial cycle instead (confirmed against
  // real ngspice.wasm output: exactly this was tried and failed ngspiceRegression.waveforms.test.ts
  // before landing on this convention). TD=0 at phase 0 sidesteps the issue entirely — the ramp
  // starts right at t=0, no pre-hold to get wrong. A nonzero phase still reintroduces a pre-hold
  // (TD>0) that can briefly mismatch true periodicity for less than one cycle before the second
  // period onward is exact — acceptable here since every reading downstream (getVrms/getFrequency)
  // already windows to whole periods and skips exactly that leading fraction.
  if (waveform === "triangle") {
    const tr = period / 2 - edge;
    const tf = period / 2 - edge;
    const pw = edge;
    const td = wrapToPeriod(-phaseTime, period);
    return {
      v1: -amplitude + offset,
      v2: amplitude + offset,
      td,
      tr,
      tf,
      pw,
      per: period,
    };
  }

  const tr = period - 2 * edge;
  const tf = edge;
  const pw = edge;
  const td = wrapToPeriod(-phaseTime, period);
  return {
    v1: -amplitude + offset,
    v2: amplitude + offset,
    td,
    tr,
    tf,
    pw,
    per: period,
  };
}

/** A generated `.MODEL` card. Cards are de-duplicated by name before being emitted. */
interface SpiceModel {
  name: string;
  card: string;
}

/** Thermal voltage at the 27 °C ngspice defaults to, used to fit an LED's saturation current. */
const THERMAL_VOLTAGE = 0.025852;
/** The current an LED's quoted forward voltage is specified at. */
const LED_TEST_CURRENT = 0.02;
/**
 * Saturation current for the LED model. Held fixed at a value real LED models use, with the
 * emission coefficient carrying the forward voltage instead: solving for IS at a high Vf drives it
 * to ~1e-31, where ngspice's diode solver stops tracking the ideal equation and a blue LED reads
 * ~0.25 V low. Solving for N instead keeps every fit accurate to ~1%.
 */
const LED_SATURATION_CURRENT = 1e-20;

/** Turns a value into a SPICE-legal identifier fragment: 5.1 -> `5P1`, -2 -> `M2`. */
function modelToken(value: number): string {
  const magnitude = `${Math.abs(value)}`.replace(/[^0-9A-Za-z]/g, "P");
  return value < 0 ? `M${magnitude}` : magnitude;
}

/**
 * The `.MODEL` card an element needs, or `undefined` for passives and sources. Most kinds share one
 * generic card; a zener's breakdown voltage and an LED's forward voltage are model parameters
 * rather than element parameters, so those get one card per distinct value.
 */
function modelFor(
  element: SpiceElement,
  mode: SimulationMode
): SpiceModel | undefined {
  const academic = mode === "academic";
  switch (element.kind) {
    case "diode":
      switch (element.variant) {
        case "standard":
          // Academic: an ideal switch-like junction — N so far below 1 that the I-V curve is
          // effectively a step at 0 V, rather than silicon's ~0.6-0.7 V knee. RS=1e-3 (rather than
          // 0) is load-bearing: verified against ngspice.wasm, a bare junction this steep with no
          // series resistance has nothing bounding di/dv, and gmin/source stepping all fail to find
          // an operating point the moment it sits directly across a source with no other resistance.
          return academic
            ? { name: "D_STD", card: ".MODEL D_STD D (IS=1e-14 RS=1e-3 N=0.001)" }
            : { name: "D_STD", card: ".MODEL D_STD D (IS=1e-14 RS=0 N=1)" };
        case "photodiode":
          // Reduced to its junction: IS stands in for dark current. Photocurrent needs an
          // illumination-driven source, which the canvas does not yet model. Not swapped for an
          // ideal switch in Academic mode — its dark-current behavior is the point of the part.
          return {
            name: "D_PHOTO",
            card: ".MODEL D_PHOTO D (IS=1e-9 RS=0 N=1)",
          };
        case "zener": {
          const breakdown = formatValue(
            element.breakdownVoltage,
            element,
            "breakdownVoltage"
          );
          const name = `D_ZENER_${modelToken(element.breakdownVoltage)}`;
          // Academic: ideal switch-like below/above BV, same rationale as the standard diode.
          const emission = academic ? 0.001 : 1;
          return {
            name,
            card: `.MODEL ${name} D (IS=1e-14 N=${emission} BV=${breakdown} IBV=0.001)`,
          };
        }
        case "led": {
          formatValue(element.forwardVoltage, element, "forwardVoltage");
          if (element.forwardVoltage <= 0) {
            throw new NetlistError(
              `LED "${element.label}" needs a positive forward voltage, got ${element.forwardVoltage}.`
            );
          }
          const name = `D_LED_${modelToken(element.forwardVoltage)}`;
          if (academic) {
            // Ideal switch-like junction, same as the standard diode (RS=1e-3 for the same
            // convergence reason); the fitted forward-voltage knee is a Practical-mode concern.
            return {
              name,
              card: `.MODEL ${name} D (IS=1e-14 N=0.001 RS=1e-3)`,
            };
          }
          // Fitted so the junction drops the quoted forward voltage at LED_TEST_CURRENT:
          // Vf = N * Vt * ln(I / IS)  =>  N = Vf / (Vt * ln(I / IS)).
          const emission =
            element.forwardVoltage /
            (THERMAL_VOLTAGE *
              Math.log(LED_TEST_CURRENT / LED_SATURATION_CURRENT));
          return {
            name,
            card: `.MODEL ${name} D (IS=${LED_SATURATION_CURRENT} N=${emission.toFixed(4)} RS=1)`,
          };
        }
      }
      break;

    case "bjt":
      // Academic: no Early effect (VAF=0), no junction capacitance, flat BF — the textbook
      // constant-beta transistor.
      return element.polarity === "npn"
        ? {
            name: "NPN_STD",
            card: academic
              ? ".MODEL NPN_STD NPN (IS=1e-14 BF=100 VAF=0 CJE=0 CJC=0 RB=10 RC=1 RE=0.1)"
              : ".MODEL NPN_STD NPN (IS=1e-14 BF=100 VAF=100 RB=10 RC=1 RE=0.1)",
          }
        : {
            name: "PNP_STD",
            card: academic
              ? ".MODEL PNP_STD PNP (IS=1e-14 BF=100 VAF=0 CJE=0 CJC=0 RB=10 RC=1 RE=0.1)"
              : ".MODEL PNP_STD PNP (IS=1e-14 BF=100 VAF=100 RB=10 RC=1 RE=0.1)",
          };

    case "mosfet":
      return element.channel === "n"
        ? {
            name: "NMOS_STD",
            card: ".MODEL NMOS_STD NMOS (LEVEL=1 VTO=2 KP=2e-5 GAMMA=0 PHI=0.6 LAMBDA=0.02)",
          }
        : {
            name: "PMOS_STD",
            card: ".MODEL PMOS_STD PMOS (LEVEL=1 VTO=-2 KP=2e-5 GAMMA=0 PHI=0.6 LAMBDA=0.02)",
          };

    case "jfet":
      return element.channel === "n"
        ? {
            name: "NJF_STD",
            card: ".MODEL NJF_STD NJF (VTO=-4 BETA=0.001 LAMBDA=0.01)",
          }
        : {
            // VTO stays negative for PJF too: SPICE derives the channel sign from the model
            // type, so a positive VTO leaves a P-JFET pinched off at Vgs = 0.
            name: "PJF_STD",
            card: ".MODEL PJF_STD PJF (VTO=-4 BETA=0.001 LAMBDA=0.01)",
          };

    default:
      return undefined;
  }
  return undefined;
}

/* --------------------------------------------------------------- Voltage-controlled switches --- */

/**
 * Contact resistances for a coil-driven contact model (`SW` with VT/VH — not PSPICE's `VSWITCH`
 * with VON/VOFF: this ngspice build fails to parse a `VSWITCH` model card, and feeding VON/VOFF to
 * `SW` aborts the process outright). Manual contacts (switches, breakers, pushbuttons, …) never
 * need this dynamic model — see `manualContactOnResistance` — because a canvas edit always rebuilds
 * the whole deck, so nothing needs to change contact state mid-solve.
 *
 * Academic mode drives RON down to a near-zero ideal contact, but not all the way to the value
 * `manualContactOnResistance` uses: ROFF stays 1e9 in both modes, and an RON/ROFF ratio much beyond
 * 1e12 leaves ngspice's transient solver chattering at its minimum timestep on the instant the
 * contact closes.
 */
function switchResistances(mode: SimulationMode): string {
  return mode === "academic" ? "RON=1e-3 ROFF=1e9" : "RON=0.001 ROFF=1e9";
}

/**
 * Resistance of a closed manually operated contact (switch, breaker, pushbutton, aux contact,
 * forced relay override), emitted as a plain resistor rather than a voltage-controlled switch: a
 * manual contact's state never changes within one SPICE solve, so there is nothing to switch.
 *
 * An open manual contact emits nothing at all — see `elementLines`.
 */
function manualContactOnResistance(mode: SimulationMode): number {
  return mode === "academic" ? 1e-6 : 0.001;
}

type SpiceCoilElement = Extract<SpiceElement, { kind: "relay" | "contactor" }>;

/**
 * Threshold and hysteresis for a coil-driven contact. Pull-in and drop-out straddle VT by VH, so
 * the armature holds in below the voltage that first closed it, exactly as a real relay does.
 */
function coilThreshold(element: SpiceCoilElement): {
  threshold: number;
  hysteresis: number;
} {
  const pullIn = element.pullInVoltage;
  const dropOut = element.dropOutVoltage ?? pullIn / 2;
  if (!(pullIn > 0)) {
    throw new NetlistError(
      `${element.kind} "${element.label}" needs a positive pull-in voltage, got ${pullIn}.`
    );
  }
  if (!(dropOut >= 0) || dropOut >= pullIn) {
    throw new NetlistError(
      `${element.kind} "${element.label}" needs a drop-out voltage below its pull-in voltage, got ${dropOut}.`
    );
  }
  return {
    threshold: (pullIn + dropOut) / 2,
    hysteresis: (pullIn - dropOut) / 2,
  };
}

/**
 * Model names for a coil's contacts. The normally-closed variant is the same switch with a negated
 * threshold, driven from the coil's terminals in reverse — SW has no inversion of its own, and
 * this avoids spending a behavioural source on it.
 *
 * Academic mode zeroes the hysteresis (an ideal contact snaps at one threshold), which the token
 * folds in so the model name always matches the VH it is about to be given.
 */
function coilModelNames(
  element: SpiceCoilElement,
  mode: SimulationMode
): {
  normallyOpen: string;
  normallyClosed: string;
} {
  const { threshold, hysteresis: realHysteresis } = coilThreshold(element);
  const hysteresis = mode === "academic" ? 0 : realHysteresis;
  const token = `${modelToken(threshold)}_${modelToken(hysteresis)}`;
  return {
    normallyOpen: `SW_COIL_${token}`,
    normallyClosed: `SW_COIL_${token}_NC`,
  };
}

function switchModelsFor(
  element: SpiceElement,
  mode: SimulationMode
): SpiceModel[] {
  switch (element.kind) {
    // Manual contacts are plain resistors (see `manualContactResistance`) and need no model card.
    case "switch-spst":
    case "switch-spdt":
      return [];

    case "relay":
    case "contactor": {
      const { threshold, hysteresis: realHysteresis } = coilThreshold(element);
      const hysteresis = mode === "academic" ? 0 : realHysteresis;
      const names = coilModelNames(element, mode);
      const vt = formatValue(threshold, element, "pullInVoltage");
      const vh = formatValue(hysteresis, element, "dropOutVoltage");
      const resistances = switchResistances(mode);
      return [
        {
          name: names.normallyOpen,
          card: `.MODEL ${names.normallyOpen} SW (VT=${vt} VH=${vh} ${resistances})`,
        },
        {
          name: names.normallyClosed,
          card: `.MODEL ${names.normallyClosed} SW (VT=-${vt} VH=${vh} ${resistances})`,
        },
      ];
    }

    default:
      return [];
  }
}

/** Every `.MODEL` card an element needs, semiconductor or switch. */
function modelsFor(element: SpiceElement, mode: SimulationMode): SpiceModel[] {
  const semiconductor = modelFor(element, mode);
  return semiconductor ? [semiconductor] : switchModelsFor(element, mode);
}

/** A generated `.SUBCKT` block, for parts ngspice has no native model for. */
interface SpiceMacro {
  name: string;
  /** The complete block, `.SUBCKT` through `.ENDS`. */
  lines: string[];
}

/**
 * Shared parameters for the cross-coupled pair behind the SCR and TRIAC latches.
 *
 * CJE/CJC/TF/TR are load-bearing, not decoration: without them regeneration is a step
 * discontinuity and ngspice's transient solver stalls at the trigger instant instead of latching.
 * ISE/NE/IKF shape beta at the current extremes.
 *
 * Known limitation: a two-transistor thyristor is a bistable circuit, and ngspice's DC solver
 * settles it on the conducting branch, so `.op` reports several milliamps of anode current even
 * with no gate drive. A 43-point sweep of RAG, RGK and ISE never brought that below ~6.9 mA while
 * keeping the latch working, so these values are the best of that grid rather than a tuning
 * accident. Latching itself is correct under `.tran`, which is how a thyristor should be
 * exercised: the anode collapses on gate current and stays collapsed after the gate is removed.
 */
const LATCH_PARAMS =
  "IS=1e-14 BF=50 VAF=100 RB=10 RC=1 RE=0.1 ISE=1e-11 NE=2 IKF=0.5 " +
  "CJE=1e-9 CJC=1e-9 TF=1e-7 TR=1e-6";

/**
 * Cross-coupled pair shared by the SCR and TRIAC latches; local to each `.SUBCKT`.
 */
const LATCH_MODELS = (suffix: string) => [
  `.MODEL NPN_${suffix} NPN (${LATCH_PARAMS})`,
  `.MODEL PNP_${suffix} PNP (${LATCH_PARAMS})`,
];

/** Gate-to-cathode shunt. Sets the holding current and gives dv/dt immunity. */
const THYRISTOR_GATE_SHUNT = 1000;
/**
 * Anode-to-inner-base shunt. Without it the upper transistor's base floats, which both leaks
 * milliamps in the blocking state and stops the latch regenerating.
 */
const THYRISTOR_ANODE_SHUNT = 10000;

/* ------------------------------------------------------------------ Op-amp macromodel --- */

/** Ideal mode's stand-ins for infinite input impedance and zero output impedance. */
const IDEAL_OPAMP_INPUT_RESISTANCE = 1e12;
const IDEAL_OPAMP_OUTPUT_RESISTANCE = 1e-3;

/**
 * Compensation capacitance the dominant pole is built around, in farads. Any value works — the pole
 * resistor is solved from it — but 1 nF keeps both that resistor (~16 MΩ at f_b = 10 Hz) and the
 * slew-limited charging current (~0.5 mA at 0.5 V/µs) in ranges ngspice conditions well.
 */
const OPAMP_COMPENSATION_CAPACITANCE = 1e-9;

/**
 * The saturating gain stage, as a B-source expression: `Vsat·tanh(A·Vd/Vsat)`.
 *
 * Small-signal slope at Vd = 0 is exactly A, and the output asymptotes to ±Vsat, so a comparator
 * clamps at the rail without the derivative discontinuity a piecewise `limit()` would introduce at
 * the knee. The soft knee costs nothing in closed-loop accuracy: with feedback, the error against
 * the ideal gain is Vd/Vin, and Vd stays in the microvolts for any A at or above `MIN_OPAMP_GAIN`.
 */
function saturatingGainExpression(gain: string, vsat: string): string {
  return `${vsat}*tanh(${gain}*(V(INP)-V(INM))/${vsat})`;
}

/**
 * The op-amp `.SUBCKT`, in whichever of the two modes the part selects.
 *
 * Ideal (the default, and what an academic derivation assumes):
 *
 *     INP ──┬── RIN(1e12) ──┬── INM        Vout = Vsat·tanh(A·(V(INP)−V(INM))/Vsat)
 *           └──── gain stage ──── ROUT(1 mΩ) ──── OUT
 *
 * Realistic is a three-stage Boyle-style macromodel, each stage owning one non-ideality:
 *
 *     input stage    I(PL) = Imax·tanh(gm·Vd / Imax)        slew rate: dV(PL)/dt ≤ Imax/Cp
 *     dominant pole  RP ∥ CP on node PL                      GBW: f_b = 1/(2π·Rp·Cp) = GBW / A
 *     output clamp   DHI/DLO to ±Vsat, then unity buffer     saturation, without integrator windup
 *     output         ROUT                                    finite output resistance
 *
 * with Cp fixed at `OPAMP_COMPENSATION_CAPACITANCE` and
 *
 *     Rp   = 1 / (2π·f_b·Cp)
 *     gm   = A / Rp            (so the DC gain across RP is exactly A)
 *     Imax = SR · Cp
 *
 * The order is load-bearing. Saturating *before* the pole (as the ideal stage does) caps the pole's
 * charging current at Vsat/Rp — under a microamp — which would silently impose a slew rate three
 * orders of magnitude below the one configured. Saturating *after* it with a soft function leaves
 * PL free to wind up to A·Vd (≈ 10⁵ V on an open-loop comparator), which then takes seconds to slew
 * back out of. Clamping PL itself with diodes to ±Vsat, as the original Boyle model does, avoids
 * both — and ngspice's junction-voltage limiting keeps Newton iteration stable across the knee,
 * which a B-source `exp`/`max` clamp would not get.
 */
function opAmpMacro(element: SpiceOpAmp, name: string): SpiceMacro {
  const macroName = `OPAMP_${name}`;
  const realistic = element.model === "realistic";

  const gain = Math.max(
    MIN_OPAMP_GAIN,
    element.gain > 0 ? element.gain : (realistic ? DEFAULT_OPAMP_GAIN : IDEAL_OPAMP_GAIN)
  );
  const supply = element.vcc !== undefined && element.vcc > 0 ? element.vcc : DEFAULT_OPAMP_SUPPLY;
  const margin = realistic ? (element.railMargin ?? DEFAULT_OPAMP_RAIL_MARGIN) : 0;
  // A margin wider than the supply would invert the rails; a floor of 10% of the supply keeps a
  // mis-set margin a degraded swing rather than a sign flip.
  const vsat = Math.max(supply * 0.1, supply - Math.max(0, margin));

  const gainText = formatValue(gain, element, "gain");
  const vsatText = formatValue(vsat, element, "vcc");

  if (!realistic) {
    const stage = saturatingGainExpression(gainText, vsatText);
    return {
      name: macroName,
      lines: [
        `.SUBCKT ${macroName} INP INM OUT`,
        `RIN INP INM ${IDEAL_OPAMP_INPUT_RESISTANCE}`,
        `BGAIN INT 0 V={${stage}}`,
        `ROUT INT OUT ${IDEAL_OPAMP_OUTPUT_RESISTANCE}`,
        `.ENDS ${macroName}`,
      ],
    };
  }

  const gbw = element.gainBandwidth !== undefined && element.gainBandwidth > 0
    ? element.gainBandwidth
    : DEFAULT_OPAMP_GBW;
  const slewRate = element.slewRate !== undefined && element.slewRate > 0
    ? element.slewRate
    : DEFAULT_OPAMP_SLEW_RATE;
  const rin = element.inputResistance !== undefined && element.inputResistance > 0
    ? element.inputResistance
    : DEFAULT_OPAMP_INPUT_RESISTANCE;
  const rout = element.outputResistance !== undefined && element.outputResistance > 0
    ? element.outputResistance
    : DEFAULT_OPAMP_OUTPUT_RESISTANCE;

  const cp = OPAMP_COMPENSATION_CAPACITANCE;
  // GBW can never exceed A·f_b for a single-pole part, so a GBW set above the DC gain's own corner
  // is meaningless; the corner is what the pole is solved from either way.
  const breakFrequency = gbw / gain;
  const rp = 1 / (2 * Math.PI * breakFrequency * cp);
  const gm = gain / rp;
  const imax = slewRate * cp;
  const imaxText = formatValue(imax, element, "slewRate");
  const clampModel = `DCLAMP_${name}`;

  return {
    name: macroName,
    lines: [
      `.SUBCKT ${macroName} INP INM OUT`,
      `RIN INP INM ${formatValue(rin, element, "inputResistance")}`,
      `BGM 0 PL I={${imaxText}*tanh(${formatValue(gm, element, "gain")}*(V(INP)-V(INM))/${imaxText})}`,
      `RP PL 0 ${formatValue(rp, element, "gainBandwidth")}`,
      `CP PL 0 ${formatValue(cp, element, "gainBandwidth")}`,
      // Rail clamp on the pole node itself. N = 0.05 keeps the clamp's own forward drop to ~30 mV
      // even at the full slew current, so the output saturates at Vsat rather than a diode above it.
      `DHI PL VHI ${clampModel}`,
      `VHI VHI 0 DC ${vsatText}`,
      `DLO VLO PL ${clampModel}`,
      `VLO VLO 0 DC -${vsatText}`,
      `.MODEL ${clampModel} D (IS=1e-14 N=0.05)`,
      // Unity buffer isolating the pole from the load; E takes both control nodes, PL and 0.
      "EBUF INT 0 PL 0 1",
      `ROUT INT OUT ${formatValue(rout, element, "outputResistance")}`,
      `.ENDS ${macroName}`,
    ],
  };
}

/**
 * Whether a `.tran` over this circuit has to carry `uic`, because at least one op-amp's only
 * feedback path back to its inverting input is capacitive — the ideal-integrator topology.
 *
 * Such a stage has no DC feedback at all: the capacitor is an open circuit at the operating point,
 * so the inverting node floats up to whatever the input network sets, the differential input is a
 * volt or more, and ngspice's `.op` legitimately parks the output on a rail. Handing that bias
 * point to the transient as its initial state starts the integrator already saturated with the
 * feedback capacitor pre-charged, and the ramp never appears. `uic` starts every node at 0 V
 * instead — an uncharged capacitor and an output at rest, which is the initial condition the
 * closed-form V(t) = −(1/RC)∫V_in dt is derived under.
 *
 * Deliberately narrow: an op-amp whose feedback also includes a resistor has a well-defined bias
 * point and keeps ngspice's own `.op`, as does an op-amp-free RC circuit.
 */
export function requiresTransientInitialConditions(
  components: SpiceComponent[]
): boolean {
  const opAmps = components.filter(
    (component): component is SpiceOpAmp => component.kind === "opamp"
  );
  if (opAmps.length === 0) return false;

  return opAmps.some(opAmp => {
    const spans = (kind: "capacitor" | "resistor") =>
      components.some(
        component =>
          component.kind === kind &&
          ((component.positive === opAmp.out &&
            component.negative === opAmp.inInverting) ||
            (component.negative === opAmp.out &&
              component.positive === opAmp.inInverting))
      );
    return spans("capacitor") && !spans("resistor");
  });
}

/**
 * The `.SUBCKT` an element expands into, or `undefined` when it maps to native SPICE elements.
 * `name` is the already-uniqued element name, which per-device macros key off so two motors with
 * different parameters cannot collide on one card.
 */
function macroFor(
  element: SpiceElement,
  name: string,
  mode: SimulationMode
): SpiceMacro | undefined {
  const academic = mode === "academic";
  switch (element.kind) {
    case "scr":
      // Two-transistor latch in both modes: the PNP collector drives the NPN base and vice versa,
      // so gate injection regenerates until the anode current holds it on. An ideal gate-controlled
      // switch was tried for Academic mode (no holding current, no leakage, closes the instant
      // V(gate, cathode) crosses a threshold) but its own control voltage collapses to 0 V the
      // instant it closes, which ngspice's transient solver cannot step through — verified against
      // ngspice.wasm directly: it drives the timestep to the simulator's floor and aborts the run.
      // The latch also regenerates correctly under `.tran`, so nothing textbook is lost.
      return {
        name: "SCR_STD",
        lines: [
          ".SUBCKT SCR_STD A G K",
          "Q1 G N1 A PNP_SCR",
          "Q2 N1 G K NPN_SCR",
          `RGK G K ${THYRISTOR_GATE_SHUNT}`,
          `RAG A N1 ${THYRISTOR_ANODE_SHUNT}`,
          ...LATCH_MODELS("SCR"),
          ".ENDS SCR_STD",
        ],
      };

    case "triac":
      // Two anti-parallel SCR latches sharing one gate, so it conducts in either direction, in
      // both modes — an ideal anti-parallel switch pair was tried for Academic mode but hits the
      // same control-voltage collapse as the SCR's ideal switch above.
      return {
        name: "TRIAC_STD",
        lines: [
          ".SUBCKT TRIAC_STD MT1 G MT2",
          "QA1 G NA MT2 PNP_TRIAC",
          "QA2 NA G MT1 NPN_TRIAC",
          "QB1 G NB MT1 PNP_TRIAC",
          "QB2 NB G MT2 NPN_TRIAC",
          `RG1 G MT1 ${THYRISTOR_GATE_SHUNT}`,
          `RG2 G MT2 ${THYRISTOR_GATE_SHUNT}`,
          `RA1 MT2 NA ${THYRISTOR_ANODE_SHUNT}`,
          `RA2 MT1 NB ${THYRISTOR_ANODE_SHUNT}`,
          ...LATCH_MODELS("TRIAC"),
          ".ENDS TRIAC_STD",
        ],
      };

    case "diac": {
      formatValue(element.breakoverVoltage, element, "breakoverVoltage");
      // Anti-series breakdown diodes: one blocks until avalanche while the other conducts
      // forward, so the pair breaks over symmetrically. The forward drop is subtracted from BV so
      // the pair as a whole breaks over at the quoted voltage.
      const breakdown = Math.max(0.1, element.breakoverVoltage - 0.7);
      const token = modelToken(element.breakoverVoltage);
      const macroName = `DIAC_${token}`;
      return {
        name: macroName,
        lines: [
          `.SUBCKT ${macroName} A1 A2`,
          `D1 NM A1 DMOD_${token}`,
          `D2 NM A2 DMOD_${token}`,
          `.MODEL DMOD_${token} D (IS=1e-14 N=1 BV=${breakdown} IBV=0.001)`,
          `.ENDS ${macroName}`,
        ],
      };
    }

    case "dc-motor": {
      // Academic: armature inductance and rotor inertia collapse to near-zero, so the electrical
      // and mechanical time constants vanish and `.op`/`.tran` land straight on the steady-state
      // point instead of settling through a startup transient.
      const armatureInductance = academic ? 1e-9 : element.armatureInductance;
      const inertia = academic ? 1e-12 : element.inertia;
      for (const [field, value] of [
        ["armatureResistance", element.armatureResistance],
        ["armatureInductance", armatureInductance],
        ["backEmfConstant", element.backEmfConstant],
        ["torqueConstant", element.torqueConstant],
        ["inertia", inertia],
        ["viscousFriction", element.viscousFriction],
      ] as const) {
        formatValue(value, element, field);
      }
      const load = formatValue(element.loadTorque ?? 0, element, "loadTorque");
      // Mechanical side as an electrical analogue on node SPD, whose voltage is shaft speed in
      // rad/s: torque drives current in, inertia is a capacitance, viscous friction a conductance.
      // A zero-friction machine would be an open circuit, so it is floored to a huge resistance.
      const damping =
        element.viscousFriction > 0 ? 1 / element.viscousFriction : 1e12;
      const macroName = `MOTOR_${name}`;
      return {
        name: macroName,
        lines: [
          `.SUBCKT ${macroName} P N`,
          `RA P NA ${formatValue(element.armatureResistance, element, "armatureResistance")}`,
          `LA NA NB ${formatValue(armatureInductance, element, "armatureInductance")}`,
          "VSENSE NB NC DC 0",
          `BEMF NC N V={${formatValue(element.backEmfConstant, element, "backEmfConstant")}*V(SPD)}`,
          `BTRQ 0 SPD I={${formatValue(element.torqueConstant, element, "torqueConstant")}*I(VSENSE)-${load}}`,
          `CJ SPD 0 ${formatValue(inertia, element, "inertia")}`,
          `RB SPD 0 ${formatValue(damping, element, "viscousFriction")}`,
          `.ENDS ${macroName}`,
        ],
      };
    }

    case "opamp":
      return opAmpMacro(element, name);

    default:
      return undefined;
  }
}

/** Secondary inductance follows L ∝ N², so a ratio of n divides the primary by n². */
function scaleInductance(primary: number, ratio: number): number {
  return primary / (ratio * ratio);
}

/** Perfect coupling makes the inductance matrix singular, so k defaults just below 1. */
const DEFAULT_COUPLING = 0.999;
/**
 * Coupling coefficient and magnetizing-inductance baseline forced in Academic mode: tight enough
 * coupling and large enough inductance that the magnetizing branch draws no appreciable current,
 * leaving an ideal transformer.
 */
const ACADEMIC_COUPLING = 0.999999;
const ACADEMIC_MAGNETIZING_INDUCTANCE = 1e6;

function formatCoupling(
  component: Extract<
    SpiceMultiLine,
    { kind: "transformer" | "transformer-ct" | "autotransformer" }
  >,
  mode: SimulationMode
): string {
  if (mode === "academic") {
    return formatValue(ACADEMIC_COUPLING, component, "couplingCoefficient");
  }
  const coupling = component.couplingCoefficient ?? DEFAULT_COUPLING;
  if (!(coupling > 0) || coupling >= 1) {
    throw new NetlistError(
      `${component.kind} "${component.label}" needs a coupling coefficient in (0, 1), got ${coupling}.`
    );
  }
  return formatValue(coupling, component, "couplingCoefficient");
}

/** The primary (magnetizing) inductance actually emitted, overridden in Academic mode. */
function magnetizingInductance(
  component: Extract<
    SpiceMultiLine,
    { kind: "transformer" | "transformer-ct" | "autotransformer" }
  >,
  mode: SimulationMode
): number {
  return mode === "academic"
    ? ACADEMIC_MAGNETIZING_INDUCTANCE
    : component.primaryInductance;
}

/** Kinds that expand into more than one SPICE line. */
type SpiceMultiLine = Extract<
  SpiceElement,
  {
    kind:
      | "transformer"
      | "transformer-ct"
      | "autotransformer"
      | "switch-spst"
      | "switch-spdt"
      | "relay"
      | "contactor";
  }
>;

function singleElementLine(
  component: Exclude<SpiceElement, SpiceMultiLine>,
  name: string,
  nodeNames: string[],
  model: SpiceModel | undefined,
  macro: SpiceMacro | undefined,
  mode: SimulationMode
): string {
  const head = `${name} ${nodeNames.join(" ")}`;

  switch (component.kind) {
    case "resistor":
      return `${head} ${formatValue(component.resistance, component, "resistance")}`;

    case "capacitor": {
      const line = `${head} ${formatValue(component.capacitance, component, "capacitance")}`;
      return component.initialVoltage === undefined
        ? line
        : `${line} IC=${formatValue(component.initialVoltage, component, "initialVoltage")}`;
    }

    case "inductor": {
      const line = `${head} ${formatValue(component.inductance, component, "inductance")}`;
      return component.initialCurrent === undefined
        ? line
        : `${line} IC=${formatValue(component.initialCurrent, component, "initialCurrent")}`;
    }

    case "dc-voltage":
      return `${head} DC ${formatValue(component.voltage, component, "voltage")}`;

    case "ac-voltage": {
      // Emitted so one deck stays valid across .op, .ac and .tran: the DC value is the operating
      // point, AC <mag> <phase> feeds .ac, and SIN() feeds .tran.
      const offset = formatValue(
        component.dcOffset ?? 0,
        component,
        "dcOffset"
      );
      // Academic mode treats the quoted amplitude as an RMS value: AC/SIN() both want peak, so
      // scale up by sqrt(2) rather than reading it as already-peak, as Practical mode does.
      const rawAmplitude =
        mode === "academic"
          ? component.amplitude * Math.SQRT2
          : component.amplitude;
      const amplitude = formatValue(rawAmplitude, component, "amplitude");
      const phase = formatValue(
        component.phaseDegrees ?? 0,
        component,
        "phaseDegrees"
      );
      const line = `${head} DC ${offset} AC ${amplitude} ${phase}`;
      if (!(component.frequency > 0)) return line;
      const frequency = formatValue(
        component.frequency,
        component,
        "frequency"
      );
      const waveform = component.waveform ?? "sine";
      if (waveform === "sine") {
        // SIN()'s sixth argument is phase in degrees; without it .tran silently drops the source's phase.
        const sinePhase = component.phaseDegrees ? ` 0 0 ${phase}` : "";
        return `${line} SIN(${offset} ${amplitude} ${frequency}${sinePhase})`;
      }
      const pulse = pulseParameters(
        waveform,
        rawAmplitude,
        component.dcOffset ?? 0,
        component.frequency,
        component.phaseDegrees ?? 0
      );
      const v1 = formatValue(pulse.v1, component, "waveform");
      const v2 = formatValue(pulse.v2, component, "waveform");
      const td = formatValue(pulse.td, component, "waveform");
      const tr = formatValue(pulse.tr, component, "waveform");
      const tf = formatValue(pulse.tf, component, "waveform");
      const pw = formatValue(pulse.pw, component, "waveform");
      const per = formatValue(pulse.per, component, "waveform");
      return `${line} PULSE(${v1} ${v2} ${td} ${tr} ${tf} ${pw} ${per})`;
    }

    case "dc-current":
      return `${head} DC ${formatValue(component.current, component, "current")}`;

    case "ac-current": {
      // Same DC/AC/transient triple-duty as ac-voltage above, on SPICE's `I` element instead of `V`
      // — same reasoning throughout, just amps instead of volts.
      const offset = formatValue(
        component.dcOffset ?? 0,
        component,
        "dcOffset"
      );
      const rawAmplitude =
        mode === "academic"
          ? component.amplitude * Math.SQRT2
          : component.amplitude;
      const amplitude = formatValue(rawAmplitude, component, "amplitude");
      const phase = formatValue(
        component.phaseDegrees ?? 0,
        component,
        "phaseDegrees"
      );
      const line = `${head} DC ${offset} AC ${amplitude} ${phase}`;
      if (!(component.frequency > 0)) return line;
      const frequency = formatValue(
        component.frequency,
        component,
        "frequency"
      );
      const waveform = component.waveform ?? "sine";
      if (waveform === "sine") {
        const sinePhase = component.phaseDegrees ? ` 0 0 ${phase}` : "";
        return `${line} SIN(${offset} ${amplitude} ${frequency}${sinePhase})`;
      }
      const pulse = pulseParameters(
        waveform,
        rawAmplitude,
        component.dcOffset ?? 0,
        component.frequency,
        component.phaseDegrees ?? 0
      );
      const v1 = formatValue(pulse.v1, component, "waveform");
      const v2 = formatValue(pulse.v2, component, "waveform");
      const td = formatValue(pulse.td, component, "waveform");
      const tr = formatValue(pulse.tr, component, "waveform");
      const tf = formatValue(pulse.tf, component, "waveform");
      const pw = formatValue(pulse.pw, component, "waveform");
      const per = formatValue(pulse.per, component, "waveform");
      return `${line} PULSE(${v1} ${v2} ${td} ${tr} ${tf} ${pw} ${per})`;
    }

    // Semiconductors are a name, their nodes, then the generated model they reference. The node
    // order — D anode/cathode, Q C/B/E, M D/G/S/B, J D/G/S — comes from `elementNets`.
    case "diode":
    case "bjt":
    case "mosfet":
    case "jfet": {
      if (!model) {
        throw new NetlistError(
          `${component.kind} "${component.label}" has no SPICE model card.`
        );
      }
      return `${head} ${model.name}`;
    }

    // Parts ngspice has no native model for: an X instance pointing at the generated .SUBCKT.
    case "scr":
    case "diac":
    case "triac":
    case "dc-motor":
    case "opamp": {
      if (!macro) {
        throw new NetlistError(
          `${component.kind} "${component.label}" has no SPICE subcircuit.`
        );
      }
      return `${head} ${macro.name}`;
    }
  }
}

/** SPICE's native G (giga) numeric suffix — 1e9 Ω, effectively an open circuit. */
const BURNED_OUT_RESISTANCE = "1G";

/**
 * A burned-out component emits no model/element line of its own; every node it would normally
 * touch is instead chained through 1 GΩ resistors (rather than just its first two nodes), so a
 * burned three-plus-terminal part — a transistor, say — is fully isolated on every leg without
 * leaving any node floating for `floatingGroundTies` to trip over.
 */
function burnedOutLines(name: string, nodeNames: string[]): string[] {
  const uniqueNodes = Array.from(new Set(nodeNames));
  const lines = ["* COMPONENT BURNED OUT"];
  for (let i = 1; i < uniqueNodes.length; i++) {
    const suffix = uniqueNodes.length > 2 ? `_${i}` : "";
    lines.push(
      `R_blown_${name}${suffix} ${uniqueNodes[0]} ${uniqueNodes[i]} ${BURNED_OUT_RESISTANCE}`
    );
  }
  return lines;
}

/**
 * The lines an element expands into. Most produce exactly one; transformers produce one `L` per
 * winding plus the `K` directives that couple them, so they are handled here rather than as a
 * `.SUBCKT` — SPICE couples native inductors directly.
 */
function elementLines(
  component: SpiceElement,
  name: string,
  nodes: SpiceNodeMap,
  model: SpiceModel | undefined,
  macro: SpiceMacro | undefined,
  mode: SimulationMode
): string[] {
  const nodeNames = elementNets(component).map(net => nodes.nameFor(net));

  switch (component.kind) {
    case "transformer": {
      const [
        primaryPositive,
        primaryNegative,
        secondaryPositive,
        secondaryNegative,
      ] = nodeNames;
      const primaryInductance = magnetizingInductance(component, mode);
      const primary = formatValue(
        primaryInductance,
        component,
        "primaryInductance"
      );
      const secondary = formatValue(
        scaleInductance(primaryInductance, component.turnsRatio),
        component,
        "turnsRatio"
      );
      const coupling = formatCoupling(component, mode);
      return [
        `L${name}P ${primaryPositive} ${primaryNegative} ${primary}`,
        `L${name}S ${secondaryPositive} ${secondaryNegative} ${secondary}`,
        `K${name} L${name}P L${name}S ${coupling}`,
      ];
    }

    case "transformer-ct": {
      const [
        primaryPositive,
        primaryNegative,
        secondaryPositive,
        centerTap,
        secondaryNegative,
      ] = nodeNames;
      const primaryInductance = magnetizingInductance(component, mode);
      const primary = formatValue(
        primaryInductance,
        component,
        "primaryInductance"
      );
      // Each half carries half the secondary turns, so it sees twice the effective ratio.
      const half = formatValue(
        scaleInductance(primaryInductance, component.turnsRatio * 2),
        component,
        "turnsRatio"
      );
      const coupling = formatCoupling(component, mode);
      // ngspice's K directive couples exactly two inductors, so three windings need three lines.
      return [
        `L${name}P ${primaryPositive} ${primaryNegative} ${primary}`,
        `L${name}A ${secondaryPositive} ${centerTap} ${half}`,
        `L${name}B ${centerTap} ${secondaryNegative} ${half}`,
        `K${name}PA L${name}P L${name}A ${coupling}`,
        `K${name}PB L${name}P L${name}B ${coupling}`,
        `K${name}AB L${name}A L${name}B ${coupling}`,
      ];
    }

    case "autotransformer": {
      const [input, tap, common] = nodeNames;
      // One winding, tapped: the output section spans tap-to-common and carries 1/n of the turns,
      // leaving (1 - 1/n) on the series section. L scales with the square of each fraction.
      const outputTurns = 1 / component.turnsRatio;
      const seriesTurns = 1 - outputTurns;
      if (!(seriesTurns > 0)) {
        throw new NetlistError(
          `Autotransformer "${component.label}" needs a turns ratio above 1, got ${component.turnsRatio}.`
        );
      }
      const primaryInductance = magnetizingInductance(component, mode);
      const series = formatValue(
        primaryInductance * seriesTurns * seriesTurns,
        component,
        "primaryInductance"
      );
      const output = formatValue(
        primaryInductance * outputTurns * outputTurns,
        component,
        "primaryInductance"
      );
      const coupling = formatCoupling(component, mode);
      return [
        `L${name}A ${input} ${tap} ${series}`,
        `L${name}B ${tap} ${common} ${output}`,
        `K${name} L${name}A L${name}B ${coupling}`,
      ];
    }

    // A closed manual contact is a plain resistor (the canvas rebuilds the whole deck on every edit,
    // so nothing needs a live control source mid-solve). An open one is an air gap and emits nothing:
    // any finite resistance, even 1e12 Ω, is still a DC path, and a downstream diode's log law turns
    // its picoamps into hundreds of millivolts on an unloaded probe. Omitting the branch makes an open
    // contact identical to deleting the part; `floatingGroundTies` references whatever it isolates.
    case "switch-spst": {
      if (!component.isClosed) return [];
      return [
        `${name} ${nodes.nameFor(component.a)} ${nodes.nameFor(component.b)} ${manualContactOnResistance(mode)}`,
      ];
    }

    case "switch-spdt": {
      // Only the live throw conducts; `open` (break-before-make) emits neither.
      const live =
        component.position === "a"
          ? { suffix: "A", net: component.a }
          : component.position === "b"
            ? { suffix: "B", net: component.b }
            : undefined;
      if (!live) return [];
      return [
        `${name}${live.suffix} ${nodes.nameFor(component.common)} ${nodes.nameFor(live.net)} ${manualContactOnResistance(mode)}`,
      ];
    }

    case "relay":
    case "contactor": {
      const coilPositive = nodes.nameFor(component.coilPositive);
      const coilNegative = nodes.nameFor(component.coilNegative);
      const midpoint = `${name}COIL`;
      const models = coilModelNames(component, mode);
      // Academic: zero coil inductance, so the armature snaps instantly at the threshold voltage
      // instead of ramping through a real coil's L/R pull-in delay.
      const coilInductance = mode === "academic" ? 0 : component.coilInductance;
      // R and L in series across the coil terminals; the contacts sense the whole coil voltage, so
      // the inductance also gives them their pull-in and release delay.
      const lines = [
        `R${midpoint} ${coilPositive} ${midpoint} ${formatValue(component.coilResistance, component, "coilResistance")}`,
        `L${midpoint} ${midpoint} ${coilNegative} ${formatValue(coilInductance, component, "coilInductance")}`,
      ];

      // A normally-closed contact is the same model with a negated threshold, driven from the coil
      // in reverse, so it conducts until the coil pulls in.
      const contact = (
        suffix: string,
        from: SpiceNet,
        to: SpiceNet,
        normallyOpen: boolean
      ) =>
        normallyOpen
          ? `${name}${suffix} ${nodes.nameFor(from)} ${nodes.nameFor(to)} ${coilPositive} ${coilNegative} ${models.normallyOpen}`
          : `${name}${suffix} ${nodes.nameFor(from)} ${nodes.nameFor(to)} ${coilNegative} ${coilPositive} ${models.normallyClosed}`;

      if (component.kind === "relay") {
        if (component.normallyOpen !== undefined) {
          lines.push(
            contact("NO", component.common, component.normallyOpen, true)
          );
        }
        if (component.normallyClosed !== undefined) {
          lines.push(
            contact("NC", component.common, component.normallyClosed, false)
          );
        }
        if (lines.length === 2) {
          throw new NetlistError(
            `Relay "${component.label}" has no contacts; give it a normally-open or normally-closed net.`
          );
        }
        return lines;
      }

      component.poles.forEach((pole, index) => {
        lines.push(contact(`P${index + 1}`, pole.line, pole.load, true));
      });
      if (component.auxNormallyOpen) {
        lines.push(
          contact(
            "AUXNO",
            component.auxNormallyOpen.line,
            component.auxNormallyOpen.load,
            true
          )
        );
      }
      if (component.auxNormallyClosed) {
        lines.push(
          contact(
            "AUXNC",
            component.auxNormallyClosed.line,
            component.auxNormallyClosed.load,
            false
          )
        );
      }
      if (lines.length === 2) {
        throw new NetlistError(
          `Contactor "${component.label}" has no contacts; give it at least one pole.`
        );
      }
      return lines;
    }

    default:
      return [
        singleElementLine(component, name, nodeNames, model, macro, mode),
      ];
  }
}

/**
 * Builds a runnable SPICE deck. Element order follows the input; `.op` is appended unless the
 * caller asks for other analyses.
 */
export function generateNetlist(
  components: SpiceComponent[],
  options: GenerateNetlistOptions = {}
): string {
  const elements = components.filter(isSpiceElement);
  if (elements.length === 0) {
    throw new NetlistError(
      "Cannot build a netlist: the circuit has no components."
    );
  }

  const mode: SimulationMode = options.simulationMode ?? "practical";

  const nodes = buildSpiceNodeMap(components);
  const hasGround =
    components.some(component => component.kind === "ground") ||
    elements.some(element =>
      elementNets(element).some(net => nodes.nameFor(net) === SPICE_GROUND)
    );
  if (!hasGround) {
    throw new NetlistError(
      "Cannot build a netlist: the circuit has no ground reference. Place a ground component."
    );
  }

  const used = new Set<string>();
  // ngspice needs a semiconductor's .MODEL to exist before the element references it, so cards are
  // collected while walking the elements and emitted ahead of them. Keyed by name to de-duplicate:
  // ten standard diodes share one D_STD card, but two zeners of different Vz get one card each.
  const models = new Map<string, string>();
  const modelCards: string[] = [];
  // .SUBCKT blocks for parts with no native ngspice model. De-duplicated by name, so every SCR
  // shares one SCR_STD while each motor, keyed off its unique element name, gets its own.
  const macros = new Set<string>();
  const macroBlocks: string[] = [];

  const lines = elements.flatMap((element, index) => {
    const prefix = SPICE_PREFIXES[element.kind];
    let name = sanitizeLabel(element.label, prefix, index + 1);
    // Two canvas components can carry the same label; SPICE requires unique element names.
    for (let suffix = 2; used.has(name.toUpperCase()); suffix += 1) {
      name = `${sanitizeLabel(element.label, prefix, index + 1)}_${suffix}`;
    }
    used.add(name.toUpperCase());

    if (element.isBurned) {
      const emitted = burnedOutLines(
        name,
        elementNets(element).map(net => nodes.nameFor(net))
      );
      for (const line of emitted) used.add(line.split(" ")[0].toUpperCase());
      return emitted;
    }

    const model = modelFor(element, mode);
    for (const card of modelsFor(element, mode)) {
      if (models.has(card.name)) continue;
      models.set(card.name, card.card);
      modelCards.push(card.card);
    }

    const macro = macroFor(element, name, mode);
    if (macro && !macros.has(macro.name)) {
      macros.add(macro.name);
      macroBlocks.push(...macro.lines);
    }

    const emitted = elementLines(element, name, nodes, model, macro, mode);
    // Transformers derive L and K names from their root; reserve those too so a later element
    // cannot sanitize into the same identifier.
    for (const line of emitted) used.add(line.split(" ")[0].toUpperCase());
    return emitted;
  });

  // Only open manual contacts emit nothing, so this is a circuit made entirely of open switches.
  if (lines.length === 0) {
    throw new NetlistError(
      "Cannot build a netlist: nothing conducts — every contact in the circuit is open."
    );
  }

  const groundTies = floatingGroundTies(elements, nodes, used);
  const analysis = options.analysis?.length ? options.analysis : [".op"];

  // See GenerateNetlistOptions.initialNodeVoltages: one `.IC` line seeding every requested net's
  // starting voltage, skipping nets this deck never actually mapped and ground itself (`.IC` cannot
  // set node 0, and it is 0 by definition anyway).
  const initialConditions = Array.from(options.initialNodeVoltages ?? [])
    .filter(([net]) => nodes.isMapped(net) && nodes.nameFor(net) !== SPICE_GROUND)
    .map(([net, voltage]) => `V(${nodes.nameFor(net)})=${voltage}`);

  // The first line of a SPICE deck is the title and is always discarded by the parser.
  const netlist = [
    options.title ?? "MAE Academy circuit",
    ...modelCards,
    ...macroBlocks,
    ...lines,
    ...groundTies,
    ...(initialConditions.length ? [`.IC ${initialConditions.join(" ")}`] : []),
    ...analysis,
    ".end",
    "",
  ].join("\n");
  if (options.initialNodeVoltages && options.initialNodeVoltages.size > 0) {
    console.log("Initial node voltages provided:", Array.from(options.initialNodeVoltages));
  }
  const s1OpenAnnotation = components.some(c => c.kind === "switch-spst" && !c.isClosed)
    ? "* S1 open: RS1 n1 n2 1e9 (open contact omitted from deck)\n"
    : "";
  console.log("Generated netlist:\n" + s1OpenAnnotation + netlist);
  return netlist;
}

/* ------------------------------------------------------------------------ Floating subnets --- */

/**
 * The resistor tying a DC-floating subnet to ground. Such a subnet has, by construction, no DC path
 * to any source, so no current flows through it and its value only has to make the matrix
 * non-singular; 1e12 Ω also keeps an AC-coupled floating node's corner far below any frequency the
 * canvas simulates.
 */
const FLOATING_GROUND_TIE = 1e12;

/** The nets an element's emitted lines actually reference. Open manual contacts reference none. */
function emittedNets(element: SpiceElement): SpiceNet[] {
  switch (element.kind) {
    case "switch-spst":
      return element.isClosed ? [element.a, element.b] : [];
    case "switch-spdt":
      return element.position === "a"
        ? [element.common, element.a]
        : element.position === "b"
          ? [element.common, element.b]
          : [];
    default:
      return elementNets(element);
  }
}

/**
 * The net pairs an element joins at DC. Every junction counts, because ngspice places GMIN across
 * it; a capacitor and a MOSFET's insulated gate join nothing. Over-reporting a link is safe here —
 * it can only skip a ground tie ngspice would otherwise have needed — so each case follows the
 * element's actual lines (see `elementLines` / `macroFor`) rather than guessing.
 */
function dcLinks(element: SpiceElement): Array<[SpiceNet, SpiceNet]> {
  switch (element.kind) {
    case "resistor":
    case "inductor":
    case "dc-voltage":
    case "ac-voltage":
    case "dc-current":
    case "ac-current":
    case "dc-motor":
      return [[element.positive, element.negative]];
    case "capacitor":
      return [];
    case "diode":
      return [[element.anode, element.cathode]];
    case "bjt":
      return [
        [element.collector, element.base],
        [element.base, element.emitter],
      ];
    case "mosfet": {
      // Drain and source reach the body through its junction diodes; the gate is insulated.
      const bulk = element.bulk ?? element.source;
      return [
        [element.drain, bulk],
        [element.source, bulk],
      ];
    }
    case "jfet":
      return [
        [element.gate, element.drain],
        [element.gate, element.source],
      ];
    case "scr":
      return [
        [element.anode, element.gate],
        [element.gate, element.cathode],
      ];
    case "diac":
      return [[element.a1, element.a2]];
    case "triac":
      return [
        [element.mt1, element.gate],
        [element.gate, element.mt2],
      ];
    case "opamp":
      return [[element.inNonInverting, element.inInverting]];
    case "transformer":
      return [
        [element.primaryPositive, element.primaryNegative],
        [element.secondaryPositive, element.secondaryNegative],
      ];
    case "transformer-ct":
      return [
        [element.primaryPositive, element.primaryNegative],
        [element.secondaryPositive, element.centerTap],
        [element.centerTap, element.secondaryNegative],
      ];
    case "autotransformer":
      return [
        [element.input, element.tap],
        [element.tap, element.common],
      ];
    case "switch-spst":
    case "switch-spdt": {
      const [first, second] = emittedNets(element);
      return first !== undefined && second !== undefined ? [[first, second]] : [];
    }
    // A coil is a series R-L; every coil-driven contact is a SW element, which always has a finite
    // RON or ROFF between its terminals.
    case "relay": {
      const links: Array<[SpiceNet, SpiceNet]> = [
        [element.coilPositive, element.coilNegative],
      ];
      for (const contact of [element.normallyOpen, element.normallyClosed]) {
        if (contact !== undefined) links.push([element.common, contact]);
      }
      return links;
    }
    case "contactor": {
      const links: Array<[SpiceNet, SpiceNet]> = [
        [element.coilPositive, element.coilNegative],
      ];
      for (const pole of element.poles) links.push([pole.line, pole.load]);
      for (const aux of [element.auxNormallyOpen, element.auxNormallyClosed]) {
        if (aux) links.push([aux.line, aux.load]);
      }
      return links;
    }
  }
}

/**
 * Resistor lines tying each DC-floating subnet to ground. An open manual contact (see
 * `elementLines`) can cut a subnet off from every source and from ground — the node between an open
 * switch and a capacitor, say, or a resistor left dangling behind one. ngspice's operating point is
 * singular there (verified: "singular matrix: check node …"); it usually recovers through gmin
 * stepping, but only after the warnings and only by luck of its heuristics. A subnet with no path
 * to any source sits at 0 V, so tying one node of it to ground states that outright.
 */
function floatingGroundTies(
  elements: SpiceElement[],
  nodes: SpiceNodeMap,
  used: Set<string>
): string[] {
  const parent = new Map<string, string>();
  // First-encounter order keeps the emitted tie lines deterministic for a given deck.
  const order: string[] = [];
  const find = (node: string): string => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(node, root);
    return root;
  };
  const touch = (node: string) => {
    if (parent.has(node)) return;
    parent.set(node, node);
    order.push(node);
  };

  touch(SPICE_GROUND);
  for (const element of elements) {
    for (const net of emittedNets(element)) touch(nodes.nameFor(net));
    for (const [a, b] of dcLinks(element)) {
      const first = nodes.nameFor(a);
      const second = nodes.nameFor(b);
      touch(first);
      touch(second);
      const rootA = find(first);
      const rootB = find(second);
      if (rootA !== rootB) parent.set(rootA, rootB);
    }
  }

  const groundRoot = find(SPICE_GROUND);
  const tiedRoots = new Set<string>();
  const ties: string[] = [];
  for (const node of order) {
    const root = find(node);
    if (root === groundRoot || tiedRoots.has(root)) continue;
    tiedRoots.add(root);
    let name = `RFLOAT${ties.length + 1}`;
    for (let suffix = 2; used.has(name.toUpperCase()); suffix += 1) {
      name = `RFLOAT${ties.length + 1}_${suffix}`;
    }
    used.add(name.toUpperCase());
    ties.push(`${name} ${node} ${SPICE_GROUND} ${FLOATING_GROUND_TIE}`);
  }
  return ties;
}
