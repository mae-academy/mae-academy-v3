/**
 * Extends ngspiceRegression.selfHoldingLatchCoilComponent.test.ts's exact building block (a
 * standalone `coil` + label-linked `aux-contact-no`, the user's own reference circuit) to the two
 * other classic control patterns built from the same seal-in mechanism: a Start/Stop/Hold motor
 * starter (adds a Stop NC pushbutton ahead of the latch) and a Forward/Reverse (or Run/Brake)
 * electrical interlock (each coil's start path gated through the OTHER coil's own aux-NC contact —
 * the real safety mechanism a reversing/braking motor-control panel relies on before any mechanical
 * reversing/braking contactor scheme, and the only part of "motor braking" that is a control-logic
 * question rather than a motor torque/speed question this SPICE bridge can't model). Every switch
 * here is the exact same `SW_COIL_*` model coilThreshold()/switchModelsFor() emits for the real
 * "relay"/"contactor" kinds — hand-written only to get genuine press-then-release/press-then-press
 * transients out of ngspice, which the schematic's static-state switches can't give in one `.tran`.
 */
import { describe, expect, it } from "vitest";

import { runNgspiceWithLog } from "@/simulators/circuit-engine/engine/spice/ngspiceTestHarness";
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";

// Same K1 defaults as ngspiceRegression.selfHoldingLatchCoilComponent.test.ts (componentDefs.ts
// 'coil': resistance=100Ω, inductance=1.0H, activationThreshold=5V), reused for every coil below.
const COIL_R = 100;
const COIL_L = 1.0;
const THRESHOLD = 5;
const DROP_OUT = THRESHOLD * 0.45; // 2.25V
const VT = (THRESHOLD + DROP_OUT) / 2; // 3.625V
const VH = (THRESHOLD - DROP_OUT) / 2; // 1.375V
const SWITCH_MODEL = `SW (VT=${VT} VH=${VH} RON=0.001 ROFF=1e9)`;
// Matches netlistGenerator.ts's own NC contact exactly: coilModelNames()'s negated-VT model card,
// PLUS the coil's control terminals given to the switch in reverse order (see its own comment: "the
// same switch with a negated threshold, driven from the coil's terminals in reverse" — negating VT
// alone isn't enough, since the coil's own terminal voltage never goes below 0V, so a plain negated
// threshold would stay permanently satisfied; swapping nc+/nc- flips the sign of the sensed voltage
// itself so it actually inverts).
const SWITCH_MODEL_NC = `SW (VT=${-VT} VH=${VH} RON=0.001 ROFF=1e9)`;
const PUSHBUTTON_MODEL = "SW (VT=2.5 VH=0.5 RON=0.001 ROFF=1e9)";

async function runAndParse(netlist: string) {
  const { vectors } = await runNgspiceWithLog(netlist);
  return parseSpiceResults(vectors, vectors.time ?? []);
}

