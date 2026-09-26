import type { KeyboardEvent } from 'react';
import type { PanelFrame, PanelKey } from '../firmware/panel';
import type { DeviceSpec } from '../hardware/devices';
import {
  BARRIER_X,
  BOTTOM_SCREW_Y,
  DEVICE,
  INPUT_TERMINAL_X,
  KEYPAD,
  CMD_KEY_SIZE,
  KEY_SIZE,
  LCD,
  OUTPUT_TERMINAL_X,
  SCREW_R,
  SUPPLY_TERMINAL_X,
  TOP_SCREW_Y,
} from './geometry';
import { PortLabel } from './PortLabel';
import type { Tone } from './wire';

export interface LogoDeviceProps {
  readonly spec: DeviceSpec;
  readonly powered: boolean;
  readonly runLed: 'green' | 'red' | null;
  readonly frame: PanelFrame;
  /** Terminal voltage of I1..I8 and of the supply pair, shown beside each screw. */
  readonly inputVolts: readonly number[];
  readonly supplyVolts: readonly [number, number];
  /** Q1..Q4 relay contact closed. */
  readonly relays: readonly boolean[];
  readonly cardLoaded: boolean;
  readonly flash: PanelKey | null;
  readonly onKey: (key: PanelKey) => void;
}

const KEY_META: Readonly<Record<PanelKey, { readonly glyph: string; readonly name: string }>> = {
  up: { glyph: '', name: 'Up' },
  down: { glyph: '', name: 'Down' },
  left: { glyph: '', name: 'Left' },
  right: { glyph: '', name: 'Right' },
  ok: { glyph: 'OK', name: 'OK' },
  esc: { glyph: 'ESC', name: 'Escape' },
};
/** One triangle for all four arrows, rotated about its own bbox centre (10 x 10 in every orientation): identical footprint and stroke. */
const ARROW_ROTATION: Readonly<Partial<Record<PanelKey, number>>> = { up: 0, right: 90, down: 180, left: 270 };
const ARROW_PATH = 'M 0 -5 L 5 5 L -5 5 Z';
const KEY_ORDER: readonly PanelKey[] = ['esc', 'up', 'ok', 'left', 'down', 'right'];

function Screw({ x, y, live, tone = 'hot' }: { x: number; y: number; live: boolean; tone?: Tone }) {
  const ring = live ? (tone === 'ret' ? 'stroke-(--lb-ret)' : 'stroke-(--lb-live)') : 'stroke-slate-400 dark:stroke-slate-600';
  return (
    <g>
      <circle cx={x} cy={y} r={SCREW_R} strokeWidth={live ? 2 : 1.5} className={`fill-slate-100 dark:fill-slate-800 ${ring}`} />
      <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} strokeWidth={2} strokeLinecap="round" className="stroke-slate-500" />
    </g>
  );
}

/**
 * Terminal designation (KaTeX) + live voltage readout, anchored to the screw position using
 * absolute SVG coordinates. The `<PortLabel>` embeds a `<foreignObject>` whose position is
 * expressed in the root viewBox space so it scales, pans and translates with the chassis.
 *
 * `data-terminal-id` / `data-label-id` let the layout audit cross-check anchor ↔ label distance.
 */
function TerminalTag({ x, name, volts }: { x: number; name: string; volts: number }) {
  return (
    <g pointerEvents="none" data-terminal-id={name}>
      <PortLabel x={x} y={TOP_SCREW_Y + 20} name={name} size={10} target={[x, TOP_SCREW_Y]} />
      <text x={x} y={TOP_SCREW_Y + 36} textAnchor="middle" fontSize={8} fontWeight={700} data-label-id={name} className={`tabular-nums ${volts > 0 ? 'fill-(--lb-live)' : 'fill-slate-500'}`}>
        {`${volts}V`}
      </text>
    </g>
  );
}

