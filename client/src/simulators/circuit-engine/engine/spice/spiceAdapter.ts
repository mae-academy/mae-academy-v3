/** Canvas-to-SPICE bridge: resolves canvas connectivity and maps each UI part onto a SpiceComponent. */

import { getDef } from "@/simulators/circuit-engine/models/componentDefs";
import type {
  CircuitComponent,
  CircuitWire,
} from "@/simulators/circuit-engine/models/circuitTypes";
import { NormalizedCircuitGraph } from "@/simulators/circuit-engine/models/NormalizedCircuitGraph";
import {
  SPICE_GROUND,
  type SpiceComponent,
  type SpiceNet,
} from "@/simulators/circuit-engine/engine/spice/spiceTypes";

/** A canvas part with no faithful SPICE mapping. */
export interface SpiceUnsupportedPart {
  id: string;
  label: string;
  type: string;
  reason: string;
}

/** Carries every unsupported part at once, so the UI can report them together or fall back to the legacy engine. */
export class SpiceAdapterError extends Error {
  readonly unsupported: SpiceUnsupportedPart[];

  constructor(unsupported: SpiceUnsupportedPart[]) {
    super(
      `SPICE cannot simulate: ${unsupported
        .map(part => `${part.label} (${part.type}: ${part.reason})`)
        .join("; ")}`
    );
    this.name = "SpiceAdapterError";
    this.unsupported = unsupported;
  }
}

export interface SpiceCircuitNets {
  /** Net for a canvas terminal; ground resolves to `0`. */
  netFor(componentId: string, terminalId: string): SpiceNet;
}

/**
 * `academic`: idealized textbook models (ideal switches, no Early effect, RMS-scaled AC sources, …).
 * `practical`: real-world non-linear models. Threaded through to `generateNetlist`, which is where
 * the two modes actually diverge; the adapter itself produces the same `SpiceComponent[]` either way.
 */
export type SimulationMode = "academic" | "practical";

/** Reuses the canvas's own union-find, so SPICE sees exactly the nets the schematic draws. */
export function resolveCircuitNets(
  components: CircuitComponent[],
  wires: CircuitWire[]
): SpiceCircuitNets {
  const graph = NormalizedCircuitGraph.fromCanvas(components, wires);
  return {
    netFor: (componentId, terminalId) =>
      graph.netForTerminal(componentId, terminalId),
  };
}

/** SPICE element name of an ammeter's 0 V sense source, lower-case as ngspice reports it in `i(…)`. */
export function probeBranchKey(componentId: string): string {
  return probeLabel(componentId).toLowerCase();
}

