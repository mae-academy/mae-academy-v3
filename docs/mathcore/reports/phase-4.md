# Phase 4 report: 2D linear algebra (2026-10-30)

Built on `automation/setup` under the owner's instruction of 2026-10-30. Numbers were measured on the cloud machine.

## Deliverables (STEPS.md §11, Phase 4; §8.2)

| Deliverable | Where | Evidence |
|---|---|---|
| Matrix2 | `infer/inferType.ts`, `engine/graphEngine.ts` (named matrices, sliders in entries) | `inferType.test.ts`, `graphEngine.test.ts` |
| Grid transform | `linalg/transform2.ts`, `render/renderer.ts` | î → first column, ĵ → second; both grid families parallel, evenly spaced, and covering any view (contraction, zoom out, far from the origin); unit square's image shaded blue (orientation kept) or red (reversed) |
| Determinant | `linalg/matrix.ts` | Gaussian elimination in exact rational arithmetic: on the typed decimals, else on the exact values of the doubles. "Singular matrix" shown when \|det\| ≤ 10⁻¹² of the Hadamard bound (scale-free) |
| 2×2 eigenvalues | `linalg/matrix.ts` `eigen2`, `linalg/analyze.ts` | closed form with reduced surds `(5 ± √33)/2`, complex `(3 ± i√47)/4`; repeated: double eigen-line; scalar: radial lines; complex: rotation arc with θ and a note on the rotation-scaling form |
| Annotated Gauss-Jordan | `linalg/gaussJordan.ts`, `ui/LinalgPanel.tsx` | each Rᵢ ← Rᵢ − kRⱼ, Rᵢ ↔ Rⱼ, Rᵢ ← kRᵢ in LaTeX with the pivot boxed; inverse on [A \| I]; systems on [A \| b] |
| GaussSystem (§6.1) | `inferType.ts`, `graphEngine.ts`, worker | `A x = b`, `b = A x`, named `M x = b`, `cases`; lines drawn and the solution labelled when the unknowns are x and y |

## Exit criterion: determinant and eigenvalues within 10⁻⁹

Against the 50-digit mpmath reference (`__golden__/algorithms.json`, 133 matrices, 2×2 and 3×3):

| Quantity | Measure | Result |
|---|---|---|
| Determinant | plain relative error, every matrix (nearly singular ones included) | ≤ 10⁻⁹ (exact arithmetic on the stored doubles) |
| 2×2 eigenvalues | relative error of each eigenvalue, against itself | ≤ 10⁻⁹ (the small root is det / λ₁ with the exact determinant) |
| 3×3 eigenvalues (QR) | error relative to the largest \|λ\| (normwise; a tiny eigenvalue of an ill-conditioned 3×3 cannot be resolved better in double arithmetic) | ≤ 10⁻⁹ |

The same checks run through the report layer (`analyze.test.ts`), and the closed-form LaTeX is re-evaluated numerically
and compared with the eigenvalues on 2000 random integer matrices.

## Review rounds

First review of the Phase 4 code (snapshot 7ec1db3) and fixes:

| Finding | Fix |
|---|---|
| A slider moving an item into an error left it stuck | evaluation errors are cleared before the next evaluation |
| A system kept using a stale named matrix | the matrix is dropped before it is evaluated; "the matrix M has an error" |
| Inverse of tiny or badly scaled matrices wrong; wrong solutions of badly scaled systems | floating-point elimination treats a difference as zero only when it is cancellation noise of its own operands; no global scale |
| Linearity check accepted \|y − 1\|, missed large constants | structural degree check (`infer/linear.ts`); coefficients from a step ≥ \|constant\| |
| Unknowns not in x, y order drawn on the wrong axes | lines only for {x, y}, columns permuted to the axes (3D: {x, y, z}) |
| Eigenvalue values could be empty or disagree with their kind | the exact path computes the numbers from the same closed form; numeric directions passed to the canvas |
| Overflow (10²⁰⁰ entries) labelled singular with λ = 0 | power-of-two scaling in `eigen2`; scale-free singular test |
| Grid and eigen-lines did not cover the view | grid families from the view corners mapped back by A⁻¹, eigen-lines clipped to the view |
| Repeated, scalar and complex cases not explicit on the canvas | double line, radial lines, rotation arc |
| Rotation note wrong for non-normal matrices | worded for the real eigenvector basis |
| Multi-letter names broke KaTeX; JS exponents in step LaTeX | `\mathrm{…}` names, `× 10ⁿ` numbers |
| `b = A x` rejected; rejected lines created sliders; MathJSON names in messages; unknowns shadowing sliders | all handled (`graphEngine.test.ts`) |
| No precision warning beyond 10⁸ | matrix and system rows show it |
| A failed panel chunk could take the page down | error boundary in the row |

## Known limits

- Two-column `cases` (value & condition) parses as a piecewise expression and is not a system.
- Engine and inference error messages are English only (as in earlier phases).
- Exact eigenvectors are shown for rational eigenvalues; irrational ones as unit vectors with 6 digits.
