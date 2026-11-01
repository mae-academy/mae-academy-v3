/**
 * Runs the mathcore benchmarks in Node (STEPS.md §7.2). One thread, no browser. On the D1 laptop run it there; browser
 * numbers come from `bench-browser.cjs`. Node numbers on a cloud machine are reference figures, not D1 measurements.
 *
 *   pnpm exec tsx scripts/mathcore/bench.ts > bench-node.json      # JSON on stdout, the table on stderr
 *
 * The JSON has the fields listed in docs/mathcore/reports/device-results-template.md.
 */
import { execSync } from "node:child_process";
import os from "node:os";
import { runBenchmarks } from "../../shared/mathcore/bench/benchmarks";

const results = runBenchmarks();

for (const r of results) {
  const value = r.unit === "ms" ? `${r.median.toFixed(3)} ms (max ${r.max.toFixed(3)})` : `${Math.round(r.median).toLocaleString("en")} samples/s`;
  const target = r.unit === "ms" ? `≤ ${r.target} ms` : `≥ ${r.target.toLocaleString("en")} samples/s`;
  console.error(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(24)} ${value.padStart(30)}   target ${target}   (${r.budgetCase})`);
}

const git = (cmd: string): string | null => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
};
const cpus = os.cpus();
const summary = {
  schema: 1,
  kind: "node",
  date: new Date().toISOString(),
  commit: git("git rev-parse HEAD"),
  device: {
    os: `${os.type()} ${os.release()}`,
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? null,
    logicalCores: cpus.length,
    memoryGB: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
  },
  runtime: { node: process.version },
  cases: results.map((r) => ({
    id: r.id,
    description: r.budgetCase,
    unit: r.unit,
    comparator: r.unit === "ms" ? "<=" : ">=",
    budget: r.target,
    median: r.median,
    max: r.max,
    runs: r.runs,
    pass: r.pass,
  })),
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
};
console.log(JSON.stringify(summary, null, 2));
