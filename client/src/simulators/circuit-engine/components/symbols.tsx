/**
 * ElectroLab – IEEE 315 / IEC 60617 SVG Symbol Renderer
 * Each symbol is drawn centered at (0,0).
 * Terminals are at the exact boundary of the symbol.
 */

import * as React from 'react';
import type { ReactNode, FC } from 'react';

interface SymbolProps {
  powered?: boolean;
  props?: Record<string, any>;
  animTime?: number; // 0..1 for motor rotation etc.
}

type SymbolFC = FC<SymbolProps>;

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

/** Tab D resistor body: the potentiometer's IEEE-style rectangle with no wiper branch. */
function RectangularResistor({ strokeWidth = 2, halfLength = 30, bodyWidth = 40, bodyHeight = 14 }: { strokeWidth?: number; halfLength?: number; bodyWidth?: number; bodyHeight?: number }) {
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

const DcRail: SymbolFC = () => {
  return <g data-documented-dc-rail="positive-reference">
    <line x1={-24} y1={-10} x2={24} y2={-10} stroke="currentColor" strokeWidth={3} strokeLinecap="square" />
    <line x1={0} y1={-10} x2={0} y2={0} stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
  </g>;
};

const ThreePhaseSource: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={22} strokeWidth={2.2} stroke="currentColor" fill="none" />
    <line x1={-36} y1={0} x2={-21} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={22} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={16} y1={-15} x2={31} y2={-25} stroke="currentColor" strokeWidth={2} />
    <line x1={16} y1={15} x2={31} y2={25} stroke="currentColor" strokeWidth={2} />
  </g>
);

const ThreePhaseRail: SymbolFC = () => {
  const x1 = -100 / 3;
  const x2 = 50;
  return <g>
    <line x1={x1} y1={-100 / 3} x2={x2} y2={-100 / 3} stroke="#d14343" strokeWidth={2.2} strokeLinecap="square" />
    <line x1={x1} y1={-50 / 3} x2={x2} y2={-50 / 3} stroke="#d6a720" strokeWidth={2.2} strokeLinecap="square" />
    <line x1={x1} y1={0 / 3} x2={x2} y2={0 / 3} stroke="#2d73b7" strokeWidth={2.2} strokeLinecap="square" />
    <line x1={x1} y1={50 / 3} x2={x2} y2={50 / 3} stroke="currentColor" strokeWidth={1.9} strokeLinecap="square" />
  </g>;
};

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
    <line x1={-30} y1={0} x2={-4} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={-4} y1={-14} x2={-4} y2={14} stroke="currentColor" strokeWidth={2} />
    <line x1={4} y1={-14} x2={4} y2={14} stroke="currentColor" strokeWidth={2} />
    <line x1={4} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

const Inductor: SymbolFC = () => {
  return (
    <g>
      <line x1={-30} y1={0} x2={-20} y2={0} stroke="currentColor" strokeWidth={2} />
      <path
        d="M -20,0 A 5,5 0 0,1 -10,0 A 5,5 0 0,1 0,0 A 5,5 0 0,1 10,0 A 5,5 0 0,1 20,0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <line x1={20} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />
    </g>
  );
};

export const Potentiometer: SymbolFC = ({ props }) => {
  const position = Math.max(0, Math.min(1, Number(props?.wiper ?? 0.5)));
  // مسار حركة الوايبر الأفقي فوق جسم المقاومة
  const wiperX = props?._documentedStyle === true ? 0 : -20 + position * 40;

  return (
    <g data-rigid-body="potentiometer">
      {/* الطرفان الأفقيان الرئيسيان A و B */}
      <line x1={-30} y1={0} x2={-20} y2={0} stroke="currentColor" strokeWidth={2} />
      <rect x={-20} y={-7} width={40} height={14} rx={2} fill="none" stroke="currentColor" strokeWidth={2} />
      <line x1={20} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} />

      {/* ساق الوايبر ممتدة من نقطة التيرمينال المرفوعة y = -30 وصولاً إلى السهم */}
      <line x1={0} y1={-30} x2={wiperX} y2={-11} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      {/* رأس السهم المتجه لأسفل */}
      <polygon points={`${wiperX},${-7} ${wiperX - 4},${-12} ${wiperX + 4},${-12}`} fill="currentColor" />
    </g>
  );
};

