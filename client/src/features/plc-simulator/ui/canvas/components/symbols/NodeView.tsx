import { memo, useMemo, type KeyboardEvent, type ReactElement } from 'react';
import type { LadNode, NodeId } from '../../../../domain/ast';
import { CELL_HEIGHT, CELL_WIDTH, boundaryX, cellTop, rowY } from '../../geometry';
import { useLadderEnv } from '../../env';
import { slotsOf, readSlot } from '../../operand-slots';
import { useFlowMask, useMemoryBit, useMemoryWord } from '../../simulation';
import type { FlowRef, LeafPlacement } from '../../wiring';
import { BoxSymbol } from './BoxSymbol';
import { boxSpecFor } from './box-spec';
import { CoilSymbol } from './CoilSymbol';
import { CompareSymbol } from './CompareSymbol';
import { ContactSymbol } from './ContactSymbol';
import { SymbolLabel } from './SymbolLabel';
import { ERROR_FILL, ERROR_STROKE, SELECTED_FILL, SELECTED_STROKE } from './theme';

export interface NodeViewProps {
  node: LadNode;
  /** Null for nodes the engine cannot reach; they are drawn flagged and unpowered. */
  placement: LeafPlacement | null;
  selected: boolean;
  onSelect: (nodeId: NodeId) => void;
}

const bit = (mask: number, index: number): boolean => (mask & (1 << index)) !== 0;

const COIL_GLYPH: Readonly<Record<string, string>> = { SET: 'S', RESET: 'R' };

export function describeNode(node: LadNode): string {
  switch (node.type) {
    case 'contact':
      return `${{ NO: 'Normally open', NC: 'Normally closed', P: 'Positive edge', N: 'Negative edge' }[node.variant]} contact ${node.operand}`;
    case 'coil':
      if (node.variant === 'MASTER') return node.mode === 'begin' ? 'Master control relay start' : 'Master control relay end';
      return `${{ OUT: 'Output', INTERNAL: 'Internal', SET: 'Set', RESET: 'Reset' }[node.variant]} coil ${node.target}`;
    case 'timer':
      return `${node.fn} timer ${node.instance}`;
    case 'counter':
      return `${node.fn} counter ${node.instance}`;
    case 'compare':
      return `Compare ${readSlot(node, 'lhs')} ${node.op} ${readSlot(node, 'rhs')}`;
    case 'math':
      return `${node.fn} box, output ${node.out}`;
    case 'wordLogic':
      return `${node.fn} box, output ${node.out}`;
    default:
      return 'Element';
  }
}

/**
 * One placed element. Subscribes to its own power flow and its own memory bit / word only, so a
 * scan that toggles some other part of the rung never re-renders this component.
 */
