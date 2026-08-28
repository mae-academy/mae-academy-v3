/**
 * ElectroLab – IEEE 315 / IEC 60617 SVG Symbol Renderer
 * Each symbol is drawn centered at (0,0).
 * Terminals are at the exact boundary of the symbol.
 */

import React from 'react';

interface SymbolProps {
  powered?: boolean;
  props?: Record<string, any>;
  animTime?: number; // 0..1 for motor rotation etc.
}

type SymbolFC = React.FC<SymbolProps>;

/** Manual contact position overrides coil sensing only after direct canvas interaction. */
function relayContactClosed(powered: boolean | undefined, props?: Record<string, any>): boolean {
  if (props?.manualState === 'closed') return true;
  if (props?.manualState === 'open') return false;
  return Boolean(powered);
}

function SemicircularHorizontalCoil({ x1, x2, y, rise = -10 }: { x1: number; x2: number; y: number; rise?: number }) {
  const step = (x2 - x1) / 4;
  const d = Array.from({ length: 4 }, (_, index) => {
    const start = x1 + index * step;
    const end = start + step;
    return `C ${start},${y + rise} ${end},${y + rise} ${end},${y}`;
  }).join(' ');
  return <path d={`M ${x1},${y} ${d}`} fill="none" stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />;
}

function SemicircularVerticalCoil({ x, y1, y2, bulge }: { x: number; y1: number; y2: number; bulge: number }) {
  const step = (y2 - y1) / 4;
  const d = Array.from({ length: 4 }, (_, index) => {
    const start = y1 + index * step;
    const end = start + step;
    return `C ${x + bulge},${start} ${x + bulge},${end} ${x},${end}`;
  }).join(' ');
  return <path d={`M ${x},${y1} ${d}`} fill="none" stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />;
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
    <line x1={-halfLength} y1={0} x2={bodyStart} y2={0} stroke="#1a2744" strokeWidth={strokeWidth} />
    <rect x={bodyStart} y={-bodyHeight / 2} width={bodyWidth} height={bodyHeight} rx={2} fill="white" stroke="#1a2744" strokeWidth={strokeWidth} />
    <line x1={bodyEnd} y1={0} x2={halfLength} y2={0} stroke="#1a2744" strokeWidth={strokeWidth} />
  </g>;
}

// ─── SOURCES ─────────────────────────────────────────────────────────────────

const DcVoltage: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2} />
    {/* + symbol at top, - at bottom */}
    <line x1={-6} y1={-8} x2={6} y2={-8} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={-14} x2={0} y2={-2} stroke="#1a2744" strokeWidth={2} />
    <line x1={-6} y1={8} x2={6} y2={8} stroke="#1a2744" strokeWidth={2} />
    {/* wire stubs to boundary */}
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const AcVoltage: SymbolFC = ({ props }) => {
  const wf = (props?.waveform as string) || 'sine';
  const documented = props?._documentedStyle === true;
  const waveSymbols: Record<string, React.ReactNode> = {
    sine: documented
      ? <path d="M -11,2 C -7,-7 -3,-7 0,2 C 3,11 7,11 11,2" fill="none" stroke="#1a2744" strokeWidth={1.8} strokeLinecap="round" />
      : <path d="M -10,-8 Q -5,-16 0,-8 Q 5,0 10,-8" fill="none" stroke="#1a2744" strokeWidth={1.5} />,
    square: <path d="M -10,-14 L -10,-4 L 0,-4 L 0,-14 L 10,-14 L 10,-4" fill="none" stroke="#1a2744" strokeWidth={1.5} />,
    sawtooth: <path d="M -10,-4 L 0,-14 L 0,-4 L 10,-14" fill="none" stroke="#1a2744" strokeWidth={1.5} />,
    triangle: <path d="M -10,-4 L -5,-14 L 0,-4 L 5,-14 L 10,-4" fill="none" stroke="#1a2744" strokeWidth={1.5} />,
  };
  const waveSymbol = waveSymbols[wf] || null;
  return (
    <g>
      <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2} />
      {waveSymbol}
      <line x1={0} y1={-22} x2={0} y2={-30} stroke="#1a2744" strokeWidth={2} />
      <line x1={0} y1={22} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
    </g>
  );
};

const DcCurrent: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2} />
    {/* Arrow pointing up */}
    <line x1={0} y1={12} x2={0} y2={-12} stroke="#1a2744" strokeWidth={2} />
    <polyline points="-6,-6 0,-14 6,-6" fill="none" stroke="#1a2744" strokeWidth={2} strokeLinejoin="round" />
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const AcCurrent: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2} />
    <path d="M -10,-4 Q -5,-14 0,-4 Q 5,6 10,-4" fill="none" stroke="#1a2744" strokeWidth={1.5} />
    <polyline points="-4,-10 0,-16 4,-10" fill="none" stroke="#1a2744" strokeWidth={1.5} strokeLinejoin="round" />
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>;
  return <g>
    <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={-2} x2={0} y2={-13} stroke="#1a2744" strokeWidth={2} />
    <polyline points="-5,-7 0,-14 5,-7" fill="none" stroke="#1a2744" strokeWidth={2} strokeLinejoin="round" />
    <path d="M -11,0 C -7,-7 -3,-7 0,0 C 3,7 7,7 11,0" fill="none" stroke="#1a2744" strokeWidth={1.7} strokeLinecap="round" />
    <line x1={0} y1={-22} x2={0} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={22} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>;
};

const DcRail: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <line x1={0} y1={-25} x2={0} y2={-14} stroke="#1a2744" strokeWidth={2} strokeLinecap="square" />
    <rect x={-30} y={-14} width={60} height={28} rx={4} fill="#eff6ff" stroke="#1a2744" strokeWidth={2} />
    <text x={0} y={-3} textAnchor="middle" fontSize={11} fontWeight={800} fill="#1a2744">+</text>
    <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1a2744">{String(props?.voltage ?? 24)} V DC</text>
  </g>;
  return <g data-documented-dc-rail="positive-reference">
    <line x1={0} y1={-25} x2={0} y2={0} stroke="#1a2744" strokeWidth={2.4} strokeLinecap="square" />
    <line x1={-30} y1={0} x2={30} y2={0} stroke="#1a2744" strokeWidth={2.4} strokeLinecap="square" />
    <text x={0} y={-6} textAnchor="middle" fontSize={11} fontWeight={800} fill="#1a2744">+</text>
  </g>;
};

const ThreePhaseSource: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) {
    const voltage = Number(props?.lineVoltage ?? 400);
    return <g>
      <rect x={-22} y={-37} width={54} height={74} rx={8} fill="#fff7ed" stroke="#1a2744" strokeWidth={2} />
      <text x={5} y={-10} textAnchor="middle" fontSize={13} fontWeight={700} fill="#b45309">3~</text>
      <text x={5} y={8} textAnchor="middle" fontSize={7} fill="#1a2744">{`${voltage} V 3~`}</text>
      {[-30, -10, 10, 30].map((y, index) => <g key={y}><line x1={-40} y1={y} x2={-22} y2={y} stroke="#1a2744" strokeWidth={2} /><text x={-18} y={y + 3} fontSize={7} fill="#1a2744">{['L1', 'L2', 'L3', 'N'][index]}</text></g>)}
    </g>;
  }
  return <g>
    <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2.2} />
    <text x={0} y={4} textAnchor="middle" fontSize={8.5} fontWeight={750} fill="#1a2744">PHASE</text>
    {[-18, 0, 18].map((y) => <line key={y} data-phase-lead={y === 0 ? 'axis' : 'circle'} x1={y === 0 ? 22 : DOCUMENTED_PHASE_OUTPUT_X} y1={y} x2={40} y2={y} stroke="#1a2744" strokeWidth={2} strokeLinecap="square" />)}
    <line x1={-22} y1={0} x2={-40} y2={0} stroke="#1a2744" strokeWidth={2} strokeLinecap="square" />
  </g>;
};

