import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { QuickExhaustAnalysis } from './cutawayPhysics';
import { CutawayDefs, EDGE_WIDTH, FLOW_BLUE, PortTag, SANS, fluidTint, hatchFill, slideStyle, type CutawayStageProps } from './cutawayParts';

/** Chamber, the three channels and the two seats (Festo SE style: inlet on top, working port on the side, large exhaust below). */
export const CHAMBER = { x: 280, y: 120, width: 240, height: 100 };
export const AXIS_X = 400;
const INLET = { half: 20, top: 20 };
const EXHAUST = { half: 60, bottom: 340 };
const WORK = { y: 170, half: 20, right: 640 };
const DISC = { x0: 304, x1: 496, thickness: 7, rimLift: 12 };
/** Disc centre line when it lies on the exhaust seat / against the inlet seat. */
export const DISC_ON_EXHAUST = CHAMBER.y + CHAMBER.height - 12 - DISC.thickness / 2;
export const DISC_ON_INLET = CHAMBER.y + 8 + DISC.thickness / 2;
export const DISC_TRAVEL = DISC_ON_EXHAUST - DISC_ON_INLET;

/** Diaphragm outline: a flat centre with its rim flexed away from the seat it is sealing. */
export const discPath = (rimSign: 1 | -1): string => {
  const rim = DISC_ON_EXHAUST + rimSign * DISC.rimLift;
  return `M ${DISC.x0} ${rim} Q ${DISC.x0 + 10} ${DISC_ON_EXHAUST - 1} ${DISC.x0 + 34} ${DISC_ON_EXHAUST} H ${DISC.x1 - 34} Q ${DISC.x1 - 10} ${DISC_ON_EXHAUST - 1} ${DISC.x1} ${rim}`;
};

/**
 * Quick exhaust valve: supply inlet (port 1) at the base, working port 2 on the right, wide exhaust (port 3) on top. A flexible disc
 * floats between the two seats. Supply pressure lifts it onto the exhaust seat and the air passes round its rim to port 2; once port 1 is
 * gone, the pressure in the working line drops it onto the inlet seat and port 2 dumps straight out through port 3.
 */
