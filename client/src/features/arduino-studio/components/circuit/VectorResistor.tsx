import { useId } from "react";
import type { CircuitComponentProps, Orientation } from "./orientation";

export interface VectorResistorProps extends CircuitComponentProps {
  /** Resistance in ohms; drives the 4-band colour code (default 220 Ω = red, red, brown, gold). */
  value?: number;
}

export const RES_W = 120;
export const RES_H = 24;
/** Lead tips in native (horizontal) coordinates. */
export const RES_LEFT_TIP = { x: 0, y: 12 } as const;
export const RES_RIGHT_TIP = { x: 120, y: 12 } as const;

const DIGIT = ["#111827", "#7C3A12", "#DC2626", "#EA580C", "#EAB308", "#16A34A", "#2563EB", "#7C3AED", "#9CA3AF", "#F8FAFC"] as const;
const GOLD = "#D4A72C";
const SILVER = "#CBD5E1";

/** E-series 4-band code: two significant digits, decade multiplier, 5 % gold tolerance. */
export function resistorBands(ohms: number): [string, string, string, string] {
  if (!(ohms > 0)) return [DIGIT[0], DIGIT[0], DIGIT[0], GOLD];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** exp);
  if (sig >= 100) {
    sig = Math.round(sig / 10);
    exp += 1;
  }
  const mult = exp >= 0 && exp <= 9 ? DIGIT[exp] : exp === -1 ? GOLD : SILVER;
  return [DIGIT[Math.floor(sig / 10) % 10], DIGIT[sig % 10], mult, GOLD];
}

/** Axial resistor, flat vector: pill body (#E2D4B7), crisp solid bands, straight 2 px grey leads. */
export function VectorResistor({ value = 220, orientation = "right", ...svg }: VectorResistorProps) {
  const uid = useId().replace(/:/g, "");
  const clip = `pill-${uid}`;
  const bands = resistorBands(value);
  const vertical = (["up", "down"] as Orientation[]).includes(orientation);
  const body = (
    <g>
      <line x1={0} y1={12} x2={30} y2={12} stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      <line x1={90} y1={12} x2={120} y2={12} stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      <rect x={28} y={4} width={64} height={16} rx={8} fill="#E2D4B7" />
      <g clipPath={`url(#${clip})`}>
        <rect x={40} y={4} width={4.5} height={16} fill={bands[0]} />
        <rect x={49} y={4} width={4.5} height={16} fill={bands[1]} />
        <rect x={58} y={4} width={4.5} height={16} fill={bands[2]} />
        <rect x={74} y={4} width={4.5} height={16} fill={bands[3]} />
        <rect x={28} y={4} width={64} height={5} fill="#FFFFFF" opacity={0.22} />
      </g>
    </g>
  );
  return (
    <svg data-component="resistor" data-ohms={value} viewBox={`0 0 ${vertical ? RES_H : RES_W} ${vertical ? RES_W : RES_H}`} width={vertical ? RES_H : RES_W} height={vertical ? RES_W : RES_H} overflow="visible" role="img" aria-label={`${value} ohm resistor`} {...svg}>
      <defs>
        <clipPath id={clip}>
          <rect x={28} y={4} width={64} height={16} rx={8} />
        </clipPath>
      </defs>
      {vertical ? <g transform={`translate(${RES_H} 0) rotate(90)`}>{body}</g> : body}
    </svg>
  );
}
