# MAE Math Core: Implementation Plan

**Version:** 3.1 (revised to match the existing site architecture; pending decisions D0 to D4)
**Governing constraint:** No WebGL, no WebGPU, no Three.js. All rendering is CPU-based (Canvas 2D and ImageData), with module Workers and OffscreenCanvas for parallelism.

## 0. Purpose, Scope, and Fit With the Site

- **Goal (unchanged):** An expression and graphing core at Desmos-level functionality for functions, equations, and sliders, with first-class primitives for the six courses (Calculus 1-2-3, Linear Algebra, ODEs and integral equations, Complex Analysis, Numerical Methods, Statistics and Probability) inside one expression language and one state document.
- **Stack the plan targets:** The existing single pnpm project (`mae-academy`): Vite + React 19 + TypeScript client, Express server (`server/`), Vercel functions (`api/`), wouter routing, i18next, Vitest, and Playwright. The plan does not introduce Next.js or a monorepo.
- **Locations:**
  - `shared/mathcore/` holds the headless engine: pure TypeScript with no React or DOM imports. This follows the rule already used by `shared/fluid/engine/`.
  - `client/src/features/mathcore/` holds the UI, the renderers, and the Worker entry points.
  - `api/mathcore/` holds the optional CAS endpoint (Phase 11 only).
  - `scripts/mathcore/` holds the offline oracle script that generates golden files.
- **Existing code this plan reuses or deliberately leaves alone:**
  - `shared/fluid/engine/`: the headless-engine pattern.
  - `shared/schematic/__golden__/`: the golden-file pattern.
  - `client/src/features/plot/`: the module-Worker pattern (`new Worker(new URL(...), { type: "module" })`).
  - `client/src/components/ai/MathInputArea.tsx` and the MathLive loader: the input field.
  - `lz-string` (already a dependency): the link codec. No new codec is added.
  - `client/src/components/engines/safeExpr.ts`: **not replaced**. It stays the evaluator for model-written slider formulas. The new compiler serves only the graphing core, so there is one evaluator per use case, not two competing evaluators for the same job.
  - `shared/signals/transferFunction`: left as is in v1. Consolidation of complex arithmetic is a Phase 8 task, after the new complex module has golden tests.
- **Non-goals:** Matching GeoGebra's dynamic geometry, or a full CAS replacing SymPy or Mathematica.
- **Performance constraint:** Without a GPU, performance is measured against the budgets in Section 6.2. No budget is an exit criterion until measured in Phase 0 on the reference devices.

## 1. Desmos Parity Checklist (Testable Quality Criteria)

"Desmos-level" is defined only by this list. Each item has an acceptance test.

| Area | Required in v1 | Deferred (v2+) |
|---|---|---|
| Input | LaTeX via MathLive, multi-line expressions, comments, function definitions `f(x)` | Scripting |
| Explicit plotting | `y=f(x)`, `x=g(y)`, polar `r=f(θ)`, parametric `(x(t),y(t))` | — |
| Implicit plotting | `F(x,y)=0`, and inequalities `F<0` with region shading | 3D implicit surfaces |
| Sliders | Automatic for every undefined parameter, with min, max, step, and animation | — |
| Dependencies | DAG with re-evaluation of dependents only, and cycle detection | — |
| Interaction | Dragging points, tangent tracing, point-on-curve, zoom, pan | — |
| State | Full Graph IR in the link (`?g=`); export to PNG, SVG, JSON | Collaborative editing |
| Specialties | 2×2 and 3×3 matrices, first-order ODEs, two-dimensional systems, complex domain coloring | Full interactive PDE, full interactive IE |
| Accessibility | Generated text descriptions of curves; keyboard control of sliders | — |
| Localization | Arabic (RTL shell with LTR math), English, Spanish via the existing i18next setup | — |

