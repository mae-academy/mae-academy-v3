// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ArduinoStudio } from "./ArduinoStudio";

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

// Mock matchMedia for desktop
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

describe("ArduinoStudio Nested IDE Split-Pane Layout", () => {
  it("renders the outer horizontal panel group splitting Left (Code) and Right (Visuals)", () => {
    const { container } = render(<ArduinoStudio />);

    // Check sketch.ino exists in left panel
    const sketchTitle = container.querySelector("span.font-mono");
    expect(sketchTitle?.textContent).toContain("sketch.ino");

    // Check board.uno exists
    const boardTitle = Array.from(container.querySelectorAll("span.font-mono")).find(el =>
      el.textContent?.includes("board.uno")
    );
    expect(boardTitle).toBeDefined();

    // Check serial.monitor exists
    const serialTitle = Array.from(container.querySelectorAll("span.font-mono")).find(el =>
      el.textContent?.includes("serial.monitor")
    );
    expect(serialTitle).toBeDefined();

    // Verify panel groups exist
    const panelGroups = container.querySelectorAll("[data-panel-group]");
    expect(panelGroups.length).toBeGreaterThanOrEqual(2);

    // Outer panel group direction should be horizontal on desktop
    const outerGroup = panelGroups[0];
    expect(outerGroup.getAttribute("data-panel-group-direction")).toBe("horizontal");

    // Right nested panel group direction should be vertical
    const rightGroup = panelGroups[1];
    expect(rightGroup.getAttribute("data-panel-group-direction")).toBe("vertical");
  });
});
