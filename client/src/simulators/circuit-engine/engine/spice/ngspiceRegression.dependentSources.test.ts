/**
 * Regression coverage for the four IEEE dependent sources (validation spec Section II) against the
 * LEGACY engine (TabDSimulationEngine / analogSimulation.ts), NOT ngspice.wasm: spiceAdapter.ts
 * explicitly marks vcvs/vccs/ccvs/cccs unsupported (see mapPart's "Unsupported" switch), so this is
 * the only engine the canvas actually solves them with today. `part`/`wire` are reused from
 * ngspiceRegressionHelpers.ts — plain CircuitComponent/CircuitWire builders, engine-agnostic.
 *
 * All four circuits are pure DC, so a single `engine.step(1e-3)` settles them (same convention as
 * the DC cases in analogSimulation.test.ts) — no fixed-tick AC subtleties like the three-phase
 * source file next to this one.
 */

import { describe, expect, it } from "vitest";

import { part, wire } from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";
import { TabDSimulationEngine } from "../../../../../../api/_lib/circuit/engine/analogSimulation";

function settle(components: Parameters<TabDSimulationEngine["setCircuit"]>[0], wires: Parameters<TabDSimulationEngine["setCircuit"]>[1]) {
  const engine = new TabDSimulationEngine();
  engine.setCircuit(components, wires);
  return engine.step(1e-3);
}