## 2. Architecture Decision Records (ADR)

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| ADR-1 | AST is MathJSON from Compute Engine, pinned to an exact version and loaded lazily (dynamic import) on the mathcore route only | Standard LaTeX parsing without a custom parser; keeps it out of the main bundle | Custom parser; eager import |
| ADR-2 | Parse with `canonical: false` plus internal normalization (the option is verified at install time) | Prevents automatic rewriting that breaks structural stability | Default canonical form |
| ADR-3 | Closure compiler with no `eval` or `new Function` | Safe by construction. The current CSP (`vercel.json`) allows `unsafe-eval`, but we do not rely on it, so the engine works under a stricter policy later | Generated source text |
| ADR-4 | **CPU only for rendering and computation** | Project constraint | Any GPU path |
| ADR-5 | External oracle (mpmath, SymPy) runs only offline, through `scripts/mathcore/`; results are stored as golden files in `shared/mathcore/__golden__/` | No oracle loaded in the browser or in CI's runtime path; same pattern as `shared/schematic/__golden__/` | Runtime comparison |
| ADR-6 | One complex-number module in `shared/mathcore/complex/`, used for evaluation and coloring | One implementation inside the new engine. Existing complex code is migrated in Phase 8, not duplicated | Multiple libraries |
| ADR-7 | Canvas 2D for drawing, ImageData for fields and coloring, OffscreenCanvas inside Workers | Good performance without a GPU | Plotly, SVG for fields, any charting library |
| ADR-8 | Backend CAS (Python SymPy) as an `api/mathcore/` Vercel function with response caching. The existing `pyodide` dependency is evaluated in Phase 11 as an alternative, loaded only on demand | Keeps heavy CAS off the client; the existing Pyodide use is recognized, not ignored | Pyodide by default |
| ADR-9 | Graph IR is the sole state (single source of truth), held in one store, serialized with `lz-string` | Saving, sharing, and MAE AI all draw from one source | State scattered across React |
| ADR-10 | Abstract `Renderer` interface, with only a CPU implementation in v1 | Allows a future backend without changing logic | Logic tied directly to Canvas |
| ADR-11 | All heavy computation (coloring, fields, Monte Carlo, 3D) runs in module Workers; parsing also runs in a Worker | Keeps input responsive; a parse never blocks typing | Computation on the main thread |
| ADR-12 | Route-level code splitting. The engine, its Workers, and Compute Engine load only when the mathcore route opens. Nothing is prefetched on idle | Matches the recent site performance work (heavy simulator chunks are not warmed on idle) | Eager loading or idle prefetch |
| ADR-13 | UI strings go through i18next. Math stays LTR inside an RTL shell | The site already supports Arabic with on-demand dictionaries | Hard-coded strings |

## 3. Package Structure (Repo-Aligned)

```
shared/mathcore/                  # headless engine, no React or DOM imports
├── ir/                           # Graph IR schema (Zod) + validation rules
├── normalize/                    # MathJSON normalization and parameter naming
├── types/                        # inferType
├── compile/                      # closure compiler (CPU), cache keyed by MathJSON hash
├── complex/                      # unified complex arithmetic
├── numerics/                     # RK4, RKF45, Newton, Bisection, Secant, Lagrange,
│                                 # cubic spline, Jacobi, Gauss-Seidel, QR, annotated Gauss-Jordan
├── stats/                        # distributions, erf, Gamma, incomplete beta, PRNG
├── graph/                        # DAG, evaluation scheduling, cycle detection
├── codec/                        # IR <-> link (lz-string compressToEncodedURIComponent)
├── modules/                      # calculus, linear-algebra, odes, complex-analysis,
│                                 # numerical-methods, statistics
└── __golden__/                   # reference values generated offline by scripts/mathcore/

client/src/features/mathcore/
├── ui/                           # React: input, sliders, expression list, toolbar, i18n
├── render/                       # Renderer interface + Canvas2D + ImageData raster
├── workers/                      # module Workers: parse, coloring, fields, Monte Carlo, 3D
└── routes/                       # the route entry registered in the existing router

api/mathcore/cas.ts               # optional CAS endpoint (Phase 11)
scripts/mathcore/                 # offline oracle: mpmath / SymPy golden generation
```

Tests are co-located as `*.test.ts` and run under the existing Vitest setup. Visual snapshots use the existing Playwright setup.

## 4. Graph IR Specification (State Document)

### 4.1 Structure

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

### 4.2 Validation Rules

