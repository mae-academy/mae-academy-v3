/** Turns netlist-ready SPICE components into a deck ngspice can run in batch mode. */

import {
  elementNets,
  isSpiceElement,
  SPICE_GROUND,
  SPICE_PREFIXES,
  type SpiceComponent,
  type SpiceNet,
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

/**
 * Convergence aids for a stiff switch/diode network: a switch's ROFF leakage feeding straight into
 * a diode's exponential knee is exactly the kind of near-singular Jacobian that strands
 * Newton-Raphson at the default tolerances. GMIN adds a minimum conductance to every PN junction so
 * an open branch never looks perfectly singular; the loosened ABSTOL/RELTOL and raised DC/transient
 * iteration caps (ITL1/ITL4) give the solver room to actually reach them.
 */
const CONVERGENCE_OPTIONS =
  ".OPTIONS GMIN=1e-12 ABSTOL=1e-12 RELTOL=0.005 ITL1=100 ITL4=100";

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

/** A generated `.MODEL` card. Cards are de-duplicated by name before being emitted. */
interface SpiceModel {
  name: string;
  card: string;
}

/**
 * Emission coefficient for Academic mode's idealized diode/LED junction. Low enough to keep the
 * textbook ~0.7 V knee sharp; not the previous 0.001, whose near-vertical I-V curve is a
 * non-differentiable step that strands Newton-Raphson (a "Did Not Converge" error) the moment an
 * open switch's ROFF leakage puts the junction anywhere near it.
 */
const ACADEMIC_IDEAL_JUNCTION_N = 0.05;

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
          // Academic: a near switch-like junction — N low enough to keep the ~0.7 V textbook knee
          // sharp, but not so low (was 0.001) that the I-V curve is a true step: that non-
          // differentiable corner is exactly what stalls Newton-Raphson on an open-switch branch.
          return academic
            ? {
                name: "D_STD",
                card: `.MODEL D_STD D (IS=1e-14 RS=0 N=${ACADEMIC_IDEAL_JUNCTION_N})`,
              }
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
            // Near switch-like junction, same rationale (and N) as the standard diode; the fitted
            // forward-voltage knee is a Practical-mode concern.
            return {
              name,
              card: `.MODEL ${name} D (IS=1e-14 N=${ACADEMIC_IDEAL_JUNCTION_N} RS=0)`,
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
 * Contact resistances shared by every switch model. Note the model type is `SW` with VT/VH, not
 * PSPICE's `VSWITCH` with VON/VOFF: this ngspice build fails to parse a `VSWITCH` model card, and
 * feeding VON/VOFF to `SW` aborts the process outright.
 *
 * Academic mode drives RON down to a near-zero ideal contact; ROFF is untouched by either mode — a
 * strict 1e9 Ω (1 GΩ) open-contact resistance for every switch and relay, so an "open" contact still
 * leaves a (negligible) conductive path rather than a fully disconnected sub-circuit and a singular
 * matrix.
 */
function switchResistances(mode: SimulationMode): string {
  return mode === "academic" ? "RON=1e-6 ROFF=1e9" : "RON=0.001 ROFF=1e9";
}

/** Model for a manually operated contact, driven by a 1 V / 0 V dummy source. */
const MANUAL_SWITCH_MODEL = "SW_MANUAL";
function manualSwitchCard(mode: SimulationMode): string {
  return `.MODEL ${MANUAL_SWITCH_MODEL} SW (VT=0.5 VH=0 ${switchResistances(mode)})`;
}

/** Control level a closed manual contact is driven to; open contacts get 0 V. */
const MANUAL_SWITCH_CLOSED = 1;

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
    case "switch-spst":
    case "switch-spdt":
      return [{ name: MANUAL_SWITCH_MODEL, card: manualSwitchCard(mode) }];

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

/**
 * Ideal gate-controlled switch the Academic-mode thyristor macros share: RON/ROFF give a near-zero
 * on-resistance and, per the zero-leakage requirement, a near-infinite off-resistance. VH=0 drops
 * the real device's latching hysteresis in favor of a single, textbook trigger threshold.
 */
const THYRISTOR_ACADEMIC_SWITCH_MODEL = "SW (VT=0.5 VH=0 RON=1e-6 ROFF=1e12)";

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
      // Academic: the 2-BJT regenerative latch collapses to a single ideal gate-controlled switch —
      // no holding current, no leakage, closes the moment V(gate, cathode) crosses the threshold.
      if (academic) {
        return {
          name: "SCR_STD_ACADEMIC",
          lines: [
            ".SUBCKT SCR_STD_ACADEMIC A G K",
            "S1 A K G K SW_SCR_ACADEMIC",
            `.MODEL SW_SCR_ACADEMIC ${THYRISTOR_ACADEMIC_SWITCH_MODEL}`,
            ".ENDS SCR_STD_ACADEMIC",
          ],
        };
      }
      // Two-transistor latch: the PNP collector drives the NPN base and vice versa, so gate
      // injection regenerates until the anode current holds it on.
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
      // Academic: two anti-parallel ideal switches sharing the gate, each firing off the gate
      // voltage measured against whichever main terminal it currently blocks from — the same
      // either-direction coverage as the two anti-parallel SCR latches, without the latch.
      if (academic) {
        return {
          name: "TRIAC_STD_ACADEMIC",
          lines: [
            ".SUBCKT TRIAC_STD_ACADEMIC MT1 G MT2",
            "SA MT1 MT2 G MT1 SW_TRIAC_ACADEMIC",
            "SB MT2 MT1 G MT2 SW_TRIAC_ACADEMIC",
            `.MODEL SW_TRIAC_ACADEMIC ${THYRISTOR_ACADEMIC_SWITCH_MODEL}`,
            ".ENDS TRIAC_STD_ACADEMIC",
          ],
        };
      }
      // Two anti-parallel SCR latches sharing one gate, so it conducts in either direction.
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
      // SIN()'s sixth argument is phase in degrees; without it .tran silently drops the source's phase.
      const sinePhase = component.phaseDegrees ? ` 0 0 ${phase}` : "";
      return `${line} SIN(${offset} ${amplitude} ${frequency}${sinePhase})`;
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
    case "dc-motor": {
      if (!macro) {
        throw new NetlistError(
          `${component.kind} "${component.label}" has no SPICE subcircuit.`
        );
      }
      return `${head} ${macro.name}`;
    }
  }
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

    // A manual contact is a dummy source at 1 V or 0 V driving a voltage-controlled switch, so the
    // canvas can flip it without the netlist changing shape.
    case "switch-spst": {
      const control = `${name}CTL`;
      const level = component.isClosed ? MANUAL_SWITCH_CLOSED : 0;
      return [
        `V${control} ${control} 0 DC ${level}`,
        `${name} ${nodes.nameFor(component.a)} ${nodes.nameFor(component.b)} ${control} 0 ${MANUAL_SWITCH_MODEL}`,
      ];
    }

    case "switch-spdt": {
      const common = nodes.nameFor(component.common);
      // Break-before-make: `open` drives both throws low rather than emitting neither switch, so
      // the element keeps the same shape in every position.
      const throws = [
        { suffix: "A", net: component.a, live: component.position === "a" },
        { suffix: "B", net: component.b, live: component.position === "b" },
      ];
      return throws.flatMap(({ suffix, net, live }) => {
        const control = `${name}CTL${suffix}`;
        return [
          `V${control} ${control} 0 DC ${live ? MANUAL_SWITCH_CLOSED : 0}`,
          `${name}${suffix} ${common} ${nodes.nameFor(net)} ${control} 0 ${MANUAL_SWITCH_MODEL}`,
        ];
      });
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

  const analysis = options.analysis?.length ? options.analysis : [".op"];

  // The first line of a SPICE deck is the title and is always discarded by the parser.
  return [
    options.title ?? "MAE Academy circuit",
    ...modelCards,
    ...macroBlocks,
    ...lines,
    CONVERGENCE_OPTIONS,
    ...analysis,
    ".end",
    "",
  ].join("\n");
}
