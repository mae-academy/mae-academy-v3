/** Single source of truth for schematic stroke weights and colours. */
export const SCHEMATIC_THEME = {
  /** Wire traces, buses, hops and component leads/terminals: one identical weight and colour. */
  WIRE_STROKE: 2.0,
  WIRE_COLOR: "var(--circuit-wire, #64748b)",
  /** The symbol itself (diode triangle, plates, source circle, zig-zag). */
  BODY_STROKE: 2.5,
  BODY_COLOR: "var(--circuit-component, #7c3aed)",
  FAULT_COLOR: "#f43f5e",
  NODE_RADIUS: 3.5,
} as const;
