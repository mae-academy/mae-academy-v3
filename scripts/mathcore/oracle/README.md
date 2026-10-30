# Mathcore oracle (offline only, ADR-5)

Generates the golden files in `shared/mathcore/__golden__/`. Never runs in the app.

## Python environment (mpmath, SymPy, SciPy; never in package.json)

```bash
python3 -m venv ~/.venvs/mathcore-oracle  # outside the repository
~/.venvs/mathcore-oracle/bin/pip install -r scripts/mathcore/oracle/requirements.txt
```

## Regenerate

```bash
pnpm exec tsx scripts/mathcore/oracle/build-inputs.ts > /tmp/mathcore-inputs.json
cd scripts/mathcore/oracle && ~/.venvs/mathcore-oracle/bin/python generate.py /tmp/mathcore-inputs.json > ../../../shared/mathcore/__golden__/eval.json
cd scripts/mathcore/oracle && ~/.venvs/mathcore-oracle/bin/python generate_algorithms.py > ../../../shared/mathcore/__golden__/algorithms.json
```

`evaluate.py` mirrors the real-number semantics of `shared/mathcore/compile/compile.ts`; change both together.
