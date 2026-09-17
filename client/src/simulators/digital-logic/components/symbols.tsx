/**
 * ElectroLab – IEEE 315 / IEC 60617 SVG Symbol Renderer
 * Each symbol is drawn centered at (0,0).
 * Terminals are at the exact boundary of the symbol.
 */

import React from 'react';
import { dynamicGateGeometryFor, GRID, isScalableLogicGate, logicBlockLayoutFor, logicBodyBoundaryForPin, type LogicBlockLayout, type LogicSymbolPin } from '@/simulators/digital-logic/components/dynamicLogicGeometry';
import { getDef } from '@/simulators/digital-logic/models/componentDefs';

interface SymbolProps {
  powered?: boolean;
  props?: Record<string, any>;
  animTime?: number; // 0..1 for motor rotation etc.
}

type SymbolFC = React.FC<SymbolProps>;

function SemicircularHorizontalCoil({ x1, x2, y, rise = -10 }: { x1: number; x2: number; y: number; rise?: number }) {
  const step = (x2 - x1) / 4;
  const d = Array.from({ length: 4 }, (_, index) => {
    const start = x1 + index * step;
    const end = start + step;
    return `C ${start},${y + rise} ${end},${y + rise} ${end},${y}`;
  }).join(' ');
  return <path d={`M ${x1},${y} ${d}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />;
}

function SemicircularVerticalCoil({ x, y1, y2, bulge }: { x: number; y1: number; y2: number; bulge: number }) {
  const step = (y2 - y1) / 4;
  const d = Array.from({ length: 4 }, (_, index) => {
    const start = y1 + index * step;
    const end = start + step;
    return `C ${x + bulge},${start} ${x + bulge},${end} ${x},${end}`;
  }).join(' ');
  return <path d={`M ${x},${y1} ${d}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />;
}

const DOCUMENTED_GRID_LOCAL = 100 / 3;
const DOCUMENTED_PHASE_OUTPUT_X = Math.sqrt(22 ** 2 - 18 ** 2);
const DOCUMENTED_NETWORK_ARM_HALF_LENGTH = 100 / 6;
const DOCUMENTED_NETWORK_ARM_BODY_WIDTH = 12;
const DOCUMENTED_NETWORK_ARM_BODY_HEIGHT = 4.2;

/** Tab D resistor body: the potentiometer's IEEE-style rectangle with no wiper branch. */
function RectangularResistor({ strokeWidth = 2, halfLength = DOCUMENTED_GRID_LOCAL, bodyWidth = 40, bodyHeight = 14 }: { strokeWidth?: number; halfLength?: number; bodyWidth?: number; bodyHeight?: number }) {
  const bodyStart = -bodyWidth / 2;
  const bodyEnd = bodyWidth / 2;
  return <g data-rectangular-resistor="potentiometer-style">
    <line x1={-halfLength} y1={0} x2={bodyStart} y2={0} stroke="currentColor" strokeWidth={strokeWidth} />
    <rect x={bodyStart} y={-bodyHeight / 2} width={bodyWidth} height={bodyHeight} rx={2} fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
    <line x1={bodyEnd} y1={0} x2={halfLength} y2={0} stroke="currentColor" strokeWidth={strokeWidth} />
  </g>;
}

// ─── SOURCES ─────────────────────────────────────────────────────────────────

const DcVoltage: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2} />
    {/* + symbol at top, - at bottom */}
    <line x1={-6} y1={-8} x2={6} y2={-8} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={-14} x2={0} y2={-2} stroke="currentColor" strokeWidth={2} />
    <line x1={-6} y1={8} x2={6} y2={8} stroke="currentColor" strokeWidth={2} />
    {/* wire stubs to boundary */}
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
  </g>
);

const AcVoltage: SymbolFC = ({ props }) => {
  const wf = (props?.waveform as string) || 'sine';
  const documented = props?._documentedStyle === true;
  const waveSymbols: Record<string, React.ReactNode> = {
    sine: documented
      ? <path d="M -11,2 C -7,-7 -3,-7 0,2 C 3,11 7,11 11,2" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      : <path d="M -10,-8 Q -5,-16 0,-8 Q 5,0 10,-8" fill="none" stroke="currentColor" strokeWidth={1.5} />,
    square: <path d="M -10,-14 L -10,-4 L 0,-4 L 0,-14 L 10,-14 L 10,-4" fill="none" stroke="currentColor" strokeWidth={1.5} />,
    sawtooth: <path d="M -10,-4 L 0,-14 L 0,-4 L 10,-14" fill="none" stroke="currentColor" strokeWidth={1.5} />,
    triangle: <path d="M -10,-4 L -5,-14 L 0,-4 L 5,-14 L 10,-4" fill="none" stroke="currentColor" strokeWidth={1.5} />,
  };
  const waveSymbol = waveSymbols[wf] || null;
  return (
    <g>
      <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2} />
      {waveSymbol}
      <line x1={0} y1={-22} x2={0} y2={-30} stroke="currentColor" strokeWidth={2} />
      <line x1={0} y1={22} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
    </g>
  );
};

const DcCurrent: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2} />
    {/* Arrow pointing up */}
    <line x1={0} y1={12} x2={0} y2={-12} stroke="currentColor" strokeWidth={2} />
    <polyline points="-6,-6 0,-14 6,-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
  </g>
);

const AcCurrent: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2} />
    <path d="M -10,-4 Q -5,-14 0,-4 Q 5,6 10,-4" fill="none" stroke="currentColor" strokeWidth={1.5} />
    <polyline points="-4,-10 0,-16 4,-10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
  </g>;
  return <g>
    <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={-2} x2={0} y2={-13} stroke="currentColor" strokeWidth={2} />
    <polyline points="-5,-7 0,-14 5,-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    <path d="M -11,0 C -7,-7 -3,-7 0,0 C 3,7 7,7 11,0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
  </g>;
};

const DcRail: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <rect x={-30} y={-14} width={60} height={28} rx={4} fill="#eff6ff" stroke="currentColor" strokeWidth={2} />
    <line x1={-40} y1={0} x2={-30} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={30} y1={0} x2={40} y2={0} stroke="currentColor" strokeWidth={2} />
    <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor">{String(props?.voltage ?? 24)} V DC</text>
  </g>;
  return <g>
    <line x1={-40} y1={0} x2={40} y2={0} stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" />
    <line x1={0} y1={0} x2={0} y2={25} stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" />
  </g>;
};

const ThreePhaseSource: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) {
    const voltage = Number(props?.lineVoltage ?? 400);
    return <g>
      <rect x={-22} y={-37} width={54} height={74} rx={8} fill="#fff7ed" stroke="currentColor" strokeWidth={2} />
      <text x={5} y={-10} textAnchor="middle" fontSize={13} fontWeight={700} fill="#b45309">3~</text>
      <text x={5} y={8} textAnchor="middle" fontSize={7} fill="currentColor">{`${voltage} V 3~`}</text>
      {[-30, -10, 10, 30].map((y, index) => <g key={y}><line x1={-40} y1={y} x2={-22} y2={y} stroke="currentColor" strokeWidth={2} /><text x={-18} y={y + 3} fontSize={7} fill="currentColor">{['L1', 'L2', 'L3', 'N'][index]}</text></g>)}
    </g>;
  }
  return <g>
    <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2.2} />
    <text x={0} y={4} textAnchor="middle" fontSize={8.5} fontWeight={750} fill="currentColor">PHASE</text>
    {[-15, 0, 15].map((y) => <line key={y} data-phase-lead={y === 0 ? 'axis' : 'circle'} x1={y === 0 ? 22 : Math.sqrt(22 ** 2 - 15 ** 2)} y1={y} x2={40} y2={y} stroke="currentColor" strokeWidth={2} strokeLinecap="square" />)}
    <line x1={-22} y1={0} x2={-40} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
  </g>;
};

const ThreePhaseRail: SymbolFC = () => <g>
  <line x1={-40} y1={-30} x2={50} y2={-30} stroke="#d14343" strokeWidth={2.2} strokeLinecap="square" />
  <line x1={-40} y1={-10} x2={50} y2={-10} stroke="#d6a720" strokeWidth={2.2} strokeLinecap="square" />
  <line x1={-40} y1={10} x2={50} y2={10} stroke="#2d73b7" strokeWidth={2.2} strokeLinecap="square" />
  <line x1={-40} y1={30} x2={50} y2={30} stroke="currentColor" strokeWidth={1.9} strokeLinecap="square" />
</g>;

const Ground: SymbolFC = () => (
  <g>
    <line x1={0} y1={-15} x2={0} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={-12} y1={0} x2={12} y2={0} stroke="currentColor" strokeWidth={2.5} />
    <line x1={-8} y1={5} x2={8} y2={5} stroke="currentColor" strokeWidth={2} />
    <line x1={-4} y1={10} x2={4} y2={10} stroke="currentColor" strokeWidth={2} />
  </g>
);

// ─── PASSIVE ──────────────────────────────────────────────────────────────────

const Resistor: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <line x1={-30} y1={0} x2={-15} y2={0} stroke="currentColor" strokeWidth={2} />
    <rect x={-15} y={-8} width={30} height={16} fill="none" stroke="currentColor" strokeWidth={2} rx={2} />
    <line x1={15} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>;
  return <g>
    <RectangularResistor />
  </g>;
};

const Capacitor: SymbolFC = () => (
  <g>
    <line x1={0} y1={-30} x2={0} y2={-6} stroke="currentColor" strokeWidth={2} />
    <line x1={-14} y1={-6} x2={14} y2={-6} stroke="currentColor" strokeWidth={2.5} />
    <line x1={-14} y1={6} x2={14} y2={6} stroke="currentColor" strokeWidth={2.5} />
    <line x1={0} y1={6} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
  </g>
);

const Inductor: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <line x1={-30} y1={0} x2={-18} y2={0} stroke="currentColor" strokeWidth={2} />
    <path d="M -18,0 Q -15,-10 -9,-10 Q -3,-10 0,-10 Q 6,-10 9,-10 Q 15,-10 18,0" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={18} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>;
  return <g>
    <line x1={-30} y1={0} x2={-18} y2={0} stroke="currentColor" strokeWidth={2} />
    <path d="M -18,0 C -18,-9 -6,-9 -6,0 C -6,-9 6,-9 6,0 C 6,-9 18,-9 18,0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    <line x1={18} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>;
};

