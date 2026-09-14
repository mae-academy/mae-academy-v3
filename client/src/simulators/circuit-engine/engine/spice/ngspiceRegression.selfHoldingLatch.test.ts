/**
 * Real ngspice.wasm verification of the self-holding (seal-in) latch topology: press S1 momentarily
 * -> contactor K1 pulls in -> K1's own aux-NO contact (wired in parallel with S1) keeps the coil
 * energized after S1 is released -> pressing reset S2 breaks the coil circuit and drops it out.
 *
 * This reproduces the REAL contactor/aux-contact SPICE model this app's own netlistGenerator.ts
 * emits (same R/L coil, same VT/VH switch thresholds derived from spiceAdapter.ts's
 * PULL_IN_FRACTION=0.75 / DROP_OUT_FRACTION=0.45 of a 24V-rated coil — see coilThreshold()), not an
 * approximation. It's a hand-written netlist rather than going through the schematic component
 * pipeline for one reason: the schematic's pushbutton/switch components hold a *static* state for
 * the whole `.tran` run (closed or open, chosen before the run starts), so there's no way to
 * "press then release" within one continuous transient through that pipeline — exactly what this
 * question needs. A PULSE-driven voltage-controlled switch standing in for S1 is the only way to
 * get a real momentary-contact transient out of ngspice, and every other value in this netlist
 * (coil R, coil L, switch thresholds, RON/ROFF) is copied straight from the production defaults.
 *
 * The main coil/contactor pole/aux-NO model already share one control signal (the coil's own
 * terminal voltage) by construction in this codebase — there's no separate "mechanical timing"
 * for main vs. aux to fall out of sync, so that half of the user's original bug report isn't a
 * real failure mode here. What's actually worth verifying is the parallel-path logic itself.
 */
import { describe, expect, it } from "vitest";

import { runNgspiceWithLog } from "@/simulators/circuit-engine/engine/spice/ngspiceTestHarness";
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";

const COIL_R = 500; // Ω, contactor default
const COIL_L = COIL_R * 0.01; // H — coilResistance * COIL_TIME_CONSTANT
const PULL_IN = 24 * 0.75; // 18V
const DROP_OUT = 24 * 0.45; // 10.8V
const VT = (PULL_IN + DROP_OUT) / 2; // 14.4V
const VH = (PULL_IN - DROP_OUT) / 2; // 3.6V
// Space before the parenthesis matters to ngspice's parser — matches netlistGenerator.ts's own
// `.MODEL ${name} SW (VT=...)` emission exactly, not just the same parameter values.
const SWITCH_MODEL = `SW (VT=${VT} VH=${VH} RON=0.001 ROFF=1e9)`;
const S1_MODEL = "SW (VT=2.5 VH=0.5 RON=0.001 ROFF=1e9)"; // idealized pushbutton stand-in, not a coil

async function runAndParse(netlist: string) {
  const { vectors } = await runNgspiceWithLog(netlist);
  return parseSpiceResults(vectors, vectors.time ?? []);
}

/** S1 pressed for [1ms, 51ms) via a control-voltage pulse, then released for the rest of the run.
 * `.MODEL` cards come first — ngspice needs a model defined before any element references it (see
 * netlistGenerator.ts's own comment on exactly this, which is why the real generator collects every
 * model card while walking elements and emits them ahead of the element lines). */
function latchNetlist(withAuxHold: boolean): string {
  const auxLine = withAuxHold
    ? `SAUX a coilplus coilplus 0 SWCOIL`
    : `* aux-NO omitted for this scenario`;
  return `self hold
    .MODEL SW1 ${S1_MODEL}
    .MODEL SWCOIL ${SWITCH_MODEL}
    V1 sup 0 DC 24
    RS2 sup a 0.001
    Vctrl ctrl 0 PULSE(0 5 1m 1u 1u 50m 1)
    S1 a coilplus ctrl 0 SW1
    ${auxLine}
    RCOIL coilplus mid ${COIL_R}
    LCOIL mid 0 ${COIL_L}
    Vline line 0 DC 24
    SMAIN line load coilplus 0 SWCOIL
    RLOAD load 0 1000
    .tran 0.5m 0.3
    .end
  `;
}

describe("Self-holding (seal-in) latch: S1 momentary + K1 aux-NO + coil (ngspice.wasm)", () => {
  it(
    "with the aux-NO hold path wired in: releasing S1 after pull-in leaves the coil (and load) energized",
    async () => {
      const results = await runAndParse(latchNetlist(true));
      const coilVoltage = (t: number) => results.nodeVoltages["coilplus"][
        results.time.findIndex(time => time >= t)
      ];
      const loadVoltage = (t: number) => results.nodeVoltages["load"][
        results.time.findIndex(time => time >= t)
      ];

      // During the press (well past the ~10ms L/R pull-in time constant, still within the 1-51ms
      // press window): pulled in, load powered.
      expect(coilVoltage(0.03)).toBeGreaterThan(PULL_IN);
      expect(loadVoltage(0.03)).toBeGreaterThan(20);

      // After S1 releases (well past 51ms): still latched via the aux-NO path alone.
      expect(coilVoltage(0.15)).toBeGreaterThan(DROP_OUT);
      expect(loadVoltage(0.15)).toBeGreaterThan(20);
    },
    15_000
  );

  it(
    "negative control — without the aux-NO hold path, releasing S1 drops the coil back out (proves this test method would actually catch a real self-hold failure)",
    async () => {
      const results = await runAndParse(latchNetlist(false));
      const coilVoltage = (t: number) => results.nodeVoltages["coilplus"][
        results.time.findIndex(time => time >= t)
      ];

      expect(coilVoltage(0.03)).toBeGreaterThan(PULL_IN); // still pulls in while S1 is held
      expect(coilVoltage(0.15)).toBeLessThan(DROP_OUT * 0.2); // but decays away once S1 releases
    },
    15_000
  );

  it(
    "reset: opening S2 (breaking the coil circuit) drops the latch even while aux-NO is still closed",
    async () => {
      // Same as the holding scenario, but S2 is itself a pulse-controlled switch that opens at
      // t=150ms — after the latch has settled in via the aux-NO path — instead of a fixed resistor.
      const netlist = `self hold reset
        .MODEL SW2 ${S1_MODEL}
        .MODEL SW1 ${S1_MODEL}
        .MODEL SWCOIL ${SWITCH_MODEL}
        V1 sup 0 DC 24
        Vs2ctrl s2ctrl 0 PULSE(5 0 150m 1u 1u 1 2)
        S2 sup a s2ctrl 0 SW2
        Vctrl ctrl 0 PULSE(0 5 1m 1u 1u 50m 1)
        S1 a coilplus ctrl 0 SW1
        SAUX a coilplus coilplus 0 SWCOIL
        RCOIL coilplus mid ${COIL_R}
        LCOIL mid 0 ${COIL_L}
        .tran 0.5m 0.3
        .end
      `;
      const results = await runAndParse(netlist);
      const coilVoltage = (t: number) => results.nodeVoltages["coilplus"][
        results.time.findIndex(time => time >= t)
      ];

      expect(coilVoltage(0.1)).toBeGreaterThan(PULL_IN); // latched via aux-NO before reset
      expect(coilVoltage(0.28)).toBeLessThan(DROP_OUT * 0.2); // reset breaks the hold
    },
    15_000
  );
});