const DependentDiamond: SymbolFC = ({ props }) => {
  const currentControlled = String(props?._type) === 'vccs' || String(props?._type) === 'cccs';
  return <g>
    <polygon points="0,-18 18,0 0,18 -18,0" fill="none" stroke="currentColor" strokeWidth={2} />
    {currentControlled ? <><line x1={0} y1={10} x2={0} y2={-10} stroke="currentColor" strokeWidth={2} /><polyline points="-4,-4 0,-10 4,-4" fill="none" stroke="currentColor" strokeWidth={2} /></> : <><text x={0} y={-3} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">+</text><text x={0} y={11} textAnchor="middle" fontSize={14} fontWeight={700} fill="currentColor">−</text></>}
    <line x1={0} y1={-18} x2={0} y2={-30} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={18} x2={0} y2={30} stroke="currentColor" strokeWidth={2} />
  </g>;
};

export const StarResistorPack: SymbolFC = () => {
  // إحداثيات التيرمينالز الحقيقية
  const pRight: [number, number] = [30, 0];
  const pTopLeft: [number, number] = [-15, -30];
  const pBottomLeft: [number, number] = [-15, 30];

  const lenDiag = Math.hypot(15, 30); // ~33.54px
  const angleTop = (Math.atan2(-30, -15) * 180) / Math.PI; // -116.57°
  const angleBottom = (Math.atan2(30, -15) * 180) / Math.PI; // 116.57°

  return (
    <g data-resistor-network="star">
      {/* خطوط أساسية متصلة من نقطة المركز إلى مراكز التيرمينالز لضمان عدم وجود فجوات */}
      <line x1={0} y1={0} x2={pRight[0]} y2={pRight[1]} stroke="currentColor" strokeWidth={1.8} />
      <line x1={0} y1={0} x2={pTopLeft[0]} y2={pTopLeft[1]} stroke="currentColor" strokeWidth={1.8} />
      <line x1={0} y1={0} x2={pBottomLeft[0]} y2={pBottomLeft[1]} stroke="currentColor" strokeWidth={1.8} />

      {/* فرع الطور الأيمن */}
      <g transform={`rotate(0) translate(${15}, 0)`}>
        <RectangularResistor strokeWidth={1.4} halfLength={15} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* فرع الطور العلوي الأيسر */}
      <g transform={`rotate(${angleTop}) translate(${lenDiag / 2}, 0)`}>
        <RectangularResistor strokeWidth={1.4} halfLength={lenDiag / 2} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* فرع الطور السفلي الأيسر */}
      <g transform={`rotate(${angleBottom}) translate(${lenDiag / 2}, 0)`}>
        <RectangularResistor strokeWidth={1.4} halfLength={lenDiag / 2} bodyWidth={13} bodyHeight={4.5} />
      </g>

      {/* عقدة التعادل المركزية (Neutral) */}
      <circle cx={0} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

export const DeltaResistorPack: SymbolFC = () => {
  // إحداثيات الرؤوس الثلاثة المتطابقة مع شبكة الكانفاس والتيرمينالز
  const pTop: [number, number] = [0, -20];
  const pLeft: [number, number] = [-20, 20];
  const pRight: [number, number] = [20, 20];

  // طول الضلع المائل والزوايا
  const lenSide = Math.hypot(20, 40); // ~44.72px
  const halfSide = lenSide / 2;

  const midLeft: [number, number] = [(pTop[0] + pLeft[0]) / 2, (pTop[1] + pLeft[1]) / 2]; // [-10, 0]
  const angleLeft = (Math.atan2(pLeft[1] - pTop[1], pLeft[0] - pTop[0]) * 180) / Math.PI; // ~116.57°

  const midRight: [number, number] = [(pTop[0] + pRight[0]) / 2, (pTop[1] + pRight[1]) / 2]; // [10, 0]
  const angleRight = (Math.atan2(pRight[1] - pTop[1], pRight[0] - pTop[0]) * 180) / Math.PI; // ~63.43°

  const midBottom: [number, number] = [0, 20];

  return (
    <g data-resistor-network="delta">
      {/* الخطوط الواصلة تماماً من المركز للرؤوس لضمان عدم وجود أي فراغ */}
      <line x1={pTop[0]} y1={pTop[1]} x2={pLeft[0]} y2={pLeft[1]} stroke="currentColor" strokeWidth={1.8} />
      <line x1={pTop[0]} y1={pTop[1]} x2={pRight[0]} y2={pRight[1]} stroke="currentColor" strokeWidth={1.8} />
      <line x1={pLeft[0]} y1={pLeft[1]} x2={pRight[0]} y2={pRight[1]} stroke="currentColor" strokeWidth={1.8} />

      {/* الضلع الأيسر */}
      <g transform={`translate(${midLeft[0]}, ${midLeft[1]}) rotate(${angleLeft})`}>
        <RectangularResistor strokeWidth={1.4} halfLength={halfSide} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* الضلع الأيمن */}
      <g transform={`translate(${midRight[0]}, ${midRight[1]}) rotate(${angleRight})`}>
        <RectangularResistor strokeWidth={1.4} halfLength={halfSide} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* الضلع السفلي الأفقي */}
      <g transform={`translate(${midBottom[0]}, ${midBottom[1]}) rotate(0)`}>
        <RectangularResistor strokeWidth={1.4} halfLength={20} bodyWidth={13} bodyHeight={4.5} />
      </g>
    </g>
  );
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
      <line x1={-20} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
      {/* Triangle body: fill="none" by default, or glowColor when powered LED */}
      <polygon points="-8,-10 -8,10 10,0" fill={powered && isLed ? glowColor! : 'none'} fillOpacity={powered && isLed ? emissionOpacity : 1} stroke="currentColor" strokeWidth={2} />
      {/* Cathode bar */}
      {isZener ? (
        <path d="M 10,-12 L 10,12 M 10,-12 L 16,-18 M 10,12 L 4,18" fill="none" stroke="currentColor" strokeWidth={2} />
      ) : (
        <line x1={10} y1={-12} x2={10} y2={12} stroke="currentColor" strokeWidth={2} />
      )}
      <line x1={10} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={2} />
      {/* LED emission arrows */}
      {isLed && (
        <>
          <line x1={14} y1={-14} x2={22} y2={-22} stroke={powered ? glowColor! : 'currentColor'} strokeOpacity={powered ? emissionOpacity : 1} strokeWidth={1.5} markerEnd="url(#arrow)" />
          <line x1={8} y1={-18} x2={16} y2={-26} stroke={powered ? glowColor! : 'currentColor'} strokeOpacity={powered ? emissionOpacity : 1} strokeWidth={1.5} markerEnd="url(#arrow)" />
        </>
      )}
      {/* Photodiode incoming arrows */}
      {isPhoto && (
        <>
          <line x1={22} y1={-22} x2={14} y2={-14} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#arrow)" />
          <line x1={16} y1={-26} x2={8} y2={-18} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#arrow)" />
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

const BjtNpn: SymbolFC = () => (
  <g>
    <line x1={0} y1={-15} x2={0} y2={15} strokeWidth={2.6} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={0} y2={0} stroke="currentColor" strokeWidth={2} />
    <path d="M 0,-10 L 20,-18 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="miter" />
    <path d="M 0,10 L 20,18 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="miter" />
    <polygon points="19,14.5 9,17 9,12" strokeWidth={1} stroke="currentColor" fill="currentColor" transform="rotate(26)" />
  </g>
);

const BjtPnp: SymbolFC = () => (
  <g>
    <line x1={0} y1={-15} x2={0} y2={15} strokeWidth={2.6} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={0} y2={0} stroke="currentColor" strokeWidth={2} />
    <path d="M 0,-10 L 20,-18 L 20,-26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="miter" />
    <path d="M 0,10 L 20,18 L 20,26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="miter" />
    <polygon points="17,14.5 7,17 7,12" strokeWidth={1} stroke="currentColor" fill="currentColor" transform="rotate(206)" />
  </g>
);

const MosfetN: SymbolFC = () => (
  <g>
    <line x1={-2} y1={-18} x2={-2} y2={18} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-18} x2={4} y2={-8} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-5} x2={4} y2={5} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={8} x2={4} y2={18} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={-22} y1={0} x2={-2} y2={0} strokeWidth={2} stroke="currentColor" />
    <line x1={5} y1={-14} x2={25} y2={-14} strokeWidth={2} stroke="currentColor" />
    <line x1={25} y1={-13} x2={25} y2={-22} strokeWidth={2} stroke="currentColor" />
    <line x1={5} y1={13} x2={25} y2={13} strokeWidth={2} stroke="currentColor" />
    <line x1={25} y1={0} x2={25} y2={20} strokeWidth={2} stroke="currentColor" />
    <line x1={9} y1={0} x2={26} y2={0} strokeWidth={2} stroke="currentColor" />
    <polygon points="7,0 13,-3.5 13,3.5" strokeWidth={1} stroke="currentColor" fill="currentColor" />
  </g>
);

