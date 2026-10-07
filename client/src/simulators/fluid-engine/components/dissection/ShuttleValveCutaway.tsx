import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { GateAnalysis } from './cutawayPhysics';
import { CutawayDefs, FlowStream, PortTag, fluidTint, hatchFill, slideStyle, steelProps, type CutawayStageProps } from './cutawayParts';

/** Distance the ball travels per unit of `snapshot.logic[id].offset`: from the middle onto a seat. */
const TRAVEL = 140;
const CENTER = 390;
const BORE = { x0: 50, x1: 730, y0: 130, y1: 170 };
const BALL_RADIUS = 18;
const SEAT_MOUTH = 254;

/** Insert forming a conical seat; `side` mirrors it about the centre line. */
function seatPoints(side: 1 | -1): string[] {
  const mirror = (x: number) => (side === 1 ? x : 2 * CENTER - x);
  // top and bottom halves of the funnel: throat at x=190 (opening 12), mouth at x=254 (full bore)
  const top = [[180, BORE.y0], [SEAT_MOUTH, BORE.y0], [190, 144], [180, 144]];
  const bottom = [[180, BORE.y1], [SEAT_MOUTH, BORE.y1], [190, 156], [180, 156]];
  return [top, bottom].map(poly => poly.map(([x, y]) => `${mirror(x)},${y}`).join(' '));
}

/**
 * OR gate: two opposed conical seats, a floating ball and the outlet (port 2) on top.
 * The ball's x position is `snapshot.logic[id].offset`: pressure on one side drives it onto the
 * opposite, idle seat. Streamlines curve around the sphere and out through port 2.
 */
export function ShuttleValveCutaway({ analysis, medium, theme, idPrefix = 'or' }: CutawayStageProps & { analysis: GateAnalysis }) {
  const tr = useFluidT();
  const dx = analysis.offset * TRAVEL;
  const left = fluidTint(analysis.left, medium);
  const right = fluidTint(analysis.right, medium);
  const out = fluidTint(analysis.out, medium);
  const bore = { x: BORE.x0, y: BORE.y0, width: BORE.x1 - BORE.x0, height: BORE.y1 - BORE.y0 };
  const both = analysis.leftOn && analysis.rightOn;

  return (
    <svg viewBox="0 0 780 300" role="img" aria-label="Shuttle valve cutaway" data-testid="cutaway-or" data-ball-offset={analysis.offset} style={{ width: '100%', height: 'auto', maxHeight: 340, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />

      <rect x={50} y={70} width={680} height={160} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={2} />
      <rect {...bore} fill={theme.bore} />
      <rect x={362} y={70} width={56} height={BORE.y0 - 70} fill={theme.bore} />

      {/* cavity fill: left inlet and funnel, the chamber (and outlet), right inlet and funnel */}
      <rect x={BORE.x0} y={BORE.y0} width={SEAT_MOUTH - BORE.x0} height={40} fill={left.fill} opacity={left.opacity} />
      <rect x={2 * CENTER - SEAT_MOUTH} y={BORE.y0} width={SEAT_MOUTH - BORE.x0} height={40} fill={right.fill} opacity={right.opacity} />
      <rect x={SEAT_MOUTH} y={BORE.y0} width={2 * CENTER - 2 * SEAT_MOUTH} height={40} fill={out.fill} opacity={out.opacity} />
      <rect x={362} y={70} width={56} height={BORE.y0 - 70} fill={out.fill} opacity={out.opacity} />

      {/* conical seats */}
      {[1, -1].flatMap(side => seatPoints(side as 1 | -1).map((points, index) => (
        <polygon key={`${side}-${index}`} points={points} {...steelProps(theme)} />
      )))}

      {/* streamlines: they bend around the sphere and leave through port 2 */}
      {analysis.leftOn && (
        <FlowStream
          points={both ? [[60, 150], [350, 150], [372, 138], [372, 40]] : [[60, 150], [330, 150], [376, 138], [376, 40]]}
        />
      )}
      {analysis.rightOn && (
        <FlowStream
          points={both ? [[720, 150], [430, 150], [408, 138], [408, 40]] : [[720, 150], [450, 150], [404, 138], [404, 40]]}
        />
      )}

      <g className="cutaway-ball" data-offset={analysis.offset} style={slideStyle(dx)}>
        <circle id="shuttle-ball" cx={CENTER} cy={150} r={BALL_RADIUS} {...steelProps(theme)} />
        <ellipse cx={CENTER - 6} cy={143} rx={5} ry={3} fill="#ffffff" opacity={0.55} />
      </g>

      <PortTag x={40} y={154} label="1" bar={analysis.left} theme={theme} anchor="end" />
      <PortTag x={740} y={154} label="1" bar={analysis.right} theme={theme} anchor="start" />
      <PortTag x={CENTER} y={52} label="2" bar={analysis.out} theme={theme} />
      <text x={CENTER} y={258} textAnchor="middle" fontSize={12} fill={theme.muted}>{tr('cutaway.or.caption')}</text>
    </svg>
  );
}
