import { BLOCK_W, HEADER_H, PIN_PITCH, blockHeight, type FbdKind } from './model';
import { CANVAS_FONT_FAMILY } from '../canvas/components/symbols/theme';

/** IEC 61131-3 function-block markings. */
export const SYMBOL: Readonly<Record<FbdKind, string>> = {
  input: '',
  output: '',
  and: '&',
  nand: '&',
  or: '≥1',
  nor: '≥1',
  xor: '=1',
  not: '1',
  ton: 'TON',
  tof: 'TOF',
  sr: 'SR',
};

/** Kinds whose output carries the inversion bubble. */
export const INVERTED: ReadonlySet<FbdKind> = new Set<FbdKind>(['nand', 'nor', 'not']);

/** Miniature of a block for the library, drawn from the same numbers as the canvas symbol. */
export function BlockGlyph({ kind }: { kind: FbdKind }) {
  const pins = Math.min(3, Math.max(1, kind === 'input' ? 0 : kind === 'output' ? 1 : kind === 'not' || kind === 'ton' || kind === 'tof' ? 1 : 2));
  const h = HEADER_H + pins * PIN_PITCH + 10;
  const scale = 0.5;
  return (
    <svg viewBox={`-10 -6 ${BLOCK_W + 20} ${blockHeight('and') + 8}`} width={BLOCK_W * scale + 14} height={44} aria-hidden="true" focusable="false" className="shrink-0">
      <rect
        x={0}
        y={0}
        width={BLOCK_W}
        height={h}
        rx={kind === 'input' || kind === 'output' ? 16 : 3}
        strokeWidth={3}
        className="fill-white stroke-slate-500 dark:fill-slate-900 dark:stroke-slate-400"
      />
      <text
        x={BLOCK_W / 2}
        y={h / 2 + 8}
        textAnchor="middle"
        fontFamily={CANVAS_FONT_FAMILY}
        fontSize={kind === 'input' || kind === 'output' ? 26 : 30}
        fontWeight={600}
        className="fill-slate-800 font-sans dark:fill-slate-100"
      >
        {kind === 'input' ? 'I' : kind === 'output' ? 'Q' : SYMBOL[kind]}
      </text>
      {INVERTED.has(kind) && <circle cx={BLOCK_W + 5} cy={h / 2} r={5} strokeWidth={2.5} className="fill-white stroke-slate-500 dark:fill-slate-900 dark:stroke-slate-400" />}
    </svg>
  );
}
