// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MascotState } from "@shared/aiTypes";
import fs from "node:fs";
import path from "node:path";
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
const POSE_FOR_STATE: Record<MascotState, string> = {
  idle: "idle",
  listening: "idle",
  thinking: "thinking",
  eureka: "eureka",
  talking: "talking",
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
        // exactly one image role: the artwork <img>s are presentational
        expect(container.querySelectorAll('[role="img"]')).toHaveLength(1);
        for (const img of Array.from(container.querySelectorAll("img"))) {
          expect(img.getAttribute("alt")).toBe("");
          expect(img.getAttribute("aria-hidden")).toBe("true");
        }
      });
    }
  }

  it("mounts the real artwork files, never procedural paths", () => {
    const { container } = render(<MaiMascot state="thinking" />);
    expect(container.querySelector("svg")).toBeNull();
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs.sort()).toEqual(["/mascot/eureka.svg", "/mascot/idle.svg", "/mascot/talking.svg", "/mascot/thinking.svg"]);
  });

  it("shows the pose for the state and hides the others (listening reuses idle)", () => {
    for (const state of STATES) {
      const { container, unmount } = render(<MaiMascot state={state} />);
      const visible = Array.from(container.querySelectorAll("img"))
        .filter((i) => i.classList.contains("opacity-100"))
        .map((i) => i.getAttribute("src"));
      expect(visible).toEqual([`/mascot/${POSE_FOR_STATE[state]}.svg`]);
      unmount();
    }
  });

  it("avatar loads only the current pose, cropped to the head inside a round frame", () => {
    const { container } = render(<MaiMascot state="talking" variant="avatar" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains("mai-avatar")).toBe(true);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe("/mascot/talking.svg");
  });

  it("lets stateLabels override per state and label override everything", () => {
    const { rerender } = render(<MaiMascot state="thinking" stateLabels={{ thinking: "Mai réfléchit" }} />);
    expect(screen.getByRole("img", { name: "Mai réfléchit" })).toBeTruthy();
    rerender(<MaiMascot state="idle" stateLabels={{ thinking: "Mai réfléchit" }} />);
    expect(screen.getByRole("img", { name: DEFAULT_LABELS.idle })).toBeTruthy();
    rerender(<MaiMascot state="eureka" label="Custom" stateLabels={{ eureka: "ignored" }} />);
    expect(screen.getByRole("img", { name: "Custom" })).toBeTruthy();
  });

  it("only shows the glowing bulb in eureka and the pulsing thought dots when thinking (hero)", () => {
    const { container, rerender } = render(<MaiMascot state="idle" />);
    expect(container.querySelector(".mai-bulb")).toBeNull();
    expect(container.querySelector(".mai-dot")).toBeNull();
    rerender(<MaiMascot state="eureka" />);
    expect(container.querySelector(".mai-bulb")).toBeTruthy();
    rerender(<MaiMascot state="thinking" />);
    expect(container.querySelector(".mai-bulb")).toBeNull();
    const dots = container.querySelectorAll(".mai-dot");
    expect(dots).toHaveLength(3);
    for (const dot of Array.from(dots)) expect(dot.classList.contains("animate-pulse")).toBe(true);
  });

  it("injects its scoped, reduced-motion-aware CSS once", () => {
    render(<MaiMascot state="talking" />);
    render(<MaiMascot state="idle" variant="avatar" />);
    const styles = document.querySelectorAll("#mai-mascot-css");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain("prefers-reduced-motion: reduce");
    expect(styles[0].textContent).toContain("mai-bob");
  });

  it("is animated by default and freezes with animated={false} (older transcript avatars)", () => {
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

describe("mascot artwork files", () => {
  const dir = path.resolve(__dirname, "../../../public/mascot");

  for (const pose of ["idle", "thinking", "eureka", "talking"]) {
    it(`${pose}.svg is a transparent keyed asset, not the green-screen original`, () => {
      const svg = fs.readFileSync(path.join(dir, `${pose}.svg`), "utf8");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("data:image/webp;base64,");
      // the keyed export is a single transparent image: no background rect, no chroma-green fill
      expect(svg).not.toMatch(/<rect/);
      expect(svg).not.toMatch(/#00ff00/i);
      // ~60 KB each; the green-screen originals were ~650 KB
      expect(svg.length).toBeLessThan(150 * 1024);
    });
  }
});
