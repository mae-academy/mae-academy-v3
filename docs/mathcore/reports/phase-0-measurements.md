# Phase 0 measurements (2026-10-30)

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
- Output: `shared/mathcore/__golden__/eval.json`: 300 expressions, 2400 sample points (2394 finite, 6 domain errors),
  mpmath at 50 digits, stored to 25 significant digits.
- Points with condition number |x·f′/f| > 10⁴ or value 0 are excluded by the generator (none were excluded in this corpus).
- Engine vs mpmath: **max relative error 4.8 × 10⁻¹⁴** (`\cos(e^{-x})` at x = −0.45); tolerance 10⁻¹². Test: `golden.test.ts`.

## Item 5. D1 device benchmarks — not measured

The benchmark harness (`shared/mathcore/bench/`) runs in Vitest and in the browser. Budgets in STEPS.md §7.2 stay
hypotheses until the owner runs it on the MacBook Pro (Mid 2014) and the simulated phone (4× CPU throttle).

## Item 6. D0

Recorded in STEPS.md §1: build the core, Desmos API only as a fallback.

## Exit criterion

- IR validated: **met** (schema and tests).
- Budgets adjusted by measurement: **open** until item 5 (Q17).
