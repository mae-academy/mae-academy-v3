# MAE Math Core: Execution Steps (derived from MAEngine-Plan.md v3.1)

Source of truth: `MAEngine-Plan.md` (v3.1). This file is the ordered checklist the automation reads before every step. If this file and the plan disagree, stop and report; do not guess.

## 0. Standing rules (apply to every step)

- Never push to `main`. Never merge any PR. Never delete a branch unless the owner authorizes that exact branch.
- Never print, copy or log `VERCEL_AUTOMATION_BYPASS_SECRET`. Check existence and trimmed length only (required: 32).
- Push only to `origin` (mae-academy-v3), only to non-main branches.
- No schedules, SMS, or notifications unless the owner explicitly approves them.
- Do not change the existing CSP (`vercel.json`) or `safeExpr`. Those are separate tasks.
- Each mathematical change must pass the golden corpus and the fixed-seed fuzz subset before it is merged (Section 9 merge principle).
- Performance numbers in Section 6.2 are hypotheses until measured in Phase 0 on D1 reference devices.
- Any step that needs an owner decision: stop, write the question to the report, and wait.

## 1. Owner decisions (locked)

| ID | Decision | Status | Effect |
|---|---|---|---|
| D0 | Build the core (do not embed Desmos) | Approved (recommendation) | Keep Desmos API only as a fallback for explicit plotting if Phase 1 budgets fail |
| D1 | Reference devices: a mid-range laptop and a mid-range Android phone, specs recorded before measurement | **Pending owner specs** | Phase 0 measurements cannot be finalized without them |
| D2 | Complex analysis in v1 | Deferred (approved) | Phase 8 deferred entirely |
| D3 | 3D in v1 | Deferred (approved) | Phase 5 and the 3D parts of Phase 9 deferred |
| D4 | CAS location: Vercel function under `api/mathcore/` with caching | Approved (recommendation) | Pyodide stays a documented alternative, decided in Phase 11 |

## 2. Architecture rules (ADR-1 to ADR-13)

- **ADR-1:** AST is MathJSON from Compute Engine, exact version pin, loaded lazily (dynamic import) only on the mathcore route.
- **ADR-2:** Parse with `canonical: false` plus internal normalization. Verify the option at install time.
- **ADR-3:** Closure compiler. No `eval`, no `new Function`. Engine works under a stricter CSP later.
- **ADR-4:** CPU only for rendering and computation. No WebGL, WebGPU, or Three.js.
- **ADR-5:** External oracle (mpmath, SymPy) runs only offline via `scripts/mathcore/`. Results stored as golden files in `shared/mathcore/__golden__/`. No oracle at runtime.
- **ADR-6:** One complex module in `shared/mathcore/complex/`. Existing complex code migrates in Phase 8; do not duplicate.
- **ADR-7:** Canvas 2D for drawing, ImageData for fields and coloring, OffscreenCanvas inside Workers. No Plotly, no SVG for fields, no charting library.
- **ADR-8:** Backend CAS (Python SymPy) as `api/mathcore/` Vercel function with response caching. Pyodide evaluated in Phase 11, loaded on demand only.
- **ADR-9:** Graph IR is the single state source, held in one store, serialized with `lz-string`.
- **ADR-10:** Abstract `Renderer` interface; only a CPU implementation in v1.
- **ADR-11:** Heavy computation (coloring, fields, Monte Carlo, 3D) and parsing run in module Workers. Nothing heavy on the main thread.
- **ADR-12:** Route-level code splitting. Engine, Workers and Compute Engine load only on the mathcore route. No idle prefetch.
- **ADR-13:** UI strings through i18next. Math stays LTR inside an RTL shell.

## 3. Locations and reuse

