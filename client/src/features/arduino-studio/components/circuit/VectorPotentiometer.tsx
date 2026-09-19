import { orientFrame, type CircuitComponentProps } from "./orientation";

export interface VectorPotentiometerProps extends CircuitComponentProps {
  /** ADC reading 0..1023; rotates the knob through its 270° travel. */
  value?: number;
}

export const POT_W = 64;
export const POT_H = 72;
/** Pin centres (native x) for 5V / wiper / GND; pin tips are at y = 0. */
export const POT_PINS = [20, 32, 44] as const;

/** Rotary potentiometer, top-down flat vector: housing, scale ticks, knob with pointer, three pins. */
export function VectorPotentiometer({ value = 512, orientation = "down", ...svg }: VectorPotentiometerProps) {
  const frac = Math.max(0, Math.min(1023, value)) / 1023;
  const angle = -135 + 270 * frac;
  const frame = orientFrame(POT_W, POT_H, orientation);
  const cx = 32;
  const cy = 42;
  const ticks = Array.from({ length: 11 }, (_, i) => -135 + (270 * i) / 10);
  const body = (
    <g>
      {POT_PINS.map(x => (
        <line key={x} x1={x} y1={0} x2={x} y2={18} stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      ))}
      <rect x={6} y={16} width={52} height={52} rx={7} fill="#1E40AF" />
      <circle cx={cx} cy={cy} r={23} fill="#CBD5E1" />
      {ticks.map(a => (
        <line key={a} x1={cx + 19.5 * Math.sin((a * Math.PI) / 180)} y1={cy - 19.5 * Math.cos((a * Math.PI) / 180)} x2={cx + 22 * Math.sin((a * Math.PI) / 180)} y2={cy - 22 * Math.cos((a * Math.PI) / 180)} stroke="#334155" strokeWidth={1} />
      ))}
      <g transform={`rotate(${angle} ${cx} ${cy})`} data-knob-angle={Math.round(angle)}>
        <circle cx={cx} cy={cy} r={16} fill="#1F2937" />
        <circle cx={cx} cy={cy} r={9.5} fill="#374151" />
        <rect x={cx - 1.2} y={cy - 15} width={2.4} height={9.5} rx={1.2} fill="#F8FAFC" />
      </g>
    </g>
  );
  return (
    <svg data-component="potentiometer" data-value={Math.round(value)} viewBox={`0 0 ${frame.vbW} ${frame.vbH}`} width={frame.vbW} height={frame.vbH} overflow="visible" role="img" aria-label={`Potentiometer at ${Math.round(value)} of 1023`} {...svg}>
      {frame.transform ? <g transform={frame.transform}>{body}</g> : body}
    </svg>
  );
}
