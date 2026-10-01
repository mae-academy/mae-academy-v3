import type { Wire } from "../../control/circuitPhase1";
import type { SchematicComponent, SchematicDocument } from "./netlist";
import { KatexMath } from "@/components/ui/KatexMath";
import { labelToTex } from "./labels";
import { labelWidth } from "./labelPlacement";
import { SCHEMATIC_THEME as THEME } from "./theme";
import { SYMBOLS } from "./symbols";

const HOP_RADIUS = 8;
const PADDING = 28;

/** Orthogonal wire path; a crossing is drawn as a small hop over the horizontal run. */
export function wirePath(wire: Wire): string {
  const jumps = wire.jumps ?? [];
  let d = `M${wire.points[0].x} ${wire.points[0].y}`;
  wire.points.slice(1).forEach((end, index) => {
    const start = wire.points[index];
    if (start.y === end.y) {
      const direction = end.x > start.x ? 1 : -1;
      const hops = jumps
        .filter((jump) => jump.y === start.y && jump.x > Math.min(start.x, end.x) && jump.x < Math.max(start.x, end.x))
        .sort((a, b) => (a.x - b.x) * direction);
      hops.forEach((jump) => {
        d += `L${jump.x - direction * HOP_RADIUS} ${start.y}A${HOP_RADIUS} ${HOP_RADIUS} 0 0 ${direction > 0 ? 1 : 0} ${jump.x + direction * HOP_RADIUS} ${start.y}`;
      });
    }
    d += `L${end.x} ${end.y}`;
  });
  return d;
}

function symbolTransform(component: SchematicComponent) {
  return `translate(${component.x} ${component.y}) rotate(${component.rotation})${component.reflected ? " scale(-1 1)" : ""}`;
}

interface SchematicViewProps {
  document: SchematicDocument;
  ariaLabel?: string;
  className?: string;
  /** Component ids drawn in the fault colour (e.g. the shorted leg of an inverter). */
  highlightIds?: readonly string[];
}

export function SchematicView({ document: schematic, ariaLabel, className = "", highlightIds = [] }: SchematicViewProps) {
  // Always auto-fit: the viewBox is the padded bounding box of every element.
  const viewBox = `${schematic.bounds.x1 - PADDING} ${schematic.bounds.y1 - PADDING} ${schematic.bounds.x2 - schematic.bounds.x1 + PADDING * 2} ${schematic.bounds.y2 - schematic.bounds.y1 + PADDING * 2}`;
  const highlighted = new Set(highlightIds);

  return (
    <div className={`relative w-full [--circuit-wire:#64748b] [--circuit-component:#7c3aed] dark:[--circuit-wire:#94a3b8] dark:[--circuit-component:#a78bfa] ${className}`} dir="ltr" data-testid="power-schematic">
      <svg
        key={schematic.title}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className={`mx-auto block h-auto max-h-[460px] w-full select-none text-slate-700 dark:text-slate-200`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={ariaLabel ?? schematic.title}
      >
        <title>{ariaLabel ?? schematic.title}</title>
        <g stroke={THEME.WIRE_COLOR} strokeWidth={THEME.WIRE_STROKE} data-layer="wires">
          {schematic.wires.map((wire) => <path key={wire.id} d={wirePath(wire)} data-wire={wire.id} />)}
        </g>
        <g fill={THEME.WIRE_COLOR} stroke="none" data-layer="junctions">
          {schematic.junctions.map((junction) => <circle key={`${junction.x}:${junction.y}`} cx={junction.x} cy={junction.y} r={THEME.NODE_RADIUS} />)}
        </g>
        <g data-layer="components">
          {schematic.components.map((component) => {
            const def = SYMBOLS[component.kind];
            const bodyColor = highlighted.has(component.id) ? THEME.FAULT_COLOR : THEME.BODY_COLOR;
            return (
              <g key={component.id} data-component={component.id} data-kind={component.kind}>
                <g transform={symbolTransform(component)}>
                  {def.draw.map((primitive, index) => {
                    const lead = primitive.role === "lead";
                    const style = { stroke: lead ? THEME.WIRE_COLOR : bodyColor, strokeWidth: lead ? THEME.WIRE_STROKE : THEME.BODY_STROKE };
                    return primitive.type === "path"
                      ? <path key={index} d={primitive.d} {...style} fill={primitive.solid ? bodyColor : "none"} transform={primitive.upright ? `rotate(${-component.rotation})` : undefined} data-role={primitive.role} />
                      : <circle key={index} cx={primitive.cx} cy={primitive.cy} r={primitive.r} {...style} fill="none" data-role={primitive.role} />;
                  })}
                </g>
              </g>
            );
          })}
        </g>
        <g data-layer="labels" fill="currentColor" stroke="none">
          {[...schematic.components.flatMap((component) => component.labels.map((label) => ({ ...label, owner: component.id }))), ...schematic.texts.map((label) => ({ ...label, owner: "text" }))].map((label, index) => {
            const width = labelWidth(label.text);
            const x = label.anchor === "start" ? label.x : label.anchor === "end" ? label.x - width : label.x - width / 2;
            const justify = label.anchor === "start" ? "flex-start" : label.anchor === "end" ? "flex-end" : "center";
            return (
              <foreignObject key={`${label.owner}:${index}`} x={x} y={label.y - 20} width={width} height={28} overflow="visible" data-label={label.text}>
                <div style={{ display: "flex", justifyContent: justify, alignItems: "flex-end", height: "100%", fontSize: 16, lineHeight: 1, color: "inherit", whiteSpace: "nowrap", transition: "none" }}>
                  <KatexMath math={labelToTex(label.text)} />
                </div>
              </foreignObject>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
