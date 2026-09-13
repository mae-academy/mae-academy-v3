/**
 * Real-ngspice.wasm regression coverage for the DC motor macromodel (validation spec Section XII).
 * Same full-pipeline `simulate()` as ngspiceRegression.test.ts — see ngspiceRegressionHelpers.ts.
 *
 * Scope note: this file covers the DC motor only. The `motor-3phase` canvas part maps to three plain
 * resistors (spiceAdapter.ts's `motor-3phase` case — one per phase, sized from nominal V/P, no
 * winding inductance, no rotor, no slip), not a real induction machine, so synchronous
 * speed/slip/DOL-starting/soft-start (the spec's own Tests 12.3-12.5 and most of its "+10 bonus"
 * list) describe dynamics this engine doesn't model at all — implementing a real induction-motor
 * macromodel was scoped out of this session. See this session's scoping discussion.
 *
 * The DC motor (`motor-dc`) *is* a real electromechanical model (spiceAdapter.ts's `motor-dc` case,
 * netlistGenerator.ts's `.SUBCKT` macro): armature R+L in series with a back-EMF dependent source,
 * driving a mechanical analogue circuit (torque as current, inertia as a capacitor, viscous friction
 * as a resistor) whose node voltage is literal shaft speed in rad/s. That internal "SPD" node isn't
 * wired to any canvas terminal, so speed is inferred the same way a bench measurement would: from the
 * armature current and the motor's own known Ra/Ke via E_back = V - I_a·R_a, ω = E_back/K_e — exactly
 * the spec's own worked method, not a shortcut. Props not exposed in the canvas UI
 * (armatureResistance, backEmfConstant, torqueConstant, viscousFriction, loadTorque) are still read
 * by spiceAdapter.ts's `num()` helper when set directly on the test component, the same way
 * `voltageReference` is set directly in ngspiceRegression.sources.test.ts.
 *
 * SI-consistent motor constants are used throughout (Ke = Kt = 0.1 V·s/rad = N·m/A, "equal in SI for
 * an ideal machine" per spiceAdapter.ts's own doc comment) rather than the spec's own worked example,
 * whose rpm-based constant (k=100 rpm/V) and its Nm-based torque constant (0.1 Nm/A) aren't
 * dimensionally reconcilable with each other or with its own arithmetic (e.g. "N = E_back/k =
 * 11.75/100 = 0.1175" is then relabeled "117.5 rpm" — off by exactly 1000x, a unit slip, not a
 * value this file reproduces).
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";
import { probeBranchKey } from "@/simulators/circuit-engine/engine/spice/spiceAdapter";

const ARMATURE_RESISTANCE = 0.05; // Ω
const BACK_EMF_CONSTANT = 0.1; // V·s/rad
const TORQUE_CONSTANT = 0.1; // N·m/A
const VISCOUS_FRICTION = 0.0001; // N·m·s/rad — light bearing friction only.

function motorCircuit(voltage: number, loadTorque: number) {
  const components = [
    part("g", "ground"),
    part("v1", "dc-voltage", { voltage }),
    part("am1", "ammeter"),
    part("m1", "motor-dc", {
      nominalV: 12,
      nominalPower: 100,
      armatureResistance: ARMATURE_RESISTANCE,
      backEmfConstant: BACK_EMF_CONSTANT,
      torqueConstant: TORQUE_CONSTANT,
      viscousFriction: VISCOUS_FRICTION,
      loadTorque,
    }),
  ];
  const wires = [
    wire("w1", "v1", "pos", "am1", "pos"),
    wire("w2", "am1", "neg", "m1", "pos"),
    wire("w3", "m1", "neg", "g", "gnd"),
    wire("w4", "v1", "neg", "g", "gnd"),
  ];
  return { components, wires };
}

/** Steady-state armature current and the speed inferred from it (E_back = V - Ia·Ra, ω = E_back/Ke). */
async function motorSteadyState(voltage: number, loadTorque: number) {
  const { components, wires } = motorCircuit(voltage, loadTorque);
  const { readings } = await simulate(components, wires, "practical");
  const armatureCurrent = readings.am1.value;
  const backEmf = voltage - armatureCurrent * ARMATURE_RESISTANCE;
  const speedRadPerSec = backEmf / BACK_EMF_CONSTANT;
  return { armatureCurrent, backEmf, speedRadPerSec };
}

