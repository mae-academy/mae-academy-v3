import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { SingleAnalysis } from './cutawayPhysics';
import { AnchoredSpring, CutawayDefs, EDGE_WIDTH, FlowStream, PistonHead, PortTag, RodBearing, SANS, fluidTint, hatchFill, slideStyle, steelProps, type CutawayStageProps } from './cutawayParts';
import { AXIS_Y, CAP_TOP, CAVITY, CHAMBER, CHANNEL_WIDTH, INSET, PISTON, PISTON_MIN_X, PORT_X, ROD_Y, pistonShift, type Box } from './cylinderGeometry';

/** Length of the fully compressed (solid) spring: the piston stops this far short of the front cap. */
const SOLID_LENGTH = 40;
const FRONT_STOP_X = CHAMBER.x1 - SOLID_LENGTH - PISTON.width;
const SPRING_ANCHOR_X = CHAMBER.x1; // flush against the front-cap shoulder
const SPRING_FREE_LENGTH = SPRING_ANCHOR_X - (PISTON_MIN_X + PISTON.width);
const SPRING_AMPLITUDE = 30;
/** Length of the rod guide bearing pressed into the front cap. */
const BEARING_LENGTH = 40;
const VENT_X = PORT_X.front;
const VENT_Y = 140;
const VENT_COLOR = '#94a3b8';

const rectProps = ({ x, y, width, height }: Box) => ({ x, y, width, height });

/**
 * Single-acting spring-return cylinder in section: one working port in the rear cap, a vent hole in the
 * front cap and a return spring between the piston and the front cap. The piston is clamped inside the
 * bore, stopping where the spring is solid. Pressure at A compresses the spring; when it drops, the
 * spring (anchored on the front cap) drives the piston back. All positions come from `snapshot.cylinders`.
 */
