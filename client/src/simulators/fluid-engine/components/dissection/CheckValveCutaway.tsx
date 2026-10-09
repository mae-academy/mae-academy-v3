import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { CheckAnalysis } from './cutawayPhysics';
import { AnchoredSpring, FLOW_BLUE, CutawayDefs, EDGE_WIDTH, FlowStream, PortTag, SANS, fluidTint, groundProps, hatchFill, slideStyle, type CutawayStageProps } from './cutawayParts';
import { Port, VENTED_BAR, VentArrow } from './FlowControlCutaways';

type Point = [number, number];

/** Axis of the valve, radius of the sealing ball, and the throat of its 45° conical seat (the cone opens to the right). */
export const AXIS = 175;
export const BALL_RADIUS = 14;
export const THROAT_X = 250;
export const THROAT_HALF = 9;
/**
 * Ball centre when seated. The seat's upper wall is the line x + y = THROAT_X + (AXIS − THROAT_HALF) (45°); a ball of
 * radius r touches it when its centre is r·√2 from the line, i.e. at THROAT_X − THROAT_HALF + r·√2.
 */
export const SEATED_X = THROAT_X - THROAT_HALF + BALL_RADIUS * Math.SQRT2;
/** Ball travel to the retention cage (plain valve) and spring compression travel (spring-loaded valve), in px. */
export const CAGE_TRAVEL = 14;
export const SPRING_TRAVEL = 60;
/** Left face of the cage's stop ring. */
const STOP_X = SEATED_X + CAGE_TRAVEL + BALL_RADIUS;
/** Centre of the cage's flow windows, measured from the axis. */
const WINDOW_MID = 23.5;
const SLEEVE_MOUTH = 400;
const RIB_X = 440;

