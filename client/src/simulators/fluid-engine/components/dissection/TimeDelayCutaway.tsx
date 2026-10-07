import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { TimerAnalysis } from './cutawayPhysics';
import { Gauge } from './AirReservoirCutaway';
import { CutawayDefs, EDGE_WIDTH, FlowStream, PortTag, SANS, chargeColor, hatchFill, type CutawayStageProps } from './cutawayParts';
import { ONEWAY_BODY, OneWayCore, Port, VENTED_BAR, VentArrow, oneWayPaths, streamWidth } from './FlowControlCutaways';
import { SpoolValveCutaway } from './SpoolValveCutaway';

/**
 * Layout of the block. Three stages stack inside one 580 px wide housing (x 100 … 680):
 *   upper         y  80 … 260   needle throttle with a parallel check valve (the one-way flow control core)
 *   intermediate  y 260 … 356   accumulation chamber; the throttle's outlet manifold drops into it from above
 *   lower         y 392 … 508   the 3/2 NC spool valve, scaled to the housing width, its pilot face fed from the chamber
 */
export const TIMER = {
  body: { x: ONEWAY_BODY.x, width: ONEWAY_BODY.width },
  chamber: { y: 260, height: 96, cavityX: 122, cavityY: 270, cavityWidth: 528, cavityHeight: 76 },
  /** Port 12 on the throttle axis, and where the outlet manifold enters the chamber. */
  manifoldX: 630,
  chamberAxis: 308,
  /** The spool valve's native stage is 740 px wide (x 20 … 760 on a -90 … 870 sheet); it is drawn at this scale and offset. */
  spoolScale: ONEWAY_BODY.width / 740,
  spoolOffset: { x: 100 - 110 * (ONEWAY_BODY.width / 740), y: 392 - 96 * (ONEWAY_BODY.width / 740) },
  gauge: { cx: 740, cy: 308 },
} as const;

/** x of the spool valve's left pilot channel in the timer's own coordinates. */
export const pilotChannelX = (): number => TIMER.spoolOffset.x + (70 + 90) * TIMER.spoolScale;

const clear = { fill: 'transparent', opacity: 0 };
const gasTint = (bar: number, supply: number) => (bar > 0.01 ? { fill: chargeColor(bar / Math.max(supply, 0.001)), opacity: 1 } : clear);

/**
 * Sectional view of the on-delay timer. Pressure on port 12 passes the needle (its gap follows the throttle opening) and
 * fills the accumulation chamber; the chamber presses on the pilot face of the 3/2 valve below, whose spring holds it shut
 * until the chamber reaches the cracking pressure, when it snaps open. When the signal is removed the check valve in the
 * bypass lifts and the chamber empties backwards at once, so the spring returns the spool.
 */
