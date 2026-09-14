/**
 * SPICE-facing component model. These are the netlist-ready shapes: each one already carries the
 * nets it connects to, so they are one step removed from the canvas `CircuitComponent`, which
 * carries geometry and a loose `props` bag instead.
 */

/**
 * A net identifier as produced by the canvas topology pass — `'0'` for the ground net, otherwise an
 * opaque, UUID-bearing string such as `n:9f2c…:a`. Never emitted verbatim; `netlistGenerator` maps
 * these to SPICE-legal names.
 */
export type SpiceNet = string;

/** The SPICE reference node. Ground is a net, not an element. */
export const SPICE_GROUND: SpiceNet = "0";

interface SpiceElementBase {
  /** The originating `CircuitComponent.id`, kept so results can be traced back to the canvas. */
  id: string;
  /** The canvas label (`R1`, `V2`, …). The generator enforces the type-correct SPICE prefix. */
  label: string;
}

interface SpiceTwoTerminal extends SpiceElementBase {
  positive: SpiceNet;
  negative: SpiceNet;
}

/** Marks a net as the circuit's reference. Emits no element line; forces the net to `0`. */
export interface SpiceGround {
  kind: "ground";
  id: string;
  net: SpiceNet;
}

export interface SpiceResistor extends SpiceTwoTerminal {
  kind: "resistor";
  /** Ohms. */
  resistance: number;
}

export interface SpiceCapacitor extends SpiceTwoTerminal {
  kind: "capacitor";
  /** Farads. */
  capacitance: number;
  /** Initial voltage across the element, in volts, for transient analysis. */
  initialVoltage?: number;
}

export interface SpiceInductor extends SpiceTwoTerminal {
  kind: "inductor";
  /** Henries. */
  inductance: number;
  /** Initial current through the element, in amperes, for transient analysis. */
  initialCurrent?: number;
}

export interface SpiceDcVoltageSource extends SpiceTwoTerminal {
  kind: "dc-voltage";
  /** Volts. */
  voltage: number;
}

export interface SpiceDcCurrentSource extends SpiceTwoTerminal {
  kind: "dc-current";
  /** Amps, flowing from `positive` to `negative` inside the source (SPICE's own `I` convention). */
  current: number;
}

export interface SpiceAcCurrentSource extends SpiceTwoTerminal {
  kind: "ac-current";
  /** Peak amplitude in amps, used both as the AC magnitude and the SIN()/PULSE() amplitude. */
  amplitude: number;
  /** Hertz. Drives the emitted transient spec. */
  frequency: number;
  /** Degrees. SPICE's `AC <mag> <phase>` phase is always in degrees. */
  phaseDegrees?: number;
  /** Amps. Becomes the source's DC operating-point value and the SIN()/PULSE() offset. */
  dcOffset?: number;
  /** Same waveform menu as SpiceAcVoltageSource — see its own doc comment. */
  waveform?: "sine" | "square" | "triangle" | "sawtooth";
}

export interface SpiceAcVoltageSource extends SpiceTwoTerminal {
  kind: "ac-voltage";
  /** Peak amplitude in volts, used both as the AC magnitude and the SIN()/PULSE() amplitude. */
  amplitude: number;
  /** Hertz. Drives the emitted transient spec. */
  frequency: number;
  /** Degrees. SPICE's `AC <mag> <phase>` phase is always in degrees. */
  phaseDegrees?: number;
  /** Volts. Becomes the source's DC operating-point value and the SIN()/PULSE() offset. */
  dcOffset?: number;
  /**
   * Transient shape. `.AC` always sees a sinusoid (SPICE has no small-signal model for the others) —
   * this only changes what the `.tran` line emits. Defaults to "sine".
   */
  waveform?: "sine" | "square" | "triangle" | "sawtooth";
}

/* -------------------------------------------------------------------------- Semiconductors --- */

/**
 * Diode flavours the canvas exposes. They share SPICE's `D` element and the `D` model type; the
 * variant selects which generated `.MODEL` card the element references.
 */
export type SpiceDiodeVariant = "standard" | "zener" | "led" | "photodiode";

interface SpiceDiodeBase extends SpiceElementBase {
  kind: "diode";
  anode: SpiceNet;
  cathode: SpiceNet;
}

export interface SpiceStandardDiode extends SpiceDiodeBase {
  variant: "standard";
}

