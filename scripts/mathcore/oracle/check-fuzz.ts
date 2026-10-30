/**
 * Offline differential fuzzing run (STEPS.md §10): compares the engine with an mpmath fuzz file.
 *
 *   pnpm exec tsx scripts/mathcore/oracle/check-fuzz.ts /tmp/fuzz10k-golden.json
 */
import { readFileSync } from "node:fs";
import type { OracleEntry } from "../../../shared/mathcore/oracleCompare";
import { compareWithOracle } from "../../../shared/mathcore/oracleCompare";

const data = JSON.parse(readFileSync(process.argv[2], "utf8")) as { expressions: number; tolerance: number; entries: OracleEntry[] };
const failures = compareWithOracle(data.entries, data.tolerance);
const samples = data.entries.reduce((n, e) => n + e.samples.length, 0);
console.log(`fuzz: ${data.expressions} expressions, ${samples} samples, ${failures.length} failure(s)`);
for (const f of failures.slice(0, 50)) console.log("  " + f);
process.exit(failures.length === 0 ? 0 : 1);
