import type { CompareOp, NodeId, NumericType } from '../../../../domain/ast';
import { CELL_WIDTH } from '../../geometry';
import { SymbolLabel } from './SymbolLabel';
import { BOX_FILL, BOX_FILL_LIVE, TEXT_ADDRESS, textLive, wireClass } from './theme';

export interface CompareSymbolProps {
  nodeId: NodeId;
  x: number;
  y: number;
  op: CompareOp;
  dataType: NumericType;
  lhs: string;
  rhs: string;
  flowIn: boolean;
  flowOut: boolean;
}

/** Micro/WIN type letters for LAD comparison boxes: `>=I`, `==R`. */
const TYPE_LETTER: Readonly<Record<NumericType, string>> = { BYTE: 'B', INT: 'I', DINT: 'D', REAL: 'R' };

const BOX_INSET = 14;
const BOX_WIDTH = CELL_WIDTH - 2 * BOX_INSET;
const BOX_HALF_HEIGHT = 15;

/** Compact comparison contact: one row tall, operands above and below the box. */
export function CompareSymbol({ nodeId, x, y, op, dataType, lhs, rhs, flowIn, flowOut }: CompareSymbolProps) {
  const x0 = x + BOX_INSET;
  return (
    <g data-symbol={`compare-${op}`}>
      <g fill="none" strokeWidth={2} shapeRendering="crispEdges">
        <path d={`M ${x} ${y} H ${x0}`} className={wireClass(flowIn)} />
        <path d={`M ${x0 + BOX_WIDTH} ${y} H ${x + CELL_WIDTH}`} className={wireClass(flowOut)} />
      </g>
      <rect
        x={x0}
        y={y - BOX_HALF_HEIGHT}
        width={BOX_WIDTH}
        height={2 * BOX_HALF_HEIGHT}
        rx={2}
        strokeWidth={2}
        shapeRendering="crispEdges"
        className={`${flowOut ? BOX_FILL_LIVE : BOX_FILL} ${wireClass(flowOut)}`}
      />
      <text
        x={x + CELL_WIDTH / 2}
        y={y + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        className={`font-mono select-none ${textLive(flowOut, TEXT_ADDRESS)}`}
      >
        {`${op}${TYPE_LETTER[dataType]}`}
      </text>
      <SymbolLabel nodeId={nodeId} slot="lhs" x={x + CELL_WIDTH / 2} y={y - BOX_HALF_HEIGHT - 6} text={lhs} tone="address" />
      <SymbolLabel nodeId={nodeId} slot="rhs" x={x + CELL_WIDTH / 2} y={y + BOX_HALF_HEIGHT + 15} text={rhs} tone="address" />
    </g>
  );
}