// Already SPICE-legal and V-prefixed, so the generator emits it verbatim and the current is found by id.
function probeLabel(componentId: string): string {
  return `VPROBE_${componentId.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

/* ------------------------------------------------------------------------------ Assumptions --- */

// Relay pull-in and drop-out as fractions of rated coil voltage; identical to both legacy engines.
const PULL_IN_FRACTION = 0.75;
const DROP_OUT_FRACTION = 0.45;
// Coil L/R time constant in seconds. The canvas exposes no coil inductance; this sets pull-in delay.
const COIL_TIME_CONSTANT = 0.01;
// Aux-contact sensing coil sits across the linked coil, so it must not load it.
const SENSE_COIL_RESISTANCE = 1e9;
const SENSE_COIL_INDUCTANCE = 1e-6;
// Magnetising inductance in henries; the canvas has none. ~3 kΩ at 50 Hz keeps transformers near-ideal.
const DEFAULT_MAGNETIZING_INDUCTANCE = 10;
// Every node needs a DC path to ground in SPICE; an isolated winding gets one through this.
const WINDING_BLEED = 1e9;
// The legacy engine's bond between the autotransformer's duplicated winding terminals.
const BOND_RESISTANCE = 1e-6;
// Impedance reactance is referenced to the first AC source, as in the legacy engine.
const DEFAULT_SYSTEM_FREQUENCY = 50;
const AC_SOURCE_TYPES = new Set([
  "ac-voltage",
  "ac-current",
  "three-phase-source",
  "three-phase-rail",
]);
// DC motor: the canvas gives only nominal V and P. Rated at 3000 rpm with 10% armature drop, and
// friction sized to absorb rated torque, so the bench operating point is the rated point — the same
// steady current the legacy engine's V²/P resistor draws.
const MOTOR_RATED_SPEED = 100 * Math.PI;
const MOTOR_ARMATURE_DROP = 0.1;
const MOTOR_ELECTRICAL_TIME_CONSTANT = 1e-3;
const MOTOR_MECHANICAL_TIME_CONSTANT = 0.1;
// A real benchtop DMM's input impedance in Practical mode, so the meter loads what it measures
// (reading ~9% low across a 1 MΩ divider leg, as real bench equipment does); Academic mode keeps the
// ideal (infinite-impedance) instrument. The circular Voltmeter is a separate, always-ideal
// instrument (see the "voltmeter" case below) and never uses this constant.
const DMM_INPUT_IMPEDANCE = 10e6;

/* -------------------------------------------------------------------------------- Helpers --- */

function numberProp(
  component: CircuitComponent,
  key: string,
  fallback: number
): number {
  const value = Number(component.props[key]);
  return Number.isFinite(value) ? value : fallback;
}

function stringProp(
  component: CircuitComponent,
  key: string,
  fallback: string
): string {
  const value = component.props[key];
  return typeof value === "string" ? value : fallback;
}

type ElementIdentity = { id: string; label: string };
type Mapping = SpiceComponent[] | { unsupported: string };

interface PartContext {
  component: CircuitComponent;
  nets: SpiceCircuitNets;
  byLabel: Map<string, CircuitComponent>;
  systemFrequency: number;
  simulationMode: SimulationMode;
}

const netOf = (ctx: PartContext, terminalId: string): SpiceNet =>
  ctx.nets.netFor(ctx.component.id, terminalId);

// A node that exists only inside this part.
const internalNet = (ctx: PartContext, suffix: string): SpiceNet =>
  `internal:${ctx.component.id}:${suffix}`;

const self = (ctx: PartContext): ElementIdentity => ({
  id: ctx.component.id,
  label: ctx.component.label,
});

// Identity for an element derived from this part; the generator sanitizes and de-duplicates labels.
const derived = (ctx: PartContext, suffix: string): ElementIdentity => ({
  id: `${ctx.component.id}:${suffix}`,
  label: `${ctx.component.label}_${suffix}`,
});

const resistor = (
  identity: ElementIdentity,
  positive: SpiceNet,
  negative: SpiceNet,
  resistance: number
): SpiceComponent => ({
  kind: "resistor",
  ...identity,
  positive,
  negative,
  resistance,
});

const manualSwitch = (
  identity: ElementIdentity,
  a: SpiceNet,
  b: SpiceNet,
  isClosed: boolean
): SpiceComponent => ({ kind: "switch-spst", ...identity, a, b, isClosed });

const toDegrees = (component: CircuitComponent, raw: number): number =>
  stringProp(component, "angleUnit", "degree") === "radian"
    ? (raw * 180) / Math.PI
    : raw;

export interface ThreePhaseVoltages {
  /** RMS, between any two lines. */
  lineVoltage: number;
  /** RMS, between a line and neutral: V_LL / √3 for a balanced Y source. */
  phaseVoltage: number;
  /** Peak line-to-neutral, what each phase's SIN()/AC source amplitude is set to: V_ph(RMS) × √2. */
  peakVoltage: number;
}

export type VoltageReference = "L-L" | "L-N";

/**
 * The standard Y-connection identities relating a three-phase source's line and phase voltages.
 * `reference` says which of the two `voltage` itself already is — "L-L" (default, the historical
 * behavior) treats it as the line-to-line RMS and derives phase voltage; "L-N" treats it as the
 * phase RMS and derives line voltage instead. `peakVoltage` is always the peak line-to-neutral
 * value regardless of `reference` — the relationship peakVoltage = phaseVoltage × √2 doesn't change,
 * only which of lineVoltage/phaseVoltage was the input versus the derived one.
 */
export function computeThreePhaseVoltages(
  voltage: number,
  reference: VoltageReference = "L-L"
): ThreePhaseVoltages {
  const [lineVoltage, phaseVoltage] =
    reference === "L-N" ? [voltage * Math.sqrt(3), voltage] : [voltage, voltage / Math.sqrt(3)];
  return { lineVoltage, phaseVoltage, peakVoltage: phaseVoltage * Math.SQRT2 };
}

/** Series internal resistance also stops parallel sources forming a voltage loop, which SPICE rejects. */
function dcSource(
  ctx: PartContext,
  positive: SpiceNet,
  negative: SpiceNet,
  voltage: number,
  internalResistance: number
): SpiceComponent[] {
  if (!(internalResistance > 0)) {
    return [{ kind: "dc-voltage", ...self(ctx), positive, negative, voltage }];
  }
  const terminal = internalNet(ctx, "rint");
  return [
    {
      kind: "dc-voltage",
      ...self(ctx),
      positive: terminal,
      negative,
      voltage,
    },
    resistor(derived(ctx, "RINT"), positive, terminal, internalResistance),
  ];
}

/**
 * One sinusoidal winding, `label`-suffixed (a three-phase source needs three of these from one
 * component). Same internal-resistance rationale as `dcSource` — critical here, not just cosmetic:
 * a Δ-connected source's three windings form a closed loop, and a closed loop of zero-impedance
 * ideal sources is singular in SPICE (confirmed: ngspice reports "singular matrix" and returns
 * arbitrary node voltages for one with no series resistance at all).
 */
function acWinding(
  ctx: PartContext,
  label: string,
  positive: SpiceNet,
  negative: SpiceNet,
  amplitude: number,
  phaseDegrees: number,
  frequency: number,
  internalResistance: number
): SpiceComponent[] {
  const identity = derived(ctx, label);
  const source = (pos: SpiceNet): SpiceComponent => ({
    kind: "ac-voltage",
    ...identity,
    positive: pos,
    negative,
    amplitude,
    phaseDegrees,
    frequency,
    dcOffset: 0,
  });
  if (!(internalResistance > 0)) return [source(positive)];
  const terminal = internalNet(ctx, `${label}rint`);
  return [
    source(terminal),
    resistor(derived(ctx, `${label}_RINT`), positive, terminal, internalResistance),
  ];
}

/** Bleeds every distinct non-ground winding terminal to ground. */
function windingBleeds(ctx: PartContext, nets: SpiceNet[]): SpiceComponent[] {
  return Array.from(new Set(nets))
    .filter(net => net !== SPICE_GROUND)
    .map((net, index) =>
      resistor(
        derived(ctx, `BLEED${index + 1}`),
        net,
        SPICE_GROUND,
        WINDING_BLEED
      )
    );
}

/* ------------------------------------------------------------------------ Coil-driven parts --- */

const RELAY_TYPES = new Set([
  "relay-spst",
  "relay-spdt",
  "relay-dpst",
  "contactor",
]);
type RelayType = "relay-spst" | "relay-spdt" | "relay-dpst" | "contactor";

const isCoilType = (type: string): boolean =>
  RELAY_TYPES.has(type) || type === "coil";

interface Contact {
  suffix: string;
  from: SpiceNet;
  to: SpiceNet;
  normallyOpen: boolean;
}

// Force State from the canvas: `true` energised, `false` released, `undefined` coil-driven.
function forcedState(component: CircuitComponent): boolean | undefined {
  const manual = stringProp(component, "manualState", "auto");
  return manual === "closed" ? true : manual === "open" ? false : undefined;
}

function coilParameters(component: CircuitComponent) {
  if (component.type === "coil") {
    const coilResistance = Math.max(1e-3, numberProp(component, "resistance", 100));
    const coilInductance = Math.max(1e-6, numberProp(component, "inductance", 1.0));
    const threshold = Math.max(0.1, numberProp(component, "activationThreshold", 5));
    return {
      coilResistance,
      coilInductance,
      pullInVoltage: threshold,
      dropOutVoltage: threshold * DROP_OUT_FRACTION,
    };
  }
  const contactor = component.type === "contactor";
  const rated = Math.max(
    0.1,
    numberProp(component, "coilVoltage", contactor ? 24 : 12)
  );
  const coilResistance = Math.max(
    1e-3,
    numberProp(component, "coilR", contactor ? 500 : 400)
  );
  return {
    coilResistance,
    coilInductance: coilResistance * COIL_TIME_CONSTANT,
    pullInVoltage: rated * PULL_IN_FRACTION,
    dropOutVoltage: rated * DROP_OUT_FRACTION,
  };
}

function coilLayout(
  ctx: PartContext,
  type: RelayType
): { native: SpiceComponent; contacts: Contact[] } {
  const net = (terminal: string) => netOf(ctx, terminal);
  const coil = {
    ...self(ctx),
    coilPositive: net("coil+"),
    coilNegative: net("coil-"),
    ...coilParameters(ctx.component),
  };

  switch (type) {
    case "relay-spst": {
      // The single contact is wired to the `no` terminal whichever sense Contact Type selects.
      const normallyClosed =
        stringProp(ctx.component, "contactType", "NO") === "NC";
      return {
        native: {
          kind: "relay",
          ...coil,
          common: net("com"),
          ...(normallyClosed
            ? { normallyClosed: net("no") }
            : { normallyOpen: net("no") }),
        },
        contacts: [
          {
            suffix: "NO",
            from: net("com"),
            to: net("no"),
            normallyOpen: !normallyClosed,
          },
        ],
      };
    }
    case "relay-spdt":
      return {
        native: {
          kind: "relay",
          ...coil,
          common: net("com"),
          normallyOpen: net("no"),
          normallyClosed: net("nc"),
        },
        contacts: [
          { suffix: "NO", from: net("com"), to: net("no"), normallyOpen: true },
          {
            suffix: "NC",
            from: net("com"),
            to: net("nc"),
            normallyOpen: false,
          },
        ],
      };
    case "relay-dpst": {
      // Two poles on one coil: a contactor in all but name.
      const poles = [
        { line: net("c1"), load: net("no1") },
        { line: net("c2"), load: net("no2") },
      ];
      return {
        native: { kind: "contactor", ...coil, poles },
        contacts: poles.map((pole, index) => ({
          suffix: `P${index + 1}`,
          from: pole.line,
          to: pole.load,
          normallyOpen: true,
        })),
      };
    }
    case "contactor": {
      const poles = [1, 2, 3].map(phase => ({
        line: net(`l${phase}`),
        load: net(`t${phase}`),
      }));
      const auxNormallyOpen = { line: net("aux-no-a"), load: net("aux-no-b") };
      const auxNormallyClosed = {
        line: net("aux-nc-a"),
        load: net("aux-nc-b"),
      };
      return {
        native: {
          kind: "contactor",
          ...coil,
          poles,
          auxNormallyOpen,
          auxNormallyClosed,
        },
        contacts: [
          ...poles.map((pole, index) => ({
            suffix: `P${index + 1}`,
            from: pole.line,
            to: pole.load,
            normallyOpen: true,
          })),
          {
            suffix: "AUXNO",
            from: auxNormallyOpen.line,
            to: auxNormallyOpen.load,
            normallyOpen: true,
          },
          {
            suffix: "AUXNC",
            from: auxNormallyClosed.line,
            to: auxNormallyClosed.load,
            normallyOpen: false,
          },
        ],
      };
    }
  }
}

function coilPart(ctx: PartContext, type: RelayType): SpiceComponent[] {
  const { native, contacts } = coilLayout(ctx, type);
  const forced = forcedState(ctx.component);
  if (forced === undefined) return [native];

  // Force State overrides the armature: keep the coil's R-L load, drive each contact manually.
  const { coilResistance, coilInductance } = coilParameters(ctx.component);
  const midpoint = internalNet(ctx, "coil");
  return [
    resistor(
      derived(ctx, "COILR"),
      netOf(ctx, "coil+"),
      midpoint,
      coilResistance
    ),
    {
      kind: "inductor",
      ...derived(ctx, "COILL"),
      positive: midpoint,
      negative: netOf(ctx, "coil-"),
      inductance: coilInductance,
    },
    ...contacts.map(contact =>
      manualSwitch(
        derived(ctx, contact.suffix),
        contact.from,
        contact.to,
        contact.normallyOpen === forced
      )
    ),
  ];
}

function auxContact(ctx: PartContext): SpiceComponent[] {
  const { component } = ctx;
  const normallyOpen = String(component.props?.contactType ?? (component.type === "aux-contact-nc" ? "NC" : "NO")).toUpperCase() !== "NC";
  const is3Phase = component.type === "aux-contact-3phase";
  const poles: Array<{ suffix?: string; from: SpiceNet; to: SpiceNet }> = is3Phase
    ? [
        { suffix: "1", from: netOf(ctx, "l1"), to: netOf(ctx, "t1") },
        { suffix: "2", from: netOf(ctx, "l2"), to: netOf(ctx, "t2") },
        { suffix: "3", from: netOf(ctx, "l3"), to: netOf(ctx, "t3") },
      ]
    : [{ from: netOf(ctx, "a"), to: netOf(ctx, "b") }];

  const linked = ctx.byLabel.get(stringProp(component, "linkedTo", ""));

  // Unlinked contacts see a released coil, as in the legacy engine.
  if (!linked || !isCoilType(linked.type)) {
    return poles.map(p =>
      manualSwitch(p.suffix ? derived(ctx, p.suffix) : self(ctx), p.from, p.to, !normallyOpen)
    );
  }
  const forced = forcedState(linked);
  if (forced !== undefined) {
    return poles.map(p =>
      manualSwitch(p.suffix ? derived(ctx, p.suffix) : self(ctx), p.from, p.to, normallyOpen === forced)
    );
  }

  // A second, non-loading coil across the linked one: its contact tracks the same voltage and thresholds.
  const { pullInVoltage, dropOutVoltage } = coilParameters(linked);
  const coilPos = ctx.nets.netFor(linked.id, linked.type === "coil" ? "pos" : "coil+");
  const coilNeg = ctx.nets.netFor(linked.id, linked.type === "coil" ? "neg" : "coil-");
  return poles.map(p => ({
    kind: "relay",
    ...(p.suffix ? derived(ctx, p.suffix) : self(ctx)),
    coilPositive: coilPos,
    coilNegative: coilNeg,
    coilResistance: SENSE_COIL_RESISTANCE,
    coilInductance: SENSE_COIL_INDUCTANCE,
    pullInVoltage,
    dropOutVoltage,
    common: p.from,
    ...(normallyOpen ? { normallyOpen: p.to } : { normallyClosed: p.to }),
  }));
}

/* ------------------------------------------------------------------------------ Part mapping --- */

function mapPart(ctx: PartContext): Mapping {
  const { component, simulationMode } = ctx;
  const net = (terminal: string) => netOf(ctx, terminal);
  const num = (key: string, fallback: number) =>
    numberProp(component, key, fallback);
  const state = stringProp(component, "state", "");

  switch (component.type) {
    case "ground":
      return [{ kind: "ground", id: component.id, net: net("gnd") }];

    /* ---------------------------------------------------------------------------- Passives --- */
    case "resistor":
      return [
        resistor(
          self(ctx),
          net("a"),
          net("b"),
          Math.max(1e-9, num("resistance", 1000))
        ),
      ];

    case "potentiometer": {
      const total = Math.max(1e-9, num("resistance", 10000));
      const rawWiper = num("wiper", 0.5);
      const wiper = Math.max(0, Math.min(1, rawWiper > 1 ? rawWiper / 100 : rawWiper));
      return [
        resistor(
          derived(ctx, "A"),
          net("t1"),
          net("wiper"),
          Math.max(1e-9, total * wiper)
        ),
        resistor(
          derived(ctx, "B"),
          net("wiper"),
          net("t2"),
          Math.max(1e-9, total * (1 - wiper))
        ),
      ];
    }

    case "capacitor":
      return [
        {
          kind: "capacitor",
          ...self(ctx),
          positive: net("a"),
          negative: net("b"),
          capacitance: num("capacitance", 1e-6),
        },
      ];

    case "inductor": {
      const inductance = num("inductance", 1e-3);
      const dcr = num("dcr", 0);
      if (!(dcr > 0)) {
        return [
          {
            kind: "inductor",
            ...self(ctx),
            positive: net("a"),
            negative: net("b"),
            inductance,
          },
        ];
      }
      // Winding resistance in series, as the legacy engine models it; it also bounds DC short-circuit current.
      const midpoint = internalNet(ctx, "dcr");
      return [
        {
          kind: "inductor",
          ...self(ctx),
          positive: net("a"),
          negative: midpoint,
          inductance,
        },
        resistor(derived(ctx, "DCR"), midpoint, net("b"), dcr),
      ];
    }

    case "impedance": {
      let r: number;
      let x: number;
      if (stringProp(component, "format", "rectangular") === "polar") {
        const magnitude = num("mag", 5);
        const angle = (toDegrees(component, num("ang", 53.13)) * Math.PI) / 180;
        r = magnitude * Math.cos(angle);
        x = magnitude * Math.sin(angle);
      } else {
        r = num("r", 3);
        x = num("x", 4);
      }
      // Reactance realised as L or C at the circuit's AC frequency, in series with R.
      const omega = 2 * Math.PI * Math.max(0.001, ctx.systemFrequency);
      const tiny = 1e-12;
      const hasR = Math.abs(r) > tiny;
      const hasX = Math.abs(x) > tiny;
      if (!hasR && !hasX)
        return [resistor(self(ctx), net("a"), net("b"), BOND_RESISTANCE)];
      if (!hasX) return [resistor(self(ctx), net("a"), net("b"), r)];
      const reactiveStart = hasR ? internalNet(ctx, "z") : net("a");
      const reactive: SpiceComponent =
        x > 0
          ? {
              kind: "inductor",
              ...derived(ctx, "X"),
              positive: reactiveStart,
              negative: net("b"),
              inductance: x / omega,
            }
          : {
              kind: "capacitor",
              ...derived(ctx, "X"),
              positive: reactiveStart,
              negative: net("b"),
              capacitance: -1 / (omega * x),
            };
      return hasR
        ? [resistor(self(ctx), net("a"), reactiveStart, r), reactive]
        : [reactive];
    }

    case "lamp":
      return [
        resistor(
          self(ctx),
          net("a"),
          net("b"),
          Math.max(
            1e-3,
            num("ratedV", 230) ** 2 / Math.max(1e-3, num("ratedPower", 60))
          )
        ),
      ];

    case "digital-output":
      return [resistor(self(ctx), net("in"), net("gnd"), 10_000_000)];

    case "motor-3phase": {
      const phaseResistance = Math.max(
        1e-3,
        num("nominalV", 400) ** 2 /
          Math.max(1e-3, num("nominalPower", 5000) * 3)
      );
      return ["u", "v", "w"].map(phase =>
        resistor(
          derived(ctx, phase.toUpperCase()),
          net(phase),
          net("pe"),
          phaseResistance
        )
      );
    }

    /* ----------------------------------------------------------------------------- Sources --- */
    case "dc-voltage":
      return dcSource(
        ctx,
        net("pos"),
        net("neg"),
        num("voltage", 12),
        num("internalR", 0)
      );

    case "dc-rail":
      return dcSource(
        ctx,
        net("pos"),
        SPICE_GROUND,
        num("voltage", 24),
        num("internalR", 0)
      );

    case "digital-input":
      return dcSource(
        ctx,
        net("out"),
        net("gnd"),
        state === "HIGH" ? num("highVoltage", 5) : 0,
        0
      );

    case "ac-voltage": {
      const waveform = stringProp(component, "waveform", "sine");
      if (waveform !== "sine") {
        return { unsupported: `${waveform} waveform has no SIN() equivalent` };
      }
      if (stringProp(component, "phases", "single") !== "single") {
        return { unsupported: "three-phase configuration" };
      }
      // Phasor handling mirrors the legacy engine's sourceValue().
      let amplitude: number;
      let phaseDegrees: number;
      if (stringProp(component, "format", "polar") === "rectangular") {
        const real = num("real", 10);
        const imag = num("imag", 0);
        amplitude = Math.hypot(real, imag);
        phaseDegrees = (Math.atan2(imag, real) * 180) / Math.PI;
      } else {
        amplitude = num("amplitude", 10);
        phaseDegrees = toDegrees(component, num("phase", 0));
      }
      return [
        {
          kind: "ac-voltage",
          ...self(ctx),
          positive: net("pos"),
          negative: net("neg"),
          amplitude,
          phaseDegrees,
          frequency: num("frequency", 60),
          dcOffset: num("offset", 0),
        },
      ];
    }

    // Three independent sine windings, 120° apart, in either connection (mirrors the legacy
    // engine's Y handling for lineVoltage->phase-amplitude conversion and ABC/ACB phase order — the
    // legacy engine doesn't model Δ, internalR, or voltageReference at all, so this is SPICE-only):
    // Y wires each winding line-to-neutral at V_LN(pk) = V_ph(RMS)·√2; Δ wires each winding directly
    // line-to-line at V_LL(pk) = V_LL(RMS)·√2 (a winding's own EMF *is* the line voltage), closing
    // L1->L2->L3->L1 with no neutral net at all. `voltageReference` says which of V_LL/V_ph the
    // entered `lineVoltage` number actually is — computeThreePhaseVoltages derives the other one.
    case "three-phase-source":
    case "three-phase-rail": {
      const enteredVoltage = num("lineVoltage", 400);
      const reference: VoltageReference =
        stringProp(component, "voltageReference", "Line-to-Line (L-L)") === "Phase (L-N)"
          ? "L-N"
          : "L-L";
      const { lineVoltage, peakVoltage: phaseNeutralPeak } = computeThreePhaseVoltages(
        enteredVoltage,
        reference
      );
      const frequency = num("frequency", 50);
      // internalR's own min (componentDefs.ts: 0.001) already keeps it off zero in the UI; this
      // floor only guards a directly-constructed component bypassing that, since a zero here is a
      // guaranteed singular matrix for the Δ case (see acWinding's doc comment).
      const internalR = Math.max(1e-6, num("internalR", 0.05));
      const sequence = stringProp(component, "phaseSequence", "ABC");
      // 0°, -120°, +120° for ABC (equivalently 0°, -120°, -240° — sin is 360°-periodic, so leading
      // by 120° and lagging by 240° describe the same waveform).
      const order = sequence === "ACB" ? [0, 1, -1] : [0, -1, 1];
      const isDelta = stringProp(component, "connection", "Y") !== "Y";
      // netlistGenerator's "ac-voltage" case treats `amplitude` as already-peak in Practical mode
      // but as RMS (scaling it up by √2 itself) in Academic mode — a blanket rule applied to every
      // ac-voltage kind, not something this mapping can opt out of. Feeding it the peak value
      // unconditionally, as earlier versions of this case did, was correct for Practical but left
      // Academic mode's actual SPICE amplitude √2 too high (confirmed: DMM ACV read 326.6 V under
      // Academic mode for the same 230.94 V phase). Pre-dividing here cancels that mode's own
      // multiplication instead of stacking with it.
      const modeAmplitude = (peak: number) =>
        ctx.simulationMode === "academic" ? peak / Math.SQRT2 : peak;

      if (isDelta) {
        const peakVoltage = modeAmplitude(lineVoltage * Math.SQRT2);
        const windings = [
          ["l1", "l2"],
          ["l2", "l3"],
          ["l3", "l1"],
        ] as const;
        return [
          ...windings.flatMap(([from, to], index) =>
            acWinding(
              ctx,
              `${from.toUpperCase()}${to.toUpperCase()}`,
              net(from),
              net(to),
              peakVoltage,
              order[index] * 120,
              frequency,
              internalR
            )
          ),
          // No neutral net means no inherent ground reference either — a closed loop floating with
          // no path to node 0 at all is a separate SPICE hazard from the loop-current one internalR
          // already covers. Same fix the transformer mappings below use for the same reason. An
          // ideal probe against this bleed-established "virtual neutral" correctly reconstructs the
          // theoretical phase voltage (verified: an ideal AC voltmeter reads it as ~230.94 V for a
          // 400 V line). A resistive DMM probing the SAME line the bleed is attached to is a
          // different matter — its own finite input impedance competes directly with that line's
          // own (deliberately weak) bleed for influence over the very reference it's trying to read,
          // and no bleed value fixes that: raising it toward "more ideal" only makes the DMM's fixed
          // impedance relatively *more* dominant there, not less (confirmed empirically — 1 GΩ, 10
          // MΩ and 1 TΩ all tried, none converges toward the theoretical value). Making that
          // reading robust under real loading would need an active (dependent-source-averaged)
          // virtual neutral, not a passive bleed network — a materially larger change than this.
          ...windingBleeds(ctx, [net("l1"), net("l2"), net("l3")]),
        ];
      }

      const peakVoltage = modeAmplitude(phaseNeutralPeak);
      const neutral = net("n");
      return (["l1", "l2", "l3"] as const).flatMap((phase, index) =>
        acWinding(
          ctx,
          phase.toUpperCase(),
          net(phase),
          neutral,
          peakVoltage,
          order[index] * 120,
          frequency,
          internalR
        )
      );
    }

    /* ---------------------------------------------------------------------- Semiconductors --- */
    case "diode":
    case "diode-ideal":
    case "diode-silicon":
    case "diode-germanium":
    case "diode-gaas":
      // Material variants share D_STD: saturation current is a model parameter the Phase 3 contract fixes.
      return [
        {
          kind: "diode",
          ...self(ctx),
          variant: "standard",
          anode: net("anode"),
          cathode: net("cathode"),
        },
      ];

    case "zener":
      return [
        {
          kind: "diode",
          ...self(ctx),
          variant: "zener",
          anode: net("anode"),
          cathode: net("cathode"),
          breakdownVoltage: num("breakdownVoltage", 5.1),
        },
      ];

    case "led":
      return [
        {
          kind: "diode",
          ...self(ctx),
          variant: "led",
          anode: net("anode"),
          cathode: net("cathode"),
          forwardVoltage: num("forwardVoltage", 2),
        },
      ];

    case "photodiode":
      return [
        {
          kind: "diode",
          ...self(ctx),
          variant: "photodiode",
          anode: net("anode"),
          cathode: net("cathode"),
        },
      ];

    case "bjt-npn":
    case "bjt-pnp":
      return [
        {
          kind: "bjt",
          ...self(ctx),
          polarity: component.type === "bjt-npn" ? "npn" : "pnp",
          collector: net("collector"),
          base: net("base"),
          emitter: net("emitter"),
        },
      ];

    case "mosfet-n":
    case "mosfet-p":
      return [
        {
          kind: "mosfet",
          ...self(ctx),
          channel: component.type === "mosfet-n" ? "n" : "p",
          drain: net("drain"),
          gate: net("gate"),
          source: net("source"),
        },
      ];

    case "jfet-n":
    case "jfet-p":
      return [
        {
          kind: "jfet",
          ...self(ctx),
          channel: component.type === "jfet-n" ? "n" : "p",
          drain: net("drain"),
          gate: net("gate"),
          source: net("source"),
        },
      ];

    /* ------------------------------------------------------------------ Thyristors & machines --- */
    case "scr":
      return [
        {
          kind: "scr",
          ...self(ctx),
          anode: net("anode"),
          gate: net("gate"),
          cathode: net("cathode"),
        },
      ];

    case "triac":
      return [
        {
          kind: "triac",
          ...self(ctx),
          mt1: net("t1"),
          gate: net("gate"),
          mt2: net("t2"),
        },
      ];

    case "diac":
      return [
        {
          kind: "diac",
          ...self(ctx),
          a1: net("a1"),
          a2: net("a2"),
          breakoverVoltage: num("vbo", 30),
        },
      ];

    case "transformer": {
      const primaryNegative = net("p2");
      const secondaryNegative = net("s2");
      return [
        {
          kind: "transformer",
          ...self(ctx),
          primaryPositive: net("p1"),
          primaryNegative,
          secondaryPositive: net("s1"),
          secondaryNegative,
          turnsRatio: Math.max(1e-6, num("turnRatio", 5)),
          primaryInductance: num(
            "primaryInductance",
            DEFAULT_MAGNETIZING_INDUCTANCE
          ),
        },
        ...windingBleeds(ctx, [primaryNegative, secondaryNegative]),
      ];
    }

    case "transformer-ct": {
      const primaryNegative = net("p2");
      const centerTap = net("ct");
      return [
        {
          kind: "transformer-ct",
          ...self(ctx),
          primaryPositive: net("p1"),
          primaryNegative,
          secondaryPositive: net("s1"),
          centerTap,
          secondaryNegative: net("s2"),
          turnsRatio: Math.max(1e-6, num("turnRatio", 5)),
          primaryInductance: num(
            "primaryInductance",
            DEFAULT_MAGNETIZING_INDUCTANCE
          ),
        },
        ...windingBleeds(ctx, [primaryNegative, centerTap]),
      ];
    }

    case "autotransformer":
      // out1/out2 duplicate the winding ends, bonded exactly as the legacy engine bonds them.
      return [
        {
          kind: "autotransformer",
          ...self(ctx),
          input: net("in1"),
          tap: net("tap"),
          common: net("in2"),
          turnsRatio: Math.max(1e-6, num("turnRatio", 2)),
          primaryInductance: num(
            "primaryInductance",
            DEFAULT_MAGNETIZING_INDUCTANCE
          ),
        },
        resistor(
          derived(ctx, "OUT1"),
          net("in1"),
          net("out1"),
          BOND_RESISTANCE
        ),
        resistor(
          derived(ctx, "OUT2"),
          net("in2"),
          net("out2"),
          BOND_RESISTANCE
        ),
      ];

    case "motor-dc": {
      const voltage = Math.max(1e-3, num("nominalV", 12));
      const ratedCurrent = Math.max(1e-3, num("nominalPower", 100)) / voltage;
      const armatureResistance = num(
        "armatureResistance",
        (MOTOR_ARMATURE_DROP * voltage) / ratedCurrent
      );
      const emfConstant = num(
        "backEmfConstant",
        ((1 - MOTOR_ARMATURE_DROP) * voltage) / MOTOR_RATED_SPEED
      );
      const torqueConstant = num("torqueConstant", emfConstant);
      const viscousFriction = num(
        "viscousFriction",
        (torqueConstant * ratedCurrent) / MOTOR_RATED_SPEED
      );
      return [
        {
          kind: "dc-motor",
          ...self(ctx),
          positive: net("pos"),
          negative: net("neg"),
          armatureResistance,
          armatureInductance: num(
            "armatureInductance",
            armatureResistance * MOTOR_ELECTRICAL_TIME_CONSTANT
          ),
          backEmfConstant: emfConstant,
          torqueConstant,
          inertia: num(
            "inertia",
            viscousFriction * MOTOR_MECHANICAL_TIME_CONSTANT
          ),
          viscousFriction,
          loadTorque: num("loadTorque", 0),
        },
      ];
    }

    /* ------------------------------------------------------------------------------ Switches --- */
    // Closed-state rules match the legacy engines exactly.
    case "sw-spst-no":
      return [manualSwitch(self(ctx), net("a"), net("b"), state === "closed")];
    case "sw-spst-nc":
      return [manualSwitch(self(ctx), net("a"), net("b"), state !== "open")];
    case "pb-no":
      return [manualSwitch(self(ctx), net("a"), net("b"), state === "pressed")];
    case "pb-nc":
      return [manualSwitch(self(ctx), net("a"), net("b"), state !== "pressed")];
    case "circuit-breaker":
      return [manualSwitch(self(ctx), net("a"), net("b"), state === "closed")];
    // SPICE cannot blow a fuse; it conducts until the UI reports otherwise.
    case "fuse":
      return [manualSwitch(self(ctx), net("a"), net("b"), true)];

    case "circuit-breaker-3phase":
    case "fuse-3phase": {
      const closed = component.type === "fuse-3phase" || state === "closed";
      return [1, 2, 3].map(phase =>
        manualSwitch(
          derived(ctx, `P${phase}`),
          net(`l${phase}`),
          net(`t${phase}`),
          closed
        )
      );
    }

    case "sw-spdt":
      return [
        {
          kind: "switch-spdt",
          ...self(ctx),
          common: net("common"),
          a: net("a"),
          b: net("b"),
          position: state === "b" ? "b" : state === "open" ? "open" : "a",
        },
      ];

    case "sw-dpst":
      return [1, 2].map(pole =>
        manualSwitch(
          derived(ctx, `P${pole}`),
          net(`a${pole}`),
          net(`b${pole}`),
          state === "closed"
        )
      );

    case "sw-dpdt":
      return [1, 2].map(pole => ({
        kind: "switch-spdt",
        ...derived(ctx, `P${pole}`),
        common: net(`c${pole}`),
        a: net(`a${pole}`),
        b: net(`b${pole}`),
        position: state === "b" ? "b" : "a",
      }));

    case "relay-spst":
    case "relay-spdt":
    case "relay-dpst":
    case "contactor":
      return coilPart(ctx, component.type);

    case "coil": {
      const { coilResistance, coilInductance } = coilParameters(component);
      const midpoint = internalNet(ctx, "mid");
      return [
        resistor(derived(ctx, "R"), net("pos"), midpoint, coilResistance),
        {
          kind: "inductor",
          ...derived(ctx, "L"),
          positive: midpoint,
          negative: net("neg"),
          inductance: coilInductance,
        },
      ];
    }

    case "aux-contact-no":
    case "aux-contact-nc":
    case "aux-contact-3phase":
      return auxContact(ctx);

    /* --------------------------------------------------------------------------- Instruments --- */
    // The circular Voltmeter is a pure ideal instrument in both modes — infinite input impedance,
    // zero loading distortion, unlike the benchtop DMM (below) which Practical mode deliberately
    // loads at DMM_INPUT_IMPEDANCE to model a real instrument's finite input resistance. Emitting no
    // element at all leaves the node exactly as the rest of the circuit drives it; a probe-only net
    // this never touches stays correctly unmapped (see SpiceNodeMap.isMapped) rather than reading a
    // phantom voltage.
    case "voltmeter":
      return [];

    // Ideal in both modes: modeling the oscilloscope's own input impedance is out of scope here.
    case "oscilloscope":
      return [];

    // Ideal ammeter: a 0 V independent voltage sense source in series, R_shunt = 0 Ω. SPICE gives an
    // independent source zero internal series resistance by construction, so this branch introduces
    // no burden voltage; its solved branch current (found by id via probeBranchKey) is the reading,
    // signed positive when conventional current enters the "pos" terminal.
    case "ammeter":
      return [
        {
          kind: "dc-voltage",
          id: component.id,
          label: probeLabel(component.id),
          positive: net("pos"),
          negative: net("neg"),
          voltage: 0,
        },
      ];

    case "dmm": {
      const mode = stringProp(component, "mode", "DCV");
      if (mode === "DCA" || mode === "ACA") {
        return [
          {
            kind: "dc-voltage",
            id: component.id,
            label: probeLabel(component.id),
            positive: net("hi"),
            negative: net("com"),
            voltage: 0,
          },
        ];
      }
      // OHM / CONT need an isolated test-source resistance measurement the batch deck does not
      // provide (see spiceInstruments); they stay unmapped so the legacy engine keeps serving them.
      if (mode === "OHM" || mode === "CONT") return [];
      // DCV / ACV / HZ: same input-impedance split as the voltmeter above.
      return simulationMode === "academic"
        ? []
        : [resistor(self(ctx), net("hi"), net("com"), DMM_INPUT_IMPEDANCE)];
    }

    /* --------------------------------------------------------------------------- Unsupported --- */
    case "dc-current":
    case "ac-current":
      return {
        unsupported: "current sources are not in the SPICE component set",
      };
    case "vccs":
    case "vcvs":
    case "cccs":
    case "ccvs":
      return {
        unsupported: "dependent sources are not in the SPICE component set",
      };
    case "opamp":
      return { unsupported: "no op-amp macromodel" };
    default:
      return { unsupported: "no SPICE mapping" };
  }
}

/**
 * The frequency impedance reactance is realised at, and a sensible default for sizing a `.tran`
 * analysis window: the first AC source's frequency, or 50 Hz if the circuit has none.
 */
export function detectSystemFrequency(components: CircuitComponent[]): number {
  const acSource = components.find(component =>
    AC_SOURCE_TYPES.has(component.type)
  );
  return acSource
    ? numberProp(acSource, "frequency", DEFAULT_SYSTEM_FREQUENCY)
    : DEFAULT_SYSTEM_FREQUENCY;
}

/**
 * Maps a canvas onto netlist-ready SPICE components. Throws `SpiceAdapterError` listing every part
 * that has no faithful mapping. Pass `nets` to share one connectivity pass with probe lookups.
 */
export function convertToSpiceComponents(
  components: CircuitComponent[],
  wires: CircuitWire[],
  nets: SpiceCircuitNets = resolveCircuitNets(components, wires),
  // Most mode-specific model swaps live in generateNetlist; this is used directly only for the
  // Practical-mode DMM/voltmeter input-impedance resistor (see DMM_INPUT_IMPEDANCE above).
  simulationMode: SimulationMode = "practical"
): SpiceComponent[] {
  const byLabel = new Map<string, CircuitComponent>(
    components.map(component => [component.label, component])
  );
  const systemFrequency = detectSystemFrequency(components);

  const spice: SpiceComponent[] = [];
  const unsupported: SpiceUnsupportedPart[] = [];
  for (const component of components) {
    // No definition means no terminals, so nothing can connect to it.
    if (!getDef(component.type)) continue;
    const mapping = mapPart({
      component,
      nets,
      byLabel,
      systemFrequency,
      simulationMode,
    });
    if (Array.isArray(mapping)) {
      spice.push(...mapping);
    } else {
      unsupported.push({
        id: component.id,
        label: component.label,
        type: component.type,
        reason: mapping.unsupported,
      });
    }
  }

  if (unsupported.length > 0) throw new SpiceAdapterError(unsupported);
  return spice;
}
