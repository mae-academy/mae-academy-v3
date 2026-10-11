/**
 * Which sensor sits where, and what each one drives into the virtual hardware. Shared by the Studio (which pushes the values
 * into the runtime) and the board (which draws the modules), so both always agree. Pure and unit-tested.
 */
import type { SensorContext } from "./codeContextAnalyzer";
import { SENSOR_DEFAULTS, echoMicros, irLevel, ldrAdc, lm35Adc, type AnalogSensorKind, type SensorKind } from "./sensorModels";

/** A user's manual choice for one analog channel; dropped automatically once the sketch's own detection changes. */
export interface AnalogOverride {
  kind: AnalogSensorKind;
  /** What the code said when the user chose, so a different sketch does not inherit a stale choice. */
  detected: AnalogSensorKind;
}
export type AnalogOverrides = Record<number, AnalogOverride>;

/** Physical value of each sensor control (lux, degrees C, cm, seconds), keyed by `sensorKey`. */
export type SensorValues = Record<string, number>;

export const sensorKey = (kind: SensorKind, slot: number, field = "v"): string => `${kind}:${slot}:${field}`;

const DEFAULT_OF: Record<string, number> = {
  "ldr:v": SENSOR_DEFAULTS.ldr,
  "lm35:v": SENSOR_DEFAULTS.lm35,
  "ir:distance": SENSOR_DEFAULTS.irDistance,
  "ir:threshold": SENSOR_DEFAULTS.irThreshold,
  "pir:hold": SENSOR_DEFAULTS.pirHold,
  "ultrasonic:v": SENSOR_DEFAULTS.ultrasonic,
};

export function sensorValue(values: SensorValues, kind: SensorKind, slot: number, field = "v"): number {
  return values[sensorKey(kind, slot, field)] ?? DEFAULT_OF[`${kind}:${field}`] ?? 0;
}

/** The kind mounted on an analog channel: the user's override while the sketch still reads the same, else the code's, else a potentiometer. */
export function resolveAnalogKind(ctx: SensorContext, overrides: AnalogOverrides, channel: number): AnalogSensorKind {
  const detected = ctx.analog[channel] ?? "pot";
  const o = overrides[channel];
  return o && o.detected === detected ? o.kind : detected;
}

export interface HardwareDrive {
  /** Analog channel -> 10-bit reading. */
  analog: { channel: number; value: number }[];
  /** Digital pin -> level (IR obstacle output). */
  digital: { pin: number; level: 0 | 1 }[];
  /** Echo pin -> HIGH pulse width in microseconds (HC-SR04). */
  echo: { pin: number; us: number }[];
}

/** What the mounted sensors present to the sketch right now. A plain potentiometer drives itself and is left out. */
export function hardwareDrive(ctx: SensorContext, overrides: AnalogOverrides, channels: readonly number[], values: SensorValues): HardwareDrive {
  const drive: HardwareDrive = { analog: [], digital: [], echo: [] };
  for (const channel of channels) {
    const kind = resolveAnalogKind(ctx, overrides, channel);
    if (kind === "ldr") drive.analog.push({ channel, value: ldrAdc(sensorValue(values, "ldr", channel)) });
    else if (kind === "lm35") drive.analog.push({ channel, value: lm35Adc(sensorValue(values, "lm35", channel)) });
  }
  if (ctx.ir !== null) drive.digital.push({ pin: ctx.ir, level: irLevel(sensorValue(values, "ir", ctx.ir, "distance"), sensorValue(values, "ir", ctx.ir, "threshold")) });
  if (ctx.ultrasonic) drive.echo.push({ pin: ctx.ultrasonic.echo, us: echoMicros(sensorValue(values, "ultrasonic", ctx.ultrasonic.echo)) });
  return drive;
}

/** Digital pins a mounted sensor owns, so the generic LED / push-button modules do not also claim them. */
export function sensorOwnedPins(ctx: SensorContext): number[] {
  return [ctx.pir, ctx.ir, ctx.ultrasonic?.trig ?? null, ctx.ultrasonic?.echo ?? null].filter((p): p is number => p !== null);
}
