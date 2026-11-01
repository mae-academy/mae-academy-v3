import { describe, expect, it } from "vitest";
import { WarmupPlan } from "./warmup";

describe("idle warm-up plan", () => {
  it("allows the given number of passes and then stops", () => {
    const plan = new WarmupPlan(3, 1000);
    let runs = 0;
    while (plan.mayRun(0)) {
      plan.record(10);
      runs++;
    }
    expect(runs).toBe(3);
    expect(plan.done).toBe(true);
  });

  it("stops once the passes have used the time budget", () => {
    const plan = new WarmupPlan(8, 100);
    let runs = 0;
    while (plan.mayRun(0)) {
      plan.record(40);
      runs++;
    }
    expect(runs).toBe(3); // 40 + 40 + 40 ≥ 100
    expect(plan.done).toBe(true);
  });

  it("never starts a pass while a request is waiting, and waits for a quiet moment", () => {
    const plan = new WarmupPlan(2, 1000);
    expect(plan.mayRun(1)).toBe(false);
    expect(plan.mayRun(0)).toBe(true);
    expect(plan.done).toBe(false);
  });

  it("a failed pass ends the warm-up", () => {
    const plan = new WarmupPlan(8, 1000);
    plan.record(5, false);
    expect(plan.mayRun(0)).toBe(false);
    expect(plan.done).toBe(true);
  });
});
