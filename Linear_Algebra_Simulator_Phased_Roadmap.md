# Linear Algebra Simulator — Phased Remediation Roadmap

## Purpose and Operating Principle

This roadmap converts the diagnostic audit into sequenced releases. **Mathematical truthfulness precedes visual refinement.** A user must never receive a confident numerical result from a capability that is unsupported, unstable, dimensionally invalid, or insufficiently certified.

The plan is intentionally release-gated. A later phase may be prototyped in parallel, but it must not be presented as a completed simulator capability before the acceptance criteria of its prerequisite phase are met.

| Ordering rule | Rationale |
|---|---|
| Correctness before pedagogy | A polished derivation is harmful when its result classification or numerical value is unreliable. |
| Explicit scope before broader algorithms | A clearly limited simulator is safer and more educational than a silently approximate one. |
| Certificates before visual claims | Residuals, ranks, pivots, and convergence status are the bridge between computation and academic explanation. |
| Operation-specific visualisations after solver contracts | The visual layer should explain verified mathematics, not decorate generic output. |

## Portfolio Prioritisation Matrix

| Workstream | Mathematical risk if delayed | UX impact | Dependency | Recommended phase |
|---|---|---:|---|---|
| Input validation and resource limits | Critical | High | None | 0 |
| Systems/RREF classification and multi-RHS handling | Critical | Critical | Phase 0 | 1 |
| Eigen capability boundary and certified solver path | Critical | High | Phase 0 | 1 |
| Numerical policy and result certificates | High | High | Phase 1 | 2 |
| Correct academic derivations and exact/approximate presentation | High | High | Phase 1–2 | 3 |
| Operation-specific geometry and visual semantics | Medium | High | Phase 1–2 | 4 |
| Responsive, accessibility, localisation, and MAE alignment | Medium | High | Phase 0–4 | 5 |
| Advanced breadth and authoring tools | Low | Medium | All earlier phases | 6 |

## Phase 0 — Safety Envelope and Capability Contract

**Objective:** Prevent the simulator from silently changing inputs, exhausting browser resources, or claiming support for operations outside its verified boundary.

| Scope | Required deliverable | Acceptance gate |
|---|---|---|
| Cell validation | Preserve draft text, distinguish blank/invalid/non-finite values, and prohibit calculation until all active cells are valid finite real numbers. | Clearing a cell or entering malformed content cannot become \(0\) automatically; the offending cell has a local accessible error. |
| Dimension governance | Define separate maximum dimensions for traced pedagogical operations, compact computation, and visualisation. | Entering a value above the limit gives an explanatory guard, not a large allocation or stalled render. |
| Capability declaration | State real-field scope, matrix-size scope, precision policy, complex-eigen status, and unsupported cases in the UI. | Every operation exposes a concise “supported scope” statement before calculation. |
| State isolation | Define whether A–E sections share matrix state or maintain operation-specific workspaces. | Section switching never causes an unexplained mathematical state change. |

> **Release decision:** Do not advertise the tool as a general solver until this phase is complete. It may remain available as an explicitly limited learning preview.

## Phase 1 — Mathematical Core Correctness

**Objective:** Make the highest-risk algorithms truthful and complete for the declared supported scope.

### Phase 1A — Systems and RREF

| Requirement | Implementation intent | Acceptance criterion |
|---|---|---|
| Multiple RHS support | Represent \(B\) as a full matrix throughout classification, solution extraction, and trace rendering. | \(AX=B\) returns a solution matrix \(X\), or a per-column classification, for every RHS column. |
| Correct classification | Distinguish unique, infinitely many, and inconsistent systems. | The UI presents rank\((A)\), rank\(([A\mid B])\), free-variable count, and a parameterised solution where applicable. |
| Stable rank policy | Use a scale-aware tolerance derived from matrix norm/dimensions rather than only an absolute fixed EPS. | Equivalent rescaling does not unpredictably flip rank classifications within documented tolerance. |
| Verified solve | Compute and display \(\|AX-B\|\) for each solved RHS column. | A result is flagged as approximate or rejected when its residual breaches the declared threshold. |

