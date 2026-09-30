# Industrial Stress Audit — In-House Circuit Simulation Engine

**Status: REPORT ONLY. No engine, solver or application file was modified** (`git diff` is empty; the audit adds only `industrial-stress-audit.test.ts`, the `industrialAudit/` helper folder and this report).
Reproduce: `npx vitest run client/src/simulators/circuit-engine/engine/industrial-stress-audit.test.ts` (≈35 s, deterministic; set `AUDIT_REPORT_DIR` to choose where the JSON/Markdown report is written). The suite is **intentionally red**: each failing circuit is a recorded engine finding. It exits non-zero.

## 0. Scope, method and instrument calibration

**Systems under test (in-house TypeScript only; no WebAssembly/SPICE):** `mnaSolver.ts` (`MNASolver`), `NodalSolver.ts`, `MeshSolver.ts` (two paths: topology-fallback and workspace-geometry, the path the app uses), `analogDocumentedMna.ts` (`TabDDocumentedMna`, LU + backward Euler), `analogNewtonMna.ts` and `analogSimulation.ts` (`TabDSimulationEngine`, exercised through real component/wire graphs via `compileDocumentedPrimitives`).

**Benchmark:** 975 procedurally generated circuits (seeded PRNG, byte-identical every run) in six pillars, executed on 2804 solver runs. Each circuit is one test; it passes only if **every** solver assigned to it satisfies **every** gate.

**Gates applied to every solver result** (`industrialAudit/gates.ts`):
1. **KCL** at every node including ground, `|ΣI| ≤ 1e-4 A`, evaluated on two views: currents as *reported* by the solver and currents *re-derived* from its node voltages through each element law.
2. **KVL** around every fundamental cycle of a spanning forest, `|ΣV| ≤ 1e-3 V`, using *constitutive* branch voltages (`R·i`, declared source value, `gain·v_ctrl`) — not node differences, which would make KVL a tautology — plus a branch-law check that each constitutive voltage equals the node-potential difference its terminals carry.
3. **Tellegen power balance**: Σ delivered by sources vs Σ absorbed by everything else, `≤ 0.1 %` (+ a 1 nW absolute floor, below which double-precision noise in VCVS branch currents makes a relative test meaningless).
4. **Numerical sanity**: no NaN / ±Infinity / `null` / missing entries; singular or non-convergent systems must raise a *structured* diagnostic (`MNAError`, `TabDMnaError`, `status:'error'`). Unstructured exceptions count as failures (**0 occurred — every refusal in the suite was structured**).

**Independent instruments** (owned by the harness, never part of the engine): an equilibrated partial-pivot LU reference solver with iterative refinement and an ∞-norm condition number (accept band `max(1e-7·scale, 50·κ·ε·scale)`); a complex-MNA phasor oracle for AC bridges and polyphase networks (backward-Euler transient accepted within a documented 1.5–2 % of source amplitude); a Newton-polish check that an engine operating point is a true KCL root; and a **source-stepping homotopy solver** used as an *existence proof* whenever the engine's Newton loop gives up. Analytic physics (divider ratios, R-2R `Vref·code/2ⁿ`, pad insertion loss, Schering/Maxwell/Anderson balance, BJT mirror/diff-pair current splits, log/antilog laws, op-amp closed-loop gains, charge/flux conservation) is asserted where a closed form exists.

**Calibration.** The suite self-tests its own instruments (7 positive/negative controls: healthy solution passes; corrupted node voltage, wrong-signed source current, violated source constraint, NaN/Inf/missing entries are each detected; oracles are exact on analytic cases). Calibration caught a blind spot in an earlier draft of the gates (node-voltage corruption was invisible when reported currents were self-consistent), which was fixed *in the harness* before the final run.

**Triage discipline.** Every failure cluster was examined to separate engine defects from harness artefacts; harness bugs found and fixed along the way (and therefore *not* in this report): parallel edges drawn as coincident segments in two layouts, a too-tight virtual-ground bound that ignored the 50 Ω output resistor, reactive netlists compared to a DC reference before settling, a wrong germanium leakage expectation, a too-tight 1 pW power floor, and a message-classification bug. Root causes below are backed by reproduction experiments, stated per finding.

**Model/assumption notes a reviewer should know.** Op-amps use the engine's own macromodel (finite gain A = 10⁶, 50 Ω output, 1 TΩ inputs; declared supply rails ±15 V); the engine's `opamp` has no supply terminals, so rail checks apply only to the engine's component path. Mutual coupling is exercised with the engine's ideal-transformer macromodel (the engine has no coupled-inductor primitive). The Schmitt/bistability and BJT-saturation checks are *physical-plausibility* criteria (a DC solver must not return an unstable equilibrium or a forward-biased collector junction beyond saturation), flagged as model-fidelity findings rather than solver-arithmetic errors.

## 1. Executive metrics

| Metric | Value |
|---|---|
| Total circuits executed | **975** |
| Circuits passed (every assigned solver satisfied every gate) | **534** |
| Circuits failed | **441** |
| Exact pass percentage | **54.77 %** |
| Total solver executions | 2804 |
| Solver executions passed | 2327 (82.99 %) |
| Failure records (gate/physics/diagnostic violations) | 910 |

### Failure attribution (which solver(s) failed on each failing circuit)

| Failing solver set | Circuits |
|---|---:|
| engine | 242 |
| mesh | 143 |
| mna + nodal | 25 |
| tabd | 19 |
| engine + tabd | 9 |
| nodal | 2 |
| mesh + mna + nodal | 1 |

## 2. Category breakdown (six pillars)

| Pillar | Circuits | Passed | Failed | Pass rate |
|---|---:|---:|---:|---:|
| 1. Complex active analog & op-amp systems | 254 | 185 | 69 | 72.83 % |
| 2. Transistor biasing & multi-stage amplifiers | 161 | 11 | 150 | 6.83 % |
| 3. Reactive, resonant & dynamic networks | 128 | 113 | 15 | 88.28 % |
| 4. Synthetic sub-circuits & IC emulations (555 / R-2R DAC / H-bridge) | 134 | 18 | 116 | 13.43 % |
| 5. Passive power, AC bridges & polyphase networks | 174 | 112 | 62 | 64.37 % |
| 6. Student-mistake edge cases & degenerate topologies | 124 | 95 | 29 | 76.61 % |

### Family-level breakdown

| Pillar | Family | Circuits | Passed | Pass rate |
|---|---|---:|---:|---:|
| P1-OpAmp | instrumentation-amp | 24 | 0 | 0.00 % |
| P1-OpAmp | log-antilog | 36 | 23 | 63.89 % |
| P1-OpAmp | mfb-filter | 12 | 12 | 100.00 % |
| P1-OpAmp | peak-detector | 14 | 10 | 71.43 % |
| P1-OpAmp | precision-rectifier | 40 | 33 | 82.50 % |
| P1-OpAmp | rail-clamp | 30 | 26 | 86.67 % |
| P1-OpAmp | sallen-key | 70 | 69 | 98.57 % |
| P1-OpAmp | schmitt-trigger | 16 | 0 | 0.00 % |
| P1-OpAmp | state-variable | 12 | 12 | 100.00 % |
| P2-Transistor | bjt-multistage | 24 | 0 | 0.00 % |
| P2-Transistor | bjt-switch | 8 | 1 | 12.50 % |
| P2-Transistor | cmos-analog-amp | 16 | 0 | 0.00 % |
| P2-Transistor | cmos-inverter | 27 | 3 | 11.11 % |
| P2-Transistor | current-mirror | 42 | 5 | 11.90 % |
| P2-Transistor | darlington | 4 | 2 | 50.00 % |
| P2-Transistor | differential-pair | 40 | 0 | 0.00 % |
| P3-Reactive | cap-parallel-loop | 18 | 18 | 100.00 % |
| P3-Reactive | extreme-scale | 40 | 25 | 62.50 % |
| P3-Reactive | inductor-cutset | 15 | 15 | 100.00 % |
| P3-Reactive | rlc-ladder | 25 | 25 | 100.00 % |
| P3-Reactive | twin-T | 16 | 16 | 100.00 % |
| P3-Reactive | wien-bridge | 14 | 14 | 100.00 % |
| P4-IC | 555-timer | 16 | 0 | 0.00 % |
| P4-IC | h-bridge | 28 | 0 | 0.00 % |
| P4-IC | r2r-dac | 70 | 2 | 2.86 % |
| P4-IC | r2r-dac-sweep | 16 | 16 | 100.00 % |
| P4-IC | state-retention | 4 | 0 | 0.00 % |
| P5-Bridge | ac-bridge | 36 | 36 | 100.00 % |
| P5-Bridge | attenuator-pad | 54 | 18 | 33.33 % |
| P5-Bridge | dense-multisource | 24 | 0 | 0.00 % |
| P5-Bridge | mutual-coupling | 12 | 10 | 83.33 % |
| P5-Bridge | polyphase | 24 | 24 | 100.00 % |
| P5-Bridge | star-delta | 24 | 24 | 100.00 % |
| P6-Student | dangling-node | 8 | 8 | 100.00 % |
| P6-Student | dead-end-current | 6 | 6 | 100.00 % |
| P6-Student | floating-island | 14 | 14 | 100.00 % |
| P6-Student | floating-node-capacitive | 8 | 8 | 100.00 % |
| P6-Student | invalid-values | 10 | 0 | 0.00 % |
| P6-Student | multi-ground | 8 | 8 | 100.00 % |
| P6-Student | no-ground | 6 | 6 | 100.00 % |
| P6-Student | parallel-voltage-sources | 12 | 12 | 100.00 % |
| P6-Student | series-current-sources | 8 | 8 | 100.00 % |
| P6-Student | shorted-resistor | 4 | 4 | 100.00 % |
| P6-Student | shorted-source | 6 | 6 | 100.00 % |
| P6-Student | switch-closure | 14 | 3 | 21.43 % |
| P6-Student | trivial | 4 | 4 | 100.00 % |
| P6-Student | voltage-source-loop | 8 | 8 | 100.00 % |
| P6-Student | zero-ohm | 8 | 0 | 0.00 % |

## 3. Solver ranking & comparison

Every solver execution is graded against the same gates. _Oracle error_ is the max node-voltage deviation from the harness-owned equilibrated-LU reference solve, normalised by the largest node voltage.

| Solver | Runs | Passed | Solved | Structured diagnostic | Newton non-conv. | Unstructured crash | Median worst-node KCL | Worst KCL | Worst KVL | Worst power mismatch | Median oracle rel. error | Worst oracle error / allowance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mnaSolver (MNASolver, strict DC MNA) | 531 | 505 (95.10 %) | 429 | 102 | 0 | 0 | 6.80e-18 A | 7.23e-11 A | 1.18e-9 V | 1.87e+2 % | 8.88e-17 | 1.17e-3 |
| analogDocumentedMna (TabDDocumentedMna, LU + backward Euler) | 668 | 640 (95.81 %) | 605 | 63 | 0 | 0 | 2.08e-17 A | Infinity A | Infinity V | 1.00e+2 % | 8.88e-17 | 5.00e+6 |
| NodalSolver (reduced nodal matrix + MNA certificate) | 505 | 477 (94.46 %) | 401 | 104 | 0 | 0 | 8.42e-18 A | 3.75e-5 A | 8.21e-10 V | 1.87e+2 % | 5.55e-17 | 1.40e-3 |
| analogSimulation (TabDSimulationEngine + TabDNewtonMna) | 693 | 442 (63.78 %) | 448 | 74 | 171 | 0 | 3.06e-17 A | 2.31e+0 A | 8.51e-10 V | 1.27e+2 % | 8.88e-17 | 1.00e+7 |
| MeshSolver — topology-fallback path (no workspace geometry) | 283 | 139 (49.12 %) | 209 | 74 | 0 | 0 | 1.43e-8 A | 1.40e+3 A | 1.80e+6 V | 1.14e+2 % | NaN | 0 |
| MeshSolver — workspace-geometry path (as used by the app) | 124 | 124 (100.00 %) | 124 | 0 | 0 | 0 | 6.51e-19 A | 6.94e-17 A | 6.22e-15 V | 6.27e-14 % | NaN | 0 |

### Per-pillar solver pass rates

| Pillar | Solver | Runs | Passed | Rate |
|---|---|---:|---:|---:|
| P1-OpAmp | mna | 164 | 139 | 84.76 % |
| P1-OpAmp | tabd | 164 | 164 | 100.00 % |
| P1-OpAmp | nodal | 164 | 139 | 84.76 % |
| P1-OpAmp | engine | 236 | 192 | 81.36 % |
| P2-Transistor | engine | 161 | 11 | 6.83 % |
| P3-Reactive | tabd | 128 | 128 | 100.00 % |
| P3-Reactive | mna | 65 | 64 | 98.46 % |
| P3-Reactive | nodal | 65 | 64 | 98.46 % |
| P3-Reactive | mesh | 20 | 5 | 25.00 % |
| P4-IC | mna | 78 | 78 | 100.00 % |
| P4-IC | tabd | 78 | 78 | 100.00 % |
| P4-IC | nodal | 70 | 70 | 100.00 % |
| P4-IC | mesh | 70 | 2 | 2.86 % |
| P4-IC | meshG | 70 | 70 | 100.00 % |
| P4-IC | engine | 72 | 24 | 33.33 % |
| P5-Bridge | mna | 114 | 114 | 100.00 % |
| P5-Bridge | tabd | 174 | 174 | 100.00 % |
| P5-Bridge | nodal | 104 | 102 | 98.08 % |
| P5-Bridge | mesh | 102 | 42 | 41.18 % |
| P5-Bridge | meshG | 54 | 54 | 100.00 % |
| P5-Bridge | engine | 114 | 114 | 100.00 % |
| P6-Student | mna | 110 | 110 | 100.00 % |
| P6-Student | tabd | 124 | 96 | 77.42 % |
| P6-Student | nodal | 102 | 102 | 100.00 % |
| P6-Student | mesh | 91 | 90 | 98.90 % |
| P6-Student | engine | 110 | 101 | 91.82 % |

### Numerical precision by topology family (median oracle-relative error; wins = lowest error on the circuit)

