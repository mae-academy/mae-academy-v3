import { memo, useMemo, useState, type DragEvent } from 'react';
import type { Network, NetworkId, NodeId } from '../../domain/ast';
import { inletCount, type EvalTree } from '../../engine/compiler';
import { PALETTE_DRAG_TYPE, getPaletteItem, isPaletteItemId, type PaletteItemId } from '../palette/catalog';
import { BranchRenderer } from './BranchRenderer';
import { anchorsToRail, type PlacementPlan } from './placement-rules';
import { NodeView } from './components/symbols/NodeView';
import {
  CELL_HOVER_BAD,
  CELL_HOVER_OK,
  CELL_SELECTED,
  RAIL_LIVE,
  RAIL_STROKE,
} from './components/symbols/theme';
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  JUNCTION_RADIUS,
  RAIL_X,
  boundaryX,
  cellTop,
  rowY,
  rungSize,
  type Cell,
} from './geometry';
import { useFlow } from './simulation';
import { WireLayer } from './WireLayer';
import { planWiring, type FlowRef } from './wiring';

export interface LadderRungProps {
  network: Network;
  /** 0-based position, shown as the network number. */
  index: number;
  tree: EvalTree;
  selectedNodeId: NodeId | null;
  selectedCell: Cell | null;
  /** Palette entry that will be placed by the next cell click or drop. */
  armed: PaletteItemId | null;
  interactive: boolean;
  /** Where `item` would land for a drop at the cell, or why not (drives hover / drop feedback). */
  previewCell: (networkId: NetworkId, item: PaletteItemId, row: number, col: number) => PlacementPlan;
  /** Forks a parallel branch off the element (on-canvas handle). */
  onAddBranch?: (networkId: NetworkId, nodeId: NodeId) => void;
  /** Appends a lane to an existing branch (on-canvas handle). */
  onAddLane?: (networkId: NetworkId, branchId: string) => void;
  onSelectCell: (networkId: NetworkId, cell: Cell) => void;
  onSelectNode: (networkId: NetworkId, nodeId: NodeId) => void;
  onPlace: (networkId: NetworkId, item: PaletteItemId, row: number, col: number) => void;
}

/** The two power rails; the left one lights up while the controller scans. */
function PowerRails({ rail, cols, rows }: { rail: FlowRef; cols: number; rows: number }) {
  const live = useFlow(rail);
  const top = cellTop(0);
  const bottom = cellTop(rows);
  return (
    <g fill="none" strokeWidth={4} shapeRendering="crispEdges" data-layer="rails">
      <path d={`M ${RAIL_X} ${top} V ${bottom}`} className={live ? RAIL_LIVE : RAIL_STROKE} data-rail="left" />
      <path d={`M ${boundaryX(cols)} ${top} V ${bottom}`} className={RAIL_STROKE} data-rail="right" />
    </g>
  );
}

/** Round "+" button drawn on the wire; the on-canvas replacement for the old branch menu. */
function BranchHandle({ x, y, label, onActivate }: { x: number; y: number; label: string; onActivate: () => void }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      data-handle={label}
      transform={`translate(${x} ${y})`}
      className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-sky-400"
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
      <circle r={9} strokeWidth={1.5} className="fill-white stroke-sky-500 transition-colors hover:fill-sky-500 dark:fill-slate-900 [&:hover+path]:stroke-white" />
      <path d="M -4 0 H 4 M 0 -4 V 4" strokeWidth={1.75} strokeLinecap="round" fill="none" className="stroke-sky-500" pointerEvents="none" />
    </g>
  );
}