- `shared/mathcore/`: headless engine. Pure TypeScript, no React or DOM imports (same rule as `shared/fluid/engine/`).
- `client/src/features/mathcore/`: UI, renderers, Worker entry points.
- `api/mathcore/`: optional CAS endpoint (Phase 11 only).
- `scripts/mathcore/`: offline oracle script that generates golden files.
- Reuse, do not rewrite:
  - `shared/fluid/engine/`: headless-engine pattern.
  - `shared/schematic/__golden__/`: golden-file pattern.
  - `client/src/features/plot/`: module-Worker pattern (`new Worker(new URL(...), { type: "module" })`).
  - `client/src/components/ai/MathInputArea.tsx` and the MathLive loader: input field.
  - `lz-string` (existing dependency): link codec. Do not add a new codec.
- Do not replace: `client/src/components/engines/safeExpr.ts` stays for model-written slider formulas.
- Do not touch in v1: `shared/signals/transferFunction` (consolidation is Phase 8).
- Stack: existing Vite + React 19 + TypeScript client, Express server, Vercel functions in `api/`, wouter, i18next, Vitest, Playwright. No Next.js, no monorepo.
- Non-goals: GeoGebra-style dynamic geometry; a full CAS replacing SymPy or Mathematica.

## 4. Desmos-parity checklist (the only definition of "Desmos-level")

Required in v1 (each item needs an acceptance test):
- **Input:** LaTeX via MathLive, multi-line expressions, comments, function definitions `f(x)`.
- **Explicit plotting:** `y=f(x)`, `x=g(y)`, polar `r=f(θ)`, parametric `(x(t), y(t))`.
- **Implicit plotting:** `F(x,y)=0` and inequalities `F<0` with region shading.
- **Sliders:** automatic for every undefined parameter, with min, max, step and animation.
- **Dependencies:** DAG, re-evaluate dependents only, cycle detection.
- **Interaction:** dragging points, tangent tracing, point-on-curve, zoom, pan.
- **State:** full Graph IR in the link (`?g=`); export to PNG, SVG, JSON.
- **Specialties:** 2×2 and 3×3 matrices, first-order ODEs, two-dimensional systems, complex domain coloring (complex deferred by D2).
- **Accessibility:** generated text descriptions of curves; keyboard control of sliders.
- **Localization:** Arabic (RTL shell, LTR math), English, Spanish via existing i18next.

Deferred (v2+): scripting; collaborative editing; 3D implicit surfaces; full interactive PDE and IE.

## 5. Graph IR (state document)

### 5.1 Structure (example)

```json
{
  "version": "1.0",
  "viewport": { "xmin": -10, "xmax": 10, "ymin": -6, "ymax": 6, "aspect": "equal" },
  "params": {
    "a": { "value": 2, "min": -5, "max": 5, "step": 0.01, "animate": { "from": -5, "to": 5, "period_s": 6, "loop": true } }
  },
  "items": [
    { "id": "f1", "latex": "y = a\\sin(x)", "kind": "Explicit", "style": { "color": "#FF0000", "width": 2 } },
    { "id": "c1", "latex": "x^2 + y^2 = 9", "kind": "Implicit", "style": { "color": "#0066FF", "fill": false } },
    { "id": "m1", "latex": "M = \\begin{bmatrix} a & 1 \\\\ 0 & 1 \\end{bmatrix}", "kind": "Matrix", "style": {} },
    { "id": "d1", "latex": "\\frac{dy}{dx} = x - y", "kind": "ODE1", "style": {} }
  ],
  "view": { "mode": "2d", "grid": true, "showSteps": false, "locale": "ar" }
}
```

### 5.2 Validation rules

- `version` must be a supported version; otherwise reject explicitly.
- `id` unique within the document, length ≤ 32.
- `items` ≤ 100; parameters ≤ 50.
- Every undefined symbol in an expression becomes a parameter automatically, with default values in `params`.
- Dependency cycles are rejected, with an error naming the items.
- `latex` ≤ 2000 characters; MathJSON tree ≤ 5000 nodes.
- `animate.period_s` between 0.5 and 60 seconds.
- Link encoding: JSON, compressed with `lz-string` (`compressToEncodedURIComponent`) into `?g=`. Limit about 8 KB encoded. If exceeded: do not truncate; show "too large to share as a link" and offer JSON export.
- MAE AI emits Graph IR only, never computed numbers. Numbers come from the engine.