export interface SpiceZenerDiode extends SpiceDiodeBase {
  variant: "zener";
  /** Volts. Reverse breakdown; becomes the model's BV, so it cannot be shared across values. */
  breakdownVoltage: number;
}

export interface SpiceLed extends SpiceDiodeBase {
  variant: "led";
  /** Volts at 20 mA. Sets the model's saturation current, so it cannot be shared across values. */
  forwardVoltage: number;
}

export interface SpicePhotodiode extends SpiceDiodeBase {
  variant: "photodiode";
}

export type SpiceDiode =
  | SpiceStandardDiode
  | SpiceZenerDiode
  | SpiceLed
  | SpicePhotodiode;

export type SpiceBjtPolarity = "npn" | "pnp";

/** SPICE emits BJT nodes as collector, base, emitter — not the canvas terminal order. */
export interface SpiceBjt extends SpiceElementBase {
  kind: "bjt";
  polarity: SpiceBjtPolarity;
  collector: SpiceNet;
  base: SpiceNet;
  emitter: SpiceNet;
}

export type SpiceChannel = "n" | "p";

export interface SpiceMosfet extends SpiceElementBase {
  kind: "mosfet";
  channel: SpiceChannel;
  drain: SpiceNet;
  gate: SpiceNet;
  source: SpiceNet;
  /**
   * SPICE MOSFETs take a fourth bulk node; discrete parts tie it to the source, which is the
   * default when this is omitted.
   */
  bulk?: SpiceNet;
}

export interface SpiceJfet extends SpiceElementBase {
  kind: "jfet";
  channel: SpiceChannel;
  drain: SpiceNet;
  gate: SpiceNet;
  source: SpiceNet;
}

/* ------------------------------------------------------------------ Thyristors & machines --- */

/** Latching thyristor. ngspice has no native model; emitted as a two-transistor `.SUBCKT`. */
export interface SpiceScr extends SpiceElementBase {
  kind: "scr";
  anode: SpiceNet;
  gate: SpiceNet;
  cathode: SpiceNet;
}

/** Bidirectional trigger diode, emitted as an anti-series breakdown pair. */
export interface SpiceDiac extends SpiceElementBase {
  kind: "diac";
  a1: SpiceNet;
  a2: SpiceNet;
  /** Volts. Breakover threshold; a model parameter, so it gets its own macro per value. */
  breakoverVoltage: number;
}

/** Bidirectional thyristor, emitted as two anti-parallel SCR latches. */
export interface SpiceTriac extends SpiceElementBase {
  kind: "triac";
  mt1: SpiceNet;
  gate: SpiceNet;
  mt2: SpiceNet;
}

interface SpiceMagneticBase extends SpiceElementBase {
  /** Primary-to-secondary turns ratio Np:Ns. Inductance scales with its square. */
  turnsRatio: number;
  /** Henries. Magnetising inductance of the primary; the secondary is derived from it. */
  primaryInductance: number;
  /** 0 to 1. Defaults to 0.999 — tight but not perfect, which keeps the matrix solvable. */
  couplingCoefficient?: number;
}

/** Two coupled windings. Emitted as native `L` elements plus a `K` directive, not a `.SUBCKT`. */
export interface SpiceTransformer extends SpiceMagneticBase {
  kind: "transformer";
  primaryPositive: SpiceNet;
  primaryNegative: SpiceNet;
  secondaryPositive: SpiceNet;
  secondaryNegative: SpiceNet;
}

/** Secondary split into two halves about a centre tap; all three windings couple pairwise. */
export interface SpiceCenterTappedTransformer extends SpiceMagneticBase {
  kind: "transformer-ct";
  primaryPositive: SpiceNet;
  primaryNegative: SpiceNet;
  secondaryPositive: SpiceNet;
  centerTap: SpiceNet;
  secondaryNegative: SpiceNet;
}

/**
 * Single tapped winding. `input` to `common` is the whole winding and `tap` to `common` is the
 * output section, so the two sections are modelled as coupled inductors in series.
 */
export interface SpiceAutotransformer extends SpiceMagneticBase {
  kind: "autotransformer";
  input: SpiceNet;
  tap: SpiceNet;
  common: SpiceNet;
}

/**
 * Separately excited DC machine. The electrical side is Ra + La in series with a back-EMF source;
 * the mechanical side is solved on an internal node whose voltage is the shaft speed in rad/s.
 */
