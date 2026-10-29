# a-1 measurements: Compute Engine 0.58.0 shape check

- Date: 2026-10-29. Branch `mathcore/a-1`.
- Installed version: `node_modules/@cortex-js/compute-engine/package.json` says `"version": "0.58.0"`, matching the pin in `package.json`. Nothing was installed or upgraded.
- Plan of record: `MAEngine-Plan.md` on `origin/docs/plan-3.1` is byte-identical to `docs/mathcore/PLAN.md` (`diff`, no output).
- **Result: STOPPED.** The option and two shapes differ from the plan (prompt a-1: "If any shape or option differs from the plan, report it and stop").

## Method, and its limit

**Nothing was executed.** In this session, running Node scripts, Vitest (`pnpm run test`) and `scripts/mathcore/gate.sh` each needed approval that was not given. Every result below comes from **reading the 0.58.0 source** in `dist/compute-engine.esm.js` ("ESM", with line numbers) and `dist/types/`. The three blocking findings (A to C) I checked myself in the source. The rest are predictions from reading code paths and are marked "likely". They must be confirmed by running the parser before they count as recorded shapes.

## Blocking findings (differ from the plan)

### A. `canonical: false` does not exist as a parse option (ADR-2)

- Signature: `parse(latex, options?: Partial<ParseLatexOptions> & { form?: FormOption })` (`types/compute-engine/types-engine.d.ts:119-124`).
- `ParseLatexOptions` (`types/compute-engine/latex-syntax/types.d.ts`) has no `canonical` field: 0 occurrences of the word in that file. In TypeScript, `{ canonical: false }` fails the excess-property check.
- `FormOption = 'canonical' | 'structural' | 'raw' | CanonicalForm | CanonicalForm[]` (`types-kernel-serialization.d.ts:146`).
- Runtime (ESM 70954-70979): `const { form, ...parseOpts } = options`. A `canonical` key is passed to the LaTeX parser, which never reads it, and then `formToInternal(form)` with `form` undefined yields canonical. **So `{ canonical: false }` silently returns the default canonical parse**, which is exactly the rewriting ADR-2 is meant to prevent.
- The closest equivalent in 0.58.0 is `{ form: 'raw' }` (or `'structural'`). Caveat: `.json` re-sorts the operands of commutative `Add`/`Multiply` even for raw expressions (ESM 53372-53438), so raw is not fully order-preserving. Example: `1+\cos(\theta)` is predicted to serialize as `["Add",["Cos","theta"],1]`.

### B. `\frac{dy}{dx}` does not produce the `D` head (§5.2 `isHead(lhs, 'D')`)

- `parseFraction` (ESM 13229-13291) emits `["D", fn, ...vars]` only when the numerator is exactly the symbol `d` (`d`, `d_upright` or `differentialD`), as in `\frac{d}{dx} y`. Otherwise it returns `["Divide", numer, denom]` (ESM 13290).
- In `\frac{dy}{dx}`, the numerator parses to `["InvisibleOperator","d","y"]`, so the result is a `Divide`:
  - raw (predicted): `["Equal",["Divide",["InvisibleOperator","d","y"],["InvisibleOperator","d","x"]],["Subtract","x","y"]]`
  - canonical (predicted): `["Equal",["Divide",["Multiply","d","y"],["Multiply","d","x"]],["Add","x",["Negate","y"]]]`
- The plan's ODE1 example (`d1`, §4.1) is therefore **not** recognized by the §5.2 `inferType` as written.

### C. `Matrix` has a third argument (§5.2 matrix branch)

- The `bmatrix` environment (ESM 15334-15348) returns `["Matrix", ["List", ["List", ...], ...], { str: "[]" }]`, plus a fourth column-spec argument when one is given (`\begin{bmatrix}[cc]`). Strings serialize as `"'[]'"`.
  - 2×2 (predicted): `["Matrix",["List",["List","a",1],["List",0,1]],"'[]'"]`
  - 3×3 (predicted): `["Matrix",["List",["List",1,2,3],["List",4,5,6],["List",7,8,9]],"'[]'"]`
- §5.2 reads `n[1].slice(1)`, so the row extraction still works. But `Matrix(List(List...))` in §5.1 does not mention the delimiter argument, and normalization has to decide what to do with it.

### D. Not blocking, but affects §5.2: `\theta` → `"theta"`

`\theta` parses to the symbol `"theta"`, not `"θ"` (ESM 12184). The `RESERVED` set in §5.2 contains `'θ'`, so the Polar case would treat `theta` as a parameter.

## The 20 expression shapes

Not recorded. They depend on which parse option replaces `canonical: false` (finding A), and they must come from an actual run. The predicted raw and canonical shapes for about 20 candidate inputs are in this session's source analysis. I have not copied them here as "recorded" because they were not executed.

## Not done in this step (stopped before)

- `shared/mathcore/ir/` (Graph IR schema and `schema.test.ts`): not written.
- `shared/mathcore/normalize/mathjsonShapes.test.ts`: not written.
- `scripts/mathcore/oracle/` (golden generator and mpmath venv notes): not written.
- Required tests and `gate.sh`: not run (no approval to execute).
- D1 device benchmarks and chunk sizes (Phase 0 item 5): **not measured**, as the prompt requires.

Questions for the owner: `docs/mathcore/reports/a-1-questions.md`.