| Family | Solver | Circuits compared | Median rel. error | Wins |
|---|---|---:|---:|---:|
| attenuator-pad | mna | 54 | 4.44e-17 | 54 |
| attenuator-pad | tabd | 54 | 6.66e-17 | 54 |
| attenuator-pad | nodal | 54 | 3.33e-17 | 54 |
| attenuator-pad | engine | 54 | 1.11e-17 | 54 |
| dangling-node | mna | 8 | 0 | 8 |
| dangling-node | tabd | 8 | 0 | 8 |
| dangling-node | nodal | 8 | 4.44e-17 | 8 |
| dangling-node | engine | 8 | 8.88e-17 | 8 |
| dense-multisource | mna | 24 | 3.38e-16 | 24 |
| dense-multisource | tabd | 24 | 2.32e-16 | 24 |
| dense-multisource | nodal | 24 | 1.61e-16 | 24 |
| dense-multisource | engine | 24 | 2.32e-16 | 24 |
| extreme-scale | mna | 31 | 1.48e-16 | 31 |
| extreme-scale | tabd | 19 | 1.48e-16 | 19 |
| extreme-scale | nodal | 31 | 2.31e-17 | 24 |
| instrumentation-amp | tabd | 24 | 1.64e-10 | 6 |
| instrumentation-amp | engine | 24 | 7.53e-11 | 21 |
| invalid-values | mna | 3 | 1.18e-16 | 3 |
| invalid-values | tabd | 4 | 9.98e-4 | 2 |
| invalid-values | nodal | 3 | 0 | 3 |
| invalid-values | engine | 4 | 1.67e-1 | 1 |
| mfb-filter | mna | 12 | 0 | 12 |
| mfb-filter | tabd | 12 | 0 | 12 |
| mfb-filter | nodal | 12 | 0 | 12 |
| multi-ground | mna | 8 | 0 | 8 |
| multi-ground | tabd | 8 | 0 | 8 |
| multi-ground | nodal | 8 | 0 | 8 |
| multi-ground | engine | 8 | 0 | 8 |
| mutual-coupling | mna | 12 | 1.11e-16 | 12 |
| mutual-coupling | tabd | 12 | 3.70e-17 | 12 |
| mutual-coupling | engine | 12 | 3.70e-17 | 12 |
| r2r-dac | mna | 70 | 8.88e-17 | 70 |
| r2r-dac | tabd | 70 | 1.18e-16 | 70 |
| r2r-dac | nodal | 70 | 8.88e-17 | 70 |
| r2r-dac | engine | 24 | 1.35e-16 | 24 |
| rail-clamp | mna | 30 | 2.83e-16 | 18 |
| rail-clamp | tabd | 30 | 2.77e-16 | 18 |
| rail-clamp | nodal | 30 | 0 | 30 |
| rail-clamp | engine | 30 | 2.77e-16 | 18 |
| rlc-ladder | mna | 25 | 1.07e-15 | 25 |
| rlc-ladder | nodal | 25 | 1.07e-15 | 25 |
| sallen-key | mna | 69 | 1.11e-16 | 44 |
| sallen-key | tabd | 51 | 6.35e-17 | 39 |
| sallen-key | nodal | 69 | 1.11e-16 | 62 |
| schmitt-trigger | mna | 16 | 9.59e-12 | 8 |
| schmitt-trigger | tabd | 16 | 1.05e-11 | 5 |
| schmitt-trigger | nodal | 16 | 2.13e-16 | 15 |
| schmitt-trigger | engine | 16 | 1.66e-11 | 5 |
| shorted-resistor | mna | 4 | 0 | 4 |
| shorted-resistor | tabd | 4 | 0 | 4 |
| shorted-resistor | nodal | 4 | 0 | 4 |
| shorted-resistor | engine | 4 | 0 | 4 |
| star-delta | mna | 24 | 0 | 24 |
| star-delta | tabd | 24 | 0 | 24 |
| star-delta | nodal | 24 | 0 | 24 |
| star-delta | engine | 24 | 0 | 24 |
| state-variable | mna | 12 | 1.78e-16 | 12 |
| state-variable | tabd | 12 | 1.99e-16 | 12 |
| state-variable | nodal | 12 | 1.77e-16 | 12 |
| trivial | mna | 3 | 0 | 3 |
| trivial | tabd | 3 | 0 | 3 |
| trivial | nodal | 3 | 0 | 3 |
| trivial | engine | 3 | 0 | 3 |
| twin-T | mna | 8 | 8.88e-17 | 8 |
| twin-T | nodal | 8 | 0 | 8 |


### Interpretation of the solver ranking

* **Numerical precision (linear DC, vs the reference solve).** `mnaSolver`, `analogDocumentedMna` and `NodalSolver` agree with the reference to ≈1e-16 relative error on well-conditioned families (attenuator pads, dense networks, R-2R ladders, star-delta, transformer cascades, RLC ladders); differences below 1e-13 are ties and the "wins" column counts ties for every solver, so it does not discriminate there. On the extreme-scale (1 mΩ…1 MΩ) networks all three remain within rounding (median 1.5e-16, 1.5e-16, 2.3e-17 for MNA, TabD, Nodal) — no practically meaningful precision gap. The only family with a real precision separation is the op-amp instrumentation amplifier (κ ≈ 4e11–7e11): `TabDDocumentedMna` answers to 1.6e-10 and the engine to 7.5e-11, while `mnaSolver` and `NodalSolver` **refuse all 24** (RC-03).
* **Reliability (pass rate over all graded runs).** MeshSolver with workspace geometry 100.0 % (124/124) > `TabDDocumentedMna` 95.8 % (640/668) > `mnaSolver` 95.1 % (505/531) > `NodalSolver` 94.5 % (477/505) > `TabDSimulationEngine` 63.8 % (442/693) (dominated by Newton convergence, RC-01) > MeshSolver topology-fallback 49.1 % (139/283) (RC-02).
* **Which solver for which topology.** Linear resistive networks of any size: `mnaSolver` ≈ `NodalSolver` ≈ `TabDDocumentedMna` (prefer the last when op-amp-gain matrices or ≥1e11 dynamic range are involved). Planar mesh analysis: only with workspace geometry. Reactive and AC circuits: `TabDDocumentedMna` passed all 128 reactive circuits, all 36 AC bridges (phasor agreement within the documented backward-Euler band) and all 24 polyphase systems (exact neutral-current cancellation for balanced loads), with charge and flux conserved. Nonlinear circuits: only the engine can run them, and it fails to converge on most.
* **What works well:** zero unstructured exceptions in 2804 solver runs; every parallel-source, series-current-source, floating-island, no-ground and voltage-loop degenerate case produced a structured diagnostic or a gate-satisfying solution; all 16 R-2R full-code sweeps (8- and 10-bit, 2ⁿ codes each) are strictly monotonic with INL/DNL ≈ 1e-12 V; capacitor-loop charge redistribution and inductor cut-set current mismatches are resolved exactly (charge and KCL conserved).

## 4. Root-cause analysis (curated, evidence-backed)

Counts are *distinct circuits* (a circuit may appear under several causes). Severity reflects impact on a student/engineer using the simulator. All remedies are **recommendations only — nothing was changed**.

### RC-01 · CRITICAL · `TabDNewtonMna` does not converge from a zero initial guess on standard nonlinear circuits
* **Affected:** 171 circuits (P1: 18, P2: 127, P4: 26) — every BJT cascade/class-AB stage (24/24), 37 of 42 current mirrors, 24 of 40 differential pairs (the other 16 hit the false-singular path below), all 16 CMOS self-bias amplifiers, 24 CMOS-inverter points/sweeps, 12 log/anti-log amplifiers, 6 precision rectifiers, the 555 equivalent at Vcc ≥ 9 V (12/16) and 14 H-bridge flyback states. Examples: `P1/full-wave-rectifier-10000-5`, `P1/full-wave-rectifier-22000-1`, `P1/full-wave-rectifier-22000-5`.
* **Symptom:** `Newton-Raphson did not converge after 50 iterations`; the snapshot returns `converged:false` with an empty node map.
* **Existence proof:** an independent source-stepping homotopy finds an operating point for **157 of 171** failing runs (14 are scripted switching flows that were not proof-tested). Warm-starting the engine's *own* Newton loop at that solution converges on 7/7 sampled circuits, so the circuits are solvable and the loop is merely not globally convergent. 500 iterations + damping 0.5 rescues only 3 of 6 sampled circuits.
* **Traced mechanism (differential pair, ideal tail source):** at x₀=0 each junction's companion conductance is Is/Vt ≈ 3.9e-14 S, so the 1 mA tail source drives the first iterate to **−1.28×10⁸ V**; the junction re-projection then shifts source-pinned nodes too (V_i1.pos = −1.28e8 V); by iteration 3 the emitter node is at 3×10¹⁹ V and the linearisation degenerates to `Singular MNA matrix` — a *false* singular diagnostic on a well-posed circuit (**16 circuits**, e.g. `P2/diffpair-bjt-ideal-tail-0`, `P2/diffpair-bjt-ideal-tail-1`).
* **Not a defect of these circuits' design:** the same netlists pass the independent homotopy, and simple cases (single diode, 12 V/1 kΩ) converge.
* **Recommendation:** gmin stepping / source stepping fallback, per-iteration voltage-step clamp on *all* nodes, initial guess from a linear solve with a junction conductance floor, and never re-project source-pinned nodes.

### RC-02 · HIGH · `MeshSolver` topology-fallback assumes opposite traversal of every shared resistor
* **Affected:** 144 circuits (P3: 15, P4: 68, P5: 60, P6: 1); the fallback path passes only 49.1 % of its 283 runs. The workspace-geometry path fails **0** of its 124 runs.
* **Mechanism:** `assembleMeshImpedance` hard-codes `Z[k][l] = −ΣR_shared`, valid only when neighbouring meshes are both clockwise faces. The fallback builds cycles from chord orientation (`buildMeshSystem`), so shared branches can be traversed in the *same* direction (T-pad: cycles `{R2:+1, R3:−1, RL:−1}` and `{Vs:−1, Rs:+1, R1:+1, R2:+1}` share R2 at +1/+1). Result: I(R2) = 0.1707 A instead of 0.0293 A.
* **Reproduction:** re-assembling the *same* cycles with signed shared terms reproduces MNA to **4e-17** (T-pad), 2e-17 (Bridged-T), 5.7e-14 / 2.8e-13 (extreme-scale ladders), 4e-19 (R-2R). The defect is precisely the sign, not the cycle basis or the solver.
* **Compounding:** the trace's "MNA branch-current verification" step prints the MNA currents, not mesh-reconstructed ones, so the derivation shown to a student is internally inconsistent with no self-check to flag it.
* **Exposure:** `AnalysisBox` constructs `MeshSolver(liveElements, geometry)`; `buildMeshSystem` falls back to the topology path whenever no resistor-bearing face is extracted (or `geometry` is absent). Severity is therefore HIGH for any caller/state that reaches the fallback and LOW for the geometry path, which passed every run.

### RC-03 · HIGH · `mnaSolver` rejects well-posed op-amp / high-dynamic-range circuits (scale-blind elimination skip and residual certificate)
* **Affected:** 26 circuits (P1: 25, P3: 1) raise `RESIDUAL_VIOLATION` in `MNASolver` (and therefore `NodalSolver`/`MeshSolver`): all 24 instrumentation amplifiers, a 6th-order Sallen-Key, one extreme-scale network. Examples: `P1/inamp-vcm-5-vd0.01-mm0`, `P1/inamp-vcm-5-vd0.01-mm0.001`, `P1/inamp-vcm-5-vd0.01-mm0.01`.
* **Mechanism A (elimination skip):** `gaussianSolve` does `if (Math.abs(factor) < PIVOT_EPSILON) continue;` (absolute 1e-12) — it *skips* the elimination update of small entries. The op-amp macromodel's 1 TΩ input leakage is exactly 1e-12 S. A verbatim replica of the algorithm reproduces the engine's reported residuals exactly (9.375e-7, 1.863e-9); removing only that skip drops the instrumentation-amp residual 9.4e-7 → 1.5e-11 and 1.9e-6 → 2.8e-13 and its node error 1.7e-10 → 2.6e-12 V.
* **Mechanism B (certificate threshold):** even without the skip, `||A·x−z||∞ ≤ 1e-9` is unscaled: for the 6th-order Sallen-Key (κ ≈ 1.2e12) the residual is 1.86e-9 both ways while the node-voltage error is 3.7e-10 V. Across the 166 linear P1/P3 circuits run through `mnaSolver`, the 140 accepted ones have median residual 1.4e-14 but maximum 9.3e-10 — the threshold sits at the double-precision floor for gain-10⁶ matrices.
* **Consequence:** a *correct* solution is refused with "Invalid Circuit". The certificate should be normalised by `‖A‖·‖x‖`, and the skip removed or made relative.
* Additionally `NodalSolver` rejects 2 ideal-transformer cascades with `Reduced nodal residual certificate failed` (CCCS controlled by a VCVS branch is not representable in the reduced matrix); this construct is not produced by the app's `compileDcTopology`, hence LOW severity.

### RC-04 · HIGH · Ideal-switch/short modelled as 1e-15 Ω (1e15 S) and `max(1e-15,|R|)` clamps corrupt branch currents and can falsely report a singular matrix
* **Affected:** 38 circuits (P4: 18, P6: 20): capacitor charge-sharing, source-into-capacitor, switch-shorted sources, zero-ohm resistors, R=1e-30 Ω, 14 H-bridge / switch-toggle scenarios, shoot-through.
* **Reported switch current is rounding noise:** `I = ΔV/1e-15`. Measured on an H-bridge drive state: closed switch Q1 reports **5.33 A** while the inductor and source both carry **4.80 A**; KCL residuals up to **2.31 A** (limit 1e-4 A).
* **False singular diagnostic:** a trivial two-capacitor charge-sharing circuit raises `Singular MNA matrix` (3 circuits). Sweeping only the switch resistance: 1e-15 Ω → *singular*; 1e-12 Ω → 0.1 % voltage error; ≥1e-9 Ω → exact. The failure is entirely the 1e15 S conductance: in the 2×2 charge-sharing matrix the second Schur pivot has true value 3×10⁻² but evaluates to **exactly 0** in double precision (catastrophic cancellation of 10¹⁵ − 10³⁰/10¹⁵), which trips the engine's absolute `|pivot| < 1e-18` test.
* **Unbounded currents without a diagnostic:** two ideal sources shorted through a closed switch return **2.4e+16 A** (P4 shoot-through ×4, P6 switch-shorts ×3).

### RC-05 · HIGH · Invalid parameters are not rejected outside `mnaSolver`
* **Affected:** 8 circuits (all P6 invalid-values). `mnaSolver`/`NodalSolver`/`MeshSolver` correctly raise `INVALID_ELEMENT`. `TabDDocumentedMna` instead **propagates NaN/±Infinity into the solution** (5 circuits fail the sanity gate: `node in: non-finite voltage (NaN)`, `V1: non-finite branch current (-Infinity)`), and `TabDSimulationEngine`'s property reader silently substitutes defaults (compiled resistance for `R=NaN` and `R=+∞` is 1000 Ω; verified) or clamps (`R=−1 kΩ` compiles to 1 nΩ in the engine and to |R| inside `TabDDocumentedMna`; `R=NaN` yields `V(x)=NaN` there), so the circuit solved is **not the circuit declared**: for `R=−1 kΩ` in a divider the declared solution is V(x) = 7.5 V, `TabDDocumentedMna` returns 3.75 V (|R|) and the engine ≈ 5.0 V (a 1 nΩ short).

### RC-06 · MEDIUM (model fidelity) · Tab D op-amp has no supply rails, saturation or bistability
* **Affected:** 19 circuits violate the declared ±15 V rails (worst |V| = **2.5e+06 V** — a peak detector with a −2.5 V input outputs −2.5×10⁶ V), and 11 Schmitt triggers return the *unstable linear equilibrium* (`Vout = Vin/β`) instead of a saturated state. `compileDocumentedPrimitives` reads only `gain`; `vcc`, `railMargin` and `model` are ignored (the op-amp is `A·(V+−V−)` referenced to ground).
* **Note:** the physical op-amp model lives in the SPICE path that this audit deliberately excluded; this is a gap only in the in-house solver path.

### RC-07 · MEDIUM (model fidelity) · BJT model has no saturation
* **Affected:** 9 circuits. `Ic = β·Ib` independent of V_CE: a saturated NPN switch reports V_CE down to **-852.6 V**; the 555 discharge transistor sits at −425.75 V. Forward-biased-collector operation beyond saturation is non-physical.

### RC-08 · MEDIUM · Reactive state is lost whenever the app edits a component, and flyback states do not converge
* **Affected:** 4 state-retention probes + 14 H-bridge kickback scenarios.
* **State loss (experiment):** `Home.tsx` calls `simulation.setCircuit()` for every property change (e.g. a switch toggle); `TabDSimulationEngine.setCircuit` resets the reactive history. Probe: a winding carrying **24.000 A** reads **0.000 A** on the first step after the toggle (backward-Euler relation violated; stored energy vanishes), so inductive kickback through the app's own switching path is impossible.
* **Flyback convergence:** with state preserved in-place (harness toggles the compiled component objects), Newton fails during the freewheel phase in 14 of 24 kickback scenarios (first step after switch-off or 3rd step of decay).

