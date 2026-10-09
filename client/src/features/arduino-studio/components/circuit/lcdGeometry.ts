/** Local coordinates of the 16x2 LCD module (px, origin at the PCB's top-left). Shared by the module art and the jumper harness. */
export const LCD_W = 296;
export const LCD_H = 124;
/** Header pitch equals the Uno's 9-unit header pitch at board scale (9 x 1.75) so D4..D7 drop straight onto pins 5..2. */
export const LCD_PITCH = 15.75;
export const LCD_HDR_X0 = (LCD_W - 15 * LCD_PITCH) / 2;
export const LCD_HOLE_Y = 114;

/** HD44780 module pinout, header pin k = 0..15. */
export const LCD_PINS = ["VSS", "VDD", "V0", "RS", "RW", "E", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "A", "K"] as const;
export type LcdPin = (typeof LCD_PINS)[number];
export const lcdPinIndex = (pin: LcdPin): number => LCD_PINS.indexOf(pin);
export const lcdHoleX = (k: number): number => LCD_HDR_X0 + k * LCD_PITCH;

/** I2C backpack header (GND, VCC, SDA, SCL) soldered over header pins 11..14. */
export const I2C_PINS = ["GND", "VCC", "SDA", "SCL"] as const;
export type I2cPin = (typeof I2C_PINS)[number];
export const I2C_FIRST_HOLE = 11;
export const i2cHoleX = (pin: I2cPin): number => lcdHoleX(I2C_FIRST_HOLE + I2C_PINS.indexOf(pin));

/** 5x8 dot matrix on the glass. */
export const DOT = 2.5;
export const GLASS = { x: 24, y: 18, w: 248, h: 54 } as const;
export const BEZEL = { x: 14, y: 9, w: 268, h: 72 } as const;
export const CHAR_PITCH = 6 * DOT;
export const LINE_PITCH = 10 * DOT;
export const DOTS_X0 = GLASS.x + (GLASS.w - (16 * 6 - 1) * DOT) / 2;
export const DOTS_Y0 = GLASS.y + (GLASS.h - (2 * 10 - 2) * DOT) / 2;
