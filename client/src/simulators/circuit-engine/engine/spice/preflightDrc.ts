/**
 * Pre-flight design-rule check over netlist-ready SPICE components, run before the solver. It flags
 * an independent source whose loop closes through near-zero resistance — a short, or a
 * forward-biased junction with no ballast — where MNA has no finite solution (singular, or I → ∞)
 * and the solver would otherwise diverge or return a number set only by parasitics.
 */

import { formatEngineering } from "@/simulators/circuit-engine/models/circuitTypes";
import type {
  SpiceComponent,
  SpiceDiode,
  SpiceNet,
} from "@/simulators/circuit-engine/engine/spice/spiceTypes";

/**
 * Below this, a loop is limited only by parasitics the adapter injects (a source's default 10 mΩ
 * internal resistance, a closed contact's milliohm RON), never by a deliberate ballast resistor.
 */
export const MIN_BALLAST_RESISTANCE = 1;

/** Rated current an LED ballast suggestion is sized for. */
const LED_RATED_CURRENT = 0.02;

export type DrcRule = "source-short" | "unballasted-junction";

export interface DrcViolation {
  rule: DrcRule;
  /** Canvas id of the driving source. */
  sourceId: string;
  /** Canvas ids along the offending loop in current-flow order, the source's own internals excluded. */
  pathIds: string[];
  /** Series resistance of that loop in ohms, the source's internal resistance included. */
  loopResistance: number;
  /** Smallest series ballast that holds the LEDs on the loop to their rated current. */
  suggestedBallast?: number;
  message: string;
}

export interface PreflightDrcOptions {
  /** Display label for a canvas id; defaults to the SPICE element label. */
  labelOf?: (canvasId: string) => string;
}

type SpiceSource = Extract<SpiceComponent, { kind: "dc-voltage" | "ac-voltage" }>;

/** One polarity a source drives its loop with: conventional current leaves `from`, returns to `to`. */
interface Drive {
  source: SpiceSource;
  from: SpiceNet;
  to: SpiceNet;
  /** Peak EMF in volts. */
  peak: number;
  /** An AC drive's reactances bound its current, so inductors are not DC shorts for it. */
  alternating: boolean;
}

interface Edge {
  to: SpiceNet;
  resistance: number;
  element: Exclude<SpiceComponent, { kind: "ground" }>;
  junction: boolean;
}

/** Derived elements (`<id>:RINT`, `<id>:DCR`) belong to the canvas part whose id prefixes theirs. */
function canvasIdOf(elementId: string): string {
  const separator = elementId.indexOf(":");
  return separator < 0 ? elementId : elementId.slice(0, separator);
}

/** An AC source drives both polarities, one per half-cycle; a 0 V source drives nothing. */
function drivesOf(source: SpiceSource): Drive[] {
  if (source.kind === "dc-voltage") {
    if (source.voltage === 0) return [];
    const forward = source.voltage > 0;
    return [
      {
        source,
        from: forward ? source.positive : source.negative,
        to: forward ? source.negative : source.positive,
        peak: Math.abs(source.voltage),
        alternating: false,
      },
    ];
  }
  const peak = Math.abs(source.dcOffset ?? 0) + Math.abs(source.amplitude);
  if (!(peak > 0)) return [];
  return [
    { source, from: source.positive, to: source.negative, peak, alternating: true },
    { source, from: source.negative, to: source.positive, peak, alternating: true },
  ];
}

function isZeroVoltSource(element: SpiceComponent): boolean {
  if (element.kind === "dc-voltage") return element.voltage === 0;
  if (element.kind === "ac-voltage") return element.amplitude === 0 && !element.dcOffset;
  return false;
}

/**
 * Directed conduction graph as seen by one drive. Resistors keep their resistance; closed contacts,
 * 0 V sources (ammeter sense branches) and — for a DC drive — inductors are zero-resistance edges;
 * diodes conduct anode→cathode, and a zener also cathode→anode once the drive's peak exceeds its
 * breakdown. Every other independent source is left out: paralleled supplies are a KVL question for
 * the solver, not an unbounded-current one.
 */
function conductionGraph(
  components: SpiceComponent[],
  drive: Drive
): Map<SpiceNet, Edge[]> {
  const graph = new Map<SpiceNet, Edge[]>();
  const link = (
    from: SpiceNet,
    to: SpiceNet,
    resistance: number,
    element: Edge["element"],
    junction = false
  ) => {
    const edges = graph.get(from) ?? [];
    edges.push({ to, resistance, element, junction });
    graph.set(from, edges);
  };
  const both = (a: SpiceNet, b: SpiceNet, resistance: number, element: Edge["element"]) => {
    link(a, b, resistance, element);
    link(b, a, resistance, element);
  };

  for (const element of components) {
    if (element.kind === "ground" || element === drive.source) continue;
    switch (element.kind) {
      case "resistor":
        if (Number.isFinite(element.resistance) && element.resistance >= 0) {
          both(element.positive, element.negative, element.resistance, element);
        }
        break;
      case "switch-spst":
        if (element.isClosed) both(element.a, element.b, 0, element);
        break;
      case "switch-spdt":
        if (element.position === "a") both(element.common, element.a, 0, element);
        if (element.position === "b") both(element.common, element.b, 0, element);
        break;
      case "dc-voltage":
      case "ac-voltage":
        if (isZeroVoltSource(element)) both(element.positive, element.negative, 0, element);
        break;
      case "inductor":
        if (!drive.alternating) both(element.positive, element.negative, 0, element);
        break;
      case "diode":
        link(element.anode, element.cathode, 0, element, true);
        if (element.variant === "zener" && drive.peak > element.breakdownVoltage) {
          link(element.cathode, element.anode, 0, element, true);
        }
        break;
      default:
        break;
    }
  }
  return graph;
}