describe("Start/Stop/Hold motor starter — Stop(NC) ahead of the Start/aux-NO seal-in latch (ngspice.wasm)", () => {
  it(
    "Start held then released: latches via aux-NO; a later momentary Stop press permanently de-energizes the coil",
    async () => {
      const netlist = `start stop hold
        .MODEL SW1 ${PUSHBUTTON_MODEL}
        .MODEL SWCOIL ${SWITCH_MODEL}
        V1 sup 0 DC 24
        // A slower control edge (1ms, not 1us) than the other pushbuttons in this file: SAUX's control
        // is its own switched terminal (coilplus) — self-referencing, same as the real coil's own
        // aux-NO everywhere else in this codebase — and reconnecting a near-instant 1us edge into that
        // loop after it had gone fully open (both S1 and SAUX open, node 'a' floating) produced a
        // genuine numerical false-trigger in ngspice (confirmed by isolating it with a debug trajectory
        // dump): SAUX spuriously latched closed within 1ms of Stop reclosing, purely from the edge
        // speed, not from any real control signal. A 1ms edge — still far faster than a human release,
        // slower than the circuit's own 10ms L/R time constant — removed it.
        Vstopctrl stopctrl 0 PULSE(5 0 150m 1m 1m 50m 1)
        SSTOP sup a stopctrl 0 SW1
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

      expect(coilVoltage(0.03)).toBeGreaterThan(THRESHOLD); // pulled in while Start is held
      expect(coilVoltage(0.14)).toBeGreaterThan(DROP_OUT); // Start released at 51ms, still latched via aux-NO
      // Stop pulses open [150ms, 200ms) — long enough relative to the coil's L/R≈10ms time constant to
      // actually let it decay, unlike a flicker much shorter than that (a real slow relay wouldn't drop
      // out from one either) — then closes again, but nothing is left to re-pull it in.
      expect(coilVoltage(0.25)).toBeLessThan(DROP_OUT * 0.2);
    },
    15_000
  );
});

describe("Forward/Reverse (Run/Brake) electrical interlock — each coil's start path gated by the other's aux-NC (ngspice.wasm)", () => {
  const interlockNetlist = (interlocked: boolean) => {
    // auxF_NC in the reverse path and auxR_NC in the forward path — controlled by the *other*
    // coil's own terminal voltage — are what a real interlocked reversing/braking panel relies on to
    // make simultaneous Forward+Reverse (or Run+Brake) energization physically impossible from the
    // control circuit alone, independent of any mechanical timing.
    // The assertion under test is always "does Reverse energize?", so the gate that matters for the
    // negative control is the one actually standing in Reverse's own path (SAUXF_NC) — bypassing the
    // *other* side's gate would leave Reverse still genuinely blocked and prove nothing.
    const reverseGate = interlocked
      ? `SAUXF_NC nodeR krplus 0 kfplus SWCOIL_NC`
      : `RAUXF_NC_BYPASS nodeR krplus 0.001`; // interlock removed: direct short, proves the test method
    return `forward reverse interlock
      .MODEL SW1 ${PUSHBUTTON_MODEL}
      .MODEL SWCOIL ${SWITCH_MODEL}
      .MODEL SWCOIL_NC ${SWITCH_MODEL_NC}
      V1 sup 0 DC 24
      VctrlF ctrlF 0 PULSE(0 5 1m 1u 1u 100m 1)
      SF sup nodeF ctrlF 0 SW1
      SAUXF_NO sup nodeF kfplus 0 SWCOIL
      SAUXR_NC nodeF kfplus 0 krplus SWCOIL_NC
      RCOILF kfplus midF ${COIL_R}
      LCOILF midF 0 ${COIL_L}
      VctrlR ctrlR 0 PULSE(0 5 200m 1u 1u 500m 1)
      SR sup nodeR ctrlR 0 SW1
      SAUXR_NO sup nodeR krplus 0 SWCOIL
      ${reverseGate}
      RCOILR krplus midR ${COIL_R}
      LCOILR midR 0 ${COIL_L}
      .tran 0.5m 0.6
      .end
    `;
  };

  it(
    "Forward latched first: a later Reverse press is blocked — Reverse coil stays de-energized the whole run",
    async () => {
      const results = await runAndParse(interlockNetlist(true));
      const kf = (t: number) => results.nodeVoltages["kfplus"][
        results.time.findIndex(time => time >= t)
      ];
      const kr = (t: number) => results.nodeVoltages["krplus"][
        results.time.findIndex(time => time >= t)
      ];

      expect(kf(0.05)).toBeGreaterThan(THRESHOLD); // Forward pulls in while held
      expect(kf(0.15)).toBeGreaterThan(DROP_OUT); // still latched via its own aux-NO after release at 101ms
      // Reverse is pressed at 200ms, well after Forward latched — the interlock should keep it out.
      expect(kr(0.25)).toBeLessThan(1);
      expect(kr(0.55)).toBeLessThan(1);
    },
    15_000
  );

  it(
    "negative control — without the aux-NC interlock gate, the same later Reverse press DOES energize Reverse (proves this test would catch a real missing interlock)",
    async () => {
      const results = await runAndParse(interlockNetlist(false));
      const kr = (t: number) => results.nodeVoltages["krplus"][
        results.time.findIndex(time => time >= t)
      ];
      expect(kr(0.55)).toBeGreaterThan(THRESHOLD);
    },
    15_000
  );
});