### RC-09 · LOW · `MeshSolver.solveMeshCurrents` flushes |I| < 1e-12 A to zero
* 1 circuit: 5 V across 1e30 Ω (I = 5e-30 A) is reported as 0 A and violates KVL by 5 V (`P6/invalid-value-9`). Any ≥ 5 TΩ loop is affected.

### Summary of severity
| ID | Severity | Solver / file | Circuits |
|---|---|---|---:|
| RC-01 | Critical | `analogNewtonMna.ts` | 171 (+16 false-singular) |
| RC-02 | High | `MeshSolver.ts` (fallback) | 144 |
| RC-03 | High | `mnaSolver.ts` (+Nodal/Mesh via MNA) | 26 (+2 nodal) |
| RC-04 | High | `analogDocumentedMna.ts` switch/clamp | 38 |
| RC-05 | High | `analogDocumentedMna.ts`, `analogSimulation.ts` value handling | 8 |
| RC-06 | Medium | `analogSimulation.ts` op-amp | 19 rails · 11 Schmitt |
| RC-07 | Medium | `analogSimulation.ts` BJT | 9 |
| RC-08 | Medium | `analogSimulation.ts` `setCircuit` + kickback NR | 4 + 14 |
| RC-09 | Low | `MeshSolver.ts` | 1 |

## 5. Auto-detected failure clusters (signature table)

| # | Solver | Kind | Circuits affected | Pillars | Representative symptom | Example circuit |
|---:|---|---|---:|---|---|---|
| 1 | engine | NEWTON_NONCONVERGENCE | 157 | P1-OpAmp, P2-Transistor, P4-IC | Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC opera | P1/half-wave-rectifier-g4-1 |
| 2 | mesh | KVL | 143 | P3-Reactive, P4-IC, P5-Bridge, P6-Student | KVL violated around cycle closed by R9 (n2→n4) | P3/extreme-resistive-4 |
| 3 | mesh | SOLVER_FAULT | 141 | P3-Reactive, P4-IC, P5-Bridge | mesh currents disagree with MNA branch currents by 2.591e-2 A | P3/extreme-resistive-4 |
| 4 | mesh | POWER | 135 | P3-Reactive, P4-IC, P5-Bridge | Power balance broken: delivered 1191.415242036 W vs absorbed 1851.680699215 W | P3/extreme-resistive-7 |
| 5 | mesh | KCL | 102 | P3-Reactive, P4-IC, P5-Bridge | KCL violated at node 0 (currents re-derived from node voltages) | P3/extreme-resistive-7 |
| 6 | mna | DIAGNOSTIC_ON_VALID | 26 | P1-OpAmp, P3-Reactive | Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (\|\|A·x-z\|\|∞=1.863e-9) | P1/sallen-key-LP-o6-K1.586-v-2.5 |
| 7 | nodal | DIAGNOSTIC_ON_VALID | 26 | P1-OpAmp, P3-Reactive | Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (\|\|A·x-z\|\|∞=1.863e-9) | P1/sallen-key-LP-o6-K1.586-v-2.5 |
| 8 | engine | RAIL_VIOLATION | 19 | P1-OpAmp, P4-IC | rail bound \|V(o)\| ≤ 15 V (declared supply rail) | P1/peak-detector-silicon--0.5 |
| 9 | tabd | KCL | 17 | P6-Student | KCL violated at node b | P6/switch-charge-sharing-3 |
| 10 | engine | DIAGNOSTIC_ON_VALID | 16 | P2-Transistor | Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homot | P2/diffpair-bjt-ideal-tail-0 |
| 11 | tabd | POWER | 13 | P6-Student | Power balance broken: delivered 0 W vs absorbed 1.44 W | P6/switch-charge-sharing-3 |
| 12 | engine | PHYSICS_MISMATCH | 11 | P1-OpAmp | bistable: output sits at a saturated state (\|Vout\| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) | P1/schmitt-inverting-1 |
| 13 | engine | POWER | 10 | P4-IC, P6-Student | Power balance broken: delivered 287.997683949 W vs absorbed 230.399980123 W | P4/h-bridge-kickback-2 |
| 14 | engine | KCL | 9 | P4-IC | KCL violated at node n:Q1:b | P4/h-bridge-kickback-2 |
| 15 | engine | NEWTON_NONCONVERGENCE | 8 | P4-IC | Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback)) | P4/h-bridge-kickback-4 |
| 16 | engine | PHYSICS_MISMATCH | 7 | P2-Transistor | Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) | P2/bjt-switch-0 |
| 17 | engine | NEWTON_NONCONVERGENCE | 6 | P4-IC | Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (freewheel decay, step 3 after switch-off) | P4/h-bridge-kickback-0 |
| 18 | tabd | SILENT_SOLVE_ON_ILLPOSED | 6 | P6-Student | Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) | P6/invalid-value-0 |
| 19 | tabd | KVL | 6 | P6-Student | KVL violated around cycle closed by R3 (x→0) | P6/invalid-value-0 |
| 20 | engine | SILENT_SOLVE_ON_ILLPOSED | 6 | P6-Student | Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) | P6/invalid-value-0 |
| 21 | engine | KCL | 5 | P4-IC | KCL violated at node n:Vs:pos | P4/h-bridge-kickback-1 |
| 22 | engine | PHYSICS_MISMATCH | 4 | P4-IC | inductor current survives the switch toggle: backward-Euler relation v_L = L·(i_after − i_before)/Δt (i_before=24.000 A → i_after=0.000 A (a reset state would give i_befo | P4/switch-toggle-state-retention-0 |
| 23 | engine | PHYSICS_MISMATCH | 4 | P4-IC | supply current physically bounded (< 1e6 A) (two ideal closed switches across an ideal source) | P4/h-bridge-shoot-through-0 |
| 24 | tabd | POWER | 4 | P6-Student | Power balance broken: delivered NaN W vs absorbed NaN W | P6/invalid-value-0 |
| 25 | tabd | DIAGNOSTIC_ON_VALID | 3 | P6-Student | Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. | P6/switch-charge-sharing-0 |
| 26 | tabd | PHYSICS_MISMATCH | 3 | P6-Student | switch branch current physically bounded (< 1e6 A) (ideal sources 5 V / 3 V shorted through the switch) | P6/switch-shorts-two-sources-0 |
| 27 | engine | PHYSICS_MISMATCH | 2 | P4-IC | discharge transistor collector stays above saturation (V(dis) ≥ −0.05 V) (a BJT cannot drive its collector below emitter) | P4/555-5V-reset-0.05 |
| 28 | engine | PHYSICS_MISMATCH | 2 | P4-IC | QD (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) | P4/555-5V-reset-0.05 |
| 29 | nodal | DIAGNOSTIC_ON_VALID | 2 | P5-Bridge | Well-posed circuit rejected with RESIDUAL_VIOLATION: Reduced nodal residual certificate failed (\|\|G·V-z\|\|∞=8.471e-2). | P5/transformer-cascade-0 |
| 30 | tabd | NUMERICAL_SANITY | 2 | P6-Student | node in: non-finite voltage (NaN); node x: non-finite voltage (NaN); voltage V1: non-finite branch current (NaN) | P6/invalid-value-0 |
| 31 | tabd | ORACLE_MISMATCH | 2 | P6-Student | Node x deviates from the reference solve (κ≈1504.503) | P6/invalid-value-6 |
| 32 | engine | ORACLE_MISMATCH | 2 | P6-Student | Node x deviates from the reference solve (κ≈1504.503) | P6/invalid-value-6 |
| 33 | mesh | DIAGNOSTIC_ON_VALID | 1 | P3-Reactive | Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (\|\|A·x-z\|\|∞=1.940e-9) | P3/extreme-resistive-6 |
| 34 | tabd | PHYSICS_MISMATCH | 1 | P6-Student | charge conservation: V(a)=(C1V1+C2V2)/(C1+C2) | P6/switch-charge-sharing-3 |
| 35 | tabd | POWER | 1 | P6-Student | Power balance broken: delivered 0 W vs absorbed NaN W | P6/invalid-value-1 |
| 36 | tabd | NUMERICAL_SANITY | 1 | P6-Student | node in: non-finite voltage (NaN); voltage V1: non-finite branch current (NaN); resistor R2: non-finite branch current (NaN) | P6/invalid-value-2 |
| 37 | tabd | POWER | 1 | P6-Student | Power balance broken: delivered Infinity W vs absorbed NaN W | P6/invalid-value-3 |
| 38 | tabd | NUMERICAL_SANITY | 1 | P6-Student | node in: non-finite voltage (NaN); voltage V1: non-finite branch current (-Infinity); resistor R2: non-finite branch current (NaN) | P6/invalid-value-3 |
| 39 | tabd | NUMERICAL_SANITY | 1 | P6-Student | node in: non-finite voltage (NaN); node x: non-finite voltage (NaN); voltage V1: non-finite branch current (-Infinity) | P6/invalid-value-5 |

## 6. Failure ledger (every failed circuit)

### 1. Complex active analog & op-amp systems — 69 failed

- **P1/sallen-key-LP-o6-K1.586-v-2.5** — Sallen-Key low-pass, order 6, K=1.586, DC input -2.5 V
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.863e-9)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.863e-9)
- **P1/inamp-vcm0-vd0.01-mm0** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.01 V, resistor mismatch ±0%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=9.375e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=9.375e-7)
- **P1/inamp-vcm0-vd0.01-mm0.001** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.01 V, resistor mismatch ±0.1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=4.888e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=4.888e-7)
- **P1/inamp-vcm0-vd0.01-mm0.01** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.01 V, resistor mismatch ±1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.500e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.500e-7)
- **P1/inamp-vcm0-vd0.01-mm0.05** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.01 V, resistor mismatch ±5%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.501e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.501e-7)
- **P1/inamp-vcm0-vd0.1-mm0** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.1 V, resistor mismatch ±0%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.022e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.022e-6)
- **P1/inamp-vcm0-vd0.1-mm0.001** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.1 V, resistor mismatch ±0.1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.994e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.994e-6)
- **P1/inamp-vcm0-vd0.1-mm0.01** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.1 V, resistor mismatch ±1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.892e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.892e-6)
- **P1/inamp-vcm0-vd0.1-mm0.05** — 3-op-amp instrumentation amp, Vcm=0 V, Vd=0.1 V, resistor mismatch ±5%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=2.667e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=2.667e-6)
- **P1/inamp-vcm2.5-vd0.01-mm0** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.01 V, resistor mismatch ±0%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=7.274e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=7.274e-7)
- **P1/inamp-vcm2.5-vd0.01-mm0.001** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.01 V, resistor mismatch ±0.1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.502e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.502e-7)
- **P1/inamp-vcm2.5-vd0.01-mm0.01** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.01 V, resistor mismatch ±1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.544e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.544e-7)
- **P1/inamp-vcm2.5-vd0.01-mm0.05** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.01 V, resistor mismatch ±5%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=5.448e-8)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=5.448e-8)
- **P1/inamp-vcm2.5-vd0.1-mm0** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.1 V, resistor mismatch ±0%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=9.928e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=9.928e-7)
- **P1/inamp-vcm2.5-vd0.1-mm0.001** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.1 V, resistor mismatch ±0.1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.780e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.780e-6)
- **P1/inamp-vcm2.5-vd0.1-mm0.01** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.1 V, resistor mismatch ±1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.861e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.861e-6)
- **P1/inamp-vcm2.5-vd0.1-mm0.05** — 3-op-amp instrumentation amp, Vcm=2.5 V, Vd=0.1 V, resistor mismatch ±5%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=2.048e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=2.048e-6)
- **P1/inamp-vcm-5-vd0.01-mm0** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.01 V, resistor mismatch ±0%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.742e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.742e-7)
- **P1/inamp-vcm-5-vd0.01-mm0.001** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.01 V, resistor mismatch ±0.1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=4.936e-8)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=4.936e-8)
- **P1/inamp-vcm-5-vd0.01-mm0.01** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.01 V, resistor mismatch ±1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.155e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.155e-7)
- **P1/inamp-vcm-5-vd0.01-mm0.05** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.01 V, resistor mismatch ±5%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.406e-7)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.406e-7)
- **P1/inamp-vcm-5-vd0.1-mm0** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.1 V, resistor mismatch ±0%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.470e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.470e-6)
- **P1/inamp-vcm-5-vd0.1-mm0.001** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.1 V, resistor mismatch ±0.1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.791e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.791e-6)
- **P1/inamp-vcm-5-vd0.1-mm0.01** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.1 V, resistor mismatch ±1%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=6.560e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=6.560e-6)
- **P1/inamp-vcm-5-vd0.1-mm0.05** — 3-op-amp instrumentation amp, Vcm=-5 V, Vd=0.1 V, resistor mismatch ±5%
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.573e-6)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=3.573e-6)
- **P1/peak-detector-silicon--0.5** — Active peak detector (silicon diode), Vin=-0.5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(o)| ≤ 15 V (declared supply rail) — obtained 5.0000e+5, required 15 ± 0
- **P1/peak-detector-silicon--2.5** — Active peak detector (silicon diode), Vin=-2.5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(o)| ≤ 15 V (declared supply rail) — obtained 2.5000e+6, required 15 ± 0
- **P1/peak-detector-germanium--0.5** — Active peak detector (germanium diode), Vin=-0.5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(o)| ≤ 15 V (declared supply rail) — obtained 4.0000e+5, required 15 ± 0
- **P1/peak-detector-germanium--2.5** — Active peak detector (germanium diode), Vin=-2.5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(o)| ≤ 15 V (declared supply rail) — obtained 2.4000e+6, required 15 ± 0
- **P1/half-wave-rectifier-g4-1** — Precision half-wave rectifier, gain 4, Vin=1 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/half-wave-rectifier-g4--5** — Precision half-wave rectifier, gain 4, Vin=-5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(o)| ≤ 15 V (declared supply rail) — obtained 20.559281448, required 15 ± 0
- **P1/half-wave-rectifier-g4-2** — Precision half-wave rectifier, gain 4, Vin=2 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/full-wave-rectifier-10000-5** — Precision full-wave rectifier (2 op-amps, Rf=10000), Vin=5 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/full-wave-rectifier-22000-1** — Precision full-wave rectifier (2 op-amps, Rf=22000), Vin=1 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/full-wave-rectifier-22000-5** — Precision full-wave rectifier (2 op-amps, Rf=22000), Vin=5 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/full-wave-rectifier-47000-5** — Precision full-wave rectifier (2 op-amps, Rf=47000), Vin=5 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-0** — Logarithmic amplifier (diode), Vin=0.01 V, R=1000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-1** — Logarithmic amplifier (diode), Vin=0.1 V, R=10000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-2** — Logarithmic amplifier (diode), Vin=1 V, R=100000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-3** — Logarithmic amplifier (diode), Vin=5 V, R=100000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-4** — Logarithmic amplifier (diode), Vin=10 V, R=100000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-5** — Logarithmic amplifier (diode), Vin=0.05 V, R=1000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-6** — Logarithmic amplifier (diode), Vin=0.5 V, R=10000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-7** — Logarithmic amplifier (diode), Vin=2 V, R=10000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-8** — Logarithmic amplifier (diode), Vin=1 V, R=10000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-9** — Logarithmic amplifier (diode), Vin=0.2 V, R=100000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-10** — Logarithmic amplifier (diode), Vin=3 V, R=100000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/log-amp-diode-11** — Logarithmic amplifier (diode), Vin=7 V, R=100000 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P1/antilog-amp-diode-8** — Anti-logarithmic amplifier (diode), Vin=0.56 V, Rf=10000 Ω
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 25.576344682, required 15 ± 0
- **P1/schmitt-inverting-0** — Inverting Schmitt trigger, β=0.100, symmetric, Vin=-5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 50.00050255, required 15 ± 0
- **P1/schmitt-inverting-1** — Inverting Schmitt trigger, β=0.250, symmetric, Vin=-1 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 4.000016203, required 13.5 ± 0
- **P1/schmitt-inverting-2** — Inverting Schmitt trigger, β=0.500, symmetric, Vin=-0.2 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 0.40000082, required 13.5 ± 0
- **P1/schmitt-inverting-3** — Inverting Schmitt trigger, β=0.050, symmetric, Vin=0.2 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 4.000080205, required 13.5 ± 0
- **P1/schmitt-inverting-4** — Inverting Schmitt trigger, β=0.100, offset (asymmetric) thresholds, Vin=1 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 1.000010009, required 13.5 ± 0
- **P1/schmitt-inverting-5** — Inverting Schmitt trigger, β=0.250, offset (asymmetric) thresholds, Vin=5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 17.000068816, required 15 ± 0
- **P1/schmitt-inverting-6** — Inverting Schmitt trigger, β=0.500, offset (asymmetric) thresholds, Vin=0.6 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 0.20000036, required 13.5 ± 0
- **P1/schmitt-inverting-7** — Inverting Schmitt trigger, β=0.050, offset (asymmetric) thresholds, Vin=-0.6 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 31.000621624, required 15 ± 0
- **P1/schmitt-noninverting-0** — Non-inverting Schmitt trigger, R2/R1=10.0, symmetric, Vin=-5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 50.000552756, required 15 ± 0
- **P1/schmitt-noninverting-1** — Non-inverting Schmitt trigger, R2/R1=5.0, symmetric, Vin=-1 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 5.00003015, required 13.5 ± 0
- **P1/schmitt-noninverting-2** — Non-inverting Schmitt trigger, R2/R1=2.0, symmetric, Vin=-0.2 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 0.400001206, required 13.5 ± 0
- **P1/schmitt-noninverting-3** — Non-inverting Schmitt trigger, R2/R1=1.0, symmetric, Vin=0.2 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 0.200000402, required 13.5 ± 0
- **P1/schmitt-noninverting-4** — Non-inverting Schmitt trigger, R2/R1=10.0, offset thresholds, Vin=1 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 1.00001101, required 13.5 ± 0
- **P1/schmitt-noninverting-5** — Non-inverting Schmitt trigger, R2/R1=5.0, offset thresholds, Vin=5 V
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 19.000114591, required 15 ± 0
- **P1/schmitt-noninverting-6** — Non-inverting Schmitt trigger, R2/R1=2.0, offset thresholds, Vin=0.6 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 1.800005422, required 13.5 ± 0
- **P1/schmitt-noninverting-7** — Non-inverting Schmitt trigger, R2/R1=1.0, offset thresholds, Vin=-0.6 V
  - `engine` **PHYSICS_MISMATCH**: bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium (positive-feedback loop gain Aβ≫1) — obtained 2.600005226, required 13.5 ± 0