### Phase 1B — Eigen Analysis

| Requirement | Implementation intent | Acceptance criterion |
|---|---|---|
| Scope split | Provide a certified pedagogical \(2\times2\) real mode and a clearly labelled advanced numerical mode. | Complex pair, repeated eigenvalue, defective matrix, and non-convergent case each have a defined outcome. |
| General algorithm | Use a stable Schur/eigensolver path or retain a strict limited-scope mode until one is available. | No fixed iteration count may be displayed as a converged answer without a convergence test. |
| Eigenpair certification | Calculate \(\|Av-\lambda v\|\) and report algebraic/geometric multiplicity where relevant. | A fallback vector cannot be shown as an eigenvector unless its residual is within tolerance. |
| Complex pedagogy | Display \(a\pm bi\) as supported values or explicitly direct the learner to the real-only boundary. | Larger real matrices with complex spectrum never yield fictitious real eigenvalues. |

**Phase 1 release gate:** Systems and Eigen Analysis pass a deterministic benchmark pack covering unique/infinite/inconsistent multi-RHS cases; pivoted and ill-scaled cases; repeated/defective/complex/non-normal eigen cases; and residual certificates.

## Phase 2 — Numerical Integrity and Trace Certification

**Objective:** Turn each calculated result into an auditable learning artifact rather than an unqualified output.

| Scope | Work package | Acceptance criterion |
|---|---|---|
| Tolerance policy | Centralise relative/absolute tolerances and expose a suitable precision mode. | A consistent policy is applied to pivots, rank, zero cleanup, determinant singularity, null space, and residual statements. |
| Determinants | Correct pivoted LU narrative from \(A=LU\) to \(PA=LU\), preserve determinant sign, and add condition/scaling caution. | Any row-swap trace renders the correct permutation relation and determinant factor. |
| RREF proof | Show pivot columns, pivot/free variables, rank, nullity, and row-operation effects. | Learners can reconstruct the classification from the displayed trace. |
| Null and column spaces | Deliver both promised concepts: a basis for \(\mathrm{Nul}(A)\), a basis for \(\mathrm{Col}(A)\), rank/nullity relation, and correct labels. | The section no longer labels an RREF of \(A\) as \(A\mid B\). |
| Exact versus approximate mode | Preserve rational/simple symbolic output where feasible; otherwise label rounded values and precision. | The result board clearly states whether a result is exact, rounded, or numerical approximation. |

## Phase 3 — Pedagogical Trace Reconstruction

**Objective:** Make the mathematical trace operation-specific, complete enough to teach from, and consistent with the numerical engine.

| Current weakness | Remediation | Acceptance criterion |
|---|---|---|
| Repeated generic “Why this step?” text | Generate explanation text from operation metadata, pivot choice, free variables, determinant expansion, or convergence state. | Each expanded step explains the actual event, not a generic section slogan. |
| Incomplete cofactor/QR story | Add depth controls: concise trace, standard trace, proof trace. | A learner can expand from the summary to sufficient intermediate evidence without being forced through every detail. |
| Ambiguous errors | Map mathematical exceptions to local input, equation, or algorithm status. | An error identifies what is invalid, why, and the immediate corrective action. |
| Hidden numerical limitations | Place residual/convergence/rank data near the result and in exportable trace data. | Every non-exact final result has visible numerical provenance. |

## Phase 4 — Operation-Specific Visual Learning Layer

**Objective:** Ensure Zone C explains the active operation rather than always showing a generic vector plot.

| Operation | Required visual | Acceptance criterion |
|---|---|---|
| Determinant | Unit square/cube before/after \(A\), signed orientation, area/volume scale. | Visual value and \(\det(A)\) agree for supported 2D/3D cases. |
| Systems/RREF | Augmented-plane or hyperplane/intersection view for supported dimensions; row-operation status map. | Unique/infinite/inconsistent classifications have visually distinct representations. |
| Null & Column Spaces | Kernel direction/plane and column-space span with pivot-column basis. | The plotted objects correspond to computed bases, not a generic \(Av\). |
| Transformations | Input basis, transformed basis, image of a grid/unit square, and all selected RHS vectors. | A multi-column \(B\) is represented as multiple vectors or explicitly summarised. |
| Eigen Analysis | \(v\) and \(Av\) overlay, eigenvalue scale annotation, complex-mode boundary. | The visual does not normalise away the claimed eigen relationship without explaining the scaling. |

