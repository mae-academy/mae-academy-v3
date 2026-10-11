// @vitest-environment jsdom
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArduinoBoard } from "./ArduinoBoard";
import { EMPTY_SENSOR_CONTEXT, type SensorContext } from "./codeContextAnalyzer";
import type { HardwareSnapshot } from "./arduinoRuntime";
import { IDLE_LCD } from "./arduinoLcd";
import { sensorKey } from "./sensorMounts";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

const snapshot = (over: Partial<HardwareSnapshot> = {}): HardwareSnapshot => ({
  status: "idle",
  timeMs: 0,
  pins: Array.from({ length: 20 }, () => ({ mode: "UNSET" as const, level: 0 as const, pwm: null })),
  digitalInputs: [],
  analogInputs: [],
  inputLevels: {},
  analogValues: {},
  baud: 9600,
  txCount: 0,
  rxCount: 0,
  lcd: IDLE_LCD,
  ...over,
});
const ctx = (over: Partial<SensorContext>): SensorContext => ({ ...EMPTY_SENSOR_CONTEXT, ...over });
const noop = () => {};
const wires = (c: HTMLElement) => Array.from(c.querySelectorAll("[data-wire]")).map(w => w.getAttribute("data-wire"));

describe("sensor auto-mounting", () => {
  afterEach(cleanup);

  it("mounts the HC-SR04 with trig/echo/5V/GND jumpers and no generic LED or button on its pins", () => {
    const pins = snapshot().pins.map((p, i) => (i === 9 ? { ...p, mode: "OUTPUT" as const } : i === 10 ? { ...p, mode: "INPUT" as const } : p));
    const { container } = render(<ArduinoBoard snapshot={snapshot({ pins, digitalInputs: [10] })} onDigitalInput={noop} onAnalogInput={noop} sensors={ctx({ ultrasonic: { trig: 9, echo: 10 } })} />);
    expect(container.querySelector('[data-component="hcsr04"]')).not.toBeNull();
    expect(wires(container)).toEqual(expect.arrayContaining(["LCD-D9-signal", "LCD-D10-signal", "LCD-D10-gnd", "LCD-D10-5v"]));
    expect(container.querySelector('[data-module="O9"]')).toBeNull();
    expect(container.querySelector('[data-module="D10"]')).toBeNull();
  });

  it("mounts PIR and IR modules on their pins and exposes the Trigger Motion button", () => {
    const onPir = vi.fn();
    const { container, getByTestId } = render(<ArduinoBoard snapshot={snapshot()} onDigitalInput={noop} onAnalogInput={noop} onPirTrigger={onPir} sensors={ctx({ pir: 2, ir: 3 })} />);
    expect(container.querySelector('[data-module="PIR2"]')).not.toBeNull();
    expect(container.querySelector('[data-module="IR3"]')).not.toBeNull();
    fireEvent.click(getByTestId("pir-trigger-2"));
    expect(onPir).toHaveBeenCalledWith(2);
  });

  it("reflects the PIR output level and the IR active-low obstacle state", () => {
    const { container } = render(
      <ArduinoBoard snapshot={snapshot({ inputLevels: { 2: 1 } })} onDigitalInput={noop} onAnalogInput={noop} sensors={ctx({ pir: 2, ir: 3 })} sensorValues={{ [sensorKey("ir", 3, "distance")]: 4, [sensorKey("ir", 3, "threshold")]: 10 }} />,
    );
    expect(container.querySelector('[data-module="PIR2"]')?.getAttribute("data-high")).toBe("1");
    expect(container.querySelector('[data-module="IR3"]')?.getAttribute("data-obstacle")).toBe("1");
  });

  it("mounts an LDR on the detected channel with a lux readout and an auto badge", () => {
    const { container, getByTestId } = render(<ArduinoBoard snapshot={snapshot()} onDigitalInput={noop} onAnalogInput={noop} sensors={ctx({ analog: { 0: "ldr" } })} sensorValues={{ [sensorKey("ldr", 0)]: 10 }} />);
    expect(container.querySelector('[data-component="ldr"]')).not.toBeNull();
    expect(container.querySelector('[data-component="potentiometer"]')).toBeNull();
    expect(container.querySelector('[data-module="A0"]')?.textContent).toContain("10 lx · raw 511");
    expect(getByTestId("sensor-auto-0")).toBeTruthy();
    expect(wires(container)).toEqual(expect.arrayContaining(["LCD-A0-signal", "LCD-A0-5v", "LCD-A0-gnd"]));
  });

  it("slides in physical units and reports them through onSensorValue", () => {
    const onValue = vi.fn();
    const { container } = render(<ArduinoBoard snapshot={snapshot()} onDigitalInput={noop} onAnalogInput={noop} onSensorValue={onValue} sensors={ctx({ analog: { 1: "lm35" } })} />);
    expect(container.querySelector('[data-module="A1"]')?.textContent).toContain("25.0 °C · 250 mV · raw 51");
    fireEvent.change(container.querySelector('[data-module="A1"] input[type="range"]')!, { target: { value: "40" } });
    expect(onValue).toHaveBeenCalledWith(sensorKey("lm35", 1), 40);
  });
});

