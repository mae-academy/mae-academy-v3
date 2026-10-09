import React from 'react';
import { useFluidT, optionLabel } from '../../i18n/fluidText';
import { EXHAUST_PORTS, isReturnInterval, isThreePosition, spoolPortLabel, type SpoolAnalysis, type SpoolPort } from './cutawayPhysics';
import { EndActuator, isOutsideActuator } from './ActuatorCutaways';
import { AnchoredSpring, CutawayDefs, EDGE_WIDTH, FlowStream, SANS, PortTag, TANK_RETURN, fluidTint, groundProps, hatchFill, slideStyle, steelProps, type CutawayStageProps } from './cutawayParts';

/**
 * Stage layout. One continuous bore (y 140 … 200) runs the length of a solid metal body (y 96 … 244); its two end caps
 * hold the springs. Ports are straight rectangular channels, as wide as the radial opening the physics uses, ending in
 * a stub on the top or bottom face.
 */
const BODY = { x: 20, y: 96, width: 740, height: 148 };
const BORE_Y = { y0: 140, y1: 200 };
const CENTER_Y = 170;
const PORT_HALF = 12;
const STUB = { half: 18, length: 16 };
/** End caps: the part of the body beyond these x holds the springs and operators. */
const CAP_WIDTH = 112;
const SHAFT_HALF = 7;
const SPRING_REFERENCE = 130;
/** Piston head fitted to the stem end when an end is pilot-operated; it fills the bore. */
const PILOT_HEAD = { half: 30, width: 10 };
/** Seat plate the spring presses against on a spring-operated stem end. */
const SEAT = { half: 18, width: 6 };
const LAND_SEALS = 14;
/** Cross-drilled tank duct of a hydraulic 4-port housing: it runs above the bore and feeds the single tank port T. */
const DUCT = { y0: 104, y1: 124 };

const isSpring = (kind: string) => kind === 'Spring Return' || kind === 'Spring Centred';
const isPilot = (kind: string) => kind === 'Pneumatic Pilot';

const NAMES = { spool22: '2/2', spool32: '3/2', spool42: '4/2', spool52: '5/2', spool53: '5/3', spool43: '4/3', spool43float: '4/3' } as const;

/**
 * Sectional spool valve: a single ground spool with sealing lands slides in one bore, bridging ports through the
 * grooves between its lands or sealing them with a land. It moves by a CSS transform driven by
 * `snapshot.valves[id].spoolOffset`; grooves, channels and streams are tinted from the port pressures.
 */
