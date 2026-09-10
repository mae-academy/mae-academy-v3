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

/** Fraction of the transient's duration averaged for a DC/DCA reading — long enough to reject an
 * incomplete switch transition or start-up ringing, short enough to stay clear of an early bias. */
const STEADY_STATE_TAIL_FRACTION = 0.1;
/** Below this, a branch current is SPICE numerical noise, not real leakage — round it to exactly 0. */
const CURRENT_NOISE_FLOOR_A = 1e-12;

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

/** Numerical noise below the SPICE solver's floor renders as exactly 0, never fractional leakage. */
function roundBelowNoiseFloor(value: number): number {
  return Math.abs(value) < CURRENT_NOISE_FLOOR_A ? 0 : value;
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
  return reading(roundBelowNoiseFloor(meterValue(branch, results.time, mode)), "A");
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
