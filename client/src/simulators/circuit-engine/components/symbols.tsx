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

/** The Force State property (never a canvas click, which never applies to relay/contactor bodies) overrides coil sensing. */
function relayContactClosed(powered: boolean | undefined, props?: Record<string, any>): boolean {
  if (props?.manualState === 'closed') return true;
  if (props?.manualState === 'open') return false;
  if (props?.isEnergized !== undefined) return Boolean(props.isEnergized);
  if (props?.state === 'closed') return true;
  return Boolean(powered);
}

/** 
 * Counteracts the 1.5x geometric scale applied by Home.tsx to non-exact CAD components 
 * to ensure the final rendered stroke remains visually exactly 1.5px.
 */
const nonExactStroke = (props?: Record<string, any>) => props?._documentedStyle ? 1 : 1.5;

function SemicircularHorizontalCoil({ x1, x2, y, rise = -10 }: { x1: number; x2: number; y: number; rise?: number }) {
  const step = (x2 - x1) / 4;
  const d = Array.from({ length: 4 }, (_, index) => {
    const start = x1 + index * step;
    const end = start + step;
    return `C ${start},${y + rise} ${end},${y + rise} ${end},${y}`;
  }).join(' ');
  return <path d={`M ${x1},${y} ${d}`} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />;
}

function SemicircularVerticalCoil({ x, y1, y2, bulge }: { x: number; y1: number; y2: number; bulge: number }) {
  const step = (y2 - y1) / 4;
  const d = Array.from({ length: 4 }, (_, index) => {
    const start = y1 + index * step;
    const end = start + step;
    return `C ${x + bulge},${start} ${x + bulge},${end} ${x},${end}`;
  }).join(' ');
  return <path d={`M ${x},${y1} ${d}`} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />;
}

/** Tab D resistor body: the potentiometer's IEEE-style rectangle with no wiper branch. */
function RectangularResistor({ strokeWidth = 1.5, halfLength = 30, bodyWidth = 40, bodyHeight = 14 }: { strokeWidth?: number; halfLength?: number; bodyWidth?: number; bodyHeight?: number }) {
  const bodyStart = -bodyWidth / 2;
  const bodyEnd = bodyWidth / 2;
  return <g data-rectangular-resistor="potentiometer-style">
    <line x1={-halfLength} y1={0} x2={bodyStart} y2={0} stroke="currentColor" strokeWidth={1.5} />
    <rect x={bodyStart} y={-bodyHeight / 2} width={bodyWidth} height={bodyHeight} rx={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <line x1={bodyEnd} y1={0} x2={halfLength} y2={0} stroke="currentColor" strokeWidth={1.5} />
  </g>;
}

// ─── SOURCES ─────────────────────────────────────────────────────────────────

const DcVoltage: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <line x1={-6} y1={-12} x2={6} y2={-12} stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={-18} x2={0} y2={-6} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-6} y1={12} x2={6} y2={12} stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={-33} x2={0} y2={-50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={33} x2={0} y2={50} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

const AcVoltage: SymbolFC = ({ props }) => {
  const wf = (props?.waveform as string) || 'sine';
  const documented = props?._documentedStyle === true;
  const waveSymbols: Record<string, React.ReactNode> = {
    sine: documented
      ? <path d="M -15,2 C -10,-10 -5,-10 0,2 C 5,14 10,14 15,2" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      : <path d="M -15,-8 Q -7.5,-20 0,-8 Q 7.5,4 15,-8" fill="none" stroke="currentColor" strokeWidth={1.5} />,
    square: <path d="M -15,-18 L -15,-3 L 0,-3 L 0,-18 L 15,-18 L 15,-3" fill="none" stroke="currentColor" strokeWidth={1.5} />,
    sawtooth: <path d="M -15,-3 L 0,-18 L 0,-3 L 15,-18" fill="none" stroke="currentColor" strokeWidth={1.5} />,
    triangle: <path d="M -15,-3 L -7.5,-18 L 0,-3 L 7.5,-18 L 15,-3" fill="none" stroke="currentColor" strokeWidth={1.5} />,
  };
  return (
    <g>
      <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {waveSymbols[wf] || null}
      <line x1={0} y1={-33} x2={0} y2={-50} stroke="currentColor" strokeWidth={1.5} />
      <line x1={0} y1={33} x2={0} y2={50} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
};

const DcCurrent: SymbolFC = () => (
  <g>
    <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={18} x2={0} y2={-19} stroke="currentColor" strokeWidth={1.5} />
    <polyline points="-8,-10 0,-20 8,-10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    <line x1={0} y1={-33} x2={0} y2={-50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={33} x2={0} y2={50} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

const AcCurrent: SymbolFC = () => {
  return (
    <g>
      <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <line x1={0} y1={-3} x2={0} y2={-18} stroke="currentColor" strokeWidth={1.5} />
      <polyline points="-6,-10 0,-18 6,-10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M -15,5 C -10,-5 -5,-5 0,5 C 5,15 10,15 15,5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={0} y1={-33} x2={0} y2={-50} stroke="currentColor" strokeWidth={1.5} />
      <line x1={0} y1={33} x2={0} y2={50} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
};

const DcRail: SymbolFC = () => {
  return <g data-documented-dc-rail="positive-reference">
    <line x1={-24} y1={-10} x2={24} y2={-10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" />
    <line x1={0} y1={-10} x2={0} y2={0} stroke="currentColor" strokeWidth={1} strokeLinecap="square" />
  </g>;
};

const ThreePhaseSource: SymbolFC = () => (
  <g>
    <text x={0} y={5} textAnchor="middle" fontSize={16} fontWeight="bold" fill="currentColor">3~</text>
    <line x1={-50} y1={-25} x2={-21.5} y2={-25} stroke="#d14343" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={-50} y1={0} x2={-33} y2={0} stroke="#d6a720" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={-50} y1={25} x2={-21.5} y2={25} stroke="#2d73b7" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={50} y1={0} x2={33} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
  </g>
);

const ThreePhaseRail: SymbolFC = () => {
  const x1 = -50;
  const x2 = 50;
  return <g>
    <line x1={x1} y1={-100 / 3} x2={x2} y2={-100 / 3} stroke="#d14343" strokeWidth={1.5} strokeLinecap="square" />
    <line x1={x1} y1={-50 / 3} x2={x2} y2={-50 / 3} stroke="#d6a720" strokeWidth={1.5} strokeLinecap="square" />
    <line x1={x1} y1={0 / 3} x2={x2} y2={0 / 3} stroke="#2d73b7" strokeWidth={1.5} strokeLinecap="square" />
    <line x1={x1} y1={50 / 3} x2={x2} y2={50 / 3} stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" />
  </g>;
};

const Ground: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
  return (
    <g>
      <line x1={0} y1={-17} x2={0} y2={0} stroke="currentColor" strokeWidth={sw} />
      <line x1={-12} y1={0} x2={12} y2={0} stroke="currentColor" strokeWidth={sw} />
      <line x1={-8} y1={5} x2={8} y2={5} stroke="currentColor" strokeWidth={sw} />
      <line x1={-4} y1={10} x2={4} y2={10} stroke="currentColor" strokeWidth={sw} />
    </g>
  );
};

// ─── PASSIVE ──────────────────────────────────────────────────────────────────

const Resistor: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
  // Boundary ends at exactly ±33.333 so that 33.333 * 1.5 = 50px (Strict 25px Grid Lock)
  return (
    <g data-zigzag-resistor="ansi-style">
      {/* طرف التوصيل الأيسر */}
      <line x1={-33.333} y1={0} x2={-20.5} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />

      {/* مسار الزجزاج (6 قمم وقيعان متناظرة) */}
      <path
        d="M 20 0 
           L 16.667 6 
           L 10 -6 
           L 3.333 6 
           L -3.333 -6 
           L -10 6 
           L -16.667 -6 
           L -20 0"
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* طرف التوصيل الأيمن */}
      <line x1={20.5} y1={0} x2={33.333} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
    </g>
  );
};

const Capacitor: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
  return (
    <g>
      <line x1={-33.333} y1={0} x2={-5} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
      <line x1={-5} y1={-14} x2={-5} y2={14} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
      <line x1={5} y1={-14} x2={5} y2={14} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
      <line x1={5} y1={0} x2={33.333} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
    </g>
  );
};

const Inductor: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
  return (
    <g>
      <line x1={-33.333} y1={0} x2={-20} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
      <path d="M -20,0 A 5,5 0 0,1 -10,0 A 5,5 0 0,1 0,0 A 5,5 0 0,1 10,0 A 5,5 0 0,1 20,0" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <line x1={20} y1={0} x2={33.333} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
    </g>
  );
};