describe("ngspice regression: DC motor (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 12.1 — no-load characteristics", () => {
    it(
      "at 12 V, no-load current is small and back-EMF sits close to the applied voltage",
      async () => {
        const { armatureCurrent, backEmf, speedRadPerSec } = await motorSteadyState(12, 0);
        // Light friction only: current should be a small fraction of what a stalled/loaded motor draws.
        expect(armatureCurrent).toBeGreaterThan(0);
        expect(armatureCurrent).toBeLessThan(0.5);
        expect(backEmf).toBeGreaterThan(11.9); // Within ~1% of the 12 V rail.
        expect(speedRadPerSec).toBeGreaterThan(110);
      },
      RUN_TIMEOUT
    );

    it(
      "no-load speed scales with applied voltage (back-EMF-dominated regime, current stays small throughout)",
      async () => {
        const at6 = await motorSteadyState(6, 0);
        const at12 = await motorSteadyState(12, 0);
        const at24 = await motorSteadyState(24, 0);
        // Roughly proportional: doubling V roughly doubles ω, since Ia (and its IaRa drop) stays small
        // at every level.
        expect(at12.speedRadPerSec / at6.speedRadPerSec).toBeCloseTo(2, 1);
        expect(at24.speedRadPerSec / at12.speedRadPerSec).toBeCloseTo(2, 1);
        expect(at6.armatureCurrent).toBeLessThan(0.5);
        expect(at24.armatureCurrent).toBeLessThan(0.5);
      },
      RUN_TIMEOUT * 3
    );

    it(
      "torque balance holds at no load: Kt·Ia ≈ B·ω (friction is the only opposing torque)",
      async () => {
        const { armatureCurrent, speedRadPerSec } = await motorSteadyState(12, 0);
        const motorTorque = TORQUE_CONSTANT * armatureCurrent;
        const frictionTorque = VISCOUS_FRICTION * speedRadPerSec;
        expect(Math.abs(motorTorque - frictionTorque) / frictionTorque).toBeLessThan(0.02);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 12.2 — loaded characteristics", () => {
    it(
      "a 0.5 N·m load raises current, drops speed, and satisfies Kt·Ia = T_load + B·ω",
      async () => {
        const noLoad = await motorSteadyState(12, 0);
        const loaded = await motorSteadyState(12, 0.5);
        expect(loaded.armatureCurrent).toBeGreaterThan(noLoad.armatureCurrent * 5);
        expect(loaded.speedRadPerSec).toBeLessThan(noLoad.speedRadPerSec);
        const motorTorque = TORQUE_CONSTANT * loaded.armatureCurrent;
        const opposingTorque = 0.5 + VISCOUS_FRICTION * loaded.speedRadPerSec;
        expect(Math.abs(motorTorque - opposingTorque) / opposingTorque).toBeLessThan(0.02);
      },
      RUN_TIMEOUT * 2
    );

    it(
      "power balance: P_in ≈ P_loss (I²R) + P_mech (T_total·ω)",
      async () => {
        const voltage = 12;
        const loadTorque = 0.5;
        const { armatureCurrent, speedRadPerSec } = await motorSteadyState(voltage, loadTorque);
        const inputPower = voltage * armatureCurrent;
        const copperLoss = armatureCurrent * armatureCurrent * ARMATURE_RESISTANCE;
        const totalTorque = TORQUE_CONSTANT * armatureCurrent; // = T_load + friction, at steady state.
        const mechanicalPower = totalTorque * speedRadPerSec;
        expect(Math.abs(inputPower - (copperLoss + mechanicalPower)) / inputPower).toBeLessThan(0.02);
      },
      RUN_TIMEOUT
    );

    it(
      "speed decreases and current increases monotonically as load torque increases",
      async () => {
        const loadTorques = [0, 0.2, 0.5, 1.0];
        const results = await Promise.all(loadTorques.map(t => motorSteadyState(12, t)));
        for (let i = 1; i < results.length; i += 1) {
          expect(results[i].armatureCurrent).toBeGreaterThan(results[i - 1].armatureCurrent);
          expect(results[i].speedRadPerSec).toBeLessThan(results[i - 1].speedRadPerSec);
        }
      },
      RUN_TIMEOUT * 4
    );
  });

  describe("Test 12.3 — the ammeter's branch current is the same current driving the back-EMF equation", () => {
    it(
      "a transient run settles to the same steady-state current .op finds directly",
      async () => {
        const { components, wires } = motorCircuit(12, 0.3);
        const { readings, results } = await simulate(components, wires, "practical", [".tran 0.002 0.6"]);
        const branch = results.branchCurrents[probeBranchKey("am1")];
        const settled = branch[branch.length - 1];
        expect(settled).toBeCloseTo(readings.am1.value, 2);
      },
      RUN_TIMEOUT
    );
  });
});
