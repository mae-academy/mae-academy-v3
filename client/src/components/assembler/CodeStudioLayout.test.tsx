// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AssemblerStudio, CodeStudio } from "./AssemblerStudio";
import { getEditorText } from "@/components/code-editor/testing";

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

// Mock wouter useLocation
vi.mock("wouter", () => ({
  useLocation: () => ["/simulations/code/masm8086", vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("Code Studio Nested IDE Split-Pane Layout", () => {
  it("renders outer horizontal group splitting Left (Code) and Right (Visuals) and right vertical nested group", () => {
    const { container } = render(<CodeStudio />);

    // Verify Code Editor title exists in left panel
    const editorTitle = Array.from(container.querySelectorAll("span.font-mono")).find(el =>
      el.textContent?.includes(".asm")
    );
    expect(editorTitle).toBeDefined();

    // Verify terminal.out exists in top right panel
    const terminalTitle = Array.from(container.querySelectorAll("span.font-mono")).find(el =>
      el.textContent?.includes("terminal.out")
    );
    expect(terminalTitle).toBeDefined();

    // Verify inspector.exe exists in bottom right panel
    const inspectorTitle = Array.from(container.querySelectorAll("span.font-mono")).find(el =>
      el.textContent?.includes("inspector.exe")
    );
    expect(inspectorTitle).toBeDefined();

    // Verify inspector tabs exist in bottom right panel
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();

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

  it("updates editor code when an example is selected from dropdown", async () => {
    const { container } = render(<CodeStudio />);
    const select = container.querySelector("select[aria-label='Examples library']") as HTMLSelectElement;
    expect(select).not.toBeNull();

    // Change value to Bubble Sort Algorithm (Ascending Order)
    const targetExample = "Bubble Sort Algorithm (Ascending Order)";
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(select, { target: { value: targetExample } });

    // The editor content should reflect the new example code
    const source = getEditorText(container.querySelector(".cm-content") as HTMLElement);
    expect(source).toContain("array db 5, 2, 9, 1, 4");
    expect(source).toContain("outer:");
  });
});
