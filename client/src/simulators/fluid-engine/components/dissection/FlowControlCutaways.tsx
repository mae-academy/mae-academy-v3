import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { FlowControlAnalysis } from './cutawayPhysics';
import { AnchoredSpring, CutawayDefs, EDGE_WIDTH, FLOW_BLUE, FlowStream, PortTag, SANS, fluidTint, groundProps, hatchFill, slideStyle, steelProps, type CutawayStageProps, type CutawayTheme } from './cutawayParts';

type Point = [number, number];

/** Needle travel (px) between fully seated (0 %) and fully open (100 %) in each valve. */
export const THROTTLE_TRAVEL = 56;
export const ONEWAY_TRAVEL = 40;
/** How far the check poppet lifts off its seat when the return flow pushes it. */
export const POPPET_LIFT = 34;

/** Vertical shift of the needle assembly for an opening in percent. */
export const needleShift = (opening: number, travel: number): number => (Math.min(100, Math.max(0, opening)) / 100) * travel;
/** Width of the streamline through an orifice: proportional to the opening, never thinner than a hairline. */
export const streamWidth = (opening: number): number => 1.5 + (Math.min(100, Math.max(0, opening)) / 100) * 7.5;

const VENT_COLOR = '#94A3B8';
export const VENTED_BAR = 0.5;

/** Adjusting screw, shaft with thread, and the tapered tip, drawn at the fully seated position; the group slides up to open. */
export function Needle({ x, headTop, shaftBottom, tipY, theme, shift }: { x: number; headTop: number; shaftBottom: number; tipY: number; theme: CutawayTheme; shift: number }) {
  const half = 16;
  return (
    <g className="flow-needle" data-shift={shift.toFixed(1)} style={slideStyle(0, -shift, 120)}>
      <rect className="needle-shaft" x={x - half} y={headTop + 20} width={2 * half} height={shaftBottom - headTop - 20} {...steelProps(theme)} />
      {[0, 1, 2, 3].map(index => <line key={index} x1={x - half} x2={x + half} y1={headTop + 30 + index * 6} y2={headTop + 30 + index * 6} stroke={theme.steelEdge} strokeWidth={1} />)}
      <polygon className="needle-tip" points={`${x - half},${shaftBottom} ${x + half},${shaftBottom} ${x},${tipY}`} {...groundProps(theme)} />
      <rect className="needle-head" x={x - 30} y={headTop} width={60} height={20} rx={2} {...groundProps(theme)} />
      <line x1={x} x2={x} y1={headTop} y2={headTop + 20} stroke={theme.seal} strokeWidth={3} />
    </g>
  );
}

/** Grey arrow leaving a port that discharges to the atmosphere. */
export function VentArrow({ x, y, direction }: { x: number; y: number; direction: 1 | -1 }) {
  return <FlowStream points={[[x, y], [x + direction * 34, y]]} color={VENT_COLOR} width={3} />;
}

interface Layout {
  body: { x: number; y: number; width: number; height: number };
}

/** Stub, channel and tint of one port at height `y`. */
export function Port({ x0, x1, y, half, tint, theme }: { x0: number; x1: number; y: number; half: number; tint: ReturnType<typeof fluidTint>; theme: CutawayTheme }) {
  return (
    <g className="port-stub">
      <rect x={Math.min(x0, x1)} y={y - half - 10} width={Math.abs(x1 - x0)} height={2 * half + 20} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={Math.min(x0, x1)} y={y - half} width={Math.abs(x1 - x0)} height={2 * half} fill={theme.bore} />
      <rect x={Math.min(x0, x1)} y={y - half} width={Math.abs(x1 - x0)} height={2 * half} fill={tint.fill} opacity={tint.opacity} />
    </g>
  );
}