export function SingleActingCutaway({ analysis, medium, theme, idPrefix = 'single' }: CutawayStageProps & { analysis: SingleAnalysis }) {
  const tr = useFluidT();
  const shift = pistonShift(analysis.stroke, FRONT_STOP_X);
  const springLength = SPRING_ANCHOR_X - (PISTON_MIN_X + PISTON.width + shift);
  const rearTint = fluidTint(analysis.rearBar, medium);
  const ventTint = fluidTint(0, medium, true);
  const extending = analysis.direction === 'extending';
  const retracting = analysis.direction === 'retracting';

  const channel: Box = { x: PORT_X.rear - CHANNEL_WIDTH / 2, y: CAP_TOP, width: CHANNEL_WIDTH, height: CAVITY.y0 - CAP_TOP };
  const rearCavity: Box = { x: CHAMBER.x0 - CAVITY.depth, y: CAVITY.y0, width: CAVITY.depth, height: CAVITY.y1 - CAVITY.y0 };
  const chamber: Box = { x: CHAMBER.x0, y: CHAMBER.y0, width: CHAMBER.x1 - CHAMBER.x0, height: CHAMBER.y1 - CHAMBER.y0 };
  const vent: Box = { x: VENT_X - CHANNEL_WIDTH / 2, y: CAP_TOP, width: CHANNEL_WIDTH, height: VENT_Y + 10 - CAP_TOP };
  const ventPassage: Box = { x: CHAMBER.x1, y: VENT_Y - 10, width: VENT_X - CHAMBER.x1 + CHANNEL_WIDTH / 2, height: 20 };
  const volumes = [chamber, channel, rearCavity, vent, ventPassage];
  // Only the bore itself is tinted: the vent channel and its passage are open to the atmosphere and stay clear.
  const tinted = [chamber, channel, rearCavity];
  const pistonFront = PISTON_MIN_X + PISTON.width;

  const rearRoute: Array<[number, number]> = [[PORT_X.rear, 62], [PORT_X.rear, 150], [CHAMBER.x0 + 8, 150]];
  const ventRoute: Array<[number, number]> = [[CHAMBER.x1 - 8, VENT_Y], [VENT_X, VENT_Y], [VENT_X, 62]];

  return (
    <svg viewBox="0 0 780 345" role="img" aria-label="Single-acting cylinder cutaway" data-testid="cutaway-single" data-stroke={analysis.stroke.toFixed(3)} style={{ width: '100%', height: 'auto', maxHeight: 400, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <clipPath id={`${idPrefix}-chamber`}>{tinted.map((box, index) => <rect key={index} {...rectProps(box)} />)}</clipPath>

      {/* end caps and barrel walls, cut open */}
      <rect x={CHAMBER.x0} y={90} width={CHAMBER.x1 - CHAMBER.x0} height={20} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={CHAMBER.x0} y={230} width={CHAMBER.x1 - CHAMBER.x0} height={20} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="end-cap" data-end="rear" x={20} y={CAP_TOP} width={140} height={200} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="end-cap" data-end="front" x={620} y={CAP_TOP} width={140} height={200} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      {volumes.map((box, index) => <rect key={index} {...rectProps(box)} fill={theme.bore} />)}
      <rect x={CHAMBER.x1} y={ROD_Y.y0 - 1} width={760 - CHAMBER.x1} height={ROD_Y.y1 - ROD_Y.y0 + 2} fill={theme.bore} />

      {/* fluid: pressure behind the piston, vented (atmosphere) in front of it; both masked to the bore */}
      <g clipPath={`url(#${idPrefix}-chamber)`}>
        <g className="cutaway-piston-fluid" style={slideStyle(shift, 0, 60)}>
          <rect x={PISTON_MIN_X - 3000} y={CAP_TOP} width={3000} height={CHAMBER.y1 - CAP_TOP} fill={rearTint.fill} opacity={rearTint.opacity} />
          <rect x={pistonFront} y={CAP_TOP} width={3000} height={CHAMBER.y1 - CAP_TOP} fill={ventTint.fill} opacity={ventTint.opacity} />
        </g>
      </g>

      {/* return spring: anchored on the front cap, its free end rides the piston */}
      <g className="return-spring" data-spring-length={springLength.toFixed(1)} data-compression={analysis.springCompression.toFixed(3)}>
        <AnchoredSpring anchorX={SPRING_ANCHOR_X} y={AXIS_Y} length={springLength} reference={SPRING_FREE_LENGTH} direction={-1} coils={8} amplitude={SPRING_AMPLITUDE} minScale={SOLID_LENGTH / SPRING_FREE_LENGTH} ms={60} theme={theme} />
      </g>

      <g id="piston-rod-assembly" className="cutaway-piston" data-stroke={analysis.stroke.toFixed(3)} data-piston-x={(PISTON_MIN_X + shift).toFixed(1)} style={slideStyle(shift, 0, 60)}>
        <rect x={pistonFront} y={ROD_Y.y0} width={760} height={ROD_Y.y1 - ROD_Y.y0} {...steelProps(theme)} />
        <PistonHead x={PISTON_MIN_X} y0={PISTON.y0} y1={PISTON.y1} width={PISTON.width} theme={theme} />
      </g>

      <RodBearing x0={CHAMBER.x1} length={BEARING_LENGTH} direction={1} rodY0={ROD_Y.y0} rodY1={ROD_Y.y1} theme={theme} />

      {extending && <FlowStream points={rearRoute} />}
      {retracting && <FlowStream points={rearRoute.slice().reverse()} />}
      {extending && <FlowStream points={ventRoute} color={VENT_COLOR} width={3} />}
      {retracting && <FlowStream points={ventRoute.slice().reverse()} color={VENT_COLOR} width={3} />}

      <PortTag x={PORT_X.rear} y={54} label="A" bar={analysis.rearBar} theme={theme} />
      <g fontFamily={SANS} textAnchor="middle" pointerEvents="none">
        <text x={VENT_X} y={54} fontSize={15} fontWeight={700} fill={theme.text}>{tr('cutaway.single.vent')}</text>
        <text x={VENT_X} y={38} fontSize={11} fill={theme.muted}>{tr('cutaway.single.atmosphere')}</text>
      </g>
      <text x={390} y={292} textAnchor="middle" fontSize={13} fontFamily={SANS} fill={theme.text}>
        {tr('cutaway.single.readout', { stroke: (analysis.stroke * 100).toFixed(0), spring: (analysis.springCompression * 100).toFixed(0), velocity: analysis.velocity.toFixed(2) })}
      </text>
      <text x={390} y={332} textAnchor="middle" fontSize={12} fontFamily={SANS} fill={theme.muted} data-testid="single-balance">
        {tr('cutaway.single.balance', { air: analysis.rearBar.toFixed(1), spring: analysis.springBar.toFixed(1), balance: (analysis.equilibrium * 100).toFixed(0) })}
      </text>
      <text x={390} y={312} textAnchor="middle" fontSize={11} fill={theme.muted}>{tr('cutaway.single.spring')}</text>
    </svg>
  );
}
