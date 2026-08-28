# MAE Circuit Simulator — Diagnostic Audit Report

**Scope:** Phases 1–3 of the restored Circuit Lab implementation, assessed read-only at rollback version `553c2294` (requested source checkpoint `84a1f284`).

> **Audit constraint honored:** This report documents observed risks and mathematical contradictions only. It contains **no implementation patch, fix code, or source-code modification**.

## Executive finding

The simulator contains a strong strict-MNA core for ordinary grounded DC networks, and its academic panel already prevents several previously observed rendering failures: wide matrices are horizontally scrollable and block-level KaTeX has an explicit error fallback. However, the simulator currently crosses three different representations without a single invariant tying them together: the **electrical MNA graph**, the **geometric SVG/half-edge graph**, and the **pedagogical reduced graph**. The major audit conclusion is that a count, label, or equation can be internally valid within one representation but incompatible with another.

For a connected planar embedding, the bounded-face count must be

\[
M = E - V + 1,
\]

where \(E\) and \(V\) must be counted on the *same* planar embedding. Euler’s equivalent form is \(V-E+F=2\), including the exterior face.[1]

| Severity | Count | Principal concern |
|---|---:|---|
| **Critical** | 1 | Euler comparison uses an electrical graph count but extracts faces from a different geometric graph. |
| **High** | 7 | Current-source mesh constraints, control-source sensing, essential-node classification, symbolic trace coverage, and matrix-verification gaps. |
| **Medium** | 5 | Grid nonintegrality, centroid/label placement, source naming, conflict diagnostics, and documentation drift. |
| **Low** | 1 | Visual metadata documentation disagrees with active radius semantics. |

## Mathematical reference frame

Modified Nodal Analysis augments nodal KCL equations with one current unknown and one voltage equation for each voltage-defined branch. Consequently, an \((n+m)\times(n+m)\) system contains node voltages and voltage-branch currents, whereas a hand-derived nodal system may be smaller after valid substitution or reduction.[2] [3]

For resistor-only nodal blocks, the standard conductance structure is

\[
G_{ii}=\sum_{e\sim i}\frac{1}{R_e},
\qquad
G_{ij}=-\sum_{e\text{ joining }i,j}\frac{1}{R_e},\quad i\ne j.
\]

The audit evaluates the code against these invariants, not against a particular visual example.

---

# Phase 1 — Canvas, SVG, and UI topology audit

## P1-01 — Bounding-box center is not a true face-location guarantee

| Field | Finding |
|---|---|
| **Severity** | **Medium** |
| **Evidence** | `MeshSolver.ts`, lines 50–73, computes \(C=(x_{\min}+x_{\max},\,y_{\min}+y_{\max})/2\) and uses \(r=0.25\min(w,h)\). |
| **Affected output** | SVG mesh-current arrow and KaTeX \(I_i\) label placement. |

The active geometry does **not** compute the polygon centroid of a face. It computes the center of the axis-aligned perimeter bounding box:

\[
C_{\text{box}}=
\left(\frac{x_{\min}+x_{\max}}{2},\frac{y_{\min}+y_{\max}}{2}\right).
\]

This is exact only for centrally symmetric face regions. It is not equivalent to the polygon centroid

\[
C_x=\frac{1}{6A}\sum_i(x_i+x_{i+1})(x_i y_{i+1}-x_{i+1}y_i),
\qquad
C_y=\frac{1}{6A}\sum_i(y_i+y_{i+1})(x_i y_{i+1}-x_{i+1}y_i).
\]

For an irregular, concave, or component-crowded face, neither expression proves that the point lies in drawable free space. A circle centered at \(C_{\text{box}}\) can therefore overlap a device even when all boundary points are correct. The present radius clamp only limits the circle relative to the box; it does not measure the clearance to each component body or wire segment.

This is a placement-risk finding, not proof that every rectangular ladder face is wrong. In rectangular, unobstructed meshes, the active calculation is stable.

## P1-02 — The visual grid is discrete, but orthogonal routing can create half-grid vertices

