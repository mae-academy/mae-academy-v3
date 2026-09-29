# Linear Algebra Simulator — Comprehensive Diagnostic Audit

**Scope:** Matrix Basics & Determinants, Systems & RREF, Null & Column Spaces, Transformations, and Eigen Analysis. This was a **read-only** audit of the current implementation and rendered desktop/mobile routes. No simulator logic or styling was modified.

## Executive Assessment

The simulator has a coherent educational shell and a clear five-section structure, but its current numerical engine is **not yet safe to represent as a general-purpose linear-algebra simulator**. The most serious risks are multi-right-hand-side systems reported as if they were fully solved, an eigenvalue pipeline with no convergence or residual certification, a single absolute numerical tolerance applied to all scales, and unbounded dimensions that can freeze the browser. The interface is visually related to the MAE dark theme, but its interaction model and pedagogical feedback are weaker than the platform’s more mature engineering studios.

| Severity | Count | Main areas |
|---|---:|---|
| Critical | 4 | Multiple-RHS systems, large/non-normal eigenproblems, unbounded dimensions, silent input coercion |
| High | 9 | RREF classifications, determinant derivation, numerical tolerance, visual semantics, mobile navigation, accessibility |
| Medium | 12 | Trace completeness, localisation, result precision, state persistence, interaction feedback |
| Low | 7 | Naming consistency, spacing rhythm, legend wording, minor visual polish |

## Audit Evidence and Scope

The review covered `LinearAlgebraStudio.tsx`, `LinearAlgebraCanvas.tsx`, and `linearAlgebraMath.ts`, plus all five live sections at desktop width and the determinant, RREF, and eigen routes at a 375 px mobile viewport. The current simulator accepts editable real-valued matrices and uses custom TypeScript routines for multiplication, Gauss–Jordan reduction, determinants, null spaces, QR-based eigenvalue approximation, and canvas visualisation.

> **Audit boundary:** The findings below distinguish between a demonstrable implementation defect, an unsupported mathematical case, and a pedagogical/UI weakness. Unsupported cases are not automatically bugs; they become high risk when the UI presents their output as a general validated answer.

## Critical Findings

| ID | Finding | Evidence | Consequence | Recommended correction direction |
|---|---|---|---|---|
| LA-C01 | **Multiple RHS systems are not solved or classified correctly.** | `B columns` is editable, and RREF forms `[A\mid B]`; however `solution` takes only `row[A[0].length]`, while inconsistency checks only the first RHS column. | For \(AX=B\) with \(B\in\mathbb R^{m\times k}\), \(k>1\), the simulator can display one column as “the solution” while silently ignoring other columns, including an inconsistent one. | Treat every RHS column independently, return an \(n\times k\) solution matrix, and classify each column as unique / infinite / inconsistent. |
| LA-C02 | **The \(n\ge3\) eigenvalue path has no convergence certificate.** | A fixed 72-step unshifted QR iteration returns the diagonal of \(A_{72}\); no off-diagonal norm, eigenpair residual, Schur form, or iteration status is computed. | General real matrices, especially non-normal or clustered-spectrum matrices, may show inaccurate values as finished eigenvalues. | Use a certified real-Schur/eigensolver or expose “approximation” with convergence and \(\|Av-\lambda v\|\) certificates; support complex-conjugate pairs explicitly. |
| LA-C03 | **Matrix dimensions are effectively unbounded.** | Row/column inputs have `min=1` but no maximum; resize constructs every cell and determinant/LU/QR/trace rendering runs immediately on each edit. | A large entered value can allocate a massive DOM matrix, freeze the browser, or produce unusable traces. | Impose operation-specific dimensions, e.g. a small pedagogical cap for full row-operation traces, with a separate computational mode for larger matrices. |
| LA-C04 | **Invalid numeric input is silently changed into a mathematical zero.** | Matrix cell update is `Number(value) || 0`; invalid text/empty values become \(0\), and non-finite values are not rejected before analysis. | A student can unknowingly alter rank, determinant, solvability, nullity, and eigenvalues. This is particularly harmful in a learning environment. | Preserve draft text, validate on commit, mark invalid cells, and block calculation until all entries are finite real values. |