- `version` must match a supported version; otherwise the document is rejected explicitly.
- `id` is unique within the document, with length ≤ 32.
- `items` ≤ 100 entries; parameters ≤ 50.
- Every undefined symbol in an expression becomes a parameter automatically, added to `params` with default values.
- Dependency cycles are rejected with an error naming the items.
- `latex` ≤ 2000 characters; the MathJSON tree ≤ 5000 nodes.
- `animate.period_s` between 0.5 and 60 seconds.
- **Link encoding:** the document is serialized as JSON and compressed with `lz-string` (`compressToEncodedURIComponent`) into `?g=`. The limit is about 8 KB of encoded text. When a document exceeds it, the UI does not truncate. It shows "too large to share as a link" and offers JSON export. This is the only compression path, so the codec is not duplicated.

### 4.3 MAE AI Output

The AI emits Graph IR only and never emits computed numbers. Numbers come from the engine.

## 5. Type System

### 5.1 Table

| Type | Pattern | Rendering | Path |
|---|---|---|---|
| `Scalar` | `Equal(name, const)` | Slider | Main thread (trivial) |
| `Explicit` | `Equal(y, f(x))` or `Equal(x, g(y))` | Curve | Worker, adaptive sampling |
| `Polar` | `Equal(r, f(θ))` | Polar curve | Worker |
| `Parametric` | Pair `(x(t), y(t))` | Path | Worker |
| `Implicit` | `F(x,y) = 0` or an inequality | Sign field + Marching Squares | Worker |
| `RiemannSum` | `Integral(f, a, b)` with N | Rectangles and trapezoids | Worker |
| `Matrix2` / `Matrix3` | `Matrix(List(List...))` | 2D transform grid; 3D model via software rasterizer | Worker (3D) |
| `GaussSystem` | `A x = b` | Intersecting planes + elimination steps | Worker |
| `ODE1` | `Derivative(y, x) = F(x,y)` | Direction field and trajectories | Worker, RK4/RKF45 |
| `ODESystem2` | Pair `dx/dt`, `dy/dt` | Phase portrait | Worker |
| `PDEHeat` / `PDEWave` | Equation with boundary conditions | Heat map or membrane | Worker |
| `IEFredholm` / `IEVolterra` | Integral with kernel `K(x,t)` | Kernel surface + Neumann approximation | Worker |
| `ComplexMap` | `w = f(z)` | Domain coloring | Worker |
| `ConformalGrid` | `w = f(z)` applied to a grid | Two side-by-side grids | Worker |
| `NumericIter` | Roots or interpolation | Animated steps | Worker |
| `Distribution` | `Normal(μ,σ)` and others | Density with shading | Worker |
| `MonteCarlo` | Random samples | Points and a live histogram | Worker |
| `Surface3D` | `z = f(x,y)` | Projected mesh with z-buffer | Worker |
| `VectorField3D` | `F(x,y,z)` | Projected arrows | Worker |

### 5.2 Inference Algorithm

The fixes from v3.0 are applied here: the ODE form `Derivative(y, x) = F` is now recognized, and `Scalar` accepts both raw numbers and `{ num }` nodes.