function LcdGlass({ frame }: { frame: PanelFrame }) {
  const width = LCD.cols * LCD.cellW;
  const height = LCD.rows * LCD.cellH;
  const off = frame.backlight === 'off';
  const inverted = (line: number, col: number): boolean =>
    frame.inverted.some((run) => run.line === line && col >= run.col && col < run.col + run.length) ||
    (frame.cursor?.line === line && frame.cursor.col === col);
  const label = frame.lines.map((line) => line.trimEnd()).filter(Boolean).join(' | ');
  // Digital Multimeter screen tokens.
  const ink = 'fill-[#0369a1] dark:fill-[#38bdf8]';

  return (
    <g role="img" aria-label={`Display: ${label || 'blank'}`} data-backlight={frame.backlight}>
      <rect x={LCD.x - 8} y={LCD.y - 8} width={width + 16} height={height + 16} rx={4} className="fill-slate-200 stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-700" />
      <rect x={LCD.x} y={LCD.y} width={width} height={height} rx={2} className={off ? 'fill-slate-300 dark:fill-slate-900' : 'fill-[#e0f2fe] stroke-[#bae6fd] dark:fill-[#082f49] dark:stroke-[#0369a1]'} />
      {/* inset shadow: darker top and left edge of the glass */}
      <path d={`M ${LCD.x} ${LCD.y + height} V ${LCD.y} H ${LCD.x + width}`} fill="none" strokeWidth={2} className="stroke-slate-900/20 dark:stroke-black/50" />
      {frame.inverted.map((run, index) => (
        <rect key={index} data-inverted="true" x={LCD.x + run.col * LCD.cellW} y={LCD.y + run.line * LCD.cellH + 2} width={run.length * LCD.cellW} height={LCD.cellH - 3} className={ink} />
      ))}
      {frame.cursor && (
        <rect className={`animate-pulse ${ink}`} data-cursor="true" x={LCD.x + frame.cursor.col * LCD.cellW} y={LCD.y + frame.cursor.line * LCD.cellH + 2} width={LCD.cellW} height={LCD.cellH - 3} />
      )}
      {frame.lines.map((line, row) => (
        <text key={row} data-lcd-line={row} xmlSpace="preserve" fontSize={16} fontWeight={600} y={LCD.y + row * LCD.cellH + 17} className="font-mono">
          {Array.from(line).map((char, col) => (
            <tspan key={col} x={LCD.x + col * LCD.cellW + LCD.cellW / 2} textAnchor="middle" className={inverted(row, col) ? 'fill-[#e0f2fe] dark:fill-[#082f49]' : ink}>
              {char}
            </tspan>
          ))}
        </text>
      ))}
    </g>
  );
}

/**
 * SIMATIC LOGO! Basic unit, front view (spec §1.2 component map): supply + input terminal strip,
 * LCD, six-key membrane keypad, RUN/STOP LED, program-module slot, relay windows and the
 * two-screw Q terminals, expansion interface on the right edge. Flat, token-coloured, no gradients.
 */
