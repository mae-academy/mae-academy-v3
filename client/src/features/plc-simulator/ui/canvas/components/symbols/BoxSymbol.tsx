import type { NodeId } from '../../../../domain/ast';
import { CELL_HEIGHT, CELL_WIDTH, cellTop, rowY } from '../../geometry';
import type { BoxSpec } from './box-spec';
import { SymbolLabel } from './SymbolLabel';
import { BOX_FILL, BOX_FILL_LIVE, CANVAS_FONT_FAMILY, TEXT_LIVE, TEXT_PIN, wireClass } from './theme';

export interface BoxSymbolProps {
  nodeId: NodeId;
  spec: BoxSpec;
  /** X of the cell's left edge. */
  x: number;
  /** Row the box's top edge sits on. */
  row: number;
  /** Power at each input pin, indexed by `BoxPin.pinIndex`. */
  pinFlows: readonly boolean[];
  flowOut: boolean;
  /** Live value for `spec.live`, or null when not simulating. */
  liveValue: number | null;
  selected?: boolean;
}

const INSET = 12;
const HEADER_HEIGHT = 19;
const LINE_START = 34;
const LINE_STEP = 13;

/** Vertical clearance kept around a pin label so operand lines never collide with it. */
const PIN_CLEARANCE = 11;

export interface BoxGeometry {
  readonly x0: number;
  readonly width: number;
  readonly top: number;
  readonly height: number;
  /** Baselines available for operand lines, in draw order. */
  readonly lineYs: readonly number[];
}

/**
 * Lays a box out inside its cell footprint. Pin leads sit on row centres so they meet the wire
 * grid exactly; operand lines are placed on the free baselines between pins, and any that do not
 * fit are dropped rather than overlapping a pin.
 */
export function layoutBox(spec: BoxSpec, x: number, row: number): BoxGeometry {
  const width = CELL_WIDTH - 2 * INSET;
  const top = cellTop(row) + 8;
  const height = spec.rowSpan * CELL_HEIGHT - 16;
  const pinYs = [...spec.left, ...spec.right].map((pin) => rowY(row + pin.row));

  const lineYs: number[] = [];
  for (let y = top + LINE_START; y <= top + height - 5; y += LINE_STEP) {
    if (pinYs.every((pinY) => Math.abs(pinY - y) >= PIN_CLEARANCE)) lineYs.push(y);
  }
  return { x0: x + INSET, width, top, height, lineYs };
}

/** Timer, counter, math and word-logic blocks: header, pins on both edges, operand lines. */
export function BoxSymbol({ nodeId, spec, x, row, pinFlows, flowOut, liveValue, selected = false }: BoxSymbolProps) {
  const g = layoutBox(spec, x, row);
  const right = g.x0 + g.width;
  const energised = flowOut;
  const border = selected
    ? 'stroke-indigo-600 dark:stroke-sky-400 [filter:drop-shadow(0_0_3px_rgba(99,102,241,0.5))]'
    : `${wireClass(energised)} transition-colors group-hover:stroke-indigo-500 dark:group-hover:stroke-sky-400`;

  const rows: { label: string; text: string; slot?: BoxSpec['lines'][number]['slot']; live?: boolean }[] = spec.lines.map(
    (line) => ({ ...line }),
  );
  if (spec.live && liveValue !== null) rows.push({ label: spec.live.label, text: String(liveValue), live: true });
  const shown = rows.slice(0, g.lineYs.length);
  const truncated = shown.length < rows.length;

  return (
    <g data-symbol={`box-${spec.title}`} data-truncated={truncated || undefined}>
      <rect
        x={g.x0}
        y={g.top}
        width={g.width}
        height={g.height}
        rx={2}
        strokeWidth={2}
        shapeRendering="crispEdges"
        className={`${energised ? BOX_FILL_LIVE : BOX_FILL} ${border}`}
      />
      <path
        d={`M ${g.x0} ${g.top + HEADER_HEIGHT} H ${right}`}
        strokeWidth={1}
        fill="none"
        shapeRendering="crispEdges"
        className="stroke-slate-300 dark:stroke-slate-600"
      />
      <text
        x={g.x0 + g.width / 2}
        y={g.top + 13}
        textAnchor="middle"
        fontFamily={CANVAS_FONT_FAMILY}
        fontSize={11}
        fontWeight={600}
        className={`font-sans select-none ${energised ? TEXT_LIVE : 'fill-slate-900 dark:fill-slate-100'}`}
      >
        {spec.title}
      </text>

      {spec.address && (
        <SymbolLabel
          nodeId={nodeId}
          slot={spec.address.slot}
          x={x + CELL_WIDTH / 2}
          y={g.top - 4}
          text={spec.address.text}
          tone="address"
        />
      )}

      <g fill="none" strokeWidth={2} shapeRendering="crispEdges">
        {spec.left.map((pin) => {
          const y = rowY(row + pin.row);
          const powered = pin.pinIndex !== undefined && (pinFlows[pin.pinIndex] ?? false);
          return <path key={`l${pin.row}${pin.label}`} d={`M ${x} ${y} H ${g.x0}`} className={wireClass(powered)} />;
        })}
        {spec.right
          .filter((pin) => pin.flow === 'out')
          .map((pin) => (
            <path
              key={`r${pin.row}${pin.label}`}
              d={`M ${right} ${rowY(row + pin.row)} H ${x + CELL_WIDTH}`}
              className={wireClass(flowOut)}
            />
          ))}
      </g>

      {spec.left.map((pin) => (
        <text
          key={`ll${pin.row}${pin.label}`}
          x={g.x0 + 5}
          y={rowY(row + pin.row) + 4}
          fontFamily={CANVAS_FONT_FAMILY}
          fontSize={10}
          fontWeight={500}
          className={`font-sans select-none ${TEXT_PIN}`}
        >
          {pin.label}
        </text>
      ))}
      {spec.right.map((pin) => (
        <text
          key={`rl${pin.row}${pin.label}`}
          x={right - 5}
          y={rowY(row + pin.row) + 4}
          textAnchor="end"
          fontFamily={CANVAS_FONT_FAMILY}
          fontSize={10}
          fontWeight={500}
          className={`font-sans select-none ${TEXT_PIN}`}
        >
          {pin.label}
        </text>
      ))}

      {shown.map((line, index) => {
        const y = (g.lineYs[index] ?? g.top) + 0;
        return (
          <g key={`${line.label}${index}`}>
            <text x={g.x0 + 5} y={y} fontFamily={CANVAS_FONT_FAMILY} fontSize={10} className={`font-sans select-none ${TEXT_PIN}`}>
              {line.label}
            </text>
            <SymbolLabel
              nodeId={nodeId}
              slot={line.slot}
              x={right - 5}
              y={y}
              text={line.text}
              tone={line.live ? 'value' : 'pin'}
              anchor="end"
            />
          </g>
        );
      })}
      {truncated && (
        <text x={right - 5} y={g.top + g.height - 3} textAnchor="end" fontFamily={CANVAS_FONT_FAMILY} fontSize={10} className={`font-sans select-none ${TEXT_PIN}`}>
          <title>Increase the box height to show every operand</title>
          …
        </text>
      )}
    </g>
  );
}