const ThreePhaseRail: SymbolFC = () => <g>
  <line x1={-45} y1={-30} x2={45} y2={-30} stroke="#d14343" strokeWidth={2.2} strokeLinecap="square" />
  <line x1={-45} y1={-10} x2={45} y2={-10} stroke="#d6a720" strokeWidth={2.2} strokeLinecap="square" />
  <line x1={-45} y1={10} x2={45} y2={10} stroke="#2d73b7" strokeWidth={2.2} strokeLinecap="square" />
  <line x1={-45} y1={30} x2={45} y2={30} stroke="#1a2744" strokeWidth={1.9} strokeLinecap="square" />
</g>;

const Ground: SymbolFC = () => (
  <g>
    <line x1={0} y1={-15} x2={0} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={-12} y1={0} x2={12} y2={0} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-8} y1={5} x2={8} y2={5} stroke="#1a2744" strokeWidth={2} />
    <line x1={-4} y1={10} x2={4} y2={10} stroke="#1a2744" strokeWidth={2} />
  </g>
);

// ─── PASSIVE ──────────────────────────────────────────────────────────────────

const Resistor: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <line x1={-30} y1={0} x2={-15} y2={0} stroke="#1a2744" strokeWidth={2} />
    <rect x={-15} y={-8} width={30} height={16} fill="white" stroke="#1a2744" strokeWidth={2} rx={2} />
    <line x1={15} y1={0} x2={30} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>;
  return <g>
    <RectangularResistor />
  </g>;
};

const Capacitor: SymbolFC = () => (
  <g>
    <line x1={0} y1={-30} x2={0} y2={-6} stroke="#1a2744" strokeWidth={2} />
    <line x1={-14} y1={-6} x2={14} y2={-6} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-14} y1={6} x2={14} y2={6} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={0} y1={6} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const Inductor: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <line x1={-30} y1={0} x2={-18} y2={0} stroke="#1a2744" strokeWidth={2} />
    <path d="M -18,0 Q -15,-10 -9,-10 Q -3,-10 0,-10 Q 6,-10 9,-10 Q 15,-10 18,0" fill="none" stroke="#1a2744" strokeWidth={2} />
    <line x1={18} y1={0} x2={30} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>;
  return <g>
    <line x1={-30} y1={0} x2={-18} y2={0} stroke="#1a2744" strokeWidth={2} />
    <path d="M -18,0 C -18,-9 -6,-9 -6,0 C -6,-9 6,-9 6,0 C 6,-9 18,-9 18,0" fill="none" stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />
    <line x1={18} y1={0} x2={30} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>;
};

const Potentiometer: SymbolFC = ({ props }) => {
  const documented = props?._documentedStyle === true;
  const position = Math.max(0, Math.min(1, Number(props?.wiper ?? 0.5)));
  const y = documented ? -7 : -20 + position * 40;
  if (!documented) return <g>
    <line x1={-35} y1={-20} x2={-18} y2={-20} stroke="#1a2744" strokeWidth={2} />
    <line x1={-35} y1={20} x2={-18} y2={20} stroke="#1a2744" strokeWidth={2} />
    <rect x={-18} y={-24} width={36} height={48} rx={3} fill="white" stroke="#1a2744" strokeWidth={2} />
    <line x1={-10} y1={-18} x2={10} y2={18} stroke="#1a2744" strokeWidth={1.5} opacity={0.35} />
    <line x1={35} y1={0} x2={18} y2={y} stroke="#1a2744" strokeWidth={2} />
    <polygon points={`${18},${y} ${25},${y - 4} ${25},${y + 4}`} fill="#1a2744" />
    <line x1={18} y1={-20} x2={18} y2={20} stroke="#1a2744" strokeWidth={1.5} />
  </g>;
  return (
    <g data-rigid-body="potentiometer">
      <line x1={-DOCUMENTED_GRID_LOCAL} y1={0} x2={-20} y2={0} stroke="#1a2744" strokeWidth={2} />
      <rect x={-20} y={-7} width={40} height={14} rx={2} fill="white" stroke="#1a2744" strokeWidth={2} />
      <line x1={20} y1={0} x2={DOCUMENTED_GRID_LOCAL} y2={0} stroke="#1a2744" strokeWidth={2} />
      <line x1={0} y1={-DOCUMENTED_GRID_LOCAL} x2={0} y2={y} stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />
      <polygon points={`0,${y} -4,${y - 8} 4,${y - 8}`} fill="#1a2744" />
    </g>
  );
};

const DependentDiamond: SymbolFC = ({ props }) => {
  const currentControlled = String(props?._type) === 'vccs' || String(props?._type) === 'cccs';
  return <g>
    <line x1={0} y1={-35} x2={0} y2={-25} stroke="#1a2744" strokeWidth={2} /><line x1={0} y1={25} x2={0} y2={35} stroke="#1a2744" strokeWidth={2} />
    <polygon points="0,-25 20,0 0,25 -20,0" fill="white" stroke="#1a2744" strokeWidth={2} />
    {currentControlled ? <><line x1={0} y1={12} x2={0} y2={-12} stroke="#1a2744" strokeWidth={2} /><polyline points="-5,-6 0,-13 5,-6" fill="none" stroke="#1a2744" strokeWidth={2} /></> : <><text x={0} y={-7} textAnchor="middle" fontSize={14} fontWeight={700}>+</text><text x={0} y={13} textAnchor="middle" fontSize={16} fontWeight={700}>−</text></>}
    <line x1={-35} y1={-20} x2={-20} y2={-20} stroke="#1a2744" strokeWidth={2} /><line x1={-35} y1={20} x2={-20} y2={20} stroke="#1a2744" strokeWidth={2} />
  </g>;
};

const StarResistorPack: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g data-resistor-network="star">
  <g transform={`rotate(0) translate(${DOCUMENTED_NETWORK_ARM_HALF_LENGTH},0)`}><RectangularResistor strokeWidth={1.35} halfLength={DOCUMENTED_NETWORK_ARM_HALF_LENGTH} bodyWidth={DOCUMENTED_NETWORK_ARM_BODY_WIDTH} bodyHeight={DOCUMENTED_NETWORK_ARM_BODY_HEIGHT} /></g>
  <g transform={`rotate(120) translate(${DOCUMENTED_NETWORK_ARM_HALF_LENGTH},0)`}><RectangularResistor strokeWidth={1.35} halfLength={DOCUMENTED_NETWORK_ARM_HALF_LENGTH} bodyWidth={DOCUMENTED_NETWORK_ARM_BODY_WIDTH} bodyHeight={DOCUMENTED_NETWORK_ARM_BODY_HEIGHT} /></g>
  <g transform={`rotate(240) translate(${DOCUMENTED_NETWORK_ARM_HALF_LENGTH},0)`}><RectangularResistor strokeWidth={1.35} halfLength={DOCUMENTED_NETWORK_ARM_HALF_LENGTH} bodyWidth={DOCUMENTED_NETWORK_ARM_BODY_WIDTH} bodyHeight={DOCUMENTED_NETWORK_ARM_BODY_HEIGHT} /></g>
  <circle cx={0} cy={0} r={2.6} fill="#1a2744" />
