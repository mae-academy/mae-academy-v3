/**
 * Limits and tolerances from the plan of record (STEPS.md §5.2, §7, §9). Every limit the engine enforces is named here.
 */

/** STEPS.md §5.2: `latex` ≤ 2000 characters (also the DoS input limit in §9). */
export const MAX_LATEX_LENGTH = 2000;
/** STEPS.md §5.2 and §9: MathJSON tree ≤ 5000 nodes. */
export const MAX_EXPR_NODES = 5000;
/** STEPS.md §5.2: items ≤ 100. */
export const MAX_ITEMS = 100;
/** STEPS.md §5.2: parameters ≤ 50. */
export const MAX_PARAMS = 50;
/** STEPS.md §5.2: `id` length ≤ 32. */
export const MAX_ID_LENGTH = 32;
/** STEPS.md §5.2: `animate.period_s` between 0.5 and 60 seconds. */
export const MIN_PERIOD_S = 0.5;
export const MAX_PERIOD_S = 60;
/** STEPS.md §5.2: link limit about 8 KB encoded. */
export const MAX_LINK_CHARS = 8192;
/** STEPS.md §9: 200 ms parse timeout in the parse Worker. */
export const PARSE_TIMEOUT_MS = 200;
/** STEPS.md §7.3 and §9: 5-second timeout for any Worker task. */
export const WORKER_TIMEOUT_MS = 5000;
/** STEPS.md §7.1: parsing debounced ~150 ms. */
export const PARSE_DEBOUNCE_MS = 150;
/** STEPS.md §9: for |x| > 10⁸ show a precision-loss warning. */
export const PRECISION_WARNING_MAGNITUDE = 1e8;

/** STEPS.md §6.2: reserved symbols (Q4: Compute Engine's ASCII `theta`). */
export const RESERVED_SYMBOLS: ReadonlySet<string> = new Set(["x", "y", "z", "t", "r", "theta"]);

/** Owner decision Q10: defaults for an automatically created parameter. */
export const DEFAULT_PARAM = { value: 1, min: -10, max: 10, step: 0.1 } as const;

/** STEPS.md §7.3: central-difference step h ≈ √ε · max(1, |x|). */
export const DERIVATIVE_STEP_SCALE = Math.sqrt(Number.EPSILON);

/** Guard for user-function recursion and nested evaluation (sums, integrals). */
export const MAX_CALL_DEPTH = 64;
/** Upper bound on terms in a Σ or Π so a typo cannot freeze a Worker. */
export const MAX_SUM_TERMS = 100_000;

/** STEPS.md §7.3 integrals: absolute tolerance of adaptive Simpson and its recursion limit. */
export const INTEGRAL_TOLERANCE = 1e-12;
export const INTEGRAL_MAX_DEPTH = 50;
/** Tanh-sinh fallback for endpoint singularities: maximum refinement level (step 2⁻ᵏ). */
export const TANH_SINH_MAX_LEVEL = 10;
/** Implicit curves (STEPS.md §7.1 techniques 2–3): coarse cell size and refinement of cells the curve crosses. */
export const IMPLICIT_CELL_PX_FULL = 6;
export const IMPLICIT_CELL_PX_DRAG = 12;
export const IMPLICIT_REFINE_FULL = 4;
export const IMPLICIT_REFINE_DRAG = 2;
/** Bisections per sign change on a lattice edge (accuracy 2⁻⁸ of a fine cell, then linear interpolation; and the pole test). */
export const CROSSING_BISECTIONS = 8;
/** A coarse cell whose corner is within this many cell-widths of zero at the local slope is refined. */
export const NEAR_ZERO_CELLS = 1.5;
/** Curve ends closer than this many fine-cell diagonals are joined. */
export const STITCH_CELLS = 2;
/** Inequality shading: one sample every this many pixels (full quality, while dragging). */
export const FIELD_STRIDE_FULL = 1;
export const FIELD_STRIDE_DRAG = 4;
/** Tanh-sinh: successive levels agreeing to this relative change count as converged. */
export const TANH_SINH_RELATIVE = 1e-12;
/** Tanh-sinh: after the last level, a change below this relative size is the rounding noise floor, not divergence. */
export const TANH_SINH_NOISE_FLOOR = 1e-9;
/** A sampled |f| above this means the integrand blows up inside the interval, not that it has a bounded jump. */
export const DIVERGENCE_BOUND = 1e9;
/** STEPS.md §7.1 technique 2: while dragging, curves are sampled at a quarter of the resolution. */
export const SAMPLE_DRAG_FACTOR = 4;
/** Initial uniform intervals of a curve at full quality (divided by SAMPLE_DRAG_FACTOR while dragging, never below the minimum). */
export const SAMPLE_INITIAL_FULL = 200;
export const SAMPLE_INITIAL_MIN = 25;
/** Jump detection on sampled curves: neighbours further apart than this many pixels are bisected this many times. */
export const JUMP_PIXELS = 8;
export const JUMP_BISECTIONS = 40;
/** Dash patterns (on, off) in canvas units, shared by the canvas renderer and SVG export. */
export const DASH_PATTERNS = { dashed: [8, 6], dotted: [2, 4] } as const;
/** Opacity of inequality shading (0–1): light enough that curves and the grid stay readable under it. */
export const FIELD_OPACITY = 0.2;
/** Compiled closures kept in the compile cache. */
export const COMPILE_CACHE_LIMIT = 512;
/** Owner decision Q7: style width in (0, 10]. */
export const MAX_STYLE_WIDTH = 10;
/**
 * Points where a system's equations are checked for linearity (F(p) = F(0) + Σ cⱼpⱼ): fixed, irregular values so a
 * non-linear term cannot vanish at all of them by accident, and the result is reproducible.
 */
