import { useSyncExternalStore } from "react";
import type { SimulationDocsTopic } from "./types";

/**
 * Tiny external store so a simulator that switches tools internally (state, not URL) can publish its
 * active tool and the documentation below the canvas follows, without prop-drilling through the studio.
 */
const active = new Map<SimulationDocsTopic, string>();
const listeners = new Set<() => void>();

export function publishDocsTool(topic: SimulationDocsTopic, tool: string): void {
  if (active.get(topic) === tool) return;
  active.set(topic, tool);
  listeners.forEach((l) => l());
}

export function useActiveDocsTool(topic: SimulationDocsTopic): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active.get(topic),
    () => undefined,
  );
}