const MosfetP: SymbolFC = () => (
  <g>
    <line x1={-2} y1={-18} x2={-2} y2={18} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-18} x2={4} y2={-8} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-5} x2={4} y2={5} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={8} x2={4} y2={18} strokeWidth={2} stroke="currentColor" strokeLinecap="round" />
    <line x1={-22} y1={0} x2={-2} y2={0} strokeWidth={2} stroke="currentColor" />
    <line x1={5} y1={-14} x2={25} y2={-14} strokeWidth={2} stroke="currentColor" />
    <line x1={25} y1={-13} x2={25} y2={-22} strokeWidth={2} stroke="currentColor" />
    <line x1={5} y1={13} x2={25} y2={13} strokeWidth={2} stroke="currentColor" />
    <line x1={25} y1={0} x2={25} y2={20} strokeWidth={2} stroke="currentColor" />
    <line x1={5} y1={0} x2={26} y2={0} strokeWidth={2} stroke="currentColor" />
    <polygon points="15,0 8,-5 8,5" stroke="currentColor" fill="currentColor" />
  </g>
);

const JfetN: SymbolFC = () => (
  <g>
    <line x1={-7} y1={-18} x2={-7} y2={18} strokeWidth={2.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={-7} y1={-13} x2={20} y2={-13} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={-13} x2={20} y2={-22} stroke="currentColor" strokeWidth={2} />
    <line x1={-6} y1={12} x2={20} y2={12} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={11} x2={20} y2={20} stroke="currentColor" strokeWidth={2} />
    <polygon points="-15,-5 -9,0 -15,5" strokeWidth={1} stroke="currentColor" fill="currentColor" />
  </g>
);

const JfetP: SymbolFC = () => (
  <g>
    <line x1={-7} y1={-18} x2={-7} y2={18} strokeWidth={2.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={-7} y1={-13} x2={20} y2={-13} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={-13} x2={20} y2={-22} stroke="currentColor" strokeWidth={2} />
    <line x1={-6} y1={12} x2={20} y2={12} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={11} x2={20} y2={20} stroke="currentColor" strokeWidth={2} />
    <polygon points="-15,-5 -9,0 -15,5" strokeWidth={1} stroke="currentColor" fill="currentColor" transform="rotate(180 -12 0)" />
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
    {relayContactClosed(powered, props)
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
        {relayContactClosed(powered, props)
          ? <line x1={-12} y1={y} x2={12} y2={y} stroke="currentColor" strokeWidth={2} />
          : <line x1={-12} y1={y} x2={12} y2={y - 8} stroke="currentColor" strokeWidth={2} />
        }
        <line x1={12} y1={y} x2={40} y2={y} stroke="currentColor" strokeWidth={2} />
      </g>
    ))}
    {/* Auxiliary NO 13-14 */}
    <line x1={-40} y1={50} x2={-12} y2={50} stroke="currentColor" strokeWidth={1.5} />
    {relayContactClosed(powered, props) ? <line x1={-12} y1={50} x2={12} y2={50} stroke="currentColor" strokeWidth={1.5} /> : <line x1={-12} y1={50} x2={12} y2={42} stroke="currentColor" strokeWidth={1.5} />}
    <line x1={12} y1={50} x2={40} y2={50} stroke="currentColor" strokeWidth={1.5} />
    {/* Auxiliary NC 21-22 */}
    <line x1={-40} y1={65} x2={-12} y2={65} stroke="currentColor" strokeWidth={1.5} />
    {!relayContactClosed(powered, props) ? <line x1={-12} y1={65} x2={12} y2={65} stroke="currentColor" strokeWidth={1.5} /> : <line x1={-12} y1={65} x2={12} y2={57} stroke="currentColor" strokeWidth={1.5} />}
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
  <line x1={-35} y1={4} x2={-35} y2={20} stroke="currentColor" strokeWidth={2} />
  {/* Core */}
  <line x1={-6} y1={-25} x2={-6} y2={25} stroke="currentColor" strokeWidth={3} />
  <line x1={6} y1={-25} x2={6} y2={25} stroke="currentColor" strokeWidth={3} />
  {/* Secondary coil */}
  {[-20, -8, 4].map((y, i) => (
    <path key={i} d={`M 10,${y} Q 16,${y - 10} 22,${y} Q 28,${y + 10} 35,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
  ))}
  <line x1={35} y1={4} x2={35} y2={20} stroke="currentColor" strokeWidth={2} />
</g>;

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
  <line x1={-35} y1={5} x2={-35} y2={25} stroke="currentColor" strokeWidth={2} />
  <line x1={-6} y1={-30} x2={-6} y2={30} stroke="currentColor" strokeWidth={3} />
  <line x1={6} y1={-30} x2={6} y2={30} stroke="currentColor" strokeWidth={3} />
  {[-25, -10, 5].map((y, i) => (
    <path key={i} d={`M 10,${y} Q 16,${y - 10} 22,${y} Q 28,${y + 10} 35,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
  ))}
  {/* Center tap */}
  <line x1={35} y1={-10} x2={45} y2={-10} stroke="currentColor" strokeWidth={2} />
  <line x1={35} y1={5} x2={35} y2={25} stroke="currentColor" strokeWidth={2} />
</g>;

const Autotransformer: SymbolFC = ({ props }) => props?._documentedStyle === true ? <g>
  <line x1={-30} y1={-25} x2={-10} y2={-25} stroke="currentColor" strokeWidth={2} />
  <line x1={-30} y1={25} x2={-10} y2={25} stroke="currentColor" strokeWidth={2} />
  <SemicircularVerticalCoil x={-10} y1={-25} y2={25} bulge={12} />
  <line x1={-10} y1={-25} x2={30} y2={-25} stroke="currentColor" strokeWidth={2} />
  <line x1={-10} y1={25} x2={30} y2={25} stroke="currentColor" strokeWidth={2} />
  <line x1={2} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={2} />
  <circle cx={2} cy={0} r={2.2} fill="currentColor" />
</g> : <g>
  {[-25, -10, 5].map((y, i) => (
    <path key={i} d={`M -30,${y} Q -22,${y - 10} -15,${y} Q -8,${y + 10} 0,${y}`} fill="none" stroke="currentColor" strokeWidth={2} />
  ))}
  <line x1={-30} y1={5} x2={-30} y2={25} stroke="currentColor" strokeWidth={2} />
  {/* Tap */}
  <line x1={0} y1={-10} x2={30} y2={-10} stroke="currentColor" strokeWidth={2} />
  <line x1={0} y1={5} x2={30} y2={5} stroke="currentColor" strokeWidth={2} />
</g>;

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
    <circle cx={0} cy={0} r={18} fill={powered ? '#fffde0' : 'none'} stroke="currentColor" strokeWidth={2} />
    <line x1={-12} y1={-12} x2={12} y2={12} stroke="currentColor" strokeWidth={2} />
    <line x1={12} y1={-12} x2={-12} y2={12} stroke="currentColor" strokeWidth={2} />
    {powered && <circle cx={0} cy={0} r={22} fill="#ffff80" fillOpacity={0.3} />}
    <line x1={-20} y1={0} x2={-18} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={18} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

// ─── OP-AMP ───────────────────────────────────────────────────────────────────

const Opamp: SymbolFC = () => (
  <g>
    <polygon points="-20,-25 30,0 -20,25" fill="none" stroke="currentColor" strokeWidth={2} />
    <line x1={-35} y1={-10} x2={-20} y2={-10} stroke="currentColor" strokeWidth={2} />
    <line x1={-35} y1={10} x2={-20} y2={10} stroke="currentColor" strokeWidth={2} />
    <line x1={-35} y1={-20} x2={-35} y2={-9} stroke="currentColor" strokeWidth={2} />
    <line x1={-35} y1={9} x2={-35} y2={20} stroke="currentColor" strokeWidth={2} />
    <line x1={-15} y1={-10} x2={-10} y2={-10} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-12.5} y1={-12.5} x2={-12.5} y2={-7.5} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-15} y1={10} x2={-10} y2={10} stroke="currentColor" strokeWidth={1.5} />
    <line x1={30} y1={0} x2={35} y2={0} stroke="currentColor" strokeWidth={2} />
  </g>
);

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
    {relayContactClosed(powered, props)
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
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={10} x2={8} y2={10} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={10} x2={8} y2={0} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={10} x2={30} y2={10} stroke="currentColor" strokeWidth={2} />
    {/* Contact 2 */}
    <line x1={-30} y1={35} x2={-8} y2={35} stroke="currentColor" strokeWidth={2} />
    {relayContactClosed(powered, props)
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
    {/* Main Body */}
    <rect x={-35} y={-50} width={70} height={95} rx={8} fill="#2A3033" stroke="#111827" strokeWidth={2} />

    {/* LCD Screen */}
    <rect x={-25} y={-40} width={50} height={22} rx={3} fill="#dcfce7" stroke="#166534" strokeWidth={1} />

    {/* Dial */}
    <circle cx={0} cy={13} r={15} fill="#4b5563" stroke="#9ca3af" strokeWidth={2} />
    <circle cx={0} cy={3} r={2} fill="#d1d5db" />

    {/* Jacks */}
    <circle cx={-25} cy={45} r={4} fill="#ef4444" stroke="#7f1d1d" strokeWidth={1.5} />
    <circle cx={25} cy={45} r={4} fill="#111827" stroke="#000000" strokeWidth={1.5} />

    {/* Labels */}
    <text x={-25} y={36} textAnchor="middle" fontSize={7} fontWeight={600} fontFamily="system-ui, sans-serif" fill="#9ca3af">V/Ω/A</text>
    <text x={25} y={36} textAnchor="middle" fontSize={7} fontWeight={600} fontFamily="system-ui, sans-serif" fill="#9ca3af">COM</text>

    {/* LCD Text */}
    <text x={0} y={-24} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="system-ui, sans-serif" fill="#166534">{String(props?.mode ?? 'DCV')}</text>
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
  return <g>
    <line x1={-35} y1={unary ? 0 : -15} x2={-22} y2={unary ? 0 : -15} stroke="currentColor" strokeWidth={2} />
    {!unary && <line x1={-35} y1={15} x2={-22} y2={15} stroke="currentColor" strokeWidth={2} />}
    <path d="M -22,-23 L 5,-23 Q 25,-23 25,0 Q 25,23 5,23 L -22,23 Z" fill="none" stroke="currentColor" strokeWidth={2} />
    {(kind === 'XOR' || kind === 'XNOR') && <path d="M -27,-23 Q -16,0 -27,23" fill="none" stroke="currentColor" strokeWidth={1.5} />}
    <text x={0} y={4} textAnchor="middle" fontSize={kind.length > 3 ? 8 : 10} fontWeight={800} fill="currentColor">{kind}</text>
    {inverted && <circle cx={30} cy={0} r={4} fill="none" stroke="currentColor" strokeWidth={2} />}
    <line x1={inverted ? 34 : 25} y1={0} x2={35} y2={0} stroke="currentColor" strokeWidth={2} />
    <line x1={0} y1={23} x2={0} y2={30} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
  </g>;
};

const DigitalInputSymbol: SymbolFC = ({ props }) => <g>
  <rect x={-25} y={-12} width={42} height={24} rx={4} fill="none" stroke="currentColor" strokeWidth={2} />
  <text x={-4} y={4} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor">{props?.state === 'HIGH' ? '1' : '0'}</text>
  <line x1={17} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={2} /><line x1={-30} y1={15} x2={-12} y2={10} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
</g>;

const DigitalOutputSymbol: SymbolFC = () => <g>
  <rect x={-17} y={-12} width={42} height={24} rx={4} fill="none" stroke="currentColor" strokeWidth={2} />
  <text x={4} y={4} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor">OUT</text>
  <line x1={-30} y1={0} x2={-17} y2={0} stroke="currentColor" strokeWidth={2} /><line x1={30} y1={15} x2={12} y2={10} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
</g>;

const RelayDpdt: SymbolFC = ({ powered, props }) => (
  <g>
    {/* Coil */}
    {props?._documentedStyle === true ? <SemicircularHorizontalCoil x1={-20} x2={20} y={-45} /> : <><rect x={-20} y={-55} width={40} height={20} fill="none" stroke="currentColor" strokeWidth={2} rx={2} /><path d="M -14,-55 Q -10,-65 -6,-55 Q -2,-65 2,-55 Q 6,-65 10,-55 Q 14,-65 18,-55" fill="none" stroke="currentColor" strokeWidth={1.5} /></>}
    <line x1={-30} y1={-45} x2={-20} y2={-45} stroke="currentColor" strokeWidth={2} />
    <line x1={20} y1={-45} x2={30} y2={-45} stroke="currentColor" strokeWidth={2} />
    {/* Pole 1 common */}
    <line x1={-35} y1={5} x2={-8} y2={5} stroke="currentColor" strokeWidth={2} />
    {relayContactClosed(powered, props)
      ? <line x1={-8} y1={5} x2={8} y2={5} stroke="currentColor" strokeWidth={2} />
      : <line x1={-8} y1={5} x2={8} y2={-5} stroke="currentColor" strokeWidth={2} />
    }
    <line x1={8} y1={-5} x2={35} y2={-5} stroke="currentColor" strokeWidth={2} />
    <line x1={8} y1={15} x2={35} y2={15} stroke="currentColor" strokeWidth={2} />
    {/* Pole 2 common */}
    <line x1={-35} y1={35} x2={-8} y2={35} stroke="currentColor" strokeWidth={2} />
    {relayContactClosed(powered, props)
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
): ReactNode {
  const Sym = SYMBOL_MAP[symbolId];
  if (!Sym) return <text x={0} y={5} textAnchor="middle" fontSize={10} fill="#666">?</text>;
  return <Sym powered={powered} props={props} animTime={animTime} />;
}