## 6. Type system

### 6.1 Types

| Type | Pattern | Rendering | Path |
|---|---|---|---|
| Scalar | `Equal(name, const)` | Slider | Main thread (trivial) |
| Explicit | `Equal(y, f(x))` or `Equal(x, g(y))` | Curve | Worker, adaptive sampling |
| Polar | `Equal(r, f(θ))` | Polar curve | Worker |
| Parametric | Pair `(x(t), y(t))` | Path | Worker |
| Implicit | `F(x,y) = 0` or inequality | Sign field + Marching Squares | Worker |
| RiemannSum | `Integral(f, a, b)` with N | Rectangles and trapezoids | Worker |
| Matrix2 / Matrix3 | `Matrix(List(List...))` | 2D transform grid; 3D model via software rasterizer (Matrix3 deferred by D3) | Worker |
| GaussSystem | `A x = b` | Intersecting planes + elimination steps | Worker |
| ODE1 | `Derivative(y, x) = F(x,y)` | Direction field and trajectories | Worker, RK4/RKF45 |
| ODESystem2 | Pair `dx/dt`, `dy/dt` | Phase portrait | Worker |
| PDEHeat / PDEWave | Equation with boundary conditions | Heat map or membrane | Worker |
| IEFredholm / IEVolterra | Integral with kernel `K(x,t)` | Kernel surface + Neumann approximation | Worker |
| ComplexMap | `w = f(z)` | Domain coloring (deferred by D2) | Worker |
| ConformalGrid | `w = f(z)` on a grid | Two side-by-side grids (deferred by D2) | Worker |
| NumericIter | Roots or interpolation | Animated steps | Worker |
| Distribution | `Normal(μ,σ)` and others | Density with shading | Worker |
| MonteCarlo | Random samples | Points and live histogram | Worker |
| Surface3D | `z = f(x,y)` | Projected mesh, z-buffer (deferred by D3) | Worker |
| VectorField3D | `F(x,y,z)` | Projected arrows (deferred by D3) | Worker |

### 6.2 Inference algorithm (`inferType`)

- Pure and total: never throws; returns `Unknown` with a reason.
- Check the ODE form `Derivative(y, x) = F` (head `D` on the left of `Equal`) before generic cases.
- `Scalar` accepts raw numbers and `{ num }` nodes (use `numericValue`).
- `y = f(x)` only if `y` does not appear on the right; same for `x` and `r`.
- Anything else with `Equal` becomes `Implicit` with `F = Subtract(lhs, rhs)`.
- `Less` / `Greater` become `Implicit` with `strict: true`.
- `Matrix` must be 2×2 or 3×3 in v1; otherwise `Unknown`.
- Free symbol `z` only (no `x`, `y`) becomes `ComplexMap` (deferred by D2).
- Reserved symbols: `x, y, z, t, r, θ`.
- The `Matrix` shape and `D` head must be verified against the pinned Compute Engine version in Phase 0.

## 7. Execution and rendering (CPU only)

### 7.1 Principles

Cost is the number of evaluations (field cost = W × H × N_nodes). Five techniques:
1. Compile once, evaluate many: closures cached by MathJSON hash. Slider drags re-run closures only.
2. Adaptive resolution: during drag, 1/4 resolution; at release, full resolution.
3. Incremental refinement: coarse grid first; refine only cells whose signs change (quadtree).
4. Parallelism: canvas split into horizontal strips, one per Worker, into OffscreenCanvas or transferred buffers.
5. Off-thread parsing: LaTeX → MathJSON in a Worker, debounced ~150 ms; stale results discarded by sequence number.

