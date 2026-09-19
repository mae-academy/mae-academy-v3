import { GRID, snap } from './model';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Orthogonal route between an output pin and an input pin: three segments when the target lies to
 * the right, five (out, around, back in) when the wire has to double back. All coordinates land on
 * whole pixels so 2 px strokes stay crisp.
 */
export function routeLink(a: Point, b: Point): string {
  const dx = b.x - a.x;
  if (dx >= GRID) {
    const mid = Math.min(b.x - GRID / 2, Math.max(a.x + GRID / 2, snap(a.x + dx / 2)));
    return a.y === b.y ? `M ${a.x} ${a.y} H ${b.x}` : `M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`;
  }
  const out = a.x + GRID;
  const back = b.x - GRID;
  const midY = a.y === b.y ? a.y + 2 * GRID : snap((a.y + b.y) / 2);
  return `M ${a.x} ${a.y} H ${out} V ${midY} H ${back} V ${b.y} H ${b.x}`;
}