- **P1/inverting-amp-g100-v0.5** — Inverting amplifier gain −100, Vin=0.5 V (ideal output -50.00 V vs ±15 V rails)
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 49.994922741, required 15 ± 0
- **P1/inverting-amp-g1000-v0.1** — Inverting amplifier gain −1000, Vin=0.1 V (ideal output -100.00 V vs ±15 V rails)
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 99.899495608, required 15 ± 0
- **P1/inverting-amp-g1000-v0.5** — Inverting amplifier gain −1000, Vin=0.5 V (ideal output -500.00 V vs ±15 V rails)
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 499.497478039, required 15 ± 0
- **P1/noninverting-amp-g101-v1** — Non-inverting amplifier gain 101, Vin=1 V (ideal output 101.00 V vs ±15 V rails)
  - `engine` **RAIL_VIOLATION**: rail bound |V(out)| ≤ 15 V (declared supply rail) — obtained 100.989744086, required 15 ± 0

### 2. Transistor biasing & multi-stage amplifiers — 150 failed

- **P2/bjt-cascade-1** — CE→follower→Class-AB cascade, β=50, ±9 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-2** — CE→follower→Class-AB cascade, β=50, ±9 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-3** — CE→follower→Class-AB cascade, β=50, ±12 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-4** — CE→follower→Class-AB cascade, β=50, ±12 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-5** — CE→follower→Class-AB cascade, β=50, ±15 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-6** — CE→follower→Class-AB cascade, β=50, ±15 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-7** — CE→follower→Class-AB cascade, β=100, ±9 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-8** — CE→follower→Class-AB cascade, β=100, ±9 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-9** — CE→follower→Class-AB cascade, β=100, ±12 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-10** — CE→follower→Class-AB cascade, β=100, ±12 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-11** — CE→follower→Class-AB cascade, β=100, ±15 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-12** — CE→follower→Class-AB cascade, β=100, ±15 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-13** — CE→follower→Class-AB cascade, β=200, ±9 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-14** — CE→follower→Class-AB cascade, β=200, ±9 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-15** — CE→follower→Class-AB cascade, β=200, ±12 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-16** — CE→follower→Class-AB cascade, β=200, ±12 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-17** — CE→follower→Class-AB cascade, β=200, ±15 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-18** — CE→follower→Class-AB cascade, β=200, ±15 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-19** — CE→follower→Class-AB cascade, β=300, ±9 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-20** — CE→follower→Class-AB cascade, β=300, ±9 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-21** — CE→follower→Class-AB cascade, β=300, ±12 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-22** — CE→follower→Class-AB cascade, β=300, ±12 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-23** — CE→follower→Class-AB cascade, β=300, ±15 V, Ic≈0.5 mA, RL=50 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-cascade-24** — CE→follower→Class-AB cascade, β=300, ±15 V, Ic≈2 mA, RL=8 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-simple-0** — Simple NPN mirror, β=50, Iref≈0.1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-simple-1** — Simple NPN mirror, β=100, Iref≈0.5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-simple-2** — Simple NPN mirror, β=200, Iref≈1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-simple-5** — Simple NPN mirror, β=150, Iref≈0.1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-0** — Widlar source, β=60, Iref≈0.1 mA, Re=500.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-1** — Widlar source, β=100, Iref≈0.5 mA, Re=500.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-2** — Widlar source, β=200, Iref≈1 mA, Re=500.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-3** — Widlar source, β=300, Iref≈2 mA, Re=55.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-4** — Widlar source, β=60, Iref≈5 mA, Re=10.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-5** — Widlar source, β=100, Iref≈0.1 mA, Re=2500.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-6** — Widlar source, β=200, Iref≈0.5 mA, Re=1000.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-7** — Widlar source, β=300, Iref≈1 mA, Re=110.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-9** — Widlar source, β=100, Iref≈5 mA, Re=50.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-10** — Widlar source, β=200, Iref≈0.1 mA, Re=5000.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-widlar-11** — Widlar source, β=300, Iref≈0.5 mA, Re=220.0 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-0** — Wilson mirror (3×NPN), β=60, Iref≈0.5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-1** — Wilson mirror (3×NPN), β=100, Iref≈1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-2** — Wilson mirror (3×NPN), β=200, Iref≈2 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-3** — Wilson mirror (3×NPN), β=300, Iref≈5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-4** — Wilson mirror (3×NPN), β=60, Iref≈0.1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-5** — Wilson mirror (3×NPN), β=100, Iref≈0.5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-6** — Wilson mirror (3×NPN), β=200, Iref≈1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-7** — Wilson mirror (3×NPN), β=300, Iref≈2 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-8** — Wilson mirror (3×NPN), β=60, Iref≈5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-9** — Wilson mirror (3×NPN), β=100, Iref≈0.1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-10** — Wilson mirror (3×NPN), β=200, Iref≈0.5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-wilson-11** — Wilson mirror (3×NPN), β=300, Iref≈1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-0** — Cascode mirror (4×NPN), β=60, Iref≈1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-1** — Cascode mirror (4×NPN), β=100, Iref≈2 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-3** — Cascode mirror (4×NPN), β=300, Iref≈0.1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-4** — Cascode mirror (4×NPN), β=60, Iref≈0.5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-5** — Cascode mirror (4×NPN), β=100, Iref≈1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-6** — Cascode mirror (4×NPN), β=200, Iref≈2 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-7** — Cascode mirror (4×NPN), β=300, Iref≈5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-8** — Cascode mirror (4×NPN), β=60, Iref≈0.1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-9** — Cascode mirror (4×NPN), β=100, Iref≈0.5 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/mirror-cascode-10** — Cascode mirror (4×NPN), β=200, Iref≈1 mA
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-ideal-tail-0** — BJT diff pair, ideal tail 1 mA, Vcm=0 V, Vd=0 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-1** — BJT diff pair, ideal tail 1 mA, Vcm=0 V, Vd=5 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-2** — BJT diff pair, ideal tail 1 mA, Vcm=1 V, Vd=-5 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-3** — BJT diff pair, ideal tail 1 mA, Vcm=1 V, Vd=20 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-4** — BJT diff pair, ideal tail 2 mA, Vcm=-1 V, Vd=-20 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-5** — BJT diff pair, ideal tail 2 mA, Vcm=-1 V, Vd=50 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-6** — BJT diff pair, ideal tail 2 mA, Vcm=2 V, Vd=-50 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-7** — BJT diff pair, ideal tail 2 mA, Vcm=2 V, Vd=100 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-8** — BJT diff pair, ideal tail 1 mA, Vcm=0 V, Vd=0 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-9** — BJT diff pair, ideal tail 1 mA, Vcm=0 V, Vd=5 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-10** — BJT diff pair, ideal tail 1 mA, Vcm=1 V, Vd=-5 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-11** — BJT diff pair, ideal tail 1 mA, Vcm=1 V, Vd=20 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-12** — BJT diff pair, ideal tail 2 mA, Vcm=-1 V, Vd=-20 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-13** — BJT diff pair, ideal tail 2 mA, Vcm=-1 V, Vd=50 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-14** — BJT diff pair, ideal tail 2 mA, Vcm=2 V, Vd=-50 mV, β=100
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-ideal-tail-15** — BJT diff pair, ideal tail 2 mA, Vcm=2 V, Vd=100 mV, β=200
  - `engine` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point
- **P2/diffpair-bjt-active-tail-0** — BJT diff pair with active (BJT) tail source, Re=1000 Ω, Vcm=0 V, Vd=0 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-active-tail-1** — BJT diff pair with active (BJT) tail source, Re=1000 Ω, Vcm=1.5 V, Vd=0 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-active-tail-2** — BJT diff pair with active (BJT) tail source, Re=1000 Ω, Vcm=0 V, Vd=10 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-active-tail-3** — BJT diff pair with active (BJT) tail source, Re=1000 Ω, Vcm=1.5 V, Vd=10 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-active-tail-4** — BJT diff pair with active (BJT) tail source, Re=2200 Ω, Vcm=0 V, Vd=-10 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-active-tail-5** — BJT diff pair with active (BJT) tail source, Re=2200 Ω, Vcm=1.5 V, Vd=-10 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-active-tail-6** — BJT diff pair with active (BJT) tail source, Re=2200 Ω, Vcm=0 V, Vd=40 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-bjt-active-tail-7** — BJT diff pair with active (BJT) tail source, Re=2200 Ω, Vcm=1.5 V, Vd=40 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-0** — NMOS diff pair, ideal tail 1 mA, Vcm=3 V, Vd=0 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-1** — NMOS diff pair, ideal tail 1 mA, Vcm=3 V, Vd=20 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-2** — NMOS diff pair, ideal tail 2 mA, Vcm=3 V, Vd=-20 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-3** — NMOS diff pair, ideal tail 2 mA, Vcm=3 V, Vd=100 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-4** — NMOS diff pair, ideal tail 1 mA, Vcm=3 V, Vd=-100 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-5** — NMOS diff pair, ideal tail 1 mA, Vcm=3 V, Vd=0 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-6** — NMOS diff pair, ideal tail 2 mA, Vcm=3 V, Vd=300 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-7** — NMOS diff pair, ideal tail 2 mA, Vcm=3 V, Vd=-300 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-8** — NMOS diff pair, ideal tail 1 mA, Vcm=4.5 V, Vd=0 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-9** — NMOS diff pair, ideal tail 1 mA, Vcm=4.5 V, Vd=20 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-10** — NMOS diff pair, ideal tail 2 mA, Vcm=4.5 V, Vd=-20 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-11** — NMOS diff pair, ideal tail 2 mA, Vcm=4.5 V, Vd=100 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-12** — NMOS diff pair, ideal tail 1 mA, Vcm=4.5 V, Vd=-100 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-13** — NMOS diff pair, ideal tail 1 mA, Vcm=4.5 V, Vd=0 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-14** — NMOS diff pair, ideal tail 2 mA, Vcm=4.5 V, Vd=300 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/diffpair-mos-15** — NMOS diff pair, ideal tail 2 mA, Vcm=4.5 V, Vd=-300 mV
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-5V-0** — CMOS inverter, Vdd=5 V, Vin=0.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-5V-0.25** — CMOS inverter, Vdd=5 V, Vin=1.25 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-9V-0** — CMOS inverter, Vdd=9 V, Vin=0.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-9V-0.25** — CMOS inverter, Vdd=9 V, Vin=2.25 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-9V-0.5** — CMOS inverter, Vdd=9 V, Vin=4.50 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-9V-0.75** — CMOS inverter, Vdd=9 V, Vin=6.75 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-9V-1** — CMOS inverter, Vdd=9 V, Vin=9.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-12V-0** — CMOS inverter, Vdd=12 V, Vin=0.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-12V-0.25** — CMOS inverter, Vdd=12 V, Vin=3.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-12V-0.5** — CMOS inverter, Vdd=12 V, Vin=6.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-12V-0.75** — CMOS inverter, Vdd=12 V, Vin=9.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-inverter-12V-1** — CMOS inverter, Vdd=12 V, Vin=12.00 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-5V-rds0.1** — CMOS inverter VTC sweep (41 points), Vdd=5 V, Rds_on(N)=0.1 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-5V-rds1** — CMOS inverter VTC sweep (41 points), Vdd=5 V, Rds_on(N)=1 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-5V-rds10** — CMOS inverter VTC sweep (41 points), Vdd=5 V, Rds_on(N)=10 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-5V-rds100** — CMOS inverter VTC sweep (41 points), Vdd=5 V, Rds_on(N)=100 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-9V-rds0.1** — CMOS inverter VTC sweep (41 points), Vdd=9 V, Rds_on(N)=0.1 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-9V-rds1** — CMOS inverter VTC sweep (41 points), Vdd=9 V, Rds_on(N)=1 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-9V-rds10** — CMOS inverter VTC sweep (41 points), Vdd=9 V, Rds_on(N)=10 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-9V-rds100** — CMOS inverter VTC sweep (41 points), Vdd=9 V, Rds_on(N)=100 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-12V-rds0.1** — CMOS inverter VTC sweep (41 points), Vdd=12 V, Rds_on(N)=0.1 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-12V-rds1** — CMOS inverter VTC sweep (41 points), Vdd=12 V, Rds_on(N)=1 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-12V-rds10** — CMOS inverter VTC sweep (41 points), Vdd=12 V, Rds_on(N)=10 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-vtc-sweep-12V-rds100** — CMOS inverter VTC sweep (41 points), Vdd=12 V, Rds_on(N)=100 Ω
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (at Vin=0.000 V) — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-3.3V-100000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000 Ω, Vdd=3.3 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-3.3V-1000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 1000000 Ω, Vdd=3.3 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-3.3V-10000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 10000000 Ω, Vdd=3.3 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-3.3V-100000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000000 Ω, Vdd=3.3 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-5V-100000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000 Ω, Vdd=5 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-5V-1000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 1000000 Ω, Vdd=5 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-5V-10000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 10000000 Ω, Vdd=5 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-5V-100000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000000 Ω, Vdd=5 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-9V-100000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000 Ω, Vdd=9 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-9V-1000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 1000000 Ω, Vdd=9 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-9V-10000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 10000000 Ω, Vdd=9 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-9V-100000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000000 Ω, Vdd=9 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-12V-100000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000 Ω, Vdd=12 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-12V-1000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 1000000 Ω, Vdd=12 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-12V-10000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 10000000 Ω, Vdd=12 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/cmos-selfbias-12V-100000000** — Self-biased CMOS inverter amplifier with gate–drain feedback 100000000 Ω, Vdd=12 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/bjt-switch-0** — Saturating NPN switch β=50, Vcc=5 V, RB=10000 Ω, RC=330 Ω (Ic demand 21.5 mA vs 15.2 mA available)
  - `engine` **PHYSICS_MISMATCH**: Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -2.107390881, required -0.05 ± 0
