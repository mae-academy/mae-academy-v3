/**
 * Budget guard for the mathcore pipeline (docs/mathcore/BUDGET.json, Section 3 of the setup spec).
 *
 *   tsx scripts/mathcore/budget-guard.ts check <id>            exit 0 = run, 2 = deferred, 1 = config error
 *   tsx scripts/mathcore/budget-guard.ts record <id> <status>  appends the run to usage.json
 *
 * The guard never guesses a percentage: weekly_percent_used and the measured change are entered by the owner.
 * Paths can be overridden with MATHCORE_BUDGET and MATHCORE_USAGE (used by the V2 dry run).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BUDGET_PATH = process.env.MATHCORE_BUDGET ?? "docs/mathcore/BUDGET.json";
const USAGE_PATH = process.env.MATHCORE_USAGE ?? "docs/mathcore/usage.json";
const CALIBRATION_RUNS = 2;

interface Budget {
  usable_percent: number;
  weekly_percent_used: number | null;
  estimate_percent_per_prompt: number | null;
}

interface UsageEntry {
  id: string;
  timestamp: string;
  status: string;
  calibration: boolean;
  weekly_percent_before: number | null;
  /** Filled in by the owner after the run; the measured change is after − before. */
  weekly_percent_after: number | null;
}

type Verdict = { status: "run" | "calibration" | "deferred"; reason: string };

function readUsage(): UsageEntry[] {
  return existsSync(USAGE_PATH) ? (JSON.parse(readFileSync(USAGE_PATH, "utf8")) as UsageEntry[]) : [];
}

export function decide(budget: Budget, usage: UsageEntry[]): Verdict {
  const { weekly_percent_used: used, estimate_percent_per_prompt: estimate, usable_percent: usable } = budget;
  if (typeof usable !== "number" || usable <= 0) return { status: "deferred", reason: "usable_percent is missing or not positive" };
  if (used === null) return { status: "deferred", reason: "weekly_percent_used is null; the owner must enter the current weekly percentage" };
  if (used >= usable) return { status: "deferred", reason: `weekly_percent_used ${used} is at or above usable_percent ${usable}` };
  const pending = usage.find((u) => u.weekly_percent_after === null);
  if (pending) return { status: "deferred", reason: `run ${pending.id} has no weekly_percent_after; the owner must enter it first` };
  if (estimate === null) {
    const done = usage.filter((u) => u.calibration).length;
    if (done < CALIBRATION_RUNS) return { status: "calibration", reason: `estimate_percent_per_prompt is null; calibration run ${done + 1} of ${CALIBRATION_RUNS}` };
    return { status: "deferred", reason: "calibration runs are done but estimate_percent_per_prompt is still null; the owner must set it" };
  }
  if (used + estimate <= usable) return { status: "run", reason: `${used} + ${estimate} <= ${usable}` };
  return { status: "deferred", reason: `${used} + ${estimate} > ${usable}` };
}

function main() {
  const [cmd, id, status] = process.argv.slice(2);
  if (!id || (cmd !== "check" && cmd !== "record") || (cmd === "record" && !status)) {
    console.error("usage: budget-guard.ts check <id> | record <id> <status>");
    process.exit(1);
  }
  if (!existsSync(BUDGET_PATH)) {
    console.log(JSON.stringify({ id, status: "deferred", reason: `${BUDGET_PATH} not found` }));
    process.exit(2);
  }
  const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8")) as Budget;
  const usage = readUsage();

  if (cmd === "check") {
    const verdict = decide(budget, usage);
    console.log(JSON.stringify({ id, ...verdict }));
    process.exit(verdict.status === "deferred" ? 2 : 0);
  }

  usage.push({
    id,
    timestamp: new Date().toISOString(),
    status,
    calibration: budget.estimate_percent_per_prompt === null,
    weekly_percent_before: budget.weekly_percent_used,
    weekly_percent_after: null,
  });
  writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2) + "\n");
  console.log(JSON.stringify({ id, recorded: true, usage: USAGE_PATH }));
}

main();
