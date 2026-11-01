/**
 * Which queued engine requests a later one makes pointless (the engine Worker runs requests one at a time, in order):
 * a newer `load` replaces everything; a newer `view` replaces an older `view`; a newer `param` for the same slider
 * replaces the older one. Traces and benchmarks are never skipped.
 */
import type { EngineRequest } from "./protocol";

export function superseded(req: EngineRequest, later: readonly EngineRequest[]): boolean {
  return later.some((l) => {
    if (l.type === "load") return req.type === "load" || req.type === "view" || req.type === "param";
    if (l.type === "view") return req.type === "view";
    if (l.type === "param") return req.type === "param" && req.name === l.name;
    return false;
  });
}