</g> : <g>
  <line x1={-40} y1={-25} x2={-18} y2={-12} stroke="#1a2744" strokeWidth={2} /><line x1={-40} y1={25} x2={-18} y2={12} stroke="#1a2744" strokeWidth={2} /><line x1={40} y1={0} x2={18} y2={0} stroke="#1a2744" strokeWidth={2} />
  <path d="M-18,-12 l8,-5 7,10 7,-10 7,5 M-18,12 l8,5 7,-10 7,10 7,-5 M18,0 l-9,-6 -8,12 -8,-12 -9,6" fill="none" stroke="#1a2744" strokeWidth={1.7} strokeLinejoin="round" />
  <circle cx={0} cy={0} r={3} fill="#1a2744" />
</g>;

const DeltaResistorPack: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g data-resistor-network="delta">
  <g transform="translate(0,9.6225) rotate(0)"><RectangularResistor strokeWidth={1.35} halfLength={DOCUMENTED_NETWORK_ARM_HALF_LENGTH} bodyWidth={DOCUMENTED_NETWORK_ARM_BODY_WIDTH} bodyHeight={DOCUMENTED_NETWORK_ARM_BODY_HEIGHT} /></g>
  <g transform="translate(8.3333,-4.81125) rotate(60)"><RectangularResistor strokeWidth={1.35} halfLength={DOCUMENTED_NETWORK_ARM_HALF_LENGTH} bodyWidth={DOCUMENTED_NETWORK_ARM_BODY_WIDTH} bodyHeight={DOCUMENTED_NETWORK_ARM_BODY_HEIGHT} /></g>
  <g transform="translate(-8.3333,-4.81125) rotate(120)"><RectangularResistor strokeWidth={1.35} halfLength={DOCUMENTED_NETWORK_ARM_HALF_LENGTH} bodyWidth={DOCUMENTED_NETWORK_ARM_BODY_WIDTH} bodyHeight={DOCUMENTED_NETWORK_ARM_BODY_HEIGHT} /></g>
</g> : <g>
  <line x1={-40} y1={-25} x2={-28} y2={-18} stroke="#1a2744" strokeWidth={2} /><line x1={-40} y1={25} x2={-28} y2={18} stroke="#1a2744" strokeWidth={2} /><line x1={40} y1={0} x2={28} y2={0} stroke="#1a2744" strokeWidth={2} />
  <path d="M-28,-18 l10,-4 7,7 7,-7 8,4 M-28,18 l10,4 7,-7 7,7 8,-4 M-18,-22 l-4,9 8,5 -8,5 -4,9" fill="none" stroke="#1a2744" strokeWidth={1.7} strokeLinejoin="round" />
</g>;

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
      <line x1={-20} y1={0} x2={-8} y2={0} stroke="#1a2744" strokeWidth={2} />
      {/* Triangle body */}
      <polygon points="-8,-10 -8,10 10,0" fill={powered && isLed ? glowColor! : 'white'} fillOpacity={powered && isLed ? emissionOpacity : 1} stroke="#1a2744" strokeWidth={2} />
      {/* Cathode bar */}
      {isZener ? (
        <path d="M 10,-12 L 10,12 M 10,-12 L 16,-18 M 10,12 L 4,18" fill="none" stroke="#1a2744" strokeWidth={2} />
      ) : (
        <line x1={10} y1={-12} x2={10} y2={12} stroke="#1a2744" strokeWidth={2} />
      )}
      <line x1={10} y1={0} x2={20} y2={0} stroke="#1a2744" strokeWidth={2} />
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

const BjtNpn: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-20} y1={0} x2={-6} y2={0} stroke="#1a2744" strokeWidth={2} />
  <line x1={-6} y1={-20} x2={-6} y2={20} stroke="#1a2744" strokeWidth={2.6} />
  <line x1={-6} y1={-10} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />
  <line x1={-6} y1={10} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />
  <g data-emitter-arrow="npn" transform="translate(12 23.846) rotate(37.5686)"><polygon points="10,0 0,-4 0,4" fill="#1a2744" /></g>
</g> : <g>
  <line x1={-20} y1={0} x2={-6} y2={0} stroke="#1a2744" strokeWidth={2} />
  <line x1={-6} y1={-22} x2={-6} y2={22} stroke="#1a2744" strokeWidth={3} />
  <line x1={-6} y1={-12} x2={10} y2={-24} stroke="#1a2744" strokeWidth={2} /><line x1={10} y1={-24} x2={10} y2={-30} stroke="#1a2744" strokeWidth={2} />
  <line x1={-6} y1={12} x2={10} y2={24} stroke="#1a2744" strokeWidth={2} /><line x1={10} y1={24} x2={10} y2={30} stroke="#1a2744" strokeWidth={2} />
  <polygon points="4,18 12,26 14,16" fill="#1a2744" /><line x1={10} y1={-30} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} /><line x1={10} y1={30} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} />
</g>;

const BjtPnp: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-20} y1={0} x2={-6} y2={0} stroke="#1a2744" strokeWidth={2} />
  <line x1={-6} y1={-20} x2={-6} y2={20} stroke="#1a2744" strokeWidth={2.6} />
  <line x1={-6} y1={-10} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />
  <line x1={-6} y1={10} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} strokeLinecap="round" />
  <g data-emitter-arrow="pnp" transform="translate(12 23.846) rotate(37.5686)"><polygon points="-10,0 0,-4 0,4" fill="#1a2744" /></g>
</g> : <g>
  <line x1={-20} y1={0} x2={-6} y2={0} stroke="#1a2744" strokeWidth={2} /><line x1={-6} y1={-22} x2={-6} y2={22} stroke="#1a2744" strokeWidth={3} />
  <line x1={-6} y1={-12} x2={10} y2={-24} stroke="#1a2744" strokeWidth={2} /><line x1={10} y1={-24} x2={10} y2={-30} stroke="#1a2744" strokeWidth={2} />
  <line x1={-6} y1={12} x2={10} y2={24} stroke="#1a2744" strokeWidth={2} /><line x1={10} y1={24} x2={10} y2={30} stroke="#1a2744" strokeWidth={2} />
  <polygon points="-2,8 6,16 -4,18" fill="#1a2744" /><line x1={10} y1={-30} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} /><line x1={10} y1={30} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} />
</g>;