const Potentiometer: SymbolFC = ({ props }) => {
  const documented = props?._documentedStyle === true;
  const position = Math.max(0, Math.min(1, Number(props?.wiper ?? 0.5)));
  const y = documented ? -7 : -20 + position * 40;
  if (!documented) return <g>
    <line x1={-35} y1={-20} x2={-18} y2={-20} stroke="currentColor" strokeWidth={2} />
    <line x1={-35} y1={20} x2={-18} y2={20} stroke="currentColor" strokeWidth={2} />
    <rect x={-18} y={-24} width={36} height={48} rx={3} fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-10} y1={-18} x2={10} y2={18} stroke="currentColor" strokeWidth={1.5} opacity={0.35} />
    <line x1={35} y1={0} x2={18} y2={y} stroke="currentColor" strokeWidth={2} />
    <polygon points={`${18},${y} ${25},${y - 4} ${25},${y + 4}`} fill="currentColor" />
    <line x1={18} y1={-20} x2={18} y2={20} stroke="currentColor" strokeWidth={1.5} />
  </g>;
  return (
    <g data-rigid-body="potentiometer">
      <line x1={-30} y1={0} x2={-20} y2={0} stroke="currentColor" strokeWidth={2} />
      <rect x={-20} y={-7} width={40} height={14} rx={2} fill="none" stroke="currentColor" strokeWidth={2} />
      <line x1={20} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
      <line x1={0} y1={-30} x2={0} y2={-11} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polygon points="0,-7 -4,-12 4,-12" fill="currentColor" />
    </g>
  );
};

const DependentDiamond: SymbolFC = ({ props }) => {
  const currentControlled = String(props?._type) === 'vccs' || String(props?._type) === 'cccs';
  return <g>
    <line x1={0} y1={-35} x2={0} y2={-25} stroke="currentColor" strokeWidth={2} /><line x1={0} y1={25} x2={0} y2={35} stroke="currentColor" strokeWidth={2} />
    <polygon points="0,-25 20,0 0,25 -20,0" fill="none" stroke="currentColor" strokeWidth={2} />
    {currentControlled ? <><line x1={0} y1={12} x2={0} y2={-12} stroke="currentColor" strokeWidth={2} /><polyline points="-5,-6 0,-13 5,-6" fill="none" stroke="currentColor" strokeWidth={2} /></> : <><text x={0} y={-7} textAnchor="middle" fontSize={14} fontWeight={700} fill="currentColor">+</text><text x={0} y={13} textAnchor="middle" fontSize={16} fontWeight={700} fill="currentColor">−</text></>}
    <line x1={-35} y1={-20} x2={-20} y2={-20} stroke="currentColor" strokeWidth={2} /><line x1={-35} y1={20} x2={-20} y2={20} stroke="currentColor" strokeWidth={2} />
  </g>;
};

// ─── DIODES ───────────────────────────────────────────────────────────────────

const DiodeBase: SymbolFC = ({ powered, props }) => {
  const isLed = props?._type === 'led';
  const isZener = props?._type === 'zener';
  const isPhoto = props?._type === 'photodiode';
  const ledColor = isLed ? (props?.color || 'red') : null;
  const ledColors: Record<string, string> = {
    white: '#fff', red: '#ff2020', amber: '#ffbf00', orange: '#ff6600',
    yellow: '#ffff00', green: '#00e040', blue: '#0080ff', violet: '#8000ff',
  };
  const glowColor = ledColor ? ledColors[ledColor] || '#ff2020' : null;
  const intensity = Math.max(0, Math.min(1, Number(props?._intensity ?? (powered ? 1 : 0))));
  const emissionOpacity = 0.25 + intensity * 0.75;

  return (
    <g>
      <line x1={-33.333} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
      {/* Triangle body */}
      <polygon points="-8,-10 -8,10 10,0" fill={powered && isLed ? glowColor! : 'white'} fillOpacity={powered && isLed ? emissionOpacity : 1} stroke="currentColor" strokeWidth={2} />
      {/* Cathode bar */}
      {isZener ? (
        <path d="M 10,-12 L 10,12 M 10,-12 L 16,-18 M 10,12 L 4,18" fill="none" stroke="currentColor" strokeWidth={2} />
      ) : (
        <line x1={10} y1={-12} x2={10} y2={12} stroke="currentColor" strokeWidth={2} />
      )}
      <line x1={10} y1={0} x2={33.333} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
      {/* LED emission arrows */}
      {isLed && (
        <>
          <line x1={14} y1={-14} x2={22} y2={-22} stroke={powered ? glowColor! : '#888'} strokeOpacity={powered ? emissionOpacity : 1} strokeWidth={1.5} markerEnd="url(#arrow)" />
          <line x1={8} y1={-18} x2={16} y2={-26} stroke={powered ? glowColor! : '#888'} strokeOpacity={powered ? emissionOpacity : 1} strokeWidth={1.5} markerEnd="url(#arrow)" />
        </>
      )}
      {/* Photodiode incoming arrows */}
      {isPhoto && (
        <>
          <line x1={22} y1={-22} x2={14} y2={-14} stroke="#888" strokeWidth={1.5} markerEnd="url(#arrow)" />
          <line x1={16} y1={-26} x2={8} y2={-18} stroke="#888" strokeWidth={1.5} markerEnd="url(#arrow)" />
        </>
      )}
      {/* Glow when powered */}
      {isLed && powered && (
        <circle cx={0} cy={0} r={14 + intensity * 11} fill={glowColor!} fillOpacity={0.04 + intensity * 0.20} pointerEvents="none" />
      )}
    </g>
  );
};

// ─── TRANSISTORS ──────────────────────────────────────────────────────────────

const BjtNpn: SymbolFC = ({ props }) => props?._documentedStyle === true ? (
  <g>
    {/* Base: Horizontal line from left terminal edge (-16,0) to central vertical plate (0,0) */}
    <path d="M -16,0 L 0,0" fill="none" stroke="currentColor" strokeWidth={2} />
    {/* Central vertical plate */}
    <line x1={0} y1={-10} x2={0} y2={10} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    {/* Collector: Diagonal up-right to (20,-18), then straight vertical UP to top terminal edge (20,-26) */}
    <path d="M 0,-10 L 20,-18 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Emitter: Diagonal down-right to (20,18), then straight vertical DOWN to bottom terminal edge (20,26) */}
    <path d="M 0,10 L 20,18 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Arrow: Outward-pointing (down-right) on diagonal section of emitter */}
    <g data-emitter-arrow="npn" transform="translate(10 14) rotate(21.8)"><polygon points="5,0 -5,-3.5 -5,3.5" fill="currentColor" /></g>
  </g>
) : (
  <g data-rigid-body="bjt-npn" stroke="currentColor" fill="none">
    <path d="M -30 0 L -10 0 M -10 -15 L -10 15" strokeWidth={2} />
    <path d="M -10 -10 L 20 -30 L 30 -30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -10 10 L 20 30 L 30 30" strokeWidth={2} strokeLinejoin="miter" />
    <polygon points="-5,-4.5 5,0 -5,4.5" fill="currentColor" stroke="none" transform="translate(5, 20) rotate(33.69)" />
  </g>
);

const BjtPnp: SymbolFC = ({ props }) => props?._documentedStyle === true ? (
  <g>
    {/* Base: Horizontal line from left terminal edge (-16,0) to central vertical plate (0,0) */}
    <path d="M -16,0 L 0,0" fill="none" stroke="currentColor" strokeWidth={2} />
    {/* Central vertical plate */}
    <line x1={0} y1={-10} x2={0} y2={10} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    {/* Collector: Diagonal up-right to (20,-18), then straight vertical UP to top terminal edge (20,-26) */}
    <path d="M 0,-10 L 20,-18 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Emitter: Diagonal down-right to (20,18), then straight vertical DOWN to bottom terminal edge (20,26) */}
    <path d="M 0,10 L 20,18 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Arrow: Inward-pointing (up-left, towards base plate) on diagonal section of emitter */}
    <g data-emitter-arrow="pnp" transform="translate(10 14) rotate(21.8)"><polygon points="-5,0 5,-3.5 5,3.5" fill="currentColor" /></g>
  </g>
) : (
  <g data-rigid-body="bjt-pnp" stroke="currentColor" fill="none">
    <path d="M -30 0 L -10 0 M -10 -15 L -10 15" strokeWidth={2} />
    <path d="M -10 -10 L 20 -30 L 30 -30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -10 10 L 20 30 L 30 30" strokeWidth={2} strokeLinejoin="miter" />
    <polygon points="5,-4.5 -5,0 5,4.5" fill="currentColor" stroke="none" transform="translate(5, 20) rotate(33.69)" />
  </g>
);

const MosfetN: SymbolFC = ({ props }) => props?._documentedStyle === true ? (
  <g>
    {/* Gate: Horizontal line from left terminal edge (-16,0) to vertical gate plate (-2,0) */}
    <path d="M -16,0 L -2,0" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-2} y1={-18} x2={-2} y2={18} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    {/* Channel: 3 separate vertical segments with dielectric gap */}
    <line x1={4} y1={-18} x2={4} y2={-8} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    <line x1={4} y1={-5} x2={4} y2={5} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    <line x1={4} y1={8} x2={4} y2={18} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    {/* Drain: Horizontal right to (20,-13), then straight vertical UP to top terminal edge (20,-26) */}
    <path d="M 4,-13 L 20,-13 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Source: Horizontal right to (20,13), then straight vertical DOWN to bottom terminal edge (20,26) */}
    <path d="M 4,13 L 20,13 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Body Connection: Horizontal line from middle segment (4,0) to (13,0), intersecting Source line at (13,13) */}
    <path d="M 4,0 L 13,0 L 13,13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" />
    {/* Inward-pointing arrowhead (pointing left, towards channel) */}
    <polygon points="4,0 10,-3.5 10,3.5" fill="currentColor" />
  </g>
) : (
  <g data-rigid-body="mosfet-n" stroke="currentColor" fill="none">
    <path d="M -30 0 L -12 0 M -12 -16 L -12 16" strokeWidth={2} />
    <path d="M -8 -16 L -8 -8 M -8 -4 L -8 4 M -8 8 L -8 16" strokeWidth={2.6} strokeLinecap="square" />
    <path d="M -8 -12 L 30 -12 L 30 -30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -8 12 L 30 12 L 30 30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -8 0 L 15 0 L 15 12" strokeWidth={2} strokeLinejoin="miter" />
    <polygon points="3,-4 -5,0 3,4" fill="currentColor" stroke="none" />
  </g>
);

