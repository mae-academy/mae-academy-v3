# Industrial Stress Audit — Post-Refactor Re-Audit (RC-01 … RC-09)

Companion to `industrial-stress-audit.report.md` (the pre-fix findings, left untouched as the baseline record).
Reproduce: `npx vitest run client/src/simulators/circuit-engine/engine/industrial-stress-audit.test.ts` (≈ 39 s, deterministic).
Regression tests for each fix: `solverRefactor.test.ts` (36 tests) and `realEigen.test.ts` (5 tests).

## 1. Result

| Metric | Before | After |
|---|---:|---:|
| Circuits passed | 534 / 975 | **973 / 975** |
| Pass rate | 54.77 % | **99.79 %** |
| Circuits fixed / regressed | — | **+439 / 0** (every circuit that passed before still passes) |
| Unit suite (`circuit-engine`, audit excluded) | 713 pass, 2 fail | 754 pass, 2 fail (the same two `AnalysisBox` UI tests, unrelated and failing on `HEAD`) |
| `tsc --noEmit` (whole project) | clean | clean |

### Six audit pillars

| Pillar | Circuits | Before | Before % | After | After % | Δ |
|---|---:|---:|---:|---:|---:|---:|
| 1. Complex active analog & op-amp systems | 254 | 185 | 72.83 % | 252 | 99.21 % | +67 |
| 2. Transistor biasing & multi-stage amplifiers | 161 | 11 | 6.83 % | 161 | 100.00 % | +150 |
| 3. Reactive, resonant & dynamic networks | 128 | 113 | 88.28 % | 128 | 100.00 % | +15 |
| 4. Synthetic sub-circuits & IC emulations (555 / R-2R / H-bridge) | 134 | 18 | 13.43 % | 134 | 100.00 % | +116 |
| 5. Passive power, AC bridges & polyphase networks | 174 | 112 | 64.37 % | 174 | 100.00 % | +62 |
| 6. Student-mistake edge cases & degenerate topologies | 124 | 95 | 76.61 % | 124 | 100.00 % | +29 |
| **Total** | **975** | **534** | **54.77 %** | **973** | **99.79 %** | **+439** |

Protected groups: the 128 reactive/resonant circuits (113 → **128**; the 15 baseline losses were all MeshSolver-fallback / extreme-scale items), all 36 AC bridges, all 24 polyphase systems and all 16 R-2R full-code sweeps (monotonic, INL/DNL unchanged) remain at 100 %.

### Solver ranking

| Solver | Runs | Before | After |
|---|---:|---:|---:|
| mnaSolver | 531 | 505 (95.1 %) | **531 (100 %)** |
| NodalSolver | 505 | 477 (94.5 %) | **505 (100 %)** |
| MeshSolver — topology fallback | 283 | 139 (49.1 %) | **283 (100 %)** |
| MeshSolver — workspace geometry | 124 | 124 (100 %) | 124 (100 %) |
| analogDocumentedMna | 668 | 640 (95.8 %) | **668 (100 %)** |
| analogSimulation (engine + Newton) | 693 | 442 (63.8 %) | **691 (99.7 %)** |

### Families that changed

| Pillar | Family | Circuits | Before | After |
|---|---|---:|---:|---:|
| P1 | instrumentation-amp | 24 | 0 | 24 |
| P1 | schmitt-trigger | 16 | 0 | 16 |
| P1 | peak-detector | 14 | 10 | 14 |
| P1 | rail-clamp | 30 | 26 | 30 |
| P1 | sallen-key | 70 | 69 | 70 |
| P1 | log-antilog | 36 | 23 | 35 ¹ |
| P1 | precision-rectifier | 40 | 33 | 39 ¹ |
| P2 | bjt-multistage / bjt-switch / darlington | 36 | 3 | 36 |
| P2 | current-mirror | 42 | 5 | 42 |
| P2 | differential-pair | 40 | 0 | 40 |
| P2 | cmos-inverter / cmos-analog-amp | 43 | 3 | 43 |
| P3 | extreme-scale | 40 | 25 | 40 |
| P4 | 555-timer | 16 | 0 | 16 |
| P4 | h-bridge (incl. kickback) | 28 | 0 | 28 |
| P4 | state-retention | 4 | 0 | 4 |
| P4 | r2r-dac | 70 | 2 | 70 |
| P5 | attenuator-pad | 54 | 18 | 54 |
| P5 | dense-multisource | 24 | 0 | 24 |
| P5 | mutual-coupling | 12 | 10 | 12 |
| P6 | invalid-values / zero-ohm / switch-closure | 32 | 3 | 32 |

¹ The two remaining failures — see §4.

## 2. What was changed, per root cause

