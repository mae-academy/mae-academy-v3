import { describe, expect, it } from 'vitest';
import { BLOCK_SPECS } from '../engine/types';
import { SCENARIO_LIST } from '../scenarios';
import { layoutFbd, type Point } from './fbd-layout';

const segments = (points: readonly Point[]) => points.slice(1).map((point, i) => [points[i] as Point, point] as const);

describe('function block diagram layout', () => {
  for (const scenario of SCENARIO_LIST) {
    it(`${scenario.id}: orthogonal, collision-free and complete`, () => {
      const layout = layoutFbd(scenario.program);
      const blocks = layout.nodes.filter((n) => n.node.kind === 'block');
      expect(blocks).toHaveLength(scenario.program.blocks.length);
      expect(layout.nodes.filter((n) => n.node.kind === 'sink')).toHaveLength(scenario.program.sinks.length);

      // every segment horizontal or vertical
      for (const edge of layout.edges) {
        for (const [[x1, y1], [x2, y2]] of segments(edge.points)) expect(x1 === x2 || y1 === y2).toBe(true);
      }

      // no wire runs through the body of any node (touching the border at a pin is fine)
      for (const edge of layout.edges) {
        for (const [[x1, y1], [x2, y2]] of segments(edge.points)) {
          for (const node of layout.nodes) {
            const inside =
              Math.max(x1, x2) > node.x + 1 && Math.min(x1, x2) < node.x + node.w - 1 && Math.max(y1, y2) > node.y + 1 && Math.min(y1, y2) < node.y + node.h - 1;
            expect(inside, `${scenario.id}: ${edge.net} crosses ${node.node.key}`).toBe(false);
          }
        }
      }

      // nodes never overlap
      for (const a of layout.nodes) {
        for (const b of layout.nodes) {
          if (a === b) continue;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.node.key} / ${b.node.key}`).toBe(false);
        }
      }

      // every wired pin receives exactly the wire of its net, ending on the pin
      for (const placed of blocks) {
        if (placed.node.kind !== 'block') continue;
        const spec = BLOCK_SPECS[placed.node.block.type];
        expect(placed.pins).toHaveLength(spec.pins.length);
        for (const pin of placed.pins) {
          if (pin.net === null) continue;
          const ends = layout.edges.filter((e) => e.net === pin.net).map((e) => e.points[e.points.length - 1]);
          expect(ends.some((end) => end?.[0] === placed.x && end?.[1] === pin.y), `${placed.node.key}.${pin.name}`).toBe(true);
        }
      }

      // columns flow left to right: sources < blocks < sinks
      const maxBlockCol = Math.max(...blocks.map((b) => b.col));
      for (const n of layout.nodes) if (n.node.kind === 'sink') expect(n.col).toBe(maxBlockCol + 1);
      for (const n of layout.nodes) if (n.node.kind === 'source') expect(n.col).toBe(0);
    });
  }
});
