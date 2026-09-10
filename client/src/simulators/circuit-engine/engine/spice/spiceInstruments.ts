/**
 * Reads SPICE simulation results back onto the canvas's instrument components (Voltmeter, Ammeter,
 * DMM, Oscilloscope), producing the exact `InstrumentReading` shape the legacy engine's own
 * `computeInstrumentReadings` produces — so the UI renders either source through one code path.
 */

import type {
  CircuitComponent,
  InstrumentReading,
  SamplePoint,
} from "@/simulators/circuit-engine/models/circuitTypes";
import { getDef, type ComponentDef } from "@/simulators/circuit-engine/models/componentDefs";
import {
  probeBranchKey,
  type SpiceCircuitNets,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import type { SpiceNodeMap } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import {
  getDifferential,
  getFrequency,
  getVrms,
  type SpiceResults,
} from "@/simulators/circuit-engine/engine/spice/spiceParser";

const OSCILLOSCOPE_CHANNELS = ["ch1", "ch2", "ch3", "ch4"] as const;

/** Fraction of the transient's duration averaged for a DC/DCA reading — long enough to reject an
 * incomplete switch transition or start-up ringing, short enough to stay clear of an early bias. */
const STEADY_STATE_TAIL_FRACTION = 0.1;
/**
 * A "realistic DMM" noise floor: below this, a branch current or voltage is instrument/solver noise
 * — or the residue of an open switch's mandatory (see netlistGenerator's ROFF) but electrically
 * meaningless leakage path — not a real reading, and rounds to exactly 0 either way.
 */
const OPEN_BRANCH_CURRENT_THRESHOLD_A = 1e-6;
const OPEN_BRANCH_VOLTAGE_THRESHOLD_V = 1e-4;

function stringProp(
  component: CircuitComponent,
  key: string,
  fallback: string
): string {
  const value = component.props[key];
  return typeof value === "string" ? value : fallback;
}

function reading(
  value: number,
  unit: string,
  status: InstrumentReading["status"] = "ready",
  extra: Partial<InstrumentReading> = {}
): InstrumentReading {
  return { value: Number.isFinite(value) ? value : Infinity, unit, status, ...extra };
}

function interpolateAt(vector: number[], time: number[], at: number): number {
  for (let i = 1; i < time.length; i += 1) {
    if (time[i] >= at) {
      const span = time[i] - time[i - 1];
      if (!(span > 0)) return vector[i];
      return vector[i - 1] + ((at - time[i - 1]) / span) * (vector[i] - vector[i - 1]);
    }
  }
  return vector[vector.length - 1];
}

/**
 * True DC steady-state value: the time-weighted mean over the settled tail of the waveform, not a
 * single last sample. A `.tran` deck re-solved after a switch/property edit can still be ringing or
 * mid-transition at its very last point — indexing that point directly reads the artifact, not the
 * settled value the meter should display.
 */
function getSteadyStateMean(vector: number[], time: number[]): number {
  if (vector.length === 0) return 0;
  if (vector.length !== time.length || vector.length < 2) return vector.at(-1) ?? 0;
  const start = time[0];
  const end = time[time.length - 1];
  const span = end - start;
  if (!(span > 0)) return vector.at(-1) ?? 0;

  const tailStart = end - span * STEADY_STATE_TAIL_FRACTION;
  const t: number[] = [tailStart];
  const v: number[] = [interpolateAt(vector, time, tailStart)];
  for (let i = 0; i < time.length; i += 1) {
    if (time[i] > tailStart) {
      t.push(time[i]);
      v.push(vector[i]);
    }
  }
  if (t.length < 2) return vector.at(-1) ?? 0;

  let area = 0;
  for (let i = 1; i < t.length; i += 1) {
    area += ((t[i] - t[i - 1]) * (v[i] + v[i - 1])) / 2;
  }
  return area / (t[t.length - 1] - t[0]);
}

/** Settled-tail mean for DC, or true RMS over whole periods for AC — matches the legacy engine's split. */
function meterValue(vector: number[], time: number[], mode: "DC" | "AC"): number {
  return mode === "AC" ? getVrms(vector, time) : getSteadyStateMean(vector, time);
}

/** A current below the open-branch floor renders as exactly 0, never fractional leakage. */
function clampCurrent(value: number): number {
  return Math.abs(value) < OPEN_BRANCH_CURRENT_THRESHOLD_A ? 0 : value;
}

/**
 * `floating` forces the reading to exactly 0 regardless of magnitude — see `isNetFloating` — because
 * a node reachable only through an open switch's mandatory ROFF leakage can settle a nonlinear
 * device (a diode/LED's exponential knee) at a deceptively large-looking voltage on a current of a
 * few nanoamps; no realistic voltage threshold alone would catch that. Otherwise, a plain sub-floor
 * magnitude still rounds to exactly 0 (solver noise on an otherwise perfectly ordinary reading).
 */
function voltageReading(
  results: SpiceResults,
  positiveNode: string,
  negativeNode: string,
  connected: boolean,
  mode: "DC" | "AC",
  floating: boolean
): InstrumentReading {
  if (!connected) return reading(0, "V", "open");
  if (floating) return reading(0, "V");
  const differential = getDifferential(results, positiveNode, negativeNode);
  const value = meterValue(differential, results.time, mode);
  return reading(Math.abs(value) < OPEN_BRANCH_VOLTAGE_THRESHOLD_V ? 0 : value, "V");
}

function currentReading(
  results: SpiceResults,
  branchKey: string,
  mode: "DC" | "AC"
): InstrumentReading {
  const branch = results.branchCurrents[branchKey];
  if (!branch) return reading(0, "A", "open");
  return reading(clampCurrent(meterValue(branch, results.time, mode)), "A");
}

/**
 * Terminal pairs a manually-operated switch/push-button currently bridges, per its own `state`
 * prop — or `null` for every other kind, including relays/contactors (their contact state depends on
 * a solved coil voltage this module has no access to). The conductive graph below then falls back to
 * merging that component's terminals unconditionally: a coarse over-approximation that can only add
 * reachability, never hide a real open branch, so it never produces a false "floating" clamp for a
 * kind this function does not model.
 */
function closedSwitchPairs(component: CircuitComponent): Array<[string, string]> | null {
  const state = String(component.props.state ?? "");
  switch (component.type) {
    case "sw-spst-no":
    case "sw-spst-nc":
    case "circuit-breaker":
      return state === "closed" ? [["a", "b"]] : [];
    case "pb-no":
      return state === "pressed" ? [["a", "b"]] : [];
    case "pb-nc":
      return state === "released" ? [["a", "b"]] : [];
    case "sw-spdt":
      if (state === "a") return [["common", "a"]];
      if (state === "b") return [["common", "b"]];
      return [];
    case "sw-dpst":
      return state === "closed" ? [["a1", "b1"], ["a2", "b2"]] : [];
    case "sw-dpdt":
      if (state === "a") return [["c1", "a1"], ["c2", "a2"]];
      if (state === "b") return [["c1", "b1"], ["c2", "b2"]];
      return [];
    default:
      return null;
  }
}

/**
 * Whether a component's own terminals are an independent, authoritative voltage reference — true for
 * every Sources-category part (battery, rail, ground, …) plus `digital-input`, which the catalog
 * files under Digital Logic but `spiceAdapter` maps to the exact same kind of DC source.
 */
function isSourceLike(component: CircuitComponent, definition: ComponentDef): boolean {
  return definition.category === "Sources" || component.type === "digital-input";
}

/**
 * Adjacency of SPICE nets bridged by a *currently* conductive path. An open manual switch (see
 * `closedSwitchPairs`) contributes no edge, so a node reachable only through one is unreachable here
 * — the graph `isNetFloating` needs to tell "post-open-switch leakage node" from "genuinely live node".
 *
 * A Sources-, Diodes- or Measurement-category component contributes no internal edge of its own, for
 * the same reason a switch does not get the generic treatment below: a source's pos/neg are
 * deliberately distinct hot/return anchors, a diode's anode/cathode are deliberately one-way, and a
 * voltmeter/DMM-in-voltage-mode is deliberately near-infinite impedance — bridging any of those pairs
 * here would silently "prove" a downstream node live through the very junction (or the very meter!)
 * whose voltage this check exists to question. Ground is reachable from almost any node through
 * *some* passive path, so once one of these is allowed to bridge it, the test degenerates to "is it
 * wired at all", which it already is by the time this runs.
 */
function buildConductiveGraph(
  components: CircuitComponent[],
  nets: SpiceCircuitNets
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  };

  for (const component of components) {
    const definition = getDef(component.type);
    if (!definition || definition.terminals.length < 2) continue;
    const netOf = (terminalId: string) => nets.netFor(component.id, terminalId);

    const closedPairs = closedSwitchPairs(component);
    if (closedPairs) {
      for (const [a, b] of closedPairs) addEdge(netOf(a), netOf(b));
      continue;
    }
    if (
      isSourceLike(component, definition) ||
      definition.category === "Diodes" ||
      definition.category === "Measurement"
    ) {
      continue;
    }

    const terminalNets = definition.terminals.map(terminal => netOf(terminal.id));
    for (let i = 1; i < terminalNets.length; i += 1) addEdge(terminalNets[0], terminalNets[i]);
  }
  return graph;
}

