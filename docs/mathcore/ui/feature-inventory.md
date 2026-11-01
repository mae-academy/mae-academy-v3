# Math Core — feature inventory (state at `03d956b`, before any UI change)

Source of truth: `client/src/features/mathcore/ui/*.tsx`, `workers/*`, `shared/mathcore/*`, `tests/mathcore/e2e/mathcore.spec.ts`.
Every feature has one id, one place, and exactly one category (Part B). A feature that touches two categories is listed
once, with a *see also*. Ids are stable: tests and the report refer to them.

Categories: **GR** Graphing · **CA** Calculus · **AL** Algebra · **LS** Linear systems · **LA** Linear algebra · **OT** Other (shell, not a mathematical category).

## Graphing (GR)

| Id | Feature | Where | Notes |
|---|---|---|---|
| GR1 | Explicit curves `y=f(x)` and `x=g(y)`; bare `f(x)` expression | `infer/inferType.ts` Explicit; `sample/adaptive.ts` | Adaptive sampling, discontinuities handled. |
| GR2 | Implicit curves `F(x,y)=0` | `implicit/marching.ts` | Marching squares, parallel strip Workers. |
| GR3 | Inequalities `<`, `≤`, `>`, `≥` (shaded region; dashed boundary when strict) | `implicit/*`, `renderer.ts` | Includes restrictions `{a<x<b}`. |
| GR4 | Parametric curves `(f(t), g(t))`, parameter `t` | `inferType.ts` Parametric | |
| GR5 | Polar curves `r=f(θ)` | `inferType.ts` Polar | |
| GR6 | Points `(a, b)`; a point whose coordinates are single parameters is draggable | `inferType.ts` Point; `GraphCanvas.tsx` drag | See also OT (sliders). |
| GR7 | Function definitions `f(x)=…` and use of `f(x)` / `f(g(x))` in later lines | `inferType.ts` FunctionDef; `compile/` | Used by GR1–GR5 and CA. |
| GR8 | Hover trace of an explicit curve: point, tangent line, slope triangle, slope read-out | `GraphCanvas.tsx`, worker `trace`, `MathcorePage.tsx` `.mc-trace` | **Bug E1: depends on zoom.** See also CA (tangent). |
| GR9 | Per-item style: color token, width, dash, hidden (IR `style`) | `ir/types.ts` `ItemStyle`, `renderer.ts` | No UI control before Part C. |
| GR10 | Swatch showing the curve's color (palette of 5 tokens by position) | `ExpressionRow.tsx` `.mc-swatch` | Not clickable before Part C. |
| GR11 | Text description of every graph item (zeros, extrema, extent, shaded fraction) | `describe/`, `describeText.ts`, `<details>` "Text description" | Zeros are the only root finding that exists: see AL. |
| GR12 | Items of later phases show a note: ODE (Phase 6), Riemann sum (9), distributions (10) | `ExpressionRow.tsx` `LATER_PHASE` | Not implemented; message only. |

## Calculus (CA)

| Id | Feature | Where | Notes |
|---|---|---|---|
| CA1 | Derivative as a curve: `f'(x)`, `\frac{d}{dx}f(x)`, `\frac{d}{dx}(expr)` (central difference, symbolic-free) | `normalize` Prime/D, `calculus/derivative.ts` | Plots f′. `y=f'(x)` is rejected ("write the derivative on the left"). |
| CA2 | Integrals inside an expression: `a=\int_0^1 f(x)dx` evaluates (Simpson + tanh-sinh with endpoint tails) | `calculus/integrate.ts`, `compile/compile.ts:404` | A bare `\int_a^b f(x)dx` line is kind RiemannSum → "drawn from Phase 9", no value shown. |
| CA3 | Sums and products `\sum`, `\prod` inside expressions | `compile/compile.ts` | |
| CA4 | Indefinite integral | — | Error: "Only definite integrals with both limits are supported". |

## Algebra (AL)

| Id | Feature | Where | Notes |
|---|---|---|---|
| AL1 | Zeros of a curve listed in its text description ("crosses zero at x = …") | `describe/describe.ts` | The only equation solving that exists. See also GR11. |
| AL2 | `solve`, `simplify`, `factor` | — | **Do not exist.** Typing them creates sliders named `solve` / `factor` (misleading; reported in Part D). |

## Linear systems (LS)

| Id | Feature | Where | Notes |
|---|---|---|---|
| LS1 | 2×2 and 3×3 systems as `\begin{cases}` equations or two/three separate equations of x, y(, z) | `inferType.ts` GaussSystem, `infer/linear.ts` | |
| LS2 | `A x = b` with a matrix literal or a named matrix | `inferType.ts` | |
| LS3 | Gauss-Jordan steps with the pivot boxed ("Show steps") | `linalg/gaussJordan.ts`, `LinalgPanel.tsx` | |
| LS4 | Solution report: unique / none (rank) / infinite (parametric); 2×2 solution point labeled on the canvas | `linalg/analyze.ts`, `MathcorePage.tsx` | |
| LS5 | 3D planes of a 3×3 system and where they meet | `render3d/scene.ts` | See also OT (3D view). |