export function QuickExhaustCutaway({ analysis, medium, theme, idPrefix = 'qe' }: CutawayStageProps & { analysis: QuickExhaustAnalysis }) {
  const tr = useFluidT();
  const fill = analysis.mode === 'fill';
  const exhaust = analysis.mode === 'exhaust';
  const lift = fill ? 0 : -DISC_TRAVEL;
  const supply = fluidTint(analysis.supply, medium);
  const work = fluidTint(analysis.work, medium);
  const out = fluidTint(analysis.exhaust, medium);
  const c = CHAMBER;
  const channels = (
    <>
      <rect x={AXIS_X - INLET.half} y={INLET.top} width={2 * INLET.half} height={c.y - INLET.top + 1} />
      <rect x={c.x} y={c.y} width={c.width} height={c.height} />
      <rect x={c.x + c.width - 1} y={WORK.y - WORK.half} width={WORK.right - (c.x + c.width) + 1} height={2 * WORK.half} />
      <rect x={AXIS_X - EXHAUST.half} y={c.y + c.height - 1} width={2 * EXHAUST.half} height={EXHAUST.bottom - (c.y + c.height) + 1} />
    </>
  );

  const H = 360;
  const flipY = (y: number) => H - y;
  /** Small chevron on the passage centreline, pointing along `angle` (degrees, in the unflipped drawing). */
  const arrow = (x: number, y: number, angle: number, key: string) => (
    <polygon key={key} className="flow-arrow" points="-6,-5 6,0 -6,5 -3,0" transform={`translate(${x},${y}) rotate(${angle})`} fill="#FFFFFF" opacity={0.9} pointerEvents="none" />
  );
  const fillRect = (x: number, y: number, w: number, h: number, key: string) => <rect key={key} className="flow-fill" x={x} y={y} width={w} height={h} fill={FLOW_BLUE} opacity={0.85} />;
  const inletRect = { x: AXIS_X - INLET.half, y: INLET.top, w: 2 * INLET.half, h: c.y - INLET.top };
  const exhaustRect = { x: AXIS_X - EXHAUST.half, y: c.y + c.height, w: 2 * EXHAUST.half, h: EXHAUST.bottom - c.y - c.height };

  return (
    <svg viewBox="0 0 780 380" role="img" aria-label="Quick exhaust valve cutaway" data-testid="cutaway-quickExhaust" data-mode={analysis.mode} data-disc-offset={lift} style={{ width: '100%', height: 'auto', maxHeight: 420, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <clipPath id={`${idPrefix}-cavity`}>{channels}</clipPath>
      {/* Drawn with the supply inlet at the top and the exhaust below, then turned over: port 1 ends up at the base, port 3 on top. */}
      <g className="qe-drawing" transform={`translate(0,${H}) scale(1,-1)`}>
        <rect className="valve-body" x={200} y={60} width={440} height={260} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
        <g className="cavity" fill={theme.bore}>{channels}</g>

        {/* pressure tints at rest; while air moves the open passage is one solid blue fill clipped to the cavity */}
        <g clipPath={`url(#${idPrefix}-cavity)`}>
          {!fill && !exhaust && <rect x={inletRect.x} y={inletRect.y} width={inletRect.w} height={inletRect.h} fill={supply.fill} opacity={supply.opacity} />}
          {!fill && !exhaust && <rect x={c.x} y={c.y} width={WORK.right - c.x} height={c.height} fill={work.fill} opacity={work.opacity} />}
          {!fill && !exhaust && <rect x={exhaustRect.x} y={exhaustRect.y} width={exhaustRect.w} height={exhaustRect.h} fill={out.fill} opacity={out.opacity} />}
          {fill && [fillRect(inletRect.x, inletRect.y, inletRect.w, inletRect.h + 1, 'in'), fillRect(c.x, c.y, WORK.right - c.x, c.height, 'work')]}
          {exhaust && [fillRect(c.x, c.y, WORK.right - c.x, c.height, 'work'), fillRect(exhaustRect.x, exhaustRect.y - 1, exhaustRect.w, exhaustRect.h + 1, 'out')]}
        </g>

        {/* seats: two lips round the inlet, two round the exhaust opening */}
        {[[AXIS_X - 54, AXIS_X - INLET.half - 2], [AXIS_X + INLET.half + 2, AXIS_X + 54]].map(([a, b]) => <polygon key={a} className="inlet-seat" points={`${a},${c.y} ${b},${c.y} ${b},${c.y + 8} ${a},${c.y + 8}`} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />)}
        {[[c.x + 24, AXIS_X - EXHAUST.half], [AXIS_X + EXHAUST.half, c.x + c.width - 24]].map(([a, b]) => <polygon key={a} className="exhaust-seat" points={`${a},${c.y + c.height - 12} ${b},${c.y + c.height - 12} ${b},${c.y + c.height} ${a},${c.y + c.height}`} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />)}
        <path d={`M ${AXIS_X - INLET.half} ${INLET.top} V ${c.y} M ${AXIS_X + INLET.half} ${INLET.top} V ${c.y}`} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} fill="none" />

        {/* the rubber disc: slides between the seats; its rim flexes away from the seat it seals */}
        <g className="qe-disc" data-state={fill ? 'on-exhaust' : 'on-inlet'} data-offset={lift} style={slideStyle(0, lift, 120)}>
          <path d={discPath(fill ? -1 : 1)} fill="none" stroke="#1F2937" strokeWidth={DISC.thickness} strokeLinecap="round" strokeLinejoin="round" />
          <path d={discPath(fill ? -1 : 1)} fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" transform="translate(0,-1.5)" />
        </g>

        {/* direction of flow along the centreline of the open passage */}
        {fill && [60, 100].map(y => arrow(AXIS_X, y, 90, `in${y}`))}
        {fill && [c.x + c.width + 10, c.x + c.width + 60, c.x + c.width + 110].map(x => arrow(x, WORK.y, 0, `w${x}`))}
        {exhaust && [WORK.right - 30, WORK.right - 90, c.x + c.width - 30].map(x => arrow(x, WORK.y, 180, `w${x}`))}
        {exhaust && [250, 290, 330].map(y => arrow(AXIS_X, y, 90, `out${y}`))}
      </g>
      {exhaust && <path className="atmosphere-arrow" d={`M ${AXIS_X} ${flipY(EXHAUST.bottom) - 4} V ${flipY(EXHAUST.bottom) - 30}`} stroke="#94A3B8" strokeWidth={5} strokeLinecap="round" markerEnd="none" />}

      <PortTag x={AXIS_X + EXHAUST.half + 14} y={flipY(EXHAUST.bottom) + 10} label="3" bar={analysis.exhaust} theme={theme} anchor="start" />
      <PortTag x={WORK.right + 30} y={flipY(WORK.y) - 12} label="2" bar={analysis.work} theme={theme} />
      <PortTag x={AXIS_X + INLET.half + 14} y={flipY(INLET.top) - 4} label="1" bar={analysis.supply} theme={theme} anchor="start" />
      <text x={AXIS_X} y={376} textAnchor="middle" fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.quickExhaust.caption')}</text>
    </svg>
  );
}