### 7.2 Performance budgets (hypotheses, measured in Phase 0 on D1)

| Case | Target |
|---|---|
| Dragging slider, 3 curves × 2000 samples | ≤ 2 ms per frame (60 fps) |
| Updating one curve after parameter change | ≤ 4 ms |
| Implicit field 400×250 during drag | ≤ 16 ms in Worker |
| Implicit field 1600×1000 on release | ≤ 150 ms, progressive display |
| Complex coloring 400×250 during interaction (deferred by D2) | ≤ 20 ms in Worker |
| Complex coloring 1600×1000 on release (deferred by D2) | ≤ 250 ms with four Workers |
| 3D model 80×80 grid (~12,800 triangles) (deferred by D3) | ≤ 25 ms per frame |
| Monte Carlo | ≥ 200,000 samples/second in Worker (measured, not assumed) |
| LaTeX → MathJSON per keystroke, off-thread | ≤ 16 ms for 50 nodes in Worker |
| Engine chunk (`shared/mathcore`, gzip, without Compute Engine) | ≤ 80 KB |
| Compute Engine chunk (gzip) | Measured in Phase 0; reported, not capped |
| Mathcore cost on other pages | 0 bytes |

No budget is an exit criterion until measured in Phase 0 on D1.

### 7.3 Technique details

- **Implicit fields:** evaluate F on a coarse grid; find cells with sign change at corners; zero contour by linear interpolation on edges (Marching Squares); fill pixels by sign via ImageData; draw contour on Canvas with smoothing; shade inequalities.
- **Complex coloring (deferred by D2):** for each pixel z, w = f(z); argument → hue (HSV), modulus → brightness and contour lines. Zeros and poles detected by winding number on a small grid, not inferred from the image. Branch cuts drawn explicitly where the argument jumps.
- **3D (deferred by D3):** perspective projection on CPU; triangles filled in a Worker by scanline rasterization with Float32Array z-buffer; Lambert lighting. Thousands of triangles per frame not supported; limit is the budget.
- **Derivatives:** central differences (f(x+h) − f(x−h)) / 2h, h ≈ √ε · max(1, |x|).
- **Integrals:** adaptive Simpson for general values; Riemann sums for teaching.
- **Shared Worker helper:** one helper in `client/src/features/mathcore/workers/` handling spawn, cancel with 5-second timeout, and sequence numbers. Same pattern as `features/plot/plotRunner.ts`.

## 8. Course acceptance criteria

### 8.1 Calculus 1–2–3
- Interactive tangent follows the pointer on the curve; shows f′(x₀) and slope triangle Δy, Δx; animates from secant to tangent as h → 0.
- Riemann sums (Phase 9): left, right, midpoint, trapezoid; slider N ∈ [2, 1000]; error vs exact shown.
- Solids of revolution (Phase 9): disks and cylindrical shells; 3D via software renderer (deferred by D3); θ ∈ [0, 2π] animated.
- 3D integrals and vectors (Phase 9): projected field arrows; ∮_C F·dr vs ∬_S (∇×F)·n dS (Stokes). Deferred by D3 where 3D is required.
- Criterion: numerical derivative matches symbolic within 10⁻⁷; left Riemann sum converges at O(1/N).

### 8.2 Linear algebra
- Matrix A deforms coordinate grid; î → first column, ĵ → second; grid parallel and evenly spaced; parallelogram shaded by determinant.
- Determinant by Gaussian elimination; sign shown; negative orientation changes color; zero determinant shows "singular matrix".
- Eigenvalues: 2×2 closed form; 3×3 QR iteration with Wilkinson shift. Repeated and complex eigenvalues handled explicitly (double radial line or rotation).
- Gauss-Jordan: written step tree; each row operation Rᵢ ← Rᵢ − kRⱼ shown in LaTeX, pivot highlighted.
- Planes in 3D (deferred by D3): projected slices; intersection point = solution.
- Criterion: determinant and eigenvalues match reference within relative error 10⁻⁹.