- **P2/bjt-switch-1** — Saturating NPN switch β=100, Vcc=5 V, RB=1000 Ω, RC=100 Ω (Ic demand 260.0 mA vs 50.0 mA available)
  - `engine` **PHYSICS_MISMATCH**: Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -20.61424536, required -0.05 ± 0
- **P2/bjt-switch-2** — Saturating NPN switch β=200, Vcc=5 V, RB=4700 Ω, RC=4700 Ω (Ic demand 183.0 mA vs 1.1 mA available)
  - `engine` **PHYSICS_MISMATCH**: Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -852.621796015, required -0.05 ± 0
- **P2/bjt-switch-3** — Saturating NPN switch β=300, Vcc=5 V, RB=47000 Ω, RC=1000 Ω (Ic demand 72.1 mA vs 5.0 mA available)
  - `engine` **PHYSICS_MISMATCH**: Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -67.271479425, required -0.05 ± 0
- **P2/bjt-switch-5** — Saturating NPN switch β=100, Vcc=12 V, RB=1000 Ω, RC=100 Ω (Ic demand 260.0 mA vs 120.0 mA available)
  - `engine` **PHYSICS_MISMATCH**: Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -13.61424536, required -0.05 ± 0
- **P2/bjt-switch-6** — Saturating NPN switch β=200, Vcc=12 V, RB=4700 Ω, RC=4700 Ω (Ic demand 183.0 mA vs 2.6 mA available)
  - `engine` **PHYSICS_MISMATCH**: Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -845.621796015, required -0.05 ± 0
- **P2/bjt-switch-7** — Saturating NPN switch β=300, Vcc=12 V, RB=47000 Ω, RC=1000 Ω (Ic demand 72.1 mA vs 12.0 mA available)
  - `engine` **PHYSICS_MISMATCH**: Q1 (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -60.271479425, required -0.05 ± 0
- **P2/darlington-0** — Darlington emitter follower β=100², Vcc=12 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P2/darlington-1** — Darlington emitter follower β=200², Vcc=12 V
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)

### 3. Reactive, resonant & dynamic networks — 15 failed

