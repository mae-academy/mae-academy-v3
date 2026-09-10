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

/** Last sample for DC, or true RMS over whole periods for AC — matches the legacy engine's split. */
function meterValue(vector: number[], time: number[], mode: "DC" | "AC"): number {
  return mode === "AC" ? getVrms(vector, time) : (vector.at(-1) ?? 0);
}

function voltageReading(
  results: SpiceResults,
  positiveNode: string,
  negativeNode: string,
  connected: boolean,
  mode: "DC" | "AC"
): InstrumentReading {
  if (!connected) return reading(0, "V", "open");
  const differential = getDifferential(results, positiveNode, negativeNode);
  return reading(meterValue(differential, results.time, mode), "V");
}

function currentReading(
  results: SpiceResults,
  branchKey: string,
  mode: "DC" | "AC"
): InstrumentReading {
  const branch = results.branchCurrents[branchKey];
  if (!branch) return reading(0, "A", "open");
  return reading(meterValue(branch, results.time, mode), "A");
}

/**
 * Builds `InstrumentReading`s for every Voltmeter, Ammeter, DMM (voltage/current/HZ modes) and
 * Oscilloscope channel on the canvas. `nodeMap` must come from the exact `SpiceComponent[]` that
 * produced `results`, so node names line up with what ngspice actually reported.
 *
 * DMM OHM and CONT modes are intentionally omitted: they need an isolated test-source resistance
 * measurement the batch `.tran`/`.op` deck does not provide. The caller should leave those keys
 * untouched so the legacy engine's topological measurement keeps serving them.
 */
export function buildSpiceInstrumentReadings(
  components: CircuitComponent[],
  nets: SpiceCircuitNets,
  nodeMap: SpiceNodeMap,
  results: SpiceResults
): Record<string, InstrumentReading> {
  const readings: Record<string, InstrumentReading> = {};

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
        mode
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
          mode === "ACV" ? "AC" : "DC"
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
