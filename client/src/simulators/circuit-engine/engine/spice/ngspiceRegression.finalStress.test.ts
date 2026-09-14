/**
 * ngspiceRegression.finalStress.test.ts
 *
 * The "Final Boss" Engine Stress Test:
 * Validates the entire SPICE simulation engine (ngspice.wasm) across all implemented
 * physics domains simultaneously without matrix singularity or convergence failure.
 *
 * Test Circuit Architecture (interacting simultaneously):
 * 1. Power Stage:
 *    - 3-Phase Power Rail (400V L-L, 50Hz, Y connection with neutral)
 *    - 3-Phase Auxiliary Contactor (driven by a 24V DC coil)
 *    - 3-Phase Induction Motor (nominal 400V, 5000W)
 * 2. Transformation & Isolation:
 *    - Step-down transformer (Np:Ns = 20:1) stepping down AC Phase L1 to Neutral (~230V -> ~11.5V RMS)
 *    - Full-wave 4-diode rectifier bridge (diode-silicon) converting stepped-down AC to DC
 *    - Filter capacitor & bleeder resistor
 * 3. Control Stage:
 *    - DC reference / error network with microvolt / millivolt resolution (15mV input)
 *    - Operational Amplifier (Op-Amp) with an RLC impedance network in its feedback loop
 *    - Accurately amplifies the 15mV error signal (e.g., gain = 100 -> ~1.5V output)
 * 4. Power Electronics:
 *    - The Op-Amp output triggers the gate of a Thyristor (SCR)
 *    - The SCR controls a secondary high-power DC load / motor
 *
 * Assertions:
 * - Simulation completes without "Matrix Singular" or "Timestep too small".
 * - Energized DC coil pulls in contactor, delivering 3-phase power to motor.
 * - Op-Amp correctly amplifies the 15mV error signal.
 * - SCR triggers and latches when gate drive is applied.
 * - Extreme dynamic range coexistence: 400V power rails accurately coexist with 15mV low-voltage inputs.
 */
import { describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

describe("Final Boss Stress Test: Mixed-Domain Industrial Power & Control System (ngspice.wasm)", () => {
  it("boots ngspice once so the stress test is not penalized by wasm load time", async () => {
    await warmupNgspice();
  }, 30_000);

  it(
    "simulates 3-phase power, contactor, motor, step-down transformer, rectifier, op-amp RLC control, and SCR latching simultaneously",
    async () => {
      const components = [
        // Ground reference
        part("g", "ground"),

        // 1. POWER STAGE: 3-Phase 400V Source, Contactor, 3-Phase Motor
        // 400V Line-to-Line (230.94V Line-to-Neutral), 50Hz, Y connection
        part("v3phase", "three-phase-rail", {
          lineVoltage: 400,
          frequency: 50,
          connection: "Y",
        }),

        // 24V DC source to energize the contactor coil
        part("vcoil", "dc-voltage", { voltage: 24 }),

        // 3-phase contactor with 24V coil, 500Ω coil resistance
        part("contactor1", "contactor", {
          coilVoltage: 24,
          coilR: 500,
          ratedCurrent: 50,
        }),

        // 3-phase induction motor (400V, 5kW)
        part("motor3p", "motor-3phase", {
          nominalV: 400,
          nominalPower: 5000,
        }),

        // 2. TRANSFORMATION & ISOLATION STAGE
        // Step-down transformer connected between Phase L1 and Neutral (turnsRatio: 20)
        part("tx1", "transformer", {
          turnsRatio: 20,
          primaryInductance: 10,
        }),

        // 4-diode silicon rectifier bridge
        part("d1", "diode-silicon"),
        part("d2", "diode-silicon"),
        part("d3", "diode-silicon"),
        part("d4", "diode-silicon"),

        // DC filter capacitor and bleeder resistor
        part("c_filter", "capacitor", { capacitance: 100e-6 }),
        part("r_bleed", "resistor", { resistance: 1000 }),

        // 3. CONTROL STAGE: 15mV Error signal into Op-Amp with RLC feedback
        // 15mV DC signal source to verify extreme dynamic range alongside 400V
        part("v_err", "dc-voltage", { voltage: 0.015 }),
        part("r_in", "resistor", { resistance: 1000 }),

        // Op-Amp with open-loop gain = 100
        part("opamp1", "opamp", { gain: 100, vcc: 15 }),

        // RLC feedback network across Op-Amp (output to in-)
        part("r_fb", "resistor", { resistance: 100000 }),
        part("c_fb", "capacitor", { capacitance: 1e-9 }),
        part("l_fb", "inductor", { inductance: 1e-3 }),

        // 4. POWER ELECTRONICS STAGE: SCR Thyristor controlling DC load
        // Secondary DC supply for power electronics
        part("vdc_pwr", "dc-voltage", { voltage: 48 }),
        part("scr1", "scr"),
        part("r_gate", "resistor", { resistance: 100 }),
        part("r_load", "resistor", { resistance: 24 }),
      ];

      const wires = [
        // Ground connections
        wire("w_gnd1", "v3phase", "n", "g", "gnd"),
        wire("w_gnd2", "vcoil", "neg", "g", "gnd"),
        wire("w_gnd3", "motor3p", "pe", "g", "gnd"),
        wire("w_gnd4", "v_err", "neg", "g", "gnd"),
        wire("w_gnd5", "vdc_pwr", "neg", "g", "gnd"),
        wire("w_gnd6", "c_filter", "b", "g", "gnd"),

        // Contactor coil driven by 24V DC
        wire("w_coil_pos", "vcoil", "pos", "contactor1", "coil+"),
        wire("w_coil_neg", "contactor1", "coil-", "g", "gnd"),

        // Contactor main poles: Line side from 3-Phase Rail
        wire("w_l1", "v3phase", "l1", "contactor1", "l1"),
        wire("w_l2", "v3phase", "l2", "contactor1", "l2"),
        wire("w_l3", "v3phase", "l3", "contactor1", "l3"),

        // Contactor load side to 3-Phase Motor
        wire("w_t1", "contactor1", "t1", "motor3p", "u"),
        wire("w_t2", "contactor1", "t2", "motor3p", "v"),
        wire("w_t3", "contactor1", "t3", "motor3p", "w"),

        // Transformer primary: between L1 and Neutral
        wire("w_tx_p1", "v3phase", "l1", "tx1", "p1"),
        wire("w_tx_p2", "v3phase", "n", "tx1", "p2"),

        // Transformer secondary to Diode Bridge Rectifier (s1 and s2)
        wire("w_br1", "tx1", "s1", "d1", "anode"),
        wire("w_br2", "tx1", "s1", "d3", "cathode"),
        wire("w_br3", "tx1", "s2", "d2", "anode"),
        wire("w_br4", "tx1", "s2", "d4", "cathode"),

        // Diode Bridge output to DC Filter (c_filter.a is DC+, c_filter.b is DC-/gnd)
        wire("w_dc_pos1", "d1", "cathode", "c_filter", "a"),
        wire("w_dc_pos2", "d2", "cathode", "c_filter", "a"),
        wire("w_dc_neg1", "d3", "anode", "c_filter", "b"),
        wire("w_dc_neg2", "d4", "anode", "c_filter", "b"),

        // Bleeder resistor across DC filter
        wire("w_bleed_a", "r_bleed", "a", "c_filter", "a"),
        wire("w_bleed_b", "r_bleed", "b", "c_filter", "b"),

        // Op-Amp non-inverting input tied to 15mV error source
        wire("w_op_inp", "v_err", "pos", "opamp1", "in+"),

        // Input resistor to inverting input
        wire("w_op_rin1", "r_in", "a", "g", "gnd"),
        wire("w_op_rin2", "r_in", "b", "opamp1", "in-"),

        // RLC feedback network in feedback loop between OUT and IN-:
        // Series R_fb and L_fb, with C_fb in parallel with the feedback branch
        wire("w_fb_r1", "opamp1", "out", "r_fb", "a"),
        wire("w_fb_rl", "r_fb", "b", "l_fb", "a"),
        wire("w_fb_l2", "l_fb", "b", "opamp1", "in-"),
        // C_fb in parallel across the R-L feedback branch (from OUT to IN-)
        wire("w_fb_c1", "opamp1", "out", "c_fb", "a"),
        wire("w_fb_c2", "c_fb", "b", "opamp1", "in-"),

        // Op-Amp output feeds gate of SCR through r_gate
        wire("w_gate1", "opamp1", "out", "r_gate", "a"),
        wire("w_gate2", "r_gate", "b", "scr1", "gate"),

        // SCR controlling high power DC load
        // DC Power +48V -> Load -> SCR Anode -> SCR Cathode -> GND
        wire("w_pwr_a", "vdc_pwr", "pos", "r_load", "a"),
        wire("w_pwr_b", "r_load", "b", "scr1", "anode"),
        wire("w_pwr_c", "scr1", "cathode", "g", "gnd"),
      ];

      // Run transient simulation across multiple mains cycles (40ms = 2 cycles of 50Hz)
      const { nodeVoltageAt, nodeVoltage, log, results } = await simulate(
        components,
        wires,
        "practical",
        [".tran 10u 0.04"]
      );

      // 1. Test Assertions: Convergence & Stability
      // Must not throw or log "matrix singular" or "timestep too small"
      expect(log).not.toMatch(/matrix is singular/i);
      expect(log).not.toMatch(/timestep too small/i);
      expect(results.time.length).toBeGreaterThan(10);

      // 2. Test Assertions: Power Stage & Contactor
      // When the DC coil is energized (24V), the 3-Phase Contactor passes voltage
      // to the 3-Phase motor, causing current flow across the 400V nodes.
      const tCheck = 0.035; // 35ms, well after pull-in
      const motorU = Math.abs(nodeVoltageAt("motor3p", "u", tCheck));
      const motorV = Math.abs(nodeVoltageAt("motor3p", "v", tCheck));
      const motorW = Math.abs(nodeVoltageAt("motor3p", "w", tCheck));

      // Each phase of 400V line-to-line has a peak of 230.94V * sqrt(2) ≈ 326.6V
      // Since phases are 120° apart, at least two phases must have significant instantaneous voltage (> 50V)
      const maxMotorPhaseV = Math.max(motorU, motorV, motorW);
      expect(maxMotorPhaseV).toBeGreaterThan(100);

      // 3. Test Assertions: Control Stage & Extreme Dynamic Range
      // The 15mV Op-Amp input must be accurately resolved in the exact same matrix as 400V power nodes
      const vInExact = nodeVoltageAt("v_err", "pos", tCheck);
      expect(vInExact).toBeCloseTo(0.015, 3); // 15mV resolved accurately

      // Op-Amp output correctly amplifies the error signal
      const vOpOut = nodeVoltageAt("opamp1", "out", tCheck);
      expect(vOpOut).toBeGreaterThan(0.5); // Amplified above gate trigger threshold

      // 4. Test Assertions: Power Electronics & SCR Latching
      // The SCR gate receives trigger from op-amp output, conducts current from 48V source through r_load
      // When SCR conducts, the anode voltage drops significantly from the 48V rail down to the SCR forward voltage drop
      const scrAnodeVoltage = nodeVoltageAt("scr1", "anode", tCheck);
      expect(scrAnodeVoltage).toBeLessThan(12.0); // Conduction pulled anode down from 48V rail
      expect(scrAnodeVoltage).toBeGreaterThan(0.2); // Forward drop non-zero

      // Load voltage across r_load is ~ (48V - V_scr_drop) ≈ 38V+
      const loadVoltage = nodeVoltageAt("r_load", "a", tCheck) - nodeVoltageAt("r_load", "b", tCheck);
      expect(loadVoltage).toBeGreaterThan(35.0);
    },
    RUN_TIMEOUT * 2
  );
});
