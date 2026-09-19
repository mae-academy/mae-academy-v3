import { describe, expect, it } from 'vitest';
import { validateNetworkLayout, type Network } from '../../domain/ast';
import { S7_200_CPU224 } from '../../domain/hardware';
import { buildNetworkTree } from '../../engine/compiler';
import { createEmptyNetwork, placeItem } from './network-edit';
import { anchorRailNodes, anchorsToRail, planPlacement, snapToRail, type PlacementPlan } from './placement-rules';
import { planWiring } from './wiring';

const { limits } = S7_200_CPU224;
const ctx = { usedInstances: new Set<string>() };

const plan = (network: Network, itemId: Parameters<typeof placeItem>[1]['itemId'], row: number, col: number, nodeId = 'n'): PlacementPlan =>
  planPlacement(network, { itemId, nodeId, row, col }, ctx, limits, 'br');

const must = (result: PlacementPlan): Extract<PlacementPlan, { ok: true }> => {
  if (!result.ok) throw new Error(result.reason);
  return result;
};

const withContact = (): Network => must(plan(createEmptyNetwork('n', 8), 'contact-no', 0, 0, 'c1')).network;

describe('right-rail anchoring', () => {
  it('flags exactly the outputs: coils, timers and counters', () => {
    for (const id of ['coil-out', 'coil-set', 'coil-reset', 'timer-ton', 'timer-tof', 'timer-tonr', 'counter-ctu', 'counter-ctd', 'counter-ctud'] as const) {
      expect(anchorsToRail(id), id).toBe(true);
    }
    for (const id of ['contact-no', 'contact-nc', 'cmp-eq', 'math-add', 'wl-and'] as const) expect(anchorsToRail(id), id).toBe(false);
  });

  it('retargets any drop column of an output to the last column, and leaves contacts alone', () => {
    expect(snapToRail('coil-out', { row: 0, col: 2 }, 8)).toEqual({ row: 0, col: 7 });
    expect(snapToRail('timer-ton', { row: 1, col: 0 }, 6)).toEqual({ row: 1, col: 5 });
    expect(snapToRail('contact-no', { row: 0, col: 2 }, 8)).toEqual({ row: 0, col: 2 });
  });

  it.each(['coil-out', 'coil-set', 'coil-reset', 'timer-ton', 'timer-tof', 'timer-tonr', 'counter-ctu'] as const)('places %s on the rail wherever it is dropped', (item) => {
    const result = must(plan(withContact(), item, 0, 3));
    expect(result.cell).toEqual({ row: 0, col: 7 });
    const node = result.network.nodes.find((n) => n.id === 'n');
    expect(node?.layout.col).toBe(7);
    expect(validateNetworkLayout(result.network)).toEqual([]);
  });

  it('re-anchors outputs when a rung is widened, carrying their branch with them', () => {
    const start = must(plan(withContact(), 'coil-out', 0, 7, 'q1')).network;
    const forked = must(plan(start, 'coil-out', 1, 7, 'q2')).network;
    const wider: Network = { ...forked, grid: { ...forked.grid, cols: 10 } };
    const anchored = anchorRailNodes(wider);
    for (const id of ['q1', 'q2']) expect(anchored.nodes.find((n) => n.id === id)?.layout.col).toBe(9);
    expect(anchored.branches[0]?.mergeCol).toBe(9);
    expect(validateNetworkLayout(anchored)).toEqual([]);
    expect(planWiring(anchored, buildNetworkTree(anchored)).orphanIds.size).toBe(0);
  });

  it('never corrupts a network it cannot re-anchor', () => {
    const blocked: Network = {
      ...createEmptyNetwork('n', 4),
      nodes: [
        { id: 'a', type: 'coil', variant: 'OUT', target: 'Q0.0', layout: { row: 0, col: 1, rowSpan: 1, colSpan: 1, branchId: null } },
        { id: 'b', type: 'contact', variant: 'NO', operand: 'I0.0', layout: { row: 0, col: 3, rowSpan: 1, colSpan: 1, branchId: null } },
      ],
    };
    expect(anchorRailNodes(blocked)).toBe(blocked);
  });
});

describe('parallel branches from a drop', () => {
  it('drops under an element -> forks a parallel branch with a junction pair', () => {
    const result = must(plan(withContact(), 'contact-nc', 1, 0, 'c2'));
    expect(result.kind).toBe('parallel');
    expect(result.anchorId).toBe('c1');
    expect(result.network.branches).toHaveLength(1);
    expect(result.network.nodes.find((n) => n.id === 'c2')?.layout).toMatchObject({ row: 1, col: 0, branchId: 'br' });
    expect(validateNetworkLayout(result.network)).toEqual([]);
    const wiring = planWiring(result.network, buildNetworkTree(result.network));
    expect(wiring.orphanIds.size).toBe(0);
    expect(wiring.junctions.length).toBeGreaterThanOrEqual(2);
  });

  it('drops under the last lane of a branch -> adds a lane instead of nesting', () => {
    const forked = must(plan(withContact(), 'contact-nc', 1, 0, 'c2')).network;
    const third = must(plan(forked, 'contact-no', 2, 0, 'c3'));
    expect(third.kind).toBe('lane');
    expect(third.network.branches).toHaveLength(1);
    expect(third.network.branches[0]).toMatchObject({ rowStart: 0, rowEnd: 2 });
    expect(validateNetworkLayout(third.network)).toEqual([]);
  });

  it('puts a second output in parallel on the rail', () => {
    const one = must(plan(withContact(), 'coil-out', 0, 5, 'q1')).network;
    const two = must(plan(one, 'coil-set', 1, 1, 'q2'));
    expect(two.kind).toBe('parallel');
    expect(two.cell).toEqual({ row: 1, col: 7 });
    const wiring = planWiring(two.network, buildNetworkTree(two.network));
    expect(wiring.orphanIds.size).toBe(0);
  });

  it('still refuses cells that have nothing above them to hang from', () => {
    const refused = plan(withContact(), 'contact-no', 1, 4);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain('branch');
  });

  it('refuses an occupied rail cell rather than stacking outputs', () => {
    const one = must(plan(withContact(), 'coil-out', 0, 5, 'q1')).network;
    const again = plan(one, 'coil-out', 0, 2, 'q2');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toContain('occupied');
  });
});
