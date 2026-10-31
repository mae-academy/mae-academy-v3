# Review of owner decisions Q1–Q17 (evidence, not confirmation)

Source: `owner-decisions-2026-10-30.md`. The "answer chosen" column is the decision as the executor applied it. Each row
names the implementing file and line, the covering test and whether the answer conflicts with the plan
(`docs/mathcore/STEPS.md`). Lines are those at commit `856420e`. The last column is for the owner; nothing here is
confirmed.

| Q | Question | Answer chosen | Implemented at | Covering test | Conflict with the plan? | Owner confirmed (yes/no) |
|---|---|---|---|---|---|---|
| Q1 | Parse option (ADR-2) | `ce.parse(latex, { form: "raw" })`, then own normalizer | `shared/mathcore/parse/parse.ts:12`, `client/.../workers/mathcore-parse-worker.ts:19`, `normalize/normalize.ts:2` | `normalize/mathjsonShapes.test.ts:20` ("ADR-2 parse option", raw vs `canonical: false`) | No: ADR-2 intent (no canonicalization) kept; the exact option differs from "`canonical: false`" as the plan's wording suggests | |
| Q2 | ODE head | Leibniz, `y'` and `D(Equal(y,F),x)` all normalized to `Equal(["D",y,x],F)` | `normalize/normalize.ts:9` (doc), `:296-308` (first and second order), `:159-161` (`Prime`, `D`) | `normalize/normalize.test.ts:35` (second order, `f'(x)`); `infer/inferType.test.ts:20-26,100` (first order ODE1) | No | |
| Q3 | Matrix delimiter | Delimiter and column spec dropped; core form `["Matrix",["List",...]]` | `normalize/normalize.ts:10,163,351-355` | `engine/graphEngine.test.ts:139-148` (bmatrix). No test for other delimiters (pmatrix, vmatrix) | No | |
| Q4 | theta | Keep ASCII `theta`; reserved `x, y, z, t, r, theta` | `constants.ts:29-30` | `engine/graphEngine.test.ts:74` (`\theta` in a polar curve); `ir/schema.test.ts:95-99` (reserved names) | Representation differs: plan line 144 writes the reserved symbol as `θ`; the code stores it as `theta` | |
| Q5 | `kind` | Optional; inference wins; warning when they disagree | `ir/schema.ts:138-149`, `engine/graphEngine.ts:276` | `ir/schema.test.ts:153` (unknown kinds); `engine/graphEngine.test.ts:70` (warning "Explicit is used") | No (plan example `kind: "Matrix"`, §6.1 lists Matrix2/Matrix3; the alias covers both) | |
| Q6 | Enums | `aspect` equal\|free; `mode` 2d; locale ar\|en\|es | `ir/schema.ts:56-57,160-168` | `ir/schema.test.ts:124` | **Decision text is out of date:** it says `3d` is rejected while D3 is deferred. The code accepts `3d` since D3 was lifted for Phase 5 (owner instruction 2026-10-30, `decisions-log.md`). The plan example uses `"mode": "2d"` (STEPS.md:92) | |
| Q7 | style | Keys color, width, fill, hidden, dash; width in (0,10]; color `#RRGGBB` or token | `ir/schema.ts:23,104-125`, `constants.ts:86` | `ir/schema.test.ts:114` | No: plan example uses `"fill": false` (boolean) and `#FF0000` (STEPS.md:87-88). Token resolution is at render time (`render/renderer.ts`) | |
| Q8 | Unknown keys | Rejected with the path | `ir/schema.ts:36-38` | `ir/schema.test.ts:103` | No | |
| Q9 | Required fields | `version`, `viewport`, `items` required; `params`, `view`, `style` optional with defaults | `ir/schema.ts:188` (document), `:138` (item) | `ir/schema.test.ts:31` | No | |
| Q10 | Params | `min<max`, `min≤value≤max`, `step>0`, animate within range, `period_s` in [0.5, 60]; name rule; defaults 1/−10/10/0.1 | `ir/schema.ts:22,63-98`, `constants.ts:16,33` | `ir/schema.test.ts:73,86,95` | No (STEPS.md does not fix the default range; "Desmos-like" is the executor's reading) | |
| Q11 | id | `[A-Za-z0-9_-]{1,32}` | `ir/schema.ts:20,140-141` | `ir/schema.test.ts:46` | No | |
| Q12 | Scope | Structure in the schema; node count, cycles, link size in `parse`, `dag`, `codec` | `parse/parse.ts:52`, `graph/dag.ts:18-20`, `ir/codec.ts:17,24`, `constants.ts:8,19` | `normalize/normalize.test.ts:60`; `graph/dag.test.ts:16,40`; `ir/codec.test.ts:19` | No: matches STEPS.md:103,105,237 (2000 characters, 5000 nodes, about 8 KB link) | |
| Q13 | Corpus | 300 templated real-valued expressions, 8 points each | `scripts/mathcore/oracle/corpus.ts`, `build-inputs.ts` | `golden.test.ts:19` (300 expressions) | No | |
| Q14 | Oracle input | LaTeX plus normalized MathJSON; mpmath evaluates the MathJSON | `scripts/mathcore/oracle/evaluate.py`, `generate.py` | `golden.test.ts:24` (within 1e-12 of mpmath at every sample) | No | |
| Q15 | Output | `shared/mathcore/__golden__/*.json`, 25-digit strings, domain errors `null`, pinned `requirements.txt` | `scripts/mathcore/oracle/generate.py`, `requirements.txt`; files `eval.json`, `algorithms.json`, `fuzz.json` | `golden.test.ts`, `fuzz.test.ts`, `linalg/linalgGolden.test.ts`; gate step 5 keeps the files unchanged | No. Note: the plan's eigenvalue criterion (1e-9 per value) is stricter than what `linalgGolden.test.ts` checked before this round (see Item 2) | |
| Q16 | Execution | `node`, `pnpm`, `vitest`, `gate.sh` allowed | `scripts/mathcore/gate.sh` | the gate itself | No | |
| Q17 | Exit | "Budgets adjusted by measurement" stays open until Phase 0 item 5 runs on the D1 laptop | `scripts/mathcore/bench.ts`, `bench-browser.cjs`; `docs/mathcore/reports/device-results-template.md` | none (needs owner hardware) | Open by design: the D1 numbers do not exist yet | |