### 8.3 Ordinary and integral equations
- Direction fields: arrows from f(x, y). Click starts trajectory by RK4 (fixed step) or RKF45 (adaptive), forward and backward. Backward uses h < 0; error estimate uses |h|.
- 2D systems: phase portrait with particles along the field. Equilibria classified from Jacobian eigenvalues: attractor (green), repeller (red), saddle (yellow), center (blue).
- PDEs:
  - Heat: Crank–Nicolson (unconditionally stable; oscillates for non-smooth initial data).
  - Wave: explicit leapfrog requires c·Δt/Δx ≤ 1 in 1D; show CFL warning when it fails.
  - Initial conditions drawn with mouse on grid.
- Integral equations: Neumann iteration φₙ₊₁ = f + λKφₙ, with |λ|·‖K‖ < 1 checked; show divergence if it fails.
- Criterion: RK4 matches `solve_ivp` (rtol 10⁻¹⁰); halving h reduces error by factor 16.

### 8.4 Complex analysis (deferred by D2 — do not start)
- Domain coloring as in 7.3. Branch cuts: √z and log z principal branch, cut on negative real axis.
- Conformal mappings: rectangular grid transformed by f(z); angles shown; must stay 90° at non-critical points.
- Residues: ∮_C f(z) dz = 2πi Σ Res; poles inside C found by winding number and checked with numerical contour integral.
- Criterion: zeros and poles by winding number; JS matches coloring within 10⁻⁶.

### 8.5 Numerical methods
- Roots: Newton, bisection, secant. Each step drawn (tangent, chord, or bracket); error table |xₖ − xₖ₋₁|. Bisection fails explicitly if no sign change on [a, b]. Newton shows f′(xₖ) ≈ 0 case.
- Interpolation: Lagrange and natural cubic splines, draggable points, live recomputation, Runge's phenomenon illustration.
- Jacobi and Gauss-Seidel: convergence path plotted; divergence shown when strict diagonal dominance fails.
- Criterion: roots to 10⁻¹⁰ vs reference; splines match `scipy.interpolate.CubicSpline` within 10⁻¹².

### 8.6 Statistics and probability
- Distributions: Normal, Student-t, chi-square, binomial, Poisson. Density/mass with draggable [a, b]; shade probability and P-value.
- Required functions: erf, Γ, regularized incomplete beta Iₓ(a, b) in `shared/mathcore/stats/`; tested vs SciPy offline.
- Monte Carlo: xoshiro128** PRNG in a Worker streams batches. Examples: estimate π; demonstrate CLT.
- Criterion: CLT distribution approaches normal as N grows; 200,000 samples/second is a target to measure.

## 9. Edge cases

- Invalid expression: error shown at its position; nothing computed.
- Undefined domain: curve cut at NaN; large jump checked with derivative estimate before treating as asymptote.
- Very large or near-zero values: relative comparisons, not fixed absolute tolerance.
- float64: fine in normal range; for |x| > 10⁸ show precision-loss warning.
- Deep trees: limit 5000 nodes; larger rejected with explicit error.
- DoS protection: input ≤ 2000 characters; 200 ms parse timeout (in parse Worker); 5-second timeout for any Worker task with cancellation.
- No network during evaluation. Only the optional CAS endpoint (Phase 11) makes a request, and only on explicit user action.
- Accessibility: text descriptions of curves (domain, zeros, approximate extrema) generated from samples.
- Locale: Arabic UI in RTL shell; math LTR inside it; dedicated tests.

## 10. Testing and verification