function NodeViewImpl({ node, placement, selected, onSelect }: NodeViewProps) {
  const env = useLadderEnv();

  // Layout of the mask: input pins, then this node's own output, then the left rail.
  const pinCount = placement?.pinFlows.length ?? 0;
  const refs = useMemo<readonly FlowRef[]>(
    () => (placement ? [...placement.pinFlows, { tree: placement.tree, side: 'out' }, placement.rail] : []),
    [placement],
  );
  const mask = useFlowMask(refs);
  const flowIn = bit(mask, 0);
  const flowOut = placement !== null && bit(mask, pinCount);
  /** The controller is scanning; contact and coil states are meaningless while it is stopped. */
  const running = placement !== null && bit(mask, pinCount + 1);
  const pinFlows = useMemo(() => Array.from({ length: pinCount }, (_, i) => bit(mask, i)), [mask, pinCount]);

  const spec = useMemo(() => boxSpecFor(node), [node]);
  const bitAddress =
    node.type === 'contact' ? node.operand : node.type === 'coil' && node.variant !== 'MASTER' ? node.target : undefined;
  const bitValue = useMemoryBit(bitAddress);
  const liveValue = useMemoryWord(spec?.live?.address);

  const { row, col, rowSpan } = node.layout;
  const x = boundaryX(col);
  const y = rowY(row);
  const orphan = placement === null;

  const symbolFor = (address: string | undefined): string | undefined =>
    address === undefined ? undefined : env?.symbols[address.toUpperCase()]?.name;

  let body: ReactElement | null = null;
  switch (node.type) {
    case 'contact': {
      const closed = running && (node.variant === 'NO' ? bitValue : node.variant === 'NC' ? !bitValue : flowOut);
      const tag = symbolFor(node.operand);
      body = (
        <>
          <ContactSymbol x={x} y={y} variant={node.variant} flowIn={flowIn} flowOut={flowOut} closed={closed} />
          <SymbolLabel nodeId={node.id} slot="operand" x={x + CELL_WIDTH / 2} y={y - 22} text={node.operand} tone="address" />
          {tag && <SymbolLabel nodeId={node.id} x={x + CELL_WIDTH / 2} y={y + 32} text={tag} tone="tag" />}
        </>
      );
      break;
    }
    case 'coil': {
      const glyph = node.variant === 'MASTER' ? (node.mode === 'begin' ? 'MCR' : 'MCRE') : COIL_GLYPH[node.variant];
      const coilActive = running && flowIn;
      if (node.variant === 'MASTER') {
        body = <CoilSymbol x={x} y={y} variant={node.variant} glyph={glyph} flowIn={flowIn} flowOut={flowOut} active={coilActive} />;
      } else {
        const tag = symbolFor(node.target);
        const bits = node.variant === 'SET' || node.variant === 'RESET' ? node.count : 1;
        const caption = [tag, bits > 1 ? `x${bits}` : undefined].filter(Boolean).join(' ');
        body = (
          <>
            <CoilSymbol x={x} y={y} variant={node.variant} glyph={glyph} flowIn={flowIn} flowOut={flowOut} active={coilActive || (running && bitValue && node.variant !== 'RESET')} />
            <SymbolLabel nodeId={node.id} slot="target" x={x + CELL_WIDTH / 2} y={y - 22} text={node.target} tone="address" />
            {caption && <SymbolLabel nodeId={node.id} x={x + CELL_WIDTH / 2} y={y + 32} text={caption} tone="tag" />}
          </>
        );
      }
      break;
    }
    case 'compare':
      body = (
        <CompareSymbol
          nodeId={node.id}
          x={x}
          y={y}
          op={node.op}
          dataType={node.dataType}
          lhs={readSlot(node, 'lhs')}
          rhs={readSlot(node, 'rhs')}
          flowIn={flowIn}
          flowOut={flowOut}
        />
      );
      break;
    default:
      body = spec ? (
        <BoxSymbol nodeId={node.id} spec={spec} x={x} row={row} pinFlows={pinFlows} flowOut={flowOut} liveValue={running ? liveValue : null} />
      ) : null;
  }

  const top = cellTop(row);
  const height = rowSpan * CELL_HEIGHT;
  const firstSlot = slotsOf(node)[0];

  const onKeyDown = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.key === 'Enter' && env?.interactive && firstSlot) env.beginEdit(node.id, firstSlot.key);
      else onSelect(node.id);
    }
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${describeNode(node)}${orphan ? ' (not connected to the rung)' : ''}`}
      aria-pressed={selected}
      data-node-id={node.id}
      className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-sky-500 [&:focus-visible>rect]:stroke-[1.5]"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onKeyDown={onKeyDown}
    >
      <rect
        x={x + 2}
        y={top + 2}
        width={CELL_WIDTH - 4}
        height={height - 4}
        rx={4}
        strokeWidth={selected || orphan ? 1.5 : 0}
        strokeDasharray={orphan ? '4 3' : undefined}
        className={orphan ? `${ERROR_FILL} ${ERROR_STROKE}` : selected ? `${SELECTED_FILL} ${SELECTED_STROKE}` : 'fill-transparent'}
      />
      {orphan && <title>Not reachable: place it on the main rung or inside a parallel branch</title>}
      {body}
    </g>
  );
}

export const NodeView = memo(NodeViewImpl);