function LadderRungImpl({
  network,
  index,
  tree,
  selectedNodeId,
  selectedCell,
  armed,
  interactive,
  previewCell,
  onAddBranch,
  onAddLane,
  onSelectCell,
  onSelectNode,
  onPlace,
}: LadderRungProps) {
  const wiring = useMemo(() => planWiring(network, tree), [network, tree]);
  const [hover, setHover] = useState<Cell | null>(null);

  const { rows, cols } = network.grid;
  const size = rungSize(cols, rows);
  const leafById = useMemo(() => new Map(wiring.leaves.map((leaf) => [leaf.node.id, leaf])), [wiring]);

  const plan = useMemo(
    () => (hover !== null && armed !== null ? previewCell(network.id, armed, hover.row, hover.col) : null),
    [hover, armed, previewCell, network.id],
  );
  const hoverProblem = plan !== null && !plan.ok ? plan.reason : null;
  // Where the element would really end up: outputs jump to the rail, so the ghost follows that.
  const target: Cell | null = plan === null ? null : plan.cell;
  const armedItem = armed === null ? null : getPaletteItem(armed);
  const ghostRows = armedItem?.rowSpan ?? 1;
  const railOnly = armed !== null && anchorsToRail(armed);
  const selectedNode = selectedNodeId === null ? undefined : network.nodes.find((node) => node.id === selectedNodeId);
  const selectedBranch =
    selectedNode?.layout.branchId == null ? undefined : network.branches.find((branch) => branch.id === selectedNode.layout.branchId);

  const onDragOver = (event: DragEvent<SVGRectElement>, cell: Cell): void => {
    if (!interactive || !event.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (hover?.row !== cell.row || hover.col !== cell.col) setHover(cell);
  };

  const onDrop = (event: DragEvent<SVGRectElement>, cell: Cell): void => {
    const id = event.dataTransfer.getData(PALETTE_DRAG_TYPE);
    if (!interactive || !isPaletteItemId(id)) return;
    event.preventDefault();
    setHover(null);
    onPlace(network.id, id, cell.row, cell.col);
  };

  const cells: { row: number; col: number }[] = [];
  if (interactive) {
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells.push({ row, col });
  }

  const valid = plan !== null && plan.ok;
  const anchor = plan !== null && plan.ok && plan.kind === 'parallel' ? network.nodes.find((node) => node.id === plan.anchorId) : undefined;
  const lane = plan !== null && plan.ok && plan.kind === 'lane' ? network.branches.find((branch) => branch.id === plan.branchId) : undefined;
  // Geometry of the branch a drop would build: split boundary, merge boundary and the source row.
  const fork =
    valid && target !== null
      ? anchor
        ? { from: anchor.layout.col, to: anchor.layout.col + anchor.layout.colSpan, row: anchor.layout.row + anchor.layout.rowSpan - 1 }
        : lane
          ? { from: lane.splitCol, to: lane.mergeCol + 1, row: lane.rowEnd }
          : null
      : null;

  return (
    <svg
      role="group"
      aria-label={`Network ${index + 1}${network.title ? `: ${network.title}` : ''}`}
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="block max-w-none select-none"
      data-network={network.id}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null);
      }}
    >
      <text x={8} y={rowY(0) + 4} fontSize={11} className="fill-slate-400 font-mono dark:fill-slate-500">
        {index + 1}
      </text>

      {interactive && railOnly && (
        <rect
          x={boundaryX(cols - 1) + 1}
          y={cellTop(0)}
          width={CELL_WIDTH - 2}
          height={rows * CELL_HEIGHT}
          rx={6}
          pointerEvents="none"
          className="fill-emerald-500/[0.06] stroke-emerald-500/40"
          strokeDasharray="4 4"
          data-rail-zone="true"
        />
      )}

      {interactive && (
        <g data-layer="cells" onMouseLeave={() => setHover(null)}>
          {cells.map((cell) => {
            const isSelected = selectedCell?.row === cell.row && selectedCell.col === cell.col;
            const isHover = hover?.row === cell.row && hover.col === cell.col;
            const feedback = isHover && armed !== null ? (hoverProblem === null ? CELL_HOVER_OK : CELL_HOVER_BAD) : null;
            return (
              <rect
                key={`${cell.row}:${cell.col}`}
                x={boundaryX(cell.col) + 1}
                y={cellTop(cell.row) + 1}
                width={CELL_WIDTH - 2}
                height={CELL_HEIGHT - 2}
                rx={4}
                strokeWidth={1}
                strokeDasharray={feedback || isSelected ? undefined : '2 4'}
                aria-hidden="true"
                data-cell={`${cell.row}:${cell.col}`}
                className={
                  // a hovered cell is only outlined when it is itself the drop target; outputs are re-targeted below
                  feedback && !railOnly
                    ? feedback
                    : (isSelected ? CELL_SELECTED : 'fill-transparent stroke-transparent hover:stroke-slate-300 dark:hover:stroke-slate-600')
                }
                style={{ cursor: armed !== null ? (hoverProblem === null || !isHover ? 'copy' : 'not-allowed') : 'pointer' }}
                onMouseEnter={() => setHover(cell)}
                onClick={() => {
                  onSelectCell(network.id, cell);
                  if (armed !== null) onPlace(network.id, armed, cell.row, cell.col);
                }}
                onDragOver={(event) => onDragOver(event, cell)}
                onDrop={(event) => onDrop(event, cell)}
              >
                {isHover && armed !== null && hoverProblem !== null && <title>{hoverProblem}</title>}
              </rect>
            );
          })}
        </g>
      )}

      {/* Drop guide: a dashed lead from the pointer to where an output will actually snap. */}
      {interactive && armed !== null && hover !== null && target !== null && (target.col !== hover.col || target.row !== hover.row) && (
        <path
          d={`M ${boundaryX(hover.col) + CELL_WIDTH / 2} ${rowY(hover.row)} H ${boundaryX(target.col) + CELL_WIDTH / 2}`}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="3 4"
          pointerEvents="none"
          className={valid ? 'stroke-emerald-500' : 'stroke-red-500'}
          data-drop-guide="true"
        />
      )}

      {/* Parallel-branch preview: the orthogonal route a fork would take, with its junction dots. */}
      {interactive && fork !== null && target !== null && (
        <g pointerEvents="none" data-branch-preview="true" fill="none" strokeWidth={2} strokeDasharray="5 3" className="stroke-emerald-500">
          <path d={`M ${boundaryX(fork.from)} ${rowY(fork.row)} V ${rowY(target.row)} H ${boundaryX(fork.from + 1)}`} />
          <path d={`M ${boundaryX(fork.to)} ${rowY(fork.row)} V ${rowY(target.row)} H ${boundaryX(fork.to - 1)}`} />
          <g className="fill-emerald-500" stroke="none" strokeDasharray="none">
            <circle cx={boundaryX(fork.from)} cy={rowY(fork.row)} r={JUNCTION_RADIUS + 1} />
            <circle cx={boundaryX(fork.to)} cy={rowY(fork.row)} r={JUNCTION_RADIUS + 1} />
          </g>
        </g>
      )}

      {interactive && target !== null && armedItem !== null && hoverProblem === null && (
        <g
          pointerEvents="none"
          data-ghost="true"
          style={{
            transform: `translate(${boundaryX(target.col) + 4}px, ${cellTop(target.row) + 4}px)`,
            transition: 'transform 90ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          <rect
            width={CELL_WIDTH - 8}
            height={ghostRows * CELL_HEIGHT - 8}
            rx={4}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            className="fill-emerald-500/10 stroke-emerald-500"
          />
          <text
            x={(CELL_WIDTH - 8) / 2}
            y={(ghostRows * CELL_HEIGHT - 8) / 2 + 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            className="fill-emerald-600 font-mono dark:fill-emerald-400"
          >
            {armedItem.label}
          </text>
        </g>
      )}
      {interactive && target !== null && hoverProblem !== null && armed !== null && (
        <rect
          x={boundaryX(target.col) + 4}
          y={cellTop(target.row) + 4}
          width={CELL_WIDTH - 8}
          height={CELL_HEIGHT - 8}
          rx={4}
          strokeWidth={1.5}
          pointerEvents="none"
          className="fill-red-500/10 stroke-red-500"
          data-ghost-blocked="true"
        />
      )}

      <WireLayer segments={wiring.hSegments} />
      <BranchRenderer rails={wiring.vSegments} junctions={wiring.junctions} />

      <g data-layer="nodes">
        {network.nodes.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            placement={leafById.get(node.id) ?? null}
            selected={selectedNodeId === node.id}
            onSelect={(nodeId) => onSelectNode(network.id, nodeId)}
          />
        ))}
      </g>

      {interactive && armed === null && selectedNode !== undefined && (
        <g data-layer="handles">
          {onAddBranch !== undefined && inletCount(selectedNode) <= 1 && (
            <BranchHandle
              x={boundaryX(selectedNode.layout.col) + (selectedNode.layout.colSpan * CELL_WIDTH) / 2}
              y={cellTop(selectedNode.layout.row + selectedNode.layout.rowSpan) - 8}
              label="Add parallel branch"
              onActivate={() => onAddBranch(network.id, selectedNode.id)}
            />
          )}
          {onAddLane !== undefined && selectedBranch !== undefined && (
            <BranchHandle
              x={boundaryX(selectedBranch.splitCol)}
              y={cellTop(selectedBranch.rowEnd + 1) - 8}
              label="Add lane to this branch"
              onActivate={() => onAddLane(network.id, selectedBranch.id)}
            />
          )}
        </g>
      )}

      <PowerRails rail={wiring.rail} cols={cols} rows={rows} />
    </svg>
  );
}

export const LadderRung = memo(LadderRungImpl);
