import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// pythonEngine dynamically imports Pyodide's loader from a full CDN URL — the right thing for a
// browser/Worker, but Node's ESM loader refuses to `import()` an https: specifier at all. Redirect
// the entry-point import to the locally installed "pyodide" package, and override the `indexURL`
// pythonEngine.ts passes with that package's own directory — Vite's SSR transform breaks
// pyodide.mjs's own import.meta.url-based asset resolution, so the correct path has to be
// supplied explicitly. Node's pyodide build appends the asset filename to indexURL as a plain
// string for fs.readFile (not `new URL()`), so this must be a bare path, not a file:// URL. This
// still runs the real Pyodide/CPython runtime, just reading its assets from disk instead of a CDN.
const require = createRequire(import.meta.url);
const pyodidePackageDir = path.dirname(require.resolve("pyodide/package.json"));
const PYODIDE_LOCAL_INDEX_URL = `${pyodidePackageDir}/`;

vi.mock(
  "https://cdn.jsdelivr.net/pyodide/v0.27.8/full/pyodide.mjs",
  async () => {
    const pyodideModule = await import("pyodide");
    return {
      loadPyodide: (options?: Record<string, unknown>) =>
        pyodideModule.loadPyodide({
          ...options,
          indexURL: PYODIDE_LOCAL_INDEX_URL,
        }),
    };
  }
);

const { run } = await import("@/features/execution-engine/pythonEngine");

// Pyodide is fetched from the jsdelivr CDN on first use; give it real network time.
const PYODIDE_TIMEOUT_MS = 60_000;

describe("pythonEngine.run", () => {
  it(
    "traces a function call, tracks the call stack, and captures stdout",
    async () => {
      const result = await run(`
def add(a, b):
    result = a + b
    return result

x = 3
y = 4
z = add(x, y)
print(z)
`);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps.at(-1)?.stdout).toBe("7\n");

      const callStep = result.steps.find(step =>
        step.callStack.includes("add")
      );
      expect(callStep).toBeDefined();
      expect(callStep?.variables.a?.value).toBe(3);
      expect(callStep?.variables.b?.value).toBe(4);

      const afterReturn = result.steps.at(-1);
      expect(afterReturn?.callStack).toEqual(["<module>"]);
      expect(afterReturn?.variables.z?.value).toBe(7);
    },
    PYODIDE_TIMEOUT_MS
  );

  it(
    "reports a Python exception as a failed result instead of throwing",
    async () => {
      const result = await run("1 / 0\n");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ZeroDivisionError/);
    },
    PYODIDE_TIMEOUT_MS
  );

  it(
    "halts a genuine infinite loop via the settrace step cap instead of hanging the test",
    async () => {
      const result = await run("while True:\n    pass\n", { maxSteps: 200 });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/possible infinite loop/i);
      expect(result.steps).toHaveLength(200);
    },
    PYODIDE_TIMEOUT_MS
  );

  it(
    "does not leak dunder names (__name__, __builtins__) into traced variables",
    async () => {
      const result = await run("x = 1\n");
      const lastStep = result.steps.at(-1);
      expect(Object.keys(lastStep?.variables ?? {})).toEqual(["x"]);
    },
    PYODIDE_TIMEOUT_MS
  );

  it(
    "does not leak variables between independent run() calls",
    async () => {
      await run("leftover = 123\n");
      const result = await run("print('clean')\n");
      expect(result.steps.at(-1)?.variables.leftover).toBeUndefined();
    },
    PYODIDE_TIMEOUT_MS
  );
});
