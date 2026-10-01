/**
 * Reads SPICE simulation results back onto the canvas's instrument components (Voltmeter, Ammeter,
 * DMM, Oscilloscope), producing the exact `InstrumentReading` shape the legacy engine's own
 * `computeInstrumentReadings` produces — so the UI renders either source through one code path.
 */

import type {
  CircuitComponent,
  InstrumentReading,
  SamplePoint,
} from "@shared/circuit/circuitTypes";
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

/**
 * ngspice's default absolute tolerances: it stops iterating a nonlinear solve once every node
 * voltage moves by less than VNTOL (1 µV) and every branch current by less than ABSTOL (1 pA), so
 * magnitudes below these are solver residue, not converged signal. Without the clamp a node an open
 * switch has isolated reads exactly 0 in Practical mode (the 10 MΩ meter load pins it) but not in
 * Academic mode, where only a junction references it: verified against ngspice.wasm, that node
 * lands at -1.5e-21 V and an ideal scope's RMS over the run at 2.5e-11 V — shown as "-0.000 nV" and
 * "0.025 nV". Clamping to the solver's own resolution makes it read 0 identically in both modes.
 */
export const VOLTAGE_NOISE_FLOOR = 1e-6;
export const CURRENT_NOISE_FLOOR = 1e-12;

const NOISE_FLOOR_BY_UNIT: Record<string, number> = {
  V: VOLTAGE_NOISE_FLOOR,
  A: CURRENT_NOISE_FLOOR,
};

function reading(
  value: number,
  unit: string,
  status: InstrumentReading["status"] = "ready",
  extra: Partial<InstrumentReading> = {}
): InstrumentReading {
  const floor = NOISE_FLOOR_BY_UNIT[unit] ?? 0;
  const clamped = !Number.isFinite(value)
    ? Infinity
    : Math.abs(value) < floor
      ? 0
      : value;
  // `+ 0` turns a -0 left by a sub-floor negative or by the solver itself into +0.
  return { value: clamped + 0, unit, status, ...extra };
}

/**
 * Frequency of a voltage trace, or 0 when the trace never rises above the voltage noise floor —
 * `getFrequency` would otherwise count crossings in pure solver residue and report a bogus rate for
 * a probe on an isolated node.
 */
function voltageFrequency(trace: number[], time: number[]): number {
  const peak = trace.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  return peak < VOLTAGE_NOISE_FLOOR ? 0 : getFrequency(trace, time);
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
          readings[component.id] = reading(voltageFrequency(differential, results.time), "Hz");
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
          frequency: voltageFrequency(differential, results.time),
        });
      }
    }
  }

  return readings;
}