/** Outline of the flow passage: funnel into the throat, 45° cone out of it, a wider ball chamber, then back to the port bore. */
const borePoints = (chamberEnd: number, half: number): Point[] => [
  [100, 150], [225, 150], [THROAT_X, AXIS - THROAT_HALF], [THROAT_X + half - THROAT_HALF, AXIS - half], [chamberEnd, AXIS - half], [chamberEnd + 30, 150], [680, 150],
  [680, 200], [chamberEnd + 30, 200], [chamberEnd, AXIS + half], [THROAT_X + half - THROAT_HALF, AXIS + half], [THROAT_X, AXIS + THROAT_HALF], [225, 200], [100, 200],
];
/** Half-height of the ball chamber: the plain valve's is wide so fluid passes freely above and below the ball resting on its cage. */
const CHAMBER_HALF = 35;
const CAGE_CHAMBER_HALF = 50;
const toPath = (points: Point[]) => `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;

/** Both valves share one body; `spring` swaps the retention cage for the spring in its guide sleeve. */
export function CheckStage({ analysis, medium, theme, idPrefix = 'check', spring }: CutawayStageProps & { analysis: CheckAnalysis; spring: boolean }) {
  const tr = useFluidT();
  const open = analysis.open;
  const lift = open ? (spring ? SPRING_TRAVEL : CAGE_TRAVEL) : 0;
  const ballX = SEATED_X + lift;
  const chamberEnd = spring ? 470 : STOP_X + 36;
  // Sealed against back pressure, nothing reaches the inlet side: its chamber greys out instead of staying blank.
  const left = fluidTint(analysis.inBar, medium, analysis.backPressure);
  const right = fluidTint(analysis.outBar, medium);
  const half = spring ? CHAMBER_HALF : CAGE_CHAMBER_HALF;
  const bore = toPath(borePoints(chamberEnd, half));
  /** Streams wash symmetrically round the lifted ball: squeeze through the opened seat, hug the ball, converge through the cage opening. */
  const forward: Point[][] = [-1, 1].map(sign => spring ? [
    [84, AXIS], [THROAT_X - 12, AXIS], [THROAT_X + 12, AXIS + sign * 15], [THROAT_X + 40, AXIS + sign * 22],
    [RIB_X - 6, AXIS + sign * 22], [RIB_X + 30, AXIS + sign * 22], [RIB_X + 60, AXIS + sign * 8], [RIB_X + 80, AXIS], [676, AXIS],
  ] : [
    [84, AXIS], [THROAT_X - 12, AXIS], [THROAT_X, AXIS + sign * 5], [THROAT_X + 12, AXIS + sign * 13], [ballX, AXIS + sign * (BALL_RADIUS + 7)],
    [STOP_X + 4, AXIS + sign * WINDOW_MID], [STOP_X + 24, AXIS + sign * 18], [chamberEnd + 14, AXIS + sign * 8], [chamberEnd + 40, AXIS], [676, AXIS],
  ]);
  const dischargeBar = analysis.outBar;
  const label = (x: number, y: number, text: string) => <text x={x} y={y} textAnchor="middle" fontSize={11} fontFamily={SANS} fill={theme.muted}>{text}</text>;

  return (
    <svg viewBox="0 0 780 330" role="img" aria-label={spring ? 'Spring-loaded check valve cutaway' : 'Check valve cutaway'} data-testid={spring ? 'cutaway-springCheck' : 'cutaway-check'} data-open={open} data-ball-x={ballX.toFixed(1)} style={{ width: '100%', height: 'auto', maxHeight: 400, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <clipPath id={`${idPrefix}-bore`}><path d={bore} /></clipPath>
      <Port x0={76} x1={100} y={AXIS} half={25} tint={left} theme={theme} />
      <Port x0={680} x1={704} y={AXIS} half={25} tint={right} theme={theme} />
      <rect className="valve-body" x={100} y={100} width={580} height={150} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <path className="check-bore" d={bore} fill={theme.bore} />
      <g clipPath={`url(#${idPrefix}-bore)`}>
        <rect x={100} y={120} width={THROAT_X - 100} height={110} fill={left.fill} opacity={left.opacity} />
        <rect x={THROAT_X} y={120} width={580 - (THROAT_X - 100)} height={110} fill={right.fill} opacity={right.opacity} />
      </g>
      <path d={bore} fill="none" stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} strokeLinejoin="round" />

      {spring ? (
        <g className="spring-guide">
          {/* shoulder rib joined to the body, with flow slots above and below; the guide sleeve is fixed to its face */}
          <rect className="shoulder-rib" x={RIB_X} y={140} width={12} height={70} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          {[[148, 8], [194, 8]].map(([y, h]) => <rect key={y} x={RIB_X - 1} y={y} width={14} height={h} fill={theme.bore} />)}
          <rect className="guide-sleeve" x={SLEEVE_MOUTH} y={AXIS - 17} width={RIB_X - SLEEVE_MOUTH} height={5} {...groundProps(theme)} />
          <rect className="guide-sleeve" x={SLEEVE_MOUTH} y={AXIS + 12} width={RIB_X - SLEEVE_MOUTH} height={5} {...groundProps(theme)} />
          <AnchoredSpring anchorX={RIB_X} y={AXIS} length={RIB_X - (ballX + BALL_RADIUS)} reference={RIB_X - (SEATED_X + BALL_RADIUS)} direction={-1} coils={9} amplitude={9} minScale={0.25} ms={140} theme={theme} />
        </g>
      ) : (
        <g className="retention-cage">
          {/* perforated stop plate: solid lips against the chamber walls, a central stop pad the ball rests on, and a flow window above and below it */}
          <rect className="cage-stop" x={STOP_X} y={AXIS - 50} width={12} height={15} {...groundProps(theme)} />
          <rect className="cage-stop" x={STOP_X} y={AXIS + 35} width={12} height={15} {...groundProps(theme)} />
          <rect className="cage-stop cage-pad" x={STOP_X} y={AXIS - 12} width={8} height={24} {...groundProps(theme)} />
        </g>
      )}

      {/* the sealing ball: polished steel, free to roll between the seat and the cage / spring */}
      <g className="check-ball" data-state={open ? 'open' : 'seated'} data-lift={lift} style={slideStyle(lift, 0, open ? 140 : 30)}>
        <circle cx={SEATED_X} cy={AXIS} r={BALL_RADIUS} {...groundProps(theme)} />
        <circle cx={SEATED_X - 5} cy={AXIS - 5} r={4} fill="#E5E7EB" opacity={0.55} />
      </g>

      {open && forward.map((path, index) => <FlowStream key={index} points={path} color={FLOW_BLUE} width={4} />)}
      {open && dischargeBar <= VENTED_BAR && <VentArrow x={708} y={AXIS} direction={1} />}

      <PortTag x={88} y={282} label="1" bar={analysis.inBar} theme={theme} below />
      <PortTag x={692} y={282} label="2" bar={analysis.outBar} theme={theme} below />
      {label(THROAT_X, 286, tr('cutaway.check.seat'))}
      {spring ? label(420, 286, tr('cutaway.check.sleeve')) : label(330, 286, tr('cutaway.check.cage'))}
      {analysis.backPressure && label(560, 90, tr('cutaway.check.backLabel'))}
      {analysis.crack !== null && <text x={390} y={72} textAnchor="middle" fontSize={13} fontFamily={SANS} fill={theme.text} data-testid="crack-label">{tr('cutaway.check.crackLabel', { crack: analysis.crack.toFixed(1) })}</text>}
    </svg>
  );
}

/** Plain non-return valve: forward flow rolls the ball off its seat into the retention cage; reverse flow drives it home. */
export function CheckValveCutaway(props: CutawayStageProps & { analysis: CheckAnalysis }) {
  return <CheckStage {...props} idPrefix={props.idPrefix ?? 'check'} spring={false} />;
}