- **P3/extreme-resistive-4** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 4 nodes (#0)
  - `mesh` **KVL**: KVL violated around cycle closed by R9 (n2→n4) — obtained 15.408485165 V, required ≤ 1e-3 V
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.591e-2 A
- **P3/extreme-resistive-5** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 5 nodes (#1)
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R4 (n4→0): element voltage ≠ node-potential difference — obtained 0.001626839 V, required ≤ 1e-3 V
- **P3/extreme-resistive-6** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 6 nodes (#2)
  - `mna` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.940e-9)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.940e-9)
  - `mesh` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Invalid Circuit: MNA residual certificate failed (||A·x-z||∞=1.940e-9)
- **P3/extreme-resistive-7** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 7 nodes (#3)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 21.535379241 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R9 (n2→n3): element voltage ≠ node-potential difference — obtained 1958.343141644 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1191.415242036 W vs absorbed 1851.680699215 W — obtained 3.566e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.169e+1 A
- **P3/extreme-resistive-8** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 8 nodes (#4)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 0.246534447 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R21 (n3→n8) — obtained 190.346021023 V, required ≤ 1e-3 V
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.465e-1 A
- **P3/extreme-resistive-9** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 9 nodes (#5)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 250.006298697 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R7 (n7→0) — obtained 13.242043529 V, required ≤ 1e-3 V
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.787e+2 A
- **P3/extreme-resistive-10** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 4 nodes (#6)
  - `mesh` **KVL**: KVL violated around cycle closed by R7 (n3→n4) — obtained 157.718961256 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 15.475544367 W vs absorbed 15.544133473 W — obtained 4.413e-1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.349e-4 A
- **P3/extreme-resistive-12** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 6 nodes (#8)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 1.042410047 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R14 (n4→n6) — obtained 170.937708151 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 8.417029423 W vs absorbed 144.086008338 W — obtained 9.416e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.404e+0 A
- **P3/extreme-resistive-13** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 7 nodes (#9)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 0.008329202 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R11 (n4→n5): element voltage ≠ node-potential difference — obtained 21.614907411 V, required ≤ 1e-3 V
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 8.331e-3 A
- **P3/extreme-resistive-14** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 8 nodes (#10)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.090704923 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R13 (n5→n6) — obtained 277.672099087 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 2.98065708 W vs absorbed 7.145435926 W — obtained 5.829e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.970e-2 A
- **P3/extreme-resistive-15** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 9 nodes (#11)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 1401.625442339 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R21 (n2→n8) — obtained 597.567259482 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 2061.150620018 W vs absorbed 1.1092e+5 W — obtained 9.814e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.440e+3 A
- **P3/extreme-resistive-16** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 4 nodes (#12)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.001067662 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R4 (n4→0) — obtained 49.430202917 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.860198048 W vs absorbed 1.085088715 W — obtained 2.073e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.973e-3 A
- **P3/extreme-resistive-17** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 5 nodes (#13)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 2.130969937 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R7 (n2→n3) — obtained 31.852295189 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.784092893 W vs absorbed 1.786384724 W — obtained 1.283e-1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.131e+0 A
- **P3/extreme-resistive-18** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 6 nodes (#14)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 0.047788411 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R9 (n3→n4) — obtained 51.266213329 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 54.718430518 W vs absorbed 55.042284183 W — obtained 5.884e-1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.779e-2 A
- **P3/extreme-resistive-19** — random log-uniform [1 mΩ, 1 MΩ] resistor network, 7 nodes (#15)
  - `mesh` **KVL**: KVL violated around cycle closed by R11 (n4→n5) — obtained 0.071989895 V, required ≤ 1e-3 V
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.128e-3 A

### 4. Synthetic sub-circuits & IC emulations (555 / R-2R DAC / H-bridge) — 116 failed

- **P4/r2r-8bit-code1-1** — 8-bit R-2R ladder, code 1/255, Vref=3.3 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.675496243 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 3.6032e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.486825312 W vs absorbed 3.4980e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.009e-1 A
- **P4/r2r-8bit-code2-2** — 8-bit R-2R ladder, code 2/255, Vref=2.5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 2.047083374 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2.7299e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 3.413125 W vs absorbed 8.0309e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.730e+0 A
- **P4/r2r-8bit-code3-3** — 8-bit R-2R ladder, code 3/255, Vref=10 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.00125061 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7.5 V, required ≤ 1e-3 V
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.499e-3 A
- **P4/r2r-8bit-code4-4** — 8-bit R-2R ladder, code 4/255, Vref=5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 1.534833374 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 8.1870e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 7.675 W vs absorbed 1.8060e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.047e+0 A
- **P4/r2r-8bit-code8-5** — 8-bit R-2R ladder, code 8/255, Vref=3.3 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 2.023449785 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2.6981e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 3.336696 W vs absorbed 7.8460e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.698e+0 A
- **P4/r2r-8bit-code16-6** — 8-bit R-2R ladder, code 16/255, Vref=2.5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 1.90510498 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.0160e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.1875 W vs absorbed 2.7821e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.540e+0 A
- **P4/r2r-8bit-code32-7** — 8-bit R-2R ladder, code 32/255, Vref=10 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.131978516 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7039.999999998 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.06 W vs absorbed 1335.899999999 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.760e-1 A
- **P4/r2r-8bit-code64-8** — 8-bit R-2R ladder, code 64/255, Vref=5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.143976562 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1919.999999999 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.02 W vs absorbed 397.46 W — obtained 9.999e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.920e-1 A
- **P4/r2r-8bit-code127-9** — 8-bit R-2R ladder, code 127/255, Vref=3.3 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 6.913336652 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 3.6877e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 15.576103125 W vs absorbed 3.6640e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.220e+0 A
- **P4/r2r-8bit-code128-10** — 8-bit R-2R ladder, code 128/255, Vref=2.5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.011998047 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 640 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 6.2500e-4 W vs absorbed 11.040625 W — obtained 9.999e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.600e-2 A
- **P4/r2r-8bit-code129-11** — 8-bit R-2R ladder, code 129/255, Vref=10 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 8.379802002 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.1175e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 57.2125 W vs absorbed 1.3458e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.118e+1 A
- **P4/r2r-8bit-code170-12** — 8-bit R-2R ladder, code 170/255, Vref=5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 1.670980835 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 8917.499999997 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.95625 W vs absorbed 2.1405e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.230e+0 A
- **P4/r2r-8bit-code85-13** — 8-bit R-2R ladder, code 85/255, Vref=3.3 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.565211508 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 3.0146e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.042513312 W vs absorbed 2.4491e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.537e-1 A
- **P4/r2r-8bit-code254-14** — 8-bit R-2R ladder, code 254/255, Vref=2.5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 4.093916626 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 5.4594e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 13.650625 W vs absorbed 3.2122e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.460e+0 A
- **P4/r2r-8bit-code255-15** — 8-bit R-2R ladder, code 255/255, Vref=10 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 20.46958313 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.0919e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 136.53125 W vs absorbed 3.2122e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.730e+1 A
- **P4/r2r-8bit-code176-16** — 8-bit R-2R ladder, code 176/255, Vref=5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.291035645 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.5520e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.2775 W vs absorbed 6491.517499996 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.880e-1 A
- **P4/r2r-8bit-code111-17** — 8-bit R-2R ladder, code 111/255, Vref=3.3 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 1.759439231 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2.3465e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 2.52784125 W vs absorbed 5.9334e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.347e+0 A
- **P4/r2r-8bit-code116-18** — 8-bit R-2R ladder, code 116/255, Vref=2.5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 9.069354858 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 4.8375e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 26.8 W vs absorbed 6.3056e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.209e+1 A
- **P4/r2r-8bit-code175-19** — 8-bit R-2R ladder, code 175/255, Vref=10 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 1.356904602 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7.2387e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 6.013125 W vs absorbed 1.4116e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.810e+0 A
- **P4/r2r-8bit-code115-20** — 8-bit R-2R ladder, code 115/255, Vref=5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 1.116400513 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.4884e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.023125 W vs absorbed 2.3874e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.488e+0 A
- **P4/r2r-8bit-code102-21** — 8-bit R-2R ladder, code 102/255, Vref=3.3 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 16.212184973 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 8.6478e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 85.6307925 W vs absorbed 2.0149e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.162e+1 A
- **P4/r2r-8bit-code72-22** — 8-bit R-2R ladder, code 72/255, Vref=2.5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.401226196 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2.1400e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.525 W vs absorbed 1.2340e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.350e-1 A
- **P4/r2r-8bit-code87-23** — 8-bit R-2R ladder, code 87/255, Vref=10 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 15.03938208 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2.0055e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 184.2525 W vs absorbed 4.3348e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.006e+1 A
- **P4/r2r-8bit-code205-24** — 8-bit R-2R ladder, code 205/255, Vref=5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 3.150942688 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.6804e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 3.2578125 W vs absorbed 7.6081e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.200e+0 A
- **P4/r2r-8bit-code206-25** — 8-bit R-2R ladder, code 206/255, Vref=3.3 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 1.143071539 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 6.0976e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 4.25826225 W vs absorbed 1.0017e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.525e+0 A
- **P4/r2r-8bit-code215-26** — 8-bit R-2R ladder, code 215/255, Vref=2.5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 3.711853333 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 4.9497e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 11.22328125 W vs absorbed 2.6405e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.950e+0 A
- **P4/r2r-8bit-code51-27** — 8-bit R-2R ladder, code 51/255, Vref=10 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 6.301885376 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 3.3607e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 13.03125 W vs absorbed 3.0432e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 8.401e+0 A
- **P4/r2r-8bit-code232-28** — 8-bit R-2R ladder, code 232/255, Vref=5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.892437744 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 4.7600e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 2.5975 W vs absorbed 6.1054e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.190e+0 A
- **P4/r2r-8bit-code135-29** — 8-bit R-2R ladder, code 135/255, Vref=3.3 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 3.9887755 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 5.3192e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 12.96046125 W vs absorbed 3.0493e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.320e+0 A
- **P4/r2r-8bit-code2-30** — 8-bit R-2R ladder, code 2/255, Vref=2.5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 5.117708435 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2.7299e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 8.5328125 W vs absorbed 2.0077e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 6.825e+0 A
- **P4/r2r-8bit-code50-31** — 8-bit R-2R ladder, code 50/255, Vref=10 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 2.677146851 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.4279e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 23.3525 W vs absorbed 5.4939e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.570e+0 A
- **P4/r2r-8bit-code44-32** — 8-bit R-2R ladder, code 44/255, Vref=5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 2.809543457 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 3.7470e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 6.44 W vs absorbed 1.5131e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.748e+0 A
- **P4/r2r-8bit-code61-33** — 8-bit R-2R ladder, code 61/255, Vref=3.3 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.395522845 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2109.524999999 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.057853125 W vs absorbed 1201.007053124 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.276e-1 A
- **P4/r2r-8bit-code103-34** — 8-bit R-2R ladder, code 103/255, Vref=2.5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.716456253 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 3.8217e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.672695312 W vs absorbed 3.9350e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.555e-1 A
- **P4/r2r-8bit-code251-35** — 8-bit R-2R ladder, code 251/255, Vref=10 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 4.09083374 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 5.4552e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 13.6525 W vs absorbed 3.2077e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.456e+0 A
- **P4/r2r-8bit-code79-36** — 8-bit R-2R ladder, code 79/255, Vref=5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 7.32443512 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 3.9074e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 17.5078125 W vs absorbed 4.1132e+5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.770e+0 A
- **P4/r2r-8bit-code69-37** — 8-bit R-2R ladder, code 69/255, Vref=3.3 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.313737651 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.6735e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.321595312 W vs absorbed 7546.683220308 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.184e-1 A
- **P4/r2r-8bit-code112-38** — 8-bit R-2R ladder, code 112/255, Vref=2.5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.558075195 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7439.999999998 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.255 W vs absorbed 5967.134999997 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.440e-1 A
- **P4/r2r-8bit-code29-39** — 8-bit R-2R ladder, code 29/255, Vref=10 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 2.518339233 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.3432e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 2.13125 W vs absorbed 4.8663e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.359e+0 A
- **P4/r2r-10bit-code1-1** — 10-bit R-2R ladder, code 1/1023, Vref=3.3 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 10.81309625 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 5.7670e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 23.789545312 W vs absorbed 8.9663e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.442e+1 A
- **P4/r2r-10bit-code2-2** — 10-bit R-2R ladder, code 2/1023, Vref=2.5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 32.767083336 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 4.3690e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 54.613125 W vs absorbed 2.0584e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.369e+1 A
- **P4/r2r-10bit-code511-3** — 10-bit R-2R ladder, code 511/1023, Vref=10 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 329.589563787 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.7578e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 2210.231249986 W vs absorbed 8.3303e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.395e+2 A
- **P4/r2r-10bit-code512-4** — 10-bit R-2R ladder, code 512/1023, Vref=5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.095999023 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 5119.999999977 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.0025 W vs absorbed 706.762499994 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.280e-1 A
- **P4/r2r-10bit-code513-5** — 10-bit R-2R ladder, code 513/1023, Vref=3.3 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 43.50582242 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 5.8008e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 96.27767325 W vs absorbed 3.6287e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.801e+1 A
- **P4/r2r-10bit-code1022-6** — 10-bit R-2R ladder, code 1022/1023, Vref=2.5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 163.834791659 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 8.7379e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 546.126562497 W vs absorbed 2.0584e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.184e+2 A
- **P4/r2r-10bit-code1023-7** — 10-bit R-2R ladder, code 1023/1023, Vref=10 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 32.766958332 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.7476e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 218.453124999 W vs absorbed 8.2335e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.369e+1 A
- **P4/r2r-10bit-code341-8** — 10-bit R-2R ladder, code 341/1023, Vref=5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 56.609526909 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7.5480e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 163.033124999 W vs absorbed 6.1437e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.548e+1 A
- **P4/r2r-10bit-code682-9** — 10-bit R-2R ladder, code 682/1023, Vref=3.3 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 14.725243096 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7.8538e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 4.4458425 W vs absorbed 1.6628e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.964e+1 A
- **P4/r2r-10bit-code256-10** — 10-bit R-2R ladder, code 256/1023, Vref=2.5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 0.168000732 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 8959.99999996 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.00625 W vs absorbed 2164.441249981 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.240e-1 A
- **P4/r2r-10bit-code255-11** — 10-bit R-2R ladder, code 255/1023, Vref=10 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 129.147813796 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.7220e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 848.412499996 W vs absorbed 3.1976e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.722e+2 A
- **P4/r2r-10bit-code417-12** — 10-bit R-2R ladder, code 417/1023, Vref=5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 178.174645785 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 9.5027e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 645.932812496 W vs absorbed 2.4345e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.376e+2 A
- **P4/r2r-10bit-code417-13** — 10-bit R-2R ladder, code 417/1023, Vref=3.3 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 11.759526622 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 6.2718e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 28.136833312 W vs absorbed 1.0605e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.568e+1 A
- **P4/r2r-10bit-code81-14** — 10-bit R-2R ladder, code 81/1023, Vref=2.5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 21.516906147 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 2.8690e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 23.55328125 W vs absorbed 8.8759e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.869e+1 A
- **P4/r2r-10bit-code570-15** — 10-bit R-2R ladder, code 570/1023, Vref=10 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 182.322311934 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 9.7239e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 676.424999996 W vs absorbed 2.5491e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.431e+2 A
- **P4/r2r-10bit-code577-16** — 10-bit R-2R ladder, code 577/1023, Vref=5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 16.99547294 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 9.0643e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 58.77078125 W vs absorbed 2.2150e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.266e+1 A
- **P4/r2r-10bit-code823-17** — 10-bit R-2R ladder, code 823/1023, Vref=3.3 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 79.015014037 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.0535e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 317.575541249 W vs absorbed 1.1969e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.054e+2 A
- **P4/r2r-10bit-code322-18** — 10-bit R-2R ladder, code 322/1023, Vref=2.5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 81.017741909 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 4.3210e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 133.557812499 W vs absorbed 5.0335e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.080e+2 A
- **P4/r2r-10bit-code959-19** — 10-bit R-2R ladder, code 959/1023, Vref=10 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 33.798947834 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.8026e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 232.433124999 W vs absorbed 8.7603e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.507e+1 A
- **P4/r2r-10bit-code119-20** — 10-bit R-2R ladder, code 119/1023, Vref=5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 116.695729469 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.5560e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 692.683124997 W vs absorbed 2.6107e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.556e+2 A
- **P4/r2r-10bit-code441-21** — 10-bit R-2R ladder, code 441/1023, Vref=3.3 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 158.155153617 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 8.4350e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 508.925773122 W vs absorbed 1.9181e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.109e+2 A
- **P4/r2r-10bit-code191-22** — 10-bit R-2R ladder, code 191/1023, Vref=2.5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 8.329735738 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 4.4426e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 14.117695312 W vs absorbed 5.3208e+6 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.111e+1 A
- **P4/r2r-10bit-code1020-23** — 10-bit R-2R ladder, code 1020/1023, Vref=10 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 131.067333312 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.7476e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 873.799999996 W vs absorbed 3.2934e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.748e+2 A
- **P4/r2r-10bit-code424-24** — 10-bit R-2R ladder, code 424/1023, Vref=5 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 137.204437408 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7.3176e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 383.049999998 W vs absorbed 1.4436e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.829e+2 A
- **P4/r2r-10bit-code604-25** — 10-bit R-2R ladder, code 604/1023, Vref=3.3 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 11.759485371 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 6.2718e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 28.136493 W vs absorbed 1.0605e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.568e+1 A
- **P4/r2r-10bit-code841-26** — 10-bit R-2R ladder, code 841/1023, Vref=2.5 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 57.891859607 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 7.7190e+5 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 170.475781249 W vs absorbed 6.4252e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.719e+1 A
- **P4/r2r-10bit-code565-27** — 10-bit R-2R ladder, code 565/1023, Vref=10 V, R=1000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 264.207728537 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.4091e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1420.431249991 W vs absorbed 5.3531e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.523e+2 A
- **P4/r2r-10bit-code727-28** — 10-bit R-2R ladder, code 727/1023, Vref=5 V, R=10000 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 29.359925592 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.5659e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 175.388281249 W vs absorbed 6.6103e+7 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.915e+1 A
- **P4/r2r-10bit-code854-29** — 10-bit R-2R ladder, code 854/1023, Vref=3.3 V, R=2500 Ω
  - `mesh` **KCL**: KCL violated at node b2 (currents re-derived from node voltages) — obtained 123.613785339 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by Rl2 (a2→b2) — obtained 1.6482e+6 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 777.242168997 W vs absorbed 2.9295e+8 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.648e+2 A
- **P4/555-5V-set-0.05** — 555 equivalent @ Vcc=5 V, SET (THRES=0.25 V, TRIG=0.25 V)
  - `engine` **RAIL_VIOLATION**: rail bound |V(c1)| ≤ 5 V (declared supply rail) — obtained 3.0833e+5, required 5 ± 0
- **P4/555-5V-set-0.25** — 555 equivalent @ Vcc=5 V, SET (THRES=1.25 V, TRIG=1.25 V)
  - `engine` **RAIL_VIOLATION**: rail bound |V(c1)| ≤ 5 V (declared supply rail) — obtained 2.0833e+5, required 5 ± 0
- **P4/555-5V-reset-0.05** — 555 equivalent @ Vcc=5 V, RESET (THRES=4.75 V, TRIG=4.75 V)
  - `engine` **PHYSICS_MISMATCH**: discharge transistor collector stays above saturation (V(dis) ≥ −0.05 V) (a BJT cannot drive its collector below emitter) — obtained -425.750962478, required -0.05 ± 0
  - `engine` **PHYSICS_MISMATCH**: QD (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -425.750962478, required -0.05 ± 0
  - `engine` **RAIL_VIOLATION**: rail bound |V(c1)| ≤ 5 V (declared supply rail) — obtained 1.4167e+5, required 5 ± 0
- **P4/555-5V-reset-0.25** — 555 equivalent @ Vcc=5 V, RESET (THRES=3.75 V, TRIG=3.75 V)
  - `engine` **PHYSICS_MISMATCH**: discharge transistor collector stays above saturation (V(dis) ≥ −0.05 V) (a BJT cannot drive its collector below emitter) — obtained -425.750962478, required -0.05 ± 0
  - `engine` **PHYSICS_MISMATCH**: QD (NPN): V_CE ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation) (device-region plausibility) — obtained -425.750962478, required -0.05 ± 0
  - `engine` **RAIL_VIOLATION**: rail bound |V(c1)| ≤ 5 V (declared supply rail) — obtained 4.1667e+4, required 5 ± 0
- **P4/555-9V-set-0.05** — 555 equivalent @ Vcc=9 V, SET (THRES=0.45 V, TRIG=0.45 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-9V-set-0.25** — 555 equivalent @ Vcc=9 V, SET (THRES=2.25 V, TRIG=2.25 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-9V-reset-0.05** — 555 equivalent @ Vcc=9 V, RESET (THRES=8.55 V, TRIG=8.55 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-9V-reset-0.25** — 555 equivalent @ Vcc=9 V, RESET (THRES=6.75 V, TRIG=6.75 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-12V-set-0.05** — 555 equivalent @ Vcc=12 V, SET (THRES=0.60 V, TRIG=0.60 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-12V-set-0.25** — 555 equivalent @ Vcc=12 V, SET (THRES=3.00 V, TRIG=3.00 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-12V-reset-0.05** — 555 equivalent @ Vcc=12 V, RESET (THRES=11.40 V, TRIG=11.40 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-12V-reset-0.25** — 555 equivalent @ Vcc=12 V, RESET (THRES=9.00 V, TRIG=9.00 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-15V-set-0.05** — 555 equivalent @ Vcc=15 V, SET (THRES=0.75 V, TRIG=0.75 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-15V-set-0.25** — 555 equivalent @ Vcc=15 V, SET (THRES=3.75 V, TRIG=3.75 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-15V-reset-0.05** — 555 equivalent @ Vcc=15 V, RESET (THRES=14.25 V, TRIG=14.25 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/555-15V-reset-0.25** — 555 equivalent @ Vcc=15 V, RESET (THRES=11.25 V, TRIG=11.25 V)
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)
- **P4/h-bridge-kickback-0** — H-bridge 12 V, motor 0.5 Ω + 1 mH, silicon flyback diodes, Q1/Q4 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (freewheel decay, step 3 after switch-off)
- **P4/h-bridge-kickback-1** — H-bridge 24 V, motor 2 Ω + 1 mH, germanium flyback diodes, Q2/Q3 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Vs:pos — obtained 2.211781694 A, required ≤ 1e-4 A
- **P4/h-bridge-kickback-2** — H-bridge 48 V, motor 10 Ω + 10 mH, ideal flyback diodes, Q1/Q4 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q1:b — obtained 2.305427782 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 287.997683949 W vs absorbed 230.399980123 W — obtained 2.000e+1 %, required ≤ 0.1 %
- **P4/h-bridge-kickback-3** — H-bridge 12 V, motor 1 Ω + 10 mH, silicon flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (freewheel decay, step 12 after switch-off)
- **P4/h-bridge-kickback-4** — H-bridge 24 V, motor 0.5 Ω + 100 mH, germanium flyback diodes, Q1/Q4 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/h-bridge-kickback-5** — H-bridge 48 V, motor 2 Ω + 100 mH, ideal flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/h-bridge-kickback-6** — H-bridge 12 V, motor 10 Ω + 1 mH, silicon flyback diodes, Q1/Q4 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q1:b — obtained 0.576356839 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 18.000000139 W vs absorbed 14.4 W — obtained 2.000e+1 %, required ≤ 0.1 %
- **P4/h-bridge-kickback-7** — H-bridge 24 V, motor 1 Ω + 1 mH, germanium flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (freewheel decay, step 2 after switch-off)
- **P4/h-bridge-kickback-8** — H-bridge 48 V, motor 0.5 Ω + 10 mH, ideal flyback diodes, Q1/Q4 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/h-bridge-kickback-9** — H-bridge 12 V, motor 2 Ω + 10 mH, silicon flyback diodes, Q2/Q3 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q3:b — obtained 1.237996927 A, required ≤ 1e-4 A
- **P4/h-bridge-kickback-10** — H-bridge 24 V, motor 10 Ω + 100 mH, germanium flyback diodes, Q1/Q4 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q1:b — obtained 1.493622316 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 63.795945218 W vs absorbed 49.4182167 W — obtained 2.254e+1 %, required ≤ 0.1 %
- **P4/h-bridge-kickback-11** — H-bridge 48 V, motor 1 Ω + 100 mH, ideal flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/h-bridge-kickback-12** — H-bridge 12 V, motor 0.5 Ω + 1 mH, silicon flyback diodes, Q1/Q4 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (freewheel decay, step 3 after switch-off)
- **P4/h-bridge-kickback-13** — H-bridge 24 V, motor 2 Ω + 1 mH, germanium flyback diodes, Q2/Q3 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Vs:pos — obtained 2.211781694 A, required ≤ 1e-4 A
- **P4/h-bridge-kickback-14** — H-bridge 48 V, motor 10 Ω + 10 mH, ideal flyback diodes, Q1/Q4 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q1:b — obtained 2.305427782 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 287.997683949 W vs absorbed 230.399980123 W — obtained 2.000e+1 %, required ≤ 0.1 %
- **P4/h-bridge-kickback-15** — H-bridge 12 V, motor 1 Ω + 10 mH, silicon flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (freewheel decay, step 12 after switch-off)
- **P4/h-bridge-kickback-16** — H-bridge 24 V, motor 0.5 Ω + 100 mH, germanium flyback diodes, Q1/Q4 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/h-bridge-kickback-17** — H-bridge 48 V, motor 2 Ω + 100 mH, ideal flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/h-bridge-kickback-18** — H-bridge 12 V, motor 10 Ω + 1 mH, silicon flyback diodes, Q1/Q4 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q1:b — obtained 0.576356839 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 18.000000139 W vs absorbed 14.4 W — obtained 2.000e+1 %, required ≤ 0.1 %
- **P4/h-bridge-kickback-19** — H-bridge 24 V, motor 1 Ω + 1 mH, germanium flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (freewheel decay, step 2 after switch-off)
- **P4/h-bridge-kickback-20** — H-bridge 48 V, motor 0.5 Ω + 10 mH, ideal flyback diodes, Q1/Q4 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/h-bridge-kickback-21** — H-bridge 12 V, motor 2 Ω + 10 mH, silicon flyback diodes, Q2/Q3 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q3:b — obtained 1.237996927 A, required ≤ 1e-4 A
- **P4/h-bridge-kickback-22** — H-bridge 24 V, motor 10 Ω + 100 mH, germanium flyback diodes, Q1/Q4 drive then all-off
  - `engine` **KCL**: KCL violated at node n:Q1:b — obtained 1.493622316 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 63.795945218 W vs absorbed 49.4182167 W — obtained 2.254e+1 %, required ≤ 0.1 %
- **P4/h-bridge-kickback-23** — H-bridge 48 V, motor 1 Ω + 100 mH, ideal flyback diodes, Q2/Q3 drive then all-off
  - `engine` **NEWTON_NONCONVERGENCE**: Newton-Raphson did not converge after 50 iterations. Review nonlinear device biasing and ideal constraints. (first step after switch-off (inductive kickback))
- **P4/switch-toggle-state-retention-0** — Drive switch opened the way the app does it (setCircuit), 1 mH winding — stored inductor current must survive
  - `engine` **KCL**: KCL violated at node n:Vs:pos — obtained 0.868997922 A, required ≤ 1e-4 A
  - `engine` **PHYSICS_MISMATCH**: inductor current survives the switch toggle: backward-Euler relation v_L = L·(i_after − i_before)/Δt (i_before=24.000 A → i_after=0.000 A (a reset state would give i_before=0)) — obtained 4.7856e-14, required -47.999995659 ± 0.097999991
- **P4/switch-toggle-state-retention-1** — Drive switch opened the way the app does it (setCircuit), 10 mH winding — stored inductor current must survive
  - `engine` **KCL**: KCL violated at node n:Vs:pos — obtained 0.725378448 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 494.181686995 W vs absorbed 494.757686995 W — obtained 1.164e-1 %, required ≤ 0.1 %
  - `engine` **PHYSICS_MISMATCH**: inductor current survives the switch toggle: backward-Euler relation v_L = L·(i_after − i_before)/Δt (i_before=20.591 A → i_after=0.000 A (a reset state would give i_before=0)) — obtained 4.7013e-13, required -411.818072496 ± 0.825636145
- **P4/switch-toggle-state-retention-2** — Drive switch opened the way the app does it (setCircuit), 100 mH winding — stored inductor current must survive
  - `engine` **KCL**: KCL violated at node n:Q1:b — obtained 0.811953665 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 104.176016249 W vs absorbed 104.752016249 W — obtained 5.499e-1 %, required ≤ 0.1 %
  - `engine` **PHYSICS_MISMATCH**: inductor current survives the switch toggle: backward-Euler relation v_L = L·(i_after − i_before)/Δt (i_before=4.341 A → i_after=0.000 A (a reset state would give i_before=0)) — obtained 3.9967e-12, required -868.133468738 ± 1.738266937
- **P4/switch-toggle-state-retention-3** — Drive switch opened the way the app does it (setCircuit), 5 mH winding — stored inductor current must survive
  - `engine` **KCL**: KCL violated at node n:Vs:pos — obtained 1.399274027 A, required ≤ 1e-4 A
  - `engine` **POWER**: Power balance broken: delivered 563.273321384 W vs absorbed 563.849321384 W — obtained 1.022e-1 %, required ≤ 0.1 %
  - `engine` **PHYSICS_MISMATCH**: inductor current survives the switch toggle: backward-Euler relation v_L = L·(i_after − i_before)/Δt (i_before=23.470 A → i_after=0.000 A (a reset state would give i_before=0)) — obtained 2.3739e-13, required -234.697217243 ± 0.471394434
- **P4/h-bridge-shoot-through-0** — H-bridge shoot-through: Q1 and Q2 closed across a 12 V supply (student mistake)
  - `engine` **PHYSICS_MISMATCH**: supply current physically bounded (< 1e6 A) (two ideal closed switches across an ideal source) — obtained 6.0000e+15, required 1.0000e+6 ± 0
- **P4/h-bridge-shoot-through-1** — H-bridge shoot-through: Q1 and Q2 closed across a 24 V supply (student mistake)
  - `engine` **PHYSICS_MISMATCH**: supply current physically bounded (< 1e6 A) (two ideal closed switches across an ideal source) — obtained 1.2000e+16, required 1.0000e+6 ± 0
- **P4/h-bridge-shoot-through-2** — H-bridge shoot-through: Q1 and Q2 closed across a 5 V supply (student mistake)
  - `engine` **PHYSICS_MISMATCH**: supply current physically bounded (< 1e6 A) (two ideal closed switches across an ideal source) — obtained 2.5000e+15, required 1.0000e+6 ± 0
- **P4/h-bridge-shoot-through-3** — H-bridge shoot-through: Q1 and Q2 closed across a 48 V supply (student mistake)
  - `engine` **PHYSICS_MISMATCH**: supply current physically bounded (< 1e6 A) (two ideal closed switches across an ideal source) — obtained 2.4000e+16, required 1.0000e+6 ± 0

### 5. Passive power, AC bridges & polyphase networks — 62 failed

- **P5/pad-T-3dB-50ohm** — T-pad 3 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 28.385231177 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 5.01904095 W — obtained 8.008e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.416e-1 A
- **P5/pad-T-3dB-75ohm** — T-pad 3 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 28.385231177 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 3.3460273 W — obtained 8.008e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.439e-2 A
- **P5/pad-T-3dB-600ohm** — T-pad 3 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 28.385231177 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.418253413 W — obtained 8.008e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.180e-2 A
- **P5/pad-T-6dB-50ohm** — T-pad 6 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 13.38620813 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 2.341799324 W — obtained 5.730e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.002e-1 A
- **P5/pad-T-6dB-75ohm** — T-pad 6 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 13.38620813 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 1.561199549 W — obtained 5.730e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 6.682e-2 A
- **P5/pad-T-6dB-600ohm** — T-pad 6 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 13.38620813 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.195149944 W — obtained 5.730e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 8.353e-3 A
- **P5/pad-T-10dB-50ohm** — T-pad 10 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 7.027283689 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 1.444444444 W — obtained 3.077e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 6.325e-2 A
- **P5/pad-T-10dB-75ohm** — T-pad 10 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 7.027283689 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 0.962962963 W — obtained 3.077e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.216e-2 A
- **P5/pad-T-10dB-600ohm** — T-pad 10 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 7.027283689 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.12037037 W — obtained 3.077e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.270e-3 A
- **P5/pad-T-14dB-50ohm** — T-pad 14 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 4.155977057 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 1.165845288 W — obtained 1.423e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.991e-2 A
- **P5/pad-T-14dB-75ohm** — T-pad 14 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 4.155977057 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 0.777230192 W — obtained 1.423e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.660e-2 A
- **P5/pad-T-14dB-600ohm** — T-pad 14 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 4.155977057 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.097153774 W — obtained 1.423e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.325e-3 A
- **P5/pad-T-20dB-50ohm** — T-pad 20 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 2.02020202 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 1.04040404 W — obtained 3.883e+0 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.000e-2 A
- **P5/pad-T-20dB-75ohm** — T-pad 20 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 2.02020202 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 0.693602694 W — obtained 3.883e+0 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.333e-2 A
- **P5/pad-T-20dB-600ohm** — T-pad 20 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 2.02020202 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.086700337 W — obtained 3.883e+0 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.667e-3 A
- **P5/pad-T-26dB-50ohm** — T-pad 26 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 1.004898659 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 1.010072848 W — obtained 9.972e-1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.002e-2 A
- **P5/pad-T-26dB-75ohm** — T-pad 26 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 1.004898659 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 0.673381898 W — obtained 9.972e-1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 6.682e-3 A
- **P5/pad-T-26dB-600ohm** — T-pad 26 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (m→out) — obtained 1.004898659 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.084172737 W — obtained 9.972e-1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 8.353e-4 A
- **P5/pad-BridgedT-3dB-50ohm** — Bridged-T 3 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R1 (in→m) — obtained 2.920542156 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 1.411557988 W — obtained 2.916e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.841e-2 A
- **P5/pad-BridgedT-3dB-75ohm** — Bridged-T 3 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R1 (in→m) — obtained 2.920542156 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 0.941038658 W — obtained 2.916e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.894e-2 A
- **P5/pad-BridgedT-3dB-600ohm** — Bridged-T 3 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R1 (in→m) — obtained 2.920542156 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.117629832 W — obtained 2.916e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 4.868e-3 A
- **P5/pad-BridgedT-6dB-50ohm** — Bridged-T 6 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R2 (m→out) — obtained 4.988127664 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 2.490527449 W — obtained 5.985e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.976e-2 A
- **P5/pad-BridgedT-6dB-75ohm** — Bridged-T 6 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R2 (m→out) — obtained 4.988127664 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 1.660351633 W — obtained 5.985e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 6.651e-2 A
- **P5/pad-BridgedT-6dB-600ohm** — Bridged-T 6 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by R2 (m→out) — obtained 4.988127664 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.207543954 W — obtained 5.985e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 8.314e-3 A
- **P5/pad-BridgedT-10dB-50ohm** — Bridged-T 10 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of Rb (in→out): element voltage ≠ node-potential difference — obtained 14.785054262 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 4.892099788 W — obtained 7.956e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.368e-1 A
- **P5/pad-BridgedT-10dB-75ohm** — Bridged-T 10 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of Rb (in→out): element voltage ≠ node-potential difference — obtained 14.785054262 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 3.261399859 W — obtained 7.956e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 9.117e-2 A
- **P5/pad-BridgedT-10dB-600ohm** — Bridged-T 10 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of Rb (in→out): element voltage ≠ node-potential difference — obtained 14.785054262 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.407674982 W — obtained 7.956e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.140e-2 A
- **P5/pad-BridgedT-14dB-50ohm** — Bridged-T 14 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 32.113985678 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 8.704313644 W — obtained 8.851e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.601e-1 A
- **P5/pad-BridgedT-14dB-75ohm** — Bridged-T 14 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 32.113985678 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 5.802875762 W — obtained 8.851e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.067e-1 A
- **P5/pad-BridgedT-14dB-600ohm** — Bridged-T 14 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 32.113985678 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 0.72535947 W — obtained 8.851e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.334e-2 A
- **P5/pad-BridgedT-20dB-50ohm** — Bridged-T 20 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 81 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 18.82 W — obtained 9.469e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.800e-1 A
- **P5/pad-BridgedT-20dB-75ohm** — Bridged-T 20 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 81 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 12.546666667 W — obtained 9.469e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.200e-1 A
- **P5/pad-BridgedT-20dB-600ohm** — Bridged-T 20 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 81 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 1.568333333 W — obtained 9.469e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.500e-2 A
- **P5/pad-BridgedT-26dB-50ohm** — Bridged-T 26 dB, Z0=50 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 180.027418731 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1 W vs absorbed 38.810032626 W — obtained 9.742e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.900e-1 A
- **P5/pad-BridgedT-26dB-75ohm** — Bridged-T 26 dB, Z0=75 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 180.027418731 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.666666667 W vs absorbed 25.873355084 W — obtained 9.742e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.267e-1 A
- **P5/pad-BridgedT-26dB-600ohm** — Bridged-T 26 dB, Z0=600 Ω, matched source & load
  - `mesh` **KVL**: KVL violated around cycle closed by Rb (in→out) — obtained 180.027418731 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.083333333 W vs absorbed 3.234169385 W — obtained 9.742e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.583e-2 A
- **P5/dense-network-0** — 5-node dense resistive network, floating + grounded V sources and a current source (#0)
  - `mesh` **KCL**: KCL violated at node n4 (currents re-derived from node voltages) — obtained 0.023877066 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R10 (n2→n4): element voltage ≠ node-potential difference — obtained 16.621488206 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.199738881 W vs absorbed 0.267177701 W — obtained 2.524e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.856e-2 A
- **P5/dense-network-1** — 6-node dense resistive network, floating + grounded V sources and a current source (#1)
  - `mesh` **KCL**: KCL violated at node n2 (currents re-derived from node voltages) — obtained 0.081965305 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (n3→0) — obtained 106.671518474 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.89623258 W vs absorbed 12.633342613 W — obtained 8.499e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.113e-1 A
- **P5/dense-network-2** — 7-node dense resistive network, floating + grounded V sources and a current source (#2)
  - `mesh` **KCL**: KCL violated at node n4 (currents re-derived from node voltages) — obtained 0.015098989 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R14 (n3→n6) — obtained 348.764443913 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.511392771 W vs absorbed 4.893618429 W — obtained 8.955e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.586e-2 A
- **P5/dense-network-3** — 8-node dense resistive network, floating + grounded V sources and a current source (#3)
  - `mesh` **KCL**: KCL violated at node n4 (currents re-derived from node voltages) — obtained 0.153858081 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R2 (n2→0) — obtained 205.135434484 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered -0.651935215 W vs absorbed 14.694122881 W — obtained 1.044e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.539e-1 A
- **P5/dense-network-4** — 9-node dense resistive network, floating + grounded V sources and a current source (#4)
  - `mesh` **KCL**: KCL violated at node n5 (currents re-derived from node voltages) — obtained 0.030465139 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R25 (n3→n8) — obtained 32.134424791 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.19736686 W vs absorbed 0.313369286 W — obtained 3.702e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.047e-2 A
- **P5/dense-network-5** — 10-node dense resistive network, floating + grounded V sources and a current source (#5)
  - `mesh` **KCL**: KCL violated at node n2 (currents re-derived from node voltages) — obtained 0.074248273 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R37 (n6→n9): element voltage ≠ node-potential difference — obtained 113.139183208 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.133951833 W vs absorbed 4.419404465 W — obtained 7.434e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.425e-2 A
- **P5/dense-network-6** — 11-node dense resistive network, floating + grounded V sources and a current source (#6)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.022337348 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R7 (n7→0): element voltage ≠ node-potential difference — obtained 111.661644896 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.132350005 W vs absorbed 1.599494283 W — obtained 2.921e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.234e-2 A
- **P5/dense-network-7** — 12-node dense resistive network, floating + grounded V sources and a current source (#7)
  - `mesh` **KCL**: KCL violated at node n4 (currents re-derived from node voltages) — obtained 0.11343419 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R2 (n2→0) — obtained 47.213961846 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.219154389 W vs absorbed 1.548374014 W — obtained 2.126e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.134e-1 A
- **P5/dense-network-8** — 5-node dense resistive network, floating + grounded V sources and a current source (#8)
  - `mesh` **KCL**: KCL violated at node n3 (currents re-derived from node voltages) — obtained 0.050161486 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R5 (n5→0): element voltage ≠ node-potential difference — obtained 101.606710814 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.248502638 W vs absorbed 2.81668903 W — obtained 5.567e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.016e-2 A
- **P5/dense-network-9** — 6-node dense resistive network, floating + grounded V sources and a current source (#9)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.006458477 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R9 (n2→n3) — obtained 63.960094605 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered -0.012377765 W vs absorbed 0.792219033 W — obtained 1.016e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.221e-2 A
- **P5/dense-network-10** — 7-node dense resistive network, floating + grounded V sources and a current source (#10)
  - `mesh` **KCL**: KCL violated at node n3 (currents re-derived from node voltages) — obtained 0.08269566 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R2 (n2→0) — obtained 646.222028527 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered -0.312036401 W vs absorbed 10.597662936 W — obtained 1.029e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 8.270e-2 A
- **P5/dense-network-11** — 8-node dense resistive network, floating + grounded V sources and a current source (#11)
  - `mesh` **KCL**: KCL violated at node n3 (currents re-derived from node voltages) — obtained 0.021676068 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R7 (n7→0) — obtained 144.440252954 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.771733435 W vs absorbed 9.858588358 W — obtained 9.217e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 6.481e-2 A
- **P5/dense-network-12** — 9-node dense resistive network, floating + grounded V sources and a current source (#12)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.285214634 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R15 (n2→n4) — obtained 64.629466882 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.140844727 W vs absorbed 0.373642476 W — obtained 6.230e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.852e-1 A
- **P5/dense-network-13** — 10-node dense resistive network, floating + grounded V sources and a current source (#13)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.082105272 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R6 (n6→0) — obtained 760.203708156 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.731437109 W vs absorbed 196.111162991 W — obtained 9.963e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 2.367e-1 A
- **P5/dense-network-14** — 11-node dense resistive network, floating + grounded V sources and a current source (#14)
  - `mesh` **KCL**: KCL violated at node n4 (currents re-derived from node voltages) — obtained 0.01099969 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R30 (n4→n6) — obtained 6.344449219 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.048505152 W vs absorbed 0.057635142 W — obtained 1.584e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.100e-2 A
- **P5/dense-network-15** — 12-node dense resistive network, floating + grounded V sources and a current source (#15)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.19204582 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R30 (n3→n9) — obtained 157.122073909 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered -0.100600468 W vs absorbed 5.893707755 W — obtained 1.017e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.920e-1 A
- **P5/dense-network-16** — 5-node dense resistive network, floating + grounded V sources and a current source (#16)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.028681683 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R2 (n2→0) — obtained 522.514596582 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered -0.372619348 W vs absorbed 9.971118972 W — obtained 1.037e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.784e-2 A
- **P5/dense-network-17** — 6-node dense resistive network, floating + grounded V sources and a current source (#17)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.025168842 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R6 (n6→0) — obtained 299.240980211 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.063763168 W vs absorbed 9.515738275 W — obtained 9.933e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 5.299e-2 A
- **P5/dense-network-18** — 7-node dense resistive network, floating + grounded V sources and a current source (#18)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 0.027263242 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R5 (n5→0) — obtained 119.725369757 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 1.017036366 W vs absorbed 3.852397813 W — obtained 7.360e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 3.603e-2 A
- **P5/dense-network-19** — 8-node dense resistive network, floating + grounded V sources and a current source (#19)
  - `mesh` **KCL**: KCL violated at node n5 (currents re-derived from node voltages) — obtained 0.121367874 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (n3→0) — obtained 1.5966e+4 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.735199027 W vs absorbed 1.6599e+4 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.039e-1 A
- **P5/dense-network-20** — 9-node dense resistive network, floating + grounded V sources and a current source (#20)
  - `mesh` **KCL**: KCL violated at node 0 (currents re-derived from node voltages) — obtained 0.062783202 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R11 (n1→n3): element voltage ≠ node-potential difference — obtained 48.824894265 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 2.291452786 W vs absorbed 2.789819958 W — obtained 1.786e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 6.278e-2 A
- **P5/dense-network-21** — 10-node dense resistive network, floating + grounded V sources and a current source (#21)
  - `mesh` **KCL**: KCL violated at node n10 (currents re-derived from node voltages) — obtained 0.12189732 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by branch law of R18 (n2→n5): element voltage ≠ node-potential difference — obtained 148.045339201 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered -0.39668607 W vs absorbed 2.883621687 W — obtained 1.138e+2 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 1.219e-1 A
- **P5/dense-network-22** — 11-node dense resistive network, floating + grounded V sources and a current source (#22)
  - `mesh` **KCL**: KCL violated at node n1 (currents re-derived from node voltages) — obtained 0.085387867 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R43 (n7→n11) — obtained 255.533208927 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.485108928 W vs absorbed 9.347485681 W — obtained 9.481e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 8.539e-2 A
- **P5/dense-network-23** — 12-node dense resistive network, floating + grounded V sources and a current source (#23)
  - `mesh` **KCL**: KCL violated at node n5 (currents re-derived from node voltages) — obtained 0.077345603 A, required ≤ 1e-4 A
  - `mesh` **KVL**: KVL violated around cycle closed by R37 (n3→n12) — obtained 600.485926647 V, required ≤ 1e-3 V
  - `mesh` **POWER**: Power balance broken: delivered 0.532427327 W vs absorbed 36.136712321 W — obtained 9.853e+1 %, required ≤ 0.1 %
  - `mesh` **SOLVER_FAULT**: mesh currents disagree with MNA branch currents by 7.735e-2 A
- **P5/transformer-cascade-0** — Two coupled meshes through ideal transformers (1:1 then 1:1)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Reduced nodal residual certificate failed (||G·V-z||∞=8.471e-2).
- **P5/transformer-cascade-1** — Two coupled meshes through ideal transformers (2:1 then 1:1)
  - `nodal` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with RESIDUAL_VIOLATION: Reduced nodal residual certificate failed (||G·V-z||∞=3.278e-2).

### 6. Student-mistake edge cases & degenerate topologies — 29 failed

- **P6/switch-charge-sharing-0** — Closing a switch across two capacitors at 5 V and 0 V (instantaneous node jump)
  - `tabd` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints.
- **P6/switch-charge-sharing-1** — Closing a switch across two capacitors at 10 V and -5 V (instantaneous node jump)
  - `tabd` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints.
- **P6/switch-charge-sharing-2** — Closing a switch across two capacitors at 3 V and 7 V (instantaneous node jump)
  - `tabd` **DIAGNOSTIC_ON_VALID**: Well-posed circuit rejected with SINGULAR_MATRIX: Singular MNA matrix: define a reference and remove conflicting ideal constraints.
- **P6/switch-charge-sharing-3** — Closing a switch across two capacitors at 12 V and 0 V (instantaneous node jump)
  - `tabd` **KCL**: KCL violated at node b — obtained 1.777580959 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 1.44 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `tabd` **PHYSICS_MISMATCH**: charge conservation: V(a)=(C1V1+C2V2)/(C1+C2) — obtained 12.48724812, required 11.881188119 ± 1.1882e-5
- **P6/switch-charge-sharing-4** — Closing a switch across two capacitors at 5 V and -5 V (instantaneous node jump)
  - `tabd` **KCL**: KCL violated at node b — obtained 0.88817842 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 2.5005e-7 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/switch-ideal-source-into-cap-0** — Switch closes an ideal 5 V source directly onto an uncharged 0.000001 F capacitor
  - `tabd` **KCL**: KCL violated at node 0 — obtained 0.005 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 0.025 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/switch-ideal-source-into-cap-1** — Switch closes an ideal 12 V source directly onto an uncharged 0.0001 F capacitor
  - `tabd` **KCL**: KCL violated at node c — obtained 0.576356839 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 3.6 W vs absorbed 0 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/switch-ideal-source-into-cap-2** — Switch closes an ideal 1.5 V source directly onto an uncharged 1e-9 F capacitor
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 2.2500e-6 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/switch-shorts-two-sources-0** — Switch closes between two ideal sources (5 V and 3 V)
  - `tabd` **PHYSICS_MISMATCH**: switch branch current physically bounded (< 1e6 A) (ideal sources 5 V / 3 V shorted through the switch) — obtained 2.0000e+15, required 1.0000e+6 ± 0
- **P6/switch-shorts-two-sources-1** — Switch closes between two ideal sources (12 V and 0 V)
  - `tabd` **PHYSICS_MISMATCH**: switch branch current physically bounded (< 1e6 A) (ideal sources 12 V / 0 V shorted through the switch) — obtained 1.2000e+16, required 1.0000e+6 ± 0
- **P6/switch-shorts-two-sources-2** — Switch closes between two ideal sources (5 V and -5 V)
  - `tabd` **PHYSICS_MISMATCH**: switch branch current physically bounded (< 1e6 A) (ideal sources 5 V / -5 V shorted through the switch) — obtained 1.0000e+16, required 1.0000e+6 ± 0
- **P6/zero-ohm-resistor-0** — Zero-ohm resistor in series with the source (#0)
  - `tabd` **KCL**: KCL violated at node 0 — obtained 0.005 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 0.025 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/zero-ohm-resistor-1** — Zero-ohm resistor in series with the source (#1)
  - `tabd` **KCL**: KCL violated at node 0 — obtained 0.05 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 0.25 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/zero-ohm-resistor-2** — Zero-ohm resistor in series with the source (#2)
  - `tabd` **KCL**: KCL violated at node in — obtained 0.329070518 A, required ≤ 1e-4 A
- **P6/zero-ohm-resistor-3** — Zero-ohm resistor in series with the source (#3)
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 2.5000e-5 W — obtained 1.000e+2 %, required ≤ 0.1 %
  - `engine` **POWER**: Power balance broken: delivered 2.3842e-5 W vs absorbed 2.5000e-5 W — obtained 4.633e+0 %, required ≤ 0.1 %
- **P6/zero-ohm-resistor-4** — Zero-ohm resistor in series with the source (#4, two cascaded)
  - `tabd` **KCL**: KCL violated at node 0 — obtained 0.105 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 0.525 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/zero-ohm-resistor-5** — Zero-ohm resistor in series with the source (#5, two cascaded)
  - `tabd` **KCL**: KCL violated at node 0 — obtained 0.015638298 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 0.078191489 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/zero-ohm-resistor-6** — Zero-ohm resistor in series with the source (#6, two cascaded)
  - `tabd` **KCL**: KCL violated at node x — obtained 1.276356839 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 6.25 W vs absorbed 2.525 W — obtained 5.960e+1 %, required ≤ 0.1 %
- **P6/zero-ohm-resistor-7** — Zero-ohm resistor in series with the source (#7, two cascaded)
  - `tabd` **KCL**: KCL violated at node 0 — obtained 0.0075 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 0.0375 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/invalid-value-0** — Invalid/degenerate element value: R=NaN
  - `tabd` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 3 node voltages, required structured diagnostic
  - `tabd` **KCL**: KCL violated at node in — obtained Infinity A, required ≤ 1e-4 A
  - `tabd` **KVL**: KVL violated around cycle closed by R3 (x→0) — obtained Infinity V, required ≤ 1e-3 V
  - `tabd` **POWER**: Power balance broken: delivered NaN W vs absorbed NaN W — obtained 0.000e+0 %, required ≤ 0.1 %
  - `tabd` **NUMERICAL_SANITY**: node in: non-finite voltage (NaN); node x: non-finite voltage (NaN); voltage V1: non-finite branch current (NaN)
  - `engine` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 5 node voltages, required structured diagnostic
- **P6/invalid-value-1** — Invalid/degenerate element value: R=+Infinity
  - `tabd` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 3 node voltages, required structured diagnostic
  - `tabd` **KVL**: KVL violated around cycle closed by R3 (x→0) — obtained Infinity V, required ≤ 1e-3 V
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed NaN W — obtained 0.000e+0 %, required ≤ 0.1 %
  - `engine` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 5 node voltages, required structured diagnostic
- **P6/invalid-value-2** — Invalid/degenerate element value: V=NaN
  - `tabd` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 2 node voltages, required structured diagnostic
  - `tabd` **KCL**: KCL violated at node in — obtained Infinity A, required ≤ 1e-4 A
  - `tabd` **KVL**: KVL violated around cycle closed by R2 (in→0) — obtained Infinity V, required ≤ 1e-3 V
  - `tabd` **POWER**: Power balance broken: delivered NaN W vs absorbed NaN W — obtained 0.000e+0 %, required ≤ 0.1 %
  - `tabd` **NUMERICAL_SANITY**: node in: non-finite voltage (NaN); voltage V1: non-finite branch current (NaN); resistor R2: non-finite branch current (NaN)
  - `engine` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 3 node voltages, required structured diagnostic
- **P6/invalid-value-3** — Invalid/degenerate element value: V=+Infinity
  - `tabd` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 2 node voltages, required structured diagnostic
  - `tabd` **KCL**: KCL violated at node in — obtained Infinity A, required ≤ 1e-4 A
  - `tabd` **KVL**: KVL violated around cycle closed by R2 (in→0) — obtained Infinity V, required ≤ 1e-3 V
  - `tabd` **POWER**: Power balance broken: delivered Infinity W vs absorbed NaN W — obtained 0.000e+0 %, required ≤ 0.1 %
  - `tabd` **NUMERICAL_SANITY**: node in: non-finite voltage (NaN); voltage V1: non-finite branch current (-Infinity); resistor R2: non-finite branch current (NaN)
  - `engine` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 3 node voltages, required structured diagnostic
- **P6/invalid-value-4** — Invalid/degenerate element value: I=NaN
  - `tabd` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 3 node voltages, required structured diagnostic
  - `tabd` **KCL**: KCL violated at node in — obtained Infinity A, required ≤ 1e-4 A
  - `tabd` **KVL**: KVL violated around cycle closed by R3 (x→0) — obtained Infinity V, required ≤ 1e-3 V
  - `tabd` **POWER**: Power balance broken: delivered NaN W vs absorbed NaN W — obtained 0.000e+0 %, required ≤ 0.1 %
  - `tabd` **NUMERICAL_SANITY**: node in: non-finite voltage (NaN); node x: non-finite voltage (NaN); voltage V1: non-finite branch current (NaN)
  - `engine` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 5 node voltages, required structured diagnostic
- **P6/invalid-value-5** — Invalid/degenerate element value: I=-Infinity
  - `tabd` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 3 node voltages, required structured diagnostic
  - `tabd` **KCL**: KCL violated at node in — obtained Infinity A, required ≤ 1e-4 A
  - `tabd` **KVL**: KVL violated around cycle closed by R3 (x→0) — obtained Infinity V, required ≤ 1e-3 V
  - `tabd` **POWER**: Power balance broken: delivered NaN W vs absorbed NaN W — obtained 0.000e+0 %, required ≤ 0.1 %
  - `tabd` **NUMERICAL_SANITY**: node in: non-finite voltage (NaN); node x: non-finite voltage (NaN); voltage V1: non-finite branch current (-Infinity)
  - `engine` **SILENT_SOLVE_ON_ILLPOSED**: Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised) — obtained 5 node voltages, required structured diagnostic
- **P6/invalid-value-6** — Invalid/degenerate element value: R=-1kΩ (negative resistance)
  - `tabd` **ORACLE_MISMATCH**: Node x deviates from the reference solve (κ≈1504.503) — obtained 3.75 V, required ≤ 7.5000e-7 V
  - `engine` **ORACLE_MISMATCH**: Node x deviates from the reference solve (κ≈1504.503) — obtained 2.5 V, required ≤ 7.5000e-7 V
- **P6/invalid-value-7** — Invalid/degenerate element value: R=-1Ω in a loop that cancels a +1Ω
  - `tabd` **ORACLE_MISMATCH**: Node x deviates from the reference solve (κ≈6) — obtained 0.00998004 V, required ≤ 5.0000e-7 V
  - `engine` **ORACLE_MISMATCH**: Node x deviates from the reference solve (κ≈6) — obtained 4.999999995 V, required ≤ 5.0000e-7 V
- **P6/invalid-value-8** — Invalid/degenerate element value: R=1e-30 Ω
  - `tabd` **KCL**: KCL violated at node 0 — obtained 0.005 A, required ≤ 1e-4 A
  - `tabd` **POWER**: Power balance broken: delivered 0 W vs absorbed 0.025 W — obtained 1.000e+2 %, required ≤ 0.1 %
- **P6/invalid-value-9** — Invalid/degenerate element value: R=1e30 Ω
  - `mesh` **KVL**: KVL violated around cycle closed by R3 (x→0) — obtained 5 V, required ≤ 1e-3 V


## 7. Coverage limits of this audit (what was *not* proven)
* The SPICE/WebAssembly path was excluded by instruction; findings RC-06/RC-07 describe gaps in the in-house path only.
* The engine exposes only time-domain backward-Euler stepping (no small-signal AC solver); frequency-domain behaviour is validated against a phasor oracle inside a documented 1.5–2 % backward-Euler band, which is coarser than a dedicated AC analysis would be.
* `meshG` (workspace-geometry mesh) was exercised on the planar layouts that could be embedded without an autorouter — 54 attenuator pads and 70 R-2R ladders (all passed); arbitrary dense graphs were exercised on the topology-fallback path only.
* MOSFET/JFET operating points are checked for KCL, Newton-root validity and physical polarity but have no analytic reference (the engine's square-law model is model-specific); BJT mirrors and differential pairs do have closed-form references under the engine's `Ic = β·Ib` model.
* `NodalSolver`/`MeshSolver` only ever see what `compileDcTopology` produces in the app; dependent-source constructs outside that mapping (ideal-transformer VCVS+CCCS) were probed on two circuits only and are classified LOW.
