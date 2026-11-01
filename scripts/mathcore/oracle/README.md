# Mathcore oracle (offline only, ADR-5)

Generates the golden files in `shared/mathcore/__golden__/`. Never runs in the app.

## Python environment (mpmath, SymPy, SciPy; never in package.json)

```bash
python3 -m venv ~/.venvs/mathcore-oracle  # outside the repository
~/.venvs/mathcore-oracle/bin/pip install -r scripts/mathcore/oracle/requirements.txt
```

## Regenerate (from the repository root)

```bash
pnpm exec tsx scripts/mathcore/oracle/build-inputs.ts > /tmp/mathcore-inputs.json
pnpm exec tsx scripts/mathcore/oracle/fuzz.ts 500 > /tmp/mathcore-fuzz500.json
(cd scripts/mathcore/oracle && ~/.venvs/mathcore-oracle/bin/python generate.py /tmp/mathcore-inputs.json) > shared/mathcore/__golden__/eval.json
(cd scripts/mathcore/oracle && ~/.venvs/mathcore-oracle/bin/python generate_fuzz.py /tmp/mathcore-fuzz500.json) > shared/mathcore/__golden__/fuzz.json
(cd scripts/mathcore/oracle && ~/.venvs/mathcore-oracle/bin/python generate_algorithms.py) > shared/mathcore/__golden__/algorithms.json
```

## Offline differential fuzzing (10,000 expressions)

```bash
pnpm exec tsx scripts/mathcore/oracle/fuzz.ts 10000 > /tmp/mathcore-fuzz10k.json
(cd scripts/mathcore/oracle && ~/.venvs/mathcore-oracle/bin/python generate_fuzz.py /tmp/mathcore-fuzz10k.json) > /tmp/mathcore-fuzz10k-golden.json
pnpm exec tsx scripts/mathcore/oracle/check-fuzz.ts /tmp/mathcore-fuzz10k-golden.json
```

`evaluate.py` mirrors the real-number semantics of `shared/mathcore/compile/compile.ts`; change both together.