const MosfetN: SymbolFC = () => (
  <g>
    {/* Gate */}
    <line x1={-20} y1={0} x2={-10} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={-10} y1={-18} x2={-10} y2={18} stroke="#1a2744" strokeWidth={2.5} />
    {/* Channel */}
    <line x1={-5} y1={-18} x2={-5} y2={-8} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-5} y1={-4} x2={-5} y2={4} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-5} y1={8} x2={-5} y2={18} stroke="#1a2744" strokeWidth={2.5} />
    {/* Drain */}
    <line x1={-5} y1={-18} x2={10} y2={-18} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={-18} x2={10} y2={-30} stroke="#1a2744" strokeWidth={2} />
    {/* Source with arrow */}
    <line x1={-5} y1={18} x2={10} y2={18} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={18} x2={10} y2={30} stroke="#1a2744" strokeWidth={2} />
    {/* N-ch arrow pointing inward */}
    <polygon points="-5,0 5,5 5,-5" fill="#1a2744" />
    <line x1={10} y1={-30} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={30} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const MosfetP: SymbolFC = () => (
  <g>
    <line x1={-20} y1={0} x2={-10} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={-10} y1={-18} x2={-10} y2={18} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-5} y1={-18} x2={-5} y2={-8} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-5} y1={-4} x2={-5} y2={4} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-5} y1={8} x2={-5} y2={18} stroke="#1a2744" strokeWidth={2.5} />
    <line x1={-5} y1={-18} x2={10} y2={-18} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={-18} x2={10} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={-5} y1={18} x2={10} y2={18} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={18} x2={10} y2={30} stroke="#1a2744" strokeWidth={2} />
    {/* P-ch arrow pointing outward */}
    <polygon points="-5,0 -15,5 -15,-5" fill="#1a2744" />
    <line x1={10} y1={-30} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={30} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const JfetN: SymbolFC = () => (
  <g>
    <line x1={-20} y1={0} x2={-5} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={-5} y1={-22} x2={-5} y2={22} stroke="#1a2744" strokeWidth={3} />
    <line x1={-5} y1={-14} x2={10} y2={-14} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={-14} x2={10} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={-5} y1={14} x2={10} y2={14} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={14} x2={10} y2={30} stroke="#1a2744" strokeWidth={2} />
    {/* N-ch arrow on gate pointing in */}
    <polygon points="-5,0 3,4 3,-4" fill="#1a2744" />
    <line x1={10} y1={-30} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={30} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const JfetP: SymbolFC = () => (
  <g>
    <line x1={-20} y1={0} x2={-5} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={-5} y1={-22} x2={-5} y2={22} stroke="#1a2744" strokeWidth={3} />
    <line x1={-5} y1={-14} x2={10} y2={-14} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={-14} x2={10} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={-5} y1={14} x2={10} y2={14} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={14} x2={10} y2={30} stroke="#1a2744" strokeWidth={2} />
    {/* P-ch arrow on gate pointing out */}
    <polygon points="-5,0 -13,4 -13,-4" fill="#1a2744" />
    <line x1={10} y1={-30} x2={20} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={10} y1={30} x2={20} y2={30} stroke="#1a2744" strokeWidth={2} />
  </g>
);

// ─── SWITCHES ─────────────────────────────────────────────────────────────────

const SwSpstNo: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      <line x1={-25} y1={0} x2={-8} y2={0} stroke="#1a2744" strokeWidth={2} />
      {closed
        ? <line x1={-8} y1={0} x2={8} y2={0} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-8} y1={0} x2={8} y2={-12} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={8} y1={0} x2={25} y2={0} stroke="#1a2744" strokeWidth={2} />
      <circle cx={-8} cy={0} r={2.5} fill="#1a2744" />
      <circle cx={8} cy={0} r={2.5} fill="#1a2744" />
    </g>
  );
};

const SwSpstNc: SymbolFC = ({ props }) => {
  const open = props?.state === 'open';
  return (
    <g>
      <line x1={-25} y1={0} x2={-8} y2={0} stroke="#1a2744" strokeWidth={2} />
      {open
        ? <line x1={-8} y1={0} x2={8} y2={-12} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-8} y1={0} x2={8} y2={0} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={8} y1={0} x2={25} y2={0} stroke="#1a2744" strokeWidth={2} />
      <circle cx={-8} cy={0} r={2.5} fill="#1a2744" />
      <circle cx={8} cy={0} r={2.5} fill="#1a2744" />
      {/* NC marker */}
      <line x1={-4} y1={-14} x2={4} y2={-14} stroke="#1a2744" strokeWidth={1.5} />
    </g>
  );
};

const SwSpdt: SymbolFC = ({ props }) => {
  const state = props?.state || 'a';
  return (
    <g>
      <line x1={-30} y1={0} x2={-8} y2={0} stroke="#1a2744" strokeWidth={2} />
      {state === 'a'
        ? <line x1={-8} y1={0} x2={18} y2={-15} stroke="#1a2744" strokeWidth={2} />
        : state === 'b'
          ? <line x1={-8} y1={0} x2={18} y2={15} stroke="#1a2744" strokeWidth={2} />
          : <line x1={-8} y1={0} x2={8} y2={-10} stroke="#1a2744" strokeWidth={2} />
      }
      <circle cx={-8} cy={0} r={2.5} fill="#1a2744" />
      <circle cx={18} cy={-15} r={2.5} fill="#1a2744" />
      <circle cx={18} cy={15} r={2.5} fill="#1a2744" />
      <line x1={18} y1={-15} x2={30} y2={-15} stroke="#1a2744" strokeWidth={2} />
      <line x1={18} y1={15} x2={30} y2={15} stroke="#1a2744" strokeWidth={2} />
    </g>
  );
};

const SwDpst: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      {/* Pole 1 */}
      <line x1={-30} y1={-15} x2={-8} y2={-15} stroke="#1a2744" strokeWidth={2} />
      {closed
        ? <line x1={-8} y1={-15} x2={8} y2={-15} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-8} y1={-15} x2={8} y2={-25} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={8} y1={-15} x2={30} y2={-15} stroke="#1a2744" strokeWidth={2} />
      {/* Pole 2 */}
      <line x1={-30} y1={15} x2={-8} y2={15} stroke="#1a2744" strokeWidth={2} />
      {closed
        ? <line x1={-8} y1={15} x2={8} y2={15} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-8} y1={15} x2={8} y2={5} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={8} y1={15} x2={30} y2={15} stroke="#1a2744" strokeWidth={2} />
      {/* Mechanical link */}
      <line x1={0} y1={-15} x2={0} y2={15} stroke="#1a2744" strokeWidth={1} strokeDasharray="3,2" />
    </g>
  );
};

const SwDpdt: SymbolFC = ({ props }) => {
  const state = props?.state || 'a';
  return (
    <g>
      {/* Pole 1 */}
      <line x1={-35} y1={-15} x2={-8} y2={-15} stroke="#1a2744" strokeWidth={2} />
      {state === 'a'
        ? <line x1={-8} y1={-15} x2={22} y2={-25} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-8} y1={-15} x2={22} y2={-5} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={22} y1={-25} x2={35} y2={-25} stroke="#1a2744" strokeWidth={2} />
      <line x1={22} y1={-5} x2={35} y2={-5} stroke="#1a2744" strokeWidth={2} />
      {/* Pole 2 */}
      <line x1={-35} y1={15} x2={-8} y2={15} stroke="#1a2744" strokeWidth={2} />
      {state === 'a'
        ? <line x1={-8} y1={15} x2={22} y2={5} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-8} y1={15} x2={22} y2={25} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={22} y1={5} x2={35} y2={5} stroke="#1a2744" strokeWidth={2} />
      <line x1={22} y1={25} x2={35} y2={25} stroke="#1a2744" strokeWidth={2} />
      <line x1={0} y1={-15} x2={0} y2={15} stroke="#1a2744" strokeWidth={1} strokeDasharray="3,2" />
    </g>
  );
};

const PbNo: SymbolFC = ({ props }) => {
  const pressed = props?.state === 'pressed';
  return (
    <g>
      <line x1={-20} y1={0} x2={-6} y2={0} stroke="#1a2744" strokeWidth={2} />
      {pressed
        ? <line x1={-6} y1={0} x2={6} y2={0} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-6} y1={0} x2={6} y2={-10} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={6} y1={0} x2={20} y2={0} stroke="#1a2744" strokeWidth={2} />
      {/* Actuator */}
      <line x1={0} y1={pressed ? -12 : -16} x2={0} y2={-20} stroke="#1a2744" strokeWidth={2} />
      <line x1={-6} y1={-20} x2={6} y2={-20} stroke="#1a2744" strokeWidth={2} />
      <circle cx={-6} cy={0} r={2} fill="#1a2744" />
      <circle cx={6} cy={0} r={2} fill="#1a2744" />
    </g>
  );
};