describe("dependent sources (legacy engine — TabDSimulationEngine)", () => {
  describe("Test 2.1 — VCVS: V_out = G_v × V_control, G_v = 5, R_load = 1 kΩ", () => {
    function vcvsCircuit(controlVoltage: number) {
      return {
        components: [
          part("g", "ground"),
          part("vctrl", "dc-voltage", { voltage: controlVoltage }),
          part("e1", "vcvs", { gain: 5, controlSourceId: "vctrl" }),
          part("rload", "resistor", { resistance: 1000 }),
        ],
        wires: [
          wire("w1", "vctrl", "neg", "g", "gnd"),
          wire("w2", "e1", "pos", "rload", "a"),
          wire("w3", "rload", "b", "e1", "neg"),
          wire("w4", "e1", "neg", "g", "gnd"),
        ],
      };
    }

    it.each([
      [0, 0, 0],
      [1, 5, 5],
      [2, 10, 10],
      [5, 25, 25],
      [10, 50, 50],
    ])("V_control = %s V -> V_out = %s V, I_out = %s mA", (controlVoltage, expectedVout, expectedMilliamps) => {
      const { components, wires } = vcvsCircuit(controlVoltage);
      const snapshot = settle(components, wires);
      expect(snapshot.converged).toBe(true);
      const vOut = snapshot.terminalVoltages["e1:pos"] - snapshot.terminalVoltages["e1:neg"];
      expect(vOut).toBeCloseTo(expectedVout, 6);
      // R_load = 1 kΩ, so the mA figure is numerically the same as the volt figure — I_out(A) =
      // V_out/1000, expressed in mA by ×1000, i.e. I_out(mA) = V_out(V).
      const iOutMilliamps = (vOut / 1000) * 1000;
      expect(iOutMilliamps).toBeCloseTo(expectedMilliamps, 6);
    });
  });

  describe("Test 2.2 — VCCS: I_out = g_m × V_control, g_m = 0.1 S", () => {
    function vccsCircuit(controlVoltage: number, loadResistance: number) {
      return {
        components: [
          part("g", "ground"),
          part("vctrl", "dc-voltage", { voltage: controlVoltage }),
          part("g1", "vccs", { transconductance: 0.1, controlSourceId: "vctrl" }),
          part("rload", "resistor", { resistance: loadResistance }),
        ],
        wires: [
          wire("w1", "vctrl", "neg", "g", "gnd"),
          wire("w2", "g1", "pos", "rload", "a"),
          wire("w3", "rload", "b", "g1", "neg"),
          wire("w4", "g1", "neg", "g", "gnd"),
        ],
      };
    }

    // NOTE: unlike VCVS (Test 2.1, where reading pos-minus-neg matches the spec's sign directly),
    // this engine's VCCS MNA stamp (analogDocumentedMna.ts's 'vccs' case) injects the dependent
    // current with the opposite polarity from what "pos" naively suggests — verified by wiring both
    // dependent sources through the same pos->load->neg->ground topology and finding VCVS matches
    // the naive sign while VCCS is consistently inverted. Reading neg-minus-pos here documents that
    // real, current behavior rather than silently wiring around it.
    it.each([
      [2, 0.2, 20],
      [5, 0.5, 50],
      [10, 1.0, 100],
    ])("V_control = %s V -> I_out = %s A, V_load = %s V (R_load = 100 Ω)", (controlVoltage, expectedCurrent, expectedVload) => {
      const { components, wires } = vccsCircuit(controlVoltage, 100);
      const snapshot = settle(components, wires);
      expect(snapshot.converged).toBe(true);
      const vLoad = snapshot.terminalVoltages["g1:neg"] - snapshot.terminalVoltages["g1:pos"];
      expect(vLoad).toBeCloseTo(expectedVload, 4);
      expect(vLoad / 100).toBeCloseTo(expectedCurrent, 6);
    });

    it("stays at the same output current when the load resistance changes (ideal current source)", () => {
      const atLoad = (loadResistance: number) => {
        const { components, wires } = vccsCircuit(5, loadResistance);
        const snapshot = settle(components, wires);
        expect(snapshot.converged).toBe(true);
        const vLoad = snapshot.terminalVoltages["g1:neg"] - snapshot.terminalVoltages["g1:pos"];
        return vLoad / loadResistance;
      };
      const iAt100 = atLoad(100);
      const iAt1k = atLoad(1000);
      expect(iAt100).toBeCloseTo(0.5, 6);
      expect(iAt1k).toBeCloseTo(0.5, 6);
    });
  });

  describe("Test 2.3 — CCVS: V_out = r_m × I_control, r_m = 10 Ω, I_control = 1 A", () => {
    // CCVS/CCCS control branches must resolve through branchIndex (analogDocumentedMna.ts's
    // 'ccvs'/'cccs' cases: `branchIndex.get(controlBranchId)`, populated only from 'voltage',
    // 'inductor', 'vcvs' and 'ccvs' primitives) — a plain resistor's current is derived after the
    // solve, not an MNA branch unknown, so naming one throws "requires an existing current-control
    // branch." A 0 V dc-voltage source in series is the same "ideal ammeter" trick spiceAdapter.ts
    // uses for its own ammeter mapping, and it IS branch-tracked.
    function ccvsCircuit(loadResistance: number) {
      return {
        components: [
          part("g", "ground"),
          part("vctrl", "dc-voltage", { voltage: 1 }), // 1 V across 1 Ω -> exactly 1 A control current.
          part("rseries", "resistor", { resistance: 1 }),
          part("isense", "dc-voltage", { voltage: 0 }),
          part("h1", "ccvs", { transresistance: 10, controlSourceId: "isense" }),
          part("rload", "resistor", { resistance: loadResistance }),
        ],
        wires: [
          wire("w1", "vctrl", "pos", "rseries", "a"),
          wire("w2", "rseries", "b", "isense", "pos"),
          wire("w3", "isense", "neg", "g", "gnd"),
          wire("w4", "vctrl", "neg", "g", "gnd"),
          wire("w5", "h1", "pos", "rload", "a"),
          wire("w6", "rload", "b", "h1", "neg"),
          wire("w7", "h1", "neg", "g", "gnd"),
        ],
      };
    }

    it("outputs 10 V regardless of load, since I_control = 1 A is fixed by the sense resistor", () => {
      for (const loadResistance of [10, 1000]) {
        const { components, wires } = ccvsCircuit(loadResistance);
        const snapshot = settle(components, wires);
        expect(snapshot.converged).toBe(true);
        const vOut = snapshot.terminalVoltages["h1:pos"] - snapshot.terminalVoltages["h1:neg"];
        expect(vOut).toBeCloseTo(10, 4);
      }
    });
  });

  describe("Test 2.4 — CCCS: I_out = β × I_in, β = 10, I_in = 0.5 A", () => {
    // Same branch-tracked control-sense trick as Test 2.3 — see its comment.
    function cccsCircuit(loadResistance: number) {
      return {
        components: [
          part("g", "ground"),
          part("vctrl", "dc-voltage", { voltage: 0.5 }), // 0.5 V across 1 Ω -> exactly 0.5 A control current.
          part("rseries", "resistor", { resistance: 1 }),
          part("isense", "dc-voltage", { voltage: 0 }),
          part("f1", "cccs", { gain: 10, controlSourceId: "isense" }),
          part("rload", "resistor", { resistance: loadResistance }),
        ],
        wires: [
          wire("w1", "vctrl", "pos", "rseries", "a"),
          wire("w2", "rseries", "b", "isense", "pos"),
          wire("w3", "isense", "neg", "g", "gnd"),
          wire("w4", "vctrl", "neg", "g", "gnd"),
          wire("w5", "f1", "pos", "rload", "a"),
          wire("w6", "rload", "b", "f1", "neg"),
          wire("w7", "f1", "neg", "g", "gnd"),
        ],
      };
    }

    it("outputs 5 A regardless of load, since I_in = 0.5 A is fixed by the sense resistor", () => {
      // Same inverted "pos" polarity as VCCS (Test 2.2's note) — both are current-output dependent
      // sources in this engine's MNA stamp, as opposed to VCVS/CCVS's voltage-output stamps, which
      // do match the naive sign (confirmed: Test 2.3 needed no such flip).
      for (const loadResistance of [10, 1000]) {
        const { components, wires } = cccsCircuit(loadResistance);
        const snapshot = settle(components, wires);
        expect(snapshot.converged).toBe(true);
        const vOut = snapshot.terminalVoltages["f1:neg"] - snapshot.terminalVoltages["f1:pos"];
        expect(vOut / loadResistance).toBeCloseTo(5, 4);
      }
    });
  });
});
