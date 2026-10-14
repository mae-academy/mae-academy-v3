// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SimulationPageHeader from "./SimulationPageHeader";

beforeEach(() => window.history.replaceState(null, "", "/simulations/control-systems/pid"));
afterEach(cleanup);

describe("SimulationPageHeader MAE AI button", () => {
  it("is absent unless aiLab is passed, so existing pages keep their layout", () => {
    render(<SimulationPageHeader title="Control Systems" backLabel="Simulations" />);
    expect(screen.queryByRole("button", { name: /MAE AI/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Control Systems" })).toBeTruthy();
  });

  it("shows the button below the title and opens the chat preset to the lab", () => {
    render(<SimulationPageHeader title="Control Systems" aiLab="control" />);
    const button = screen.getByRole("button", { name: "Chat with MAE AI" });
    expect(button.className).toContain("min-h-[44px]");
    fireEvent.click(button);
    expect(window.location.pathname + window.location.search).toBe("/ai?lab=control");
  });

  it("works for every lab key", () => {
    render(<SimulationPageHeader aiLab="circuits" />);
    fireEvent.click(screen.getByRole("button", { name: /MAE AI/ }));
    expect(window.location.search).toBe("?lab=circuits");
  });
});