export const Potentiometer: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
  const rawWiper = props?.wiper !== undefined ? Number(props.wiper) : 0.5;
  const position = Math.max(0, Math.min(1, rawWiper > 1 ? rawWiper / 100 : rawWiper));
  const wiperX = -20 + position * 40;
  return (
    <g data-zigzag-potentiometer="ansi-style">
      {/* طرف التوصيل الأيسر */}
      <line x1={-33.333} y1={0} x2={-20.5} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />

      {/* مسار الزجزاج (مطابق للمقاومة) */}
      <path
        d="M 20 0 
           L 16.667 6 
           L 10 -6 
           L 3.333 6 
           L -3.333 -6 
           L -10 6 
           L -16.667 -6 
           L -20 0"
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* طرف التوصيل الأيمن */}
      <line x1={20.5} y1={0} x2={33.333} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />

      {/* سهم الزالق (Wiper) المتحرك ديناميكياً وبشكل مستمر */}
      <line x1={0} y1={-33.333} x2={wiperX} y2={-11} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <polygon points={`${wiperX},${-6.5} ${wiperX - 3.5},${-12} ${wiperX + 3.5},${-12}`} fill="currentColor" />
    </g>
  );
};

const DependentDiamond: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
  const currentControlled = String(props?._type) === 'vccs' || String(props?._type) === 'cccs';
  return (
    <g>
      <polygon points="0,-18 18,0 0,18 -18,0" fill="none" stroke="currentColor" strokeWidth={sw} />
      {currentControlled ? (
        <>
          <line x1={0} y1={10} x2={0} y2={-10} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <polyline points="-4,-4 0,-10 4,-4" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          {/* Top Plus */}
          <line x1={0} y1={-13} x2={0} y2={-7} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <line x1={-3} y1={-10} x2={3} y2={-10} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          {/* Bottom Minus */}
          <line x1={-3} y1={10} x2={3} y2={10} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </>
      )}
      <line x1={0} y1={-18} x2={0} y2={-33.333} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
      <line x1={0} y1={18} x2={0} y2={33.333} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
    </g>
  );
};

export const StarResistorPack: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
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
      <line x1={0} y1={0} x2={pRight[0]} y2={pRight[1]} stroke="currentColor" strokeWidth={sw} />
      <line x1={0} y1={0} x2={pTopLeft[0]} y2={pTopLeft[1]} stroke="currentColor" strokeWidth={sw} />
      <line x1={0} y1={0} x2={pBottomLeft[0]} y2={pBottomLeft[1]} stroke="currentColor" strokeWidth={sw} />

      {/* فرع الطور الأيمن */}
      <g transform={`rotate(0) translate(${15}, 0)`}>
        <RectangularResistor strokeWidth={sw} halfLength={15} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* فرع الطور العلوي الأيسر */}
      <g transform={`rotate(${angleTop}) translate(${lenDiag / 2}, 0)`}>
        <RectangularResistor strokeWidth={sw} halfLength={lenDiag / 2} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* فرع الطور السفلي الأيسر */}
      <g transform={`rotate(${angleBottom}) translate(${lenDiag / 2}, 0)`}>
        <RectangularResistor strokeWidth={sw} halfLength={lenDiag / 2} bodyWidth={13} bodyHeight={4.5} />
      </g>

      {/* عقدة التعادل المركزية (Neutral) */}
      <circle cx={0} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

export const DeltaResistorPack: SymbolFC = ({ props }) => {
  const sw = nonExactStroke(props);
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
      <line x1={pTop[0]} y1={pTop[1]} x2={pLeft[0]} y2={pLeft[1]} stroke="currentColor" strokeWidth={sw} />
      <line x1={pTop[0]} y1={pTop[1]} x2={pRight[0]} y2={pRight[1]} stroke="currentColor" strokeWidth={sw} />
      <line x1={pLeft[0]} y1={pLeft[1]} x2={pRight[0]} y2={pRight[1]} stroke="currentColor" strokeWidth={sw} />

      {/* الضلع الأيسر */}
      <g transform={`translate(${midLeft[0]}, ${midLeft[1]}) rotate(${angleLeft})`}>
        <RectangularResistor strokeWidth={sw} halfLength={halfSide} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* الضلع الأيمن */}
      <g transform={`translate(${midRight[0]}, ${midRight[1]}) rotate(${angleRight})`}>
        <RectangularResistor strokeWidth={sw} halfLength={halfSide} bodyWidth={13} bodyHeight={4.5} />
      </g>
      {/* الضلع السفلي الأفقي */}
      <g transform={`translate(${midBottom[0]}, ${midBottom[1]}) rotate(0)`}>
        <RectangularResistor strokeWidth={sw} halfLength={20} bodyWidth={13} bodyHeight={4.5} />
      </g>
    </g>
  );
};

const Impedance: SymbolFC = ({ props }) => {

  const sw = nonExactStroke(props);

  // Boundary ends at exactly ±33.333 so that 33.333 * 1.5 = 50px (Strict 25px Grid Lock)

  return (

    <g data-rectangular-resistor="potentiometer-style">

      <line x1={-33.333} y1={0} x2={-20} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />

      <rect x={-20} y={-7} width={40} height={14} rx={2} fill="none" stroke="currentColor" strokeWidth={sw} />

      <line x1={20} y1={0} x2={33.333} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />

    </g>

  );

};



// ─── DIODES ───────────────────────────────────────────────────────────────────