| Layer | Tool | Criterion |
|---|---|---|
| Golden corpus | 300 expressions, mpmath at 50 digits, in `shared/mathcore/__golden__/` | Relative error ≤ 10⁻¹² |
| Differential fuzzing | 10,000 random expressions offline (`scripts/mathcore/`) vs mpmath; fixed-seed subset (≈500) in Vitest | Zero failures |
| Metamorphic | Numerical vs symbolic derivative; Riemann sum vs exact integral; equation symmetry | Within tolerance |
| ODE | RK4 and RKF45 vs `solve_ivp` (rtol 10⁻¹⁰); error ratio when halving h | Order of accuracy |
| Complex (deferred by D2) | JS vs reference; zeros and poles vs reference | ≤ 10⁻⁶ |
| Algorithms | Interpolation and distributions vs SciPy | ≤ 10⁻¹⁰ |
| Unit and integration | Vitest (existing setup) | Passing in CI |
| Performance | Benchmarks on D1, recorded per release | Section 7.2 |
| Bundle | Chunk sizes in existing build (`audit:dist`) plus mathcore chunk-size audit | Section 7.2 |
| Accessibility | Keyboard test and screen-reader emulation (Playwright) | No critical failures |
| Visual | Playwright snapshots of fields and coloring | Difference ≤ 0.5% of pixels |

Merge principle: no mathematical change merges before it passes the golden corpus and the fixed-seed fuzz subset.

## 11. Phases (ordered steps)

Each phase: do the deliverables, meet the exit criterion, then stop for owner review before the next phase starts. (One developer full-time ≈ 36 weeks; Phases 0–4 = minimum viable release ≈ 13 weeks.)

### Phase 0 — Foundation (week 1)
Deliverables:
1. Install and pin Compute Engine on a branch. Verify the `canonical: false` option (ADR-2) and the `Matrix` / `D` MathJSON shapes against the pinned version.
2. Record the shape of 20 expressions.
3. Write the full Graph IR spec (Section 5).
4. Build the golden corpus (300 expressions, mpmath 50 digits) in `shared/mathcore/__golden__/` via `scripts/mathcore/`.
5. Record D1 reference-device specs (owner input required) and run benchmarks and chunk-size measurements on them.
6. Record decision D0.
Exit: budgets adjusted by measurement; IR validated.

### Phase 1 — Explicit core (weeks 2–4)
Deliverables: `inferType`; closure compiler with cache; explicit, polar, parametric; tangents; sliders; Canvas renderer; route and lazy loading.
Exit: golden evaluation passes; 2 ms per drag frame with 3 curves; no mathcore bytes on other routes.

### Phase 2 — State and dependencies (weeks 5–7)
Deliverables: expression list; DAG; cycle detection; Graph IR in links (`lz-string`); export (PNG, SVG, JSON); text descriptions.
Exit: only dependents are updated (evaluation count measured).

### Phase 3 — Implicit and inequalities (weeks 8–10)
Deliverables: sign field; Marching Squares; shading; Workers; parse Worker.
Exit: implicit field budget met at quarter resolution.

### Phase 4 — 2D linear algebra (weeks 11–13)
Deliverables: Matrix2; grid transform; determinant; 2×2 eigenvalues; annotated Gauss-Jordan.
Exit: determinant and eigenvalues within 10⁻⁹.

### Phase 5 — 3D linear algebra (weeks 14–15) — DEFERRED by D3
If D3 stays deferred, skip. If activated: Matrix3; QR for eigenvalues; projected intersecting planes; software 3D.
Exit: 3D budget met; values match reference.

### Phase 6 — ODEs (weeks 16–19)
Deliverables: direction fields; RK4/RKF45 forward and backward; 2D systems; phase portrait; classification.
Exit: matches `solve_ivp`; error ratio 16×.

### Phase 7 — PDEs and IEs (weeks 20–22)
Deliverables: heat (Crank–Nicolson); wave (leapfrog with CFL); Neumann approximation.
Exit: stable within conditions; no silent failure.