## High-Severity Mathematical and Numerical Findings

| ID | Problem | Diagnosis | Why it matters |
|---|---|---|---|
| LA-H01 | **A universal absolute tolerance \(10^{-9}\) is used for every matrix.** | Pivot acceptance, zero cleanup, singularity, and formatting all rely on one global `EPS`. | Rank is scale-dependent; a matrix scaled by \(10^{-12}\) can be falsely classified singular while one scaled by \(10^{12}\) can suffer cancellation without an appropriate relative threshold. |
| LA-H02 | **No numerical certificate accompanies RREF, solves, null spaces, determinants, or eigenpairs.** | The engine displays answers but does not calculate residuals such as \(\|Ax-b\|\), \(\|A-\mathrm{RREF}^{-1}\|\), \(\|Av-\lambda v\|\), or rank pivots/condition warnings. | The user cannot distinguish an exact pedagogical answer from a floating-point approximation or a numerically questionable result. |
| LA-H03 | **The solve screen merges “infinite solutions” and “inconsistent system” into one generic result.** | If no unique solution exists, the final trace is `No unique solution`; only first-RHS inconsistency is checked. | These cases carry different mathematical meaning and must be taught differently. |
| LA-H04 | **The determinant trace says \(A=LU\) even when pivoting occurred.** | LU factorisation swaps rows and changes `sign`, yet the displayed statement remains \(A=LU\). | With partial pivoting the correct relation is \(PA=LU\); the trace is formally false when a swap occurs. |
| LA-H05 | **Eigenvectors for repeated/defective eigenvalues can be invented by fallback.** | When null-space extraction has insufficient basis vectors, the code falls back to \([1,0,\ldots]^T\). | This can present a vector as an eigenvector even when it does not satisfy \((A-\lambda I)v=0\). |
| LA-H06 | **Complex eigenpairs are rejected only in the \(2\times2\) analytic path; larger matrices can still produce misleading real diagonals.** | The 2D discriminant has a complex guard, whereas the QR branch merely reads real diagonal values. | The capability boundary is inconsistent and can produce incorrect pedagogical claims for rotations and other matrices with complex spectra. |
| LA-H07 | **Null-space and solve traces round intermediate entries to four decimals without an exact/rational mode.** | `formatNumber` uses `toFixed(4)` for all displayed steps. | Rounding can make the visible row operations appear non-equivalent and hide near-singularity. |
| LA-H08 | **The null-space result card is mislabeled as \(\operatorname{rref}(A\mid B)\).** | The Null operation computes RREF of \(A\) but generic result selection labels any `rref` result as augmented \(A\mid B\). | The presentation conflicts with the actual computation and confuses the meaning of the null-space workflow. |
| LA-H09 | **Educational derivations are incomplete for the chosen matrix size.** | Cofactor details are only emitted at top recursion depth; QR shows a symbolic update but no numerical convergence path; RREF trace does not expose rank/free variables. | The UI calls itself a “Mathematical Trace,” but several core conclusions lack enough evidence for students to verify them. |

## Operation-by-Operation Review

| Section | Current strengths | Logic gaps and failure cases |
|---|---|---|
| Matrix Basics & Determinants | Square-matrix guard exists; \(2\times2\) and \(3\times3\) examples are easy to read. | No condition/scaling warning; LU proof is wrong after pivoting; large matrices have no size guard; geometry shows a generic vector rather than signed area/volume scaling. |
| Systems & RREF | Uses partial pivot selection and produces visible elementary row-operation steps. | Multiple RHS failure; no separate inconsistent/infinite classification; no parametric family; no rank/nullity summary; absolute tolerance can misclassify pivots. |
| Null & Column Spaces | Generates a null basis from RREF free columns. | Section title promises **Column Spaces**, but no column-space basis, rank, pivot columns, or image basis is reported. Result card labels a non-augmented computation as \(A\mid B\). |
| Transformations | Correctly checks multiplication dimensions and computes \(AB\). | Canvas displays only the first RHS column; a multi-vector transformation is mathematically computed but visually/verbally represented as one vector. No basis grid, unit-square deformation, determinant/orientation, or kernel/image explanation. |
| Eigen Analysis | \(2\times2\) real-eigenvalue formula is suitable for simple demonstrations. | No robust general eigensolver; no complex support; no residuals; repeated/defective cases unsafe; eigenvector fallback can be false; the visual normalises/scales arrows and can hide the actual relation \(Av=\lambda v\). |

