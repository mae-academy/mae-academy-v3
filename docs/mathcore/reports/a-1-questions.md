# a-1: questions for the owner (step stopped)

Evidence for Q1 to Q4 is in `docs/mathcore/reports/a-1-measurements.md`.

## Blocking: Compute Engine 0.58.0 differs from the plan

1. **ADR-2 parse option.** 0.58.0 has no `canonical: false`. Passing it is silently ignored and gives a canonical parse. Should normalization use `{ form: 'raw' }`, `{ form: 'structural' }`, or a `CanonicalForm[]` subset? Note that `.json` still re-sorts `Add`/`Multiply` operands in raw mode.
2. **ODE head.** `\frac{dy}{dx}` parses to `Divide(InvisibleOperator(d,y), InvisibleOperator(d,x))`, not `D`. Only `\frac{d}{dx} y` gives `D`. Which should hold:
   - (a) `normalize/` rewrites the Leibniz `Divide` form to `D`;
   - (b) `inferType` also matches the `Divide` form;
   - (c) the canonical input form becomes `\frac{d}{dx}y`?
3. **Matrix delimiter argument.** `bmatrix` gives `["Matrix", rows, "'[]'"]` (plus a column spec if one is written). Should normalization strip it or keep it?
4. **`theta` vs `θ`.** The parser emits `"theta"`. Should `RESERVED` (§5.2) use `theta`, or should normalization map it to `θ`?

## Graph IR schema (§4): points the plan leaves open

5. **`kind` values.** The §4.1 example uses `"Matrix"`, the §5.1 table uses `Matrix2`/`Matrix3`, and `inferType` returns `{k:'Matrix', n}`. Which strings are valid in the IR? Is `kind` required? What happens when it disagrees with `inferType`?
6. **Enumerations shown by one example only.**
   - `viewport.aspect`: only `"equal"` is shown.
   - `view.mode`: only `"2d"` is shown; `"3d"` is deferred by D3.
   - `view.locale`: is it `ar | en | es` (§1)?
7. **`style`.**
   - Is the color a `#RRGGBB` string as in the example, or a token name (theme rule)?
   - What are the allowed keys (`color`, `width`, `fill`, anything else) and the range for `width`?
   - Should unknown keys be rejected or stripped?
8. **Unknown-key policy for the whole document** (link decoding and MAE AI output): reject, or strip?
9. **Required vs optional:** `params`, `view`, `style`, `animate`.
10. **Param rules and defaults.**
    - Must `min < max`, must `value` lie in `[min, max]`, and must `step` be > 0?
    - Must `animate.from`/`to` lie within the range?
    - What is the name syntax?
    - What default values does an auto-created parameter get (§4.2 says "default values" but gives none)?
11. **`id`:** is there an allowed character set beyond length ≤ 32?
12. **Scope of "IR validated" at a-1.** Node count ≤ 5000 and cycle rejection need parsed MathJSON and the DAG (Phase 2), and the 8 KB link limit belongs to the codec. Should the a-1 schema enforce only the structural rules?

## Golden corpus generator (§9)

13. **The 300 expressions.**
    - Who defines them, and how are they split across types?
    - Exclude complex (D2) and 3D (D3)?
    - How many sample points per expression, and how are they chosen?
14. **Input form for mpmath.** Should the generator read LaTeX → MathJSON (from Compute Engine, a JS step) and evaluate that in Python, or hold expressions in a Python-native form?
15. **Output.**
    - File format and names under `shared/mathcore/__golden__/`?
    - How are domain errors (NaN or ±∞) represented?
    - Should the mpmath version be pinned in a `requirements.txt` next to the generator?

## Environment and exit criteria

16. **Execution approval.** This run could not execute `node`, `pnpm run test` or `scripts/mathcore/gate.sh`, so it could not confirm any shape or meet "every required test passes and gate.sh passes". Please allow these commands for the re-run.
17. **Phase 0 exit criterion.** "Budgets adjusted by measurement" cannot be met at a-1 while item 5 (D1 measurements) is out of scope. Confirm that it stays open until item 5.
