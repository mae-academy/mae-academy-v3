import type { CircuitComponent } from './circuitTypes';

export interface CoilConflictEntry {
  /** Shared coil label (e.g. "K1") */
  name: string;
  /** Number of coil components sharing that label */
  count: number;
  /** ID of the first definition — the one that is treated as the source of truth */
  primaryId: string;
  /** Human-readable resolution message */
  resolution: string;
}

export interface CoilConflictReport {
  hasConflicts: boolean;
  conflicts: CoilConflictEntry[];
}

/**
 * Pre-execution coil conflict validator.
 *
 * Groups all `coil` components by their label.  Any label shared by more than
 * one component is a conflict.  The first component found (circuit order) is
 * designated the primary / source-of-truth, and all duplicates are flagged.
 *
 * Resolution rule: first definition has priority; aux-contacts always resolve
 * to the primary instance.  Duplicate coils can exist without a hard error —
 * the UI surfaces the `isConflicted` prop so the symbol renders a warning.
 */
export function detectCoilConflicts(components: CircuitComponent[]): CoilConflictReport {
  const coilsByLabel = new Map<string, CircuitComponent[]>();

  for (const c of components) {
    if (c.type !== 'coil') continue;
    const label = c.label || c.id;
    if (!coilsByLabel.has(label)) coilsByLabel.set(label, []);
    coilsByLabel.get(label)!.push(c);
  }

  const conflicts: CoilConflictEntry[] = [];

  coilsByLabel.forEach((coils, name) => {
    if (coils.length < 2) return;
    conflicts.push({
      name,
      count: coils.length,
      primaryId: coils[0].id,
      resolution: `First definition (id: "${coils[0].id}") is the source of truth. ` +
                  `${coils.length - 1} duplicate(s) detected — rename or remove them.`,
    });
  });

  return { hasConflicts: conflicts.length > 0, conflicts };
}