/** Adjustable throttle: a needle with a tapered tip closes onto a conical seat in a straight passage. */
function ThrottleStage({ analysis, medium, theme, idPrefix = 'throttle' }: CutawayStageProps & { analysis: FlowControlAnalysis }) {
  const tr = useFluidT();
  const shift = needleShift(analysis.opening, THROTTLE_TRAVEL);
  const gap = 2 + shift;
  const SEAT_TOP = 186;
  const left = fluidTint(analysis.inBar, medium);
  const right = fluidTint(analysis.outBar, medium);
  const body: Layout['body'] = { x: 100, y: 100, width: 580, height: 150 };
  const gapY = SEAT_TOP - gap / 2;
  const forward: Point[] = [[84, 175], [335, 175], [390, gapY], [445, 175], [676, 175]];
  const flowing = analysis.direction !== 0;
  const dischargeBar = analysis.direction === 1 ? analysis.outBar : analysis.inBar;

  return (
    <svg viewBox="0 0 780 330" role="img" aria-label="Throttle valve cutaway" data-testid="cutaway-throttle" data-opening={analysis.opening} data-direction={analysis.direction} style={{ width: '100%', height: 'auto', maxHeight: 400, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <Port x0={76} x1={body.x} y={175} half={25} tint={left} theme={theme} />
      <Port x0={body.x + body.width} x1={body.x + body.width + 24} y={175} half={25} tint={right} theme={theme} />
      <rect className="valve-body" {...body} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />

      {/* straight passage, tinted by the pressure on each side of the orifice, and the bore the needle runs in */}
      <rect x={body.x} y={150} width={body.width} height={50} fill={theme.bore} />
      <rect className="needle-bore" x={372} y={body.y} width={36} height={50} fill={theme.bore} />
      <rect x={body.x} y={150} width={290} height={50} fill={left.fill} opacity={left.opacity} />
      <rect x={390} y={150} width={body.x + body.width - 390} height={50} fill={right.fill} opacity={right.opacity} />
      <polygon className="conical-seat" points="330,200 360,186 420,186 450,200" fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />

      <Needle x={390} headTop={74} shaftBottom={158} tipY={184} theme={theme} shift={shift} />
      <path className="seat-edge" d="M 360 186 H 420" stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} fill="none" />

      {flowing && <FlowStream points={analysis.direction === 1 ? forward : [...forward].reverse()} width={streamWidth(analysis.opening)} radius={14} />}
      {flowing && dischargeBar <= VENTED_BAR && (analysis.direction === 1 ? <VentArrow x={body.x + body.width + 28} y={175} direction={1} /> : <VentArrow x={72} y={175} direction={-1} />)}

      <PortTag x={88} y={282} label="1" bar={analysis.inBar} theme={theme} below />
      <PortTag x={692} y={282} label="2" bar={analysis.outBar} theme={theme} below />
      <text x={470} y={52} fontSize={13} fontFamily={SANS} fill={theme.text} data-testid="needle-label">{tr('cutaway.flow.needle', { opening: Math.round(analysis.opening) })}</text>
      <text x={390} y={282} textAnchor="middle" fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.flow.throttlePath')}</text>
    </svg>
  );
}

/** Bypass axis, ball radius and the ball's seated centre: it touches the 45° cone (line y = x − 237) at r·√2 from it. */
const BYPASS_Y = 212;
const BALL_R = 11;
const BALL_SEATED = 449 - BALL_R * Math.SQRT2;
const RIB_FACE = 184;
const SPRING_REFERENCE = BALL_SEATED - BALL_R - RIB_FACE;
/** Body of the one-way flow control, and the height of the flow axis at both ports. */
export const ONEWAY_BODY = { x: 100, y: 80, width: 580, height: 180 };
export const ONEWAY_AXIS = 170;

/**
 * Streamlines of a one-way flow control. `exit` is where the outlet manifold leads: out through the side port (the
 * valve on its own) or straight down at x = 630 to a chamber below it (the time-delay valve).
 */
export function oneWayPaths(opening: number, exit: 'port' | 'down' = 'port', chamberY = 300) {
  const gap = 2 + needleShift(opening, ONEWAY_TRAVEL);
  const gapY = 134 - gap / 2;
  const out: Point[] = exit === 'port' ? [[630, 170], [676, 170]] : [[630, chamberY]];
  const throttle: Point[] = [[84, 170], [150, 170], [150, 128], [335, 128], [390, gapY], [445, 128], [630, 128], ...out];
  const around = (sign: 1 | -1): Point[] => [
    ...[...out].reverse(), [630, BYPASS_Y + sign * 7], [470, BYPASS_Y + sign * 7], [452, BYPASS_Y + sign * 3], [443, BYPASS_Y + sign * 3], [428, BYPASS_Y + sign * 19], [400, BYPASS_Y + sign * 19],
    [200, BYPASS_Y + sign * 19], [160, BYPASS_Y + sign * 19], [150, BYPASS_Y + sign * 14], [150, 170], [84, 170],
  ];
  return { throttle, around };
}

/**
 * Mechanical core of the one-way flow control: the body, the throttle path with its needle above and the spring-loaded
 * ball check in the bypass below. Drawn in the valve's own coordinates; the left manifold is port 1, the right one port 2.
 * `rightOpening` leaves the side bore to port 2 out (the time-delay valve takes the right manifold down instead).
 */
export function OneWayCore({ opening, free, left, right, theme, idPrefix, rightOpening = true }: {
  opening: number;
  /** The check poppet is lifted off its seat by the return flow. */
  free: boolean;
  left: ReturnType<typeof fluidTint>;
  right: ReturnType<typeof fluidTint>;
  theme: CutawayTheme;
  idPrefix: string;
  rightOpening?: boolean;
}) {
  const body = ONEWAY_BODY;
  const shift = needleShift(opening, ONEWAY_TRAVEL);
  const SEAT_TOP = 134;
  const lift = free ? POPPET_LIFT : 0;
  return (
    <g className="oneway-core">
      <rect className="valve-body" {...body} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />

      {/* passages: left and right manifolds joined by the throttle path above and the bypass below */}
      <g className="passages">
        <rect x={130} y={105} width={40} height={130} fill={theme.bore} />
        <rect x={610} y={105} width={40} height={130} fill={theme.bore} />
        <rect x={body.x} y={155} width={30} height={30} fill={theme.bore} />
        {rightOpening && <rect x={650} y={155} width={30} height={30} fill={theme.bore} />}
        <rect x={170} y={108} width={440} height={40} fill={theme.bore} />
        <rect className="needle-bore" x={372} y={body.y} width={36} height={28} fill={theme.bore} />
        <rect x={170} y={188} width={440} height={48} fill={theme.bore} />
      </g>
      {/* pressure tints: left of the throttle and the check seat is port 1, right of them is port 2 */}
      {[[130, 105, 40, 130], [body.x, 155, 30, 30], [170, 108, 220, 40], [170, 188, 258, 48]].map(([x, y, w, h], index) => <rect key={`l${index}`} x={x} y={y} width={w} height={h} fill={left.fill} opacity={left.opacity} />)}
      {[[610, 105, 40, 130], ...(rightOpening ? [[650, 155, 30, 30]] : []), [390, 108, 220, 40], [428, 188, 182, 48]].map(([x, y, w, h], index) => <rect key={`r${index}`} x={x} y={y} width={w} height={h} fill={right.fill} opacity={right.opacity} />)}

      {/* throttle path: conical seat and the needle */}
      <polygon className="conical-seat" points="330,148 360,134 420,134 450,148" fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <Needle x={390} headTop={52} shaftBottom={110} tipY={132} theme={theme} shift={shift} />

      {/* free return: the unseated check floods the whole bypass chamber */}
      {free && <rect className="bypass-flood" x={170} y={188} width={440} height={48} fill={FLOW_BLUE} opacity={0.55} />}
      {/* bypass: shoulder rib with flow windows (spring seat), conical seat, ball and spring */}
      <rect className="shoulder-rib" x={170} y={188} width={14} height={48} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      {[[190, 8], [226, 8]].map(([y, h]) => <rect key={y} className="rib-window" x={169} y={y} width={16} height={h} fill={theme.bore} />)}
      <polygon className="check-seat" points="428,188 452,188 452,206 443,206 428,191" fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <polygon className="check-seat" points="428,236 452,236 452,218 443,218 428,233" fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <AnchoredSpring anchorX={RIB_FACE} y={BYPASS_Y} length={BALL_SEATED - lift - BALL_R - RIB_FACE} reference={SPRING_REFERENCE} direction={1} coils={8} amplitude={9} minScale={0.2} ms={140} theme={theme} />
      <g className="check-poppet" data-lift={lift} data-state={free ? 'open' : 'seated'} style={slideStyle(-lift, 0, 140)}>
        <circle className="check-ball" cx={BALL_SEATED} cy={BYPASS_Y} r={BALL_R} {...groundProps(theme)} />
        <circle cx={BALL_SEATED - 4} cy={BYPASS_Y - 4} r={3} fill="#E5E7EB" opacity={0.55} />
      </g>
    </g>
  );
}

/** One-way flow control: throttle path above, spring-loaded check poppet with a rubber sealing ring in the bypass below. */
function OneWayStage({ analysis, medium, theme, idPrefix = 'oneway' }: CutawayStageProps & { analysis: FlowControlAnalysis }) {
  const tr = useFluidT();
  const free = analysis.direction === -1;
  const left = fluidTint(analysis.inBar, medium);
  const right = fluidTint(analysis.outBar, medium);
  const body = ONEWAY_BODY;
  const { throttle, around } = oneWayPaths(analysis.opening);
  const dischargeBar = analysis.direction === 1 ? analysis.outBar : analysis.inBar;

  return (
    <svg viewBox="0 0 780 330" role="img" aria-label="One-way flow control valve cutaway" data-testid="cutaway-oneway" data-opening={analysis.opening} data-direction={analysis.direction} data-check={free ? 'open' : 'seated'} style={{ width: '100%', height: 'auto', maxHeight: 400, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <Port x0={76} x1={body.x} y={170} half={15} tint={left} theme={theme} />
      <Port x0={body.x + body.width} x1={body.x + body.width + 24} y={170} half={15} tint={right} theme={theme} />
      <OneWayCore opening={analysis.opening} free={free} left={left} right={right} theme={theme} idPrefix={idPrefix} />

      {analysis.direction === 1 && <FlowStream points={throttle} color={FLOW_BLUE} width={streamWidth(analysis.opening)} radius={14} />}
      {free && [-1, 1].map(sign => <FlowStream key={sign} points={around(sign as 1 | -1)} color={FLOW_BLUE} width={7} radius={14} />)}
      {analysis.direction !== 0 && dischargeBar <= VENTED_BAR && (analysis.direction === 1 ? <VentArrow x={body.x + body.width + 28} y={170} direction={1} /> : <VentArrow x={72} y={170} direction={-1} />)}

      <PortTag x={88} y={282} label="1" bar={analysis.inBar} theme={theme} below />
      <PortTag x={692} y={282} label="2" bar={analysis.outBar} theme={theme} below />
      <text x={470} y={40} fontSize={13} fontFamily={SANS} fill={theme.text} data-testid="needle-label">{tr('cutaway.flow.needle', { opening: Math.round(analysis.opening) })}</text>
      <text x={250} y={286} fontSize={11} fontFamily={SANS} fill={theme.muted} textAnchor="middle">{tr('cutaway.flow.throttlePath')}</text>
      <text x={530} y={286} fontSize={11} fontFamily={SANS} fill={theme.muted} textAnchor="middle">{tr('cutaway.flow.bypass')}</text>
    </svg>
  );
}

/** Cutaway of a throttle valve or a one-way flow control valve. */
export function FlowControlCutaway(props: CutawayStageProps & { analysis: FlowControlAnalysis }) {
  return props.analysis.kind === 'throttle' ? <ThrottleStage {...props} /> : <OneWayStage {...props} />;
}