export const LINEARITY_PROBES: readonly (readonly number[])[] = [
  [0.7310, -1.3127, 0.4519],
  [-2.1033, 0.5871, 1.9207],
];
/** Relative tolerance of the linearity check (rounding in F, not a modelling tolerance). */
export const LINEARITY_RELATIVE_TOLERANCE = 1e-9;
/** Opacity of the grid transformed by a 2×2 matrix (STEPS.md §8.2), over the plain grid. */
export const TRANSFORM_GRID_OPACITY = 0.45;
/** Bisection step at which the pole test records the bracket spread (compared with the spread at the end). */
export const POLE_TEST_STEP = 4;
/** A crossing is a zero when the final bracket spread is at most this fraction of the early one (a zero gives ~2⁻⁸). */
export const ROOT_SPREAD_RATIO = 0.5;
/** Distance from the view border, relative to the view span, at which a curve end counts as leaving the view. */
export const VIEW_BORDER_RELATIVE = 1e-9;
/** Smallest shading block, in mask pixels (a block of 1 would be per-pixel evaluation with extra cost). */
export const MASK_MIN_BLOCK = 2;
/** Blocks at least this many mask pixels wide are also probed at their edge midpoints, not only at the centre. */
export const MASK_EDGE_PROBE_BLOCK = 4;
/** A Worker that has not answered yet may still be downloading its code (Compute Engine): first-request limit. */
export const PARSE_LOAD_TIMEOUT_MS = 30_000;
export const ENGINE_LOAD_TIMEOUT_MS = 30_000;
/** Parsed LaTeX strings kept by the page (the oldest are dropped first). */
export const PARSE_CACHE_LIMIT = 2000;
/** A string that timed out this many times on a running parser is cached as too slow (once may be a busy machine). */
export const PARSE_TIMEOUTS_BEFORE_CACHE = 2;
/** Endpoint tail exponents within this of 1 count as not integrable (∫ u^(−α) diverges at α = 1). */
export const TAIL_ALPHA_MARGIN = 1e-3;
/** A tanh-sinh node is used while its rounded abscissa is within this relative error of its intended endpoint distance. */
export const ABSCISSA_RELATIVE = 0.25;
/** Relative model error assumed for an endpoint tail f·d/(1 − α) when bounding the error (measured: ~1%). */
export const TAIL_MODEL_UNCERTAINTY = 0.05;
/** Address-bar link refresh delay after the last change. */
export const LINK_DEBOUNCE_MS = 500;
/** Curve width when an item has no style (canvas drawing units). */
export const DEFAULT_CURVE_WIDTH = 2.5;
/** Polar θ and parametric t run over [0, PARAMETER_TURN] (one full turn, as in Desmos). */
export const PARAMETER_TURN = 2 * Math.PI;
/** Adaptive sampling: points per curve (the 2000-sample budget with refinement headroom) and bisection depth. */
export const SAMPLE_MAX_POINTS = 4000;
export const SAMPLE_MAX_DEPTH = 8;
/** Strip Workers for implicit fields (§7.1 technique 4; §7.2 plans four Workers for the heaviest fields). */
export const STRIP_WORKERS_MAX = 4;