/** Every net touching a source-like component (see `isSourceLike`): their voltage is authoritative
 * by definition, current or not, so they seed reachability and are never "floating". */
function collectSourceNets(
  components: CircuitComponent[],
  nets: SpiceCircuitNets
): Set<string> {
  const sourceNets = new Set<string>();
  for (const component of components) {
    const definition = getDef(component.type);
    if (!definition || !isSourceLike(component, definition)) continue;
    for (const terminal of definition.terminals) {
      sourceNets.add(nets.netFor(component.id, terminal.id));
    }
  }
  return sourceNets;
}

function isReachable(
  graph: Map<string, Set<string>>,
  from: string,
  targets: Set<string>
): boolean {
  if (targets.has(from)) return true;
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of Array.from(graph.get(current) ?? [])) {
      if (targets.has(neighbor)) return true;
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

/**
 * Builds `InstrumentReading`s for every Voltmeter, Ammeter, DMM (voltage/current/HZ modes) and
 * Oscilloscope channel on the canvas. `nodeMap` must come from the exact `SpiceComponent[]` that
 * produced `results`, so node names line up with what ngspice actually reported.
 *
 * DMM OHM and CONT modes are intentionally omitted: they need an isolated test-source resistance
 * measurement the batch `.tran`/`.op` deck does not provide. The caller (Home.tsx) must leave those
 * keys untouched in its merge so the legacy engine's topological measurement — which does inject a
 * behavioral test current — keeps serving them, staying reactive and non-blocking through the same
 * edit pipeline that drives every other instrument.
 */
export function buildSpiceInstrumentReadings(
  components: CircuitComponent[],
  nets: SpiceCircuitNets,
  nodeMap: SpiceNodeMap,
  results: SpiceResults
): Record<string, InstrumentReading> {
  const readings: Record<string, InstrumentReading> = {};
  // Built once per pass: an open switch's own state only needs re-walking when the circuit itself
  // (not just the SPICE solve) changes, i.e. exactly when this whole function is called again.
  const conductiveGraph = buildConductiveGraph(components, nets);
  const sourceNets = collectSourceNets(components, nets);
  const isNetFloating = (net: string) => !isReachable(conductiveGraph, net, sourceNets);

  for (const component of components) {
    const netOf = (terminal: string) => nets.netFor(component.id, terminal);
    const nodeOf = (terminal: string) => nodeMap.nameFor(netOf(terminal));
    const isWired = (terminal: string) => nodeMap.isMapped(netOf(terminal));

    if (component.type === "voltmeter") {
      const mode = stringProp(component, "mode", "DC") === "AC" ? "AC" : "DC";
      readings[component.id] = voltageReading(
        results,
        nodeOf("pos"),
        nodeOf("neg"),
        isWired("pos") && isWired("neg"),
        mode,
        isNetFloating(netOf("pos")) || isNetFloating(netOf("neg"))
      );
      continue;
    }

    if (component.type === "ammeter") {
      const mode = stringProp(component, "mode", "DC") === "AC" ? "AC" : "DC";
      readings[component.id] = currentReading(results, probeBranchKey(component.id), mode);
      continue;
    }

    if (component.type === "dmm") {
      const mode = stringProp(component, "mode", "DCV");
      if (mode === "DCV" || mode === "ACV") {
        readings[component.id] = voltageReading(
          results,
          nodeOf("hi"),
          nodeOf("com"),
          isWired("hi") && isWired("com"),
          mode === "ACV" ? "AC" : "DC",
          isNetFloating(netOf("hi")) || isNetFloating(netOf("com"))
        );
      } else if (mode === "DCA" || mode === "ACA") {
        readings[component.id] = currentReading(
          results,
          probeBranchKey(component.id),
          mode === "ACA" ? "AC" : "DC"
        );
      } else if (mode === "HZ") {
        if (!isWired("hi") || !isWired("com")) {
          readings[component.id] = reading(0, "Hz", "open");
        } else {
          const differential = getDifferential(results, nodeOf("hi"), nodeOf("com"));
          readings[component.id] = reading(getFrequency(differential, results.time), "Hz");
        }
      }
      // OHM / CONT: left unset on purpose — see the function doc comment.
      continue;
    }

    if (component.type === "oscilloscope") {
      const groundWired = isWired("gnd");
      for (const channel of OSCILLOSCOPE_CHANNELS) {
        const key = `${component.id}:${channel}`;
        if (!groundWired || !isWired(channel)) {
          readings[key] = reading(0, "V", "open");
          continue;
        }
        const differential = getDifferential(results, nodeOf(channel), nodeOf("gnd"));
        const samples: SamplePoint[] = results.time.map((time, index) => ({
          time,
          value: differential[index] ?? 0,
        }));
        readings[key] = reading(getVrms(differential, results.time), "V", "ready", {
          samples,
          frequency: getFrequency(differential, results.time),
        });
      }
    }
  }

  return readings;
}