const PbNc: SymbolFC = ({ props }) => {
  const pressed = props?.state === 'pressed';
  return (
    <g>
      <line x1={-20} y1={0} x2={-6} y2={0} stroke="#1a2744" strokeWidth={2} />
      {pressed
        ? <line x1={-6} y1={0} x2={6} y2={-10} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-6} y1={0} x2={6} y2={0} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={6} y1={0} x2={20} y2={0} stroke="#1a2744" strokeWidth={2} />
      <line x1={0} y1={pressed ? -12 : -16} x2={0} y2={-20} stroke="#1a2744" strokeWidth={2} />
      <line x1={-6} y1={-20} x2={6} y2={-20} stroke="#1a2744" strokeWidth={2} />
      {/* NC diagonal bar */}
      <line x1={-4} y1={-14} x2={4} y2={-14} stroke="#1a2744" strokeWidth={1.5} />
      <circle cx={-6} cy={0} r={2} fill="#1a2744" />
      <circle cx={6} cy={0} r={2} fill="#1a2744" />
    </g>
  );
};

// ─── PROTECTION ───────────────────────────────────────────────────────────────

const RelaySpst: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-25} /> : <><rect x={-20} y={-35} width={40} height={20} fill="white" stroke="#1a2744" strokeWidth={2} rx={2} /><path d="M -14,-35 Q -10,-45 -6,-35 Q -2,-45 2,-35 Q 6,-45 10,-35 Q 14,-45 18,-35" fill="none" stroke="#1a2744" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-25} x2={-20} y2={-25} stroke="#1a2744" strokeWidth={2} />
    <line x1={20} y1={-25} x2={30} y2={-25} stroke="#1a2744" strokeWidth={2} />
    {/* Contact */}
    <line x1={-30} y1={35} x2={-8} y2={35} stroke="#1a2744" strokeWidth={2} />
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={35} x2={8} y2={35} stroke="#1a2744" strokeWidth={2} />
      : <line x1={-8} y1={35} x2={8} y2={25} stroke="#1a2744" strokeWidth={2} />
    }
    <line x1={8} y1={35} x2={30} y2={35} stroke="#1a2744" strokeWidth={2} />
    <circle cx={-8} cy={35} r={2.5} fill="#1a2744" />
    <circle cx={8} cy={35} r={2.5} fill="#1a2744" />
  </g>
);

const Fuse: SymbolFC = () => (
  <g>
    <line x1={-25} y1={0} x2={-12} y2={0} stroke="#1a2744" strokeWidth={2} />
    <rect x={-12} y={-8} width={24} height={16} fill="white" stroke="#1a2744" strokeWidth={2} rx={3} />
    <line x1={-8} y1={0} x2={8} y2={0} stroke="#1a2744" strokeWidth={1.5} strokeDasharray="3,2" />
    <line x1={12} y1={0} x2={25} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const CircuitBreaker: SymbolFC = ({ props }) => {
  const tripped = props?.state === 'tripped';
  return (
    <g>
      <line x1={-25} y1={0} x2={-8} y2={0} stroke="#1a2744" strokeWidth={2} />
      {tripped
        ? <line x1={-8} y1={0} x2={8} y2={-12} stroke="#1a2744" strokeWidth={2} />
        : <line x1={-8} y1={0} x2={8} y2={0} stroke="#1a2744" strokeWidth={2} />
      }
      <line x1={8} y1={0} x2={25} y2={0} stroke="#1a2744" strokeWidth={2} />
      {/* Breaker symbol */}
      <rect x={-8} y={-8} width={16} height={16} fill="none" stroke="#1a2744" strokeWidth={1.5} rx={2} />
      <circle cx={-8} cy={0} r={2.5} fill="#1a2744" />
      <circle cx={8} cy={0} r={2.5} fill="#1a2744" />
    </g>
  );
};

const Contactor: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-25} x2={25} y={-50} /> : <><rect x={-25} y={-60} width={50} height={20} fill="white" stroke="#1a2744" strokeWidth={2} rx={2} /><path d="M -18,-60 Q -14,-70 -10,-60 Q -6,-70 -2,-60 Q 2,-70 6,-60 Q 10,-70 14,-60 Q 18,-70 22,-60" fill="none" stroke="#1a2744" strokeWidth={1.5} /></>}
    <line x1={-40} y1={-50} x2={-25} y2={-50} stroke="#1a2744" strokeWidth={2} />
    <line x1={25} y1={-50} x2={40} y2={-50} stroke="#1a2744" strokeWidth={2} />
    {/* Main contacts L1-T1, L2-T2, L3-T3 */}
    {[0, 20, 40].map((y, i) => (
      <g key={i}>
        <line x1={-40} y1={y} x2={-12} y2={y} stroke="#1a2744" strokeWidth={2} />
        {relayContactClosed(powered, props)
          ? <line x1={-12} y1={y} x2={12} y2={y} stroke="#1a2744" strokeWidth={2} />
          : <line x1={-12} y1={y} x2={12} y2={y - 8} stroke="#1a2744" strokeWidth={2} />
        }
        <line x1={12} y1={y} x2={40} y2={y} stroke="#1a2744" strokeWidth={2} />
      </g>
    ))}
    {/* Auxiliary NO 13-14 */}
    <line x1={-40} y1={50} x2={-12} y2={50} stroke="#1a2744" strokeWidth={1.5} />
    {relayContactClosed(powered, props) ? <line x1={-12} y1={50} x2={12} y2={50} stroke="#1a2744" strokeWidth={1.5} /> : <line x1={-12} y1={50} x2={12} y2={42} stroke="#1a2744" strokeWidth={1.5} />}
    <line x1={12} y1={50} x2={40} y2={50} stroke="#1a2744" strokeWidth={1.5} />
    {/* Auxiliary NC 21-22 */}
    <line x1={-40} y1={65} x2={-12} y2={65} stroke="#1a2744" strokeWidth={1.5} />
    {!relayContactClosed(powered, props) ? <line x1={-12} y1={65} x2={12} y2={65} stroke="#1a2744" strokeWidth={1.5} /> : <line x1={-12} y1={65} x2={12} y2={57} stroke="#1a2744" strokeWidth={1.5} />}
    <line x1={12} y1={65} x2={40} y2={65} stroke="#1a2744" strokeWidth={1.5} />
  </g>
);

// ─── TRANSFORMERS ─────────────────────────────────────────────────────────────

const Transformer: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-35} y1={-20} x2={-24} y2={-20} stroke="#1a2744" strokeWidth={2} />
  <line x1={-35} y1={20} x2={-24} y2={20} stroke="#1a2744" strokeWidth={2} />
  <SemicircularVerticalCoil x={-24} y1={-20} y2={20} bulge={12} />
  <SemicircularVerticalCoil x={24} y1={-20} y2={20} bulge={-12} />
  <line x1={24} y1={-20} x2={35} y2={-20} stroke="#1a2744" strokeWidth={2} />
  <line x1={24} y1={20} x2={35} y2={20} stroke="#1a2744" strokeWidth={2} />
  <line x1={-6} y1={-25} x2={-6} y2={25} stroke="#1a2744" strokeWidth={2.5} />
  <line x1={6} y1={-25} x2={6} y2={25} stroke="#1a2744" strokeWidth={2.5} />
</g> : <g>
    {/* Primary coil */}
    {[-20, -8, 4].map((y, i) => (
      <path key={i} d={`M -35,${y} Q -28,${y - 10} -22,${y} Q -16,${y + 10} -10,${y}`} fill="none" stroke="#1a2744" strokeWidth={2} />
    ))}
    <line x1={-35} y1={-20} x2={-35} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={-35} y1={4} x2={-35} y2={20} stroke="#1a2744" strokeWidth={2} />
    {/* Core */}
    <line x1={-6} y1={-25} x2={-6} y2={25} stroke="#1a2744" strokeWidth={3} />
    <line x1={6} y1={-25} x2={6} y2={25} stroke="#1a2744" strokeWidth={3} />
    {/* Secondary coil */}
    {[-20, -8, 4].map((y, i) => (
      <path key={i} d={`M 10,${y} Q 16,${y - 10} 22,${y} Q 28,${y + 10} 35,${y}`} fill="none" stroke="#1a2744" strokeWidth={2} />
    ))}
    <line x1={35} y1={-20} x2={35} y2={-30} stroke="#1a2744" strokeWidth={2} />
    <line x1={35} y1={4} x2={35} y2={20} stroke="#1a2744" strokeWidth={2} />
  </g>
