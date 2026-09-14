/**
 * Closes the one real gap left by ngspiceRegression.selfHoldingLatch.test.ts: that file proved the
 * SW-model self-hold *topology* genuinely latches in ngspice, using a hand-written netlist (needed
 * for a real press-then-release transient, which the schematic's static-state switches can't give
 * within one `.tran` run — see that file's header). What it didn't touch is whether the real
 * `contactor` component's own `aux-no-a`/`aux-no-b` terminals actually wire up that same topology
 * when a circuit is built and netlisted through the real schematic pipeline. This file builds one —
 * S1 in parallel with K1's built-in aux-NO, both feeding the coil, a resistive load on the main
 * pole — through `part()`/`wire()`, and prints the exact generated netlist text (not just asserts
 * on it) so the wiring is visible, not just claimed.
 */
import { describe, expect, it } from "vitest";

import { convertToSpiceComponents, resolveCircuitNets } from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import { buildSpiceNodeMap, generateNetlist } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import {
  RUN_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

function selfHoldCircuit(s1Closed: boolean) {
  const components = [
    part("g", "ground"),
    part("v1", "dc-voltage", { voltage: 24 }),
    part("s1", "sw-spst-no", { state: s1Closed ? "closed" : "open" }),
    part("k1", "contactor", { coilVoltage: 24 }),
    part("r1", "resistor", { resistance: 1000 }),
  ];
  const wires = [
    // S1: supply -> S1 -> coil+.
    wire("w1", "v1", "pos", "s1", "a"),
    wire("w2", "s1", "b", "k1", "coil+"),
    // K1's own aux-NO, wired in parallel with S1 — the self-hold path, same two nodes as w1/w2.
    wire("w3", "k1", "aux-no-a", "v1", "pos"),
    wire("w4", "k1", "aux-no-b", "k1", "coil+"),
    wire("w5", "k1", "coil-", "g", "gnd"),
    wire("w6", "v1", "neg", "g", "gnd"),
    // Main pole feeding a load, so "does it hold" is also visible as load power, not just coil volts.
    wire("w7", "v1", "pos", "k1", "l1"),
    wire("w8", "k1", "t1", "r1", "a"),
    wire("w9", "r1", "b", "g", "gnd"),
  ];
  return { components, wires };
}

describe("Self-holding latch — real contactor component through the real schematic pipeline (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, 30_000);

  it(
    "the generated netlist wires K1's aux-NO to the exact same two nodes as S1 (genuinely parallel, not just claimed)",
    () => {
      const { components, wires } = selfHoldCircuit(true);
      const nets = resolveCircuitNets(components, wires);
      const spiceComponents = convertToSpiceComponents(components, wires, nets, "practical");
      const nodeMap = buildSpiceNodeMap(spiceComponents);
      const netlist = generateNetlist(spiceComponents, {
        analysis: [".tran 0.5m 0.3"],
        simulationMode: "practical",
      });
      console.log("=== GENERATED NETLIST ===\n" + netlist);

      // A CLOSED switch-spst is emitted as a near-zero-ohm resistor (not an SPICE `S` element — that
      // only happens for the coil-driven contactor poles/aux contacts), so S1's element letter isn't
      // known ahead of time and asserting on an assumed prefix would be exactly the kind of unverified
      // guess this file exists to avoid. Instead, resolve S1's own two nets through the same node map
      // ngspice's netlist uses, and locate its line by which real node NAMES it carries.
      const s1NodeA = nodeMap.nameFor(nets.netFor("s1", "a"));
      const s1NodeB = nodeMap.nameFor(nets.netFor("s1", "b"));
      const s1Line = netlist
        .split("\n")
        .find(line => {
          const fields = line.trim().split(/\s+/);
          return fields[1] === s1NodeA && fields[2] === s1NodeB;
        });
      const auxLine = netlist.split("\n").find(line => /AUXNO/.test(line));
      expect(s1Line).toBeDefined();
      expect(auxLine).toBeDefined();
      const s1Nodes = s1Line!.trim().split(/\s+/).slice(1, 3);
      const auxNodes = auxLine!.trim().split(/\s+/).slice(1, 3);
      expect(auxNodes).toEqual(s1Nodes);

      // Sanity: the node names used above are the real ones the solver will see, not placeholders.
      const coilPlusName = nodeMap.nameFor(nets.netFor("k1", "coil+"));
      expect(s1Nodes).toContain(coilPlusName);
    }
  );

  it(
    "S1 closed: coil reaches pull-in voltage and the main pole powers the load — the real component's basic operation, not yet the hold",
    async () => {
      const { components, wires } = selfHoldCircuit(true);
      const { nodeVoltage } = await simulate(components, wires, "practical", [".tran 0.5m 0.3"]);
      const coilVoltage = nodeVoltage("k1", "coil+") - nodeVoltage("k1", "coil-");
      const loadVoltage = nodeVoltage("r1", "a") - nodeVoltage("r1", "b");
      // 24V coil: pull-in threshold is 18V (PULL_IN_FRACTION=0.75 in spiceAdapter.ts); settled deep
      // into a 0.3s run should be essentially the full 24V, well clear of that threshold.
      expect(coilVoltage).toBeGreaterThan(20);
      expect(loadVoltage).toBeGreaterThan(20);
    },
    RUN_TIMEOUT
  );

  it(
    "S1 open the whole run (never pressed): coil never energizes — the honest baseline this component starts from",
    async () => {
      const { components, wires } = selfHoldCircuit(false);
      const { nodeVoltage } = await simulate(components, wires, "practical", [".tran 0.5m 0.3"]);
      const coilVoltage = nodeVoltage("k1", "coil+") - nodeVoltage("k1", "coil-");
      expect(coilVoltage).toBeLessThan(1);
    },
    RUN_TIMEOUT
  );
});