describe("quick-morph", () => {
  afterEach(cleanup);

  it("a generic analogRead channel is a potentiometer; clicking it offers the three analog parts", () => {
    const onMorph = vi.fn();
    const { container, getByTestId, queryByTestId } = render(<ArduinoBoard snapshot={snapshot({ analogInputs: [0] })} onDigitalInput={noop} onAnalogInput={noop} onAnalogMorph={onMorph} />);
    expect(container.querySelector('[data-component="potentiometer"]')).not.toBeNull();
    expect(queryByTestId("sensor-menu-0")).toBeNull();
    fireEvent.click(getByTestId("sensor-morph-0"));
    const menu = getByTestId("sensor-menu-0");
    expect(Array.from(menu.querySelectorAll("[role=menuitemradio]")).map(b => b.getAttribute("data-kind"))).toEqual(["pot", "ldr", "lm35"]);
    expect(menu.querySelector('[data-kind="pot"]')?.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(menu.querySelector('[data-kind="ldr"]')!);
    expect(onMorph).toHaveBeenCalledWith(0, "ldr");
    expect(queryByTestId("sensor-menu-0")).toBeNull();
  });

  it("an override swaps the SVG and the slider units without any change to the sketch", () => {
    const { container } = render(<ArduinoBoard snapshot={snapshot({ analogInputs: [0] })} onDigitalInput={noop} onAnalogInput={noop} analogOverrides={{ 0: { kind: "ldr", detected: "pot" } }} />);
    expect(container.querySelector('[data-component="ldr"]')).not.toBeNull();
    expect(container.querySelector('[data-component="potentiometer"]')).toBeNull();
    const slider = container.querySelector('[data-module="A0"] input[type="range"]') as HTMLInputElement;
    expect([slider.min, slider.max]).toEqual(["0", "1000"]);
    expect(container.querySelector('[data-module="A0"]')?.textContent).toContain("lx");
    expect(container.querySelector('[data-testid="sensor-auto-0"]')).toBeNull(); // chosen by hand, not auto-detected
  });

  it("closes the menu when clicking elsewhere", () => {
    const { getByTestId, queryByTestId } = render(<ArduinoBoard snapshot={snapshot({ analogInputs: [0] })} onDigitalInput={noop} onAnalogInput={noop} />);
    fireEvent.click(getByTestId("sensor-morph-0"));
    expect(getByTestId("sensor-menu-0")).toBeTruthy();
    fireEvent.click(document.body);
    expect(queryByTestId("sensor-menu-0")).toBeNull();
  });
});

describe("existing circuits are untouched without sensors", () => {
  afterEach(cleanup);
  it("keeps the fixed 800x600 canvas and generic modules", () => {
    const pins = snapshot().pins.map((p, i) => (i === 9 ? { ...p, mode: "OUTPUT" as const } : p));
    const { container } = render(<ArduinoBoard snapshot={snapshot({ pins })} layout={{ digitalInputs: [2], pullups: [], analogInputs: [0], outputs: [9] }} onDigitalInput={noop} onAnalogInput={noop} />);
    expect(container.querySelector('[style*="width: 800px"][style*="height: 600px"]')).not.toBeNull();
    expect(container.querySelector('[data-module="O9"]')).not.toBeNull();
    expect(container.querySelector('[data-module="D2"]')).not.toBeNull();
    expect(container.querySelector('[data-component="potentiometer"]')).not.toBeNull();
  });
});