| Field | Finding |
|---|---|
| **Severity** | **Medium** |
| **Evidence** | `wiring.ts`, lines 7–21 and 121–126; `Home.tsx`, lines 310–331 and 552–560. |
| **Affected output** | Wire corners, geometric face splitting, mesh overlay alignment. |

Component placement and dragging use \(\operatorname{round}(x/g)g\), where \(g=20\). Yet an automatically orthogonal route uses

\[
x_m=\frac{x_1+x_2}{2}.
\]

If \(x_1=0\) and \(x_2=20\), then \(x_m=10\), which is not a multiple of \(g=20\). Thus the route contains a geometric vertex outside the declared logical lattice despite both component terminals being snapped. A 45° rotation command is also available, and \(R_{45^\circ}(x,y)\) generally produces irrational or non-grid-aligned terminal coordinates.

This matters beyond appearance: Phase 2 splits planar rails at geometric vertices. A half-grid route corner can create a vertex in the face graph that has no corresponding intended circuit-grid junction.

## P1-03 — SVG order is mostly correct, but label collision protection is incomplete

| Field | Finding |
|---|---|
| **Severity** | **Medium** |
| **Evidence** | `Home.tsx`, lines 868–936. |
| **Affected output** | Component-reference labels, terminal names, Mesh-loop labels, and Nodal badges. |

The high-level order is academically sensible:

\[
\text{grid}\rightarrow\text{mesh loops}\rightarrow\text{wires}\rightarrow\text{components}\rightarrow\text{Nodal }V_i.
\]

Therefore component symbols correctly obscure mesh loops, and Nodal markers deliberately render last. This part is **not** an ordering defect.

The remaining issue is local ordering and fixed-size label boxes. A component’s `foreignObject` reference label is rendered before terminal circles in the same component group. Its dimensions are derived from a fixed heuristic, \(\max(54,10\times\text{label length})\), rather than KaTeX’s actual bounding box. A long or rotated label can be clipped or covered by a later terminal marker. There is no collision test between a label rectangle and the symbol’s transformed bounding region.

## P1-04 — Nodal visual centroid is a sample-point average, not a net-junction centroid

| Field | Finding |
|---|---|
| **Severity** | **Medium** |
| **Evidence** | `useSimulation.ts`, lines 77–111. |
| **Affected output** | Canvas placement of \(V_1,V_2,\ldots\). |

The net label uses

\[
\bar{x}=\frac{1}{k}\sum_{i=1}^{k}x_i,
\qquad
\bar{y}=\frac{1}{k}\sum_{i=1}^{k}y_i,
\]

over all terminal positions **and every routed wire point** on the net. This is sensitive to drawing style: inserting three manual corners into a long wire changes the node centroid even though electrical topology is unchanged. A visually long rail therefore attracts the marker toward whichever net has more path samples, rather than toward an essential junction.

---

# Phase 2 — Graph theory and MNA matrix assembly audit

## P2-01 — Euler diagnostic compares non-isomorphic graphs

| Field | Finding |
|---|---|
| **Severity** | **Critical** |
| **Evidence** | `MeshSolver.ts`, lines 106–174 and 177–238. |
| **Affected output** | Reported \(M=B-N+C\), extracted geometric-face count, Mesh matrix dimension, and SVG loop count. |

The Euler diagnostic is calculated from electrical MNA edges:

\[
M_{\text{electrical}}=B_{\text{MNA}}-N_{\text{MNA}}+C_{\text{MNA}}.
\]

The face walker, however, receives a different graph: component paths plus routed wire paths, then subdivides every segment at every collinear attached vertex. It subsequently retains only faces containing at least one branch whose ID is found in the resistor-ID set.

The two sides are not necessarily the same embedded multigraph:

\[
G_{\text{Euler}}\ne G_{\text{half-edge}}\ne G_{\text{resistor-filtered}}.
\]

Euler’s relation is a theorem only when \(E\), \(V\), \(C\), and \(F\) refer to one common planar embedding.[1] Here, wire-only segments modify the half-edge graph; MNA edges are counted as unsplit electrical branches; and resistor filtering modifies the face set after traversal. A displayed contradiction such as “Euler predicts five; four faces extracted” is therefore not merely a traversal failure—it is also an invalid comparison unless the graph identity is normalized first.