;

const TransformerCt: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-35} y1={-25} x2={-24} y2={-25} stroke="#1a2744" strokeWidth={2} />
  <line x1={-35} y1={25} x2={-24} y2={25} stroke="#1a2744" strokeWidth={2} />
  <SemicircularVerticalCoil x={-24} y1={-25} y2={25} bulge={12} />
  <SemicircularVerticalCoil x={24} y1={-25} y2={25} bulge={-12} />
  <line x1={24} y1={-25} x2={35} y2={-25} stroke="#1a2744" strokeWidth={2} />
  <line x1={24} y1={0} x2={35} y2={0} stroke="#1a2744" strokeWidth={2} />
  <line x1={24} y1={25} x2={35} y2={25} stroke="#1a2744" strokeWidth={2} />
  <line x1={-6} y1={-30} x2={-6} y2={30} stroke="#1a2744" strokeWidth={2.5} />
  <line x1={6} y1={-30} x2={6} y2={30} stroke="#1a2744" strokeWidth={2.5} />
</g> : <g>
    {[-25, -10, 5].map((y, i) => (
      <path key={i} d={`M -35,${y} Q -28,${y - 10} -22,${y} Q -16,${y + 10} -10,${y}`} fill="none" stroke="#1a2744" strokeWidth={2} />
    ))}
    <line x1={-35} y1={-25} x2={-35} y2={-35} stroke="#1a2744" strokeWidth={2} />
    <line x1={-35} y1={5} x2={-35} y2={25} stroke="#1a2744" strokeWidth={2} />
    <line x1={-6} y1={-30} x2={-6} y2={30} stroke="#1a2744" strokeWidth={3} />
    <line x1={6} y1={-30} x2={6} y2={30} stroke="#1a2744" strokeWidth={3} />
    {[-25, -10, 5].map((y, i) => (
      <path key={i} d={`M 10,${y} Q 16,${y - 10} 22,${y} Q 28,${y + 10} 35,${y}`} fill="none" stroke="#1a2744" strokeWidth={2} />
    ))}
    <line x1={35} y1={-25} x2={35} y2={-35} stroke="#1a2744" strokeWidth={2} />
    {/* Center tap */}
    <line x1={35} y1={-10} x2={45} y2={-10} stroke="#1a2744" strokeWidth={2} />
    <line x1={35} y1={5} x2={35} y2={25} stroke="#1a2744" strokeWidth={2} />
  </g>
;

const Autotransformer: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-30} y1={-25} x2={-10} y2={-25} stroke="#1a2744" strokeWidth={2} />
  <line x1={-30} y1={25} x2={-10} y2={25} stroke="#1a2744" strokeWidth={2} />
  <SemicircularVerticalCoil x={-10} y1={-25} y2={25} bulge={12} />
  <line x1={-10} y1={-25} x2={30} y2={-25} stroke="#1a2744" strokeWidth={2} />
  <line x1={-10} y1={25} x2={30} y2={25} stroke="#1a2744" strokeWidth={2} />
  <line x1={2} y1={0} x2={18} y2={0} stroke="#1a2744" strokeWidth={2} />
  <circle cx={2} cy={0} r={2.2} fill="#1a2744" />
</g> : <g>
    {[-25, -10, 5].map((y, i) => (
      <path key={i} d={`M -30,${y} Q -22,${y - 10} -15,${y} Q -8,${y + 10} 0,${y}`} fill="none" stroke="#1a2744" strokeWidth={2} />
    ))}
    <line x1={-30} y1={-25} x2={-30} y2={-35} stroke="#1a2744" strokeWidth={2} />
    <line x1={-30} y1={5} x2={-30} y2={25} stroke="#1a2744" strokeWidth={2} />
    {/* Tap */}
    <line x1={0} y1={-10} x2={30} y2={-10} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={5} x2={30} y2={5} stroke="#1a2744" strokeWidth={2} />
  </g>
;

// ─── POWER SEMICONDUCTORS ─────────────────────────────────────────────────────

