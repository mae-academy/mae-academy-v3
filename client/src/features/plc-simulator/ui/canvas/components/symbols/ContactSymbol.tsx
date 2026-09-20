import type { ContactVariant } from '../../../../domain/ast';
import { CELL_WIDTH } from '../../geometry';
import { TEXT_ADDRESS, textLive, wireClass } from './theme';

export interface ContactSymbolProps {
  /** X of the cell's left edge. */
  x: number;
  /** Y of the wire through the cell. */
  y: number;
  variant: ContactVariant;
  flowIn: boolean;
  flowOut: boolean;
  /** The contact is currently passing power (bars are drawn energised). */
  closed: boolean;
  selected?: boolean;
}

/** Bar positions inside the 100 px cell; the leads run from each cell edge to the bars. */
const LEFT_BAR = 32;
const RIGHT_BAR = 68;
const BAR_HALF = 14;

/**
 * `--[ ]--`, `--[/]--`, `--[P]--`, `--[N]--`. Pure geometry: both leads reach the cell edges, so a
 * contact bridges column boundaries `c` and `c + 1` without any help from the wire layer.
 */
export function ContactSymbol({ x, y, variant, flowIn, flowOut, closed, selected = false }: ContactSymbolProps) {
  const bar = selected
    ? 'stroke-indigo-600 dark:stroke-sky-400 [filter:drop-shadow(0_0_3px_rgba(99,102,241,0.5))]'
    : `${wireClass(closed)} transition-colors group-hover:stroke-indigo-500 dark:group-hover:stroke-sky-400`;
  return (
    <g fill="none" strokeWidth={2} shapeRendering="crispEdges" data-symbol={`contact-${variant}`}>
      <path d={`M ${x} ${y} H ${x + LEFT_BAR}`} className={wireClass(flowIn)} />
      <path d={`M ${x + RIGHT_BAR} ${y} H ${x + CELL_WIDTH}`} className={wireClass(flowOut)} />
      <path d={`M ${x + LEFT_BAR} ${y - BAR_HALF} V ${y + BAR_HALF}`} className={bar} />
      <path d={`M ${x + RIGHT_BAR} ${y - BAR_HALF} V ${y + BAR_HALF}`} className={bar} />
      {variant === 'NC' && (
        <path
          d={`M ${x + LEFT_BAR + 6} ${y + BAR_HALF - 2} L ${x + RIGHT_BAR - 6} ${y - BAR_HALF + 2}`}
          className={bar}
          shapeRendering="geometricPrecision"
        />
      )}
      {(variant === 'P' || variant === 'N') && (
        <text
          x={x + CELL_WIDTH / 2}
          y={y + 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          stroke="none"
          className={`font-mono ${textLive(closed, TEXT_ADDRESS)}`}
        >
          {variant}
        </text>
      )}
    </g>
  );
}