## P2-02 — Current-source constraint row selection has no rank certificate

| Field | Finding |
|---|---|
| **Severity** | **High** |
| **Evidence** | `MeshSolver.ts`, lines 185–199 and 245–258. |
| **Affected output** | Supermesh solvability and singular-matrix behavior. |

For a current source shared by two clockwise meshes, the valid relation is generally of the form

\[
\sigma_a I_a+\sigma_b I_b=I_s,
\qquad \sigma_a,\sigma_b\in\{-1,+1\}.
\]

The implementation replaces the first unreserved KVL row associated with the source by this constraint. It reserves a row index but does not test whether the resulting constraint rows are linearly independent, whether a KVL row was removed from the correct supermesh boundary, or whether

\[
\operatorname{rank}(Z_m)=n

\]

after every replacement. Two constraints can be algebraically dependent even when they occupy different rows. The subsequent Gaussian solver only detects this late when a pivot falls below \(10^{-12}\), producing a generic singularity instead of a topology-specific diagnostic.

## P2-03 — “Physical branch degree” counts synthetic MNA sensing branches

| Field | Finding |
|---|---|
| **Severity** | **High** |
| **Evidence** | `useSimulation.ts`, lines 55–60; `reducedNodalMatrix.ts`, lines 34–46. |
| **Affected output** | Essential-node filtering and reduced academic Nodal matrix dimension. |

The component compiler injects a `current-sense` element for CCCS/CCVS controls. The essential-degree calculation then counts every element carrying positive/negative terminals as a physical incident branch. Therefore a synthetic \(0\text{ V}\) sense branch can change

\[
d(v)=\sum_{e\in E}\mathbf{1}[v\in e]

\]

from \(2\) to \(3\), promoting a nonessential visible junction into an academic unknown. The code comment says “physical analysis branches,” but the set includes solver-introduced auxiliary branches. The displayed Degree \(\ge3\) law is consequently not invariant under MNA implementation details.

The same category risk exists for internal star-pack nodes: an internal expansion node can have degree three in MNA while having no meaningful external canvas junction for a student.

## P2-04 — CCCS/CCVS sensing can alter the modeled circuit instead of only observing it

| Field | Finding |
|---|---|
| **Severity** | **High** |
| **Evidence** | `useSimulation.ts`, lines 55–60; `mnaSolver.ts`, lines 97–121. |
| **Affected output** | Controlled-source topology and possible singular or physically incorrect results. |

For every CCCS/CCVS, the compiler creates a \(0\text{ V}\) `current-sense` branch directly between the control terminals \((c_p,c_n)\). MNA stamps such a branch as

\[
V_{c_p}-V_{c_n}=0.

\]

That equality is valid only if \((c_p,c_n)\) are explicitly a series current-sensing port. If they represent the terminals of an arbitrary existing control branch, this stamp is a new ideal short circuit in parallel with the intended branch. It can collapse a control voltage, change the graph, or produce a singular system. The solver does include a current unknown for every voltage-defined branch, so the issue is not “missing a dummy variable”; it is that the introduced sensing equation may impose a physical constraint not justified by the user schematic.

## P2-05 — Voltage-source conflict detection is local, not loop-complete

| Field | Finding |
|---|---|
| **Severity** | **Medium** |
| **Evidence** | `mnaSolver.ts`, lines 157–166. |
| **Affected output** | Error specificity for contradictory source loops. |

The precheck only compares independent sources connected across the same unordered pair of nodes. It detects the direct contradiction

\[
V_{ab}=5\text{ V},\qquad V_{ab}=7\text{ V},

\]

but not a contradictory source cycle such as

\[
V_{ab}+V_{bc}-V_{ac}\ne0.

\]

The latter reaches Gaussian elimination and is reported as a generic singular matrix. The numerical result may still be safely rejected, but the diagnostic loses the actual KVL cause.