const Scr: SymbolFC = () => (
  <g>
    {/* Anode-cathode vertical */}
    <line x1={0} y1={-30} x2={0} y2={-10} stroke="#1a2744" strokeWidth={2} />
    <polygon points="-10,-10 10,-10 0,10" fill="white" stroke="#1a2744" strokeWidth={2} />
    <line x1={-12} y1={10} x2={12} y2={10} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={10} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
    {/* Gate */}
    <line x1={-20} y1={15} x2={0} y2={15} stroke="#1a2744" strokeWidth={2} />
    {/* Cathode bar extensions (SCR marker) */}
    <line x1={10} y1={10} x2={16} y2={16} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const Diac: SymbolFC = () => (
  <g>
    <line x1={-20} y1={0} x2={-8} y2={0} stroke="#1a2744" strokeWidth={2} />
    {/* Two back-to-back triangles */}
    <polygon points="-8,-10 -8,10 8,0" fill="white" stroke="#1a2744" strokeWidth={2} />
    <polygon points="8,-10 8,10 -8,0" fill="white" stroke="#1a2744" strokeWidth={2} />
    <line x1={-8} y1={-12} x2={-8} y2={12} stroke="#1a2744" strokeWidth={2} />
    <line x1={8} y1={-12} x2={8} y2={12} stroke="#1a2744" strokeWidth={2} />
    <line x1={8} y1={0} x2={20} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const Triac: SymbolFC = () => (
  <g>
    <line x1={0} y1={-30} x2={0} y2={-10} stroke="#1a2744" strokeWidth={2} />
    <polygon points="-10,-10 10,-10 0,10" fill="white" stroke="#1a2744" strokeWidth={2} />
    <polygon points="-10,10 10,10 0,-10" fill="white" stroke="#1a2744" strokeWidth={2} />
    <line x1={-12} y1={-10} x2={12} y2={-10} stroke="#1a2744" strokeWidth={2} />
    <line x1={-12} y1={10} x2={12} y2={10} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={10} x2={0} y2={30} stroke="#1a2744" strokeWidth={2} />
    <line x1={-20} y1={15} x2={0} y2={15} stroke="#1a2744" strokeWidth={2} />
  </g>
);

// ─── MOTORS & LAMPS ───────────────────────────────────────────────────────────

const MotorDc: SymbolFC = ({ powered, animTime = 0 }) => {
  const angle = powered ? animTime * 360 : 0;
  return (
    <g>
      <circle cx={0} cy={0} r={25} fill="white" stroke="#1a2744" strokeWidth={2} />
      <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#1a2744">M</text>
      {/* Rotating indicator */}
      {powered && (
        <line
          x1={0} y1={0}
          x2={18 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={18 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke="#08b58d" strokeWidth={2.5}
        />
      )}
      <line x1={-30} y1={0} x2={-25} y2={0} stroke="#1a2744" strokeWidth={2} />
      <line x1={25} y1={0} x2={30} y2={0} stroke="#1a2744" strokeWidth={2} />
    </g>
  );
};

const Motor3Phase: SymbolFC = ({ powered, animTime = 0 }) => {
  const angle = powered ? animTime * 360 : 0;
  return (
    <g>
      <circle cx={0} cy={0} r={28} fill="white" stroke="#1a2744" strokeWidth={2} />
      <text x={0} y={5} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#1a2744">3~M</text>
      {powered && (
        <line
          x1={0} y1={0}
          x2={20 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={20 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke="#08b58d" strokeWidth={2.5}
        />
      )}
      <line x1={-30} y1={-20} x2={-28} y2={-20} stroke="#1a2744" strokeWidth={2} />
      <line x1={-30} y1={0} x2={-28} y2={0} stroke="#1a2744" strokeWidth={2} />
      <line x1={-30} y1={20} x2={-28} y2={20} stroke="#1a2744" strokeWidth={2} />
      <line x1={28} y1={0} x2={30} y2={0} stroke="#1a2744" strokeWidth={2} />
    </g>
  );
};

const Lamp: SymbolFC = ({ powered }) => (
  <g>
    <circle cx={0} cy={0} r={18} fill={powered ? '#fffde0' : 'white'} stroke="#1a2744" strokeWidth={2} />
    <line x1={-12} y1={-12} x2={12} y2={12} stroke="#1a2744" strokeWidth={2} />
    <line x1={12} y1={-12} x2={-12} y2={12} stroke="#1a2744" strokeWidth={2} />
    {powered && <circle cx={0} cy={0} r={22} fill="#ffff80" fillOpacity={0.3} />}
    <line x1={-20} y1={0} x2={-18} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={18} y1={0} x2={20} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>
);

// ─── OP-AMP ───────────────────────────────────────────────────────────────────

const Opamp: SymbolFC = ({ props }) => {
  if (props?._documentedStyle !== true) return <g>
    <polygon points="-30,-30 -30,30 30,0" fill="white" stroke="#1a2744" strokeWidth={2} />
    <line x1={-30} y1={-15} x2={-20} y2={-15} stroke="#1a2744" strokeWidth={2} />
    <text x={-16} y={-11} fontSize={10} fill="#1a2744">+</text>
    <line x1={-30} y1={15} x2={-20} y2={15} stroke="#1a2744" strokeWidth={2} />
    <text x={-16} y={19} fontSize={10} fill="#1a2744">−</text>
    <line x1={30} y1={0} x2={40} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={-30} x2={0} y2={-18} stroke="#1a2744" strokeWidth={1.5} strokeDasharray="3,2" />
    <line x1={0} y1={30} x2={0} y2={18} stroke="#1a2744" strokeWidth={1.5} strokeDasharray="3,2" />
  </g>;
  return <g data-documented-opamp="ieee-boundary-aligned">
    <polygon points="-22,-22 -22,22 26,0" fill="white" stroke="#1a2744" strokeWidth={2} strokeLinejoin="round" />
    <line x1={-DOCUMENTED_GRID_LOCAL} y1={-100 / 6} x2={-22} y2={-100 / 6} stroke="#1a2744" strokeWidth={2} />
    <text x={-25} y={-100 / 6} textAnchor="end" dominantBaseline="middle" fontSize={11} fontWeight={800} fill="#1a2744">−</text>
    <line x1={-DOCUMENTED_GRID_LOCAL} y1={100 / 6} x2={-22} y2={100 / 6} stroke="#1a2744" strokeWidth={2} />
    <text x={-25} y={100 / 6} textAnchor="end" dominantBaseline="middle" fontSize={11} fontWeight={800} fill="#1a2744">+</text>
    <line x1={26} y1={0} x2={DOCUMENTED_GRID_LOCAL} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={-DOCUMENTED_GRID_LOCAL} x2={0} y2={-(11 / 2)} stroke="#1a2744" strokeWidth={1.5} />
    <line x1={0} y1={DOCUMENTED_GRID_LOCAL} x2={0} y2={11 / 2} stroke="#1a2744" strokeWidth={1.5} />
  </g>;
};

// ─── MEASUREMENT ──────────────────────────────────────────────────────────────

const Voltmeter: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2} />
    <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#1a2744">V</text>
    <line x1={-25} y1={0} x2={-22} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={22} y1={0} x2={25} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>
);

const Ammeter: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} fill="white" stroke="#1a2744" strokeWidth={2} />
    <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#1a2744">A</text>
    <line x1={-25} y1={0} x2={-22} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={22} y1={0} x2={25} y2={0} stroke="#1a2744" strokeWidth={2} />
  </g>
);

// ─── RELAY VARIANTS ─────────────────────────────────────────────────────────

const RelaySpdt: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-25} /> : <><rect x={-20} y={-35} width={40} height={20} fill="white" stroke="#1a2744" strokeWidth={2} rx={2} /><path d="M -14,-35 Q -10,-45 -6,-35 Q -2,-45 2,-35 Q 6,-45 10,-35 Q 14,-45 18,-35" fill="none" stroke="#1a2744" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-25} x2={-20} y2={-25} stroke="#1a2744" strokeWidth={2} />
    <line x1={20} y1={-25} x2={30} y2={-25} stroke="#1a2744" strokeWidth={2} />
    {/* Common contact */}
    <line x1={-30} y1={20} x2={-8} y2={20} stroke="#1a2744" strokeWidth={2} />
    {/* Throw A (NO) */}
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={20} x2={8} y2={20} stroke="#1a2744" strokeWidth={2} />
      : <line x1={-8} y1={20} x2={8} y2={10} stroke="#1a2744" strokeWidth={2} />
    }
    <line x1={8} y1={10} x2={30} y2={10} stroke="#1a2744" strokeWidth={2} />
    {/* Throw B (NC) */}
    <line x1={8} y1={30} x2={30} y2={30} stroke="#1a2744" strokeWidth={2} />
    <circle cx={-8} cy={20} r={2.5} fill="#1a2744" />
    <circle cx={8} cy={10} r={2.5} fill="#1a2744" />
    <circle cx={8} cy={30} r={2.5} fill="#1a2744" />
  </g>
);

const RelayDpst: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-40} /> : <><rect x={-20} y={-50} width={40} height={20} fill="white" stroke="#1a2744" strokeWidth={2} rx={2} /><path d="M -14,-50 Q -10,-60 -6,-50 Q -2,-60 2,-50 Q 6,-60 10,-50 Q 14,-60 18,-50" fill="none" stroke="#1a2744" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-40} x2={-20} y2={-40} stroke="#1a2744" strokeWidth={2} />
    <line x1={20} y1={-40} x2={30} y2={-40} stroke="#1a2744" strokeWidth={2} />
    {/* Contact 1 */}
    <line x1={-30} y1={10} x2={-8} y2={10} stroke="#1a2744" strokeWidth={2} />
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={10} x2={8} y2={10} stroke="#1a2744" strokeWidth={2} />
      : <line x1={-8} y1={10} x2={8} y2={0} stroke="#1a2744" strokeWidth={2} />
    }
    <line x1={8} y1={10} x2={30} y2={10} stroke="#1a2744" strokeWidth={2} />
    {/* Contact 2 */}
    <line x1={-30} y1={35} x2={-8} y2={35} stroke="#1a2744" strokeWidth={2} />
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={35} x2={8} y2={35} stroke="#1a2744" strokeWidth={2} />
      : <line x1={-8} y1={35} x2={8} y2={25} stroke="#1a2744" strokeWidth={2} />
    }
    <line x1={8} y1={35} x2={30} y2={35} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={10} x2={0} y2={35} stroke="#1a2744" strokeWidth={1} strokeDasharray="3,2" />
    <circle cx={-8} cy={10} r={2.5} fill="#1a2744" />
    <circle cx={8} cy={10} r={2.5} fill="#1a2744" />
    <circle cx={-8} cy={35} r={2.5} fill="#1a2744" />
    <circle cx={8} cy={35} r={2.5} fill="#1a2744" />
  </g>
);