const MosfetP: SymbolFC = ({ props }) => props?._documentedStyle === true ? (
  <g>
    {/* Gate: Horizontal line from left terminal edge (-16,0) to vertical gate plate (-2,0) */}
    <path d="M -16,0 L -2,0" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-2} y1={-18} x2={-2} y2={18} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    {/* Channel: 3 separate vertical segments with dielectric gap */}
    <line x1={4} y1={-18} x2={4} y2={-8} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    <line x1={4} y1={-5} x2={4} y2={5} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    <line x1={4} y1={8} x2={4} y2={18} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    {/* Drain: Horizontal right to (20,-13), then straight vertical UP to top terminal edge (20,-26) */}
    <path d="M 4,-13 L 20,-13 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Source: Horizontal right to (20,13), then straight vertical DOWN to bottom terminal edge (20,26) */}
    <path d="M 4,13 L 20,13 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Body Connection: Horizontal line from middle segment (4,0) to (13,0), intersecting Source line at (13,13) */}
    <path d="M 4,0 L 13,0 L 13,13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" />
    {/* Outward-pointing arrowhead (pointing right, away from channel) */}
    <polygon points="12,0 6,-3.5 6,3.5" fill="currentColor" />
  </g>
) : (
  <g data-rigid-body="mosfet-p" stroke="currentColor" fill="none">
    <path d="M -30 0 L -12 0 M -12 -16 L -12 16" strokeWidth={2} />
    <path d="M -8 -16 L -8 -8 M -8 -4 L -8 4 M -8 8 L -8 16" strokeWidth={2.6} strokeLinecap="square" />
    <path d="M -8 -12 L 30 -12 L 30 -30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -8 12 L 30 12 L 30 30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -8 0 L 15 0 L 15 12" strokeWidth={2} strokeLinejoin="miter" />
    <polygon points="-3,-4 5,0 -3,4" fill="currentColor" stroke="none" />
  </g>
);

const JfetN: SymbolFC = ({ props }) => props?._documentedStyle === true ? (
  <g>
    {/* Channel: Single continuous vertical line */}
    <line x1={0} y1={-16} x2={0} y2={16} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    {/* Gate: Horizontal line from left terminal edge (-16,0) to center of channel (0,0) */}
    <path d="M -16,0 L 0,0" fill="none" stroke="currentColor" strokeWidth={2} />
    {/* Arrow: Inward-pointing arrowhead (pointing right) on gate line */}
    <polygon points="0,0 -7,-3.5 -7,3.5" fill="currentColor" />
    {/* Drain: Horizontal right to (20,-16), then straight vertical UP to top terminal edge (20,-26) */}
    <path d="M 0,-16 L 20,-16 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Source: Horizontal right to (20,16), then straight vertical DOWN to bottom terminal edge (20,26) */}
    <path d="M 0,16 L 20,16 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
  </g>
) : (
  <g data-rigid-body="jfet-n" stroke="currentColor" fill="none">
    <path d="M -30 0 L -8 0" strokeWidth={2} />
    <path d="M -8 -18 L -8 18" strokeWidth={2.6} />
    <path d="M -8 -14 L 30 -14 L 30 -30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -8 14 L 30 14 L 30 30" strokeWidth={2} strokeLinejoin="miter" />
    <polygon points="-16,-4 -8,0 -16,4" fill="currentColor" stroke="none" />
  </g>
);

const JfetP: SymbolFC = ({ props }) => props?._documentedStyle === true ? (
  <g>
    {/* Channel: Single continuous vertical line */}
    <line x1={0} y1={-16} x2={0} y2={16} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    {/* Gate: Horizontal line from left terminal edge (-16,0) to center of channel (0,0) */}
    <path d="M -16,0 L 0,0" fill="none" stroke="currentColor" strokeWidth={2} />
    {/* Arrow: Outward-pointing arrowhead (pointing left) on gate line */}
    <polygon points="-7,0 0,-3.5 0,3.5" fill="currentColor" />
    {/* Drain: Horizontal right to (20,-16), then straight vertical UP to top terminal edge (20,-26) */}
    <path d="M 0,-16 L 20,-16 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
    {/* Source: Horizontal right to (20,16), then straight vertical DOWN to bottom terminal edge (20,26) */}
    <path d="M 0,16 L 20,16 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" strokeLinecap="round" />
  </g>
) : (
  <g data-rigid-body="jfet-p" stroke="currentColor" fill="none">
    <path d="M -30 0 L -8 0" strokeWidth={2} />
    <path d="M -8 -18 L -8 18" strokeWidth={2.6} />
    <path d="M -8 -14 L 30 -14 L 30 -30" strokeWidth={2} strokeLinejoin="miter" />
    <path d="M -8 14 L 30 14 L 30 30" strokeWidth={2} strokeLinejoin="miter" />
    <polygon points="-8,-4 -16,0 -8,4" fill="currentColor" stroke="none" />
  </g>
);

// ─── SWITCHES ─────────────────────────────────────────────────────────────────