/** Least-resistance path (Dijkstra); a series path bounds the network's true loop resistance from above. */
function leastResistancePath(
  graph: Map<SpiceNet, Edge[]>,
  from: SpiceNet,
  to: SpiceNet,
  allowJunctions: boolean
): { resistance: number; edges: Edge[] } | null {
  const distance = new Map<SpiceNet, number>([[from, 0]]);
  const via = new Map<SpiceNet, { previous: SpiceNet; edge: Edge }>();
  const settled = new Set<SpiceNet>();

  for (;;) {
    let current: SpiceNet | null = null;
    let best = Infinity;
    distance.forEach((value, net) => {
      if (!settled.has(net) && value < best) {
        best = value;
        current = net;
      }
    });
    if (current === null) return null;
    const net: SpiceNet = current;
    if (net === to) break;
    settled.add(net);
    for (const edge of graph.get(net) ?? []) {
      if (edge.junction && !allowJunctions) continue;
      const candidate = best + edge.resistance;
      if (candidate < (distance.get(edge.to) ?? Infinity)) {
        distance.set(edge.to, candidate);
        via.set(edge.to, { previous: net, edge });
      }
    }
  }

  const edges: Edge[] = [];
  for (let net = to; net !== from; ) {
    const step = via.get(net);
    if (!step) return null;
    edges.unshift(step.edge);
    net = step.previous;
  }
  return { resistance: distance.get(to) ?? 0, edges };
}

function ohms(value: number): string {
  return formatEngineering(value, "Ω");
}

function describe(
  drive: Drive,
  rule: DrcRule,
  edges: Edge[],
  loopResistance: number,
  labelOf: (canvasId: string) => string
): DrcViolation {
  const sourceId = canvasIdOf(drive.source.id);
  const pathIds: string[] = [];
  for (const edge of edges) {
    const id = canvasIdOf(edge.element.id);
    if (id !== sourceId && pathIds[pathIds.length - 1] !== id) pathIds.push(id);
  }
  const source = labelOf(sourceId);
  const path = pathIds.map(labelOf).join(" → ") || "a direct wire";

  if (rule === "source-short") {
    return {
      rule,
      sourceId,
      pathIds,
      loopResistance,
      message: `${source} is short-circuited through ${path} (loop resistance ${ohms(loopResistance)}): the MNA matrix has no finite solution. Remove the short or insert a load.`,
    };
  }

  const junctions = edges
    .filter(edge => edge.junction)
    .map(edge => edge.element as SpiceDiode);
  const leds = junctions.filter(diode => diode.variant === "led");
  const ledDrop = leds.reduce(
    (sum, diode) => sum + (diode.variant === "led" ? diode.forwardVoltage : 0),
    0
  );
  const suggestedBallast =
    leds.length > 0 && drive.peak > ledDrop
      ? Math.max(1, Math.ceil((drive.peak - ledDrop) / LED_RATED_CURRENT - loopResistance))
      : undefined;
  const junction = labelOf(canvasIdOf(junctions[0]?.id ?? sourceId));
  const sizing =
    suggestedBallast === undefined
      ? " (220 Ω–1 kΩ)"
      : ` of at least ${ohms(suggestedBallast)} (${formatEngineering(LED_RATED_CURRENT, "A")} rated)`;
  return {
    rule,
    sourceId,
    pathIds,
    loopResistance,
    ...(suggestedBallast === undefined ? {} : { suggestedBallast }),
    message: `${junction} is forward-biased by ${source} through ${path} with only ${ohms(loopResistance)} of parasitic loop resistance: with no current-limiting resistor the junction current is unbounded (I → ∞). Insert a series ballast resistor${sizing}.`,
  };
}

/**
 * Every source loop closed through less than `MIN_BALLAST_RESISTANCE`. A pure short is reported in
 * preference to a junction path through the same source; one violation per source at most.
 */
export function runPreflightDrc(
  components: SpiceComponent[],
  options: PreflightDrcOptions = {}
): DrcViolation[] {
  const labelOf =
    options.labelOf ??
    ((canvasId: string) =>
      components.find(
        (component): component is Exclude<SpiceComponent, { kind: "ground" }> =>
          component.kind !== "ground" && component.id === canvasId
      )?.label ?? canvasId);
  const sources = components.filter(
    (component): component is SpiceSource =>
      component.kind === "dc-voltage" || component.kind === "ac-voltage"
  );

  const violations: DrcViolation[] = [];
  for (const source of sources) {
    for (const drive of drivesOf(source)) {
      const graph = conductionGraph(components, drive);
      const short = leastResistancePath(graph, drive.from, drive.to, false);
      if (short && short.resistance < MIN_BALLAST_RESISTANCE) {
        violations.push(describe(drive, "source-short", short.edges, short.resistance, labelOf));
        break;
      }
      // Any path under the threshold now must cross a junction: every junction-free one failed above.
      const junction = leastResistancePath(graph, drive.from, drive.to, true);
      if (junction && junction.resistance < MIN_BALLAST_RESISTANCE) {
        violations.push(
          describe(drive, "unballasted-junction", junction.edges, junction.resistance, labelOf)
        );
        break;
      }
    }
  }
  return violations;
}
