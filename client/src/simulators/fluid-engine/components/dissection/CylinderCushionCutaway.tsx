import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import { CUSHION_ZONE, type CushionAnalysis, type CushionEnd } from './cutawayPhysics';
import { CutawayDefs, EDGE_WIDTH, FlowStream, PistonHead, PortTag, RodBearing, SANS, fluidTint, groundProps, hatchFill, slideStyle, steelProps, type CutawayStageProps, type CutawayTheme } from './cutawayParts';
import { AXIS_Y, BYPASS_Y, CAP_TOP, CAVITY, CHAMBER, CHANNEL_WIDTH, INSET, PISTON, PISTON_MIN_X, PORT_X, ROD_Y, TRAVEL, pistonShift, type Box } from './cylinderGeometry';

/** Spear length: the cushion zone of the stroke plus the clearance, so its tip reaches the cavity mouth exactly as the zone begins. */
const SPEAR = { length: TRAVEL * CUSHION_ZONE + INSET, base: 28, tip: 20 };
const CUSHION_COLOR = '#f59e0b';
const NEEDLE_X = { rear: 140, front: 640 };
/** The main exit runs in the annulus above the rod, so the rod never covers a fluid path. */
const MAIN_Y = 150;

type End = 'rear' | 'front';
type Point = [number, number];

const endGeometry = (end: End) => ({
  /** Face of the end cap the chamber opens against. */
  face: end === 'rear' ? CHAMBER.x0 : CHAMBER.x1,
  /** +1 runs from the face into the cap. */
  into: end === 'rear' ? -1 : 1,
  port: PORT_X[end],
  needle: NEEDLE_X[end],
});

/** The three bores of an end cap: port channel, cushion cavity and needle-valve bypass passage. */
function capVolumes(end: End): { channel: Box; cavity: Box; bypass: Box } {
  const { face, into, port } = endGeometry(end);
  const cavityHeight = CAVITY.y1 - CAVITY.y0;
  const bypassX = into === -1 ? port : face;
  return {
    channel: { x: port - CHANNEL_WIDTH / 2, y: CAP_TOP, width: CHANNEL_WIDTH, height: CAVITY.y0 - CAP_TOP },
    cavity: { x: into === -1 ? face - CAVITY.depth : face, y: CAVITY.y0, width: CAVITY.depth, height: cavityHeight },
    bypass: { x: bypassX, y: BYPASS_Y - 5, width: Math.abs(face - port), height: 10 },
  };
}

/** Paths between a chamber and its port: through the cavity (main) or through the needle-valve bypass. */
function paths(end: End): { main: Point[]; bypass: Point[] } {
  const { face, into, port } = endGeometry(end);
  return {
    main: [[face - into * 8, MAIN_Y], [port, MAIN_Y], [port, 62]],
    bypass: [[face - into * 6, BYPASS_Y], [port, BYPASS_Y], [port, 62]],
  };
}

const reversed = (points: Point[]): Point[] => [...points].reverse();
const rectProps = ({ x, y, width, height }: Box) => ({ x, y, width, height });

/** Needle-valve screw with its tapered tip in the bypass passage; adjustable ones have a slotted head and an arrow. */
function NeedleScrew({ x, adjustable, theme }: { x: number; adjustable: boolean; theme: CutawayTheme }) {
  return (
    <g data-needle={adjustable ? 'adjustable' : 'fixed'}>
      <rect x={x - 5} y={adjustable ? 62 : 70} width={10} height={adjustable ? 56 : 48} {...steelProps(theme)} />
      <polygon points={`${x - 5},118 ${x + 5},118 ${x},128`} {...steelProps(theme)} />
      {adjustable ? (
        <>
          <rect x={x - 14} y={52} width={28} height={10} rx={2} {...steelProps(theme)} />
          <line x1={x} x2={x} y1={52} y2={62} stroke={theme.seal} strokeWidth={2} />
          <path d={`M ${x - 22} 38 L ${x + 22} 38`} stroke={theme.muted} strokeWidth={1.6} fill="none" />
          <polygon points={`${x + 22},38 ${x + 15},34 ${x + 15},42`} fill={theme.muted} />
        </>
      ) : (
        <rect x={x - 8} y={64} width={16} height={6} {...steelProps(theme)} />
      )}
    </g>
  );
}

