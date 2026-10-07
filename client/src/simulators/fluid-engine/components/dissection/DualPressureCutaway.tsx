import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { GateAnalysis } from './cutawayPhysics';
import { CutawayDefs, FlowStream, PortTag, SANS, fluidTint, hatchFill, slideStyle, steelProps, type CutawayStageProps } from './cutawayParts';

/* Stage geometry. The spool is drawn at its centred position and slid by `offset * TRAVEL`. */
const CX = 390;
const CY = 200;
const CASING = { x: 50, y: 90, width: 680, height: 190 };
const INLET_HALF = 18; // inlet bore half-height; the discs are taller, so they land on the shoulders
const DISC = { half: 34, width: 36 };
/** Central gap between the two discs when the spool is balanced. It is wider than a disc, so the pocket has room to flow. */
const GAP = 44;
/** Each disc sits half a gap plus half a disc from the centre; sliding it by this much parks it exactly under port 2. */
const TRAVEL = (GAP + DISC.width) / 2;
const DISC_CENTER = TRAVEL;
const SHOULDER = 5; // thickness of the landing shoulders (the seats the discs land on)
/** Inner reach of the chamber: the far disc's outer face touches its shoulder when the spool is pushed over. */
const REACH = GAP + 1.5 * DISC.width;
const CHAMBER = { x0: CX - REACH - SHOULDER, x1: CX + REACH + SHOULDER, half: DISC.half + 2 };
const DUCT_HALF = 14; // port 2 duct, centred over the chamber; narrower than a disc so a disc under it seals it
const SLOT_CENTER = 20; // bypass port height from the axis
const SLOT_HALF = 7;
const SHAFT_HALF = 6;
const HUB_HALF = 7; // cross-bore through the shaft that joins the lower duct to port 2
const STREAM_TOP = 72;

/** Geometry the cutaway is built from, exported so the tests can check the clearances. */
export const AND_GEOMETRY = { CX, DISC, GAP, TRAVEL, SHOULDER, DUCT_HALF, INLET_HALF, CHAMBER, SLOT_CENTER, SLOT_HALF, SHAFT_HALF, HUB_HALF } as const;

const BORE_PATH = [
  `M ${CASING.x} ${CY - INLET_HALF}`, `H ${CHAMBER.x0}`, `V ${CY - CHAMBER.half}`, `H ${CHAMBER.x1}`, `V ${CY - INLET_HALF}`,
  `H ${CASING.x + CASING.width}`, `V ${CY + INLET_HALF}`, `H ${CHAMBER.x1}`, `V ${CY + CHAMBER.half}`, `H ${CHAMBER.x0}`,
  `V ${CY + INLET_HALF}`, `H ${CASING.x}`, 'Z',
].join(' ');

/**
 * AND gate: a horizontal bore with an inlet (port 1) at each end, the outlet (port 2) on top and a
 * stepped H-spool: two sealing discs on a narrow shaft, each disc pierced by upper and lower bypass ports.
 * One signal pushes the spool onto the opposite shoulder, which parks the near disc across the
 * port 2 duct and seals the far inlet; two signals balance it in the middle, where the bypass ports feed
 * the pocket and air streams through the clearance ducts above and below the shaft (the lower one rises
 * through a cross-bore in the shaft) into port 2. The spool's x position is `snapshot.logic[id].offset`.
 */