```ts
type Node = string | number | { num: string } | [string, ...Node[]];

export type Kind =
  | { k: 'Scalar'; name: string; value: number }
  | { k: 'Explicit'; solveFor: 'y' | 'x'; rhs: Node; params: string[] }
  | { k: 'Polar'; rhs: Node; params: string[] }
  | { k: 'Parametric'; x: Node; y: Node; t: string; params: string[] }
  | { k: 'Implicit'; F: Node; params: string[]; strict: boolean }
  | { k: 'ODE1'; rhs: Node; params: string[] }
  | { k: 'Matrix'; n: 2 | 3; data: Node[][] }
  | { k: 'ComplexMap'; f: Node; params: string[] }
  | { k: 'Unknown'; reason: string };

const numericValue = (n: Node): number | undefined => {
  if (typeof n === 'number') return n;
  if (typeof n === 'object' && !Array.isArray(n) && 'num' in n) return Number(n.num);
  return undefined;
};

// Pure and total: never throws; returns Unknown with a reason.
export function inferType(
  n: Node,
  freeSyms: (n: Node) => Set<string>,
  isHead: (n: Node, h: string) => boolean,
): Kind {
  const RESERVED = new Set(['x', 'y', 'z', 't', 'r', 'θ']);
  const params = (s: Set<string>) => [...s].filter((v) => !RESERVED.has(v));

  if (isHead(n, 'Equal')) {
    const [, lhs, rhs] = n as [string, Node, Node];
    const fr = freeSyms(rhs);

    // Derivative(y, x) = F(x, y): the ODE form, checked before the generic cases
    if (Array.isArray(lhs) && isHead(lhs, 'D')) {
      return { k: 'ODE1', rhs, params: params(freeSyms(rhs)) };
    }

    // Constant: name = const
    const value = numericValue(rhs);
    if (typeof lhs === 'string' && !RESERVED.has(lhs) && fr.size === 0 && value !== undefined)
      return { k: 'Scalar', name: lhs, value };

    // y = f(x, params) only if y does not appear on the right side
    if (lhs === 'y' && !fr.has('y')) return { k: 'Explicit', solveFor: 'y', rhs, params: params(fr) };
    if (lhs === 'x' && !fr.has('x')) return { k: 'Explicit', solveFor: 'x', rhs, params: params(fr) };
    if (lhs === 'r' && !fr.has('r')) return { k: 'Polar', rhs, params: params(fr) };

    // Dependent variable on both sides, or any other equation: implicit
    const F = ['Subtract', lhs, rhs] as Node;
    return { k: 'Implicit', F, params: params(freeSyms(n)), strict: false };
  }

  if (isHead(n, 'Less') || isHead(n, 'Greater')) {
    return { k: 'Implicit', F: n, params: params(freeSyms(n)), strict: true };
  }

  if (isHead(n, 'Matrix')) {
    const rows = ((n as any)[1]?.slice(1) ?? []) as Node[][];
    if ((rows.length === 2 || rows.length === 3) && rows.every((r) => r.length === rows.length))
      return { k: 'Matrix', n: rows.length as 2 | 3, data: rows };
    return { k: 'Unknown', reason: 'Matrix must be 2×2 or 3×3 in v1' };
  }

  const fs = freeSyms(n);
  if (fs.has('z') && !fs.has('x') && !fs.has('y'))
    return { k: 'ComplexMap', f: n, params: params(fs) };

  return { k: 'Unknown', reason: 'Unsupported expression form' };
}
```

The `Matrix` shape and the `D` head must still be verified against the pinned Compute Engine version in Phase 0. The code above assumes the MathJSON forms that version emits.

## 6. Execution and Rendering Paths (CPU Only)

### 6.1 Principles

Without a GPU, the central cost is **the number of evaluations**. A field costs W × H × N_nodes. Five techniques keep the cost down:

1. **Compile once, evaluate many:** Each expression is compiled to closures once, and the result is cached by a hash of its MathJSON. Slider drags only re-run the closures.
2. **Lazy evaluation with adaptive resolution:** During dragging, fields are computed at 1/4 resolution. At release, they are computed at full resolution.
3. **Incremental refinement:** Fields are computed on a coarse grid first. Only cells whose signs change are refined (quadtree).
4. **Parallelism in Workers:** The canvas is split into horizontal strips. Each Worker computes one strip into an OffscreenCanvas or a transferred buffer.
5. **Off-thread parsing:** LaTeX → MathJSON runs in a Worker, debounced by about 150 ms. Typing never waits on the parser, and a stale parse result is discarded by sequence number.

### 6.2 Performance Budgets (Hypotheses Measured in Phase 0)

| Case | Target | Note |
|---|---|---|
| Dragging a slider with 3 curves × 2000 samples | ≤ 2 ms per frame | 60 fps |
| Updating one curve after a parameter change | ≤ 4 ms | Compiled closures only |
| Implicit field 400×250 during drag (quarter resolution) | ≤ 16 ms in Worker | 30–60 fps |
| Implicit field 1600×1000 on release | ≤ 150 ms with progressive display | |
| Complex coloring 400×250 during interaction | ≤ 20 ms in Worker | |
| Complex coloring 1600×1000 on release | ≤ 250 ms with four Workers | |
| 3D model with 80×80 grid (~12,800 triangles) | ≤ 25 ms per frame | Software painter/z-buffer |
| Monte Carlo | ≥ 200,000 samples/second in Worker | Measured, not assumed |
| LaTeX → MathJSON per keystroke (off-thread) | ≤ 16 ms for 50 nodes in the Worker | Main thread cost ≈ 0 |
| Engine chunk (`shared/mathcore`, gzip, without Compute Engine) | ≤ 80 KB | Loaded only on the mathcore route |
| Compute Engine chunk (gzip) | Measured in Phase 0; reported, not capped | Lazy; blocks only the first input on the route |
| Mathcore route cost on other pages | 0 bytes | Nothing prefetched on idle or from other routes |