| RC | Files | Resolution |
|---|---|---|
| **RC-01** Newton divergence | `analogNewtonMna.ts`, `analogSimulation.ts` | Junctions seeded at ≈ 0.65 V (forward) / 0 V (B-C) instead of a zero vector. SPICE `pnjlim` limiting per junction, applied to each device's own **linearization point** (never by moving source-pinned nodes, which the old code did). Forward-biased junctions never rise by more than +2 V per iteration. If plain Newton fails inside 20 iterations: **gmin stepping** (10⁻³ → 10⁻¹² S by decades), then **source stepping** 10 % → 100 % with adaptive step halving. One extra "polish" iteration so the committed point's KCL residual is quadratically small. Central-difference conductances with an enforced zero sum (the old one-sided differences injected ~7 kA of spurious equivalent current at a −362 V iterate). |
| **RC-02** Mesh fallback sign | `MeshSolver.ts` | `Z[k][l] = Σ R_b·c(k,b)·c(l,b)` from the actual cycle traversal: `−R` for opposite traversal, `+R` for same direction. Also fixed a second defect found on the way: a supermesh KVL row built by plain-summing meshes that traverse a shared current source in the *same* direction did not cancel the source's unknown voltage (now the null-space combination; the plain sum is kept whenever valid, so geometry-path output is unchanged). |
| **RC-03** Pivoting / certificate | `mnaSolver.ts`, `NodalSolver.ts`, `reducedNodalMatrix.ts`, `MeshSolver.ts` | `if (|factor| < 1e-12) continue` removed. Scaled partial pivoting; singularity judged on the row-scaled pivot (≤ 1e-14). Residual certificate is `‖Ax−b‖/(‖A‖‖x‖+‖b‖) ≤ 1e-9`. The reduced nodal matrix uses a subtraction-free (GTH) elimination for pure resistive networks and the nodal certificate is relative (1e-7, the previous absolute bound's order). All 24 instrumentation amps and the 6th-order Sallen-Key now solve. |
| **RC-03 addendum** Transformer cascades in nodal analysis | `reducedNodalMatrix.ts`, `NodalSolver.ts` | A CCCS controlled by a grounded VCVS branch current (the ideal transformer primary) is now stamped through KCL at the source's output node, and Step 2 of the derivation prints that expression instead of a `I_x = 0/R_x` placeholder. |
| **RC-04** Closed switches | `analogDocumentedMna.ts` | `R_on = 10 µΩ` (was 1 fΩ). Closed switches and any resistor below 1 mΩ are stamped as **branch-current unknowns** (`V₊−V₋−R·I = 0`), so their current is solved directly instead of being rounding noise from `ΔV/R`. A closed switch carrying > 10⁵ A is reported as a structured `short circuit` diagnostic (was 2.4×10¹⁶ A). |
| **RC-05** NaN/∞ poisoning | `analogDocumentedMna.ts`, `analogSimulation.ts` | All primitive parameters validated up front. Non-finite, negative or sub-nΩ resistance and non-finite time step raise `TabDMnaError`; a non-finite solution vector is refused. In the engine wrapper, a property that was *never set* still takes the component default, but one explicitly set to NaN/±∞ (or negative resistance) is a diagnostic — the old code silently solved a 1 kΩ / 1 nΩ circuit instead. |
| **RC-06** Op-amp rails & Schmitt | `analogSimulation.ts`, `realEigen.ts` | Rails ±`vcc` (default ±15 V, `railMargin` subtracted for the realistic model). Piecewise-linear output stage with three modes (linear / +rail / −rail); Newton runs with modes frozen and an outer loop moves any op-amp whose solution contradicts its mode. Modes persist between steps (the hysteresis memory). At power-up, a linear equilibrium that is unstable under net positive feedback (DC loop gain `A·H ≥ 1`, tested from the eigenvalues of `H − I/A`) is latched to the rail the output would run to starting from 0 V. |
| **RC-07** BJT saturation | `analogSimulation.ts` | Ebers–Moll transport model with a B-C junction: `Ic = β·I_BE − (β_R+1)·I_BC`, `β_R` derived from the part's `vceSat` property so forced-gain-10 saturation lands at that V_CE(sat) (0.2 V default). Forward-active behaviour is unchanged (`Ic = β·Ib`). |
| **RC-08** Reactive state | `analogSimulation.ts`, `analogDocumentedMna.ts` | `setCircuit()` keeps capacitor voltages and inductor currents of parts that are unchanged (same type and wiring) — a 24.000 A winding no longer reads 0.000 A after a switch toggle. If fewer than half the parts are unchanged the circuit is treated as replaced and starts from rest, exactly as before; `reset()` still discharges. Flyback convergence (14 H-bridge cases) fixed by RC-01 plus a 10⁻¹² S leakage across every modelled junction. |
| **RC-09** Micro-currents | `MeshSolver.ts` | `Math.abs(x) < 1e-12 ? 0 : x` removed; rank test is row-equilibrated and the pivot test is scaled, so 5×10⁻³⁰ A is reported as such. |

## 3. Judgement calls and deviations from the directive

1. **±2 V junction swing** is applied to *forward-biased* junctions. Reverse-going updates are not limited: a Shockley junction is flat there, and a symmetric cap made a legitimately deep reverse bias (an op-amp output at −5×10⁵ V before it latches) take hundreds of iterations. `pnjlim` still log-compresses a junction leaving reverse bias.
2. **The rail limiter sits in the output stage, not on the gain node.** The audit's own virtual-ground check reads the unclamped `A·(V₊−V₋)` node (`@U1:out`); clamping it would break `|V(in−)| ≤ |V(@out)|/A` for every saturating amplifier. Inside the rails the stage is exactly the old 50 Ω resistor, so linear circuits solve identically.
3. **`R_on = 10 µΩ` makes an ideal-source dead short reach 1.2×10⁶ A**, above the audit's physical bound; instead of reporting that number the engine raises a structured diagnostic above 10⁵ A. A student who closes a switch across a supply now sees a warning in the Tab D panel (as far as I traced, burn-out is decided elsewhere — `componentHealthCheck` on the DC MNA result — not by this engine).
4. **MOSFET drain current made continuous (not one of the nine RCs).** Channel-length modulation `(1+λ·Vds)` was applied only in saturation, so the I–V curve jumped at `Vds = Vov` and a CMOS inverter had *no* KCL root at its switching point (the audit's own homotopy failed there too). The factor now multiplies both branches (C¹).
5. **10⁻¹² S leakage across every modelled junction** (SPICE `gmin`) is part of the diode/BJT component models, so that gates, the harness and the engine all see the same circuit.

## 4. Changes to the audit instrument — please review

The solver changes alone do not change what a gate means, but several harness adapters embedded the *old engine's* assumptions. Each edit below is in `industrialAudit/` and I want it visible:

| File | Change | Why | Circuits that depend on it |
|---|---|---|---|
| `gates.ts` | Switch resistance imported from `analogDocumentedMna` (was literal 1e-15/1e15) | The gates re-derive switch currents as `ΔV/R`; they must use the engine's own constant | switch/H-bridge families |
| `ir.ts`, `backends.ts`, `gen_p4.ts` | Optional `vcc` on the `OA` element, forwarded to the engine's existing `vcc` property; the 555 generator passes its `Vcc` | The 555 benchmark asserts rails at `Vcc` but never declared them | 16 × 555 |
| `backends.ts` (`runEngine`) | The "declared linear" oracle is skipped when its own ideal solution drives an op-amp beyond the declared rail | An unbounded-VCVS reference is not a valid expectation for a saturated output; the rail and bistability checks of the same circuit judge it | rail-clamp saturating cases, Schmitt |
| `harness.ts`, `gen_p1.ts` | `bistable: true` on the 16 Schmitt circuits skips that oracle | Their unbounded reference is the *unstable* equilibrium; the physics check already requires a saturated state | 16 × Schmitt |
| `backends.ts` (`runNodal`) | Eliminated nodes take the potentials the reduced system implies (back-substitution); CCCS currents forwarded like the other branch variables | Previously the gates mixed reduced-system and MNA voltages; the CCCS list omitted dependent currents | `extreme-rc-10`, transformer cascades |

## 5. The two circuits that still fail — benchmark defects, not solver defects

Both demand an output beyond a rail that the *same test* also enforces; no solver can satisfy both.

* `P1/antilog-amp-diode-8` — Vin = 0.56 V, Rf = 10 kΩ. The test requires `V(out) = −25.60 V ± 1 %` and `|V(out)| ≤ 15 V`. The engine returns −14.925 V (saturated at the −15 V rail through 50 Ω).
* `P1/half-wave-rectifier-g4--5` — gain 4, Vin = −5 V. The test requires `V(out) = 20 V ± 0.1` and `|V(o)| ≤ 15 V`, but 20 V at `out` needs `o ≈ 20.65 V` behind a diode. The engine returns 14.358 V (rail − diode drop).

I left both expectations untouched. If the benchmark is corrected to expect the rail-limited value, the audit is 975 / 975.

## 6. Performance (real-time loop)

Per-frame cost of `step(1/60)` on three representative nonlinear circuits, `HEAD` vs now: AC bridge rectifier 12.6 → **9.4 ms**; two-diode stage 2.2 → 2.1 ms; 1 kHz BJT amplifier **0 / 120 steps converged → 120 / 120** (213 ms/frame, which is the engine's fixed 50-samples-per-cycle step at 1 kHz — 833 sub-steps per frame at ≈ 0.26 ms each, the same per-sub-step cost as the rectifier). Audit wall time 34 s → 39 s.

## 7. Not changed

* `client/src/simulators/digital-logic/engine/` holds separate copies of `mnaSolver.ts`, `MeshSolver.ts`, `NodalSolver.ts`, `reducedNodalMatrix.ts`. They were outside the stated file list and are untouched; they still contain RC-03/RC-09-style code.
* `extreme-rc-10` passes only because the reduced nodal system is now exact (GTH) and the harness back-substitutes from it. Generic MNA still carries ~6 × 10⁻⁸ relative error on that matrix (entries 10⁻⁹ … 10³ S: `1000 + 1e-9` is stored to ±6×10⁻¹⁴); I tried an LU factorisation with iterative refinement using an error-free (double-double) residual and reverted it — it did not improve this case, because the loss is in the matrix entry, not in the elimination.
* Stability analysis for op-amp latching runs only at power-up (no history); a loop whose DC stability changes during a run is not re-evaluated.
