/**
 * Physical transfer functions for the peripheral sensors the studio can mount. Pure maths (no React, no runtime), so the
 * ADC / logic levels each sensor feeds the sketch are unit-testable against the datasheet formulas.
 */

export type AnalogSensorKind = "pot" | "ldr" | "lm35";
export type DigitalSensorKind = "pir" | "ir" | "ultrasonic";
export type SensorKind = AnalogSensorKind | DigitalSensorKind;

const VREF = 5;
const ADC_MAX = 1023;

/** Analog front end: Vout (volts) -> 10-bit reading, truncated like the AVR converter. */
export const voltsToAdc = (volts: number): number => Math.max(0, Math.min(ADC_MAX, Math.floor((volts / VREF) * ADC_MAX)));
export const adcToVolts = (adc: number): number => (adc * VREF) / ADC_MAX;

// --- LDR (CdS photoresistor, 10 kOhm pull-down divider) -----------------------------------------------------------
export const LDR_LUX_MIN = 0.1;
export const LDR_LUX_MAX = 10_000;
const LDR_R10 = 10_000; // resistance at 10 lux
const LDR_GAMMA = 0.7;
const LDR_DIVIDER = 10_000;

/** R_LDR = 10k * (10 / lux)^0.7 */
export function ldrResistance(lux: number): number {
  const l = Math.max(LDR_LUX_MIN, Math.min(LDR_LUX_MAX, lux));
  return LDR_R10 * Math.pow(10 / l, LDR_GAMMA);
}

/** 5V - LDR - node - 10k - GND: brighter light lowers R_LDR and raises the node voltage. */
export function ldrVoltage(lux: number): number {
  return (VREF * LDR_DIVIDER) / (LDR_DIVIDER + ldrResistance(lux));
}
export const ldrAdc = (lux: number): number => voltsToAdc(ldrVoltage(lux));

/** The LDR slider is logarithmic (0.1 .. 10 000 lux spans five decades); position 0..1 <-> lux. */
export const luxFromPosition = (pos: number): number => LDR_LUX_MIN * Math.pow(LDR_LUX_MAX / LDR_LUX_MIN, Math.max(0, Math.min(1, pos)));
export const positionFromLux = (lux: number): number => Math.log(Math.max(LDR_LUX_MIN, Math.min(LDR_LUX_MAX, lux)) / LDR_LUX_MIN) / Math.log(LDR_LUX_MAX / LDR_LUX_MIN);

// --- LM35 (10 mV / degC) --------------------------------------------------------------------------------------------
export const LM35_MIN_C = 0;
export const LM35_MAX_C = 100;
export const lm35Voltage = (celsius: number): number => Math.max(LM35_MIN_C, Math.min(LM35_MAX_C, celsius)) * 0.01;
export const lm35Adc = (celsius: number): number => voltsToAdc(lm35Voltage(celsius));

// --- PIR (HC-SR501) ---------------------------------------------------------------------------------------------------
export const PIR_HOLD_MIN_S = 1;
export const PIR_HOLD_MAX_S = 5;
export const clampPirHold = (seconds: number): number => Math.max(PIR_HOLD_MIN_S, Math.min(PIR_HOLD_MAX_S, seconds));
/** Idle LOW (0 V), triggered HIGH (5 V) for the hold time. */
export const pirLevel = (triggered: boolean): 0 | 1 => (triggered ? 1 : 0);

// --- IR obstacle (FC-51) ----------------------------------------------------------------------------------------------
export const IR_DIST_MIN_CM = 1;
export const IR_DIST_MAX_CM = 30;
/** Active LOW: the output pulls to ground while an obstacle sits at or inside the sensitivity threshold. */
export const irLevel = (distanceCm: number, thresholdCm: number): 0 | 1 => (distanceCm <= thresholdCm ? 0 : 1);

// --- Ultrasonic (HC-SR04) ---------------------------------------------------------------------------------------------
export const US_DIST_MIN_CM = 2;
export const US_DIST_MAX_CM = 400;
/** Round trip at 343 m/s: 58.2 us per centimetre of range. */
export const US_US_PER_CM = 58.2;
export const echoMicros = (distanceCm: number): number => Math.round(Math.max(US_DIST_MIN_CM, Math.min(US_DIST_MAX_CM, distanceCm)) * US_US_PER_CM);

/** Initial physical value of each sensor when it first mounts. */
export const SENSOR_DEFAULTS = { ldr: 500, lm35: 25, irDistance: 25, irThreshold: 10, pirHold: 2, ultrasonic: 100 } as const;

export const ANALOG_SENSOR_KINDS: readonly AnalogSensorKind[] = ["pot", "ldr", "lm35"];
