import { useId } from "react";
import { mixHex, shade } from "./colors";
import { orientFrame, type CircuitComponentProps } from "./orientation";

export interface VectorLedProps extends CircuitComponentProps {
  /** Illumination 0..1 (digitalWrite HIGH = 1, analogWrite duty / 255). Booleans are accepted. */
  state?: number | boolean;
  /** Dome colour; defaults to red. */
  color?: string;
}

export const LED_W = 36;
export const LED_H = 64;
/** Lead tip positions in native coordinates (leads point down). */
export const LED_ANODE_TIP = { x: 12, y: 62 } as const;
export const LED_CATHODE_TIP = { x: 24, y: 52 } as const;

/** 5 mm LED, top-down flat vector: rim, solid dome, flat cathode edge, two straight leads and a soft glow when lit. */
export function VectorLed({ state = 0, color = "#EF4444", orientation = "down", ...svg }: VectorLedProps) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string): string => `${n}-${uid}`;
  const b = Math.max(0, Math.min(1, typeof state === "boolean" ? (state ? 1 : 0) : state));
  const lit = b > 0.02;
  const frame = orientFrame(LED_W, LED_H, orientation);
  const dome = lit ? mixHex(shade(color, 0.85), "#ffffff", 0.25 * b) : shade(color, 0.5);
  // circle with a flattened right edge (cathode side)
  const rim = "M18 4 A14 14 0 1 0 18 32 A14 14 0 0 0 30.6 24.4 V11.6 A14 14 0 0 0 18 4 Z";
  const body = (
    <g>
      {lit && <circle cx={18} cy={18} r={30} fill={`url(#${id("glow")})`} opacity={b} />}
      <line x1={LED_ANODE_TIP.x} y1={30} x2={LED_ANODE_TIP.x} y2={LED_ANODE_TIP.y} stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      <line x1={LED_CATHODE_TIP.x} y1={30} x2={LED_CATHODE_TIP.x} y2={LED_CATHODE_TIP.y} stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      <path d={rim} fill={shade(color, lit ? 0.6 : 0.36)} />
      <circle cx={18} cy={18} r={10.4} fill={dome} />
      <path d="M11.5 16 A7.2 7.2 0 0 1 17 10.8" fill="none" stroke="#FFFFFF" strokeOpacity={lit ? 0.55 : 0.4} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
  return (
    <svg data-component="led" data-lit={lit ? "1" : "0"} viewBox={`0 0 ${frame.vbW} ${frame.vbH}`} width={frame.vbW} height={frame.vbH} overflow="visible" role="img" aria-label={lit ? "LED on" : "LED off"} {...svg}>
      <defs>
        <radialGradient id={id("glow")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={color} stopOpacity={0.6} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      {frame.transform ? <g transform={frame.transform}>{body}</g> : body}
    </svg>
  );
}