**Explicitly:** The figures above are targets. They become exit criteria only after measurement in Phase 0 on the reference devices (D1). The Compute Engine size is measured before any cap is set, since the 80 KB figure cannot be assumed to include it.

### 6.3 Technique Details

- **Implicit fields:** Evaluate F(x,y) on a coarse grid, then find cells whose sign changes at their corners. Inside each cell, the zero contour is found by linear interpolation along edges (Marching Squares). Pixels are filled by sign through ImageData. The contour is drawn on Canvas with smoothing. Inequalities are shaded.
- **Complex coloring:** For each pixel z, compute w = f(z). The argument sets the hue (HSV) and the modulus sets brightness and contour lines. Zeros and poles are detected by the winding number around each point on a small grid, not inferred from the image. Branch cuts are drawn explicitly where the argument jumps.
- **3D models (no GPU):** Perspective projection computes triangle vertices on the CPU. Triangles are filled in a Worker by scanline rasterization with a Float32Array z-buffer. Lighting is Lambert. Thousands of triangles per frame are not supported; the limit is the budget above.
- **Derivatives and integrals:** Derivatives use central differences (f(x+h) − f(x−h)) / 2h with h ≈ √ε · max(1, |x|). Integrals use adaptive Simpson's rule for general values, and Riemann sums for teaching.
- **Shared Worker helper:** One small helper in `client/src/features/mathcore/workers/` handles spawn, cancel with the 5-second timeout, and sequence numbers. It follows the same pattern as `features/plot/plotRunner.ts`.

## 7. Detail for the Six Courses

For each course: inputs, algorithm, rendering, and acceptance criterion. Goals are unchanged from v3.0.

### 7.1 Calculus 1–2–3

- **Tangents and derivatives:** An interactive tangent follows the pointer on the curve. It displays f′(x₀) and the slope triangle Δy, Δx. The tangent animates from the secant to the tangent as h → 0.
- **Riemann sums (Phase 9):** Left, right, midpoint, and trapezoid rules. A slider sets N ∈ [2, 1000], and the error against the exact value is shown.
- **Solids of revolution (Phase 9):** Disks and cylindrical shells. The 3D view uses the software renderer (6.3) with the angle θ ∈ [0, 2π] animated.
- **3D integrals and vectors (Phase 9):** A field F is shown as projected arrows. For a closed curve C, the engine computes ∮_C F·dr and compares it with ∬_S (∇×F)·n dS, illustrating Stokes' theorem.
- **Criterion:** The numerical derivative matches the symbolic one within 10⁻⁷. The left Riemann sum converges at rate O(1/N).

### 7.2 Linear Algebra

- **Linear transformation:** Matrix A deforms the coordinate grid. î moves to the first column and ĵ to the second. The grid stays parallel and evenly spaced, and the parallelogram is shaded by the determinant.
- **Determinant:** Computed by Gaussian elimination; the sign is shown. A negative orientation changes the color. A zero determinant shows a "singular matrix" warning.
- **Eigenvalues and eigenvectors:** 2×2 uses closed-form formulas. 3×3 uses QR iteration with a Wilkinson shift. Repeated and complex eigenvalues are handled explicitly (a double radial line or a rotation).
- **Gauss-Jordan elimination:** The system Ax = b is solved with a written step tree. Each row operation Rᵢ ← Rᵢ − kRⱼ is shown in LaTeX, with the pivot highlighted.
- **Planes in 3D:** Each plane is drawn as projected slices, with the intersection point as the solution.
- **Criterion:** Determinant and eigenvalues match the reference within relative error 10⁻⁹.

### 7.3 Ordinary and Integral Equations

