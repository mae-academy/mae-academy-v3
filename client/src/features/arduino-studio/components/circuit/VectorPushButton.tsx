import type { CircuitComponentProps } from "./orientation";

export interface VectorPushButtonProps extends CircuitComponentProps {
  /** true when the contact is closed / the cap is pushed in. */
  state?: boolean | number;
  /** Cap colour. */
  color?: string;
}

export const BTN_W = 56;
export const BTN_H = 56;
/** Leg tips in native coordinates: left pair (x = 0) and right pair (x = 56). */
export const BTN_LEGS = { left: { x: 0, y: 42 }, right: { x: 56, y: 14 } } as const;

/** 6 mm tactile switch, top-down flat vector: plate, corner pins, four legs and a cap that shrinks when pressed. */
export function VectorPushButton({ state = false, color = "#1F2937", ...svg }: VectorPushButtonProps) {
  const pressed = typeof state === "number" ? state > 0.5 : state;
  return (
    <svg data-component="push-button" data-pressed={pressed ? "1" : "0"} viewBox={`0 0 ${BTN_W} ${BTN_H}`} width={BTN_W} height={BTN_H} overflow="visible" role="img" aria-label={pressed ? "Button pressed" : "Button released"} {...svg}>
      {[14, 42].map(y => (
        <g key={y}>
          <line x1={0} y1={y} x2={10} y2={y} stroke="#94A3B8" strokeWidth={2.4} strokeLinecap="round" />
          <line x1={46} y1={y} x2={56} y2={y} stroke="#94A3B8" strokeWidth={2.4} strokeLinecap="round" />
        </g>
      ))}
      <rect x={7} y={7} width={42} height={42} rx={5} fill="#0F172A" />
      <rect x={10} y={10} width={36} height={36} rx={3.5} fill="#CBD5E1" />
      {[[14, 14], [42, 14], [14, 42], [42, 42]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={1.6} fill="#94A3B8" />
      ))}
      <circle cx={28} cy={28} r={pressed ? 11.5 : 13} fill={color} />
      <path d="M21.5 24 A8 8 0 0 1 27 19.4" fill="none" stroke="#FFFFFF" strokeOpacity={pressed ? 0.18 : 0.35} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