## Visual and UI/UX Findings

### Layout, Hierarchy, and MAE Consistency

The dark palette, gradient active-tab treatment, compact labels, and rounded panels relate to the present MAE visual language. However, the Linear Algebra Studio does not feel as structurally mature as the advanced Circuit Lab or the Control/Power Electronics workspaces.

| ID | Finding | Evidence from live audit | Impact |
|---|---|---|---|
| LA-U01 | **Zone naming and physical layout conflict.** | “Zone C · live geometry” is placed under Zone A in the left column, while “Zone B” is the large derivation board. | The names imply a canonical three-zone lab but the order is not spatially intuitive; it weakens transferable MAE workspace conventions. |
| LA-U02 | **The hero/title consumes disproportionate vertical space.** | At desktop the title and tab rail appear well above the working surface. | Students reach the actual matrix/trace later than necessary; the page feels more like a marketing page than a continuous lab. |
| LA-U03 | **Mobile section tabs visibly truncate with no clear affordance.** | At 375 px only early tabs are fully visible; later labels are clipped rather than clearly scrollable or condensed. | Users may not discover Transformations or Eigen Analysis. |
| LA-U04 | **The canvas is visually strong but semantically detached from the active operation.** | Determinant and null-space screens still show a generic \(v\)/\(Av\) vector field; determinant does not display oriented area, and null space does not show the relevant kernel geometry. | The visual can reinforce the wrong concept rather than the current concept. |
| LA-U05 | **Trace cards are dense and repetitive.** | Every RREF operation uses the same generic “Why this step?” explanation. | The interface adds visual length without adding operation-specific learning value. |
| LA-U06 | **No precision or exactness control is exposed.** | Results consistently display short decimals such as \(0.3333\). | The user cannot choose fractions, exact integers, scientific notation, or numerical precision appropriate to the task. |
| LA-U07 | **Error feedback has weak locality.** | A failed analysis replaces the derivation board with one message rather than identifying the invalid matrix cell, dimension relationship, or unsupported case. | The correction path is unclear, especially on mobile. |
| LA-U08 | **Input behavior lacks safe draft/commit feedback.** | Invalid/empty cell text is immediately coerced to a numerical state. | Users receive neither an invalid-state visual nor an explanation of why a calculation changed. |

### Accessibility and Interaction Findings

| ID | Finding | Consequence |
|---|---|---|
| LA-A01 | **Canvas content has no semantic alternative.** | Vectors, axes, eigen arrows, null directions, and labels are drawn to `<canvas>` and are not exposed to assistive technologies. |
| LA-A02 | **3D rotation is pointer-only.** | No keyboard alternative, reset-view control, or described orientation is available. |
| LA-A03 | **Accordion controls lack explicit `aria-expanded` state.** | Screen-reader users do not receive the open/closed state of derivation cards. |
| LA-A04 | **Text inside canvas is not localised.** | Canvas labels and its “DRAG TO ROTATE” badge remain English even when locale is Arabic or Spanish. |
| LA-A05 | **Mathematical step titles and engine errors are predominantly English.** | The surrounding UI is translated, but generated `MathStep` content is not. |
| LA-A06 | **Colour has a high instructional role without sufficient redundant encoding.** | The legend names colours, but vectors in the plot rely heavily on colour and small text near arrowheads. |