## P2-06 — No post-solve KCL/KVL residual certificate is computed

| Field | Finding |
|---|---|
| **Severity** | **High** |
| **Evidence** | `mnaSolver.ts`, lines 126–132 and 169–186; `MeshSolver.ts`, lines 245–258. |
| **Affected output** | Trustworthiness of values displayed as verified solutions. |

Partial-pivot elimination rejects a small pivot, but neither solver calculates a residual such as

\[
r_A=A\hat{x}-z,
\qquad
\|r_A\|_\infty\le\varepsilon,

\]

nor branch-level KCL residuals or mesh KVL residuals. Consequently, “solved” currently means “elimination completed,” not “the displayed state was independently certified within tolerance.” Near-singular but nonzero-pivot systems can pass the current condition and still yield pedagogically misleading magnitudes.

---

# Phase 3 — Academic trace and pedagogical rendering audit

## P3-01 — Symbolic derivation is intentionally protected from solved-float leakage

| Field | Result |
|---|---|
| **Severity** | **No defect confirmed** |
| **Evidence** | `NodalSolver.ts`, lines 32–66 and 72–114. |

The KCL generator is supplied with elements, source declarations, node mappings, and known-node values; it does not receive `MNAResult`. This is a sound separation. A term like

\[
\frac{V_1-10}{R_3}

\]

is derived from a declared source offset, not from a post-solve voltage. Numerical values enter only the final solved-vector step. This part of the Phase 3 architecture is consistent with the required pedagogical separation.

## P3-02 — Symbolic substitution is incomplete outside one grounded source–resistor pattern

| Field | Finding |
|---|---|
| **Severity** | **High** |
| **Evidence** | `NodalSolver.ts`, lines 39–49 and 82–89; `reducedNodalMatrix.ts`, lines 55–72. |
| **Affected output** | KCL and Supernode derivations for longer simple-node chains. |

The symbolic engine only recognizes a degree-two node containing one resistor to ground and one independent voltage source. For any other eliminated/simple node, the derivation emits the placeholder

\[
\mathrm{V_{series}}.

\]

This is not an algebraic elimination. A series chain with two resistors, a floating source, or a source connected through a non-grounded passive branch is outside the recognized pattern. The backend may solve the full topology correctly while the student sees an opaque placeholder, so the academic trace is not generally closed under the same graph reductions used by the solver.

## P3-03 — Known-source conditions lose node identity and source provenance

| Field | Finding |
|---|---|
| **Severity** | **Medium** |
| **Evidence** | `NodalSolver.ts`, line 91. |
| **Affected output** | Box 1, “Known source conditions.” |

Known lines are generated from map values only:

\[
\text{Known grounded-source node}=V_s.

\]

They omit the node key, source ID, and polarity relationship. Two grounded sources of the same magnitude therefore yield indistinguishable lines. A student cannot verify whether \(+12\text{ V}\) belongs to the intended node or whether a reversed source should establish \(-12\text{ V}\). The internal sign extraction is correct for an independent grounded source, but the academic presentation discards the audit trail that proves it.

## P3-04 — Displayed reduced matrix is not independently verified against displayed final voltages

| Field | Finding |
|---|---|
| **Severity** | **High** |
| **Evidence** | `reducedNodalMatrix.ts`, lines 143–156; `NodalSolver.ts`, lines 100–114. |
| **Affected output** | Box 4 reduced matrix and Box 5 solved-vector consistency. |

The report matrix is a Schur-reduced conductance system. For a partition

\[
\begin{bmatrix}G_{pp}&G_{ps}\\G_{sp}&G_{ss}\end{bmatrix}
\begin{bmatrix}V_p\\V_s\end{bmatrix}
=
\begin{bmatrix}b_p\\b_s\end{bmatrix},
\]

the implementation forms the expected reduction

\[
G_{\mathrm{red}}=G_{pp}-G_{ps}G_{ss}^{-1}G_{sp},
\qquad
b_{\mathrm{red}}=b_p-G_{ps}G_{ss}^{-1}b_s.

\]

