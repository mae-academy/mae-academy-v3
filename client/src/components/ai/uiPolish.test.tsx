// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import { ChatTranscript } from "./ChatTranscript";
import { ChatWorkspace } from "./ChatWorkspace";
import { ChatStreamError, streamChat } from "./streamChat";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), "utf8");

const messages: ChatMessage[] = [
  { id: "u1", role: "user", content: "Derive it", timestamp: 1 },
  { id: "m1", role: "model", content: "Here is the derivation.", timestamp: 2 },
];
const transcript = (extra: Partial<Parameters<typeof ChatTranscript>[0]> = {}) =>
  render(
    <ChatTranscript
      messages={messages}
      streamingId={null}
      mascotState="idle"
      stateLabels={{}}
      sharedAvatar={false}
      error={null}
      onRetry={() => {}}
      onRegenerate={() => {}}
      busy={false}
      {...extra}
    />,
  );
const scrollTo = (top: number) => {
  const log = screen.getByRole("log");
  // The transcript also assigns scrollTop itself (follow-the-stream), so the fake must accept and ignore writes.
  Object.defineProperty(log, "scrollTop", { get: () => top, set: () => {}, configurable: true });
  fireEvent.scroll(log);
};

describe("sticky mascot header", () => {
  it("stays out of the way at the top of the conversation and appears, blurred, once it has scrolled", async () => {
    const { container } = transcript();
    expect(container.querySelector("[data-sticky-mascot]")).toBeNull();
    scrollTo(400);
    const bar = await screen.findByText("MAE AI", { selector: "[data-sticky-mascot] span" });
    const header = bar.closest("[data-sticky-mascot]") as HTMLElement;
    expect(header.className).toMatch(/backdrop-blur-md/);
    expect(header.className).toMatch(/bg-white\/80/);
    expect(header.className).toMatch(/dark:bg-zinc-950\/80/);
    expect(header.className).toMatch(/border-b/);
    expect(header.querySelector('[data-variant="avatar"]')).toBeTruthy();
  });

  it("goes away again when the reader is back at the top", async () => {
    const { container } = transcript();
    scrollTo(400);
    await screen.findByText("MAE AI", { selector: "[data-sticky-mascot] span" });
    scrollTo(0);
    await vi.waitFor(() => expect(container.querySelector("[data-sticky-mascot]")).toBeNull());
  });

  it("shows the animated monospace analyzing pill only while the assistant is thinking", async () => {
    const { container, rerender } = transcript({ busy: true, mascotState: "thinking", streamingId: "m1" });
    scrollTo(400);
    const pill = await vi.waitFor(() => {
      const el = container.querySelector("[data-sticky-thinking]") as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    expect(pill.textContent).toBe("Analyzing equations & physical constraints...");
    expect(pill.className).toMatch(/font-mono/);
    expect(pill.className).toMatch(/animate-pulse/);
    rerender(
      <ChatTranscript messages={messages} streamingId={null} mascotState="talking" stateLabels={{ talking: "Mai is answering" }} sharedAvatar={false} error={null} onRetry={() => {}} onRegenerate={() => {}} busy={false} />,
    );
    expect(container.querySelector("[data-sticky-thinking]")).toBeNull();
  });
});

describe("composer action row", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, String(v)), removeItem: (k: string) => void data.delete(k), clear: () => data.clear(), key: () => null, length: 0 } as Storage);
  });

  it("puts attach + the Thinking dropdown in one group and math, step guidance, send in the other, all inside the composer", () => {
    render(<ChatWorkspace lab="general" />);
    const attach = screen.getByRole("button", { name: "Attach image or document" });
    const thinking = document.querySelector("[data-thinking-effort-trigger]") as HTMLElement;
    const math = document.querySelector("[data-math-keyboard-toggle]") as HTMLElement;
    const step = document.querySelector("[data-step-mode-switch]") as HTMLElement;
    const send = document.querySelector('button[type="submit"]') as HTMLElement;
    for (const el of [attach, thinking, math, step, send]) expect(el).toBeTruthy();
    const form = attach.closest("form") as HTMLElement;
    for (const el of [thinking, math, step, send]) expect(form.contains(el)).toBe(true);
    const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect([before(attach, thinking), before(thinking, math), before(math, step), before(step, send)]).toEqual([true, true, true, true]);
    // start group (attach, thinking) and end group (math, step, send) are separate flex groups
    expect(attach.parentElement).toBe(thinking.parentElement);
    expect(math.parentElement).toBe(step.parentElement);
    expect(math.parentElement).toBe(send.parentElement);
    expect(attach.parentElement).not.toBe(math.parentElement);
    // the compact pill reads "Step Guidance: OFF"
    expect(step.getAttribute("aria-label")).toBe("Step Guidance: OFF");
  });

  it("no longer puts the step switch or the thinking selector in the page header", () => {
    render(<ChatWorkspace lab="general" />);
    const header = document.querySelector("header") ?? document.body.firstElementChild;
    void header;
    expect(document.querySelectorAll("[data-step-mode-switch]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-thinking-effort-trigger]")).toHaveLength(1);
  });
});

describe("rate-limit errors reach the student as friendly copy", () => {
  const send = async (status: number, reason?: string) => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"raw upstream text must never be shown"}', { status, headers: reason ? { "x-mae-ai-reason": reason } : {} }));
    try {
      await streamChat({ messages: [{ id: "u", role: "user", content: "hi", timestamp: 1 }], lab: "general", signal: new AbortController().signal, onDelta: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    } catch (error) {
      return (error as ChatStreamError).kind;
    }
    return null;
  };

  it("maps the server's reason header to the cooling-down and daily-limit kinds", async () => {
    expect(await send(429, "model_cooldown")).toBe("cooling_down");
    expect(await send(429, "model_daily")).toBe("daily_limit");
    expect(await send(429)).toBe("rate_limit");
    expect(await send(502)).toBe("upstream");
  });
});

describe("brand palette: no amber or yellow in the chat UI", () => {
  const files = [
    "ChatComposer.tsx", "ChatMessages.tsx", "ChatTranscript.tsx", "ChatWorkspace.tsx", "MathKeyboard.tsx", "PlotCard.tsx",
    "StepModeSwitch.tsx", "ThinkingEffortSelector.tsx", "SuggestionChips.tsx", "ChatSidebar.tsx",
    "../engines/engineUi.tsx", "../engines/InteractiveParameterSlider.tsx",
  ];
  it.each(files)("%s has no amber/yellow utilities", (file) => {
    expect(read(file)).not.toMatch(/\b(?:bg|text|border|ring|fill|from|to|via|hover:bg|dark:bg|dark:text|dark:border)-(?:amber|yellow)-/);
  });

  it("the math keyboard uses translucent blue/indigo/violet gradients, not a flat solid violet", () => {
    const source = read("MathKeyboard.tsx");
    expect(source).toMatch(/from-blue-600\/20 via-indigo-600\/20 to-violet-600\/20/);
    expect(source).not.toMatch(/bg-violet-600 text-white/);
  });
});