export function TimeDelayCutaway({ analysis, medium, theme, idPrefix = 'timer' }: CutawayStageProps & { analysis: TimerAnalysis }) {
  const tr = useFluidT();
  const { body, chamber, manifoldX, gauge } = TIMER;
  const signal = gasTint(analysis.signalBar, analysis.supply);
  const inChamber = gasTint(analysis.chamberBar, analysis.supply);
  const free = analysis.direction === -1;
  const { throttle, around } = oneWayPaths(analysis.opening, 'down', TIMER.chamberAxis);
  const pilotX = pilotChannelX();
  const channelHalf = 12 * TIMER.spoolScale;
  const chamberGas = chargeColor(analysis.ratio);
  const label = (x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'start') => <text x={x} y={y} textAnchor={anchor} fontSize={11} fontFamily={SANS} fill={theme.muted}>{text}</text>;
  const stats = [
    [tr('cutaway.timer.signal'), `${analysis.signalBar.toFixed(1)} bar`],
    [tr('cutaway.timer.chamber'), `${analysis.chamberBar.toFixed(1)} / ${analysis.threshold.toFixed(1)} bar`],
    [tr('cutaway.timer.remaining'), analysis.remaining !== null && Number.isFinite(analysis.remaining) ? `${analysis.remaining.toFixed(1)} s` : '–'],
  ];

  return (
    <svg viewBox="0 0 960 690" role="img" aria-label="Time delay valve cutaway" data-testid="cutaway-timer" data-phase={analysis.phase} data-opening={analysis.opening} data-spool={analysis.open ? 'open' : 'closed'} data-ratio={analysis.ratio.toFixed(3)} style={{ width: '100%', height: 'auto', maxHeight: 700, display: 'block', direction: 'ltr' }}>
      <CutawayDefs id={idPrefix} theme={theme} />

      {/* upper stage: port 12, needle throttle and check-valve bypass */}
      <Port x0={76} x1={body.x} y={170} half={15} tint={signal} theme={theme} />
      <OneWayCore opening={analysis.opening} free={free} left={signal} right={inChamber} theme={theme} idPrefix={idPrefix} rightOpening={false} />

      {/* intermediate stage: the accumulation chamber and its feed from the throttle outlet */}
      <rect className="chamber-body" x={body.x} y={chamber.y} width={body.width} height={chamber.height} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="accumulation-chamber" x={chamber.cavityX} y={chamber.cavityY} width={chamber.cavityWidth} height={chamber.cavityHeight} rx={14} fill={theme.bore} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="chamber-fill" x={chamber.cavityX} y={chamber.cavityY} width={chamber.cavityWidth} height={chamber.cavityHeight} rx={14} fill={chamberGas} />
      <rect x={manifoldX - 20} y={228} width={40} height={50} fill={theme.bore} />
      <rect className="chamber-feed" x={manifoldX - 20} y={228} width={40} height={50} fill={inChamber.fill} opacity={inChamber.opacity} />
      {/* pilot line from the chamber down to the spool's pilot face, and the gauge pipe to the right */}
      <rect className="pilot-line" x={pilotX - channelHalf - 6} y={chamber.y + chamber.height} width={2 * channelHalf + 12} height={26} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={pilotX - channelHalf} y={chamber.cavityY + chamber.cavityHeight - 4} width={2 * channelHalf} height={chamber.y + chamber.height + 30 - (chamber.cavityY + chamber.cavityHeight) + 4} fill={chamberGas} />
      <rect className="gauge-pipe" x={body.x + body.width - 6} y={TIMER.chamberAxis - 12} width={gauge.cx - 36 - 5 - (body.x + body.width - 6)} height={24} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={chamber.cavityX + chamber.cavityWidth - 2} y={TIMER.chamberAxis - 7} width={gauge.cx - 36 - 5 - (chamber.cavityX + chamber.cavityWidth - 2)} height={14} fill={chamberGas} />
      <Gauge bar={analysis.chamberBar} theme={theme} cx={gauge.cx} cy={gauge.cy} mark={analysis.threshold} />

      {/* lower stage: the 3/2 NC spool valve, pilot face exposed to the chamber */}
      <SpoolValveCutaway
        analysis={analysis.spool}
        medium={medium}
        theme={theme}
        idPrefix={`${idPrefix}-spool`}
        svgProps={{ x: TIMER.spoolOffset.x, y: TIMER.spoolOffset.y, width: 960 * TIMER.spoolScale, height: 330 * TIMER.spoolScale, style: { overflow: 'visible' } }}
      />

      {/* streamlines */}
      {analysis.direction === 1 && <FlowStream points={throttle} width={streamWidth(analysis.opening)} radius={14} />}
      {free && [-1, 1].map(sign => <FlowStream key={sign} points={around(sign as 1 | -1)} width={6} radius={14} />)}
      {free && analysis.signalBar <= VENTED_BAR && <VentArrow x={72} y={170} direction={-1} />}

      <PortTag x={88} y={132} label="12" bar={analysis.signalBar} theme={theme} />
      <text x={470} y={40} fontSize={13} fontFamily={SANS} fill={theme.text} data-testid="needle-label">{tr('cutaway.flow.needle', { opening: Math.round(analysis.opening) })}</text>

      {/* stage captions */}
      {label(704, 100, tr('cutaway.timer.stageUpper'))}
      {label(704, 182, tr('cutaway.timer.stageBypass'))}
      {label(704, 262, tr('cutaway.timer.stageChamber'))}
      {label(704, 396, tr('cutaway.timer.stageSpool'))}
      {label(704, 412, tr(analysis.open ? 'cutaway.timer.spoolOpen' : 'cutaway.timer.spoolClosed'))}
      {label(gauge.cx, gauge.cy + 58, tr('cutaway.timer.gauge'), 'middle')}

      <g data-testid="timer-hud" fontFamily={SANS}>
        {stats.map(([name, value], index) => (
          <g key={name} transform={`translate(${96 + index * 250},625)`}>
            <text fontSize={11} fill={theme.muted}>{name}</text>
            <text y={20} fontSize={15} fontWeight={700} fill={theme.text}>{value}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