export interface SpiceDcMotor extends SpiceElementBase {
  kind: "dc-motor";
  positive: SpiceNet;
  negative: SpiceNet;
  /** Ohms. */
  armatureResistance: number;
  /** Henries. */
  armatureInductance: number;
  /** Ke, in volt-seconds per radian. Back-EMF is Ke times shaft speed. */
  backEmfConstant: number;
  /** Kt, in newton-metres per ampere. Equals Ke in SI for an ideal machine. */
  torqueConstant: number;
  /** J, in kilogram square metres. */
  inertia: number;
  /** B, in newton-metre-seconds per radian. Viscous damping. */
  viscousFriction: number;
  /** TL, in newton-metres. Constant load torque opposing rotation. Defaults to 0. */
  loadTorque?: number;
}

/**
  * Operational Amplifier macromodel. Open-loop gain with differential input resistance and output resistance.
  */
export interface SpiceOpAmp extends SpiceElementBase {
  kind: "opamp";
  inNonInverting: SpiceNet;
  inInverting: SpiceNet;
  out: SpiceNet;
  gain: number;
  vcc?: number;
}

/* ------------------------------------------------------------ Switches & electromechanical --- */

/** Manual single-pole single-throw contact. `isClosed` is the live UI state. */
export interface SpiceSwitchSPST extends SpiceElementBase {
  kind: "switch-spst";
  a: SpiceNet;
  b: SpiceNet;
  /** Driven from the canvas. Normally-open and normally-closed parts differ only in this value. */
  isClosed: boolean;
}

/** Manual single-pole double-throw contact, including the break-before-make `open` position. */
export interface SpiceSwitchSPDT extends SpiceElementBase {
  kind: "switch-spdt";
  common: SpiceNet;
  a: SpiceNet;
  b: SpiceNet;
  position: "a" | "b" | "open";
}

interface SpiceCoilBase extends SpiceElementBase {
  coilPositive: SpiceNet;
  coilNegative: SpiceNet;
  /** Ohms. */
  coilResistance: number;
  /** Henries. Gives the coil its pull-in and release delay. */
  coilInductance: number;
  /** Volts across the coil at which the armature pulls in. */
  pullInVoltage: number;
  /**
   * Volts at which it drops out. Below pull-in, and the gap between them becomes the switch
   * model's hysteresis. Defaults to half the pull-in voltage.
   */
  dropOutVoltage?: number;
}

/** Coil plus one changeover contact. Either contact may be omitted for an SPST part. */
export interface SpiceRelay extends SpiceCoilBase {
  kind: "relay";
  common: SpiceNet;
  /** Closes when the coil is energised. */
  normallyOpen?: SpiceNet;
  /** Opens when the coil is energised. */
  normallyClosed?: SpiceNet;
}

/** One pole of a contactor: line side in, load side out. */
export interface SpiceContactorPole {
  line: SpiceNet;
  load: SpiceNet;
}

/** Coil plus any number of main poles and an optional auxiliary contact of each sense. */
export interface SpiceContactor extends SpiceCoilBase {
  kind: "contactor";
  /** Main poles, all closing together with the coil. */
  poles: SpiceContactorPole[];
  auxNormallyOpen?: SpiceContactorPole;
  auxNormallyClosed?: SpiceContactorPole;
}

export type SpiceComponent =
  | SpiceGround
  | SpiceResistor
  | SpiceCapacitor
  | SpiceInductor
  | SpiceDcVoltageSource
  | SpiceAcVoltageSource
  | SpiceDcCurrentSource
  | SpiceAcCurrentSource
  | SpiceDiode
  | SpiceBjt
  | SpiceMosfet
  | SpiceJfet
  | SpiceScr
  | SpiceDiac
  | SpiceTriac
  | SpiceTransformer
  | SpiceCenterTappedTransformer
  | SpiceAutotransformer
  | SpiceDcMotor
  | SpiceSwitchSPST
  | SpiceSwitchSPDT
  | SpiceRelay
  | SpiceContactor
  | SpiceOpAmp;

export type SpiceComponentKind = SpiceComponent["kind"];

/** The SPICE element letter each kind must be named with. Ground has no element line. */
export const SPICE_PREFIXES: Record<
  Exclude<SpiceComponentKind, "ground">,
  string
