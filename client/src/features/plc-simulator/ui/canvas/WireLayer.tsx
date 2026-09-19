import { memo } from 'react';
import { boundaryX, rowY } from './geometry';
import { useFlow } from './simulation';
import { wireClass } from './components/symbols/theme';
import type { HSegment } from './wiring';

/**
 * Horizontal wires, one component per segment so each subscribes to exactly one flow and a
 * scan re-renders only the wires whose power actually changed.
 */
const Wire = memo(function Wire({ segment }: { segment: HSegment }) {
  const live = useFlow(segment.flow);
  const y = rowY(segment.row);
  return (
    <path
      d={`M ${boundaryX(segment.from)} ${y} H ${boundaryX(segment.to)}`}
      className={wireClass(live)}
      data-wire={`${segment.row}:${segment.from}-${segment.to}`}
    />
  );
});

export function WireLayer({ segments }: { segments: readonly HSegment[] }) {
  return (
    <g fill="none" strokeWidth={2} strokeLinecap="butt" shapeRendering="crispEdges" data-layer="wires">
      {segments.map((segment) => (
        <Wire key={segment.key} segment={segment} />
      ))}
    </g>
  );
}
