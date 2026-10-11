import type { CircuitSvgProps } from "./orientation";
import { mixHex } from "./colors";

/**
 * Flat-vector sensor modules: dark matte boards, silver pin headers, silkscreen labels. The two analog parts (LDR, LM35) share
 * the potentiometer's frame and pin layout so they drop into its slot with identical wiring; the three digital modules
 * carry their header at the bottom so jumpers leave toward the Uno.
 */

const BOARD = "#0B1220";
const BOARD_EDGE = "#1E293B";
const SILK = "#94A3B8";
const METAL = "#CBD5E1";
const METAL_DARK = "#64748B";
const ACCENT = { blue: "#3B82F6", violet: "#8B5CF6", green: "#10B981" } as const;
const SILK_FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function Header({ xs, y1, y2, labels }: { xs: readonly number[]; y1: number; y2: number; labels?: readonly string[] }) {
  const left = xs[0] - 7;
  const right = xs[xs.length - 1] + 7;
  return (
    <g data-header>
      {labels?.map((l, i) => (
        <text key={l + i} x={xs[i]} y={y1 - 4.5} textAnchor="middle" fontSize={4.6} fontFamily={SILK_FONT} fill={SILK}>
          {l}
        </text>
      ))}
      <rect x={left} y={y1 - 2} width={right - left} height={7} rx={1.2} fill="#111827" stroke={BOARD_EDGE} strokeWidth={0.6} />
      {xs.map(x => (
        <g key={x}>
          <line x1={x} y1={y1 + 1} x2={x} y2={y2} stroke={METAL_DARK} strokeWidth={2.6} strokeLinecap="round" />
          <line x1={x} y1={y1 + 1} x2={x} y2={y2} stroke={METAL} strokeWidth={1.7} strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

// --- LDR ---------------------------------------------------------------------------------------------------------------

export const LDR_W = 64;
export const LDR_H = 72;
/** Native x of VCC / signal / GND; header pin tips sit at y = 0, matching the potentiometer. */
export const LDR_PINS = [20, 32, 44] as const;

export interface VectorLdrProps extends CircuitSvgProps {
  /** Light level 0..1 on the log scale (drives the glow around the cell). */
  light?: number;
  lux?: number;
}

/** CdS photoresistor module: serpentine track on a ceramic disc, 10k divider resistor, 3-pin header at the top. */
export function VectorLdr({ light = 0.5, lux, ...svg }: VectorLdrProps) {
  const l = clamp01(light);
  const cx = 32;
  const cy = 43;
  return (
    <svg data-component="ldr" data-value={lux === undefined ? undefined : Math.round(lux * 10) / 10} viewBox={`0 0 ${LDR_W} ${LDR_H}`} width={LDR_W} height={LDR_H} overflow="visible" role="img" aria-label={`LDR light sensor${lux === undefined ? "" : ` at ${Math.round(lux)} lux`}`} {...svg}>
      <circle cx={cx} cy={cy} r={22 + l * 5} fill="#FBBF24" opacity={l * 0.38} />
      <Header xs={LDR_PINS} y1={6} y2={0} labels={["VCC", "AO", "GND"]} />
      <rect x={4} y={16} width={56} height={54} rx={6} fill={BOARD} stroke={BOARD_EDGE} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={17} fill={mixHex("#B45309", "#FDE68A", 0.35 + l * 0.5)} stroke="#78350F" strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={14} fill="none" stroke="#92400E" strokeWidth={0.8} opacity={0.7} />
      <path d={`M${cx - 11} ${cy - 5} H${cx + 11} M${cx - 12} ${cy - 1} H${cx + 12} M${cx - 12} ${cy + 3} H${cx + 12} M${cx - 10} ${cy + 7} H${cx + 10} M${cx - 6} ${cy - 9} H${cx + 6}`} stroke="#451A03" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <path d={`M${cx - 11} ${cy - 5} V${cy - 1} M${cx + 12} ${cy - 1} V${cy + 3} M${cx - 12} ${cy + 3} V${cy + 7}`} stroke="#451A03" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <circle cx={9} cy={22} r={2} fill={ACCENT.green} />
      <text x={32} y={67} textAnchor="middle" fontSize={5.4} fontWeight={700} fontFamily={SILK_FONT} fill={SILK}>
        LDR · 10k
      </text>
    </svg>
  );
}

// --- LM35 --------------------------------------------------------------------------------------------------------------

export const LM35_W = 64;
export const LM35_H = 72;
export const LM35_PINS = [20, 32, 44] as const;

export interface VectorLm35Props extends CircuitSvgProps {
  /** Die temperature 0..100 C; tints the thermal band under the package from cold blue to hot red. */
  celsius?: number;
}

/** LM35 in a TO-92 package: black half-round body, flat face with the part number, three leads (+Vs, Vout, GND). */
export function VectorLm35({ celsius = 25, ...svg }: VectorLm35Props) {
  const t = clamp01(celsius / 100);
  const heat = t < 0.5 ? mixHex("#38BDF8", "#FBBF24", t * 2) : mixHex("#FBBF24", "#EF4444", (t - 0.5) * 2);
  return (
    <svg data-component="lm35" data-value={Math.round(celsius * 10) / 10} viewBox={`0 0 ${LM35_W} ${LM35_H}`} width={LM35_W} height={LM35_H} overflow="visible" role="img" aria-label={`LM35 temperature sensor at ${celsius.toFixed(1)} degrees Celsius`} {...svg}>
      {LM35_PINS.map(x => (
        <g key={x}>
          <line x1={x} y1={0} x2={x} y2={26} stroke={METAL_DARK} strokeWidth={2.8} strokeLinecap="round" />
          <line x1={x} y1={0} x2={x} y2={26} stroke={METAL} strokeWidth={1.8} strokeLinecap="round" />
        </g>
      ))}
      <path d="M10 24 H54 V46 A22 22 0 0 1 10 46 Z" fill="#111827" stroke="#020617" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M13 27 H51 V30 H13 Z" fill="#1F2937" />
      <path d="M17 33 V47 A15 15 0 0 0 25 59" stroke="#374151" strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.8} />
      <text x={32} y={39} textAnchor="middle" fontSize={8.5} fontWeight={800} fontFamily={SILK_FONT} fill="#F1F5F9">
        LM35
      </text>
      <text x={32} y={48} textAnchor="middle" fontSize={5} fontFamily={SILK_FONT} fill={SILK}>
        10mV/°C
      </text>
      <rect x={18} y={55} width={28} height={4} rx={2} fill="#1E293B" />
      <rect x={18} y={55} width={Math.max(4, 28 * t)} height={4} rx={2} fill={heat} data-thermal-band />
      <g fontSize={4.4} fontFamily={SILK_FONT} fill={SILK} textAnchor="middle">
        <text x={LM35_PINS[0]} y={67}>+Vs</text>
        <text x={LM35_PINS[1]} y={67}>Vout</text>
        <text x={LM35_PINS[2]} y={67}>GND</text>
      </g>
    </svg>
  );
}

// --- PIR ---------------------------------------------------------------------------------------------------------------

export const PIR_W = 66;
export const PIR_H = 78;
/** Header pin tips (native coords): VCC, OUT, GND. */
export const PIR_PINS = [18, 33, 48] as const;

export interface VectorPirProps extends CircuitSvgProps {
  /** Output is HIGH: the dome glows and the OUT lamp lights. */
  triggered?: boolean;
}

/** HC-SR501 module: Fresnel lens dome over the pyroelectric sensor, two trimmers, 3-pin header. */
export function VectorPir({ triggered = false, ...svg }: VectorPirProps) {
  return (
    <svg data-component="pir" data-triggered={triggered ? "1" : "0"} viewBox={`0 0 ${PIR_W} ${PIR_H}`} width={PIR_W} height={PIR_H} overflow="visible" role="img" aria-label={`PIR motion sensor, output ${triggered ? "HIGH" : "LOW"}`} {...svg}>
      {triggered && <circle cx={33} cy={27} r={27} fill={ACCENT.green} opacity={0.22} />}
      <rect x={3} y={4} width={60} height={54} rx={6} fill={BOARD} stroke={BOARD_EDGE} strokeWidth={1} />
      <circle cx={33} cy={27} r={19} fill={triggered ? "#D1FAE5" : "#F1F5F9"} stroke={METAL} strokeWidth={1.5} />
      {[14, 9, 4].map(r => (
        <circle key={r} cx={33} cy={27} r={r} fill="none" stroke={triggered ? "#6EE7B7" : METAL} strokeWidth={0.8} />
      ))}
      <circle cx={33} cy={27} r={2} fill={triggered ? ACCENT.green : METAL_DARK} />
      <circle cx={11} cy={50} r={3.2} fill="#F59E0B" stroke="#92400E" strokeWidth={0.6} />
      <circle cx={55} cy={50} r={3.2} fill="#F59E0B" stroke="#92400E" strokeWidth={0.6} />
      <circle cx={33} cy={50} r={1.8} fill={triggered ? ACCENT.green : "#14532D"} />
      <Header xs={PIR_PINS} y1={60} y2={76} labels={["VCC", "OUT", "GND"]} />
    </svg>
  );
}

// --- IR obstacle (FC-51) -------------------------------------------------------------------------------------------

export const IR_W = 66;
export const IR_H = 78;
/** Header pin tips (native coords): OUT, GND, VCC. */
export const IR_PINS = [18, 33, 48] as const;

export interface VectorIrObstacleProps extends CircuitSvgProps {
  /** Obstacle inside the threshold: the OUT lamp lights (output is active LOW) and the beam is drawn. */
  obstacle?: boolean;
}

/** FC-51 module: IR emitter (clear) and receiver (dark) domes, blue sensitivity trimmer, power and OUT lamps. */
export function VectorIrObstacle({ obstacle = false, ...svg }: VectorIrObstacleProps) {
  return (
    <svg data-component="ir-obstacle" data-obstacle={obstacle ? "1" : "0"} viewBox={`0 0 ${IR_W} ${IR_H}`} width={IR_W} height={IR_H} overflow="visible" role="img" aria-label={`IR obstacle sensor, ${obstacle ? "obstacle detected" : "clear"}`} {...svg}>
      {obstacle && (
        <g stroke={ACCENT.blue} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.8}>
          <path d="M15 14 Q19 8 23 14" />
          <path d="M12 10 Q19 1 26 10" />
          <path d="M43 14 Q47 8 51 14" />
          <path d="M40 10 Q47 1 54 10" />
        </g>
      )}
      <rect x={3} y={16} width={60} height={42} rx={5} fill={BOARD} stroke={BOARD_EDGE} strokeWidth={1} />
      <circle cx={18} cy={30} r={8} fill="#E2E8F0" stroke={METAL} strokeWidth={1} />
      <circle cx={18} cy={30} r={3.6} fill="#F8FAFC" opacity={0.8} />
      <circle cx={48} cy={30} r={8} fill="#111827" stroke="#475569" strokeWidth={1} />
      <circle cx={48} cy={30} r={3.6} fill="#1F2937" />
      <rect x={25} y={36} width={16} height={14} rx={2} fill={ACCENT.blue} stroke="#1D4ED8" strokeWidth={0.8} />
      <circle cx={33} cy={43} r={4.4} fill="#E2E8F0" stroke={METAL_DARK} strokeWidth={0.6} />
      <line x1={30.5} y1={43} x2={35.5} y2={43} stroke={METAL_DARK} strokeWidth={1.1} strokeLinecap="round" />
      <circle cx={9} cy={52} r={2} fill={ACCENT.green} />
      <circle cx={57} cy={52} r={2} fill={obstacle ? "#EF4444" : "#450A0A"} />
      {obstacle && <circle cx={57} cy={52} r={4.4} fill="#EF4444" opacity={0.35} />}
      <Header xs={IR_PINS} y1={60} y2={76} labels={["OUT", "GND", "VCC"]} />
    </svg>
  );
}

// --- Ultrasonic (HC-SR04) ------------------------------------------------------------------------------------------

export const US_W = 108;
export const US_H = 78;
/** Header pin tips (native coords): VCC, Trig, Echo, GND. */
export const US_PINS = [27, 45, 63, 81] as const;

export interface VectorUltrasonicProps extends CircuitSvgProps {
  /** Distance as a fraction of the 2-400 cm range; spaces the echo arcs in front of the receiver. */
  range?: number;
  /** An echo is being returned (an obstacle is in range). */
  echo?: boolean;
}

/** HC-SR04 module: two silver transducer cans (TX, RX), crystal and driver IC, 4-pin header. */
export function VectorUltrasonic({ range = 0.25, echo = true, ...svg }: VectorUltrasonicProps) {
  const arc = (cx: number, r: number) => `M${cx - r} ${-r * 0.2 + 10} A${r} ${r} 0 0 1 ${cx + r} ${-r * 0.2 + 10}`;
  const spread = 4 + clamp01(range) * 5;
  return (
    <svg data-component="hcsr04" data-echo={echo ? "1" : "0"} viewBox={`0 0 ${US_W} ${US_H}`} width={US_W} height={US_H} overflow="visible" role="img" aria-label={`HC-SR04 ultrasonic sensor${echo ? "" : ", no echo"}`} {...svg}>
      {echo && (
        <g fill="none" stroke={ACCENT.violet} strokeWidth={1.3} strokeLinecap="round" opacity={0.75}>
          <path d={arc(80, spread * 1.2)} />
          <path d={arc(80, spread * 2)} opacity={0.6} />
          <path d={arc(80, spread * 2.8)} opacity={0.35} />
        </g>
      )}
      <rect x={2} y={12} width={104} height={46} rx={5} fill={BOARD} stroke={BOARD_EDGE} strokeWidth={1} />
      <rect x={2} y={12} width={104} height={3} rx={1.5} fill={ACCENT.violet} opacity={0.8} />
      {[28, 80].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={36} r={18} fill={METAL_DARK} />
          <circle cx={cx} cy={36} r={16} fill={METAL} stroke="#475569" strokeWidth={0.8} />
          <circle cx={cx} cy={36} r={11.5} fill="#94A3B8" stroke="#334155" strokeWidth={1} />
          <circle cx={cx} cy={36} r={6} fill="#1F2937" stroke="#475569" strokeWidth={0.8} />
          <text x={cx} y={39} textAnchor="middle" fontSize={7} fontWeight={800} fontFamily={SILK_FONT} fill={SILK}>
            {i === 0 ? "T" : "R"}
          </text>
        </g>
      ))}
      <rect x={47} y={25} width={14} height={7} rx={3.5} fill={METAL} stroke={METAL_DARK} strokeWidth={0.6} />
      <rect x={46} y={37} width={16} height={8} rx={1} fill="#111827" stroke="#334155" strokeWidth={0.6} />
      <text x={54} y={52} textAnchor="middle" fontSize={5.2} fontWeight={700} fontFamily={SILK_FONT} fill={SILK}>
        HC-SR04
      </text>
      <Header xs={US_PINS} y1={60} y2={76} labels={["VCC", "Trig", "Echo", "GND"]} />
    </svg>
  );
}
