# Owner decisions, 2026-10-30

The owner gave blanket approval (2026-10-30, in session) to build the whole Math Core engine in the cloud session,
on `automation/setup`, touching nothing outside the mathcore paths, with every step checked by the reviewers.
Where `a-1-questions.md` asked for a decision, the executor applied the recommendation below under that approval.
Each one is verified by running Compute Engine 0.58.0 (see `phase-0-measurements.md`), not by reading its source.

| Q | Decision | Reason |
|---|---|---|
| Q1 parse option | Parse with `{ form: "raw" }`, then `shared/mathcore/normalize/` produces the engine's own core form | `raw` keeps the input exactly as typed (operand order, `Subtract`, `InvisibleOperator`). `canonical: false` in 0.58.0 is a partial canonicalization (`Subtract` → `Add`/`Negate`, `x^{1/3}` → `Root`), so it is not the "no rewrite" ADR-2 assumes. ADR-2's intent (no canonicalization + internal normalization) is kept. |
| Q2 ODE head | (a) `normalize/` rewrites Leibniz `Divide(InvisibleOperator(d,y), InvisibleOperator(d,x))`, `Prime(y)`, and `D(Equal(y, F), x)` to `Equal(["D", y, x], F)` | One canonical ODE form for `inferType`, whatever the user typed |
| Q3 Matrix delimiter | Strip the delimiter argument and any column spec; core form is `["Matrix", ["List", rows...]]` | Delimiters are presentation only |
| Q4 theta | Keep Compute Engine's ASCII name `theta`; `RESERVED = x, y, z, t, r, theta` | No mapping layer; display uses LaTeX |
| Q5 kind | `kind` is optional. Allowed: every type name in STEPS.md §6.1 plus `Matrix` (alias of the size-specific type). When present and it disagrees with `inferType`, `inferType` wins and a warning is reported | The engine never trusts a stored label over the parsed expression |
| Q6 enums | `aspect`: `equal` \| `free`; `mode`: `2d` (`3d` rejected while D3 is deferred); `locale`: `ar` \| `en` \| `es` | Plan §1 and D3 |
| Q7 style | Keys: `color`, `width`, `fill`, `hidden`, `dash`. `color` is `#RRGGBB` or a design-token name (resolved against `client/src/index.css` at render time). `width` in (0, 10]. Unknown keys rejected | Strict schema; tokens keep the theme rule |
| Q8 unknown keys | Reject, with the path of the first unknown key | MAE AI output and links must be exact |
| Q9 required | `version`, `viewport`, `items` required; `params` and `view` optional with defaults; item `style` optional | Smallest valid document is still useful |
| Q10 params | `min < max`, `min ≤ value ≤ max`, `step > 0`, `animate.from/to` within `[min, max]`, `period_s` in [0.5, 60]. Name: a single letter or a letter followed by subscript `_[A-Za-z0-9]+`, not reserved. Auto-created default: `value 1, min -10, max 10, step 0.1` | Desmos-like defaults |
| Q11 id | `[A-Za-z0-9_-]{1,32}` | Link-safe |
| Q12 scope | The schema enforces structure; node count, cycles and link size are checked by `parse`, `dag` and `codec` and tested there | Each rule lives where its data exists |
| Q13 corpus | 300 expressions generated from fixed templates over the Phase 1 function set, real-valued only (no D2/D3), 8 points each, chosen inside the domain | Reproducible |
| Q14 oracle input | The corpus stores LaTeX and the normalized MathJSON; mpmath evaluates the MathJSON | One input, two independent evaluators |
| Q15 output | `shared/mathcore/__golden__/*.json`, values as 25-significant-digit strings, domain errors as `null`; `requirements.txt` pins mpmath, SymPy, SciPy, NumPy | Exact and reviewable |
| Q16 execution | Allowed: `node`, `pnpm`, `vitest`, `gate.sh` | Needed to verify by execution |
| Q17 exit | "Budgets adjusted by measurement" stays open until Phase 0 item 5 runs on the D1 laptop; Phase 0 benchmarks are written and runnable | Owner hardware is needed |

## Pipeline

- Approved: `run-prompt.sh` records a non-zero executor exit, or missing required tests, as `deferred`, never `passed`.
- Approved: the `a-1` usage entry on `mathcore/a-1` is not a calibration run; usage is persisted on `automation/setup`.
- Not done: deleting `mathcore/a-1` (the standing rule needs the exact branch named). It is superseded by this work.