- **Direction fields:** A grid of arrows from f(x, y). A click starts a trajectory by RK4 (fixed step) or RKF45 (adaptive), integrated forward and backward. Backward integration uses h < 0, and the error estimate uses |h|.
- **Two-dimensional systems:** A phase portrait with particles moving along the field. Equilibria are classified from the Jacobian eigenvalues: attractor (green), repeller (red), saddle (yellow), center (blue).
- **PDEs:**
  - **Heat:** Crank–Nicolson, unconditionally stable, but it oscillates for non-smooth initial data.
  - **Wave:** Explicit leapfrog requires c·Δt/Δx ≤ 1 in 1D. When this fails, a CFL warning is shown.
  - Initial conditions are drawn with the mouse on the grid.
- **Integral equations:** Neumann iteration φₙ₊₁ = f + λKφₙ, with |λ|·‖K‖ < 1 checked. If the condition fails, the engine shows divergence.
- **Criterion:** RK4 matches `solve_ivp` (rtol 10⁻¹⁰), and halving h reduces the error by a factor of 16.

### 7.4 Complex Analysis

- **Domain coloring:** As in 6.3.
- **Branch cuts:** √z and log z use the principal branch, with the cut on the negative real axis.
- **Conformal mappings:** A rectangular grid is transformed by f(z). Intersection angles are shown and must stay 90° at non-critical points.
- **Residues:** ∮_C f(z) dz = 2πi Σ Res. Poles inside C are found by winding number and checked against a numerical contour integral.
- **Criterion:** Zeros and poles are found by winding number, and the JS computation matches the coloring within 10⁻⁶.

### 7.5 Numerical Methods

- **Roots:** Newton, bisection, and secant. Each step is drawn (tangent, chord, or bisection bracket), with an error table |xₖ − xₖ₋₁|. Bisection fails explicitly if f does not change sign on [a, b]. Newton shows the case f′(xₖ) ≈ 0.
- **Interpolation:** Lagrange and natural cubic splines, with draggable points and live recomputation, and an illustration of Runge's phenomenon.
- **Iterative linear systems:** Jacobi and Gauss-Seidel, with the convergence path plotted and the divergence case shown when strict diagonal dominance fails.
- **Criterion:** Roots match the reference to 10⁻¹⁰. Splines match `scipy.interpolate.CubicSpline` within 10⁻¹².

### 7.6 Statistics and Probability

- **Distributions:** Normal, Student-t, chi-square, binomial, Poisson. The density or mass is shown with draggable bounds [a, b], shading the probability and the P-value.
- **Required functions:** erf, Γ, and the regularized incomplete beta Iₓ(a, b), implemented in `shared/mathcore/stats/` and tested against SciPy offline.
- **Monte Carlo:** A PRNG (xoshiro128**) inside a Worker streams batches of samples. Examples: estimating π and demonstrating the CLT.
- **Criterion:** The CLT distribution approaches normal as N grows. Throughput of 200,000 samples/second is a target to be measured.

## 8. Edge Cases

- **Invalid expression:** An error is shown at its position in the input. Nothing is computed.
- **Undefined domain:** The curve is cut at NaN. A large jump is checked with a derivative estimate before it is treated as an asymptote.
- **Very large or near-zero values:** Relative comparisons are used, not a fixed absolute tolerance.
- **float64 in JS:** No issue in the normal range. For |x| > 10⁸, a precision-loss warning is shown.
- **Deep trees:** A limit of 5000 nodes. Anything larger is rejected with an explicit error.
- **DoS protection:** Input limit of 2000 characters, a 200 ms parse timeout (in the parse Worker, so it cannot freeze the page), and a 5-second timeout for any Worker task with cancellation.
- **No network:** The engine makes no requests during evaluation. Only the optional CAS endpoint (Phase 11) makes one, and only on an explicit user action.
- **Accessibility:** Text descriptions of curves (domain, zeros, approximate extrema) are generated from samples.
- **Locale:** Arabic UI runs in an RTL shell. Math stays LTR inside it, with dedicated tests.

## 9. Testing and Verification