export function SpoolValveCutaway({ analysis, medium, theme, idPrefix = 'spool', svgProps }: CutawayStageProps & { analysis: SpoolAnalysis; /** Placement when the stage is nested in a larger drawing (x, y, width, height). */ svgProps?: React.SVGProps<SVGSVGElement> }) {
  const tr = useFluidT();
  const { start, operators, body } = analysis;
  const { chamberX, ports, landHalf, wallLeft, wallRight, stem, landSpacing, lands, top } = body;
  const centring = isThreePosition(analysis.kind);
  const leftSpring = centring || isSpring(operators.left);
  const rightSpring = centring || isSpring(operators.right);
  const leftPilot = isPilot(operators.left);
  const rightPilot = isPilot(operators.right);
  const grooveCount = lands - 1;
  const [pocketLeft, ...inner] = analysis.intervals;
  const pocketRight = analysis.intervals[analysis.intervals.length - 1];
  const grooves = inner.slice(0, grooveCount);

  const tintOf = (interval: typeof pocketLeft | undefined) => (interval && isReturnInterval(body, interval) ? TANK_RETURN : interval ? fluidTint(interval.bar, medium, interval.vented) : fluidTint(0, medium));
  const pilotTint = (bar: number | null) => fluidTint(bar ?? 0, medium);
  const leftPocket = leftPilot ? pilotTint(analysis.pilotLeft) : tintOf(pocketLeft);
  const rightPocket = rightPilot ? pilotTint(analysis.pilotRight) : tintOf(pocketRight);

  const spanEnd = (lands - 1) * landSpacing;
  const leftStemEnd = start - landHalf - stem;
  const rightStemEnd = start + spanEnd + landHalf + stem;
  const leftFree = leftStemEnd - wallLeft - (leftPilot ? PILOT_HEAD.width : SEAT.width);
  const rightFree = wallRight - rightStemEnd - (rightPilot ? PILOT_HEAD.width : SEAT.width);

  /** The operator on this end is the one holding the spool shifted. 2-position valves show the right-hand end at rest. */
  const sideActive = (side: 'left' | 'right') => (side === 'left' ? analysis.offset > 0.5 : isThreePosition(analysis.kind) && analysis.offset < -0.5);
  const isTop = (port: SpoolPort) => top.includes(port);
  /** Hydraulic 4-port housing: both tank chambers open into one duct; only the chamber on port 3 is tagged and the duct has the one tank stub. */
  const ductBody = Boolean(body.tankDuct);
  const isTank = (port: SpoolPort) => ductBody && (port === '5' || port === '3');
  const px = (port: SpoolPort) => chamberX[ports.indexOf(port)];
  const tankMid = (px('5') + px('3')) / 2;
  /** Tint of a port's own channel: oil heading back to the tank is blue, otherwise the port pressure. */
  const channelTint = (port: SpoolPort) => {
    const segment = analysis.intervals.find(interval => interval.ports.includes(port));
    return segment && isReturnInterval(body, segment) ? TANK_RETURN : fluidTint(analysis.pressures[port], medium, EXHAUST_PORTS.includes(port));
  };
  const tankTint = analysis.intervals.some(interval => isReturnInterval(body, interval) && interval.ports.length > 1) ? TANK_RETURN : fluidTint(analysis.pressures['3'], medium, true);
  const stubTip = (port: SpoolPort) => (isTank(port) ? (DUCT.y0 + DUCT.y1) / 2 : isTop(port) ? BODY.y - STUB.length : BODY.y + BODY.height + STUB.length);
  const portLevel = (port: SpoolPort) => (isTop(port) ? 152 : 188);

  return (
    <svg viewBox="-90 0 960 330" role="img" aria-label={`${NAMES[analysis.kind]} spool valve cutaway`} data-testid={`cutaway-${analysis.kind}`} data-spool-offset={analysis.offset} style={{ width: '100%', height: 'auto', maxHeight: 400, display: 'block' }} {...svgProps}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <clipPath id={`${idPrefix}-bore`}><rect x={wallLeft} y={BORE_Y.y0} width={wallRight - wallLeft} height={BORE_Y.y1 - BORE_Y.y0} /></clipPath>

      {/* port stubs, then the body and its end caps */}
      {ductBody && <rect className="port-stub" data-port="T" x={tankMid - STUB.half} y={BODY.y - STUB.length} width={2 * STUB.half} height={STUB.length} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />}
      {ports.filter(port => !isTank(port)).map(port => {
        const up = isTop(port);
        return <rect key={port} className="port-stub" data-port={port} x={px(port) - STUB.half} y={up ? BODY.y - STUB.length : BODY.y + BODY.height} width={2 * STUB.half} height={STUB.length} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />;
      })}
      {(leftPilot || rightPilot) && [leftPilot && 70, rightPilot && 710].filter(Boolean).map(x => (
        <rect key={String(x)} className="port-stub" data-port="pilot" x={(x as number) - STUB.half} y={BODY.y - STUB.length} width={2 * STUB.half} height={STUB.length} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      ))}
      <rect className="valve-body" {...BODY} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="valve-cap" data-side="left" x={BODY.x} y={BODY.y} width={CAP_WIDTH} height={BODY.height} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="valve-cap" data-side="right" x={BODY.x + BODY.width - CAP_WIDTH} y={BODY.y} width={CAP_WIDTH} height={BODY.height} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />

      {/* the bore and the straight rectangular port channels, tinted with their port pressure */}
      <rect x={wallLeft} y={BORE_Y.y0} width={wallRight - wallLeft} height={BORE_Y.y1 - BORE_Y.y0} fill={theme.bore} />
      {ductBody && (
        <g data-chamber="T" className="tank-duct">
          {[...[px('5'), px('3')].map(x => ({ x: x - PORT_HALF, y: DUCT.y0, width: 2 * PORT_HALF, height: BORE_Y.y0 - DUCT.y0 })), { x: px('5') - PORT_HALF, y: DUCT.y0, width: px('3') - px('5') + 2 * PORT_HALF, height: DUCT.y1 - DUCT.y0 }, { x: tankMid - PORT_HALF, y: BODY.y - STUB.length, width: 2 * PORT_HALF, height: DUCT.y1 - (BODY.y - STUB.length) }].map((r, index) => (
            <g key={index}><rect {...r} fill={theme.bore} /><rect {...r} fill={tankTint.fill} opacity={tankTint.opacity} /></g>
          ))}
        </g>
      )}
      {ports.filter(port => !isTank(port)).map(port => {
        const up = isTop(port);
        const tint = channelTint(port);
        const channel = up ? { y: BODY.y - STUB.length, height: BORE_Y.y0 - (BODY.y - STUB.length) } : { y: BORE_Y.y1, height: BODY.y + BODY.height + STUB.length - BORE_Y.y1 };
        return (
          <g key={port} data-chamber={port}>
            <rect x={px(port) - PORT_HALF} width={2 * PORT_HALF} {...channel} fill={theme.bore} />
            <rect x={px(port) - PORT_HALF} width={2 * PORT_HALF} {...channel} fill={tint.fill} opacity={tint.opacity} />
          </g>
        );
      })}
      {([['left', leftPilot, 70], ['right', rightPilot, 710]] as const).map(([side, pilot, x]) => pilot && (
        <g key={side} data-pilot-channel={side}>
          <rect x={x - PORT_HALF} y={BODY.y - STUB.length} width={2 * PORT_HALF} height={BORE_Y.y0 - (BODY.y - STUB.length)} fill={theme.bore} />
          <rect x={x - PORT_HALF} y={BODY.y - STUB.length} width={2 * PORT_HALF} height={BORE_Y.y0 - (BODY.y - STUB.length)} fill={pilotTint(side === 'left' ? analysis.pilotLeft : analysis.pilotRight).fill} opacity={pilotTint(side === 'left' ? analysis.pilotLeft : analysis.pilotRight).opacity} />
        </g>
      ))}

      {/* the spool and everything that moves with it */}
      <g clipPath={`url(#${idPrefix}-bore)`}>
        <g className="cutaway-spool" data-start={start} style={slideStyle(start)}>
          {/* fluid in the pockets and grooves, filling the bore around the shaft */}
          <rect x={-3000} y={BORE_Y.y0} width={3000 - landHalf} height={BORE_Y.y1 - BORE_Y.y0} fill={leftPocket.fill} opacity={leftPocket.opacity} />
          {grooves.map((groove, index) => {
            const tint = tintOf(groove);
            return <rect key={index} className="spool-groove" x={index * landSpacing + landHalf} y={BORE_Y.y0} width={landSpacing - 2 * landHalf} height={BORE_Y.y1 - BORE_Y.y0} fill={tint.fill} opacity={tint.opacity} />;
          })}
          <rect x={spanEnd + landHalf} y={BORE_Y.y0} width={3000} height={BORE_Y.y1 - BORE_Y.y0} fill={rightPocket.fill} opacity={rightPocket.opacity} />
          {/* one shaft carries every land */}
          <rect className="spool-shaft" x={-landHalf - stem} y={CENTER_Y - SHAFT_HALF} width={spanEnd + 2 * landHalf + 2 * stem} height={2 * SHAFT_HALF} {...steelProps(theme)} />
          {Array.from({ length: lands }, (_, index) => (
            <g key={index} data-land={index}>
              <rect className="spool-land" x={index * landSpacing - landHalf} y={BORE_Y.y0} width={2 * landHalf} height={BORE_Y.y1 - BORE_Y.y0} {...groundProps(theme)} />
              {[-LAND_SEALS, LAND_SEALS].map(offset => (
                <rect key={offset} className="land-seal" x={index * landSpacing + offset - 2.5} y={BORE_Y.y0} width={5} height={BORE_Y.y1 - BORE_Y.y0} fill={theme.seal} />
              ))}
            </g>
          ))}
          {leftPilot
            ? <rect className="pilot-head" x={-landHalf - stem - PILOT_HEAD.width} y={CENTER_Y - PILOT_HEAD.half} width={PILOT_HEAD.width} height={2 * PILOT_HEAD.half} {...groundProps(theme)} />
            : leftSpring && <rect className="spring-seat" x={-landHalf - stem - SEAT.width} y={CENTER_Y - SEAT.half} width={SEAT.width} height={2 * SEAT.half} {...groundProps(theme)} />}
          {rightPilot
            ? <rect className="pilot-head" x={spanEnd + landHalf + stem} y={CENTER_Y - PILOT_HEAD.half} width={PILOT_HEAD.width} height={2 * PILOT_HEAD.half} {...groundProps(theme)} />
            : rightSpring && <rect className="spring-seat" x={spanEnd + landHalf + stem} y={CENTER_Y - SEAT.half} width={SEAT.width} height={2 * SEAT.half} {...groundProps(theme)} />}
          {/* elastomer seal ring on each pilot piston: the cavity is sealed, so pressure alone moves it */}
          {leftPilot && <rect className="pilot-seal" x={-landHalf - stem - PILOT_HEAD.width + 3} y={CENTER_Y - PILOT_HEAD.half - 1} width={4} height={2 * PILOT_HEAD.half + 2} rx={1.5} fill={theme.seal} />}
          {rightPilot && <rect className="pilot-seal" x={spanEnd + landHalf + stem + 3} y={CENTER_Y - PILOT_HEAD.half - 1} width={4} height={2 * PILOT_HEAD.half + 2} rx={1.5} fill={theme.seal} />}
        </g>
      </g>

      {/* end-cap springs: flat black coils flush against the cap shoulder, their free end seated on the spool */}
      {leftSpring && <rect className="spring-shoulder" x={wallLeft - 6} y={CENTER_Y - SEAT.half - 4} width={6} height={2 * SEAT.half + 8} {...groundProps(theme)} />}
      {rightSpring && <rect className="spring-shoulder" x={wallRight} y={CENTER_Y - SEAT.half - 4} width={6} height={2 * SEAT.half + 8} {...groundProps(theme)} />}
      {leftSpring && <AnchoredSpring anchorX={wallLeft} y={CENTER_Y} length={leftFree} reference={SPRING_REFERENCE} direction={1} amplitude={20} theme={theme} />}
      {rightSpring && <AnchoredSpring anchorX={wallRight} y={CENTER_Y} length={rightFree} reference={SPRING_REFERENCE} direction={-1} amplitude={20} theme={theme} />}

      {(['left', 'right'] as const).map(side => isOutsideActuator(operators[side]) && (
        <EndActuator key={side} kind={operators[side]} side={side} edgeX={side === 'left' ? BODY.x : BODY.x + BODY.width} tipX={side === 'left' ? leftStemEnd : rightStemEnd} active={sideActive(side)} axisY={CENTER_Y} theme={theme} idPrefix={idPrefix} />
      ))}

      {/* fluid paths through the grooves */}
      {analysis.connections.map(({ from, to }) => {
        const level = portLevel(from);
        const points: Array<[number, number]> = [[px(from), stubTip(from)], [px(from), level], [px(to), level], [px(to), stubTip(to)]];
        return <FlowStream key={`${from}-${to}`} points={points} />;
      })}

      {ports.filter(port => !ductBody || port !== '5').map(port => (
        <PortTag key={port} x={isTank(port) ? tankMid : px(port)} y={isTop(port) ? 62 : 282} label={spoolPortLabel(body, port)} bar={analysis.pressures[port]} theme={theme} below={!isTop(port)} />
      ))}
      {leftPilot && <PortTag x={70} y={62} label={ports.includes('4') ? '14' : '12'} bar={analysis.pilotLeft ?? 0} theme={theme} />}
      {rightPilot && <PortTag x={710} y={62} label={ports.includes('4') ? '12' : '10'} bar={analysis.pilotRight ?? 0} theme={theme} />}
      <text x={wallLeft} y={324} fontSize={11} fill={theme.muted} fontFamily={SANS}>{leftSpring ? (centring ? tr('cutaway.spool.centringSpring') : optionLabel(tr, operators.left)) : operators.left !== 'None' ? optionLabel(tr, operators.left) : ''}</text>
      <text x={wallRight} y={324} fontSize={11} fill={theme.muted} fontFamily={SANS} textAnchor="end">{rightSpring ? (centring ? tr('cutaway.spool.centringSpring') : optionLabel(tr, operators.right)) : operators.right !== 'None' ? optionLabel(tr, operators.right) : ''}</text>
    </svg>
  );
}