const DmmSymbol: SymbolFC = ({ props }) => (
  <g>
    <rect x={-34} y={-40} width={68} height={70} rx={8} fill="#303b33" stroke="#1a2744" strokeWidth={2} />
    <rect x={-25} y={-30} width={50} height={22} rx={3} fill="#d8f3dc" stroke="#1a2744" strokeWidth={1} />
    <text x={0} y={-16} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#166534">{String(props?.mode ?? 'DCV')}</text>
    <circle cx={0} cy={8} r={12} fill="#4b5563" stroke="#d1d5db" strokeWidth={1.5} />
    <line x1={-45} y1={35} x2={-18} y2={25} stroke="#1a2744" strokeWidth={2} />
    <line x1={45} y1={35} x2={18} y2={25} stroke="#1a2744" strokeWidth={2} />
    <circle cx={-18} cy={25} r={4} fill="#dc2626" />
    <circle cx={18} cy={25} r={4} fill="#111827" />
  </g>
);

const OscilloscopeSymbol: SymbolFC = () => (
  <g>
    <rect x={-42} y={-38} width={84} height={70} rx={6} fill="#334155" stroke="#1a2744" strokeWidth={2} />
    <rect x={-26} y={-28} width={48} height={35} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
    <path d="M -23,-10 C -16,-27 -8,3 0,-10 S 16,-27 20,-9" fill="none" stroke="#38bdf8" strokeWidth={1.5} />
    {[-30, -10, 10, 30].map((y, index) => <line key={y} x1={-55} y1={y} x2={-42} y2={y} stroke="#1a2744" strokeWidth={2} />)}
    <line x1={55} y1={30} x2={42} y2={24} stroke="#1a2744" strokeWidth={2} />
    <circle cx={42} cy={24} r={4} fill="#111827" />
  </g>
);

const LogicGate: SymbolFC = ({ props }) => {
  const kind = String(props?._kind ?? 'AND').toUpperCase();
  const inverted = kind === 'NOT' || kind === 'NAND' || kind === 'NOR' || kind === 'XNOR';
  const unary = kind === 'NOT';
  return <g>
    <line x1={-35} y1={unary ? 0 : -15} x2={-22} y2={unary ? 0 : -15} stroke="#1a2744" strokeWidth={2} />
    {!unary && <line x1={-35} y1={15} x2={-22} y2={15} stroke="#1a2744" strokeWidth={2} />}
    <path d="M -22,-23 L 5,-23 Q 25,-23 25,0 Q 25,23 5,23 L -22,23 Z" fill="white" stroke="#1a2744" strokeWidth={2} />
    {(kind === 'XOR' || kind === 'XNOR') && <path d="M -27,-23 Q -16,0 -27,23" fill="none" stroke="#1a2744" strokeWidth={1.5} />}
    <text x={0} y={4} textAnchor="middle" fontSize={kind.length > 3 ? 8 : 10} fontWeight={800} fill="#1a2744">{kind}</text>
    {inverted && <circle cx={30} cy={0} r={4} fill="white" stroke="#1a2744" strokeWidth={2} />}
    <line x1={inverted ? 34 : 25} y1={0} x2={35} y2={0} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={23} x2={0} y2={30} stroke="#1a2744" strokeWidth={1.5} strokeDasharray="3,2" />
  </g>;
};

const DigitalInputSymbol: SymbolFC = ({ props }) => <g>
  <rect x={-25} y={-12} width={42} height={24} rx={4} fill="white" stroke="#1a2744" strokeWidth={2} />
  <text x={-4} y={4} textAnchor="middle" fontSize={9} fontWeight={800} fill="#1a2744">{props?.state === 'HIGH' ? '1' : '0'}</text>
  <line x1={17} y1={0} x2={30} y2={0} stroke="#1a2744" strokeWidth={2} /><line x1={-30} y1={15} x2={-12} y2={10} stroke="#1a2744" strokeWidth={1.5} strokeDasharray="3,2" />
</g>;

const DigitalOutputSymbol: SymbolFC = () => <g>
  <rect x={-17} y={-12} width={42} height={24} rx={4} fill="white" stroke="#1a2744" strokeWidth={2} />
  <text x={4} y={4} textAnchor="middle" fontSize={9} fontWeight={800} fill="#1a2744">OUT</text>
  <line x1={-30} y1={0} x2={-17} y2={0} stroke="#1a2744" strokeWidth={2} /><line x1={30} y1={15} x2={12} y2={10} stroke="#1a2744" strokeWidth={1.5} strokeDasharray="3,2" />
</g>;

const RelayDpdt: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-45} /> : <><rect x={-20} y={-55} width={40} height={20} fill="white" stroke="#1a2744" strokeWidth={2} rx={2} /><path d="M -14,-55 Q -10,-65 -6,-55 Q -2,-65 2,-55 Q 6,-65 10,-55 Q 14,-65 18,-55" fill="none" stroke="#1a2744" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-45} x2={-20} y2={-45} stroke="#1a2744" strokeWidth={2} />
    <line x1={20} y1={-45} x2={30} y2={-45} stroke="#1a2744" strokeWidth={2} />
    {/* Pole 1 common */}
    <line x1={-35} y1={5} x2={-8} y2={5} stroke="#1a2744" strokeWidth={2} />
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={5} x2={8} y2={5} stroke="#1a2744" strokeWidth={2} />
      : <line x1={-8} y1={5} x2={8} y2={-5} stroke="#1a2744" strokeWidth={2} />
    }
    <line x1={8} y1={-5} x2={35} y2={-5} stroke="#1a2744" strokeWidth={2} />
    <line x1={8} y1={15} x2={35} y2={15} stroke="#1a2744" strokeWidth={2} />
    {/* Pole 2 common */}
    <line x1={-35} y1={35} x2={-8} y2={35} stroke="#1a2744" strokeWidth={2} />
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={35} x2={8} y2={35} stroke="#1a2744" strokeWidth={2} />
      : <line x1={-8} y1={35} x2={8} y2={25} stroke="#1a2744" strokeWidth={2} />
    }
    <line x1={8} y1={25} x2={35} y2={25} stroke="#1a2744" strokeWidth={2} />
    <line x1={8} y1={45} x2={35} y2={45} stroke="#1a2744" strokeWidth={2} />
    <line x1={0} y1={5} x2={0} y2={35} stroke="#1a2744" strokeWidth={1} strokeDasharray="3,2" />
    <circle cx={-8} cy={5} r={2.5} fill="#1a2744" />
    <circle cx={-8} cy={35} r={2.5} fill="#1a2744" />
  </g>
);

// ─── SYMBOL MAP ───────────────────────────────────────────────────────────────

export const SYMBOL_MAP: Record<string, SymbolFC> = {
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
  'star-resistor-pack': StarResistorPack,
  'delta-resistor-pack': DeltaResistorPack,
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
  'digital-input': DigitalInputSymbol,
  'digital-output': DigitalOutputSymbol,
  'gate-and': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'AND' }} />,
  'gate-or': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'OR' }} />,
  'gate-not': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOT' }} />,
  'gate-nand': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NAND' }} />,
  'gate-nor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'NOR' }} />,
  'gate-xor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XOR' }} />,
  'gate-xnor': (p) => <LogicGate {...p} props={{ ...p.props, _kind: 'XNOR' }} />,
  'voltmeter': Voltmeter,
  'ammeter': Ammeter,
  'dmm': DmmSymbol,
  'oscilloscope': OscilloscopeSymbol,
};

export function renderSymbol(
  symbolId: string,
  powered: boolean,
  props: Record<string, any>,
  animTime: number,
): React.ReactNode {
  const Sym = SYMBOL_MAP[symbolId];
  if (!Sym) return <text x={0} y={5} textAnchor="middle" fontSize={10} fill="#666">?</text>;
  return <Sym powered={powered} props={props} animTime={animTime} />;
}
