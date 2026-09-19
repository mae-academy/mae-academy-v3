/** Pin/LED coordinates in the ArduinoUno.svg viewBox (0 0 285.2 209), measured from the SVG hole/LED geometry. */
export const VIEW_W = 285.2;
export const VIEW_H = 209;

export const DIGITAL_HEADER_Y = 19.05;
export const ANALOG_HEADER_Y = 190.05;

export interface HeaderPin {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Arduino pin number for GPIO pins (A0 = 14). */
  pin?: number;
  group: "digital" | "analog" | "power" | "gnd" | "aref" | "other";
}

/** Digital 13..8 sit on the left header block, 7..0 on the right block, all on a 9 unit pitch. */
export const digitalPinX = (pin: number): number => (pin >= 8 ? 134.75 + 9 * (13 - pin) : 194.25 + 9 * (7 - pin));
export const analogPinX = (channel: number): number => 212.25 + 9 * channel;

export const HEADER_PINS: readonly HeaderPin[] = [
  { id: "SCL", label: "SCL", x: 98.75, y: DIGITAL_HEADER_Y, group: "other" },
  { id: "SDA", label: "SDA", x: 107.75, y: DIGITAL_HEADER_Y, group: "other" },
  { id: "AREF", label: "AREF", x: 116.75, y: DIGITAL_HEADER_Y, group: "aref" },
  { id: "GND-T", label: "GND", x: 125.75, y: DIGITAL_HEADER_Y, group: "gnd" },
  ...Array.from({ length: 14 }, (_, pin): HeaderPin => ({ id: `D${pin}`, label: String(pin), x: digitalPinX(pin), y: DIGITAL_HEADER_Y, pin, group: "digital" })),
  { id: "IOREF", label: "IOREF", x: 140.25, y: ANALOG_HEADER_Y, group: "power" },
  { id: "RESET", label: "RESET", x: 149.25, y: ANALOG_HEADER_Y, group: "power" },
  { id: "3V3", label: "3.3V", x: 158.25, y: ANALOG_HEADER_Y, group: "power" },
  { id: "5V", label: "5V", x: 167.25, y: ANALOG_HEADER_Y, group: "power" },
  { id: "GND-1", label: "GND", x: 176.25, y: ANALOG_HEADER_Y, group: "gnd" },
  { id: "GND-2", label: "GND", x: 185.25, y: ANALOG_HEADER_Y, group: "gnd" },
  { id: "VIN", label: "VIN", x: 194.25, y: ANALOG_HEADER_Y, group: "power" },
  ...Array.from({ length: 6 }, (_, ch): HeaderPin => ({ id: `A${ch}`, label: `A${ch}`, x: analogPinX(ch), y: ANALOG_HEADER_Y, pin: 14 + ch, group: "analog" })),
];

export interface LedGeom {
  id: "L" | "TX" | "RX" | "ON";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export const LEDS: readonly LedGeom[] = [
  { id: "L", x: 126.2, y: 50.3, w: 9.2, h: 4.8, color: "#ef4444" },
  { id: "TX", x: 126.1, y: 66.9, w: 9.2, h: 4.8, color: "#dc2626" },
  { id: "RX", x: 126.1, y: 75, w: 9.2, h: 4.8, color: "#dc2626" },
  { id: "ON", x: 237.8, y: 67.1, w: 9.2, h: 4.8, color: "#4ade80" },
];

export const PWM_CAPABLE: ReadonlySet<number> = new Set([3, 5, 6, 9, 10, 11]);

export function pinName(pin: number): string {
  return pin >= 14 ? `A${pin - 14}` : `D${pin}`;
}