const DiodeBase: SymbolFC = ({ powered, props }) => {
  const sw = nonExactStroke(props);
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
  const emissionOpacity = 0.75 + intensity * 1;

  return (
    <g>
      <line x1={-33.333} y1={0} x2={-8} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
      {/* Triangle body: fill="none" by default, or glowColor when powered LED */}
      <polygon points="-8,-10 -8,10 10,0" fill={powered && isLed ? glowColor! : 'none'} fillOpacity={powered && isLed ? emissionOpacity : 1} stroke="currentColor" strokeWidth={sw} />
      {/* Cathode bar */}
      {isZener ? (
        <path d="M 10,-12 L 10,12 M 10,-12 L 16,-18 M 10,12 L 4,18" fill="none" stroke="currentColor" strokeWidth={sw} />
      ) : (
        <line x1={10} y1={-12} x2={10} y2={12} stroke="currentColor" strokeWidth={sw} />
      )}
      <line x1={10} y1={0} x2={33.333} y2={0} stroke="currentColor" strokeWidth={sw} strokeLinecap="square" />
      {isLed && (
        <>
          <line x1={14} y1={-14} x2={22} y2={-22} stroke={powered ? glowColor! : 'currentColor'} strokeOpacity={powered ? emissionOpacity : 1} strokeWidth={sw} markerEnd="url(#arrow)" />
          <line x1={8} y1={-18} x2={16} y2={-26} stroke={powered ? glowColor! : 'currentColor'} strokeOpacity={powered ? emissionOpacity : 1} strokeWidth={sw} markerEnd="url(#arrow)" />
        </>
      )}
      {isPhoto && (
        <>
          <line x1={22} y1={-22} x2={14} y2={-14} stroke="currentColor" strokeWidth={sw} markerEnd="url(#arrow)" />
          <line x1={16} y1={-26} x2={8} y2={-18} stroke="currentColor" strokeWidth={sw} markerEnd="url(#arrow)" />
        </>
      )}
      {isLed && powered && (
        <circle cx={0} cy={0} r={14 + intensity * 11} fill={glowColor!} fillOpacity={0.04 + intensity * 0.20} pointerEvents="none" />
      )}
    </g>
  );
};

// ─── TRANSISTORS ──────────────────────────────────────────────────────────────

const BjtNpn: SymbolFC = () => (
  <g>
    <line x1={0} y1={-15} x2={0} y2={15} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={0} y2={0} strokeWidth={1.5} stroke="currentColor" />
    <path d="M 0 -10 L 15 -25 L 25 -25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <path d="M 0 10 L 15 25 L 25 25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    {/* Outward pointing arrow at the emitter corner */}
    <polygon points="15,25 9,25 15,19" strokeWidth={1.5} stroke="currentColor" fill="currentColor" />
  </g>
);

const BjtPnp: SymbolFC = () => (
  <g>
    <line x1={0} y1={-15} x2={0} y2={15} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={0} y2={0} strokeWidth={1.5} stroke="currentColor" />
    <path d="M 0 -10 L 15 -25 L 25 -25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <path d="M 0 10 L 15 25 L 25 25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    {/* PNP Arrow: Bottom leg (Emitter), pointing INWARDS towards the base */}
    <polygon points="9,19 15,19 9,25" strokeWidth={1.5} stroke="currentColor" fill="currentColor" />
  </g>
);

const MosfetN: SymbolFC = () => (
  <g>
    <line x1={-2} y1={-18} x2={-2} y2={18} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-18} x2={4} y2={-8} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-5} x2={4} y2={5} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={8} x2={4} y2={18} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={-2.75} y2={0} strokeWidth={1.5} stroke="currentColor" />

    <path d="M 5 -14 L 25 -14 L 25 -25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <path d="M 5 13 L 25 13 L 25 25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />

    {/* Bulk/Substrate to Source vertical connection */}
    <path d="M 5 0 L 25 0 L 25 13" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <polygon points="7,0 13,-3.5 13,3.5" strokeWidth={1.5} stroke="currentColor" fill="currentColor" />
  </g>
);

const MosfetP: SymbolFC = () => (
  <g>
    <line x1={-2} y1={-18} x2={-2} y2={18} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-18} x2={4} y2={-8} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={-5} x2={4} y2={5} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={4} y1={8} x2={4} y2={18} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={-2.75} y2={0} strokeWidth={1.5} stroke="currentColor" />

    <path d="M 5 -14 L 25 -14 L 25 -25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <path d="M 5 13 L 25 13 L 25 25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />

    {/* Bulk line with the vertical Substrate-to-Source connection */}
    <path d="M 5 0 L 25 0 L 25 13" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <polygon points="15,0 8,-5 8,5" strokeWidth={1.5} stroke="currentColor" fill="currentColor" />
  </g>
);

const JfetN: SymbolFC = () => (
  <g>
    <line x1={-7} y1={-18} x2={-7} y2={20} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={-7.75} y2={0} stroke="currentColor" strokeWidth={1.5} />
    <path d="M -7 -13 L 25 -13 L 25 -25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <path d="M -7 12 L 25 12 L 25 25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <polygon points="-15,-5 -9,0 -15,5" strokeWidth={1.5} stroke="currentColor" fill="currentColor" />
  </g>
);

const JfetP: SymbolFC = () => (
  <g>
    <line x1={-7} y1={-18} x2={-7} y2={18} strokeWidth={1.5} stroke="currentColor" strokeLinecap="round" />
    <line x1={-25} y1={0} x2={-7.75} y2={0} stroke="currentColor" strokeWidth={1.5} />
    <path d="M -7 -13 L 25 -13 L 25 -25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <path d="M -6 12 L 25 12 L 25 25" strokeWidth={1.5} fill="none" stroke="currentColor" strokeLinejoin="miter" />
    <polygon points="-13,-5 -7,0 -13,5" strokeWidth={1.5} stroke="currentColor" fill="currentColor" transform="rotate(180 -12 0)" />
  </g>
);

// ─── SWITCHES ─────────────────────────────────────────────────────────────────

