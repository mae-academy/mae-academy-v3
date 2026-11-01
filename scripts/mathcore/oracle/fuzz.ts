/**
 * Differential fuzzing inputs (STEPS.md §10): random expression trees in the engine's core form, fixed seed.
 *
 *   pnpm exec tsx scripts/mathcore/oracle/fuzz.ts 10000 > /tmp/fuzz-inputs.json   (offline run)
 *   pnpm exec tsx scripts/mathcore/oracle/fuzz.ts 500   > /tmp/fuzz-subset.json   (the Vitest subset)
 *
 * generate_fuzz.py evaluates them with mpmath and keeps only points where double precision can be meaningful.
 */
import type { Expr } from "../../../shared/mathcore/ast/expr";

/** The seed is fixed so the subset in the repository is reproducible. */
const SEED = 20261030;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNARY = ["Sin", "Cos", "Tan", "Exp", "Ln", "Sqrt", "Abs", "Arctan", "Sinh", "Cosh", "Tanh", "Erf", "Arcsin", "Negate", "Floor", "Gamma"];
const BINARY = ["Add", "Subtract", "Multiply", "Divide", "Power", "Max", "Min", "Mod"];

export function generate(n: number): Array<{ id: string; mathjson: Expr; points: number[] }> {
  const rnd = mulberry32(SEED);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const constant = (): Expr => {
    const r = rnd();
    if (r < 0.4) return 1 + Math.floor(rnd() * 5);
    if (r < 0.8) return Math.round((rnd() * 6 - 3) * 100) / 100 || 0.5;
    return pick(["Pi", "ExponentialE"]);
  };
  const tree = (depth: number): Expr => {
    if (depth === 0 || rnd() < 0.2) return rnd() < 0.65 ? "x" : constant();
    if (rnd() < 0.45) return [pick(UNARY), tree(depth - 1)];
    const op = pick(BINARY);
    if (op === "Power") {
      // Small integer or odd-denominator fraction exponents, as users write them.
      const exps: Expr[] = [2, 3, -1, -2, ["Divide", 1, 3], ["Divide", 2, 3], ["Divide", ["Negate", 1], 3], 0.5];
      return ["Power", tree(depth - 1), pick(exps)];
    }
    return [op, tree(depth - 1), tree(depth - 1)];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const points = Array.from({ length: 3 }, () => Math.round((rnd() * 6 - 3) * 1000) / 1000);
    out.push({ id: `z${String(i + 1).padStart(5, "0")}`, mathjson: tree(4), points });
  }
  return out;
}

const n = Number(process.argv[2] ?? 500);
process.stdout.write(JSON.stringify({ seed: SEED, entries: generate(n) }) + "\n");