## Phase 5 — MAE UI/UX, Responsive, Accessibility, and Localisation Completion

**Objective:** Bring the simulator to the interaction and visual standard of the platform’s mature studios.

| Work package | Acceptance criterion |
|---|---|
| Workspace hierarchy | Establish a stable Zone A input rail, Zone B academic board, and Zone C visual field with position and naming that agree. |
| Tab navigation | On mobile, all five sections are discoverable through horizontal scroll indicators, overflow menu, or compact segmented control. |
| Precision control | User can choose exact, fixed decimals, or scientific notation; the active precision is shown near results. |
| Canvas accessibility | Supply text alternatives for vectors/bases, keyboard rotation/reset for 3D, and a reduced-motion mode. |
| Accordion semantics | Use explicit `aria-expanded`, keyboard navigation, focus restoration, and announced calculation/error changes. |
| Localisation | Translate generated step titles, errors, canvas badges, and mathematical prose for Arabic, English, and Spanish. |
| Feedback and affordances | Add calculation status, autoscale/reset-view controls, visible input errors, and operation-specific help. |

## Phase 6 — Advanced Capability Expansion

**Objective:** Add breadth only after the verified core is stable.

| Candidate capability | Prerequisite | Validation requirement |
|---|---|---|
| SVD, least squares, pseudoinverse | Certified numerical core | Orthogonality, reconstruction, and residual checks |
| Complex vector spaces | Complex-aware eigen and rendering model | Real/imaginary display and conjugate-pair tests |
| Symbolic/rational arithmetic | Exact-mode contract | Equivalence between symbolic and numerical evaluations |
| Save/share/export workbook | Stable state schema and trace provenance | Deterministic reload and versioned compatibility tests |
| Instructor scenarios | Capability contract and localisation | Curated benchmark sets with expected traces |

## Governance, Test Strategy, and Release Gates

| Gate | Mandatory evidence | Owner decision |
|---|---|---|
| Mathematical gate | Deterministic algorithm test suite, residual/convergence summaries, edge-case matrix pack | Engineering + subject-matter review |
| Pedagogical gate | Trace-to-result consistency check, terminology review, examples for each classification | Electrical/linear algebra faculty review |
| UX gate | Desktop/mobile screenshots, keyboard journey, screen-reader smoke test, Arabic/Spanish review | Design + accessibility review |
| Performance gate | Maximum supported dimensions tested on target devices with trace size limits | Frontend performance review |
| Release gate | All P0/P1 findings resolved or explicitly documented as unsupported in UI | Product owner sign-off |

## Suggested Delivery Sequence

| Release | Included phases | User-facing promise |
|---|---|---|
| R1 — Safe Foundations | 0 + Systems/RREF portion of 1 | “Validated real-matrix systems and RREF learning workspace.” |
| R2 — Certified Spectral Core | Eigen portion of 1 + Phase 2 | “Certified eigen and numerical diagnostics within stated scope.” |
| R3 — Teaching-Grade Studio | Phase 3 + Phase 4 | “Operation-specific proofs and visual learning models.” |
| R4 — Accessible MAE Experience | Phase 5 | “Responsive, localised, accessible academic workspace.” |
| R5 — Advanced Linear Algebra | Phase 6 | “Expanded advanced methods built on certified foundations.” |

## Immediate Next Decision

Begin with **Phase 0 plus Phase 1A (Systems & RREF)**. This combination removes the most consequential source of false answers—invalid/coerced inputs and incomplete multi-RHS classification—while creating the numerical contracts required by every subsequent visual or academic feature. Eigen Analysis should remain visibly scoped to verified \(2\times2\) real examples until Phase 1B is accepted.