export function LogoDevice({ spec, powered, runLed, frame, inputVolts, supplyVolts, relays, cardLoaded, flash, onKey }: LogoDeviceProps) {
  const { x, y, w, h } = DEVICE;
  const supplyLabels = [spec.supply.hot, spec.supply.ret];
  const flat = 'fill-slate-300 stroke-slate-400 dark:fill-slate-700 dark:stroke-slate-600';

  const keyDown = (key: PanelKey) => (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onKey(key);
  };

  return (
    <g aria-label={`Siemens ${spec.model} controller`} role="group">
      {/* housing */}
      <rect x={x} y={y} width={w} height={h} rx={10} strokeWidth={1.5} className="fill-slate-200 stroke-slate-400 dark:fill-[#1e293b] dark:stroke-slate-600" />
      <rect x={x + 10} y={y + 6} width={w - 20} height={36} rx={4} className={flat} />
      <rect x={x + 10} y={BOTTOM_SCREW_Y - 20} width={w - 20} height={40} rx={4} className={flat} />

      {/* expansion interface + coding pins (right edge) */}
      <rect x={x + w - 6} y={250} width={6} height={100} className="fill-slate-300 dark:fill-slate-700" />
      {[236, 362].map((py) => (
        <rect key={py} x={x + w - 4} y={py} width={4} height={8} className="fill-slate-400 dark:fill-slate-600" />
      ))}

      {/* top strip: supply, then I1..I8; the voltage present on each screw is printed under its name */}
      {SUPPLY_TERMINAL_X.map((tx, index) => (
        <g key={`p${index}`} data-terminal={supplyLabels[index]} data-terminal-id={supplyLabels[index]}>
          <Screw x={tx} y={TOP_SCREW_Y} live={powered} tone={index === 0 ? 'hot' : 'ret'} />
          <TerminalTag x={tx} name={supplyLabels[index] ?? ''} volts={supplyVolts[index] ?? 0} />
        </g>
      ))}
      {INPUT_TERMINAL_X.map((tx, index) => {
        const volts = inputVolts[index] ?? 0;
        return (
          <g key={`i${index}`} data-terminal={`I${index + 1}`} data-terminal-id={`I${index + 1}`} data-live={volts > 0}>
            <Screw x={tx} y={TOP_SCREW_Y} live={volts > 0} />
            <TerminalTag x={tx} name={`I${index + 1}`} volts={volts} />
          </g>
        );
      })}
      {/* isolation between supply and inputs; on the 230RC also between input groups I1-I4 / I5-I8 */}
      <line x1={BARRIER_X.supply} y1={158} x2={BARRIER_X.supply} y2={210} strokeWidth={1.5} className="stroke-slate-400 dark:stroke-slate-700" />
      {spec.inputGroups.length > 1 && <line x1={BARRIER_X.group} y1={158} x2={BARRIER_X.group} y2={210} strokeWidth={1.5} strokeDasharray="3 2" className="stroke-slate-400 dark:stroke-slate-700" />}

      {/* front plate */}
      <rect x={x + 14} y={214} width={w - 28} height={290} rx={6} className="fill-slate-100 stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-700" />
      <text x={x + 26} y={238} fontSize={14} fontWeight={800} letterSpacing={2} className="fill-[#00646E] dark:fill-[#00A3A6]">
        SIEMENS
      </text>
      <text x={x + w - 26} y={238} textAnchor="end" fontSize={13} fontWeight={800} className="fill-slate-700 dark:fill-slate-300">
        {spec.model}
      </text>

      <LcdGlass frame={frame} />

      {/* membrane keypad: six identical flat keys */}
      <g role="group" aria-label="Keypad">
        {KEY_ORDER.map((key) => {
          const at = KEYPAD[key];
          const size = ARROW_ROTATION[key] !== undefined ? KEY_SIZE : CMD_KEY_SIZE;
          const pressed = flash === key;
          return (
            <g
              key={key}
              role="button"
              tabIndex={0}
              aria-label={KEY_META[key].name}
              data-pressed={pressed ? 'true' : undefined}
              onClick={() => onKey(key)}
              onKeyDown={keyDown(key)}
              className="group cursor-pointer outline-none"
            >
              <rect
                x={at.x - size.w / 2}
                y={at.y - size.h / 2}
                width={size.w}
                height={size.h}
                rx={3}
                strokeWidth={1.5}
                className={
                  pressed
                    ? 'fill-red-500/20 stroke-red-500'
                    : 'fill-slate-200 stroke-slate-300 group-hover:stroke-red-500 group-focus-visible:stroke-red-500 dark:fill-slate-800 dark:stroke-slate-700'
                }
              />
              {ARROW_ROTATION[key] !== undefined ? (
                <path d={ARROW_PATH} transform={`translate(${at.x} ${at.y}) rotate(${ARROW_ROTATION[key]})`} strokeWidth={1.5} strokeLinejoin="round" pointerEvents="none" className="fill-slate-700 stroke-slate-700 dark:fill-slate-200 dark:stroke-slate-200" />
              ) : (
                <text x={at.x} y={at.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={800} pointerEvents="none" className="fill-slate-700 dark:fill-slate-200">
                  {KEY_META[key].glyph}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* RUN/STOP LED */}
      <circle
        role="img"
        aria-label={`RUN/STOP LED ${runLed ?? 'off'}`}
        cx={440}
        cy={376}
        r={5}
        className={runLed === 'green' ? 'fill-red-500' : runLed === 'red' ? 'fill-slate-500' : 'fill-slate-300 dark:fill-slate-700'}
      />
      <text x={450} y={380} fontSize={9} fontWeight={700} className="fill-slate-600 dark:fill-slate-400">
        RUN/STOP
      </text>

      {/* program-module slot with cap */}
      <g data-card={cardLoaded ? 'programmed' : 'empty'}>
        <rect x={560} y={366} width={140} height={20} rx={3} className="fill-slate-200 stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-700" />
        <rect x={566} y={370} width={cardLoaded ? 58 : 0} height={12} rx={2} className="fill-slate-500" />
        <text x={694} y={380} textAnchor="end" fontSize={8} fontWeight={700} className="fill-slate-600 dark:fill-slate-400">
          {cardLoaded ? 'CARD · PRG' : 'CARD SLOT'}
        </text>
      </g>

      {/* output contacts: a standard SPST switch symbol per Q; the blade swings closed when the output is high */}
      {OUTPUT_TERMINAL_X.map(([x1, x2], index) => {
        const closed = relays[index] === true;
        const cx = (x1 + x2) / 2;
        return (
          <g key={index} data-relay={`Q${index + 1}`} data-terminal-id={`Q${index + 1}`} data-closed={closed}>
            <rect x={x1 - 16} y={402} width={x2 - x1 + 32} height={82} rx={4} className="fill-slate-50 stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-700" />
            <PortLabel x={cx} y={414} name={`Q${index + 1}`} size={11} target={[cx, 446]} pair={false} />
            {[x1, x2].map((px) => (
              <circle key={px} cx={px} cy={446} r={3.5} className={closed ? 'fill-(--lb-live)' : 'fill-slate-400 dark:fill-slate-500'} />
            ))}
            <line
              data-bridge="true"
              x1={x1}
              y1={446}
              x2={x2}
              y2={446}
              strokeWidth={3}
              strokeLinecap="round"
              className={`${closed ? 'stroke-(--lb-live)' : 'stroke-slate-500 dark:stroke-slate-400'}`}
              style={{ transform: `rotate(${closed ? 0 : -32}deg)`, transformOrigin: `${x1}px 446px`, transition: 'transform 90ms ease-out' }}
            />
            <text x={x1} y={466} textAnchor="middle" fontSize={9} fontWeight={700} className="fill-slate-600 dark:fill-slate-400">
              1
            </text>
            <text x={x2} y={466} textAnchor="middle" fontSize={9} fontWeight={700} className="fill-slate-600 dark:fill-slate-400">
              2
            </text>
            <circle role="img" aria-label={`Relay Q${index + 1} ${closed ? 'closed' : 'open'}`} cx={cx} cy={476} r={3} className={closed ? 'fill-(--lb-live)' : 'fill-slate-300 dark:fill-slate-700'} />
            <g data-terminal={`Q${index + 1}.1`} data-terminal-id={`Q${index + 1}.1`}>
              <Screw x={x1} y={BOTTOM_SCREW_Y} live={powered} />
            </g>
            <g data-terminal={`Q${index + 1}.2`} data-terminal-id={`Q${index + 1}.2`}>
              <Screw x={x2} y={BOTTOM_SCREW_Y} live={closed} />
            </g>
          </g>
        );
      })}

      {/* slide interlock */}
      <rect x={x + w - 40} y={y + h - 4} width={26} height={6} rx={2} className="fill-slate-400 dark:fill-slate-600" />
    </g>
  );
}
