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
/** Compiled closures kept in the compile cache. */
export const COMPILE_CACHE_LIMIT = 512;
/** Owner decision Q7: style width in (0, 10]. */
export const MAX_STYLE_WIDTH = 10;
