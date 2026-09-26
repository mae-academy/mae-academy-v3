import { useMemo, useRef } from 'react';
import type { BlockState } from '../engine/blocks';
import { toMs } from '../engine/time';
import { BLOCK_SPECS, type Bit, type BlockType, type ConnectorRef, type LogoBlock, type LogoProgram } from '../engine/types';
import { FBD, layoutFbd, type FbdEdge, type PlacedNode } from './fbd-layout';
import { usePortLabelAudit } from './label-audit';
import { LabelCanvas } from './LabelCanvas';
import { PortLabel } from './PortLabel';
import { supplyVars } from './wire';

/** IEC 61131-3 / LOGO! short names shown in the block header. */
const MNEMONIC: Readonly<Record<BlockType, string>> = {
  AND: 'AND',
  AND_EDGE: 'AND ↑',
  NAND: 'NAND',
  NAND_EDGE: 'NAND ↓',
  OR: 'OR',
  NOR: 'NOR',
  XOR: 'XOR',
  NOT: 'NOT',
  ON_DELAY: 'TON',
  OFF_DELAY: 'TOF',
  ON_OFF_DELAY: 'TONOF',
  RETENTIVE_ON_DELAY: 'TONR',
  WIPING_RELAY: 'TP',
  PULSE_GENERATOR: 'PULSE',
  STAIRWAY: 'STAIR',
  UP_DOWN_COUNTER: 'CTUD',
  LATCHING_RELAY: 'RS',
  PULSE_RELAY: 'TFF',
};

/** Body symbol of the basic functions (IEC 60617). */
const GF_SYMBOL: Partial<Readonly<Record<BlockType, string>>> = {
  AND: '&',
  AND_EDGE: '&',
  NAND: '&',
  NAND_EDGE: '&',
  OR: '≥1',
  NOR: '≥1',
  XOR: '=1',
  NOT: '1',
};
const INVERTED_OUTPUT: ReadonlySet<BlockType> = new Set<BlockType>(['NAND', 'NAND_EDGE', 'NOR', 'NOT']);

const seconds = (ms: number): string => (ms / 1000).toFixed(ms < 10_000 ? 2 : 1);

/** Live annotation in the block body: accumulator vs. preset for timers and counters. */
function liveText(block: LogoBlock, state: BlockState, running: boolean): string | null {
  const p = block.params;
  const preset = p.T ?? p.TH;
  switch (block.type) {
    case 'ON_DELAY':
    case 'OFF_DELAY':
    case 'RETENTIVE_ON_DELAY':
    case 'WIPING_RELAY':
    case 'STAIRWAY':
    case 'ON_OFF_DELAY':
    case 'PULSE_GENERATOR':
      return preset ? `${running ? seconds(state.ta) : '0.00'} / ${seconds(toMs(preset))} s` : null;
    case 'UP_DOWN_COUNTER':
      return `Cnt ${running ? state.cnt : 0} / ${p.On ?? 0}`;
    case 'LATCHING_RELAY':
    case 'PULSE_RELAY':
      return `Q = ${running ? state.q : 0}`;
    default:
      return null;
  }
}

export interface FbdViewerProps {
  readonly program: LogoProgram;
  /** Kept for callers that pass the voltage class; both classes share one colour scheme. */
  readonly ac?: boolean;
  readonly running: boolean;
  readonly level: (ref: ConnectorRef) => Bit;
  readonly blockState: (id: number) => BlockState;
}

const MUTED = 'fill-slate-500 dark:fill-slate-400';
const TEXT = 'fill-slate-900 dark:fill-slate-100';

function edgePath(edge: FbdEdge): string {
  return edge.points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

function Terminal({ placed, high, readBack }: { placed: PlacedNode; high: boolean; readBack: boolean }) {
  const { node, x, y, w, h } = placed;
  const ref: ConnectorRef | null = node.kind === 'source' ? node.ref : node.kind === 'sink' ? node.sink.target : null;
  if (!ref) return null;
  const constant = ref.kind === 'hi' || ref.kind === 'lo';
  const name =
    ref.kind === 'digital-input' ? `I${ref.index}` : ref.kind === 'digital-output' ? `Q${ref.index}` : ref.kind === 'digital-flag' ? `M${ref.index}` : null;
  return (
    <g data-fbd-terminal={name ?? ref.kind} data-high={high}>
      <rect x={x} y={y} width={w} height={h} rx={4} strokeWidth={1.5} className={high ? 'fill-(--lb-live)/10 stroke-(--lb-live)' : 'fill-white stroke-slate-300 dark:fill-[#0B0F17] dark:stroke-slate-700'} />
      {name ? (
        <PortLabel x={x + w / 2} y={y + h / 2} name={name} size={12} target={[x + w / 2, y + h / 2]} className="text-slate-800 dark:text-slate-100" />
      ) : (
        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} className={TEXT}>
          {constant ? ref.kind : ''}
        </text>
      )}
      {readBack && (
        <text x={x + w / 2} y={y + h + 10} textAnchor="middle" fontSize={8} fontWeight={700} className={MUTED}>
          prev. cycle
        </text>
      )}
    </g>
  );
}