> = {
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  "dc-voltage": "V",
  "ac-voltage": "V",
  "dc-current": "I",
  "ac-current": "I",
  diode: "D",
  bjt: "Q",
  mosfet: "M",
  jfet: "J",
  // Subcircuit instances.
  scr: "X",
  diac: "X",
  triac: "X",
  "dc-motor": "X",
  opamp: "X",
  // Transformers emit no element line of their own; `T` is only the root the generated L and K
  // names are derived from, so it never collides with SPICE's `T` transmission line.
  transformer: "T",
  "transformer-ct": "T",
  autotransformer: "T",
  // A closed manual contact emits a plain resistor (see netlistGenerator's
  // `manualContactOnResistance`; an open one emits nothing), so it must be named `R…` — ngspice
  // dispatches an element's type from its name's first letter, and an `S…`-named resistor line
  // would be misparsed as an incomplete switch element.
  "switch-spst": "R",
  "switch-spdt": "R",
  // Coil-driven contacts stay voltage-controlled switches, plus their coil's R/L.
  relay: "S",
  contactor: "S",
};

/** Narrows out grounds, which contribute a net mapping rather than an element line. */
export function isSpiceElement(
  component: SpiceComponent
): component is Exclude<SpiceComponent, SpiceGround> {
  return component.kind !== "ground";
}

/**
 * Every net an element touches, in the order SPICE writes them on the element line. Node numbering
 * follows this order, so it is the single place that knows a BJT is collector-base-emitter rather
 * than the canvas's base-collector-emitter.
 */
export function elementNets(
  element: Exclude<SpiceComponent, SpiceGround>
): SpiceNet[] {
  switch (element.kind) {
    case "resistor":
    case "capacitor":
    case "inductor":
    case "dc-voltage":
    case "ac-voltage":
      return [element.positive, element.negative];
    // SPICE's `I n1 n2 <value>` pushes current from n2 out into the external circuit and back into
    // n1 (current flows n1->n2 *inside* the source, like a battery's internal current flows -to+) —
    // opposite of a voltage source, whose n1 (`positive`) really is the schematic's `+` terminal at
    // the higher potential. Swapped here (not by negating the value) so `positive` keeps meaning
    // "the schematic's + terminal" everywhere else this type is read, confirmed against real
    // ngspice.wasm output in ngspiceRegression.currentSources.test.ts.
    case "dc-current":
    case "ac-current":
      return [element.negative, element.positive];
    case "diode":
      return [element.anode, element.cathode];
    case "bjt":
      return [element.collector, element.base, element.emitter];
    case "mosfet":
      return [
        element.drain,
        element.gate,
        element.source,
        element.bulk ?? element.source,
      ];
    case "jfet":
      return [element.drain, element.gate, element.source];
    case "scr":
      return [element.anode, element.gate, element.cathode];
    case "diac":
      return [element.a1, element.a2];
    case "triac":
      return [element.mt1, element.gate, element.mt2];
    case "opamp":
      return [element.inNonInverting, element.inInverting, element.out];
    case "transformer":
      return [
        element.primaryPositive,
        element.primaryNegative,
        element.secondaryPositive,
        element.secondaryNegative,
      ];
    case "transformer-ct":
      return [
        element.primaryPositive,
        element.primaryNegative,
        element.secondaryPositive,
        element.centerTap,
        element.secondaryNegative,
      ];
    case "autotransformer":
      return [element.input, element.tap, element.common];
    case "dc-motor":
      return [element.positive, element.negative];
    case "switch-spst":
      return [element.a, element.b];
    case "switch-spdt":
      return [element.common, element.a, element.b];
    case "relay":
      return [
        element.coilPositive,
        element.coilNegative,
        element.common,
        ...(element.normallyOpen === undefined ? [] : [element.normallyOpen]),
        ...(element.normallyClosed === undefined
          ? []
          : [element.normallyClosed]),
      ];
    case "contactor":
      return [
        element.coilPositive,
        element.coilNegative,
        ...element.poles.flatMap(pole => [pole.line, pole.load]),
        ...(element.auxNormallyOpen === undefined
          ? []
          : [element.auxNormallyOpen.line, element.auxNormallyOpen.load]),
        ...(element.auxNormallyClosed === undefined
          ? []
          : [element.auxNormallyClosed.line, element.auxNormallyClosed.load]),
      ];
  }
}
