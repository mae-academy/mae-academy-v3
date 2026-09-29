// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TerminalSurface } from "./Terminal";

describe("TerminalSurface", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders empty label when no stdout or video is provided", () => {
    render(<TerminalSurface emptyLabel="Console ready" />);
    expect(screen.getByText("Console ready")).toBeTruthy();
  });

  it("renders standard stdout without process exit message", () => {
    render(<TerminalSurface stdout="Hello World" emptyLabel="Console ready" />);
    expect(screen.getByText("Hello World")).toBeTruthy();
    expect(screen.queryByTestId("terminal-exit-footer")).toBeNull();
  });

  it("renders [Process exited with code 0] in muted system footer", () => {
    render(
      <TerminalSurface
        stdout={"Hello World\n[Process exited with code 0]"}
        emptyLabel="Console ready"
      />
    );

    expect(screen.getByText("Hello World")).toBeTruthy();

    const footer = screen.getByTestId("terminal-exit-footer");
    expect(footer).toBeTruthy();
    expect(footer.textContent).toBe("[Process exited with code 0]");
    expect(footer.className).toContain("mae-code-mono");
    expect(footer.className).toContain("text-slate-500");
    expect(footer.className).toContain("italic");
    expect(footer.className).toContain("mt-2");
  });

  it("renders process exit footer when stdout contains only exit message", () => {
    render(
      <TerminalSurface
        stdout="[Process exited with code 1]"
        emptyLabel="Console ready"
      />
    );

    const footer = screen.getByTestId("terminal-exit-footer");
    expect(footer).toBeTruthy();
    expect(footer.textContent).toBe("[Process exited with code 1]");
  });
});
