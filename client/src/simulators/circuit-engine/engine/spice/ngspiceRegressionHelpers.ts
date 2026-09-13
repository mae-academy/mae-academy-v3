/**
 * Shared plumbing for the ngspiceRegression.*.test.ts family: part/wire builders and the
 * full-production-pipeline `simulate()` runner (convertToSpiceComponents -> generateNetlist ->
 * ngspice -> parseSpiceResults -> buildSpiceInstrumentReadings), extracted from
 * ngspiceRegression.test.ts so every sibling file exercises the exact same pipeline instead of a
 * hand-rolled subset of it.
 */

import type {
  CircuitComponent,
  CircuitWire,
} from "@/simulators/circuit-engine/models/circuitTypes";
import {
  convertToSpiceComponents,
  resolveCircuitNets,
  type SimulationMode,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import {
  buildSpiceNodeMap,
  generateNetlist,
} from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";
import { buildSpiceInstrumentReadings } from "@/simulators/circuit-engine/engine/spice/spiceInstruments";
import {
  runNgspice,
  runNgspiceWithLog,
} from "@/simulators/circuit-engine/engine/spice/ngspiceTestHarness";

// Every run boots a fresh ngspice instance (see ngspiceTestHarness); the first also has to load and
// parse the 7 MB JS glue, so only that warm-up needs the extra slack.
export const WASM_BOOT_TIMEOUT = 30_000;
export const RUN_TIMEOUT = 15_000;
// Short enough to run fast, long enough that a DC/latch circuit (no reactive elements besides the
// thyristor macros' picofarad junction capacitances) is fully settled by the last sample. Pass a
// different analysis array to `simulate()` for anything with real RC/RL time constants.
export const DEFAULT_SETTLE_ANALYSIS = [".tran 0.00005 0.002"];

export function part(
  id: string,
  type: string,
  props: Record<string, unknown> = {}
): CircuitComponent {
  return {
    id,
    type,
    x: 0,
    y: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    label: id.toUpperCase(),
    props,
  };
}

export function wire(
  id: string,
  fromComp: string,
  fromTerm: string,
  toComp: string,
  toTerm: string
): CircuitWire {
  return {
    id,
    fromComp,
    fromTerm,
    toComp,
    toTerm,
    path: [
      [0, 0],
      [20, 0],
    ],
    routing: "orthogonal",
  };
}

/** Boots a throwaway op-point so the first real test in a file doesn't eat the wasm load time. */
export async function warmupNgspice(): Promise<void> {
  await runNgspice("warmup\nV1 n1 0 DC 1\n.op\n.end\n");
}

/** Linear interpolation into a (time, value) transient trace; clamps to the last sample past the end. */
function interpolateAt(time: number[], values: number[], at: number): number {
  if (values.length === 0) return 0;
  for (let i = 1; i < time.length; i += 1) {
    if (time[i] >= at) {
      const span = time[i] - time[i - 1];
      if (!(span > 0)) return values[i];
      return (
        values[i - 1] +
        ((at - time[i - 1]) / span) * (values[i] - values[i - 1])
      );
    }
  }
  return values[values.length - 1];
}

/**
 * Runs one circuit through the full production pipeline and returns its instrument readings plus
 * node-voltage accessors — `nodeVoltage` for the settled last sample, `nodeVoltageAt` for a specific
 * instant within a `.tran` sweep (charging/rise curves, phase comparisons).
 */
export async function simulate(
  components: CircuitComponent[],
  wires: CircuitWire[],
  mode: SimulationMode,
  analysis: string[] = DEFAULT_SETTLE_ANALYSIS
) {
  const nets = resolveCircuitNets(components, wires);
  const spiceComponents = convertToSpiceComponents(components, wires, nets, mode);
  const nodeMap = buildSpiceNodeMap(spiceComponents);
  const netlist = generateNetlist(spiceComponents, {
    analysis,
    simulationMode: mode,
  });
  const { vectors, log } = await runNgspiceWithLog(netlist);
  const results = parseSpiceResults(vectors, vectors.time ?? []);
  const nodeName = (componentId: string, terminal: string) =>
    nodeMap.nameFor(nets.netFor(componentId, terminal)).toLowerCase();
  return {
    readings: buildSpiceInstrumentReadings(components, nets, nodeMap, results),
    results,
    nodeVoltage: (componentId: string, terminal: string) =>
      results.nodeVoltages[nodeName(componentId, terminal)]?.at(-1) ?? 0,
    nodeVoltageAt: (componentId: string, terminal: string, atTime: number) =>
      interpolateAt(
        results.time,
        results.nodeVoltages[nodeName(componentId, terminal)] ?? [],
        atTime
      ),
    log,
  };
}
