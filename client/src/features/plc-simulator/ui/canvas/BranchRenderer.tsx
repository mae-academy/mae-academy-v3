import { memo } from 'react';
import type { Branch, BranchId } from '../../domain/ast';
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

/** Directional adjustment handle for expanding or shrinking a parallel branch. */
export function BranchAdjustHandle({
  x,
  y,
  direction,
  actionType,
  label,
  onActivate,
}: {
  x: number;
  y: number;
  direction: 'left' | 'right';
  actionType: 'extend-branch-left' | 'extend-branch-right' | 'shrink-branch-left' | 'shrink-branch-right';
  label: string;
  onActivate: () => void;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      data-handle={actionType}
      transform={`translate(${x} ${y})`}
      className="group cursor-pointer outline-none"
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onActivate();
        }
      }}
    >
      <title>{label}</title>
      <circle
        r={9}
        className="fill-white stroke-indigo-500 shadow-sm transition-all group-hover:scale-110 group-hover:fill-indigo-600 group-hover:stroke-indigo-600 dark:fill-[#13161c] dark:stroke-indigo-400 dark:group-hover:fill-indigo-500"
        strokeWidth={1.75}
      />
      {direction === 'left' ? (
        <path
          d="M 2 -3.5 L -2.5 0 L 2 3.5 Z"
          className="fill-indigo-600 transition-colors group-hover:fill-white dark:fill-indigo-300"
          pointerEvents="none"
        />
      ) : (
        <path
          d="M -2 -3.5 L 2.5 0 L -2 3.5 Z"
          className="fill-indigo-600 transition-colors group-hover:fill-white dark:fill-indigo-300"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

/** Legacy alias for backwards compatibility. */
export const BranchExtendHandle = BranchAdjustHandle;

export interface BranchRendererProps {
  rails: readonly VSegment[];
  junctions: readonly Junction[];
  branch?: Branch | null;
  interactive?: boolean;
  maxCols?: number;
  onExtendLeft?: (branchId: BranchId) => void;
  onExtendRight?: (branchId: BranchId) => void;
  onShrinkLeft?: (branchId: BranchId) => void;
  onShrinkRight?: (branchId: BranchId) => void;
}

export function BranchRenderer({
  rails,
  junctions,
  branch = null,
  interactive = false,
  maxCols,
  onExtendLeft,
  onExtendRight,
  onShrinkLeft,
  onShrinkRight,
}: BranchRendererProps) {
  const yMid = branch ? (rowY(branch.rowStart) + rowY(branch.rowEnd)) / 2 : 0;
  const canExtendLeft = Boolean(branch && branch.splitCol > 0 && onExtendLeft);
  const canShrinkLeft = Boolean(branch && branch.mergeCol > branch.splitCol && onShrinkLeft);
  const canExtendRight = Boolean(
    branch && (maxCols === undefined || branch.mergeCol + 1 < maxCols) && onExtendRight,
  );
  const canShrinkRight = Boolean(branch && branch.mergeCol > branch.splitCol && onShrinkRight);

  const xLeft = branch ? boundaryX(branch.splitCol) : 0;
  const xRight = branch ? boundaryX(branch.mergeCol + 1) : 0;

  return (
    <g data-layer="branches">
      <g fill="none" strokeWidth={2} shapeRendering="crispEdges" pointerEvents="none">
        {rails.map((rail) => (
          <Rail key={rail.key} segment={rail} />
        ))}
      </g>
      <g pointerEvents="none">
        {junctions
          .filter((junction) => junction.boundary > 0)
          .map((junction) => (
            <Dot key={junction.key} junction={junction} />
          ))}
      </g>
      {interactive && branch && (
        <g data-layer="branch-controls">
          {canExtendLeft && onExtendLeft && (
            <BranchAdjustHandle
              x={xLeft - (canShrinkLeft ? 10 : 0)}
              y={yMid}
              direction="left"
              actionType="extend-branch-left"
              label="Extend branch left (◄)"
              onActivate={() => onExtendLeft(branch.id)}
            />
          )}
          {canShrinkLeft && onShrinkLeft && (
            <BranchAdjustHandle
              x={xLeft + (canExtendLeft ? 10 : 0)}
              y={yMid}
              direction="right"
              actionType="shrink-branch-right"
              label="Shrink branch right (►)"
              onActivate={() => onShrinkLeft(branch.id)}
            />
          )}
          {canShrinkRight && onShrinkRight && (
            <BranchAdjustHandle
              x={xRight - (canExtendRight ? 10 : 0)}
              y={yMid}
              direction="left"
              actionType="shrink-branch-left"
              label="Shrink branch left (◄)"
              onActivate={() => onShrinkRight(branch.id)}
            />
          )}
          {canExtendRight && onExtendRight && (
            <BranchAdjustHandle
              x={xRight + (canShrinkRight ? 10 : 0)}
              y={yMid}
              direction="right"
              actionType="extend-branch-right"
              label="Extend branch right (►)"
              onActivate={() => onExtendRight(branch.id)}
            />
          )}
        </g>
      )}
    </g>
  );
}
