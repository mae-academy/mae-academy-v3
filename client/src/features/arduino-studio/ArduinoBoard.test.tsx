// @vitest-environment jsdom
import { render, act, fireEvent, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ArduinoBoard } from "./ArduinoBoard";
import type { HardwareSnapshot } from "./arduinoRuntime";
import { IDLE_LCD } from "./arduinoLcd";

// Mock ResizeObserver for JSDOM
let resizeCallback: (entries: ResizeObserverEntry[]) => void;
class MockResizeObserver {
  constructor(cb: (entries: ResizeObserverEntry[]) => void) {
    resizeCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", MockResizeObserver);

const defaultSnapshot: HardwareSnapshot = {
  status: "idle",
  timeMs: 0,
  pins: Array.from({ length: 20 }, () => ({ mode: "UNSET", level: 0, pwm: null })),
  digitalInputs: [],
  analogInputs: [],
  inputLevels: {},
  analogValues: {},
  baud: 9600,
  txCount: 0,
  rxCount: 0,
  lcd: IDLE_LCD,
};

describe("ArduinoBoard Scale-Transform Wrapper", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the outer flexible container and the fixed 800x600 inner canvas", () => {
    const { container } = render(
      <div style={{ width: 1000, height: 750 }}>
        <ArduinoBoard
          snapshot={defaultSnapshot}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
        />
      </div>
    );

    // Outer container has overflow-hidden
    const outer = container.querySelector(".overflow-hidden");
    expect(outer).toBeDefined();

    // Inner canvas has fixed width 800, height 600
    const innerCanvas = container.querySelector('[style*="width: 800px"][style*="height: 600px"]');
    expect(innerCanvas).not.toBeNull();
  });