### Phase 8 — Complex analysis (weeks 23–26) — DEFERRED by D2
If activated: domain coloring; zeros and poles by winding; branch cuts; conformal maps; residues; migrate existing complex code onto `shared/mathcore/complex`.
Exit: ≤ 10⁻⁶; zeros and poles match.

### Phase 9 — Calculus 1–3 (weeks 27–30)
Deliverables: Riemann sums; solids of revolution and 3D vectors / Stokes (3D parts deferred by D3).
Exit: derivatives and integrals within tolerance.

### Phase 10 — Numerical methods and statistics (weeks 31–33)
Deliverables: roots; interpolation; Jacobi / Gauss-Seidel; distributions; Monte Carlo.
Exit: matches SciPy; measured performance.

### Phase 11 — CAS and hardening (weeks 34–36)
Deliverables: `api/mathcore/cas.ts` with caching (D4); evaluate existing Pyodide dependency against it; performance, accessibility and visual testing.
Exit: acceptable response time; CAS service vs Pyodide decided by measurement.

## 12. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CPU performance misses budgets | High | Slow fields and coloring | Compile cache, adaptive resolution, incremental refinement, Workers; adjust targets by measurement |
| Compute Engine is large | Medium | Slow first input on route | Lazy chunk, measured in Phase 0; smaller parser fallback if needed |
| MathJSON shape changes between versions | High | Parser breakage | Exact version pin and golden corpus in CI |
| Undefined "Desmos-level" expectations | High | Endless project | Parity checklist (Section 4) is the only reference |
| Scope creep toward GeoGebra | High | Unbounded delay | Explicit non-goals (Section 13) |
| Duplicate evaluators and complex code | Medium | Inconsistent results | One compiler for graphing; safeExpr for slider formulas only; complex migration in Phase 8 |
| Software 3D limited in size | Certain | No dense models | Grid limit 80×80; simpler teaching models |
| Numerical stability in PDEs | Medium | Simulation failure | CN for heat; CFL warning for wave |
| Link size limit | Medium | Large docs cannot be shared as links | Explicit message and JSON export |
| RTL with LaTeX | Medium | Interface distortion | LTR math inside RTL shell; dedicated tests |
| Computation on main thread | Medium | Frozen UI | ADR-11 rule with frame-time test |

## 13. Out of scope

- Dynamic geometry (draggable points, lines, constructions).
- Full CAS replacing Mathematica or SymPy.
- Any WebGL, WebGPU, or Three.js rendering.
- High-density 3D models (millions of triangles).
- Real-time collaborative editing.
- Full interactive PDEs and IEs in v1.
- Changing the existing `safeExpr` evaluator or the existing CSP.

## 14. Change log from v3.0 (for reference)

- Stack: Next.js monorepo → existing Vite/React/Express app; `shared/mathcore/` and `client/src/features/mathcore/`.
- Compute Engine: assumed → installed and pinned in Phase 0; lazy-loaded.
- Reuse: explicit list in Section 3.
- Evaluator: closure compiler with MathJSON-hash cache.
- Parsing: off-thread Worker, debounced.
- Loading: route-level split; no idle prefetch.
- Link codec: custom deflate + base64url → `lz-string`.
- Link size: explicit "too large" message and JSON export.
- CSP: engine does not depend on `eval`; existing CSP not changed.
- Pyodide: recognized existing dependency; evaluated in Phase 11.
- ODE detection: `Derivative(y, x) = F` explicit.
- Scalar detection: raw numbers and `{ num }`.
- Localization: i18next, Arabic RTL shell with LTR math.
- Bundle: 80 KB engine chunk; Compute Engine reported separately.
- Testing: Vitest and Playwright; golden files in `__golden__/`.

## 15. Next step

Phase 0 on a branch: install and pin Compute Engine, measure chunk sizes and 20 expression shapes on D1, then set the budgets. Blocked until D1 specs are provided by the owner.