function Block({ placed, block, state, running, high, pinHigh }: { placed: PlacedNode; block: LogoBlock; state: BlockState; running: boolean; high: boolean; pinHigh: (net: string | null) => boolean }) {
  const { x, y, w, h, pins } = placed;
  const symbol = GF_SYMBOL[block.type];
  const live = liveText(block, state, running);
  const outY = placed.out?.[1] ?? y;
  const inverted = INVERTED_OUTPUT.has(block.type);
  return (
    <g data-fbd-block={`B${block.id}`} data-high={high}>
      <rect x={x} y={y} width={w} height={h} rx={4} strokeWidth={1.5} className={high ? 'fill-white stroke-(--lb-live) dark:fill-[#0B0F17]' : 'fill-white stroke-slate-400 dark:fill-[#0B0F17] dark:stroke-slate-600'} />
      <rect x={x} y={y} width={w} height={FBD.header - 4} rx={4} className="fill-slate-100 dark:fill-slate-800" />
      <text x={x + 8} y={y + 13} fontSize={10} fontWeight={800} className={TEXT}>
        {`B${String(block.id).padStart(2, '0')}: ${MNEMONIC[block.type]}`}
      </text>
      {pins.map((pin) => (
        <g key={pin.name}>
          <line x1={x - 6} y1={pin.y} x2={x} y2={pin.y} strokeWidth={1.5} className={pinHigh(pin.net) ? 'stroke-(--lb-live)' : 'stroke-slate-400 dark:stroke-slate-600'} />
          {pin.invert && <circle cx={x - 3} cy={pin.y} r={3} strokeWidth={1.5} className="fill-white stroke-slate-500 dark:fill-[#0B0F17] dark:stroke-slate-300" />}
          <text x={x + 5} y={pin.y + 3.5} fontSize={9} fontWeight={600} className={MUTED}>
            {BLOCK_SPECS[block.type].family === 'GF' ? '' : pin.name}
          </text>
          {pin.net === null && (
            <text x={x - 10} y={pin.y + 3} textAnchor="end" fontSize={9} fontWeight={700} className={MUTED}>
              x
            </text>
          )}
        </g>
      ))}
      {symbol && (
        <text x={x + w / 2} y={y + FBD.header + (h - FBD.header) / 2 + 5} textAnchor="middle" fontSize={16} fontWeight={800} className={TEXT}>
          {symbol}
        </text>
      )}
      {live && (
        <text x={x + w / 2 + 8} y={y + h - 8} textAnchor="middle" fontSize={9.5} fontWeight={700} className={`font-mono tabular-nums ${high ? 'fill-(--lb-live)' : MUTED}`} data-fbd-live={`B${block.id}`}>
          {live}
        </text>
      )}
      <line x1={x + w} y1={outY} x2={x + w + 6} y2={outY} strokeWidth={1.5} className={high ? 'stroke-(--lb-live)' : 'stroke-slate-400 dark:stroke-slate-600'} />
      {inverted && <circle cx={x + w + 3} cy={outY} r={3} strokeWidth={1.5} className="fill-white stroke-slate-500 dark:fill-[#0B0F17] dark:stroke-slate-300" />}
    </g>
  );
}

/**
 * Function block diagram of the circuit program in LOGO! memory, laid out left (sources) to right
 * (outputs). While the controller runs, every wire carrying a 1 is drawn in the voltage-class accent
 * with a moving dash, and timers / counters show their live accumulator.
 */
export function FbdViewer({ program, running, level, blockState }: FbdViewerProps) {
  const layout = useMemo(() => layoutFbd(program), [program]);
  const rootRef = useRef<HTMLDivElement>(null);
  usePortLabelAudit(rootRef, 'FBD');
  const high = (ref: ConnectorRef): boolean => running && level(ref) === 1;
  const netHigh = new Map<string, boolean>();
  for (const edge of layout.edges) netHigh.set(edge.net, high(edge.ref));
  const pinHigh = (net: string | null): boolean => (net === null ? false : netHigh.get(net) === true);

  if (program.sinks.length === 0) {
    return <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">No circuit program in LOGO! memory.</p>;
  }

  return (
    <LabelCanvas
      width={layout.width}
      height={layout.height}
      maxHeight={`${Math.max(240, layout.height * 1.15)}px`}
      wrapperRef={rootRef}
      className={supplyVars()}
      svgClassName="select-none"
      role="img"
      aria-label={`Function block diagram: ${program.blocks.length} blocks, ${program.sinks.length} outputs`}
      data-fbd="true"
    >
      <style>{`
        .lb-flow { stroke-dasharray: 6 4; animation: lb-flow 0.6s linear infinite; }
        @keyframes lb-flow { to { stroke-dashoffset: -10; } }
        @media (prefers-reduced-motion: reduce) { .lb-flow { animation: none; } }
      `}</style>
      <rect width={layout.width} height={layout.height} rx={10} strokeWidth={1} className="fill-slate-50 stroke-slate-200 dark:fill-[#020617] dark:stroke-slate-800" />
      {layout.edges.map((edge, index) => {
        const on = netHigh.get(edge.net) === true;
        return (
          <path
            key={index}
            d={edgePath(edge)}
            fill="none"
            strokeWidth={on ? 2 : 1.5}
            strokeLinejoin="round"
            data-net={edge.net}
            data-high={on}
            className={on ? 'lb-flow stroke-(--lb-live)' : 'stroke-slate-400 dark:stroke-slate-600'}
          />
        );
      })}
      {layout.nodes.map((placed) => {
        const { node } = placed;
        if (node.kind === 'block') {
          const ref: ConnectorRef = { kind: 'block-output', blockId: node.block.id };
          return <Block key={node.key} placed={placed} block={node.block} state={blockState(node.block.id)} running={running} high={high(ref)} pinHigh={pinHigh} />;
        }
        const ref = node.kind === 'source' ? node.ref : node.sink.target;
        const readBack = node.kind === 'source' && (node.ref.kind === 'digital-output' || node.ref.kind === 'digital-flag');
        return <Terminal key={node.key} placed={placed} high={high(ref)} readBack={readBack} />;
      })}
    </LabelCanvas>
  );
}