const SwSpstNo: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      <line x1={-25} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
      {closed
        ? <line x1={-8} y1={0} x2={8} y2={0} stroke="currentColor" strokeWidth={2} />
        : <line x1={-8} y1={0} x2={8} y2={-12} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={8} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={2} />
      <circle cx={-8} cy={0} r={2.5} fill="currentColor" />
      <circle cx={8} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

const SwSpstNc: SymbolFC = ({ props }) => {
  const open = props?.state === 'open';
  return (
    <g>
      <line x1={-25} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
      {open
        ? <line x1={-8} y1={0} x2={8} y2={-12} stroke="currentColor" strokeWidth={2} />
        : <line x1={-8} y1={0} x2={8} y2={0} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={8} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={2} />
      <circle cx={-8} cy={0} r={2.5} fill="currentColor" />
      <circle cx={8} cy={0} r={2.5} fill="currentColor" />
      {/* NC marker */}
      <line x1={-4} y1={-14} x2={4} y2={-14} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
};

const SwSpdt: SymbolFC = ({ props }) => {
  const state = props?.state || 'a';
  return (
    <g>
      <line x1={-30} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
      {state === 'a'
        ? <line x1={-8} y1={0} x2={18} y2={-15} stroke="currentColor" strokeWidth={2} />
        : state === 'b'
          ? <line x1={-8} y1={0} x2={18} y2={15} stroke="currentColor" strokeWidth={2} />
          : <line x1={-8} y1={0} x2={8} y2={-10} stroke="currentColor" strokeWidth={2} />
      }
      <circle cx={-8} cy={0} r={2.5} fill="currentColor" />
      <circle cx={18} cy={-15} r={2.5} fill="currentColor" />
      <circle cx={18} cy={15} r={2.5} fill="currentColor" />
      <line x1={18} y1={-15} x2={30} y2={-15} stroke="currentColor" strokeWidth={2} />
      <line x1={18} y1={15} x2={30} y2={15} stroke="currentColor" strokeWidth={2} />
    </g>
  );
};

const SwDpst: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      {/* Pole 1 */}
      <line x1={-30} y1={-15} x2={-8} y2={-15} stroke="currentColor" strokeWidth={2} />
      {closed
        ? <line x1={-8} y1={-15} x2={8} y2={-15} stroke="currentColor" strokeWidth={2} />
        : <line x1={-8} y1={-15} x2={8} y2={-25} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={8} y1={-15} x2={30} y2={-15} stroke="currentColor" strokeWidth={2} />
      {/* Pole 2 */}
      <line x1={-30} y1={15} x2={-8} y2={15} stroke="currentColor" strokeWidth={2} />
      {closed
        ? <line x1={-8} y1={15} x2={8} y2={15} stroke="currentColor" strokeWidth={2} />
        : <line x1={-8} y1={15} x2={8} y2={5} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={8} y1={15} x2={30} y2={15} stroke="currentColor" strokeWidth={2} />
      {/* Mechanical link */}
      <line x1={0} y1={-15} x2={0} y2={15} stroke="currentColor" strokeWidth={1} strokeDasharray="3,2" />
    </g>
  );
};

const SwDpdt: SymbolFC = ({ props }) => {
  const state = props?.state || 'a';
  return (
    <g>
      {/* Pole 1 */}
      <line x1={-35} y1={-15} x2={-8} y2={-15} stroke="currentColor" strokeWidth={2} />
      {state === 'a'
        ? <line x1={-8} y1={-15} x2={22} y2={-25} stroke="currentColor" strokeWidth={2} />
        : <line x1={-8} y1={-15} x2={22} y2={-5} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={22} y1={-25} x2={35} y2={-25} stroke="currentColor" strokeWidth={2} />
      <line x1={22} y1={-5} x2={35} y2={-5} stroke="currentColor" strokeWidth={2} />
      {/* Pole 2 */}
      <line x1={-35} y1={15} x2={-8} y2={15} stroke="currentColor" strokeWidth={2} />
      {state === 'a'
        ? <line x1={-8} y1={15} x2={22} y2={5} stroke="currentColor" strokeWidth={2} />
        : <line x1={-8} y1={15} x2={22} y2={25} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={22} y1={5} x2={35} y2={5} stroke="currentColor" strokeWidth={2} />
      <line x1={22} y1={25} x2={35} y2={25} stroke="currentColor" strokeWidth={2} />
      <line x1={0} y1={-15} x2={0} y2={15} stroke="currentColor" strokeWidth={1} strokeDasharray="3,2" />
    </g>
  );
};

const PbNo: SymbolFC = ({ props }) => {
  const pressed = props?.state === 'pressed';
  return (
    <g>
      <line x1={-20} y1={0} x2={-6} y2={0} stroke="currentColor" strokeWidth={2} />
      {pressed
        ? <line x1={-6} y1={0} x2={6} y2={0} stroke="currentColor" strokeWidth={2} />
        : <line x1={-6} y1={0} x2={6} y2={-10} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={6} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={2} />
      {/* Actuator */}
      <line x1={0} y1={pressed ? -12 : -16} x2={0} y2={-20} stroke="currentColor" strokeWidth={2} />
      <line x1={-6} y1={-20} x2={6} y2={-20} stroke="currentColor" strokeWidth={2} />
      <circle cx={-6} cy={0} r={2} fill="currentColor" />
      <circle cx={6} cy={0} r={2} fill="currentColor" />
    </g>
  );
};

const PbNc: SymbolFC = ({ props }) => {
  const pressed = props?.state === 'pressed';
  return (
    <g>
      <line x1={-20} y1={0} x2={-6} y2={0} stroke="currentColor" strokeWidth={2} />
      {pressed
        ? <line x1={-6} y1={0} x2={6} y2={-10} stroke="currentColor" strokeWidth={2} />
        : <line x1={-6} y1={0} x2={6} y2={0} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={6} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={2} />
      <line x1={0} y1={pressed ? -12 : -16} x2={0} y2={-20} stroke="currentColor" strokeWidth={2} />
      <line x1={-6} y1={-20} x2={6} y2={-20} stroke="currentColor" strokeWidth={2} />
      {/* NC diagonal bar */}
      <line x1={-4} y1={-14} x2={4} y2={-14} stroke="currentColor" strokeWidth={1.5} />
      <circle cx={-6} cy={0} r={2} fill="currentColor" />
      <circle cx={6} cy={0} r={2} fill="currentColor" />
    </g>
  );
};

// ─── PROTECTION ───────────────────────────────────────────────────────────────

const RelaySpst: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-25} /> : <><rect x={-20} y={-35} width={40} height={20} fill="none" stroke="currentColor" strokeWidth={2} rx={2} /><path d="M -14,-35 Q -10,-45 -6,-35 Q -2,-45 2,-35 Q 6,-45 10,-35 Q 14,-45 18,-35" fill="none" stroke="currentColor" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-25} x2={-20} y2={-25} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={-25} x2={30} y2={-25} stroke="currentColor" strokeWidth={2} />
    {/* Contact */}
    <line x1={-30} y1={35} x2={-8} y2={35} stroke="currentColor" strokeWidth={2} />
    {powered
      ? <line x1={-8} y1={35} x2={8} y2={35} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={35} x2={8} y2={25} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={35} x2={30} y2={35} stroke="currentColor" strokeWidth={2} />
    <circle cx={-8} cy={35} r={2.5} fill="currentColor" />
    <circle cx={8} cy={35} r={2.5} fill="currentColor" />
  </g>
);

const Fuse: SymbolFC = () => (
  <g>
    <line x1={-25} y1={0} x2={-12} y2={0} stroke="currentColor" strokeWidth={2} />
    <rect x={-12} y={-8} width={24} height={16} fill="none" stroke="currentColor" strokeWidth={2} rx={3} />
    <line x1={-8} y1={0} x2={8} y2={0} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
    <line x1={12} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

const CircuitBreaker: SymbolFC = ({ props }) => {
  const tripped = props?.state === 'tripped';
  return (
    <g>
      <line x1={-25} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
      {tripped
        ? <line x1={-8} y1={0} x2={8} y2={-12} stroke="currentColor" strokeWidth={2} />
        : <line x1={-8} y1={0} x2={8} y2={0} stroke="currentColor" strokeWidth={2} />
      }
      <line x1={8} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={2} />
      {/* Breaker symbol */}
      <rect x={-8} y={-8} width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} rx={2} />
      <circle cx={-8} cy={0} r={2.5} fill="currentColor" />
      <circle cx={8} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

const Contactor: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-25} x2={25} y={-50} /> : <><rect x={-25} y={-60} width={50} height={20} fill="none" stroke="currentColor" strokeWidth={2} rx={2} /><path d="M -18,-60 Q -14,-70 -10,-60 Q -6,-70 -2,-60 Q 2,-70 6,-60 Q 10,-70 14,-60 Q 18,-70 22,-60" fill="none" stroke="currentColor" strokeWidth={1.5} /></>}
    <line x1={-40} y1={-50} x2={-25} y2={-50} stroke="currentColor" strokeWidth={2} />
    <line x1={25} y1={-50} x2={40} y2={-50} stroke="currentColor" strokeWidth={2} />
    {/* Main contacts L1-T1, L2-T2, L3-T3 */}
    {[0, 20, 40].map((y, i) => (
      <g key={i}>
        <line x1={-40} y1={y} x2={-12} y2={y} stroke="currentColor" strokeWidth={2} />
        {powered
          ? <line x1={-12} y1={y} x2={12} y2={y} stroke="currentColor" strokeWidth={2} />
          : <line x1={-12} y1={y} x2={12} y2={y - 8} stroke="currentColor" strokeWidth={2} />
        }
        <line x1={12} y1={y} x2={40} y2={y} stroke="currentColor" strokeWidth={2} />
      </g>
    ))}
    {/* Auxiliary NO 13-14 */}
    <line x1={-40} y1={50} x2={-12} y2={50} stroke="currentColor" strokeWidth={1.5} />
    {powered ? <line x1={-12} y1={50} x2={12} y2={50} stroke="currentColor" strokeWidth={1.5} /> : <line x1={-12} y1={50} x2={12} y2={42} stroke="currentColor" strokeWidth={1.5} />}
    <line x1={12} y1={50} x2={40} y2={50} stroke="currentColor" strokeWidth={1.5} />
    {/* Auxiliary NC 21-22 */}
    <line x1={-40} y1={65} x2={-12} y2={65} stroke="currentColor" strokeWidth={1.5} />
    {!powered ? <line x1={-12} y1={65} x2={12} y2={65} stroke="currentColor" strokeWidth={1.5} /> : <line x1={-12} y1={65} x2={12} y2={57} stroke="currentColor" strokeWidth={1.5} />}
    <line x1={12} y1={65} x2={40} y2={65} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

// ─── TRANSFORMERS ─────────────────────────────────────────────────────────────

const Transformer: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-35} y1={-20} x2={-24} y2={-20} stroke="currentColor" strokeWidth={2} />
  <line x1={-35} y1={20} x2={-24} y2={20} stroke="currentColor" strokeWidth={2} />
  <SemicircularVerticalCoil x={-24} y1={-20} y2={20} bulge={12} />
  <SemicircularVerticalCoil x={24} y1={-20} y2={20} bulge={-12} />
  <line x1={24} y1={-20} x2={35} y2={-20} stroke="currentColor" strokeWidth={2} />
  <line x1={24} y1={20} x2={35} y2={20} stroke="currentColor" strokeWidth={2} />
  <line x1={-6} y1={-25} x2={-6} y2={25} stroke="currentColor" strokeWidth={2.5} />
  <line x1={6} y1={-25} x2={6} y2={25} stroke="currentColor" strokeWidth={2.5} />
</g> : <g>
    {/* Primary coil */}
    {[-20, -8, 4].map((y, i) => (
      <path key={i} d={`M -35,${y} Q -28,${y - 10} -22,${y} Q -16,${y + 10} -10,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
    ))}
    <line x1={-35} y1={-20} x2={-35} y2={-30} stroke="currentColor" strokeWidth={2} />
    <line x1={-35} y1={4} x2={-35} y2={20} stroke="currentColor" strokeWidth={2} />
    {/* Core */}
    <line x1={-6} y1={-25} x2={-6} y2={25} stroke="currentColor" strokeWidth={3} />
    <line x1={6} y1={-25} x2={6} y2={25} stroke="currentColor" strokeWidth={3} />
    {/* Secondary coil */}
    {[-20, -8, 4].map((y, i) => (
      <path key={i} d={`M 10,${y} Q 16,${y - 10} 22,${y} Q 28,${y + 10} 35,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
    ))}
    <line x1={35} y1={-20} x2={35} y2={-30} stroke="currentColor" strokeWidth={2} />
    <line x1={35} y1={4} x2={35} y2={20} stroke="currentColor" strokeWidth={2} />
  </g>
;

const TransformerCt: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-35} y1={-25} x2={-24} y2={-25} stroke="currentColor" strokeWidth={2} />
  <line x1={-35} y1={25} x2={-24} y2={25} stroke="currentColor" strokeWidth={2} />
  <SemicircularVerticalCoil x={-24} y1={-25} y2={25} bulge={12} />
  <SemicircularVerticalCoil x={24} y1={-25} y2={25} bulge={-12} />
  <line x1={24} y1={-25} x2={35} y2={-25} stroke="currentColor" strokeWidth={2} />
  <line x1={24} y1={0} x2={35} y2={0} stroke="currentColor" strokeWidth={2} />
  <line x1={24} y1={25} x2={35} y2={25} stroke="currentColor" strokeWidth={2} />
  <line x1={-6} y1={-30} x2={-6} y2={30} stroke="currentColor" strokeWidth={2.5} />
  <line x1={6} y1={-30} x2={6} y2={30} stroke="currentColor" strokeWidth={2.5} />
</g> : <g>
    {[-25, -10, 5].map((y, i) => (
      <path key={i} d={`M -35,${y} Q -28,${y - 10} -22,${y} Q -16,${y + 10} -10,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
    ))}
    <line x1={-35} y1={-25} x2={-35} y2={-35} stroke="currentColor" strokeWidth={2} />
    <line x1={-35} y1={5} x2={-35} y2={25} stroke="currentColor" strokeWidth={2} />
    <line x1={-6} y1={-30} x2={-6} y2={30} stroke="currentColor" strokeWidth={3} />
    <line x1={6} y1={-30} x2={6} y2={30} stroke="currentColor" strokeWidth={3} />
    {[-25, -10, 5].map((y, i) => (
      <path key={i} d={`M 10,${y} Q 16,${y - 10} 22,${y} Q 28,${y + 10} 35,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
    ))}
    <line x1={35} y1={-25} x2={35} y2={-35} stroke="currentColor" strokeWidth={2} />
    {/* Center tap */}
    <line x1={35} y1={-10} x2={45} y2={-10} stroke="currentColor" strokeWidth={2} />
    <line x1={35} y1={5} x2={35} y2={25} stroke="currentColor" strokeWidth={2} />
  </g>
;

const Autotransformer: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-30} y1={-25} x2={-10} y2={-25} stroke="currentColor" strokeWidth={2} />
  <line x1={-30} y1={25} x2={-10} y2={25} stroke="currentColor" strokeWidth={2} />
  <SemicircularVerticalCoil x={-10} y1={-25} y2={25} bulge={12} />
  <line x1={-10} y1={-25} x2={30} y2={-25} stroke="currentColor" strokeWidth={2} />
  <line x1={-10} y1={25} x2={30} y2={25} stroke="currentColor" strokeWidth={2} />
  <line x1={2} y1={0} x2={18} y2={0} stroke="currentColor" strokeWidth={2} />
  <circle cx={2} cy={0} r={2.2} fill="currentColor" />
</g> : <g>
    {[-25, -10, 5].map((y, i) => (
      <path key={i} d={`M -30,${y} Q -22,${y - 10} -15,${y} Q -8,${y + 10} 0,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
    ))}
    <line x1={-30} y1={-25} x2={-30} y2={-35} stroke="currentColor" strokeWidth={2} />
    <line x1={-30} y1={5} x2={-30} y2={25} stroke="currentColor" strokeWidth={2} />
    {/* Tap */}
    <line x1={0} y1={-10} x2={30} y2={-10} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={5} x2={30} y2={5} stroke="currentColor" strokeWidth={2} />
  </g>
;

// ─── POWER SEMICONDUCTORS ─────────────────────────────────────────────────────

const Scr: SymbolFC = () => (
  <g>
    {/* Anode-cathode vertical */}
    <line x1={0} y1={-30} x2={0} y2={-10} stroke="currentColor" strokeWidth={2} />
    <polygon points="-10,-10 10,-10 0,10" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-12} y1={10} x2={12} y2={10} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={10} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
    {/* Gate */}
    <line x1={-20} y1={15} x2={0} y2={15} stroke="currentColor" strokeWidth={2} />
    {/* Cathode bar extensions (SCR marker) */}
    <line x1={10} y1={10} x2={16} y2={16} stroke="currentColor" strokeWidth={2} />
  </g>
);

const Diac: SymbolFC = () => (
  <g>
    <line x1={-20} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
    {/* Two back-to-back triangles */}
    <polygon points="-8,-10 -8,10 8,0" fill="none" stroke="currentColor" strokeWidth={2} />
    <polygon points="8,-10 8,10 -8,0" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-8} y1={-12} x2={-8} y2={12} stroke="currentColor" strokeWidth={2} />
    <line x1={8} y1={-12} x2={8} y2={12} stroke="currentColor" strokeWidth={2} />
    <line x1={8} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

const Triac: SymbolFC = () => (
  <g>
    <line x1={0} y1={-30} x2={0} y2={-10} stroke="currentColor" strokeWidth={2} />
    <polygon points="-10,-10 10,-10 0,10" fill="none" stroke="currentColor" strokeWidth={2} />
    <polygon points="-10,10 10,10 0,-10" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-12} y1={-10} x2={12} y2={-10} stroke="currentColor" strokeWidth={2} />
    <line x1={-12} y1={10} x2={12} y2={10} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={10} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
    <line x1={-20} y1={15} x2={0} y2={15} stroke="currentColor" strokeWidth={2} />
  </g>
);

// ─── MOTORS & LAMPS ───────────────────────────────────────────────────────────

const MotorDc: SymbolFC = ({ powered, animTime = 0 }) => {
  const angle = powered ? animTime * 360 : 0;
  return (
    <g>
      <circle cx={0} cy={0} r={25} fill="none" stroke="currentColor" strokeWidth={2} />
      <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="currentColor">M</text>
      {/* Rotating indicator */}
      {powered && (
        <line
          x1={0} y1={0}
          x2={18 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={18 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke="#08b58d" strokeWidth={2.5}
        />
      )}
      <line x1={-30} y1={0} x2={-25} y2={0} stroke="currentColor" strokeWidth={2} />
      <line x1={25} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
    </g>
  );
};

const Motor3Phase: SymbolFC = ({ powered, animTime = 0 }) => {
  const angle = powered ? animTime * 360 : 0;
  return (
    <g>
      <circle cx={0} cy={0} r={28} fill="none" stroke="currentColor" strokeWidth={2} />
      <text x={0} y={5} textAnchor="middle" fontSize={12} fontWeight="bold" fill="currentColor">3~M</text>
      {powered && (
        <line
          x1={0} y1={0}
          x2={20 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={20 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke="#08b58d" strokeWidth={2.5}
        />
      )}
      <line x1={-30} y1={-20} x2={-28} y2={-20} stroke="currentColor" strokeWidth={2} />
      <line x1={-30} y1={0} x2={-28} y2={0} stroke="currentColor" strokeWidth={2} />
      <line x1={-30} y1={20} x2={-28} y2={20} stroke="currentColor" strokeWidth={2} />
      <line x1={28} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
    </g>
  );
};

const Lamp: SymbolFC = ({ powered }) => (
  <g>
    <circle cx={0} cy={0} r={18} fill={powered ? '#fffde0' : 'white'} stroke="currentColor" strokeWidth={2} />
    <line x1={-12} y1={-12} x2={12} y2={12} stroke="currentColor" strokeWidth={2} />
    <line x1={12} y1={-12} x2={-12} y2={12} stroke="currentColor" strokeWidth={2} />
    {powered && <circle cx={0} cy={0} r={22} fill="#ffff80" fillOpacity={0.3} />}
    <line x1={-20} y1={0} x2={-18} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={18} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

// ─── OP-AMP ───────────────────────────────────────────────────────────────────

const Opamp: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <polygon points="-30,-30 -30,30 30,0" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-30} y1={-15} x2={-20} y2={-15} stroke="currentColor" strokeWidth={2} />
    <text x={-16} y={-11} fontSize={10} fill="currentColor">+</text>
    <line x1={-30} y1={15} x2={-20} y2={15} stroke="currentColor" strokeWidth={2} />
    <text x={-16} y={19} fontSize={10} fill="currentColor">−</text>
    <line x1={30} y1={0} x2={40} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={-30} x2={0} y2={-18} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
    <line x1={0} y1={30} x2={0} y2={18} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
  </g>;
  return <g data-documented-opamp="ieee-boundary-aligned">
    <polygon points="-22,-22 -22,22 26,0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    <line x1={-DOCUMENTED_GRID_LOCAL} y1={-100 / 6} x2={-22} y2={-100 / 6} stroke="currentColor" strokeWidth={2} />
    <text x={-17} y={-100 / 6 + 4} fontSize={10} fill="currentColor">−</text>
    <line x1={-DOCUMENTED_GRID_LOCAL} y1={100 / 6} x2={-22} y2={100 / 6} stroke="currentColor" strokeWidth={2} />
    <text x={-17} y={100 / 6 + 4} fontSize={10} fill="currentColor">+</text>
    <line x1={26} y1={0} x2={DOCUMENTED_GRID_LOCAL} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={-DOCUMENTED_GRID_LOCAL} x2={0} y2={-(11 / 2)} stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={DOCUMENTED_GRID_LOCAL} x2={0} y2={11 / 2} stroke="currentColor" strokeWidth={1.5} />
  </g>;
};

// ─── MEASUREMENT ──────────────────────────────────────────────────────────────

const Voltmeter: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2} />
    <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="currentColor">V</text>
    <line x1={-25} y1={0} x2={-22} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={22} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

const Ammeter: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="none" stroke="currentColor" strokeWidth={2} />
    <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="currentColor">A</text>
    <line x1={-25} y1={0} x2={-22} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={22} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

// ─── RELAY VARIANTS ─────────────────────────────────────────────────────────

const RelaySpdt: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-25} /> : <><rect x={-20} y={-35} width={40} height={20} fill="none" stroke="currentColor" strokeWidth={2} rx={2} /><path d="M -14,-35 Q -10,-45 -6,-35 Q -2,-45 2,-35 Q 6,-45 10,-35 Q 14,-45 18,-35" fill="none" stroke="currentColor" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-25} x2={-20} y2={-25} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={-25} x2={30} y2={-25} stroke="currentColor" strokeWidth={2} />
    {/* Common contact */}
    <line x1={-30} y1={20} x2={-8} y2={20} stroke="currentColor" strokeWidth={2} />
    {/* Throw A (NO) */}
    {powered
      ? <line x1={-8} y1={20} x2={8} y2={20} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={20} x2={8} y2={10} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={10} x2={30} y2={10} stroke="currentColor" strokeWidth={2} />
    {/* Throw B (NC) */}
    <line x1={8} y1={30} x2={30} y2={30} stroke="currentColor" strokeWidth={2} />
    <circle cx={-8} cy={20} r={2.5} fill="currentColor" />
    <circle cx={8} cy={10} r={2.5} fill="currentColor" />
    <circle cx={8} cy={30} r={2.5} fill="currentColor" />
  </g>
);

const RelayDpst: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-40} /> : <><rect x={-20} y={-50} width={40} height={20} fill="none" stroke="currentColor" strokeWidth={2} rx={2} /><path d="M -14,-50 Q -10,-60 -6,-50 Q -2,-60 2,-50 Q 6,-60 10,-50 Q 14,-60 18,-50" fill="none" stroke="currentColor" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-40} x2={-20} y2={-40} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={-40} x2={30} y2={-40} stroke="currentColor" strokeWidth={2} />
    {/* Contact 1 */}
    <line x1={-30} y1={10} x2={-8} y2={10} stroke="currentColor" strokeWidth={2} />
    {powered
      ? <line x1={-8} y1={10} x2={8} y2={10} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={10} x2={8} y2={0} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={10} x2={30} y2={10} stroke="currentColor" strokeWidth={2} />
    {/* Contact 2 */}
    <line x1={-30} y1={35} x2={-8} y2={35} stroke="currentColor" strokeWidth={2} />
    {powered
      ? <line x1={-8} y1={35} x2={8} y2={35} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={35} x2={8} y2={25} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={35} x2={30} y2={35} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={10} x2={0} y2={35} stroke="currentColor" strokeWidth={1} strokeDasharray="3,2" />
    <circle cx={-8} cy={10} r={2.5} fill="currentColor" />
    <circle cx={8} cy={10} r={2.5} fill="currentColor" />
    <circle cx={-8} cy={35} r={2.5} fill="currentColor" />
    <circle cx={8} cy={35} r={2.5} fill="currentColor" />
  </g>
);

const DmmSymbol: SymbolFC = ({ props }) => (
  <g>
    <rect x={-34} y={-40} width={68} height={70} rx={8} fill="#303b33" stroke="currentColor" strokeWidth={2} />
    <rect x={-25} y={-30} width={50} height={22} rx={3} fill="#d8f3dc" stroke="currentColor" strokeWidth={1} />
    <text x={0} y={-16} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#166534">{String(props?.mode ?? 'DCV')}</text>
    <circle cx={0} cy={8} r={12} fill="#4b5563" stroke="#d1d5db" strokeWidth={1.5} />
    <line x1={-45} y1={35} x2={-18} y2={25} stroke="currentColor" strokeWidth={2} />
    <line x1={45} y1={35} x2={18} y2={25} stroke="currentColor" strokeWidth={2} />
    <circle cx={-18} cy={25} r={4} fill="#dc2626" />
    <circle cx={18} cy={25} r={4} fill="#111827" />
  </g>
);

const OscilloscopeSymbol: SymbolFC = () => (
  <g>
    <rect x={-42} y={-38} width={84} height={70} rx={6} fill="#334155" stroke="currentColor" strokeWidth={2} />
    <rect x={-26} y={-28} width={48} height={35} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
    <path d="M -23,-10 C -16,-27 -8,3 0,-10 S 16,-27 20,-9" fill="none" stroke="#38bdf8" strokeWidth={1.5} />
    {[-30, -10, 10, 30].map((y, index) => <line key={y} x1={-55} y1={y} x2={-42} y2={y} stroke="currentColor" strokeWidth={2} />)}
    <line x1={55} y1={30} x2={42} y2={24} stroke="currentColor" strokeWidth={2} />
    <circle cx={42} cy={24} r={4} fill="#111827" />
  </g>
);

const LogicGate: SymbolFC = ({ props }) => {
  const kind = String(props?._kind ?? 'AND').toUpperCase();
  const inverted = kind === 'NOT' || kind === 'NAND' || kind === 'NOR' || kind === 'XNOR';
  const unary = kind === 'NOT';
  const gateType = `gate-${kind.toLowerCase()}`;
  const scalable = isScalableLogicGate(gateType);
  const geometry = dynamicGateGeometryFor(gateType, props?.inputCount);
  const inputCount = unary ? 1 : geometry.inputCount;
  const inputY = scalable ? geometry.inputY : inputCount === 2 ? [-15, 15] : inputCount === 3 ? [-20, 0, 20] : [-22, -7, 7, 22];
  const orFamily = kind === 'OR' || kind === 'NOR' || kind === 'XOR' || kind === 'XNOR';
  const halfHeight = scalable ? geometry.bodyHeight / 2 : 23;
  const unaryInputX = -GRID * 2;
  return <g>
    {unary ? <line x1={unaryInputX} y1={0} x2={-22} y2={0} stroke="currentColor" strokeWidth={2} /> : inputY.map(y => <line key={y} x1={scalable ? geometry.inputX : unaryInputX} y1={y} x2={orFamily ? -18 : -22} y2={y} stroke="currentColor" strokeWidth={2} />)}
    {unary ? <path d="M -22,-23 L 22,0 L -22,23 Z" fill="none" stroke="currentColor" strokeWidth={2} /> : orFamily ? <path d={`M -26,${-halfHeight} C -9,${-halfHeight} 12,${-halfHeight * .82} 25,0 C 12,${halfHeight * .82} -9,${halfHeight} -26,${halfHeight} C -16,${halfHeight * .52} -16,${-halfHeight * .52} -26,${-halfHeight} Z`} fill="none" stroke="currentColor" strokeWidth={2} /> : <path d={`M -22,${-halfHeight} H 2 A 23,${halfHeight} 0 0 1 2,${halfHeight} H -22 Z`} fill="none" stroke="currentColor" strokeWidth={2} />}
    {(kind === 'XOR' || kind === 'XNOR') && <path d={`M -32,${-halfHeight} C -22,${-halfHeight * .52} -22,${halfHeight * .52} -32,${halfHeight}`} fill="none" stroke="currentColor" strokeWidth={2} />}
    {inverted && <circle cx={30} cy={0} r={4} fill="none" stroke="currentColor" strokeWidth={2} />}
    <line x1={inverted ? 34 : 25} y1={0} x2={GRID * 2} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
  </g>;
};

const DigitalInputSymbol: SymbolFC = ({ props }) => <g>
  <rect x={-25} y={-12} width={42} height={24} rx={4} fill="none" stroke="currentColor" strokeWidth={2} />
  <text x={-4} y={4} textAnchor="middle" fontSize={10} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">{props?.state === 'HIGH' ? '1' : '0'}</text>
  <line x1={17} y1={0} x2={GRID} y2={0} stroke="currentColor" strokeWidth={2} />
</g>;

const DigitalOutputSymbol: SymbolFC = ({ powered }) => <g>
  <rect x={-17} y={-12} width={42} height={24} rx={4} fill="none" stroke="currentColor" strokeWidth={2} />
  <text x={4} y={4} textAnchor="middle" fontSize={10} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">{powered ? '1' : '0'}</text>
  <line x1={-GRID} y1={0} x2={-17} y2={0} stroke="currentColor" strokeWidth={2} />
</g>;

export const BLOCK_ABBREVIATIONS: Record<string, string> = {
  'logic-half-adder': 'HA',
  'logic-full-adder': 'FA',
  'logic-half-subtractor': 'HS',
  'logic-full-subtractor': 'FS',
  'logic-nbit-adder': 'ADDER',
  'logic-comparator': 'COMP',
  'logic-mux': 'MUX',
  'logic-demux': 'DEMUX',
  'logic-encoder': 'ENC',
  'logic-decoder': 'DEC',
  'logic-parity': 'PARITY',
  'logic-alu-4bit': 'ALU',
  'logic-clock': 'CLK',
  'logic-ff-sr': 'SR-FF',
  'logic-ff-d': 'D-FF',
  'logic-ff-jk': 'JK-FF',
  'logic-ff-t': 'T-FF',
  'logic-shift-register': 'SHIFT REG',
  'logic-counter': 'CTR',
  'logic-nbit-register': 'REG',
  'logic-ram-16x8': 'RAM',
  'logic-rom-16x8': 'ROM',
  'logic-frequency-divider': 'DIV',
};

export function normalizeLogicType(raw: string): string {
  const s = raw.toLowerCase().trim().replace(/_/g, '-');
  if (s.startsWith('logic-')) return s;
  if (s.startsWith('gate-')) return s;
  if (['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor'].includes(s)) return `gate-${s}`;
  if (['input', 'digital-input', 'logic-input'].includes(s)) return 'digital-input';
  if (['output', 'digital-output', 'logic-output', 'probe'].includes(s)) return 'digital-output';
  if (['clock', 'logic-clock', 'clk'].includes(s)) return 'logic-clock';
  if (['half-adder', 'halfadder'].includes(s)) return 'logic-half-adder';
  if (['full-adder', 'fulladder'].includes(s)) return 'logic-full-adder';
  if (['half-subtractor', 'halfsubtractor'].includes(s)) return 'logic-half-subtractor';
  if (['full-subtractor', 'fullsubtractor'].includes(s)) return 'logic-full-subtractor';
  if (['comparator'].includes(s)) return 'logic-comparator';
  if (['mux', 'multiplexer'].includes(s)) return 'logic-mux';
  if (['demux', 'demultiplexer'].includes(s)) return 'logic-demux';
  if (['encoder'].includes(s)) return 'logic-encoder';
  if (['decoder'].includes(s)) return 'logic-decoder';
  if (['nbit-adder', 'adder'].includes(s)) return 'logic-nbit-adder';
  if (['parity'].includes(s)) return 'logic-parity';
  if (['alu', 'alu-4bit'].includes(s)) return 'logic-alu-4bit';
  if (['ff-sr', 'sr-ff'].includes(s)) return 'logic-ff-sr';
  if (['ff-d', 'd-ff'].includes(s)) return 'logic-ff-d';
  if (['ff-jk', 'jk-ff'].includes(s)) return 'logic-ff-jk';
  if (['ff-t', 't-ff'].includes(s)) return 'logic-ff-t';
  if (['shift-register', 'shiftreg'].includes(s)) return 'logic-shift-register';
  if (['counter', 'count'].includes(s)) return 'logic-counter';
  if (['register', 'nbit-register'].includes(s)) return 'logic-nbit-register';
  if (['ram', 'ram-16x8'].includes(s)) return 'logic-ram-16x8';
  if (['rom', 'rom-16x8'].includes(s)) return 'logic-rom-16x8';
  if (['divider', 'frequency-divider'].includes(s)) return 'logic-frequency-divider';
  return s.startsWith('logic-') ? s : `logic-${s}`;
}

export const LogicClockSymbol: SymbolFC = ({ powered }) => (
  <g>
    <rect x={-20} y={-20} width={40} height={40} rx={4} fill="none" stroke={powered ? '#38bdf8' : 'currentColor'} strokeWidth={2} />
    <path
      d="M -12,4 H -4 V -6 H 4 V 4 H 12 V -6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <text x={0} y={15} textAnchor="middle" fontSize={7} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">CLK</text>
    {/* Lead terminates at (bodyHalfWidth + lead) = (GRID*2 + GRID) from logicBlockLayoutFor's single-output layout, matching the actual dynamic terminal position. */}
    <line x1={20} y1={0} x2={GRID * 3} y2={0} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
  </g>
);

export const STANDARD_LOGIC_BLOCKS = new Set([
  'logic-mux', 'logic-demux', 'logic-decoder', 'logic-encoder', 'logic-comparator',
  'logic-alu-4bit', 'logic-half-adder', 'logic-full-adder', 'logic-half-subtractor',
  'logic-full-subtractor', 'logic-nbit-adder', 'logic-parity',
  'logic-ff-sr', 'logic-ff-d', 'logic-ff-jk', 'logic-ff-t',
  'logic-shift-register', 'logic-counter', 'logic-nbit-register',
  'logic-frequency-divider', 'logic-ram-16x8', 'logic-rom-16x8',
]);

const leadForPin = (type: string, pin: LogicSymbolPin, layout: LogicBlockLayout) => {
  const bodyPoint = logicBodyBoundaryForPin(type, pin, layout);
  return <line key={pin.id} x1={bodyPoint[0]} y1={bodyPoint[1]} x2={pin.x} y2={pin.y} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />;
};

const StandardLogicBlockSymbol: SymbolFC = ({ powered, props }) => {
  const rawType = String(props?._componentType || props?.type || props?.id || 'logic-block');
  const type = normalizeLogicType(rawType);
  const def = getDef(type);
  const terminals = ((props?._terminals && (props._terminals as any[]).length > 0)
    ? props._terminals
    : def?.terminals ?? []) as LogicSymbolPin[];

  const inputCount = Number(props?._inputCount ?? (terminals.filter(pin => pin.type === 'input').length || 2));
  const outputCount = Number(props?._outputCount ?? (terminals.filter(pin => pin.type === 'output').length || 1));

  const inputs = terminals.filter(pin => pin.type === 'input').map(pin => pin.id);
  const outputs = terminals.filter(pin => pin.type === 'output').map(pin => pin.id);
  const layout = logicBlockLayoutFor(
    type,
    inputs.length ? inputs : Array.from({ length: inputCount }, (_, index) => `in${index}`),
    outputs.length ? outputs : Array.from({ length: outputCount }, (_, index) => `out${index}`)
  );
  const { bodyHalfWidth: w, bodyHalfHeight: h } = layout;
  const fill = 'none';
  const bodyStroke = powered ? '#38bdf8' : 'currentColor';

  const defaultAbbr = BLOCK_ABBREVIATIONS[type] || def?.name || 'LOGIC';
  const title = String(props?._blockLabel || defaultAbbr);

  const isMux = type === 'logic-mux';
  const isDemux = type === 'logic-demux';
  const isAlu = type === 'logic-alu-4bit';
  const isAdder = type === 'logic-half-adder' || type === 'logic-full-adder' || type === 'logic-nbit-adder';
  const isSubtractor = type === 'logic-half-subtractor' || type === 'logic-full-subtractor';
  const isComparator = type === 'logic-comparator';
  const isFlipFlop = type.startsWith('logic-ff-') || type === 'logic-nbit-register' || type === 'logic-frequency-divider';
  const isMemory = type === 'logic-ram-16x8' || type === 'logic-rom-16x8';
  const isCounter = type === 'logic-counter';
  const isShiftReg = type === 'logic-shift-register';

  const body = isMux ? (
    <path d={`M ${-w},${-h} L ${w},${-h * 0.62} L ${w},${h * 0.62} L ${-w},${h} Z`} fill={fill} stroke={bodyStroke} strokeWidth={2} />
  ) : isDemux ? (
    <path d={`M ${-w},${-h * 0.62} L ${w},${-h} L ${w},${h} L ${-w},${h * 0.62} Z`} fill={fill} stroke={bodyStroke} strokeWidth={2} />
  ) : isAlu ? (
    <path d={`M ${-w},${-h} H ${w} V ${h} H ${-w} V ${h * 0.34} L ${-w + 17},0 L ${-w},${-h * 0.34} Z`} fill={fill} stroke={bodyStroke} strokeWidth={2} />
  ) : (
    <rect x={-w} y={-h} width={w * 2} height={h * 2} rx={isMemory ? 4 : 3} fill={fill} stroke={bodyStroke} strokeWidth={2} />
  );

  const clockPin = terminals.find(pin => pin.id === 'clk');

  return (
    <g>
      {body}
      {isMemory && (
        <g opacity={0.05} stroke="currentColor" strokeWidth={0.55}>
          {Array.from({ length: 7 }, (_, index) => (
            <line key={`vm-${index}`} x1={-w + (index + 1) * (2 * w / 8)} y1={-h + 8} x2={-w + (index + 1) * (2 * w / 8)} y2={h - 8} />
          ))}
          {Array.from({ length: 5 }, (_, index) => (
            <line key={`hm-${index}`} x1={-w + 8} y1={-h + (index + 1) * (2 * h / 6)} x2={w - 8} y2={-h + (index + 1) * (2 * h / 6)} />
          ))}
        </g>
      )}
      {layout.pins.map(pin => leadForPin(type, pin, layout))}

      {type !== 'logic-block' && layout.pins.map(pin => {
        const isLeft = pin.side === 'left';
        const isRight = pin.side === 'right';
        const isTop = pin.side === 'top';
        const isBottom = pin.side === 'bottom';
        const px = isLeft ? -w + 6 : isRight ? w - 6 : pin.x;
        const py = isTop ? -h + 9 : isBottom ? h - 5 : pin.y + 3;
        const anchor = isLeft ? 'start' : isRight ? 'end' : 'middle';
        const name = pin.id.toUpperCase();
        if (name.length > 5 || isMux || isDemux || name.startsWith('IN') || name.startsWith('OUT')) return null;
        return (
          <text
            key={`pin-lbl-${pin.id}`}
            x={px}
            y={py}
            textAnchor={anchor}
            fontSize={6}
            fontFamily="'KaTeX_Main', serif"
            fontWeight={600}
            fill="currentColor"
          >
            {name}
          </text>
        );
      })}

      {isAlu && (
        <>
          <text x={-w + 10} y={-h * 0.38} fontSize={7} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">A</text>
          <text x={-w + 10} y={h * 0.45} fontSize={7} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">B</text>
        </>
      )}

      {isAdder && (
        <text x={0} y={4} textAnchor="middle" fontSize={18} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">Σ</text>
      )}

      {isSubtractor && (
        <text x={0} y={4} textAnchor="middle" fontSize={20} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">−</text>
      )}

      {isComparator && (
        <text x={0} y={4} textAnchor="middle" fontSize={11} fontFamily="'KaTeX_Main', serif" fontWeight={700} fill="currentColor">A ? B</text>
      )}

      {(isFlipFlop || isCounter || isShiftReg) && clockPin && (
        <path
          d={`M ${-w + 7},${clockPin.y - 5} L ${-w + 15},${clockPin.y} L ${-w + 7},${clockPin.y + 5} Z`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      )}

      <text
        x={0}
        y={isAdder || isSubtractor || isComparator ? 22 : isMux || isDemux ? 4 : -3}
        textAnchor="middle"
        fontSize={isMux || isDemux ? 12 : 8}
        fontFamily="'KaTeX_Main', serif"
        fontWeight={700}
        fill="currentColor"
      >
        {title}
      </text>
    </g>
  );
};

const LogicBlockSymbol: SymbolFC = ({ powered, props }) => {
  return <StandardLogicBlockSymbol powered={powered} props={props} />;
};

const RelayDpdt: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-45} /> : <><rect x={-20} y={-55} width={40} height={20} fill="none" stroke="currentColor" strokeWidth={2} rx={2} /><path d="M -14,-55 Q -10,-65 -6,-55 Q -2,-65 2,-55 Q 6,-65 10,-55 Q 14,-65 18,-55" fill="none" stroke="currentColor" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-45} x2={-20} y2={-45} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={-45} x2={30} y2={-45} stroke="currentColor" strokeWidth={2} />
    {/* Pole 1 common */}
    <line x1={-35} y1={5} x2={-8} y2={5} stroke="currentColor" strokeWidth={2} />
    {powered
      ? <line x1={-8} y1={5} x2={8} y2={5} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={5} x2={8} y2={-5} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={-5} x2={35} y2={-5} stroke="currentColor" strokeWidth={2} />
    <line x1={8} y1={15} x2={35} y2={15} stroke="currentColor" strokeWidth={2} />
    {/* Pole 2 common */}
    <line x1={-35} y1={35} x2={-8} y2={35} stroke="currentColor" strokeWidth={2} />
    {powered
      ? <line x1={-8} y1={35} x2={8} y2={35} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={35} x2={8} y2={25} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={25} x2={35} y2={25} stroke="currentColor" strokeWidth={2} />
    <line x1={8} y1={45} x2={35} y2={45} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={5} x2={0} y2={35} stroke="currentColor" strokeWidth={1} strokeDasharray="3,2" />
    <circle cx={-8} cy={5} r={2.5} fill="currentColor" />
    <circle cx={-8} cy={35} r={2.5} fill="currentColor" />
  </g>
);

// ─── SYMBOL MAP ───────────────────────────────────────────────────────────────

export const SYMBOL_MAP: Record<string, SymbolFC | undefined> = {
  'dc-voltage': DcVoltage,
  'dc-rail': DcRail,
  'ac-voltage': AcVoltage,
  'three-phase-source': ThreePhaseSource,
  'three-phase-rail': (p) => p.props?._documentedStyle === true ? <ThreePhaseRail {...p} /> : <ThreePhaseSource {...p} />,
  'dc-current': DcCurrent,
  'ac-current': AcCurrent,
  'ground': Ground,
  'resistor': Resistor,
  'potentiometer': Potentiometer,
  'capacitor': Capacitor,
  'inductor': Inductor,
  'vccs': (p) => <DependentDiamond {...p} props={{ ...p.props, _type: 'vccs' }} />,
  'vcvs': (p) => <DependentDiamond {...p} props={{ ...p.props, _type: 'vcvs' }} />,
  'cccs': (p) => <DependentDiamond {...p} props={{ ...p.props, _type: 'cccs' }} />,
  'ccvs': (p) => <DependentDiamond {...p} props={{ ...p.props, _type: 'ccvs' }} />,
  'diode': DiodeBase,
  'diode-ideal': DiodeBase,
  'diode-silicon': DiodeBase,
  'diode-germanium': DiodeBase,
  'diode-gaas': DiodeBase,
  'zener': (p) => <DiodeBase {...p} props={{ ...p.props, _type: 'zener' }} />,
  'led': (p) => <DiodeBase {...p} props={{ ...p.props, _type: 'led' }} />,
  'photodiode': (p) => <DiodeBase {...p} props={{ ...p.props, _type: 'photodiode' }} />,
  'bjt-npn': BjtNpn,
  'bjt-pnp': BjtPnp,
  'mosfet-n': MosfetN,
  'mosfet-p': MosfetP,
  'jfet-n': JfetN,
  'jfet-p': JfetP,
  'sw-spst-no': SwSpstNo,
  'sw-spst-nc': SwSpstNc,
  'sw-spdt': SwSpdt,
  'sw-dpst': SwDpst,
  'sw-dpdt': SwDpdt,
  'pb-no': PbNo,
  'pb-nc': PbNc,
  'aux-contact-no': SwSpstNo,
  'aux-contact-nc': SwSpstNc,
  'relay-spst': RelaySpst,
  'relay-spdt': RelaySpdt,
  'relay-dpst': RelayDpst,
  'relay-dpdt': RelayDpdt,
  'contactor': Contactor,
  'fuse': Fuse,
  'circuit-breaker': CircuitBreaker,
  'transformer': Transformer,
  'transformer-ct': TransformerCt,
  'autotransformer': Autotransformer,
  'scr': Scr,
  'diac': Diac,
  'triac': Triac,
  'motor-dc': MotorDc,
  'motor-3phase': Motor3Phase,
  'lamp': Lamp,
  'opamp': Opamp,
  // Inputs & Probes
  'digital-input': DigitalInputSymbol,
  'input': DigitalInputSymbol,
  'logic-input': DigitalInputSymbol,

  'digital-output': DigitalOutputSymbol,
  'output': DigitalOutputSymbol,
  'logic-output': DigitalOutputSymbol,
  'probe': DigitalOutputSymbol,

  'logic-clock': LogicClockSymbol,
  'clock': LogicClockSymbol,
  'clk': LogicClockSymbol,

  // Logic Gates
  'gate-and': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'AND' }} />,
  'and': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'AND' }} />,
  'gate_and': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'AND' }} />,

  'gate-or': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'OR' }} />,
  'or': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'OR' }} />,
  'gate_or': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'OR' }} />,

  'gate-not': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOT' }} />,
  'not': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOT' }} />,
  'gate_not': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOT' }} />,

  'gate-nand': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NAND' }} />,
  'nand': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NAND' }} />,
  'gate_nand': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NAND' }} />,

  'gate-nor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOR' }} />,
  'nor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOR' }} />,
  'gate_nor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOR' }} />,

  'gate-xor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XOR' }} />,
  'xor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XOR' }} />,
  'gate_xor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XOR' }} />,

  'gate-xnor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XNOR' }} />,
  'xnor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XNOR' }} />,
  'gate_xnor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XNOR' }} />,

  // Combinational
  'logic-half-adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-half-adder', _blockLabel: 'HA' }} />,
  'half_adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-half-adder', _blockLabel: 'HA' }} />,
  'half-adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-half-adder', _blockLabel: 'HA' }} />,

  'logic-full-adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-full-adder', _blockLabel: 'FA' }} />,
  'full_adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-full-adder', _blockLabel: 'FA' }} />,
  'full-adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-full-adder', _blockLabel: 'FA' }} />,

  'logic-half-subtractor': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-half-subtractor', _blockLabel: 'HS' }} />,
  'half_subtractor': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-half-subtractor', _blockLabel: 'HS' }} />,
  'half-subtractor': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-half-subtractor', _blockLabel: 'HS' }} />,

  'logic-full-subtractor': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-full-subtractor', _blockLabel: 'FS' }} />,
  'full_subtractor': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-full-subtractor', _blockLabel: 'FS' }} />,
  'full-subtractor': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-full-subtractor', _blockLabel: 'FS' }} />,

  'logic-comparator': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-comparator', _blockLabel: 'COMP' }} />,
  'comparator': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-comparator', _blockLabel: 'COMP' }} />,

  'logic-mux': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-mux', _blockLabel: 'MUX' }} />,
  'mux': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-mux', _blockLabel: 'MUX' }} />,
  'multiplexer': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-mux', _blockLabel: 'MUX' }} />,

  'logic-demux': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-demux', _blockLabel: 'DEMUX' }} />,
  'demux': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-demux', _blockLabel: 'DEMUX' }} />,
  'demultiplexer': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-demux', _blockLabel: 'DEMUX' }} />,

  'logic-encoder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-encoder', _blockLabel: 'ENC' }} />,
  'encoder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-encoder', _blockLabel: 'ENC' }} />,

  'logic-decoder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-decoder', _blockLabel: 'DEC' }} />,
  'decoder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-decoder', _blockLabel: 'DEC' }} />,

  'logic-nbit-adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-nbit-adder', _blockLabel: 'ADDER' }} />,
  'nbit-adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-nbit-adder', _blockLabel: 'ADDER' }} />,
  'nbit_adder': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-nbit-adder', _blockLabel: 'ADDER' }} />,

  'logic-parity': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-parity', _blockLabel: 'PARITY' }} />,
  'parity': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-parity', _blockLabel: 'PARITY' }} />,

  'logic-alu-4bit': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-alu-4bit', _blockLabel: 'ALU' }} />,
  'alu': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-alu-4bit', _blockLabel: 'ALU' }} />,
  'alu-4bit': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-alu-4bit', _blockLabel: 'ALU' }} />,
  'alu_4bit': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-alu-4bit', _blockLabel: 'ALU' }} />,

  // Sequential
  'logic-ff-sr': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-sr', _blockLabel: 'SR-FF' }} />,
  'sr-ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-sr', _blockLabel: 'SR-FF' }} />,
  'sr_ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-sr', _blockLabel: 'SR-FF' }} />,

  'logic-ff-d': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-d', _blockLabel: 'D-FF' }} />,
  'd-ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-d', _blockLabel: 'D-FF' }} />,
  'd_ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-d', _blockLabel: 'D-FF' }} />,

  'logic-ff-jk': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-jk', _blockLabel: 'JK-FF' }} />,
  'jk-ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-jk', _blockLabel: 'JK-FF' }} />,
  'jk_ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-jk', _blockLabel: 'JK-FF' }} />,

  'logic-ff-t': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-t', _blockLabel: 'T-FF' }} />,
  't-ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-t', _blockLabel: 'T-FF' }} />,
  't_ff': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ff-t', _blockLabel: 'T-FF' }} />,

  'logic-shift-register': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-shift-register', _blockLabel: 'SHIFT REG' }} />,
  'shift-register': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-shift-register', _blockLabel: 'SHIFT REG' }} />,
  'shift_register': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-shift-register', _blockLabel: 'SHIFT REG' }} />,

  'logic-counter': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-counter', _blockLabel: 'CTR' }} />,
  'counter': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-counter', _blockLabel: 'CTR' }} />,

  'logic-nbit-register': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-nbit-register', _blockLabel: 'REG' }} />,
  'register': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-nbit-register', _blockLabel: 'REG' }} />,
  'nbit-register': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-nbit-register', _blockLabel: 'REG' }} />,

  'logic-ram-16x8': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ram-16x8', _blockLabel: 'RAM' }} />,
  'ram': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ram-16x8', _blockLabel: 'RAM' }} />,
  'ram-16x8': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-ram-16x8', _blockLabel: 'RAM' }} />,

  'logic-rom-16x8': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-rom-16x8', _blockLabel: 'ROM' }} />,
  'rom': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-rom-16x8', _blockLabel: 'ROM' }} />,
  'rom-16x8': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-rom-16x8', _blockLabel: 'ROM' }} />,

  'logic-frequency-divider': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-frequency-divider', _blockLabel: 'DIV' }} />,
  'frequency-divider': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-frequency-divider', _blockLabel: 'DIV' }} />,
  'divider': (p) => <StandardLogicBlockSymbol {...p} props={{ ...p.props, _componentType: 'logic-frequency-divider', _blockLabel: 'DIV' }} />,

  'logic-block': StandardLogicBlockSymbol,
  'voltmeter': Voltmeter,
  'ammeter': Ammeter,
  'dmm': DmmSymbol,
  'oscilloscope': OscilloscopeSymbol,
};

export function renderSymbol(
  symbolId: string,
  powered: boolean,
  props: Record<string, any> = {},
  animTime = 0,
): React.ReactNode {
  // 1. Direct match in SYMBOL_MAP
  let Sym: SymbolFC | undefined = SYMBOL_MAP[symbolId];

  // 2. Normalized match (handles snake_case, short names, prefixes)
  if (!Sym) {
    const normalized = normalizeLogicType(symbolId);
    const candidate = SYMBOL_MAP[normalized];
    if (candidate) {
      Sym = candidate;
      symbolId = normalized;
    }
  }

  // 3. Fallback from props if symbolId was generic or not matched
  if (symbolId === 'logic-block' || !Sym) {
    const compType = String(props?._componentType || props?.type || props?.id || '');
    if (compType) {
      const normalizedComp = normalizeLogicType(compType);
      const candidate = SYMBOL_MAP[normalizedComp];
      if (candidate) {
        Sym = candidate;
        symbolId = normalizedComp;
      }
    }
  }

  if (!Sym) {
    // If still not matched but looks like a logic component, use StandardLogicBlockSymbol
    if (symbolId.includes('logic') || symbolId.includes('gate') || symbolId.includes('adder') || symbolId.includes('mux')) {
      return <StandardLogicBlockSymbol powered={powered} props={{ ...props, _componentType: symbolId }} animTime={animTime} />;
    }
    return <text x={0} y={5} textAnchor="middle" fontSize={10} fill="currentColor">?</text>;
  }

  const enrichedProps = {
    ...props,
    _componentType: props?._componentType || symbolId,
    _blockLabel: props?._blockLabel || BLOCK_ABBREVIATIONS[symbolId] || BLOCK_ABBREVIATIONS[normalizeLogicType(symbolId)],
  };

  return <Sym powered={powered} props={enrichedProps} animTime={animTime} />;
}
