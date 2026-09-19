import type { SVGProps } from "react";

/** Direction the component's leads/terminals point (its native drawing has leads pointing "down"). */
export type Orientation = "up" | "down" | "left" | "right";

export interface OrientedFrame {
  vbW: number;
  vbH: number;
  transform?: string;
}

/** Maps a native (w x h, leads down) drawing into the requested orientation. */
export function orientFrame(w: number, h: number, o: Orientation): OrientedFrame {
  switch (o) {
    case "up":
      return { vbW: w, vbH: h, transform: `translate(${w} ${h}) rotate(180)` };
    case "left":
      return { vbW: h, vbH: w, transform: `translate(${h} 0) rotate(90)` };
    case "right":
      return { vbW: h, vbH: w, transform: `translate(0 ${w}) rotate(-90)` };
    default:
      return { vbW: w, vbH: h };
  }
}

/** Common props shared by every circuit component in the registry. */
export type CircuitSvgProps = Omit<SVGProps<SVGSVGElement>, "ref" | "orientation" | "value" | "state">;

export interface CircuitComponentProps extends CircuitSvgProps {
  orientation?: Orientation;
}