## Responsive and Performance Risks

The desktop render is orderly for the default \(2\times2\) examples. On mobile, the content stacks cleanly enough to remain readable, but the tab rail truncation is a substantial discoverability issue. Large matrices expose a more serious performance issue: every cell update immediately recomputes the entire analysis and trace, while every RREF operation stores a full matrix snapshot rendered through KaTeX. This can cause an abrupt growth in both CPU work and DOM/KaTeX cost.

| Risk | Trigger | Expected result |
|---|---|---|
| Dimension explosion | Large row/column value | Large state allocation, expensive matrix inputs, slow/frozen browser |
| Trace explosion | Dense RREF or LU on a large matrix | Many full matrix snapshots and costly KaTeX layout |
| Eigen approximation failure | Non-normal, clustered, complex, or defective matrix | Unsupported/incorrect result without certificate |
| Visual clipping | Vectors outside fixed \([-4,4]\) grid | Arrowheads or labels fall outside the meaningful visual region |
| State ambiguity | Switching A–E sections after editing | Shared A/B state persists across different mathematical tasks, potentially surprising the learner |

## Missing Validation Coverage

No dedicated Linear Algebra test suite was located alongside `linearAlgebraMath.ts`. The following cases should be treated as minimum regression coverage before positioning the studio as a reliable academic simulator.

| Test family | Required examples |
|---|---|
| Matrix validation | Empty draft, non-finite entry, huge magnitude, tiny magnitude, maximum allowed dimensions |
| Systems | Unique, infinite, inconsistent, rank-deficient, overdetermined, underdetermined, and multiple-RHS with mixed consistency |
| Determinants | Pivoting case, singular case, ill-conditioned case, sign after row swap, LU factorisation identity \(PA=LU\) |
| Null/column spaces | Full rank, zero matrix, rank-deficient matrix, column-space basis, nullity/rank theorem check |
| Eigen | Symmetric real, repeated eigenvalue, defective Jordan block, complex pair, non-normal real matrix, residual certificate thresholds |
| Visualization | Auto-scale, 2D/3D projection, long-vector labels, keyboard navigation, reduced motion, Arabic/Spanish text |

## Recommended Remediation Order

The first release should not be a cosmetic pass. The priority is to establish an explicit **capability contract**: supported dimensions, real/complex scope, exact versus approximate mode, error classification, and numerical certificates. Systems & RREF and Eigen Analysis need this before any visual refinement.

| Priority | Work package | Exit criterion |
|---|---|---|
| P0 | Input validation and dimension limits | No invalid numeric coercion; explicit finite-number validation; safe operation-specific caps |
| P0 | Systems and multiple-RHS rewrite | Full RHS matrix support; precise unique/infinite/inconsistent classifications; rank/nullity and residuals |
| P0 | Eigen capability boundary | Certified solver or declared restricted scope; complex/defective/non-convergent states handled honestly |
| P1 | Numerical diagnostics | Relative tolerance policy, residuals, pivot/rank metadata, condition warnings where applicable |
| P1 | Correct academic traces | \(PA=LU\) with pivoting, actual RREF labels, source derivation, symbolic/exact option |
| P1 | Operation-specific visuals | Determinant area/volume, RREF row-operation map, null/column-space geometry, multi-vector transform view |
| P2 | Responsive/accessibility completion | Scrollable/condensed tabs, keyboard canvas controls, semantic alternatives, localised generated text |
| P2 | MAE studio consolidation | Align zone hierarchy, reduce hero overhead, introduce a persistent lab toolbar and precision controls |

## Conclusion

The current simulator succeeds as a polished **introductory interactive explainer** for small default examples. It should not yet be described as a fully reliable analytical environment. The central risk is not a single arithmetic mistake: it is the lack of a stated computational scope, numerical certification, and operation-specific pedagogical validation. Once those foundations are addressed, the existing MAE shell, editable matrix controls, visual board, and step-by-step presentation can support a much stronger learning tool.