function CapStreams({ end, state, filling, exhausting, bar, medium }: { end: End; state: CushionEnd; filling: boolean; exhausting: boolean; bar: number; medium: CutawayStageProps['medium'] }) {
  if (!filling && !exhausting) return null;
  const { main, bypass } = paths(end);
  const route = state.engaged ? bypass : main;
  const color = exhausting && state.engaged ? CUSHION_COLOR : undefined;
  return <FlowStream points={filling ? reversed(route) : route} color={color} width={exhausting && state.engaged ? 3 : 4} />;
}

/**
 * Both end caps and the piston head of a cushioned cylinder, in section. The piston/rod assembly
 * is translated by the stroke, clamped so the piston face stays inside the bore at 0 % and 100 %;
 * inside the last 10 % the cushion spear enters its cavity, shuts the main exit and forces the
 * exhaust through the needle valve.
 */
export function CylinderCushionCutaway({ analysis, medium, theme, idPrefix = 'cushion' }: CutawayStageProps & { analysis: CushionAnalysis }) {
  const tr = useFluidT();
  const shift = pistonShift(analysis.stroke);
  const rearTint = fluidTint(analysis.rearBar, medium);
  const frontTint = fluidTint(analysis.frontBar, medium);
  const extending = analysis.direction === 'extending';
  const retracting = analysis.direction === 'retracting';
  const rear = capVolumes('rear');
  const front = capVolumes('front');
  const chamber: Box = { x: CHAMBER.x0, y: CHAMBER.y0, width: CHAMBER.x1 - CHAMBER.x0, height: CHAMBER.y1 - CHAMBER.y0 };
  const volumes = [chamber, rear.channel, rear.cavity, rear.bypass, front.channel, front.cavity, front.bypass];
  const pistonFront = PISTON_MIN_X + PISTON.width;

  const cap = (end: End) => {
    const { port, needle } = endGeometry(end);
    const state = end === 'rear' ? analysis.rear : analysis.front;
    return (
      <g key={end} data-cap={end}>
        {state.enabled && <NeedleScrew x={needle} adjustable={state.adjustable} theme={theme} />}
        {state.enabled && state.engaged && (
          <text x={port} y={286} textAnchor="middle" fontSize={11} fill={CUSHION_COLOR} fontFamily={SANS}>{tr('cutaway.cushion.mainClosed')}</text>
        )}
      </g>
    );
  };

  /** While the spear is in its cavity, the exhausting end shows the trapped, throttled fluid. */
  const trapped = (end: End) => {
    const state = end === 'rear' ? analysis.rear : analysis.front;
    const exhausting = end === 'rear' ? retracting : extending;
    return state.engaged && exhausting ? { box: (end === 'rear' ? rear : front).cavity, opacity: 0.25 + 0.45 * state.depth } : null;
  };

  return (
    <svg viewBox="0 0 780 330" role="img" aria-label="Cushioned cylinder cutaway" data-testid="cutaway-cushion" data-stroke={analysis.stroke.toFixed(3)} style={{ width: '100%', height: 'auto', maxHeight: 400, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      {/* the only places fluid may be: the bore and the three bores of each cap */}
      <clipPath id={`${idPrefix}-chamber`}>{volumes.map((box, index) => <rect key={index} {...rectProps(box)} />)}</clipPath>

      {/* end caps and barrel walls, cut open */}
      <rect x={CHAMBER.x0} y={90} width={CHAMBER.x1 - CHAMBER.x0} height={20} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={CHAMBER.x0} y={230} width={CHAMBER.x1 - CHAMBER.x0} height={20} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="end-cap" data-end="rear" x={20} y={CAP_TOP} width={140} height={200} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="end-cap" data-end="front" x={620} y={CAP_TOP} width={140} height={200} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      {volumes.map((box, index) => <rect key={index} {...rectProps(box)} fill={theme.bore} />)}
      {/* rod bores through the caps; a plain-ended rod only needs the front one */}
      <rect x={CHAMBER.x1 + CAVITY.depth} y={ROD_Y.y0 - 1} width={760 - CHAMBER.x1 - CAVITY.depth} height={ROD_Y.y1 - ROD_Y.y0 + 2} fill={theme.bore} />
      {analysis.throughRod && <rect x={20} y={ROD_Y.y0 - 1} width={CHAMBER.x0 - CAVITY.depth - 20} height={ROD_Y.y1 - ROD_Y.y0 + 2} fill={theme.bore} />}

      {/* fluid: rear and front volume tints, masked to the bore; both follow the piston face exactly */}
      <g clipPath={`url(#${idPrefix}-chamber)`}>
        <g className="cutaway-piston-fluid" style={slideStyle(shift, 0, 60)}>
          <rect x={PISTON_MIN_X - 3000} y={CAP_TOP} width={3000} height={CHAMBER.y1 - CAP_TOP} fill={rearTint.fill} opacity={rearTint.opacity} />
          <rect x={pistonFront} y={CAP_TOP} width={3000} height={CHAMBER.y1 - CAP_TOP} fill={frontTint.fill} opacity={frontTint.opacity} />
        </g>
        {(['rear', 'front'] as const).map(end => {
          const live = trapped(end);
          return live && <rect key={end} className="cushion-trapped" {...rectProps(live.box)} fill={CUSHION_COLOR} opacity={live.opacity} />;
        })}
      </g>

      {(['rear', 'front'] as const).map(cap)}

      {/* piston head, spears and rod: one assembly, translated by the clamped stroke */}
      <g id="piston-rod-assembly" className="cutaway-piston" data-stroke={analysis.stroke.toFixed(3)} data-piston-x={(PISTON_MIN_X + shift).toFixed(1)} style={slideStyle(shift, 0, 60)}>
        {analysis.throughRod && <rect x={-760} y={ROD_Y.y0} width={760 + PISTON_MIN_X} height={ROD_Y.y1 - ROD_Y.y0} {...steelProps(theme)} />}
        <rect x={pistonFront} y={ROD_Y.y0} width={760} height={ROD_Y.y1 - ROD_Y.y0} {...steelProps(theme)} />
        {analysis.rear.enabled && (
          <polygon className="cushion-spear" data-end="rear" data-depth={analysis.rear.depth.toFixed(2)} points={`${PISTON_MIN_X},${AXIS_Y - SPEAR.base / 2} ${PISTON_MIN_X - SPEAR.length},${AXIS_Y - SPEAR.tip / 2} ${PISTON_MIN_X - SPEAR.length},${AXIS_Y + SPEAR.tip / 2} ${PISTON_MIN_X},${AXIS_Y + SPEAR.base / 2}`} {...groundProps(theme)} />
        )}
        {analysis.front.enabled && (
          <polygon className="cushion-spear" data-end="front" data-depth={analysis.front.depth.toFixed(2)} points={`${pistonFront},${AXIS_Y - SPEAR.base / 2} ${pistonFront + SPEAR.length},${AXIS_Y - SPEAR.tip / 2} ${pistonFront + SPEAR.length},${AXIS_Y + SPEAR.tip / 2} ${pistonFront},${AXIS_Y + SPEAR.base / 2}`} {...groundProps(theme)} />
        )}
        <PistonHead x={PISTON_MIN_X} y0={PISTON.y0} y1={PISTON.y1} width={PISTON.width} theme={theme} />
      </g>

      <RodBearing x0={CHAMBER.x1 + CAVITY.depth} length={36} direction={1} rodY0={ROD_Y.y0} rodY1={ROD_Y.y1} theme={theme} />
      {analysis.throughRod && <RodBearing x0={CHAMBER.x0 - CAVITY.depth} length={36} direction={-1} rodY0={ROD_Y.y0} rodY1={ROD_Y.y1} theme={theme} />}

      <CapStreams end="rear" state={analysis.rear} filling={extending} exhausting={retracting} bar={analysis.rearBar} medium={medium} />
      <CapStreams end="front" state={analysis.front} filling={retracting} exhausting={extending} bar={analysis.frontBar} medium={medium} />

      <PortTag x={PORT_X.rear} y={54} label="A" bar={analysis.rearBar} theme={theme} />
      <PortTag x={PORT_X.front} y={54} label="B" bar={analysis.frontBar} theme={theme} />
      <text x={390} y={292} textAnchor="middle" fontSize={13} fontFamily={SANS} fill={theme.text}>
        {tr('cutaway.cushion.readout', { stroke: (analysis.stroke * 100).toFixed(0), velocity: analysis.velocity.toFixed(2) })}
      </text>
      <text x={390} y={312} textAnchor="middle" fontSize={11} fill={theme.muted}>
        {analysis.rear.enabled || analysis.front.enabled ? tr('cutaway.cushion.spear') : tr('cutaway.cushion.noSpear')}
      </text>
    </svg>
  );
}