| Layer | Tool | Criterion |
|---|---|---|
| Golden corpus | 300 expressions across types, with reference values from mpmath at 50 digits, in `shared/mathcore/__golden__/` | Relative error ≤ 10⁻¹² for evaluation |
| Differential fuzzing | 10,000 random expressions, run offline by `scripts/mathcore/` against mpmath; a fixed-seed subset (≈500) runs in Vitest | Zero failures |
| Metamorphic | Numerical vs symbolic derivative; Riemann sum vs exact integral; symmetry of equations | Within tolerance |
| ODE | RK4 and RKF45 vs `solve_ivp` (rtol 10⁻¹⁰); error ratio when halving h | Order of accuracy |
| Complex | JS vs reference; zeros and poles vs reference | ≤ 10⁻⁶ |
| Algorithms | Interpolation and distributions vs SciPy | ≤ 10⁻¹⁰ |
| Unit and integration | Vitest (existing setup) | Passing in CI |
| Performance | Benchmarks on the reference devices (D1), recorded per release | Section 6.2 |
| Bundle | Chunk sizes checked in the existing build (`audit:dist`) | Section 6.2 |
| Accessibility | Keyboard test and screen-reader emulation (Playwright) | No critical failures |
| Visual | Playwright snapshots of fields and coloring | Difference ≤ 0.5% of pixels |

**Merge principle:** No mathematical change is merged before it passes the golden corpus and the fixed-seed fuzz subset. This follows the platform's principle: no feature ships before verification against an external reference.

## 10. Timeline (One Developer, Full-Time)

| Phase | Weeks | Deliverables | Exit criterion |
|---|---|---|---|
| **0. Foundation** | 1 | Install and pin Compute Engine on a branch; record the shape of 20 expressions; full Graph IR spec; golden corpus (300); benchmarks and chunk-size measurements on the reference devices; decision D0 | Budgets adjusted by measurement; IR validated |
| **1. Explicit core** | 2–4 | `inferType`, closure compiler with cache, explicit, polar, parametric; tangents; sliders; Canvas; route and lazy loading | Golden evaluation passes; 2 ms per drag frame with 3 curves; no mathcore bytes on other routes |
| **2. State and dependencies** | 5–7 | Expression list, DAG, cycle detection, Graph IR in links (`lz-string`), export, text descriptions | Only dependents are updated (evaluation count measured) |
| **3. Implicit and inequalities** | 8–10 | Sign field, Marching Squares, shading, Workers, parse Worker | Implicit field budget at quarter resolution |
| **4. 2D linear algebra** | 11–13 | Matrix2, grid transform, determinant, 2×2 eigenvalues, annotated Gauss-Jordan | Determinant and eigenvalues match within 10⁻⁹ |
| **5. 3D linear algebra** | 14–15 | Matrix3, QR for eigenvalues, projected intersecting planes, software 3D | 3D budget met; values match reference |
| **6. ODEs** | 16–19 | Direction fields, RK4/RKF45 forward and backward, two-dimensional systems, phase portrait, classification | Matches `solve_ivp`; error ratio 16× |
| **7. PDEs and IEs** | 20–22 | Heat (CN), wave (leapfrog with CFL), Neumann approximation | Stable within conditions; no silent failure |
| **8. Complex analysis** | 23–26 | Domain coloring, zeros and poles by winding, branch cuts, conformal maps, residues; migrate existing complex code onto `shared/mathcore/complex` | ≤ 10⁻⁶; zeros and poles match |
| **9. Calculus 1–3** | 27–30 | Riemann sums, solids of revolution, 3D vectors, Stokes | Derivatives and integrals within tolerance |
| **10. Numerical methods and statistics** | 31–33 | Roots, interpolation, Jacobi/Gauss-Seidel, distributions, Monte Carlo | Matches SciPy; measured performance |
| **11. CAS and hardening** | 34–36 | `api/mathcore/cas.ts` with caching; evaluate the existing Pyodide dependency against it; performance, accessibility, visual testing | Acceptable response time; service vs Pyodide decided by measurement |

