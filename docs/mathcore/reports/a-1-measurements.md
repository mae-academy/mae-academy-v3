# a-1 measurements: Phase 0 (2026-10-30)

Everything below was obtained by running code in the cloud session (Node 22.22.0, Linux), not by reading source.
Device measurements on the D1 laptop (Phase 0 item 5) are **not measured**: they need the owner's hardware.

## Item 1. Compute Engine 0.58.0

- `package.json` pins `"@cortex-js/compute-engine": "0.58.0"` (exact). `mathjsonShapes.test.ts` fails if the pin changes.
- **ADR-2 option.** `canonical: false` exists but is a partial canonicalization in 0.58.0: `x - y` → `["Add","x",["Negate","y"]]`,
  `1+\cos\theta` → operands reordered, `x^{1/3}` → `["Root","x",3]`. It is therefore not the "no rewrite" parse ADR-2 assumed.
  `{ form: "raw" }` keeps the input exactly as typed. Decision Q1: parse with `form: "raw"`; the engine's own
  normalization (`shared/mathcore/normalize/`) produces the core form. ADR-2's intent is kept.
- **Matrix.** `bmatrix` → `["Matrix", ["List", rows…], "'[]'"]`; with a column spec a fourth argument `"'=='"`;
  `pmatrix` has no delimiter argument. 2×2 and 3×3 confirmed. Normalized to `["Matrix", ["List", rows…]]` (Q3).
- **D head.** `\frac{dy}{dx}` → `Divide(InvisibleOperator(d,y), InvisibleOperator(d,x))`, not `D`. `\frac{d}{dx}y = F` →
  `D(Equal(y, F), x)`. `y'` → `Prime(y)`. `\dot{x}` → `D(x, t)`. All normalized to `Equal(["D", y, x], F)` (Q2).
- **theta.** The parser emits `"theta"`; `RESERVED_SYMBOLS` uses it (Q4).

## Item 2. Shapes of 20 expressions

Recorded in `shared/mathcore/normalize/mathjsonShapes.test.ts` (LaTeX → raw MathJSON → core form), executed
against 0.58.0 on every test run. A Compute Engine upgrade that changes any shape fails there first.

## Item 3. Graph IR

Spec: `docs/mathcore/specs/graph-ir.md`. Validator: `shared/mathcore/ir/schema.ts`; tests: `ir/schema.test.ts`
(the STEPS.md §5.1 example validates; every §5.2 rule has a test).

## Item 4. Golden corpus

- Generator: `scripts/mathcore/oracle/` (`corpus.ts` → `build-inputs.ts` → `generate.py`; Python environment in
  `requirements.txt`, steps in `README.md`).
- Output: `shared/mathcore/__golden__/eval.json`: 300 expressions, 2400 sample points (all finite), mpmath at 50 digits,
  stored to 25 significant digits. Test: `golden.test.ts` (tolerance 10⁻¹², relative).
- Points with condition number |x·f′/f| > 10⁴ or value 0 are excluded by the generator (none were excluded in this corpus).
- Semantics shared by engine and oracle: IEEE-754 extended reals (±∞ propagate, NaN outside the real domain), real odd
  roots for literal fractional exponents (`x^{-1/3}` at x = −8 is −0.5).
- Reviewer fix (2026-10-30): the first corpus stored `x^{-1/3}` and `x^{-5/3}` at negative x as domain errors because
  both evaluators missed Compute Engine's `Divide(Negate(1), 3)` form. Fixed in both; the corpus was regenerated.

## Differential fuzzing (STEPS.md §10)

- `scripts/mathcore/oracle/fuzz.ts` (seed 20261030) → `generate_fuzz.py` (mpmath 50 digits; a point is kept only where an
  ideal float64 evaluator, mpmath at 53 bits, agrees within 10⁻¹⁴ and the value does not hinge on the sign of a zero).
- Offline run, 10,000 expressions: 28,172 judged points (4,353 domain errors), **0 failures**
  (`pnpm exec tsx scripts/mathcore/oracle/check-fuzz.ts …`).
- Fixed-seed subset in Vitest: `__golden__/fuzz.json`, 500 expressions, 1,406 points, `fuzz.test.ts`, 0 failures.

## Special functions

`__golden__/algorithms.json` (mpmath): Γ, ln Γ, erf, erfc, Iₓ(a, b), P(a, x), Q(a, x); `stats/special.test.ts`, all within 10⁻¹².

## Item 5. D1 device benchmarks — not measured

Harness: `shared/mathcore/bench/benchmarks.ts`, run in Node with `pnpm exec tsx scripts/mathcore/bench.ts` and in the
browser from the mathcore page. Budgets in STEPS.md §7.2 stay hypotheses until the owner runs it on the MacBook Pro
(Mid 2014) and the simulated phone (4× CPU throttle).

Reference figures from the cloud machine (Node 22, not D1):

| Case | Median | §7.2 target |
|---|---|---|
| Slider drag, 3 curves × 2000 samples | 0.42 ms | ≤ 2 ms |
| Update one curve (adaptive sampling) | 0.17 ms | ≤ 4 ms |
| Closure evaluations per second | 24 million | reference |

## Item 6. D0

Recorded in STEPS.md §1: build the core, Desmos API only as a fallback.

## Exit criterion

- IR validated: **met** (schema and tests).
- Budgets adjusted by measurement: **open** until item 5 (Q17).