export function DualPressureCutaway({ analysis, medium, theme, idPrefix = 'and' }: CutawayStageProps & { analysis: GateAnalysis }) {
  const tr = useFluidT();
  const dx = analysis.offset * TRAVEL;
  const pocketBar = analysis.open ? analysis.out : analysis.leftOn ? analysis.left : analysis.rightOn ? analysis.right : 0;
  const left = fluidTint(analysis.left, medium);
  const right = fluidTint(analysis.right, medium);
  const out = fluidTint(analysis.out, medium);
  const pocket = fluidTint(pocketBar, medium);
  const leftSlot = fluidTint(Math.max(analysis.left, pocketBar), medium);
  const rightSlot = fluidTint(Math.max(analysis.right, pocketBar), medium);

  const leftFace = CX - DISC_CENTER - DISC.width / 2; // centred position of each disc's outer face
  const rightFace = CX + DISC_CENTER + DISC.width / 2;
  const pocketX0 = leftFace + DISC.width;
  const pocketWidth = rightFace - DISC.width - pocketX0;
  const faceGap = 6;

  const discs = [
    { key: 'left', center: CX - DISC_CENTER, slot: leftSlot },
    { key: 'right', center: CX + DISC_CENTER, slot: rightSlot },
  ];

  return (
    <svg viewBox="0 0 780 320" role="img" aria-label="Dual-pressure valve cutaway" data-testid="cutaway-and" data-spool-offset={analysis.offset} data-gap={GAP} data-disc-width={DISC.width} style={{ width: '100%', height: 'auto', maxHeight: 360, display: 'block' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <clipPath id={`${idPrefix}-bore`}><path d={BORE_PATH} /></clipPath>

      {/* casing, cut open: stepped bore with shoulder seats, and the port 2 duct */}
      <rect {...CASING} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={2} />
      <path d={BORE_PATH} fill={theme.bore} />
      <rect x={CX - DUCT_HALF} y={CASING.y} width={2 * DUCT_HALF} height={CY - CHAMBER.half - CASING.y + 1} fill={theme.bore} />
      <rect x={CX - DUCT_HALF} y={CASING.y} width={2 * DUCT_HALF} height={CY - CHAMBER.half - CASING.y + 1} fill={out.fill} opacity={out.opacity} />
      <line x1={CX - DUCT_HALF} x2={CX - DUCT_HALF} y1={CASING.y} y2={CY - CHAMBER.half} stroke={theme.casingEdge} strokeWidth={1.5} />
      <line x1={CX + DUCT_HALF} x2={CX + DUCT_HALF} y1={CASING.y} y2={CY - CHAMBER.half} stroke={theme.casingEdge} strokeWidth={1.5} />

      {/* fluid follows the spool: left inlet side, the pocket between the discs, right inlet side */}
      <g clipPath={`url(#${idPrefix}-bore)`}>
        <g style={slideStyle(dx)}>
          <rect x={CASING.x - 400} y={CY - CHAMBER.half - 4} width={leftFace - CASING.x + 400} height={2 * CHAMBER.half + 8} fill={left.fill} opacity={left.opacity} />
          <rect x={pocketX0} y={CY - CHAMBER.half - 4} width={pocketWidth} height={2 * CHAMBER.half + 8} fill={pocket.fill} opacity={pocket.opacity} />
          <rect x={rightFace} y={CY - CHAMBER.half - 4} width={400 + CASING.width} height={2 * CHAMBER.half + 8} fill={right.fill} opacity={right.opacity} />
        </g>
      </g>

      {/* landing shoulders: the seats the discs land on, above and below each inlet bore */}
      {[CHAMBER.x0, CHAMBER.x1 - SHOULDER].map(x => (
        <g key={x} className="and-shoulders">
          <rect x={x} y={CY - CHAMBER.half} width={SHOULDER} height={CHAMBER.half - INLET_HALF} fill={theme.seal} />
          <rect x={x} y={CY + INLET_HALF} width={SHOULDER} height={CHAMBER.half - INLET_HALF} fill={theme.seal} />
        </g>
      ))}

      {/* the H-spool: two discs on a shaft with a cross-bore at its hub; each disc has upper and lower bypass ports and seal rings on its rim */}
      <g id="and-spool" className="cutaway-spool" data-offset={analysis.offset} style={slideStyle(dx)}>
        {[[pocketX0 - 2, CX - HUB_HALF], [CX + HUB_HALF, pocketX0 + pocketWidth + 2]].map(([x0, x1]) => (
          <rect key={x0} className="and-shaft" x={x0} y={CY - SHAFT_HALF} width={x1 - x0} height={2 * SHAFT_HALF} {...steelProps(theme)} />
        ))}
        {discs.map(disc => (
          <g key={disc.key} className="and-disc">
            <rect x={disc.center - DISC.width / 2} y={CY - DISC.half} width={DISC.width} height={2 * DISC.half} rx={2} {...steelProps(theme)} />
            {[-1, 1].map(side => (
              <g key={side}>
                <rect x={disc.center - DISC.width / 2} y={CY + side * SLOT_CENTER - SLOT_HALF} width={DISC.width} height={2 * SLOT_HALF} fill={theme.bore} />
                <rect x={disc.center - DISC.width / 2} y={CY + side * SLOT_CENTER - SLOT_HALF} width={DISC.width} height={2 * SLOT_HALF} fill={disc.slot.fill} opacity={disc.slot.opacity} />
                <rect x={disc.center - 4} y={side < 0 ? CY - DISC.half - 3 : CY + DISC.half - 3} width={8} height={6} rx={1.5} fill={theme.seal} />
              </g>
            ))}
          </g>
        ))}
      </g>

      {/* streams: only while both signals are present do the bypass ports and the ducts around the shaft carry air to port 2 */}
      {analysis.open && (
        <g className="and-streams">
          <FlowStream width={3} points={[[60, CY - 9], [leftFace - 18, CY - 9], [leftFace - 8, CY - SLOT_CENTER], [CX - 11, CY - SLOT_CENTER], [CX - 11, STREAM_TOP]]} />
          <FlowStream width={3} points={[[60, CY + 9], [leftFace - 18, CY + 9], [leftFace - 8, CY + SLOT_CENTER], [CX - 4, CY + SLOT_CENTER], [CX - 4, STREAM_TOP + 20]]} />
          <FlowStream width={3} points={[[720, CY - 9], [rightFace + 18, CY - 9], [rightFace + 8, CY - SLOT_CENTER], [CX + 11, CY - SLOT_CENTER], [CX + 11, STREAM_TOP]]} />
          <FlowStream width={3} points={[[720, CY + 9], [rightFace + 18, CY + 9], [rightFace + 8, CY + SLOT_CENTER], [CX + 4, CY + SLOT_CENTER], [CX + 4, STREAM_TOP + 32]]} />
        </g>
      )}
      {!analysis.open && analysis.leftOn && <FlowStream points={[[60, CY], [leftFace + dx - faceGap, CY]]} />}
      {!analysis.open && analysis.rightOn && <FlowStream points={[[720, CY], [rightFace + dx + faceGap, CY]]} />}

      <PortTag x={40} y={CY + 8} label="1" bar={analysis.left} theme={theme} anchor="end" />
      <PortTag x={740} y={CY + 8} label="1" bar={analysis.right} theme={theme} anchor="start" />
      <PortTag x={CX} y={46} label="2" bar={analysis.out} theme={theme} />
      <text x={CX} y={304} textAnchor="middle" fontSize={12} fontWeight={500} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.and.caption')}</text>
    </svg>
  );
}
