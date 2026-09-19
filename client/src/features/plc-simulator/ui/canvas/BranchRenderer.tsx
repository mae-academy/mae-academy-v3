import { memo } from 'react';
import { JUNCTION_RADIUS, boundaryX, rowY } from './geometry';
import { useFlow } from './simulation';
import { dotClass, wireClass } from './components/symbols/theme';
import type { Junction, VSegment } from './wiring';

/**
 * Vertical branch rails and junction dots. Rails are plain orthogonal `M x y1 V y2` paths; the
 * horizontal lane arms are drawn by the wire layer, so corners are formed by two strokes meeting
 * on the same integer grid point rather than by a rounded join.
 */
const Rail = memo(function Rail({ segment }: { segment: VSegment }) {
  const live = useFlow(segment.flow);
  const x = boundaryX(segment.boundary);
  return (
    <path
      d={`M ${x} ${rowY(segment.fromRow)} V ${rowY(segment.toRow)}`}
      className={wireClass(live)}
      data-rail={`${segment.boundary}:${segment.fromRow}-${segment.toRow}`}
    />
  );
});

const Dot = memo(function Dot({ junction }: { junction: Junction }) {
  const live = useFlow(junction.flow);
  return (
    <circle
      cx={boundaryX(junction.boundary)}
      cy={rowY(junction.row)}
      r={JUNCTION_RADIUS}
      className={dotClass(live)}
      data-junction={`${junction.boundary}:${junction.row}`}
    />
  );
});

export function BranchRenderer({
  rails,
  junctions,
}: {
  rails: readonly VSegment[];
  junctions: readonly Junction[];
}) {
  return (
    <g data-layer="branches">
      <g fill="none" strokeWidth={2} shapeRendering="crispEdges">
        {rails.map((rail) => (
          <Rail key={rail.key} segment={rail} />
        ))}
      </g>
      {junctions.map((junction) => (
        <Dot key={junction.key} junction={junction} />
      ))}
    </g>
  );
}
