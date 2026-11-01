/**
 * Dependency graph between items (STEPS.md §4 Dependencies, §5.2): a DAG, re-evaluate dependents only,
 * cycles rejected with an error naming the items.
 */

export interface DagNode {
  id: string;
  /** Names this item defines (`a` in `a = 2`, `f` in `f(x) = …`, `M` in `M = [[…]]`). */
  defines: readonly string[];
  /** Names this item uses (free symbols and called functions). */
  uses: readonly string[];
}

export interface DagResult {
  /** Item ids in evaluation order (definitions before uses). Items in a cycle are left out. */
  order: string[];
  /** Each cycle as the list of item ids in it. */
  cycles: string[][];
  /** Names defined by more than one item, with the ids. */
  conflicts: Array<{ name: string; ids: string[] }>;
  /** For each item id, the ids it depends on directly. */
  dependsOn: ReadonlyMap<string, ReadonlySet<string>>;
  /** For each item id, the ids that depend on it directly. */
  dependents: ReadonlyMap<string, ReadonlySet<string>>;
  /** Defining item id for each name. */
  definedBy: ReadonlyMap<string, string>;
}

export function buildDag(nodes: readonly DagNode[]): DagResult {
  const definedBy = new Map<string, string>();
  const multi = new Map<string, string[]>();
  for (const n of nodes) {
    for (const name of n.defines) {
      const prev = definedBy.get(name);
      if (prev === undefined) definedBy.set(name, n.id);
      else multi.set(name, (multi.get(name) ?? [prev]).concat(n.id));
    }
  }
  const dependsOn = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const n of nodes) {
    dependsOn.set(n.id, new Set());
    dependents.set(n.id, new Set());
  }
  for (const n of nodes) {
    for (const name of n.uses) {
      const src = definedBy.get(name);
      if (src === undefined) continue;
      (dependsOn.get(n.id) as Set<string>).add(src);
      (dependents.get(src) as Set<string>).add(n.id);
    }
  }

  // Tarjan's strongly connected components: any component with more than one node, or a self-loop, is a cycle.
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const inCycle = new Set<string>();
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of Array.from(dependsOn.get(v) ?? [])) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v) as number, idx.get(w) as number));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop() as string;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1 || dependsOn.get(v)?.has(v)) {
        const ordered = nodes.map((n) => n.id).filter((id) => comp.includes(id));
        cycles.push(ordered);
        comp.forEach((c) => inCycle.add(c));
      }
    }
  };
  for (const n of nodes) if (!idx.has(n.id)) strong(n.id);

  // Kahn's algorithm in document order, skipping cycle members and everything that depends on them.
  const blocked = new Set(inCycle);
  const blockQueue = Array.from(inCycle);
  while (blockQueue.length) {
    const v = blockQueue.pop() as string;
    for (const d of Array.from(dependents.get(v) ?? [])) {
      if (!blocked.has(d)) {
        blocked.add(d);
        blockQueue.push(d);
      }
    }
  }
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, Array.from(dependsOn.get(n.id) ?? []).filter((d) => !blocked.has(d)).length);
  const order: string[] = [];
  const ready = nodes.map((n) => n.id).filter((id) => !blocked.has(id) && indeg.get(id) === 0);
  while (ready.length) {
    const v = ready.shift() as string;
    order.push(v);
    for (const d of Array.from(dependents.get(v) ?? [])) {
      if (blocked.has(d)) continue;
      const k = (indeg.get(d) as number) - 1;
      indeg.set(d, k);
      if (k === 0) ready.push(d);
    }
  }

  return {
    order,
    cycles,
    conflicts: Array.from(multi.entries()).map(([name, ids]) => ({ name, ids })),
    dependsOn,
    dependents,
    definedBy,
  };
}

/** All items that transitively depend on any of `ids` (not including `ids` themselves). */
export function transitiveDependents(dag: DagResult, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const queue = Array.from(ids);
  while (queue.length) {
    const v = queue.pop() as string;
    for (const d of Array.from(dag.dependents.get(v) ?? [])) {
      if (!out.has(d)) {
        out.add(d);
        queue.push(d);
      }
    }
  }
  return out;
}
