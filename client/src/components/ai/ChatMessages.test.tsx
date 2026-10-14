// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatMessage, SimLab } from "@shared/aiTypes";
import { AssistantMessage, UserMessage, assistantView } from "./ChatMessages";

afterEach(cleanup);

const model = (content: string): ChatMessage => ({ id: "m1", role: "model", content, timestamp: 1 });
const renderAssistant = (content: string, streaming: boolean, live = true) =>
  render(<AssistantMessage message={model(content)} streaming={streaming} live={live} mascotState="idle" stateLabels={{}} sharedAvatar={false} />);

describe("assistantView", () => {
  it("hides complete and partial markers and only reports the lab for finished answers", () => {
    expect(assistantView("Use KVL.\n[[SIM:circuits]]", false)).toEqual({ text: "Use KVL.", lab: "circuits" });
    expect(assistantView("Use KVL.\n[[SIM:circuits]]", true)).toEqual({ text: "Use KVL.", lab: null });
    for (const partial of ["Use KVL.\n[[", "Use KVL.\n[[SIM:", "Use KVL.\n[[SIM:circ"]) {
      expect(assistantView(partial, true)).toEqual({ text: "Use KVL.", lab: null });
    }
    expect(assistantView("No simulator here.", false)).toEqual({ text: "No simulator here.", lab: null });
  });
});

describe("AssistantMessage simulator action", () => {
  it("never shows marker text while streaming, and has no button yet", () => {
    for (const partial of ["Answer so far [[", "Answer so far [[SIM:con", "Answer so far\n[[SIM:control]]"]) {
      const { container, unmount } = renderAssistant(partial, true);
      expect(container.textContent).not.toContain("[[");
      expect(container.textContent).not.toContain("SIM:");
      expect(screen.queryByRole("link")).toBeNull();
      unmount();
    }
  });

  it("shows the action for a completed answer with a lab, linking to the right simulator, and still hides the marker", () => {
    const expected: Record<SimLab, string> = {
      circuits: "/simulations/circuit-lab",
      power: "/simulations/power-electronics",
      logic: "/simulations/digital-logic-design",
      control: "/simulations/control-systems",
      code: "/simulations/code",
      arduino: "/simulations/arduino-studio",
      signals: "/simulations/signals-and-systems",
      fluid: "/simulations/pneumatics-and-hydraulics",
      plc: "/simulations/plc",
    };
    for (const [lab, href] of Object.entries(expected)) {
      const { container, unmount } = renderAssistant(`Done.\n[[SIM:${lab}]]`, false);
      const link = screen.getByRole("link", { name: /Open in Interactive Simulator/ });
      expect(link.getAttribute("href")).toBe(href);
      expect(container.textContent).not.toContain("[[SIM");
      unmount();
    }
  });

  it("shows no action for a completed answer without a marker", () => {
    renderAssistant("Just an explanation.", false);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Just an explanation.")).toBeTruthy();
  });

  it("shows typing dots (and no stray text) while waiting for the first token, even when only a partial marker has arrived", () => {
    const { container, rerender } = renderAssistant("", true);
    expect(container.querySelector(".motion-safe\\:animate-bounce")).toBeTruthy();
    rerender(<AssistantMessage message={model("[[SIM:")} streaming live mascotState="thinking" stateLabels={{}} sharedAvatar={false} />);
    expect(container.querySelector(".motion-safe\\:animate-bounce")).toBeTruthy();
    expect(container.textContent).not.toContain("[[");
  });

  it("only the live avatar is animated and exposed as an image", () => {
    const live = renderAssistant("Hi", false, true);
    expect(screen.getByRole("img").classList.contains("mai-static")).toBe(false);
    live.unmount();
    const { container } = renderAssistant("Hi", false, false);
    expect(container.querySelector(".mai-static")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("UserMessage", () => {
  it("renders the user's text and attached image", () => {
    render(<UserMessage message={{ id: "u", role: "user", content: "hello", timestamp: 1, imageUrl: "data:image/png;base64,AAAA" }} onImageLoad={() => {}} />);
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.getByAltText("Attached image")).toBeTruthy();
  });
});
