/**
 * Reproduces the actual reported failure ("press S1 -> K1 latches; release S1 -> K1 drops
 * immediately instead of holding") through the real interactive-UI mechanism, which none of this
 * latch's sibling regression files exercise: Home.tsx's `runSpiceSimulation` rebuilds the whole
 * netlist and reruns `.tran` from t=0 on every canvas edit — including every S1 press/release —
 * because spiceWorker.ts's ngspice instance cannot be reused across runs (see its own "jump to
 * zero" comment). The sibling `ngspiceRegression.selfHoldingLatch*.test.ts` files all prove the
 * SW-model topology itself latches correctly *within one continuous `.tran`* via a hand-written
 * PULSE-driven S1 — explicitly because, per their own header comments, "there's no way to press
 * then release within one continuous transient through the schematic pipeline". That is exactly
 * the gap this file closes: two separate `simulate()` calls, mirroring the two separate ngspice
 * runs the real UI performs, with nothing carried between them except what
 * netlistGenerator.ts's `initialNodeVoltages`/`.IC` machinery carries — the same mechanism
 * Home.tsx's `coilInitialVoltagesRef` uses.
 */
import { describe, expect, it } from "vitest";

import { resolveCircuitNets } from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import {
  RUN_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

// Same topology as ngspiceRegression.selfHoldingLatchSchematic.test.ts: S1 in parallel with K1's
// built-in aux-NO, both feeding the coil, through the real schematic pipeline.
function selfHoldCircuit(s1Closed: boolean) {
  const components = [
    part("g", "ground"),
    part("v1", "dc-voltage", { voltage: 24 }),
    part("s1", "sw-spst-no", { state: s1Closed ? "closed" : "open" }),
    part("k1", "contactor", { coilVoltage: 24 }),
  ];
  const wires = [
    wire("w1", "v1", "pos", "s1", "a"),
    wire("w2", "s1", "b", "k1", "coil+"),
    wire("w3", "k1", "aux-no-a", "v1", "pos"),
    wire("w4", "k1", "aux-no-b", "k1", "coil+"),
    wire("w5", "k1", "coil-", "g", "gnd"),
    wire("w6", "v1", "neg", "g", "gnd"),
  ];
  return { components, wires };
}

const DROP_OUT = 24 * 0.45; // spiceAdapter.ts DROP_OUT_FRACTION * rated coil voltage

describe("Self-holding latch survives the real UI's netlist rebuild on S1 release (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, 30_000);

  it(
    "negative control: without carrying the coil current forward, a fresh rebuild with S1 open reproduces the reported bug — K1 drops immediately",
    async () => {
      const closed = selfHoldCircuit(true);
      await simulate(closed.components, closed.wires, "practical", [".tran 0.5m 0.15"]);

      // A brand-new netlist + a brand-new ngspice instance for S1 now open, exactly as
      // Home.tsx's runSpiceSimulation does on every canvas edit — nothing carried forward.
      const open = selfHoldCircuit(false);
      const { nodeVoltage } = await simulate(open.components, open.wires, "practical", [".tran 0.5m 0.15"]);
      const coilVoltage = nodeVoltage("k1", "coil+") - nodeVoltage("k1", "coil-");
      expect(coilVoltage).toBeLessThan(1); // reproduces the bug: no history -> no hold
    },
    RUN_TIMEOUT
  );

  it(
    "fix: feeding the previous run's coil terminal voltage forward as the next run's `.IC` seed (with `uic`) keeps K1 latched across the rebuild",
    async () => {
      const closed = selfHoldCircuit(true);
      const pressed = await simulate(closed.components, closed.wires, "practical", [".tran 0.5m 0.15"]);
      const pressedCoilVoltage = pressed.nodeVoltage("k1", "coil+") - pressed.nodeVoltage("k1", "coil-");
      expect(pressedCoilVoltage).toBeGreaterThan(20); // sanity: it actually pulled in first

      // Same absolute-node-voltage forwarding Home.tsx's coilInitialVoltagesRef update does —
      // coil- is grounded in this topology, so coil+'s own (already ground-referenced) node
      // voltage doubles as the coil terminal voltage this asserts against below.
      const nets = resolveCircuitNets(closed.components, closed.wires);
      const initialNodeVoltages = new Map([[nets.netFor("k1", "coil+"), pressed.nodeVoltage("k1", "coil+")]]);

      const open = selfHoldCircuit(false);
      const { nodeVoltage } = await simulate(
        open.components,
        open.wires,
        "practical",
        [".tran 0.5m 0.15 uic"],
        initialNodeVoltages
      );
      const coilVoltage = nodeVoltage("k1", "coil+") - nodeVoltage("k1", "coil-");
      expect(coilVoltage).toBeGreaterThan(DROP_OUT); // latched via aux-NO alone, across the rebuild
    },
    RUN_TIMEOUT
  );
});
