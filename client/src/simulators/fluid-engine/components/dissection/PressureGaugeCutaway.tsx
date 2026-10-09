import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { GaugeAnalysis } from './cutawayPhysics';
import { Gauge } from './AirReservoirCutaway';
import { CutawayDefs, EDGE_WIDTH, PortTag, SANS, fluidTint, hatchFill, type CutawayStageProps } from './cutawayParts';

/** Scale of the dial relative to the micro gauge on the air receiver; it is the very same component, enlarged. */
export const DIAL_SCALE = 3;
const DIAL = { cx: 390, cy: 120 };

/** Standalone pressure gauge: the receiver's dial and needle, magnified, on a Bourdon-style socket with its single pressure port. */
export function PressureGaugeCutaway({ analysis, medium, theme, idPrefix = 'gauge' }: CutawayStageProps & { analysis: GaugeAnalysis }) {
  const tr = useFluidT();
  const tint = fluidTint(analysis.pressure, medium);
  return (
    <svg viewBox="0 0 780 380" role="img" aria-label="Pressure gauge cutaway" data-testid="cutaway-gauge" data-bar={analysis.pressure.toFixed(2)} style={{ width: '100%', height: 'auto', maxHeight: 400, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <rect className="valve-body" x={350} y={230} width={80} height={90} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={380} y={230} width={20} height={90} fill={theme.bore} />
      <rect x={380} y={230} width={20} height={90} fill={tint.fill} opacity={tint.opacity} />
      <rect x={370} y={215} width={40} height={16} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <g transform={`translate(${DIAL.cx},${DIAL.cy}) scale(${DIAL_SCALE}) translate(${-DIAL.cx / 1},${-DIAL.cy / 1})`} style={{ transformOrigin: '0 0' }}>
        <Gauge bar={analysis.pressure} theme={theme} cx={DIAL.cx} cy={DIAL.cy} />
      </g>
      <PortTag x={450} y={310} label="1" bar={analysis.pressure} theme={theme} anchor="start" />
      <text x={390} y={364} textAnchor="middle" fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.gauge.caption')}</text>
    </svg>
  );
}