**Total:** About 36 weeks full-time. Phases 0–4 form the **minimum viable release**, at roughly 13 weeks.

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CPU performance misses budgets | High | Slow fields and coloring | Compile cache, adaptive resolution, incremental refinement, Workers; adjust targets by measurement |
| Compute Engine is large | Medium | Slow first input on the route | Lazy chunk, measured in Phase 0; fallback to a smaller parser if needed |
| MathJSON shape changes between versions | High | Parser breakage | Exact version pin and golden corpus in CI |
| Undefined "Desmos-level" expectations | High | Endless project | The parity checklist in Section 1 is the only reference |
| Scope creep toward GeoGebra | High | Unbounded delay | Explicit non-goals (Section 12) |
| Duplicate evaluators and complex code | Medium | Inconsistent results | One compiler for graphing; safeExpr kept for slider formulas only; complex migration in Phase 8 |
| Software 3D limited in size | Certain | No dense models | Grid limit 80×80; teaching with simpler models |
| Numerical stability in PDEs | Medium | Simulation failure | CN for heat; CFL warning for wave |
| Link size limit | Medium | Large documents cannot be shared as links | Explicit message and JSON export |
| RTL with LaTeX | Medium | Interface distortion | LTR math inside RTL shell; dedicated tests |
| Computation on the main thread | Medium | Frozen UI | ADR-11 rule with a frame-time test |

## 12. Out of Scope

- Dynamic geometry (draggable points, lines, and constructions).
- A full CAS replacing Mathematica or SymPy.
- Any rendering via WebGL, WebGPU, or Three.js (a project constraint).
- High-density 3D models (millions of triangles).
- Real-time collaborative editing.
- Full interactive PDEs and IEs in v1.
- Changing the existing `safeExpr` evaluator or the existing CSP. These are separate tasks.

## 13. Decisions Required Before Phase 0

1. **D0: Build or embed?** **Recommendation:** build the core. The engine is headless and reuses the existing worker and link patterns. Keep the Desmos API as a fallback for explicit plotting if Phase 1 budgets fail.
2. **D1: Performance reference devices:** a mid-range laptop and a mid-range Android phone, with specifications recorded before measurement.
3. **D2: Complex analysis in v1?** If not, Phase 8 is deferred entirely.
4. **D3: 3D in v1?** If not, Phase 5 and the 3D parts of Phase 9 are deferred.
5. **D4: CAS location.** **Recommendation:** a Vercel function under `api/mathcore/` with caching, following the existing `api/` pattern. Pyodide stays as a documented alternative, decided by Phase 11 measurements.

## 14. Change Log from Version 3.0

| Item | Before (3.0) | After (3.1) |
|---|---|---|
| Stack and location | Next.js, `packages/mathcore` monorepo | Existing Vite/React/Express app; `shared/mathcore/` and `client/src/features/mathcore/` |
| Dependencies | Compute Engine assumed present | Compute Engine installed and pinned in Phase 0; lazy-loaded |
| Existing code | Not mentioned | Reuse of `shared/fluid/engine` pattern, `features/plot` workers, `lz-string`, MathLive; `safeExpr` kept for its own use |
| Evaluator | Closure compiler only | Closure compiler with a cache keyed by MathJSON hash |
| Parsing | Main thread, implied | Off-thread in a Worker, debounced |
| Loading | Not specified | Route-level code split; nothing prefetched on idle |
| Link codec | Custom deflate + base64url | `lz-string`, already a dependency |
| Link size | Not reconciled with item limits | Explicit "too large" message and JSON export |
| CSP | "Strict CSP compatibility" as rationale | Engine does not depend on `eval`; the existing CSP is not changed here |
| Pyodide | Deferred as heavy | Recognized as an existing dependency; evaluated in Phase 11 |
| ODE detection | `D` head checked on bare nodes only | `Derivative(y, x) = F` recognized explicitly |
| Scalar detection | Assumed raw numbers | Accepts raw numbers and `{ num }` nodes |
| Localization | Not covered | i18next; Arabic RTL shell with LTR math |
| Bundle budget | 80 KB for the core | 80 KB for the engine chunk; Compute Engine measured and reported separately |
| Testing | Generic tooling | Existing Vitest and Playwright; golden files in `__golden__/` as in `shared/schematic` |

## Summary

This plan keeps the same goals: the parity checklist, the six courses, the Graph IR, and the testing standard. It moves the work into the existing architecture and removes several sources of cost: a second codec, a second evaluator for the same job, parsing on the main thread, and loading the engine on routes that never use it. Performance numbers remain hypotheses until Phase 0 measures them on the reference devices.

Next step: Phase 0 on a branch. Install and pin Compute Engine, measure chunk sizes and the 20 expression shapes, and then set the budgets.
