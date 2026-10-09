import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { PressureValveAnalysis } from './cutawayPhysics';
import { CutawayDefs, EDGE_WIDTH, FLOW_BLUE, FlowStream, PortTag, SANS, fluidTint, groundProps, hatchFill, slideStyle, steelProps, type CutawayStageProps, type CutawayTheme } from './cutawayParts';
import { VENTED_BAR, VentArrow } from './FlowControlCutaways';

type Point = [number, number];

/** Diaphragm rim height, poppet travel (px) and the extra rise of a relieving diaphragm off its relief seat. */
export const DIAPHRAGM_REST = 172;
export const REGULATOR_TRAVEL = 16;
export const RELIEF_LIFT = 20;
const SEAT_BOTTOM = 266;
const RELIEF_OPEN_RISE = 35;

/** Vertical zig-zag coil from (x, y0) down to (x, y1). */
const coil = (x: number, y0: number, y1: number, coils: number, amplitude: number): string => {
  const lead = 6;
  const span = y1 - y0 - 2 * lead;
  const points = [`${x},${y0}`, `${x},${y0 + lead}`];
  for (let i = 0; i < coils * 2; i += 1) points.push(`${x + (i % 2 === 0 ? -amplitude : amplitude)},${y0 + lead + (span * (i + 0.5)) / (coils * 2)}`);
  points.push(`${x},${y1 - lead}`, `${x},${y1}`);
  return `M ${points.join(' L ')}`;
};

function Spring({ x, y0, y1, coils: n, amplitude, theme }: { x: number; y0: number; y1: number; coils: number; amplitude: number; theme: CutawayTheme }) {
  return <path className="pressure-spring" d={coil(x, y0, y1, n, amplitude)} fill="none" stroke={theme.spring} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />;
}

/** Diaphragm: rim clamped at DIAPHRAGM_REST, flat centre carried to `centre`. */
const diaphragmPath = (centre: number): string => `M 250 ${DIAPHRAGM_REST} L 286 ${DIAPHRAGM_REST} Q 306 ${centre} 334 ${centre} H 446 Q 474 ${centre} 494 ${DIAPHRAGM_REST} L 530 ${DIAPHRAGM_REST}`;

