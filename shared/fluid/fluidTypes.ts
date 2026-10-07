/**
 * Foundational types for pneumatic / hydraulic schematics (ISO 1219 symbols, ISO 5599 port numbering).
 */
export type FluidMedium = 'PNEUMATIC' | 'HYDRAULIC';

export type PortType =
  | 'PRESSURE'       // Port 1 (P)
  | 'WORKING'        // Ports 2, 4 (A, B)
  | 'EXHAUST'        // Ports 3, 5 (R, S / Tank T)
  | 'PILOT'          // Ports 10, 12, 14 (Z, Y)
  | 'ELECTRICAL';    // Solenoid / Sensor pins

export interface FluidPort {
  id: string;
  isoNumber: '1' | '2' | '3' | '4' | '5' | '10' | '12' | '14' | string;
  lettering: 'P' | 'A' | 'B' | 'R' | 'S' | 'T' | 'Z' | 'Y' | string;
  type: PortType;
  /** Local offset within the symbol. */
  x: number;
  y: number;
}

export type FluidComponentCategory =
  | 'SUPPLY'         // Compressor, Reservoir, FRL, Pump, Tank
  | 'VALVE_DCV'      // 3/2, 5/2, 5/3 Directional Control Valves
  | 'VALVE_LOGIC'    // Shuttle (OR), Dual-Pressure (AND), Quick Exhaust
  | 'VALVE_FLOW'     // Throttle, One-Way Flow Control
  | 'VALVE_PRESSURE' // Relief, Regulating, Sequence
  | 'ACTUATOR'       // Single/Double Acting Cylinders, Air Motors
  | 'AUXILIARY';     // Exhaust ports, Silencers, Gauges, Indicators

export interface FluidComponentDefinition {
  type: string;
  category: FluidComponentCategory;
  name: string;
  /** ISO 1219-2 identification code, e.g. '1V1', '1A1', '0Z1'. */
  isoCode: string;
  ports: FluidPort[];
  width: number;
  height: number;
}