The algebraic form is reasonable for a nonsingular passive simple-node block. However, the displayed solution vector is taken from the separate full-MNA solve, not by solving the displayed \(G_{\mathrm{red}}\) system or checking

\[
r_{\mathrm{ped}}=G_{\mathrm{red}}V_{p,\mathrm{MNA}}-b_{\mathrm{red}}.

\]

Without \(r_{\mathrm{ped}}\), the UI cannot prove that the visible reduced matrix is the one whose visible voltages were solved. This becomes significant when synthetic MNA branches, unsupported simple chains, or controlled sources participate in the topology.

## P3-05 — Matrix overflow handling is present; raw block-LaTeX fallback is controlled

| Field | Result |
|---|---|
| **Severity** | **No defect confirmed** |
| **Evidence** | `AnalysisBox.tsx`, line 42; `V3Math.tsx`, lines 8–10. |

The matrix block has `overflow-x-auto` with an inner minimum-width wrapper, so a wide matrix scrolls inside its card instead of forcing the parent grid to overflow. Block KaTeX also has a visible error fallback, “Mathematical expression unavailable.” This is a material improvement over raw LaTeX bleed in a block equation.

The remaining caveat is that inline `V3Math` does not define the same explicit render-error fallback. A malformed inline expression in a canvas label or inspector therefore has a different failure path from the academic matrix.

## P3-06 — Numeric compaction is global and syntax-unaware

| Field | Finding |
|---|---|
| **Severity** | **Low** |
| **Evidence** | `analysisFormatting.ts`, lines 7–11. |

Precision selection applies a regular expression across the complete LaTeX string. It is not restricted to matrix entries or declared physical constants. The operation is useful for readable equations, but it has no parser awareness of whether a numeric token belongs to a numerical coefficient, a source label, a subscript, or a color macro. For currently conventional labels this is usually harmless; it remains a latent presentation risk as symbolic formats become more complex.

---

# Cross-phase contradictions

| ID | Severity | Contradiction |
|---|---|---|
| X-01 | **Critical** | The face walker uses screen geometry and split SVG segments, while Euler count uses MNA branches/nets. A geometric mesh count cannot be certified by an electrical count unless both derive from one normalized embedded graph. |
| X-02 | **High** | Essential-node display degree is derived from MNA elements, including synthetic control branches; the canvas centroid derives from visible pins and wire paths. The same “node” can be essential in text but lack a legitimate visible junction. |
| X-03 | **High** | The reduced academic matrix and the numerical MNA result are calculated through different pathways but are displayed as one derivation without a residual equality check. |
| X-04 | **Medium** | Grid-snapped placement does not guarantee grid-snapped wire geometry. Thus a canvas may look lattice-based while its planar graph contains half-grid vertices. |

# Audit conclusion

The most serious issue is not a single arithmetic sign. It is the lack of a canonical topology contract shared by the canvas, face extractor, MNA compiler, and academic reducer. Until one graph identity governs \(E\), \(V\), branch provenance, visual vertices, and pedagogical elimination, discrepancies such as missing Meshes, extra essential nodes, and a matrix that cannot be independently reconciled to its displayed solution will remain possible.

The strict MNA stamps for ordinary resistor/current/voltage circuits are structurally sound, and several Phase 3 safeguards are already present. The audit therefore does **not** conclude that every simulation is invalid. It concludes that the specified edge cases—irregular geometry, current-source meshes, controlled sources, and nontrivial reduced derivations—lack the invariant checks required for an academic-grade simulator.

## References

[1]: https://discrete.openmathbooks.org/more/mdm/sec_planar.html "Grassl & Levin, *More Discrete Mathematics via Graph Theory*: Planar Graphs and Euler’s Formula"

[2]: https://lpsa.swarthmore.edu/Systems/Electrical/mna/MNA2.html "Swarthmore LPSA: Modified Nodal Analysis — Introduction"

[3]: https://lpsa.swarthmore.edu/Systems/Electrical/mna/MNA3.html "Swarthmore LPSA: An Algorithm for Modified Nodal Analysis"
