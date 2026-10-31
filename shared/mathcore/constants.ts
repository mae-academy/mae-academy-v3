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
  [-2.1033, 0.5871, -1.9207],
  [3.4129, 2.7713, -3.0581],
  [-4.6687, -3.9251, 2.6633],
];
/** Relative tolerance of the linearity check (rounding in F, not a modelling tolerance). */
export const LINEARITY_RELATIVE_TOLERANCE = 1e-9;
/** Opacity of the grid transformed by a 2×2 matrix (STEPS.md §8.2), over the plain grid. */
export const TRANSFORM_GRID_OPACITY = 0.45;
/** Bisection step at which the pole test records the bracket spread (compared with the spread after the halvings). */
export const POLE_TEST_STEP = 4;
/** A crossing is a zero when the bracket spread fell to at most this fraction of the reference spread. */
export const ROOT_SPREAD_RATIO = 0.5;
/** Bisections allowed on an edge whose spread has not shrunk after CROSSING_BISECTIONS (steep F, weak zeros). */
export const CROSSING_BISECTIONS_MAX = 40;
/** Distance from the view border, relative to the view span, at which a curve end counts as leaving the view. */
export const VIEW_BORDER_RELATIVE = 1e-9;
/** Smallest shading block, in mask pixels (a block of 1 would be per-pixel evaluation with extra cost). */
export const MASK_MIN_BLOCK = 2;
/** Shading blocks at least this many mask pixels wide get MASK_PROBES_LARGE jittered probes, smaller ones fewer. */
export const MASK_EDGE_PROBE_BLOCK = 4;
export const MASK_PROBES_LARGE = 5;
export const MASK_PROBES_SMALL = 1;
/** Jittered probes per coarse contour cell that its corners did not mark for refinement. */
export const CONTOUR_PROBES = 1;
/** Jittered probes stay this fraction of a cell away from its edges (the corners are already known). */
export const JITTER_MARGIN = 0.05;
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
export const ABSCISSA_RELATIVE = 1e-2;
/** Relative model error assumed for an endpoint tail when bounding the error (measured: below 1e-5 of the tail). */
export const TAIL_MODEL_UNCERTAINTY = 1e-3;
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
/** Fewer strip Workers than this are not worth starting; this many cores are left for the page and this Worker. */
export const STRIP_WORKERS_MIN = 2;
export const STRIP_RESERVED_CORES = 1;
/** A strip run that takes longer fails over to this Worker (longer before the strip chunk has loaded). */
export const STRIP_TIMEOUT_MS = 3000;
export const STRIP_LOAD_TIMEOUT_MS = 20_000;
/** 3D frames are at most this many pixels on a side (a huge canvas does not allocate a huge frame). */
export const FRAME3_MAX_SIDE = 4096;
/** 3D frames while the camera moves are rendered at this fraction of the canvas size (§7.1 technique 2). */
export const FRAME3_DRAG_SCALE = 0.5;
/** Significant digits of floating-point numbers in reports, step LaTeX, labels and spoken descriptions. */
export const DISPLAY_DIGITS = 6;
/** |det| below this times the Hadamard bound (product of row norms) counts as singular (relative, §9). */
export const SINGULAR_RELATIVE_TOLERANCE = 1e-12;
/**
 * Floating-point elimination: an entry below this times its row's scale (tracked through the row operations,
 * separately for coefficients and augmented columns) is rounding residue and is set to 0.
 */
export const ELIMINATION_RELATIVE = 1e-12;
/** 2×2 eigenvalues are repeated when the discriminant is within this many ulps of the terms it is summed from. */
export const DISCRIMINANT_ULPS = 8;
/** Decimal places accepted for an exact decimal conversion (0.125 → 1/8) in step-by-step reports. */
export const MAX_EXACT_DECIMALS = 9;
/** Square factors are pulled out of √n by trial division up to this bound. */
export const SQUARE_FACTOR_LIMIT = 10_000;
/** Transformed grid: lines per family at most (k steps by 1, 2 or 5 × 10ⁿ beyond this). */
export const TRANSFORM_GRID_MAX_LINES = 120;
/** 3×3 eigenvalues: equal, or real, within this relative tolerance of the largest |λ| (QR rounding). */
export const EIGEN_IMAG_RELATIVE = 1e-9;
/**
 * A 3×3 matrix scaled to unit size whose characteristic-polynomial discriminant is at most this is treated as having a
 * repeated eigenvalue (rounded entries of a defective matrix give Δ ≈ 1e-17 for a double root, far less for a triple).
 */
