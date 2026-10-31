/**
 * Idle warm-up plan of the engine Worker: after a document with implicit items loads, a few silent drag-quality passes
 * run while the Worker has nothing else to do, so the first real drag does not pay for JIT compilation. The plan only
 * decides whether another pass may start; the Worker runs it (and always serves queued requests first).
 */
export class WarmupPlan {
  private left: number;
  private spent = 0;

  constructor(
    passes: number,
    private readonly budgetMs: number,
  ) {
    this.left = passes;
  }

  /** Another pass may start: passes remain, the time budget is not used up, and no request is waiting. */
  mayRun(pendingRequests: number): boolean {
    return this.left > 0 && this.spent < this.budgetMs && pendingRequests === 0;
  }

  /** A pass took `ms`; a failed pass ends the warm-up (`ok` false). */
  record(ms: number, ok = true): void {
    this.left = ok ? this.left - 1 : 0;
    this.spent += ms;
  }

  get done(): boolean {
    return this.left <= 0 || this.spent >= this.budgetMs;
  }
}