const SwSpstNo: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-10} y1={0} x2={8} y2={closed ? 0 : -10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={10} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

const SwSpstNc: SymbolFC = ({ props }) => {
  const open = props?.state === 'open';
  return (
    <g>
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-10} y1={0} x2={8} y2={open ? -10 : 0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={10} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

const SwSpdt: SymbolFC = ({ props }) => {
  const state = props?.state || 'a';
  return (
    <g>
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <line x1={25} y1={0} x2={10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
      <line x1={25} y1={25} x2={10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={25} r={2.5} fill="currentColor" />
      <line x1={-10} y1={0} x2={8} y2={state === 'a' ? 0 : 25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
};

const SwDpst: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      {/* Top Pole */}
      <line x1={-25} y1={-25} x2={-10} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={-25} r={2.5} fill="currentColor" />
      <line x1={25} y1={-25} x2={10} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={-25} r={2.5} fill="currentColor" />
      <line x1={-10} y1={-25} x2={8} y2={closed ? -25 : -35} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Bottom Pole */}
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <line x1={25} y1={0} x2={10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
      <line x1={-10} y1={0} x2={8} y2={closed ? 0 : -10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Linkage */}
      <line x1={0} y1={-25} x2={0} y2={0} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,3" />
    </g>
  );
};

const SwDpdt: SymbolFC = ({ props }) => {
  const state = props?.state || 'a';
  return (
    <g>
      {/* Pole 1 */}
      <line x1={-25} y1={-25} x2={-10} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={-25} r={2.5} fill="currentColor" />
      <line x1={25} y1={-25} x2={10} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={-25} r={2.5} fill="currentColor" />
      <line x1={25} y1={0} x2={10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
      <line x1={-10} y1={-25} x2={8} y2={state === 'a' ? -25 : 0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Pole 2 */}
      <line x1={-25} y1={25} x2={-10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={25} r={2.5} fill="currentColor" />
      <line x1={25} y1={25} x2={10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={25} r={2.5} fill="currentColor" />
      <line x1={25} y1={50} x2={10} y2={50} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={50} r={2.5} fill="currentColor" />
      <line x1={-10} y1={25} x2={8} y2={state === 'a' ? 25 : 50} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      <line x1={0} y1={-12.5} x2={0} y2={37.5} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,3" />
    </g>
  );
};

const PbNo: SymbolFC = ({ props }) => {
  const pressed = props?.state === 'pressed';
  return (
    <g>
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={10} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
      <line x1={-12} y1={pressed ? -2.5 : -10} x2={12} y2={pressed ? -2.5 : -10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={0} y1={pressed ? -2.5 : -10} x2={0} y2={pressed ? -12 : -20} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
};

const PbNc: SymbolFC = ({ props }) => {
  const pressed = props?.state === 'pressed';
  return (
    <g>
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={10} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
      <line x1={-12} y1={pressed ? 10 : 2.5} x2={12} y2={pressed ? 10 : 2.5} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={0} y1={pressed ? 10 : 2.5} x2={0} y2={pressed ? -2 : -10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
};

const AuxContactNo: SymbolFC = ({ powered, props }) => {
  const isClosed = Boolean(powered || props?.isEnergized || props?.state === 'closed');
  return (
    <g>
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-10} y1={0} x2={8} y2={isClosed ? 0 : -10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={10} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

const AuxContactNc: SymbolFC = ({ powered, props }) => {
  const isClosed = !Boolean(powered || props?.isEnergized || props?.state === 'open');
  return (
    <g>
      <line x1={-25} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-10} y1={0} x2={8} y2={isClosed ? 0 : -10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={10} y1={0} x2={25} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
    </g>
  );
};

// ─── PROTECTION ───────────────────────────────────────────────────────────────

const Fuse: SymbolFC = () => (
  <g>
    <rect x={-15} y={-6} width={30} height={12} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <line x1={-50} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

const Fuse3Phase: SymbolFC = () => (
  <g>
    {[-25, 0, 25].map(y => (
      <g key={y}>
        <rect x={-15} y={y - 6} width={30} height={12} fill="none" stroke="currentColor" strokeWidth={1.5} />
        <line x1={-50} y1={y} x2={50} y2={y} stroke="currentColor" strokeWidth={1.5} />
      </g>
    ))}
  </g>
);

const CircuitBreaker: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      <line x1={-50} y1={0} x2={-22.5} y2={0} stroke="currentColor" strokeWidth={1.5} />
      <line x1={22.5} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
      <circle cx={-20} cy={0} r={2.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={20} cy={0} r={2.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {closed ? (
        <line x1={-17.5} y1={0} x2={17.5} y2={0} stroke="currentColor" strokeWidth={1.5} />
      ) : (
        <path d="M -20,-5 Q 0,-15 20,-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      )}
    </g>
  );
};

const CircuitBreaker3Phase: SymbolFC = ({ props }) => {
  const closed = props?.state === 'closed';
  return (
    <g>
      {[-25, 0, 25].map((y) => (
        <g key={y}>
          <line x1={-50} y1={y} x2={-22.5} y2={y} stroke="currentColor" strokeWidth={1.5} />
          <line x1={22.5} y1={y} x2={50} y2={y} stroke="currentColor" strokeWidth={1.5} />
          <circle cx={-20} cy={y} r={2.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
          <circle cx={20} cy={y} r={2.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
          {closed ? (
            <line x1={-17.5} y1={y} x2={17.5} y2={y} stroke="currentColor" strokeWidth={1.5} />
          ) : (
            <path d={`M -20,${y - 5} Q 0,${y - 15} 20,${y - 5}`} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          )}
        </g>
      ))}
      <line x1={0} y1={-25} x2={0} y2={25} stroke="currentColor" strokeWidth={1.5} strokeDasharray="4,4" />
    </g>
  );
};

const RelaySpst: SymbolFC = ({ powered, props }) => {
  const isEnergized = relayContactClosed(powered, props);
  const isNC = String(props?.contactType ?? 'NO').toUpperCase() === 'NC';
  const isClosed = isNC ? !isEnergized : isEnergized;
  return (
    <g>
      <rect x={-35} y={-35} width={70} height={70} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4,3" rx={4} />
      <path d="M -20,-25 A 5,5 0 0,0 -10,-25 A 5,5 0 0,0 0,-25 A 5,5 0 0,0 10,-25 A 5,5 0 0,0 20,-25" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-50} y1={-25} x2={-20} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={20} y1={-25} x2={50} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Switch Contact (Bottom) */}
      <line x1={-50} y1={25} x2={-10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={25} r={2.5} fill="currentColor" />
      <line x1={50} y1={25} x2={10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={25} r={2.5} fill="currentColor" />

      {/* Moving Arm: 25 when closed, 15 when open */}
      <line x1={-10} y1={25} x2={8} y2={isClosed ? 25 : 15} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Mechanical Linkage */}
      <line x1={0} y1={-20} x2={0} y2={isClosed ? 25 : 20} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,3" />
    </g>
  );
};

const Contactor: SymbolFC = ({ powered, props }) => {
  const isEnergized = relayContactClosed(powered, props);
  return (
    <g>
      <rect x={-35} y={-60} width={70} height={145} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4,3" rx={4} />
      <path d="M -20,-50 A 5,5 0 0,0 -10,-50 A 5,5 0 0,0 0,-50 A 5,5 0 0,0 10,-50 A 5,5 0 0,0 20,-50" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-50} y1={-50} x2={-20} y2={-50} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={20} y1={-50} x2={50} y2={-50} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Main 3 Poles (L1-T1, L2-T2, L3-T3) + Auxiliary NO (13-14) */}
      {[-25, 0, 25, 50].map(y => (
        <g key={y}>
          <line x1={-50} y1={y} x2={-10} y2={y} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={-10} y1={y} x2={8} y2={isEnergized ? y : y - 10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={10} y1={y} x2={50} y2={y} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          <circle cx={-10} cy={y} r={2.5} fill="currentColor" />
          <circle cx={10} cy={y} r={2.5} fill="currentColor" />
        </g>
      ))}

      {/* Auxiliary NC (21-22) */}
      <g>
        <line x1={-50} y1={75} x2={-10} y2={75} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={-10} y1={75} x2={8} y2={isEnergized ? 65 : 75} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={10} y1={75} x2={50} y2={75} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={-10} cy={75} r={2.5} fill="currentColor" />
        <circle cx={10} cy={75} r={2.5} fill="currentColor" />
      </g>

      {/* Mechanical Linkage */}
      <line x1={0} y1={-40} x2={0} y2={isEnergized ? 75 : 69} stroke="currentColor" strokeWidth={1.5} strokeDasharray="4,3" />
    </g>
  );
};

// ─── TRANSFORMERS ─────────────────────────────────────────────────────────────

const Transformer: SymbolFC = () => (
  <g>
    {/* Core Lines */}
    <line x1={-4} y1={-30} x2={-4} y2={30} stroke="currentColor" strokeWidth={1.5} />
    <line x1={4} y1={-30} x2={4} y2={30} stroke="currentColor" strokeWidth={1.5} />

    {/* Primary Coil (Left) & Wires stretched to corners */}
    <path d="M -20,-20 A 5,5 0 0,0 -20,-10 A 5,5 0 0,0 -20,0 A 5,5 0 0,0 -20,10 A 5,5 0 0,0 -20,20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" transform="rotate(180 -20 0)" />
    <line x1={-20} y1={-20} x2={-20} y2={-50.7} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-20} y1={-50} x2={-50} y2={-50} stroke="currentColor" strokeWidth={1.5} />

    <line x1={-20} y1={20} x2={-20} y2={50.7} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-20} y1={50} x2={-50} y2={50} stroke="currentColor" strokeWidth={1.5} />

    {/* Secondary Coil (Right) & Wires stretched to corners */}
    <path d="M 20,-20 A 5,5 0 0,1 20,-10 A 5,5 0 0,1 20,0 A 5,5 0 0,1 20,10 A 5,5 0 0,1 20,20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" transform="rotate(180 20 0)" />
    <line x1={20} y1={-20} x2={20} y2={-50.7} stroke="currentColor" strokeWidth={1.5} />
    <line x1={20} y1={-50} x2={50} y2={-50} stroke="currentColor" strokeWidth={1.5} />

    <line x1={20} y1={20} x2={20} y2={50.7} stroke="currentColor" strokeWidth={1.5} />
    <line x1={20} y1={50} x2={50} y2={50} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

const TransformerCt: SymbolFC = () => (
  <g>
    {/* Core Lines */}
    <line x1={-4} y1={-30} x2={-4} y2={30} stroke="currentColor" strokeWidth={1.5} />
    <line x1={4} y1={-30} x2={4} y2={30} stroke="currentColor" strokeWidth={1.5} />

    {/* Primary Coil (Left) & Wires stretched to corners */}
    <path d="M -20,-20 A 5,5 0 0,0 -20,-10 A 5,5 0 0,0 -20,0 A 5,5 0 0,0 -20,10 A 5,5 0 0,0 -20,20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" transform="rotate(180 -20 0)" />
    <line x1={-20} y1={-20} x2={-20} y2={-50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-20} y1={-50} x2={-50} y2={-50} stroke="currentColor" strokeWidth={1.5} />

    <line x1={-20} y1={20} x2={-20} y2={50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-20} y1={50} x2={-50} y2={50} stroke="currentColor" strokeWidth={1.5} />

    {/* Secondary Coil (Right) & Wires stretched to corners */}
    <path d="M 20,-20 A 5,5 0 0,1 20,-10 A 5,5 0 0,1 20,0 A 5,5 0 0,1 20,10 A 5,5 0 0,1 20,20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" transform="rotate(180 20 0)" />
    <line x1={20} y1={-20} x2={20} y2={-50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={20} y1={-50} x2={50} y2={-50} stroke="currentColor" strokeWidth={1.5} />

    <line x1={20} y1={20} x2={20} y2={50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={20} y1={50} x2={50} y2={50} stroke="currentColor" strokeWidth={1.5} />

    {/* Center Tap Wire exactly at y=0 */}
    <line x1={20} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

const Autotransformer: SymbolFC = () => (
  <g>
    {/* Input Connections */}
    <line x1={-50} y1={-50} x2={0} y2={-50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-50} y1={50} x2={0} y2={50} stroke="currentColor" strokeWidth={1.5} />

    {/* Single Coil (Arcing Right, 6 bumps to accommodate ±30 bounds) */}
    <path d="M 0,-50 L 0,-30 A 5,5 0 0,1 0,-20 A 5,5 0 0,1 0,-10 A 5,5 0 0,1 0,0 A 5,5 0 0,1 0,10 A 5,5 0 0,1 0,20 A 5,5 0 0,1 0,30 L 0,50" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

    {/* Output Connections (Full bypass) */}
    <line x1={0} y1={-50} x2={50} y2={-50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={50} x2={50} y2={50} stroke="currentColor" strokeWidth={1.5} />


    {/* Tap Connection - Arrow perfectly touches the inward-facing cusp of the arc at (0,0) */}
    <line x1={50} y1={0} x2={0} y2={0} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

// ─── POWER SEMICONDUCTORS ─────────────────────────────────────────────────────

const Scr: SymbolFC = () => (
  <g>
    {/* Anode lead from top 25px grid snap point (0, -25) to diode base at (0, -10) */}
    <line x1={0} y1={-25} x2={0} y2={-10} stroke="currentColor" strokeWidth={1.5} />
    {/* Diode triangle: base at y=-10, apex at y=10 */}
    <polygon points="-10,-10 10,-10 0,10" fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    {/* Cathode barrier bar at y=10 */}
    <line x1={-10} y1={10} x2={10} y2={10} stroke="currentColor" strokeWidth={1.5} />
    {/* Cathode lead from (0, 10) to bottom 25px grid snap point (0, 25) */}
    <line x1={0} y1={10} x2={0} y2={25} stroke="currentColor" strokeWidth={1.5} />
    {/* Gate terminal: angled from cathode at (0, 10) to (-15, 25), then horizontal to (-25, 25) */}
    <path d="M 0,10 L -15,25 L -25,25" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="miter" />
  </g>
);
const Diac: SymbolFC = () => (
  <g>
    {/* Main terminal wires */}
    <line x1={0} y1={-25} x2={0} y2={-10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={0} y1={10} x2={0} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

    {/* Top and bottom horizontal bars */}
    <line x1={-15} y1={-10} x2={15} y2={-10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={-15} y1={10} x2={15} y2={10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

    {/* Left triangle pointing UP (base at bottom, apex at top) */}
    <polygon points="-13,10 1,10 -6.5,-10" fill="currentColor" />

    {/* Right triangle pointing DOWN (base at top, apex at bottom) */}
    <polygon points="-1,-10 13,-10 6.5,10" fill="currentColor" />
  </g>
);

const Triac: SymbolFC = () => (
  <g>
    {/* Main terminal wires */}
    <line x1={0} y1={-25} x2={0} y2={-10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={0} y1={10} x2={0} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

    {/* Top and bottom horizontal bars */}
    <line x1={-15} y1={-10} x2={15} y2={-10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={-15} y1={10} x2={15} y2={10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

    {/* Left triangle pointing UP (base at bottom, apex at top) */}
    <polygon points="-13,10 1,10 -6.5,-10" fill="currentColor" />

    {/* Right triangle pointing DOWN (base at top, apex at bottom) */}
    <polygon points="-1,-10 13,-10 6.5,10" fill="currentColor" />

    {/* Gate terminal connecting smoothly to the bottom bar */}
    <path
      d="M -0,10 L -18,25 L -25,25"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </g>
);

// ─── MOTORS & LAMPS ───────────────────────────────────────────────────────────

const MotorDc: SymbolFC = ({ powered, animTime = 0 }) => {
  const angle = powered ? animTime * 360 : 0;
  return (
    <g>
      <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <text x={0} y={5} textAnchor="middle" fontSize={16} fontWeight="normal" fill="currentColor">M</text>
      {powered && (
        <line x1={0} y1={0} x2={26 * Math.cos((angle - 90) * Math.PI / 180)} y2={26 * Math.sin((angle - 90) * Math.PI / 180)} stroke="#08b58d" strokeWidth={1.5} />
      )}
      <line x1={-50} y1={0} x2={-33} y2={0} stroke="currentColor" strokeWidth={1.5} />
      <line x1={33} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
};

const Motor3Phase: SymbolFC = ({ powered, animTime = 0 }) => {
  const angle = powered ? animTime * 360 : 0;
  return (
    <g>
      <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <text x={0} y={5} textAnchor="middle" fontSize={16} fontWeight="normal" fill="currentColor">M</text>
      {powered && (
        <line x1={0} y1={0} x2={22 * Math.cos((angle - 90) * Math.PI / 180)} y2={22 * Math.sin((angle - 90) * Math.PI / 180)} stroke="#08b58d" strokeWidth={1.5} strokeLinecap="round" />
      )}
      <line x1={-50} y1={-25} x2={-21.5} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-50} y1={0} x2={-33} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={-50} y1={25} x2={-21.5} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={50} y1={0} x2={33} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
};

const Lamp: SymbolFC = ({ powered }) => (
  <g>
    <circle cx={0} cy={0} r={33} fill={powered ? '#fffde0' : 'none'} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-20} y1={-20} x2={20} y2={20} stroke="currentColor" strokeWidth={1.5} />
    <line x1={20} y1={-20} x2={-20} y2={20} stroke="currentColor" strokeWidth={1.5} />
    {powered && <circle cx={0} cy={0} r={40} fill="#ffff80" fillOpacity={0.3} pointerEvents="none" />}
    <line x1={-50} y1={0} x2={-33} y2={0} stroke="currentColor" strokeWidth={1.5} />
    <line x1={33} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
  </g>
);

// ─── OP-AMP ───────────────────────────────────────────────────────────────────

const Opamp: SymbolFC = () => (
  <g>
    {/* Well-proportioned isosceles/equilateral op-amp triangle: apex at (25, 0), flat back wall at x=-20, vertices (-20, -32) and (-20, 32) */}
    <polygon points="-20,-32 -20,32 25,0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    {/* Inverting input lead to terminal IN- at (-50, -25) */}
    <line x1={-50} y1={-25} x2={-20} y2={-25} stroke="currentColor" strokeWidth={1.5} />
    {/* Non-inverting input lead to terminal IN+ at (-50, 25) */}
    <line x1={-50} y1={25} x2={-20} y2={25} stroke="currentColor" strokeWidth={1.5} />
    {/* Output lead to terminal OUT at (50, 0) */}
    <line x1={25} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
    {/* Polarity indicators pushed inward toward the center of the triangle */}
    <text x={-10} y={-18} fontSize={12} fill="currentColor" dominantBaseline="central" textAnchor="middle">-</text>
    <text x={-10} y={18} fontSize={12} fill="currentColor" dominantBaseline="central" textAnchor="middle">+</text>
  </g>
);

// ─── MEASUREMENT ──────────────────────────────────────────────────────────────

// Sub-tolerance solver noise floor, matching VOLTAGE_NOISE_FLOOR/CURRENT_NOISE_FLOOR in
// spiceInstruments.ts (ngspice's own VNTOL/ABSTOL resolution) — a defensive re-clamp so a stray
// ~1e-19 residual from either engine never survives onto the meter face as "-0.000 V".
const METER_NOISE_FLOOR: Record<'V' | 'A', number> = { V: 1e-6, A: 1e-12 };
// Auto-ranging engineering prefixes, largest first, exactly the set the spec calls for: V/mV/µV
// and A/mA/µA — never kV or nA, which this educational simulator's circuits never reach.
const METER_PREFIXES: Record<'V' | 'A', Array<{ scale: number; symbol: string }>> = {
  V: [{ scale: 1, symbol: 'V' }, { scale: 1e-3, symbol: 'mV' }, { scale: 1e-6, symbol: 'µV' }],
  A: [{ scale: 1, symbol: 'A' }, { scale: 1e-3, symbol: 'mA' }, { scale: 1e-6, symbol: 'µA' }],
};

/**
 * Formats a live Voltmeter/Ammeter reading for the circular meter face: engineering-unit
 * auto-scaling with a 4-significant-digit auto-ranging decimal count (the same convention a
 * benchtop DMM uses — "1.500 A", "20.00 mA", "750.2 mV"), and sub-tolerance solver noise clamped to
 * an exact "0.000 <unit>" in the instrument's own base unit.
 */
export function formatMeterReading(value: number, unit: 'V' | 'A'): string {
  const magnitude = Number.isFinite(value) ? value : 0;
  if (Math.abs(magnitude) < METER_NOISE_FLOOR[unit]) return `0.000 ${unit}`;
  const tier = METER_PREFIXES[unit].find(prefix => Math.abs(magnitude) >= prefix.scale)
    ?? METER_PREFIXES[unit][METER_PREFIXES[unit].length - 1];
  const scaled = magnitude / tier.scale;
  const integerDigits = Math.max(1, Math.floor(Math.log10(Math.abs(scaled))) + 1);
  const decimals = Math.max(0, Math.min(3, 4 - integerDigits));
  return `${scaled.toFixed(decimals)} ${tier.symbol}`;
}

// Sized to stay clear of the 33px-radius circular face's perimeter: a formatted reading
// ("750.2 mV") is far longer than the static "V"/"A" fallback glyph, so both the font size and an
// explicit SVG textLength shrink together as the string grows, guaranteeing it never clips.
const METER_FACE_TEXT_WIDTH = 56;
function meterTextMetrics(display: string): { fontSize: number; textLength?: number } {
  if (display.length <= 1) return { fontSize: 20 };
  const fontSize = display.length > 7 ? 10 : display.length > 5 ? 12 : 14;
  const estimatedWidth = display.length * fontSize * 0.62;
  return estimatedWidth > METER_FACE_TEXT_WIDTH ? { fontSize, textLength: METER_FACE_TEXT_WIDTH } : { fontSize };
}

const Voltmeter: SymbolFC = ({ props }) => {
  const display = props?.displayValue != null && String(props.displayValue).trim() !== '' ? String(props.displayValue) : 'V';
  const { fontSize, textLength } = meterTextMetrics(display);
  return (
    <g>
      <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {/* Upright KaTeX_Main typography — never italic, matching \mathrm{…} for digits and unit letters. */}
      <text x={0} y={6} textAnchor="middle" fontSize={fontSize} fontWeight="bold" fontStyle="normal" fontFamily="KaTeX_Main, Times New Roman, serif" {...(textLength ? { textLength, lengthAdjust: 'spacingAndGlyphs' as const } : {})} fill="currentColor">{display}</text>
      <line x1={-50} y1={0} x2={-33} y2={0} stroke="currentColor" strokeWidth={1.5} />
      <line x1={33} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
};

const Ammeter: SymbolFC = ({ props }) => {
  const display = props?.displayValue != null && String(props.displayValue).trim() !== '' ? String(props.displayValue) : 'A';
  const { fontSize, textLength } = meterTextMetrics(display);
  return (
    <g>
      <circle cx={0} cy={0} r={33} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {/* Upright KaTeX_Main typography — never italic, matching \mathrm{…} for digits and unit letters. */}
      <text x={0} y={6} textAnchor="middle" fontSize={fontSize} fontWeight="bold" fontStyle="normal" fontFamily="KaTeX_Main, Times New Roman, serif" {...(textLength ? { textLength, lengthAdjust: 'spacingAndGlyphs' as const } : {})} fill="currentColor">{display}</text>
      <line x1={-50} y1={0} x2={-33} y2={0} stroke="currentColor" strokeWidth={1.5} />
      <line x1={33} y1={0} x2={50} y2={0} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
};

// ─── RELAY VARIANTS ─────────────────────────────────────────────────────────

const RelaySpdt: SymbolFC = ({ powered, props }) => {
  const isEnergized = relayContactClosed(powered, props) || props?.state === 'closed';
  return (
    <g>
      {/* Bounding Box: FULL OPACITY, DASHED */}
      <rect x={-35} y={-35} width={70} height={70} rx={4} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4,3" />

      {/* Coil (Top) */}
      <line x1={-50} y1={-25} x2={-20} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M -20,-25 A 5,5 0 0,0 -10,-25 A 5,5 0 0,0 0,-25 A 5,5 0 0,0 10,-25 A 5,5 0 0,0 20,-25" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={20} y1={-25} x2={50} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* COM Terminal (Left Feed & Pivot Circle) */}
      <line x1={-50} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />

      {/* NC Terminal (Right Feed & Contact Circle) */}
      <line x1={50} y1={0} x2={10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />

      {/* NO Terminal (Right Feed & Contact Circle) */}
      <line x1={50} y1={25} x2={10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={25} r={2.5} fill="currentColor" />

      {/* Switch Arm */}
      <line x1={-10} y1={0} x2={8} y2={isEnergized ? 25 : 0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Mechanical Linkage */}
      <line x1={0} y1={-20} x2={0} y2={isEnergized ? 14 : 0} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,3" />
    </g>
  );
};

const RelayDpst: SymbolFC = ({ powered, props }) => {
  const isEnergized = relayContactClosed(powered, props) || props?.state === 'closed';
  return (
    <g>
      <rect x={-35} y={-35} width={70} height={70} rx={4} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4,3" />

      {/* Coil (Top) */}
      <line x1={-50} y1={-25} x2={-20} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M -20,-25 A 5,5 0 0,0 -10,-25 A 5,5 0 0,0 0,-25 A 5,5 0 0,0 10,-25 A 5,5 0 0,0 20,-25" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={20} y1={-25} x2={50} y2={-25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Pole 1 (Middle) */}
      <line x1={-50} y1={0} x2={-10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={2.5} fill="currentColor" />
      <line x1={50} y1={0} x2={10} y2={0} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={0} r={2.5} fill="currentColor" />
      <line x1={-10} y1={0} x2={8} y2={isEnergized ? 0 : -10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Pole 2 (Bottom) */}
      <line x1={-50} y1={25} x2={-10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-10} cy={25} r={2.5} fill="currentColor" />
      <line x1={50} y1={25} x2={10} y2={25} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={10} cy={25} r={2.5} fill="currentColor" />
      <line x1={-10} y1={25} x2={8} y2={isEnergized ? 25 : 15} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />

      {/* Mechanical Linkage */}
      <line x1={0} y1={-20} x2={0} y2={isEnergized ? 25 : 20} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,3" />
    </g>
  );
};

const DmmSymbol: SymbolFC = ({ props }) => (
  <g>
    {/* Main Body - Height stretched to exactly hit y=50 */}
    <rect x={-35} y={-50} width={70} height={100} rx={6} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />
    {/* Top Header Label - Positioned cleanly ABOVE the main SVG body with KaTeX style & halo effect */}
    <text
      x={0}
      y={-58}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontStyle="italic"
      fontFamily="KaTeX_Math, Times New Roman, serif"
      fill="#0f172a"
      stroke="white"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke fill"
    >
      DMM
    </text>
    {/* LCD Screen */}
    <rect x={-25} y={-38} width={50} height={22} rx={3} fill="#e0f2fe" stroke="#0284c7" strokeWidth={1} />
    {/* Dial */}
    <circle cx={0} cy={16} r={14} fill="#334155" stroke="#475569" strokeWidth={1.5} />
    <circle cx={0} cy={6} r={2} fill="#94a3b8" />
    {/* Buttons */}
    <circle cx={-18} cy={-8} r={3} fill="#475569" />
    <circle cx={18} cy={-8} r={3} fill="#475569" />
    {/* Jacks exactly sitting on the y=50 grid bottom edge */}
    <circle cx={-25} cy={50} r={4} fill="#ef4444" stroke="#7f1d1d" strokeWidth={1.5} />
    <circle cx={25} cy={50} r={4} fill="#0f172a" stroke="#000000" strokeWidth={1.5} />
    {/* LCD Text */}
    <text x={0} y={-27} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="ui-monospace, monospace" fill="#0284c7">{String(props?.mode ?? 'DCV')}</text>
  </g>
);

const OscilloscopeSymbol: SymbolFC = () => (
  <g>
    {/* Main Widescreen Body: 140x100 (leaves 5px for terminals to reach ±75) */}
    <rect x={-70} y={-60} width={140} height={100} rx={6} fill="#1e293b" stroke="#0f172a" strokeWidth={1.5} />

    {/* Dark Screen: clean blank screen */}
    <rect x={-60} y={-50} width={80} height={60} rx={3} fill="#000000" stroke="#334155" strokeWidth={1.5} />

    {/* Screen Grid */}
    <line x1={-20} y1={-50} x2={-20} y2={10} stroke="#1e293b" strokeWidth={1} />
    <line x1={20} y1={-50} x2={20} y2={10} stroke="#1e293b" strokeWidth={1} />
    <line x1={-60} y1={-20} x2={20} y2={-20} stroke="#1e293b" strokeWidth={1} />

    {/* Control Panel Dials */}
    <circle cx={45} cy={-35} r={9} fill="#334155" stroke="#475569" strokeWidth={1.5} />
    <circle cx={45} cy={-41} r={2} fill="#94a3b8" />

    <circle cx={45} cy={-10} r={9} fill="#334155" stroke="#475569" strokeWidth={1.5} />
    <circle cx={45} cy={-16} r={2} fill="#94a3b8" />

    {/* Control Panel Buttons */}
    <circle cx={35} cy={15} r={3} fill="#475569" />
    <circle cx={45} cy={15} r={3} fill="#475569" />
    <circle cx={55} cy={15} r={3} fill="#475569" />

    <circle cx={35} cy={27} r={3} fill="#475569" />
    <circle cx={45} cy={27} r={3} fill="#475569" />
    <circle cx={55} cy={27} r={3} fill="#ef4444" /> {/* Red trigger/power button */}

    {/* Connection lines to exact terminals (spanning -75 to -70 and 70 to 75) */}
    <line x1={-75} y1={-50} x2={-70} y2={-50} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-75} y1={-25} x2={-70} y2={-25} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-75} y1={0} x2={-70} y2={0} stroke="currentColor" strokeWidth={1.5} />
    <line x1={-75} y1={25} x2={-70} y2={25} stroke="currentColor" strokeWidth={1.5} />

    <line x1={70} y1={25} x2={75} y2={25} stroke="currentColor" strokeWidth={1.5} />

    {/* Channel & Ground Port Labels outside screen and body */}
    <text x={-78} y={-50} textAnchor="end" dominantBaseline="central" fontSize={7} fontWeight="normal" fill="#94a3b8">CH1</text>
    <text x={-78} y={-25} textAnchor="end" dominantBaseline="central" fontSize={7} fontWeight="normal" fill="#94a3b8">CH2</text>
    <text x={-78} y={0} textAnchor="end" dominantBaseline="central" fontSize={7} fontWeight="normal" fill="#94a3b8">CH3</text>
    <text x={-78} y={25} textAnchor="end" dominantBaseline="central" fontSize={7} fontWeight="normal" fill="#94a3b8">CH4</text>
    <text x={78} y={25} textAnchor="start" dominantBaseline="central" fontSize={7} fontWeight="normal" fill="#94a3b8">GND</text>
  </g>
);

const LogicGate: SymbolFC = ({ props }) => {
  const kind = String(props?._kind ?? 'AND').toUpperCase();
  const inverted = kind === 'NOT' || kind === 'NAND' || kind === 'NOR' || kind === 'XNOR';
  const unary = kind === 'NOT';
  return <g>
    <line x1={-35} y1={unary ? 0 : -15} x2={-22} y2={unary ? 0 : -15} stroke="currentColor" strokeWidth={1.5} />
    {!unary && <line x1={-35} y1={15} x2={-22} y2={15} stroke="currentColor" strokeWidth={1.5} />}
    <path d="M -22,-23 L 5,-23 Q 25,-23 25,0 Q 25,23 5,23 L -22,23 Z" fill="none" stroke="currentColor" strokeWidth={1.5} />
    {(kind === 'XOR' || kind === 'XNOR') && <path d="M -27,-23 Q -16,0 -27,23" fill="none" stroke="currentColor" strokeWidth={1.5} />}
    <text x={0} y={4} textAnchor="middle" fontSize={kind.length > 3 ? 8 : 10} fontWeight={800} fill="currentColor">{kind}</text>
    {inverted && <circle cx={30} cy={0} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} />}
    <line x1={inverted ? 34 : 25} y1={0} x2={35} y2={0} stroke="currentColor" strokeWidth={1.5} />
    <line x1={0} y1={23} x2={0} y2={30} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
  </g>;
};

const DigitalInputSymbol: SymbolFC = ({ props }) => <g>
  <rect x={-25} y={-12} width={42} height={24} rx={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
  <text x={-4} y={4} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor">{props?.state === 'HIGH' ? '1' : '0'}</text>
  <line x1={17} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={1.5} /><line x1={-30} y1={15} x2={-12} y2={10} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
</g>;

const DigitalOutputSymbol: SymbolFC = () => <g>
  <rect x={-17} y={-12} width={42} height={24} rx={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
  <text x={4} y={4} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor">OUT</text>
  <line x1={-30} y1={0} x2={-17} y2={0} stroke="currentColor" strokeWidth={1.5} /><line x1={30} y1={15} x2={12} y2={10} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2" />
</g>;

// ─── CLASSIC CONTROL SYMBOLS ─────────────────────────────────────────────────────


const CoilSymbol: SymbolFC = ({ powered, props }) => {
  const energized = Boolean(powered);
  const isConflicted = Boolean(props?.isConflicted);

  const borderStroke = isConflicted ? '#EF4444' : 'currentColor';
  const borderDash = isConflicted ? '4,3' : 'none';
  const borderWidth = isConflicted ? 1.5 : 1.5;
  const diagStroke = energized ? '#F59E0B' : 'currentColor';

  return (
    <g>
      {/* طرف التوصيل الأيسر - على خط المنتصف y=0 تماماً من -40 إلى -20 */}
      <line
        x1={-40}
        y1={0}
        x2={-20}
        y2={0}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* طرف التوصيل الأيمن - على خط المنتصف y=0 تماماً من 20 إلى 40 */}
      <line
        x1={20}
        y1={0}
        x2={40}
        y2={0}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* جسم الملف القياسي: 40x30 ممركز بدقة عند (0, 0) */}
      <rect
        x={-20}
        y={-15}
        width={40}
        height={30}
        fill="transparent"
        stroke={borderStroke}
        strokeWidth={borderWidth}
        strokeDasharray={borderDash}
        rx={0}
        ry={0}
      />

      {/* مؤشر التغذية (Energized State) بإطار داخلي متناسق */}
      {energized && (
        <rect
          x={-18.5}
          y={-13.5}
          width={37}
          height={27}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />
      )}

      {/* خط IEC المائل للملف - محصور بدقة داخل زوايا المستطيل الداخلية دون أي بروز */}
      <line
        x1={-20}
        y1={15}
        x2={20}
        y2={-15}
        stroke={diagStroke}
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* نقطة تعارض الإشارة (Conflict Warning) عند الزاوية العلوية */}
      {isConflicted && (
        <circle cx={15} cy={-10} r={3.5} fill="#EF4444" />
      )}
    </g>
  );
};

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
  'impedance': Impedance,
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
  'aux-contact-no': AuxContactNo,
  'aux-contact-nc': AuxContactNc,
  'relay-spst': RelaySpst,
  'relay-spdt': RelaySpdt,
  'relay-dpst': RelayDpst,
  'contactor': Contactor,
  'fuse': Fuse,
  'fuse-3phase': Fuse3Phase,
  'circuit-breaker': CircuitBreaker,
  'circuit-breaker-3phase': CircuitBreaker3Phase,
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
  'op-amp': Opamp,
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
  // Classic Control
  'coil': CoilSymbol,
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