export const EIGEN_DISC_RELATIVE = 1e-12;
/** In that case, all three roots coincide when even the most isolated one is within this of the others (unit-size matrix). */
export const EIGEN_CLUSTER_RELATIVE = 1e-3;
/** Stitching: nearest partner ends each curve end proposes (ends crowded in one cell stay linear to handle). */
export const STITCH_CANDIDATES = 2;
/** Tanh-sinh: levels compared before convergence is accepted, and the distance from an endpoint (as a fraction of
 * the half interval) within which an overflowing integrand ends that side instead of failing. */
export const TANH_SINH_MIN_LEVEL = 3;
export const TANH_SINH_EDGE_FRACTION = 1e-12;
/** Interior singularity search: bracket around the largest sample (fraction of the interval) and iterations. */
export const PEAK_BRACKET = 1e-2;
export const PEAK_ITERATIONS = 200;
/** Simpson that did not converge and saw a sample this many times the mean |f| is treated as singular there. */
export const SINGULAR_PEAK_RATIO = 1e4;
/** A line whose parse failed for a passing reason is parsed again after this delay, doubling up to the maximum. */
export const PARSE_RETRY_MS = 2000;
export const PARSE_RETRY_MAX_MS = 30_000;
export const PARSE_RETRY_LIMIT = 5;
/** Canvas size assumed until the canvas has been laid out (CSS pixels). */
export const CANVAS_FALLBACK = { width: 800, height: 500 } as const;
/** Significant digits of a rotation angle (degrees) and scale shown to the reader. */
export const ANGLE_DIGITS = 4;
/**
 * 3D: near clipping plane as a fraction of the camera distance (far below any distance at which a plane near the eye is
 * still meaningful, so zooming in or sitting inside the box does not cut surfaces apart; 1/z depth stays exact in
 * Float32); vertical field of view; ambient light share.
 */
export const NEAR_RELATIVE = 1e-6;
export const CAMERA_FOV = Math.PI / 4;
export const AMBIENT_LIGHT = 0.3;
/** Lines are drawn as if this fraction nearer, so they win depth ties against the faces they lie on. */
export const LINE_DEPTH_BIAS = 0.999;
/** Upper bound on the pixels walked along one line (a line whose ends project far off-screen). */
export const MAX_LINE_STEPS = 20_000;
/** A line behind a translucent surface keeps this share of the surface color over it (≈ the planes' opacity). */
export const LINE_BEHIND_MIX = 0.45;
/** 3D scene: smallest and largest box half-size, margin around the content, solution marker and arc sizes (fractions
 * of the half-size), and axis-label offset. */
export const SCENE_MIN_HALF = 5;
export const SCENE_MAX_HALF = 1e150;
export const SCENE_MARGIN = 1.25;
export const MARKER_FRACTION = 0.06;
export const ARC_FRACTION = 0.35;
export const LABEL_OFFSET = 1.06;
/** Camera fit: the box's bounding sphere (radius √3·L) fits the narrower field of view with this margin. */
export const CAMERA_FIT_MARGIN = 1.05;
/** Camera zoom range relative to the box half-size L (a camera inside the box is allowed: near-plane clipping). */
export const CAMERA_MIN_RELATIVE = 0.05;
export const CAMERA_MAX_RELATIVE = 200;
/** Canvas interaction: zoom factor per wheel notch or + / − key; 3D orbit radians per pixel of drag and per key. */
export const ZOOM_FACTOR = 1.2;
export const ORBIT_RADIANS_PER_PX = 0.01;
export const ORBIT_RADIANS_PER_KEY = 0.1;
/** Transform geometry: margin around the view (fraction of its size) and radial lines for a scalar matrix. */
export const TRANSFORM_BOX_MARGIN = 0.05;
export const TRANSFORM_RADIAL_LINES = 8;
/** Uniform samples whose median |f| is the integrand's typical size (singularity test). */
export const TYPICAL_SAMPLES = 33;
/** Stitching rounds: ends left unmatched propose again among the unmatched ones. */
export const STITCH_ROUNDS = 4;
/** A unit direction's sign is fixed by its first entry larger than this share of its length. */
export const DIRECTION_SIGN_RELATIVE = 1e-12;
/** Canvas eigen markers (drawing units): gap of the double line, radius of the rotation arc. */
export const EIGEN_DOUBLE_LINE_GAP = 2;
export const EIGEN_ARC_RADIUS = 36;
/** Adaptive Simpson: panels with irregular borders (nudged by up to PANEL_NUDGE/2 of a panel, positions spread by
 * the golden-ratio fraction), minimum depth per panel, Richardson factor 15 and rounding allowance in ulps. */
export const SIMPSON_PANELS = 7;
export const PANEL_NUDGE = 0.5;
export const PANEL_SPREAD = 0.6180339887498949;
export const SIMPSON_MIN_DEPTH = 3;
export const RICHARDSON = 15;
export const SIMPSON_ROUNDING_ULPS = 4;
