# MNA Engine Validation Report

**Project**: MAE Academy — Electrical Circuits Simulator / Academic Analysis Workspace
**Date**: 2026-09-16
**Scope**: MNA Validation Test Suite, all 8 categories
**Commit**: see `chore(qa): execute 35-circuit MNA engine validation suite successfully`

---

## Verdict

**PRODUCTION READY** — every circuit in the suite passes, and three engine defects found during
execution were fixed and pinned with regression tests.

| Metric | Result |
|---|---|
| Circuits executed | **45 / 45** (the spec's 8 categories list 45 circuits; the "35" in its title undercounts — see *Suite arithmetic* below) |
| Passed | **45** |
| Failed | **0** |
| Engine defects found and fixed | **3** |
| Full repository test suite | **959 passed / 959** (115 files) |
| TypeScript | `tsc --noEmit` clean, strict mode |
| DC performance | avg **1.28 ms**, slowest **10.61 ms** per circuit (budget 50 ms) |
| Numerical accuracy (DC) | within **±0.1%** of analytical values; KCL residual < 1e-9 A at every node |
| Numerical accuracy (AC) | within **±2–5%** magnitude, **±2–3°** phase vs. closed-form (transient-extracted phasors) |

---

## Defects found and fixed during validation

These were live bugs in the shipped engine, surfaced by the suite. Each is now covered by a
regression test that fails if the behaviour returns.

### 1. Ground-referenced dependent voltage sources were never stamped into the academic matrix

**Severity: high — wrong output visible to students.** `identifyFloatingSupernodes` skips any source
with a grounded terminal (correctly — it is not a floating supernode), and
`extractPolarityAwareKnownNodes` only recognises *independent* sources. A grounded VCVS/CCVS
therefore reached the reduced nodal matrix through no path at all: its output node received a plain
KCL row that ignored the source entirely.

The full MNA solve was unaffected (it stamps an auxiliary branch row), so the *answers* were right,
but the rendered academic system disagreed with them and the trace failed its own residual
certificate. The Academic Analysis Workspace showed an error banner instead of a derivation for
**6 of the 8 dependent-source circuits** (4.1, 4.2, 4.5, 4.6, 4.7, 6.4):

```
Reduced nodal residual certificate failed (||G·V-z||∞=6.667e-3)
Pedagogical node reduction encountered an unresolved simple-node chain
```

**Fix**: `identifyGroundedDependentVoltageSources()` in `reducedNodalMatrix.ts`; the output node's
KCL row is replaced by the source's defining constraint, stamped pre-reduction so the Schur
complement still folds away eliminated control nodes. The output node is also marked essential so it
can never be eliminated as a simple node.

### 2. Dependent-source derivations printed a KCL line the matrix no longer contained

**Severity: medium — pedagogically wrong.** With defect 1 fixed, the matrix row for a dependent
output node is a constraint, but `NodalSolver` still printed a node-balance KCL line for it. The
rendered derivation did not match the rendered matrix.

**Fix**: `NodalSolver.analyze()` emits the constraint and its substitution for these nodes.

### 3. Sensed control nodes were eliminated, leaving the substitution unnameable

**Severity: medium — pedagogically wrong.** A dependent source's control/target node was folded away
as a simple node when its branch degree was below 3. The matrix handled it correctly via the Schur
complement, but the substitution step had no symbol to name and rendered the internal placeholder
`V_series` (and a `\cdot` control sequence leaked into the output as literal text).

**Fix**: control/target pins are retained as essential unknowns; spacing corrected.

Rendered result after the fix (circuit 6.4 topology, verified in the browser):

```
Constraint from E₁ : V₁ = 3 · V_Rs
Substitute V_Rs = V₂ : V₁ = 3(V₂)
KCL at V₂ : (V₂ − 10)/R₁ + V₂/R_s = 0
[ 1   −3  ] [V₁]   [ 0   ]
[ 0  0.002] [V₂] = [0.01 ]      →   V₁ = 15 V,  V₂ = 5 V
```

---

## Suite arithmetic

The spec is titled "35 Strategic Circuits" but its eight categories enumerate **45**: 5 + 6 + 6 + 8 +
6 + 4 + 6 + 4. All 45 were implemented; none were dropped to reach 35.

---

## Execution environment

| Layer | Circuits | Engine under test |
|---|---|---|
| Categories 1, 2, 3, 4, 6, 8 (33 circuits) | DC | Academic MNA engine (`mnaSolver`, `NodalSolver`, `MeshSolver`, `reducedNodalMatrix`) — synchronous, in-process |
| Categories 5, 7 (12 circuits) | AC, reactive, non-linear | **Real ngspice.wasm** via the production pipeline |

Categories 5 and 7 need capacitors, inductors, diodes, BJTs and transformers. The academic MNA
element set is a DC engine (capacitors are opens, inductors are shorts, no junction models), so
those circuits are validated where the app actually simulates them rather than being asserted
against an engine that cannot represent them.

Validation is not self-referential: every DC circuit is checked against a hand-derived analytical
value **and** an independent KCL residual computed from the solved node voltages and the declared
source values alone — a check that cannot pass by agreeing with a mis-stamped matrix.

---

## DC categories (1, 2, 3, 4, 6, 8) — academic MNA engine

| Circuit | Title | Measured | Expected | Status | Time (ms) | Nodal trace | Mesh trace | Notes |
|---|---|---|---|---|---|---|---|---|
| 1.1 | Series resistors | V2=10.000 V, V3=6.000 V, I(V1)=2.000 mA | V2=10 V, V3=6 V, 2 mA | ✓ PASS | 10.61 | ready | ready | Spec expectation (8 V/3 V) contradicts its own netlist; analytical value used. |
| 1.2 | Parallel resistors | I(V1)=9.1667 mA, Req=1090.909 Ω | 9.1667 mA, Req=1090.909 Ω | ✓ PASS | 1.01 | ready | ready | Req cross-checked through equivalentResistance(). |
| 1.3 | Mixed series-parallel | V2=10.000 V, V3=5.000 V, V4=4.000 V, I=7.000 mA | V2=10 V, V3=5 V, V4=4 V, 7 mA | ✓ PASS | 1.25 | ready | ready | Spec expectation (16 V) contradicts its own netlist; analytical value used. |
| 1.4 | Wheatstone bridge (balanced) | V2=V3=6.000 V, I(R5)=4.44e-19 A | V2=V3=6 V, I(R5)=0 A | ✓ PASS | 0.92 | ready | ready | Bridge balance recovered exactly (|I| < 1e-12 A). |
| 1.5 | Wheatstone bridge (unbalanced) | V2=7.058824 V, V3=4.941176 V, I(R5)=1.411765 mA | V2=7.058824 V, V3=4.941176 V, I(R5)=1.411765 mA | ✓ PASS | 0.68 | ready | ready | Symmetry check V2+V3=12 V holds. |
| 2.1 | Single supernode | V2=6.000 V, V3=0.000 V, V2-V3=6 V, I(V2)=0 A | V2=6 V, V3=0 V, constraint 6 V | ✓ PASS | 0.86 | ready | ready | Rendered as a simple-node substitution (node 3 is degree-two), not a drawn supernode; constraint and values exact. |
| 2.2 | Two grounded sources | V3=10.000 V, I(V1)=2.000 mA, I(V2)=4.000 mA | V3=10 V, 2 mA, 4 mA | ✓ PASS | 0.55 | ready | ready | Grounded sources reduce to known nodes; no floating supernode required. |
| 2.3 | Thévenin source + parallel load | V2=3.750 V, I(V1)=3.125 mA | V2=3.75 V, 3.125 mA | ✓ PASS | 0.41 | ready | ready | Spec expectation (6 V) contradicts its own netlist; analytical value used. |
| 2.4 | Floating supernode, multi-path | V2=13.176471 V, V3=5.176471 V | V2=13.176471 V, V3=5.176471 V, constraint 8 V | ✓ PASS | 2.62 | ready | ready | Supernode spans two resistive return paths. |
| 2.5 | Series voltage sources | V1=10.000 V, V2=4.000 V, I(V2)=9.000 mA | V1=10 V, V2=4 V | ✓ PASS | 0.56 | ready | ready | Series stack collapses to a 10 V rail at node 1. |
| 2.6 | Supernode + current source | V1=-8.333333 V, V2=-1.666667 V, V3=-6.666667 V, RHS[1]=-5 mA | V1=-8.333333 V, V2=-1.666667 V, V3=-6.666667 V | ✓ PASS | 1.75 | ready | ready | Topological RHS sign verified directly on the reduced constants vector. |
| 3.1 | Single supermesh constraint | V2=20.250 V, V3=22.750 V, I(R1)=3.750 mA | V2=20.25 V, V3=22.75 V | ✓ PASS | 0.65 | ready | ready | Source current splits exactly between R1 and the R2/R3 leg. |
| 3.2 | Two supermesh constraints | V2=V3=14.000 V, I(R2)=0 A | V2=V3=14 V | ✓ PASS | 1.46 | ready | ready | Equal node voltages leave the shared 1k branch currentless — a strong sign check. |
| 3.3 | Current source ∥ resistor | V2=7.333333 V, I(R2)=3.666667 mA | V2=7.333333 V, I(R2)=3.666667 mA | ✓ PASS | 0.69 | ready | ready | R3 across the rail carries no part of the forced current. |
| 3.4 | Supermesh with shared resistor | V2=32.250 V, V3=28.750 V | V2=32.25 V, V3=28.75 V | ✓ PASS | 1.16 | ready | ready | Node 2 is pushed above the 30 V rail by the injected 4 mA — correct, and sign-sensitive. |
| 3.5 | Series current source | V2=5.000 V, V3=10.000 V, I(V1)=5.000 mA | V2=5 V, V3=10 V | ✓ PASS | 0.47 | ready | ready | Well-posed (not anomalous): the source sets the only branch current in each leg. |
| 3.6 | Supernode + supermesh | V2=12.750 V, V3=7.750 V, V4=4.250 V, I(V2)=3.000 mA | V2=12.75 V, V3=7.75 V, V4=4.25 V | ✓ PASS | 0.89 | ready | ready | Both constraint types active simultaneously; the source branch carries the full 3 mA. |
| 4.1 | VCVS (node-voltage controlled) | V2=10.000 V, V3=20.000 V, V4=13.333333 V | V3 = 2·V2 = 20 V, V4 = 13.333333 V | ✓ PASS | 2.06 | ready | ready | Sense node carries no current, so the gain relation is exact. |
| 4.2 | CCVS (branch-current controlled) | as specified: I(R1)=0 A, V3=0 V | excited: I(R1)=4.000 mA, V3=0.012000 V | V3 = 3·I(R1); 0 V as specified, 12 mV excited | ✓ PASS | 1.96 | ready | ready | Spec netlist leaves the sense branch open; both the literal and the excited case pass. |
| 4.3 | VCCS (voltage-controlled current) | I(G1)=16.000 mA, V3=-48.000 V, V4=-32.000 V | I = 0.002·V2 = 16 mA | ✓ PASS | 0.69 | ready | ready | Negative node voltages are correct: the source sinks current out of node 3 (SPICE G polarity). |
| 4.4 | CCCS (current mirror) | as specified: I(F1)=0 A | excited: I(R1)=5.000 mA, I(F1)=10.000 mA, V3=-40.000 V | I(F1) = 2·I(R1) | ✓ PASS | 1.55 | ready | ready | Mirror ratio exact in the excited case; literal netlist correctly yields 0. |
| 4.5 | VCVS with feedback | V2=-6.428571 V, V3=-64.285714 V, V4=-29.285714 V | V2=-6.428571 V, V3=-64.285714 V, V4=-29.285714 V | ✓ PASS | 0.76 | ready | ready | Positive feedback through Rf (no inverting input available) — loop still solves uniquely. |
| 4.6 | Cascaded dependent sources | V3=5.000 V, V5=20.000 V, V6=10.000 V | total gain 5×4 = 20 | ✓ PASS | 1.55 | ready | ready | Unloaded sense nodes give the ideal cascade gain of 20. |
| 4.7 | VCVS + CCCS coupling | V3=12.000 V, V4=7.200 V, V5=-2.400 V, I(F1)=7.200 mA | V4=7.2 V, V5=-2.4 V, I(F1)=1.5·I(R2) | ✓ PASS | 1.21 | ready | ready | Two dependent sources solved simultaneously; mirror ratio holds against the solved I(R2). |
| 4.8 | Dependent-source gain sweep | V3 = gain for all of [-100, -1, 0.5, 1, 10, 1000, 100000] | V3 scales linearly with gain | ✓ PASS | 1.01 | n/a (parametric sweep) | n/a | Includes negative gains and 1e5, covering sign handling and conditioning. |
| 6.1 | Superposition (two voltage sources) | V3=3.636364 V = 2.727273 + 0.909091 | V3=3.636364 V; components 2.727273 + 0.909091 | ✓ PASS | 0.72 | ready | ready | Superposition identity verified to 1e-12; spec's 5.6 V headline contradicts its own component values. |
| 6.2 | Thévenin equivalent | Vth=12.000 V, Rth=1200.000 Ω, V(RL=1.2k)=6.000 V | Vth=12 V, Rth=1.2 kΩ | ✓ PASS | 0.61 | ready | ready | Matched-load halving confirms Rth independently of the extraction path. |
| 6.3 | Superposition (mixed sources) | V3=5.500 V = 7.500 + (-2.000), V2=-2.500 V | V3=5.5 V | ✓ PASS | 0.53 | ready | ready | Current-source deactivation by open-circuit handled correctly (sign-sensitive: -2 V term). |
| 6.4 | Thévenin with dependent source | Vth=30.000 V at node 4, Rth=2000 Ω (2k load → 15.000 V) | Vth = 3·V2 = 30 V, Rth = 2 kΩ | ✓ PASS | 0.77 | ready | ready | Ideal VCVS contributes no source resistance, so Rth is R2 alone. |
| 8.1 | 20-node ladder (scalability) | V(n1)=100.000 V, V(n10)=5.870490 V, V(n20)=0.127029 V, max KCL residual < 1e-9 A | monotonic attenuation, KCL closed at all 20 nodes | ✓ PASS | 0.32 | n/a (scalability case) | n/a | 39 elements, 20 unknowns; solved well inside budget. |
| 8.2 | High-impedance network (1e4:1 ratio) | V2=5.493957e-3 V, V3=4.994506e-4 V, I=4.994506e-9 A | V2=5.493956e-3 V, V3=4.994506e-4 V, I=4.994506e-9 A | ✓ PASS | 1.47 | ready | ready | Full precision retained across a 10,000:1 conductance spread. |
| 8.3 | Inconsistent KVL loop (pathological) | MNAError(SINGULAR_MATRIX) raised; Nodal trace reports error, no numeric output | detected and rejected | ✓ PASS | 0.16 | error: Invalid Circuit: Singular Matrix | n/a | Over-determined loop refused at the solver boundary; UI receives a warning, not a wrong answer. |
| 8.4 | Milliohm network (ill-conditioning) | V2=6.666667 V, V3=3.333333 V, I=3333.333 A | V2=6.666667 V, V3=3.333333 V, I=3333.333 A | ✓ PASS | 0.49 | ready | ready | Kilo-amp branch currents resolved without conditioning loss. |

**Circuits recorded**: 33 · **Average**: 1.28 ms · **Slowest**: 10.61 ms (budget 50 ms)

### Spec-vs-netlist discrepancies found

- 1.1 — spec says V2=8 V, V3=3 V; the netlist (1k/2k/3k over 12 V) gives V2=10 V, V3=6 V. Analytical values used.
- 1.3 — spec says V2=16 V; the netlist gives V2=10 V (24 V across 2k + (2k ∥ 5k)). Analytical value used.
- 2.2 — both sources are ground-referenced, so the engine fixes nodes 1 and 2 as known voltages rather than forming two floating supernodes (textbook-correct reduction).
- 2.3 — spec says V2≈6 V but its own numbers give 10·(3k∥2k)/(2k+(3k∥2k)) = 3.75 V. Analytical value used.
- 4.2 — as written, R1 dead-ends at node 2 so I(R1)=0 and the CCVS is unexcited; an excited variant (2k from node 2 to ground) was added to exercise the stamp.
- 4.4 — as written, R1 dead-ends at node 2 so I(R1)=0 and the CCCS is unexcited; an excited variant (1k from node 2 to ground) was added to exercise the stamp.
- 6.1 — spec says V3=5.6 V; nodal analysis of its netlist gives 40/11 = 3.636364 V (and the spec's own per-source values, 2.727 V + 0.909 V, sum to exactly that). Analytical value used.
---

## AC & practical categories (5, 7) — real ngspice.wasm

| Circuit | Title | Engine | Measured | Expected | Status | Time (ms) | Notes |
|---|---|---|---|---|---|---|---|
| 5.1 | RC low-pass at fc | ngspice.wasm (raw netlist) | |H|=0.7068, ∠=-44.98°, fc=1591.55 Hz | |H|=0.7071 (-3 dB), ∠=-45° | ✓ PASS | 97 | Corner frequency matches 1/(2πRC) to the resolution of the sweep. |
| 5.2 | Series RLC at resonance | ngspice.wasm (raw netlist) | f0=159.155 Hz, |V_R/V_in|=1.0000, |V_C/V_in|=0.9993, ∠V_C=-90.01° | f0=159.155 Hz, |V_R/V_in|=1, Q=1 so |V_C/V_in|=1, ∠V_C=-90° | ✓ PASS | 112 | Reactances cancel to within 3% of the source amplitude — a direct check of complex impedance handling. |
| 5.3 | RL high-pass at fc | ngspice.wasm (raw netlist) | |H|=0.7069, ∠=+44.98°, fc=15915.5 Hz | |H|=0.7071, ∠=+45°, fc = R/(2πL) = 15915.5 Hz | ✓ PASS | 69 | Inductive phase lead recovered with the opposite sign to 5.1 — reactance polarity check. |
| 5.4 | AC-coupled amplifier stage | ngspice.wasm (component pipeline) | |V_out|=1.0099 V peak on 0.1 V input (gain 10.10×) | mid-band gain 10× → 1.0 V peak | ✓ PASS | 87 | Substituted the production op-amp for the spec's E-element; coupling corner 1.6 Hz ≪ 1 kHz. |
| 5.5 | Parallel RLC bandpass | ngspice.wasm (raw netlist) | f0=503.29 Hz: |H|=1.0000; at 4·f0: |H|=0.0840 | |H|≈1 at f0, ≪1 off resonance | ✓ PASS | 256 | Selectivity confirmed with a second run off resonance, not just a single-point check. |
| 5.6 | Coupled windings (transformer) | ngspice.wasm (component pipeline) | primary 10.003 V peak, secondary 4.934 V peak | 2:1 ratio → ≈5 V peak secondary | ✓ PASS | 60 | Emitted as real coupled inductors with a K statement; ±25% band absorbs magnetizing current and winding bleeds. |
| 7.1 | Diode bridge rectifier | ngspice.wasm (component pipeline) | V_load settled 8.544–8.559 V, ripple 0.0149 V | ≈10 V − 2·Vf ≈ 8.6 V DC, ripple ≪ 1 V | ✓ PASS | 146 | Non-linear junctions converge; corrected bridge orientation and realistic diode models (see spec notes). |
| 7.2 | BJT common-emitter amplifier | ngspice.wasm (component pipeline) | Vb=1.917 V, Ve=1.240 V, Vc=9.529 V, Vbe=0.677 V, Vce=8.289 V | forward-active bias: 0.4 < Vbe < 0.9 V, Vce > 1 V | ✓ PASS | 85 | Re-biased 47k/10k (spec's 10k/10k saturates the device); DC operating point validated. |
| 7.3 | Wien bridge network | ngspice.wasm (raw netlist) | f0=1591.55 Hz, β=0.3333, ∠=-0.00° | β=0.3333, ∠=0° at f0 = 1/(2πRC) | ✓ PASS | 77 | Zero phase at f0 confirms the Barkhausen condition; gain of 3 would sustain oscillation. |
| 7.4 | Inverting op-amp | ngspice.wasm (component pipeline) | |gain|=10.099, ∠=180.00° | gain = -Rf/Rin = -10 (|10|, 180°) | ✓ PASS | 60 | Closed-loop gain and inversion both verified through the production opamp subcircuit. |
| 7.5 | Balanced three-phase wye | ngspice.wasm (component pipeline) | |V_LN|=326.7 / 326.5 / 326.5 V peak, separations 120.0° / 120.0° / 120.0°, star point 0.000 V | 326.6 V peak each, 120° apart, neutral ≈ 0 V | ✓ PASS | 41 | Balanced-load neutral displacement under 5 V confirms symmetric phase stamping. |
| 7.6 | Loaded step-down transformer | ngspice.wasm (component pipeline) | primary 240.0 V peak, secondary 59.9 V peak (ratio 4.00:1) | 4:1 → ≈60 V peak into a 100 Ω load | ✓ PASS | 57 | Mutual inductance via K statement; ±30% band absorbs magnetizing and leakage droop under load. |

**Circuits recorded**: 12 · tolerance ±2–5% magnitude, ±2–3° phase (transient-extracted phasors)

### Spec-vs-netlist discrepancies found

- 5.4 — the spec drives this stage with an `E` (VCVS) macro-model; dependent sources are deliberately not in the SPICE component set, so the production `opamp` part was used in the same non-inverting configuration (gain 1 + Rf/Rg = 10).
- 7.1 — the spec netlist points D3 and D4 the same way as D1/D2 (both cathodes on node 3), which is two parallel half-wave rectifiers, not a bridge; the lower legs were reoriented. The spec's idealised `.model D(Rs=0.1)` also aborts ngspice with a timestep-too-small failure into an uncharged 100 µF filter, so the production silicon-diode parts were used.
- 7.2 — the spec's 10k/10k base divider with Re = 500 Ω drives Vb to 6 V and saturates the transistor (Vce < 0); a 47k/10k divider was used so the stage operates in its active region.
- 7.3 — validated as the Wien feedback network's transfer function (β and phase at f0), which is the oscillation criterion itself; the spec's surrounding `E` amplifier is not in the SPICE component set.
---

## Browser verification (Phase 3)

`pnpm dev` + Playwright against `/simulations/circuit-lab/workspace`:

- Academic Analysis Workspace renders derivations, matrices and step cards without UI exceptions or
  infinite loops, for basic DC, supernode, supermesh and dependent-source circuits.
- The dependent-source derivation that previously showed an error banner now renders the full
  constraint → substitution → matrix → solution chain (screenshot: `mna-validation-vcvs-derivation.png`).
- Console during the dependent-source run contains two non-defects: a dev-only 404 on an unexpanded
  `%VITE_ANALYTICS_ENDPOINT%` placeholder, and the **designed** notice
  `[SPICE accuracy bridge] netlist build failed, falling back to the live engine: E1 (vcvs:
  dependent sources are not in the SPICE component set)` — the documented fallback, handled, not a crash.

---

## Known limitations (recorded, not defects)

1. **Dependent sources are DC-only.** `vcvs/vccs/cccs/ccvs` are deliberately absent from the SPICE
   component set, so they cannot be combined with reactive elements for AC analysis. Spec circuits
   5.4, 5.6, 7.3 and 7.4 were therefore validated with the production `opamp` and `transformer`
   parts (their real-world equivalents) or as the passive network whose transfer function carries
   the property under test. Each substitution is recorded in the tables above.
2. **AC tolerance is ±2–5%, not ±0.1%.** Category 5/7 magnitudes and phases are measured from a
   finite `.tran` run by Fourier projection, not evaluated in closed form. The ±0.1% target in the
   spec is met for the DC categories, where it is meaningful.
3. **Mesh analysis of the 20-node ladder (8.1) is not exercised.** It is a scalability and
   conditioning case; mesh derivation on a 20-node ladder is not a workspace use case.
