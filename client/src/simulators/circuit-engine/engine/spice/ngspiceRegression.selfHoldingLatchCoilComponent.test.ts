/**
 * The user's own reference circuit for the self-holding (seal-in) latch: a standalone `coil`
 * component (K1, 0.1kΩ / 100Ω default resistance — not the 3-pole `contactor`) with a separate
 * `aux-contact-no` component, linked to it purely by matching its `linkedTo` text prop against K1's
 * canvas label (not a hard-wired terminal), wired in parallel with pushbutton S1. This is a distinct
 * code path from ngspiceRegression.selfHoldingLatch(Schematic).test.ts: those exercise the
 * `contactor` component's built-in aux-no-a/aux-no-b terminals; this exercises `auxContact()`'s
 * `linked.type === "coil"` branch (spiceAdapter.ts) and the label-lookup in `byLabel` — a genuinely
 * different mechanism that hadn't been verified until now, even though both ultimately emit the same
 * `SW_COIL_*` model built by `coilThreshold()`/`switchModelsFor()` for the "relay" kind, so the
 * underlying switch physics is not new — only the label-linking is.
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
import { runNgspiceWithLog } from "@/simulators/circuit-engine/engine/spice/ngspiceTestHarness";
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";

// K1's real component defaults (componentDefs.ts 'coil'): resistance=100Ω ("0.1kΩ" in the drawing),
// inductance=1.0H, activationThreshold=5V. dropOutVoltage = threshold * DROP_OUT_FRACTION (0.45),
// mirroring spiceAdapter.ts's coilParameters() for component.type === "coil" exactly.
const COIL_R = 100;
const COIL_L = 1.0;
const THRESHOLD = 5;
const DROP_OUT = THRESHOLD * 0.45; // 2.25V
// coilThreshold(): VT=(pullIn+dropOut)/2, VH=(pullIn-dropOut)/2 — same formula as every other
// coil-driven part in this codebase (contactor, relay-spst, ...), not a new derivation.
const VT = (THRESHOLD + DROP_OUT) / 2; // 3.625V
const VH = (THRESHOLD - DROP_OUT) / 2; // 1.375V
const SWITCH_MODEL = `SW (VT=${VT} VH=${VH} RON=0.001 ROFF=1e9)`;
const S1_MODEL = "SW (VT=2.5 VH=0.5 RON=0.001 ROFF=1e9)"; // idealized pushbutton stand-in

function selfHoldCircuit(s1Closed: boolean) {
  const components = [
    part("g", "ground"),
    part("v1", "dc-voltage", { voltage: 24 }),
    part("s1", "sw-spst-no", { state: s1Closed ? "closed" : "open" }),
    part("k1", "coil", {}), // defaults: 100Ω / 1.0H / 5V threshold, exactly the drawn "K1  0.1 kΩ"
    part("aux1", "aux-contact-no", { contactType: "NO", linkedTo: "K1" }),
  ];
  const wires = [
    wire("w1", "v1", "pos", "s1", "a"),
    wire("w2", "s1", "b", "k1", "pos"),
    // aux1, labelled K1 on the canvas but linked purely via linkedTo="K1" text, in parallel with S1.
    wire("w3", "aux1", "a", "v1", "pos"),
    wire("w4", "aux1", "b", "k1", "pos"),
    wire("w5", "k1", "neg", "g", "gnd"),
    wire("w6", "v1", "neg", "g", "gnd"),
  ];
  return { components, wires };
}

describe("Self-holding latch — the user's exact reference circuit: standalone coil + label-linked aux-contact-no (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, 30_000);

  it("the generated netlist wires aux1 (linked by label, not a terminal) to the exact same two nodes as S1", () => {
    const { components, wires } = selfHoldCircuit(true);
    const nets = resolveCircuitNets(components, wires);
    const spiceComponents = convertToSpiceComponents(components, wires, nets, "practical");
    const nodeMap = buildSpiceNodeMap(spiceComponents);
    const netlist = generateNetlist(spiceComponents, {
      analysis: [".tran 0.5m 0.3"],
      simulationMode: "practical",
    });
    console.log("=== GENERATED NETLIST (coil + aux-contact-no) ===\n" + netlist);

    const s1NodeA = nodeMap.nameFor(nets.netFor("s1", "a"));
    const s1NodeB = nodeMap.nameFor(nets.netFor("s1", "b"));
    const s1Line = netlist
      .split("\n")
      .find(line => {
        const fields = line.trim().split(/\s+/);
        return fields[1] === s1NodeA && fields[2] === s1NodeB;
      });
    const auxNodeA = nodeMap.nameFor(nets.netFor("aux1", "a"));
    const auxNodeB = nodeMap.nameFor(nets.netFor("aux1", "b"));
    // aux1 and S1 land on the literal same two nodes (that's the point being proven), so matching by
    // node pair alone is ambiguous between them — `.find` would just return S1's own line again.
    // aux1's generated ref is unique (contains its label "AUX1"), unlike S1's plain "RS1"/"S1".
    const auxLine = netlist
      .split("\n")
      .find(line => {
        const fields = line.trim().split(/\s+/);
        return /AUX1/i.test(fields[0] ?? "") && fields[1] === auxNodeA && fields[2] === auxNodeB;
      });
    expect(s1Line).toBeDefined();
    expect(auxLine).toBeDefined();
    expect(auxNodeA).toBe(s1NodeA);
    expect(auxNodeB).toBe(s1NodeB);

    // aux1's control terminals (the last two fields of its "relay"-kind SW line) must be the coil's
    // own pos/neg nets — proving `linkedTo: "K1"` genuinely resolved to component k1 by label, not a
    // coincidence or a silent "unlinked" fallback (which would instead read `!normallyOpen`, i.e.
    // always-open here, and the load test below would fail).
    const auxFields = auxLine!.trim().split(/\s+/);
    const coilPosName = nodeMap.nameFor(nets.netFor("k1", "pos"));
    const coilNegName = nodeMap.nameFor(nets.netFor("k1", "neg"));
    expect(auxFields.slice(3, 5)).toEqual([coilPosName, coilNegName]);
  });

  it(
    "S1 closed: K1 reaches its activation threshold (5V) — the component's basic operation",
    async () => {
      const { components, wires } = selfHoldCircuit(true);
      const { nodeVoltage } = await simulate(components, wires, "practical", [".tran 0.5m 0.3"]);
      const coilVoltage = nodeVoltage("k1", "pos") - nodeVoltage("k1", "neg");
      expect(coilVoltage).toBeGreaterThan(20); // settled deep into the run, well past the 5V threshold
    },
    RUN_TIMEOUT
  );

  it(
    "S1 open the whole run: K1 never energizes",
    async () => {
      const { components, wires } = selfHoldCircuit(false);
      const { nodeVoltage } = await simulate(components, wires, "practical", [".tran 0.5m 0.3"]);
      const coilVoltage = nodeVoltage("k1", "pos") - nodeVoltage("k1", "neg");
      expect(coilVoltage).toBeLessThan(1);
    },
    RUN_TIMEOUT
  );

  it(
    "genuine press-then-release transient (hand netlist, faithful to this exact topology): releasing S1 after pull-in leaves K1 latched via aux1 alone",
    async () => {
      const netlist = `self hold coil component
        .MODEL SW1 ${S1_MODEL}
        .MODEL SWCOIL ${SWITCH_MODEL}
        V1 sup 0 DC 24
        Vctrl ctrl 0 PULSE(0 5 1m 1u 1u 50m 1)
        S1 sup coilplus ctrl 0 SW1
        SAUX sup coilplus coilplus 0 SWCOIL
        RCOIL coilplus mid ${COIL_R}
        LCOIL mid 0 ${COIL_L}
        .tran 0.5m 0.3
        .end
      `;
      const { vectors } = await runNgspiceWithLog(netlist);
      const results = parseSpiceResults(vectors, vectors.time ?? []);
      const coilVoltage = (t: number) => results.nodeVoltages["coilplus"][
        results.time.findIndex(time => time >= t)
      ];

      expect(coilVoltage(0.03)).toBeGreaterThan(THRESHOLD); // pulled in while S1 is pressed
      expect(coilVoltage(0.15)).toBeGreaterThan(DROP_OUT); // still latched after S1 releases at 51ms
    },
    RUN_TIMEOUT
  );
});