## Linear algebra (LA)

| Id | Feature | Where | Notes |
|---|---|---|---|
| LA1 | Named matrix `A=\begin{bmatrix}…\end{bmatrix}`, 2×2 and 3×3, entries may be sliders | `inferType.ts` Matrix2/3 | |
| LA2 | Determinant (exact, with working) and orientation badge | `analyze.ts`, `LinalgPanel.tsx` | |
| LA3 | Trace, characteristic polynomial | `LinalgPanel.tsx` | |
| LA4 | Eigenvalues (closed form 2×2; QR 3×3), complex pair → rotation + scale | `eigenCases.ts`, `qr.ts`, `exactRoots.ts` | |
| LA5 | Eigen-directions | `LinalgPanel.tsx`, `transform2.ts` | |
| LA6 | Inverse with Gauss-Jordan steps, or "no inverse" with rank | `analyze.ts` | See also LS3. |
| LA7 | 2×2 canvas view: transformed grid, `A·î`, `A·ĵ`, image of the unit square, eigen-lines | `transform2.ts`, `renderer.ts` | |
| LA8 | 3×3 canvas view: image of the unit cube (3D view) | `render3d/` | See also OT (3D view). |
| LA9 | `\det(A)`, `A^T`, `A^{-1}` as expressions | — | **Do not exist as expressions** ("Unsupported operation"); the values are inside the LA2/LA6 report. |
| LA10 | n×n for n > 3 | — | Error: "only 2×2 and 3×3 matrices are supported in v1". |

## Other (OT) — shell features without a mathematical category

| Id | Feature | Where |
|---|---|---|
| OT1 | Expression list: one MathLive field per line (plain LaTeX text field fallback), error text under the line, line value `= v` | `ExpressionRow.tsx` |
| OT2 | Add row button; Enter inside a field inserts a row below | `MathcorePage.tsx`, `ExpressionRow.tsx` |
| OT3 | Remove row (×) | `ExpressionRow.tsx` |
| OT4 | Automatic sliders for undefined letters and `name = number` lines; min, max, step; keyboard control; animate (play/pause); drag-point snapping | `SliderRow.tsx`, `graphEngine.ts` |
| OT5 | Pan (drag, arrow keys), zoom (wheel, `+` `=` `-`) on the canvas; the canvas is focusable (Tab) | `GraphCanvas.tsx` |
| OT6 | Reset view | toolbar |
| OT7 | 3D view toggle; orbit by drag or arrow keys; zoom by wheel or `+` `-` | toolbar, `GraphCanvas.tsx`, `render3d/` |
| OT8 | "Show steps" checkbox (Gauss-Jordan steps start open) | toolbar |
| OT9 | Share link (`?g=` carries the full Graph IR; copy to clipboard; "too large" notice; corrupt link notice) | `MathcorePage.tsx`, `ir/codec.ts` |
| OT10 | Export PNG, SVG (with title and description), JSON; import JSON | toolbar, `export/svg.ts` |
| OT11 | Language ar / en / es (global locale); Arabic switches the shell to RTL with LTR canvas and math | `i18n/*.json`, `MathcorePage.tsx` |
| OT12 | Light and dark theme (global); the canvas repaints on theme change | `MathcorePage.tsx` MutationObserver |
| OT13 | Engine status: loading note, restart notice after the 5 s watchdog, "N item evaluations; last update re-evaluated M" | `MathcorePage.tsx`, `engineClient.ts` |
| OT14 | Benchmarks panel | `<details>` "Benchmarks on this device" |
| OT15 | Theory section (`SimulationDocumentation topic="mathcore"`) | `MathcorePage.tsx` |
| OT16 | Route `/mathcore`, card on Practical Simulations, zero bytes of mathcore code on other routes | `App.tsx`, e2e |
| OT17 | Parse errors shown at their line, in the reader's language, with the offending text | `errorText.ts`, `ExpressionRow.tsx` |

## Keyboard map as it was

| Where | Keys |
|---|---|
| Expression field | `Enter` adds a row below. No other shortcut. `Escape`, `?`, arrow movement between rows did not exist. |
| Canvas (2D) | Arrows pan 10 %; `+`/`=` zoom in; `-` zoom out. |
| Canvas (3D) | Arrows orbit; `+`/`=`, `-` move the camera. |
| Slider | Native range input: arrows, Home/End, PageUp/PageDown. |

## Counts

- Features: **GR 12 · CA 4 · AL 2 · LS 5 · LA 10 · OT 17 = 50.**
- Of these, "does not exist" entries (kept so the UI can say so): CA4, AL2, LA9, LA10, GR12.
- Features without a category before the OT group was introduced: **the 17 OT shell features.** Nothing else is uncategorised.
- Suspected defects found while inventorying: GR8 (zoom), CA2 (bare integral gives no value), CA1 (`y=f'(x)` rejected), AL2 (solve/factor become sliders), `.mc-error` and `.mc-badge` text colours fail WCAG AA on the dark theme (4.47 : 1 and 4.06 : 1 against black).
