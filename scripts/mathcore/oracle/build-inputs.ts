/**
 * Step 1 of the golden pipeline: LaTeX → normalized MathJSON with the pinned Compute Engine (Q14).
 *
 *   pnpm exec tsx scripts/mathcore/oracle/build-inputs.ts > /tmp/mathcore-inputs.json
 *
 * The output feeds generate.py, which evaluates each expression with mpmath at 50 digits.
 */
import { ComputeEngine } from "@cortex-js/compute-engine";
import { readFileSync } from "node:fs";
import { parseLatex } from "../../../shared/mathcore/parse/parse";
import { buildCorpus } from "./corpus";

const ce = new ComputeEngine();
// The pinned version from package.json (the package does not export its own package.json).
const ceVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> }).dependencies[
  "@cortex-js/compute-engine"
];
const parser = (latex: string): unknown => ce.parse(latex, { form: "raw" }).json;

const entries = buildCorpus().map((e) => {
  const r = parseLatex(e.latex, parser);
  if (!r.ok) throw new Error(`${e.id} ${e.latex}: ${r.errors.map((x) => x.message).join("; ")}`);
  return { id: e.id, latex: e.latex, mathjson: r.expr, points: e.points };
});

process.stdout.write(JSON.stringify({ computeEngine: ceVersion, entries }, null, 1) + "\n");
