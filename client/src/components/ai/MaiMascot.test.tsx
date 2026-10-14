// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MascotState } from "@shared/aiTypes";
import MaiMascot, { MaiMascot as NamedMaiMascot } from "./MaiMascot";

afterEach(cleanup);

const STATES: MascotState[] = ["idle", "listening", "thinking", "eureka", "talking"];
const DEFAULT_LABELS: Record<MascotState, string> = {
  idle: "Mai, the MAE AI assistant, is ready",
  listening: "Mai is listening",
  thinking: "Mai is thinking",
  eureka: "Mai has an answer",
  talking: "Mai is answering",
};

describe("MaiMascot", () => {
  it("has matching default and named exports", () => {
    expect(MaiMascot).toBe(NamedMaiMascot);
  });

  for (const variant of ["hero", "avatar"] as const) {
    for (const state of STATES) {
      it(`renders ${variant}/${state} with data-state, role and a default label`, () => {
        const { container } = render(<MaiMascot state={state} variant={variant} />);
        const root = screen.getByRole("img", { name: DEFAULT_LABELS[state] });
        expect(root.getAttribute("data-state")).toBe(state);
        expect(root.getAttribute("data-variant")).toBe(variant);
        expect(root.classList.contains("mai-root")).toBe(true);
        // exactly one image role: the SVG internals are presentational
        expect(container.querySelectorAll('[role="img"]')).toHaveLength(1);
        expect(container.querySelector("svg path")).toBeTruthy();
      });
    }
  }

  it("defaults to the hero variant (an svg root) and the avatar is a round frame around the same art", () => {
    const hero = render(<MaiMascot state="idle" />);
    expect(hero.container.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(hero.container.firstElementChild?.getAttribute("data-variant")).toBe("hero");
    cleanup();
    const avatar = render(<MaiMascot state="idle" variant="avatar" />);
    const root = avatar.container.firstElementChild as HTMLElement;
    expect(root.classList.contains("mai-avatar")).toBe(true);
    expect(root.querySelector("svg")?.getAttribute("viewBox")).not.toBe(hero.container.querySelector("svg")?.getAttribute("viewBox"));
  });

  it("lets stateLabels override per state and label override everything", () => {
    const { rerender } = render(<MaiMascot state="thinking" stateLabels={{ thinking: "Mai réfléchit" }} />);
    expect(screen.getByRole("img", { name: "Mai réfléchit" })).toBeTruthy();
    rerender(<MaiMascot state="idle" stateLabels={{ thinking: "Mai réfléchit" }} />);
    expect(screen.getByRole("img", { name: DEFAULT_LABELS.idle })).toBeTruthy();
    rerender(<MaiMascot state="eureka" label="Custom" stateLabels={{ eureka: "ignored" }} />);
    expect(screen.getByRole("img", { name: "Custom" })).toBeTruthy();
  });

  it("only shows the lightbulb in eureka and the thought dots when thinking (hero)", () => {
    const { container, rerender } = render(<MaiMascot state="idle" />);
    expect(container.querySelector(".mai-bulb")).toBeNull();
    expect(container.querySelector(".mai-dot")).toBeNull();
    rerender(<MaiMascot state="eureka" />);
    expect(container.querySelector(".mai-bulb")).toBeTruthy();
    rerender(<MaiMascot state="thinking" />);
    expect(container.querySelector(".mai-bulb")).toBeNull();
    expect(container.querySelectorAll(".mai-dot")).toHaveLength(3);
  });

  it("animates the mouth only while talking and injects its scoped, reduced-motion-aware CSS once", () => {
    const { container, rerender } = render(<MaiMascot state="talking" />);
    expect(container.querySelector(".mai-talk-mouth")).toBeTruthy();
    rerender(<MaiMascot state="idle" />);
    expect(container.querySelector(".mai-talk-mouth")).toBeNull();
    render(<MaiMascot state="idle" variant="avatar" />);
    const styles = document.querySelectorAll("#mai-mascot-css");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain("prefers-reduced-motion: reduce");
  });

  it("is animated by default and freezes with animated={false} (older transcript avatars), in the shared stylesheet too", () => {
    for (const variant of ["hero", "avatar"] as const) {
      const live = render(<MaiMascot state="idle" variant={variant} />);
      expect(screen.getByRole("img").classList.contains("mai-static")).toBe(false);
      live.unmount();
      render(<MaiMascot state="idle" variant={variant} animated={false} />);
      expect(screen.getByRole("img").classList.contains("mai-static")).toBe(true);
      cleanup();
    }
    expect(document.getElementById("mai-mascot-css")?.textContent).toContain(".mai-static");
  });

  it("passes className through to the root", () => {
    render(<MaiMascot state="idle" variant="avatar" className="size-14 custom" />);
    const root = screen.getByRole("img");
    expect(root.classList.contains("custom")).toBe(true);
    expect(root.classList.contains("size-14")).toBe(true);
    expect(root.classList.contains("size-10")).toBe(false);
  });
});