  it("dynamically computes transform scale when container resizes", async () => {
    const { container } = render(
      <div style={{ width: 1000, height: 800 }}>
        <ArduinoBoard
          snapshot={defaultSnapshot}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
        />
      </div>
    );

    const innerCanvas = container.querySelector('[style*="width: 800px"][style*="height: 600px"]') as HTMLElement;
    expect(innerCanvas).not.toBeNull();

    await act(async () => {
      resizeCallback([
        {
          contentRect: { width: 1000, height: 800 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ]);
    });

    expect(innerCanvas.style.transform).toBe("scale(1.1875)");
    expect(innerCanvas.style.transformOrigin).toBe("center center");

    await act(async () => {
      resizeCallback([
        {
          contentRect: { width: 400, height: 300 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ]);
    });

    expect(innerCanvas.style.transform).toBe("scale(0.475)");
  });

  it("renders peripherals inside the fixed canvas without coordinate drifting", async () => {
    const snapshotWithPeripherals: HardwareSnapshot = {
      ...defaultSnapshot,
      pins: defaultSnapshot.pins.map((p, i) =>
        i === 8 ? { mode: "OUTPUT", level: 1, pwm: null } : p
      ),
      analogInputs: [0],
      analogValues: { 0: 750 },
    };

    const { container } = render(
      <ArduinoBoard
        snapshot={snapshotWithPeripherals}
        onDigitalInput={() => {}}
        onAnalogInput={() => {}}
        layout={{ outputs: [8], digitalInputs: [], pullups: [], analogInputs: [0] }}
      />
    );

    const d8Module = container.querySelector('[data-module="O8"]');
    expect(d8Module).not.toBeNull();

    const a0Module = container.querySelector('[data-module="A0"]');
    expect(a0Module).not.toBeNull();

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(slider.value).toBe("750");
  });

  describe("3-State Cable Logic & Deep Plug Insertion", () => {
    it("State 1 (Stopped/Idle): USB is connected (1.0 opacity), DC is unplugged/retracted (0.35 opacity)", () => {
      const { container } = render(
        <ArduinoBoard
          snapshot={{ ...defaultSnapshot, status: "idle" }}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
        />
      );

      const usbGroup = container.querySelector('[data-usb="plugged"]') as HTMLElement;
      expect(usbGroup).not.toBeNull();
      expect(usbGroup.style.opacity).toBe("1");
      expect(usbGroup.style.transform).toContain("14px");

      const dcGroup = container.querySelector('[data-dc="unplugged"]') as HTMLElement;
      expect(dcGroup).not.toBeNull();
      expect(dcGroup.style.opacity).toBe("0.35");
      expect(dcGroup.style.transform).toContain("-28px");
    });

    it("State 2 (Running): USB is unplugged/retracted (0.35 opacity), DC is connected (1.0 opacity)", () => {
      const { container } = render(
        <ArduinoBoard
          snapshot={{ ...defaultSnapshot, status: "running" }}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
        />
      );

      const usbGroup = container.querySelector('[data-usb="retracted"]') as HTMLElement;
      expect(usbGroup).not.toBeNull();
      expect(usbGroup.style.opacity).toBe("0.35");
      expect(usbGroup.style.transform).toContain("-22px");

      const dcGroup = container.querySelector('[data-dc="plugged"]') as HTMLElement;
      expect(dcGroup).not.toBeNull();
      expect(dcGroup.style.opacity).toBe("1");
      expect(dcGroup.style.transform).toContain("12px");
    });

    it("State 3 (Paused): USB is re-connected (1.0 opacity) and DC remains connected (1.0 opacity)", () => {
      const { container } = render(
        <ArduinoBoard
          snapshot={{ ...defaultSnapshot, status: "paused" }}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
        />
      );

      const usbGroup = container.querySelector('[data-usb="plugged"]') as HTMLElement;
      expect(usbGroup).not.toBeNull();
      expect(usbGroup.style.opacity).toBe("1");

      const dcGroup = container.querySelector('[data-dc="plugged"]') as HTMLElement;
      expect(dcGroup).not.toBeNull();
      expect(dcGroup.style.opacity).toBe("1");
    });
  });

  describe("Interactive LED Color Picker", () => {
    const snapshotWithLed: HardwareSnapshot = {
      ...defaultSnapshot,
      pins: defaultSnapshot.pins.map((p, i) =>
        i === 9 ? { mode: "OUTPUT", level: 1, pwm: null } : p
      ),
    };

    it("opens color picker popover when LED trigger button is clicked", () => {
      const { container } = render(
        <ArduinoBoard
          snapshot={snapshotWithLed}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
          layout={{ outputs: [9], digitalInputs: [], pullups: [], analogInputs: [] }}
        />
      );

      const trigger = container.querySelector('[data-testid="led-trigger-9"]');
      expect(trigger).not.toBeNull();

      expect(screen.queryByTestId("led-color-picker-9")).toBeNull();

      fireEvent.click(trigger!);

      const picker = screen.getByTestId("led-color-picker-9");
      expect(picker).toBeDefined();

      // Standard color options: Red, Green, Blue, Yellow, White
      expect(screen.getByTitle("Red (#EF4444)")).toBeDefined();
      expect(screen.getByTitle("Green (#22C55E)")).toBeDefined();
      expect(screen.getByTitle("Blue (#3B82F6)")).toBeDefined();
      expect(screen.getByTitle("Yellow (#EAB308)")).toBeDefined();
      expect(screen.getByTitle("White (#F8FAFC)")).toBeDefined();
    });

    it("updates LED color immediately when color swatch is selected and notifies callback", () => {
      const onColorChange = vi.fn();
      const { container } = render(
        <ArduinoBoard
          snapshot={snapshotWithLed}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
          layout={{ outputs: [9], digitalInputs: [], pullups: [], analogInputs: [] }}
          onLedColorChange={onColorChange}
        />
      );

      // Open color picker
      fireEvent.click(container.querySelector('[data-testid="led-trigger-9"]')!);

      // Click Blue option (#3B82F6)
      const blueBtn = screen.getByTitle("Blue (#3B82F6)");
      fireEvent.click(blueBtn);

      expect(onColorChange).toHaveBeenCalledWith(9, "#3B82F6");
      // Popover closes after selecting
      expect(screen.queryByTestId("led-color-picker-9")).toBeNull();
    });

    it("automatically closes color picker popover when clicking outside", () => {
      const { container } = render(
        <ArduinoBoard
          snapshot={snapshotWithLed}
          onDigitalInput={() => {}}
          onAnalogInput={() => {}}
          layout={{ outputs: [9], digitalInputs: [], pullups: [], analogInputs: [] }}
        />
      );

      fireEvent.click(container.querySelector('[data-testid="led-trigger-9"]')!);
      expect(screen.getByTestId("led-color-picker-9")).toBeDefined();

      // Click outside on window
      fireEvent.click(window);
      expect(screen.queryByTestId("led-color-picker-9")).toBeNull();
    });
  });
});
