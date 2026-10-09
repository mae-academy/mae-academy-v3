import { useMemo } from "react";
import { findHops, hopArcs, wirePath, type HarnessWire } from "./lcdHarness";

/**
 * Jumper wires between the Uno headers and the LCD module. Orthogonal runs with rounded corners, a light halo so
 * crossings stay readable, and semicircular hop-overs where two wires cross.
 */
export function LcdWires({ wires }: { wires: HarnessWire[] }) {
  const hops = useMemo(() => findHops(wires), [wires]);
  const arcs = useMemo(() => hopArcs(wires, hops), [wires, hops]);
  return (
    <g data-layer="lcd-wiring">
      {wires.map(w => {
        const d = wirePath(w.points, hops, w.id);
        const first = w.points[0];
        const last = w.points[w.points.length - 1];
        const ground = w.net === "GND";
        const stroke = ground ? undefined : w.color;
        const strokeClass = ground ? "stroke-slate-800 dark:stroke-slate-400" : undefined;
        const fillClass = ground ? "fill-slate-800 dark:fill-slate-400" : undefined;
        return (
          <g key={w.id} data-wire={`LCD-${w.id}`} data-lcd-wire={w.pin} data-from={w.from} data-net={w.net}>
            <title>{`LCD ${w.pin} ← ${w.from}`}</title>
            <path d={d} fill="none" className="stroke-slate-50 dark:stroke-[#07080a]" strokeWidth={5.4} strokeOpacity={0.85} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={stroke} className={strokeClass} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={first.x} cy={first.y} r={2.8} fill={stroke} className={fillClass} />
            <circle cx={last.x} cy={last.y} r={2.4} fill={stroke} className={fillClass} />
          </g>
        );
      })}
      {/* Crossings: each hop is repainted above all wires so the hopping wire visibly passes over. */}
      <g data-layer="lcd-hops">
        {arcs.map(arc => {
          const ground = arc.net === "GND";
          return (
            <g key={arc.key} data-hop>
              <path d={arc.d} fill="none" className="stroke-slate-50 dark:stroke-[#07080a]" strokeWidth={5.4} strokeLinecap="butt" />
              <path d={arc.d} fill="none" stroke={ground ? undefined : arc.color} className={ground ? "stroke-slate-800 dark:stroke-slate-400" : undefined} strokeWidth={2.6} strokeLinecap="round" />
            </g>
          );
        })}
      </g>
    </g>
  );
}