/** Diaphragm pressure regulator: spring, sensing diaphragm, throttling poppet; the relieving type vents through the diaphragm centre. */
function RegulatorStage({ analysis, medium, theme, idPrefix }: CutawayStageProps & { analysis: PressureValveAnalysis; idPrefix: string }) {
  const tr = useFluidT();
  const { deflection, gap, venting, relieving } = analysis;
  const lift = REGULATOR_TRAVEL * Math.min(deflection, 1) + RELIEF_OPEN_RISE * Math.max(0, deflection - 1);
  const centre = DIAPHRAGM_REST - lift;
  const stemLift = REGULATOR_TRAVEL * Math.min(deflection, 1);
  const stemTop = DIAPHRAGM_REST - stemLift + 3;
  const gapPx = REGULATOR_TRAVEL * gap;
  const poppetY = SEAT_BOTTOM + gapPx;
  const inTint = fluidTint(analysis.inBar, medium);
  const outTint = fluidTint(analysis.outBar, medium);
  const flowing = gap >= 0.1 && analysis.inBar > analysis.outBar + 0.05;
  const gapMid = SEAT_BOTTOM + gapPx / 2;
  const width = 3 + 5 * gap;
  const streams: Point[][] = [
    [[120, 300], [330, 300], [352, gapMid], [382, gapMid], [382, 232], [350, 208], [310, 196]],
    [[120, 304], [330, 304], [352, gapMid + 1], [398, gapMid + 1], [398, 236], [432, 215], [540, 215], [660, 215]],
  ];
  const cavities = (
    <>
      <rect x={250} y={80} width={280} height={DIAPHRAGM_REST - 80} />
      <rect x={250} y={DIAPHRAGM_REST} width={280} height={80} />
      <rect x={376} y={252} width={28} height={SEAT_BOTTOM - 252} />
      <rect x={270} y={SEAT_BOTTOM} width={210} height={66} />
      <rect x={140} y={284} width={140} height={32} />
      <rect x={520} y={199} width={140} height={32} />
      <rect x={200} y={116} width={60} height={14} />
    </>
  );

  return (
    <svg viewBox="0 0 780 380" role="img" aria-label="Pressure regulator cutaway" data-testid="cutaway-regulator" data-relieving={relieving} data-deflection={deflection.toFixed(2)} data-gap={gap.toFixed(2)} data-venting={venting} data-mode={venting ? 'venting' : gap <= 0.01 ? 'closed' : 'open'} style={{ width: '100%', height: 'auto', maxHeight: 430, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <clipPath id={`${idPrefix}-cavity`}>{cavities}</clipPath>
      <rect className="valve-body" x={200} y={50} width={380} height={290} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <g className="cavity" fill={theme.bore}>{cavities}</g>
      {/* ports 1 and 2 outside the body */}
      <rect x={116} y={284} width={24} height={32} fill={inTint.fill} opacity={inTint.opacity} />
      <rect x={660} y={199} width={24} height={32} fill={outTint.fill} opacity={outTint.opacity} />
      <g clipPath={`url(#${idPrefix}-cavity)`}>
        <rect className="inlet-tint" x={140} y={266} width={340} height={66} fill={inTint.fill} opacity={inTint.opacity} />
        <rect className="outlet-tint" x={250} y={DIAPHRAGM_REST} width={410} height={80} fill={outTint.fill} opacity={outTint.opacity} />
        <rect x={376} y={252} width={28} height={SEAT_BOTTOM - 252} fill={flowing ? outTint.fill : inTint.fill} opacity={0.8} />
        {venting && <rect className="vent-flood" x={200} y={80} width={330} height={Math.max(8, centre - 80)} fill={FLOW_BLUE} opacity={0.45} />}
      </g>
      <rect x={250} y={80} width={280} height={DIAPHRAGM_REST - 80} fill="none" stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={250} y={DIAPHRAGM_REST} width={280} height={80} fill="none" stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />

      {/* seat plate between the outlet chamber and the inlet chamber */}
      <polygon className="regulator-seat" points={`270,252 376,252 376,${SEAT_BOTTOM} 270,${SEAT_BOTTOM}`} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <polygon className="regulator-seat" points={`404,252 530,252 530,${SEAT_BOTTOM} 404,${SEAT_BOTTOM}`} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />

      {/* regulating knob, adjusting screw, spring plate and the main control spring */}
      <rect className="adjust-knob" x={355} y={16} width={70} height={18} rx={4} {...steelProps(theme)} />
      <path d="M 368 20 V 30 M 380 20 V 30 M 392 20 V 30 M 404 20 V 30 M 416 20 V 30" stroke={theme.steelEdge} strokeWidth={1} />
      <rect className="adjust-screw" x={385} y={34} width={10} height={58} {...steelProps(theme)} />
      <rect x={340} y={86} width={100} height={8} {...steelProps(theme)} />
      <g className="control-spring" data-length={(centre - 8 - 94).toFixed(1)} style={slideStyle(0, 0, 140)}>
        <Spring x={390} y0={94} y1={centre - 8} coils={7} amplitude={26} theme={theme} />
      </g>

      {/* sensing diaphragm with its spring seat; the relieving type has a relief seat in its centre */}
      <g className="diaphragm" data-centre={centre} style={{ transition: 'none' }}>
        <rect x={346} y={centre - 8} width={88} height={7} {...steelProps(theme)} />
        <path d={diaphragmPath(centre)} fill="none" stroke="#1F2937" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <path d={diaphragmPath(centre)} fill="none" stroke="#6B7280" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" transform="translate(0,-1.5)" />
      </g>
      {/* stem and throttling poppet: they follow the diaphragm until it lifts off the relief seat */}
      <rect className="regulator-stem" x={387} y={stemTop} width={6} height={poppetY - stemTop} {...groundProps(theme)} />
      <rect className="relief-seat" x={376} y={stemTop - 3} width={28} height={7} {...groundProps(theme)} />
      <g className="regulator-poppet" data-gap={gapPx.toFixed(1)}>
        <polygon points={`378,${poppetY} 402,${poppetY} 408,${poppetY + 10} 372,${poppetY + 10}`} {...groundProps(theme)} />
        <Spring x={390} y0={poppetY + 10} y1={326} coils={4} amplitude={13} theme={theme} />
      </g>

      {/* air under pressure: through the open poppet gap, and out of the bonnet vent when the diaphragm lifts off the relief seat */}
      {flowing && streams.map((points, index) => <FlowStream key={index} points={points} color={FLOW_BLUE} width={width} radius={10} />)}
      {venting && <FlowStream points={[[390, DIAPHRAGM_REST - 6], [390, 150], [330, 124], [210, 123], [160, 123]]} color={FLOW_BLUE} width={5} radius={8} />}
      {venting && analysis.outBar <= VENTED_BAR && <VentArrow x={190} y={123} direction={-1} />}

      <PortTag x={100} y={332} label="1" bar={analysis.inBar} theme={theme} below />
      <PortTag x={700} y={252} label="2" bar={analysis.outBar} theme={theme} below />
      <text x={190} y={106} textAnchor="end" fontSize={11} fontFamily={SANS} fill={theme.muted}>{relieving ? '3' : tr('cutaway.pressure.breather')}</text>
      <text x={470} y={30} fontSize={13} fontFamily={SANS} fill={theme.text} data-testid="set-label">{tr('cutaway.pressure.setLabel', { set: analysis.setBar.toFixed(1) })}</text>
      <text x={390} y={364} textAnchor="middle" fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr(relieving ? 'cutaway.pressure.regulator.captionRelieving' : 'cutaway.pressure.regulator.caption')}</text>
    </svg>
  );
}

/** Direct-acting relief valve: conical poppet held on its seat by a heavy adjustable spring, lifted by the inlet pressure. */
function ReliefStage({ analysis, medium, theme, idPrefix }: CutawayStageProps & { analysis: PressureValveAnalysis; idPrefix: string }) {
  const tr = useFluidT();
  const open = analysis.venting;
  const lift = open ? RELIEF_LIFT : 0;
  const cone = 212 - lift;
  const inTint = fluidTint(analysis.inBar, medium);
  const cavities = (
    <>
      <rect x={140} y={250} width={170} height={32} />
      <rect x={300} y={232} width={190} height={84} />
      <rect x={376} y={220} width={28} height={13} />
      <rect x={330} y={140} width={150} height={80} />
      <rect x={370} y={80} width={40} height={62} />
      <rect x={470} y={170} width={190} height={30} />
    </>
  );
  return (
    <svg viewBox="0 0 780 380" role="img" aria-label="Pressure relief valve cutaway" data-testid="cutaway-relief" data-open={open} data-lift={lift} data-poppet-y={cone} style={{ width: '100%', height: 'auto', maxHeight: 430, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <clipPath id={`${idPrefix}-cavity`}>{cavities}</clipPath>
      <rect className="valve-body" x={240} y={60} width={300} height={290} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <g className="cavity" fill={theme.bore}>{cavities}</g>
      <rect x={116} y={250} width={24} height={32} fill={inTint.fill} opacity={inTint.opacity} />
      <g clipPath={`url(#${idPrefix}-cavity)`}>
        <rect className="inlet-tint" x={140} y={220} width={350} height={100} fill={inTint.fill} opacity={inTint.opacity} />
        {open && <rect className="vent-flood" x={330} y={140} width={330} height={80} fill={FLOW_BLUE} opacity={0.4} />}
        {open && <rect className="vent-flood" x={470} y={170} width={190} height={30} fill={FLOW_BLUE} opacity={0.5} />}
      </g>
      {/* seat plate with its orifice */}
      <polygon className="relief-seat" points="300,220 376,220 376,233 300,233" fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <polygon className="relief-seat" points="404,220 490,220 490,233 404,233" fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />

      {/* adjusting screw, spring plate and the heavy compression spring */}
      <rect className="adjust-knob" x={355} y={20} width={70} height={18} rx={4} {...steelProps(theme)} />
      <rect className="adjust-screw" x={385} y={38} width={10} height={44} {...steelProps(theme)} />
      <rect x={360} y={80} width={60} height={8} {...steelProps(theme)} />
      <g className="relief-spring" data-length={(cone - 8 - 88).toFixed(1)}>
        <Spring x={390} y0={88} y1={cone - 8} coils={9} amplitude={17} theme={theme} />
      </g>
      <g className="relief-poppet" data-state={open ? 'open' : 'seated'} data-lift={lift} style={{ transition: 'none' }}>
        <rect x={346} y={cone - 8} width={88} height={8} {...groundProps(theme)} />
        <polygon className="poppet-cone" points={`${390 - 22},${cone} ${390 + 22},${cone} 390,${cone + 22}`} {...groundProps(theme)} />
      </g>
      {open && <FlowStream points={[[120, 266], [340, 266], [392, 250], [392, 226], [430, 208], [470, 185], [660, 185]]} color={FLOW_BLUE} width={6} radius={10} />}
      {open && analysis.setBar >= 0 && <VentArrow x={664} y={185} direction={1} />}

      <PortTag x={100} y={304} label="1" bar={analysis.inBar} theme={theme} below />
      <text x={600} y={232} textAnchor="middle" fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.pressure.relief.vent')}</text>
      <text x={470} y={40} fontSize={13} fontFamily={SANS} fill={theme.text} data-testid="set-label">{tr('cutaway.pressure.setLabel', { set: analysis.setBar.toFixed(1) })}</text>
      <text x={390} y={372} textAnchor="middle" fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.pressure.relief.caption')}</text>
    </svg>
  );
}

/** Cutaway of a pressure regulator (non-relieving or relieving) or a pressure relief valve. */
export function PressureValveCutaway(props: CutawayStageProps & { analysis: PressureValveAnalysis }) {
  const idPrefix = props.idPrefix ?? (props.analysis.kind === 'regulator' ? 'regulator' : 'relief');
  return props.analysis.kind === 'regulator' ? <RegulatorStage {...props} idPrefix={idPrefix} /> : <ReliefStage {...props} idPrefix={idPrefix} />;
}
