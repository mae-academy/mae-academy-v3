import { describe, expect, it } from "vitest";
import { EMPTY_SENSOR_CONTEXT, type SensorContext } from "./codeContextAnalyzer";
import { hardwareDrive, resolveAnalogKind, sensorKey, sensorOwnedPins, sensorValue } from "./sensorMounts";
import { echoMicros, ldrAdc, lm35Adc } from "./sensorModels";

const ctx = (over: Partial<SensorContext>): SensorContext => ({ ...EMPTY_SENSOR_CONTEXT, ...over });

describe("resolveAnalogKind", () => {
  it("is a potentiometer unless the code says otherwise", () => {
    expect(resolveAnalogKind(EMPTY_SENSOR_CONTEXT, {}, 0)).toBe("pot");
    expect(resolveAnalogKind(ctx({ analog: { 1: "lm35" } }), {}, 1)).toBe("lm35");
  });
  it("lets a manual override win while the sketch's detection is unchanged", () => {
    expect(resolveAnalogKind(EMPTY_SENSOR_CONTEXT, { 0: { kind: "ldr", detected: "pot" } }, 0)).toBe("ldr");
  });
  it("drops a stale override once the code detects something different", () => {
    expect(resolveAnalogKind(ctx({ analog: { 0: "lm35" } }), { 0: { kind: "ldr", detected: "pot" } }, 0)).toBe("lm35");
  });
});

describe("sensorValue", () => {
  it("falls back to each sensor's default and honours stored values", () => {
    expect(sensorValue({}, "ldr", 0)).toBe(500);
    expect(sensorValue({}, "lm35", 1)).toBe(25);
    expect(sensorValue({}, "ultrasonic", 10)).toBe(100);
    expect(sensorValue({}, "ir", 3, "threshold")).toBe(10);
    expect(sensorValue({ [sensorKey("ldr", 0)]: 3 }, "ldr", 0)).toBe(3);
  });
});

describe("hardwareDrive", () => {
  it("converts mounted sensors to ADC counts, IR level and echo width, and leaves potentiometers alone", () => {
    const c = ctx({ analog: { 0: "ldr", 1: "lm35" }, ir: 3, ultrasonic: { trig: 9, echo: 10 } });
    const drive = hardwareDrive(c, {}, [0, 1, 2], { [sensorKey("ldr", 0)]: 10, [sensorKey("lm35", 1)]: 25, [sensorKey("ir", 3, "distance")]: 4 });
    expect(drive.analog).toEqual([
      { channel: 0, value: ldrAdc(10) },
      { channel: 1, value: lm35Adc(25) },
    ]);
    expect(drive.digital).toEqual([{ pin: 3, level: 0 }]);
    expect(drive.echo).toEqual([{ pin: 10, us: echoMicros(100) }]);
  });
  it("follows a morph: the same channel drives lux or degrees depending on the mounted kind", () => {
    const values = { [sensorKey("ldr", 0)]: 10, [sensorKey("lm35", 0)]: 25 };
    expect(hardwareDrive(EMPTY_SENSOR_CONTEXT, { 0: { kind: "ldr", detected: "pot" } }, [0], values).analog).toEqual([{ channel: 0, value: 511 }]);
    expect(hardwareDrive(EMPTY_SENSOR_CONTEXT, { 0: { kind: "lm35", detected: "pot" } }, [0], values).analog).toEqual([{ channel: 0, value: 51 }]);
    expect(hardwareDrive(EMPTY_SENSOR_CONTEXT, { 0: { kind: "pot", detected: "pot" } }, [0], values).analog).toEqual([]);
  });
});

describe("sensorOwnedPins", () => {
  it("lists every digital pin a mounted sensor claims", () => {
    expect(sensorOwnedPins(ctx({ pir: 2, ir: 3, ultrasonic: { trig: 9, echo: 10 } })).sort((a, b) => a - b)).toEqual([2, 3, 9, 10]);
    expect(sensorOwnedPins(EMPTY_SENSOR_CONTEXT)).toEqual([]);
  });
});
