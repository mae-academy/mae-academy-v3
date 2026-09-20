import type { CoilNode } from '../../../../domain/ast';
import { CELL_WIDTH } from '../../geometry';
import { TEXT_ADDRESS, textLive, wireClass } from './theme';

export interface CoilSymbolProps {
  x: number;
  y: number;
  variant: CoilNode['variant'];
  /** Text drawn between the parentheses: `S`, `R`, `MCR`, `MCRE`, or nothing for a plain output. */
  glyph?: string;
  flowIn: boolean;
  flowOut: boolean;
  /** The coil is energised. */
  active: boolean;
  selected?: boolean;
}

/**
 * `--( )--`, `--( S )--`, `--( R )--`. The parentheses are true circular arcs of radius 17.5 across
 * a 28 px chord, which puts their extreme points exactly 7 px out — on whole pixels, so the leads
 * meet them with no gap and no overlap.
 */
const LEFT_LEAD_END = 33;
const RIGHT_LEAD_START = 67;
const ARC_HALF = 14;
const ARC_RADIUS = 17.5;

export function CoilSymbol({ x, y, variant, glyph, flowIn, flowOut, active, selected = false }: CoilSymbolProps) {
  const body = selected
    ? 'stroke-indigo-600 dark:stroke-sky-400 [filter:drop-shadow(0_0_3px_rgba(99,102,241,0.5))]'
    : `${wireClass(active)} transition-colors group-hover:stroke-indigo-500 dark:group-hover:stroke-sky-400`;
  return (
    <g fill="none" strokeWidth={2} data-symbol={`coil-${variant}`}>
      <g shapeRendering="crispEdges">
        <path d={`M ${x} ${y} H ${x + LEFT_LEAD_END}`} className={wireClass(flowIn)} />
        <path d={`M ${x + RIGHT_LEAD_START} ${y} H ${x + CELL_WIDTH}`} className={wireClass(flowOut)} />
      </g>
      <path
        d={`M ${x + 40} ${y - ARC_HALF} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 0 ${x + 40} ${y + ARC_HALF}`}
        className={body}
      />
      <path
        d={`M ${x + 60} ${y - ARC_HALF} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${x + 60} ${y + ARC_HALF}`}
        className={body}
      />
      {glyph !== undefined && glyph !== '' && (
        <text
          x={x + CELL_WIDTH / 2}
          y={y + 4}
          textAnchor="middle"
          fontSize={glyph.length > 1 ? 9 : 12}
          fontWeight={700}
          stroke="none"
          className={`font-mono ${textLive(active, TEXT_ADDRESS)}`}
        >
          {glyph}
        </text>
      )}
    </g>
  );
}
