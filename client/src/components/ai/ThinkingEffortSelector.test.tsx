// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THINKING_EFFORT_KEY, loadThinkingEffort, saveThinkingEffort } from "./chatStorage";
import { streamChat } from "./streamChat";
import { ThinkingEffortSelector } from "./ThinkingEffortSelector";

afterEach(cleanup);

const openMenu = () => fireEvent.keyDown(screen.getByRole("button", { name: /^Thinking:/ }), { key: "Enter" });

describe("ThinkingEffortSelector", () => {
  it("is a compact dropdown trigger that names the current level and explains it in a tooltip", () => {
    render(<ThinkingEffortSelector value="medium" onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Thinking: Medium (Balanced)" });
    expect(trigger.getAttribute("title")).toBe("Recommended for engineering coursework");
    expect(trigger.getAttribute("data-thinking-effort")).toBe("medium");
    cleanup();
    render(<ThinkingEffortSelector value="low" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Thinking: Low (Fast)" }).getAttribute("title")).toBe("Fast answers, minimal reasoning tokens");
    cleanup();
    render(<ThinkingEffortSelector value="high" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Thinking: High (Deep)" }).getAttribute("title")).toBe("Exhaustive step-by-step proofs & complex matrices");
  });

  it("opens a plain-text menu of Low / Medium / High with exactly the current level checked, hints as tooltips", () => {
    render(<ThinkingEffortSelector value="medium" onChange={() => {}} />);
    openMenu();
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.getAttribute("data-thinking-effort-option"))).toEqual(["low", "medium", "high"]);
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(items.map((i) => i.textContent)).toEqual(["Low (Fast)", "Medium (Balanced)", "High (Deep)"]);
    expect(items.map((i) => i.querySelectorAll(":scope > svg").length)).toEqual([0, 1, 0]); // only the checkmark on the selected level
    expect(items[0].getAttribute("title")).toBe("Fast answers, minimal reasoning tokens");
    expect(items[2].getAttribute("title")).toBe("Exhaustive step-by-step proofs & complex matrices");
  });

  it("reports the chosen level", () => {
    const onChange = vi.fn();
    render(<ThinkingEffortSelector value="medium" onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /High/ }));
    expect(onChange).toHaveBeenCalledWith("high");
  });
});

describe("thinking effort persistence", () => {
  const store = (initial?: string) => {
    const data = new Map<string, string>(initial === undefined ? [] : [[THINKING_EFFORT_KEY, initial]]);
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
  };

  it("uses the mae_thinking_effort key and defaults to medium", () => {
    expect(THINKING_EFFORT_KEY).toBe("mae_thinking_effort");
    expect(loadThinkingEffort(store())).toBe("medium");
  });

  it("round-trips each level and ignores corrupt values", () => {
    for (const effort of ["low", "medium", "high"] as const) {
      const s = store();
      saveThinkingEffort(effort, s);
      expect(s.data.get("mae_thinking_effort")).toBe(effort);
      expect(loadThinkingEffort(s)).toBe(effort);
    }
    expect(loadThinkingEffort(store("ultra"))).toBe("medium");
    expect(loadThinkingEffort(store("HIGH"))).toBe("medium");
  });

  it("falls back to the default when storage is unavailable or throws", () => {
    expect(loadThinkingEffort(null)).toBe("medium");
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(loadThinkingEffort(throwing)).toBe("medium");
    expect(() => saveThinkingEffort("high", throwing)).not.toThrow();
  });
});

describe("chat payload", () => {
  const sse = () => new Response('data: {"type":"done"}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
  const send = async (thinkingEffort?: "low" | "medium" | "high") => {
    const fetchImpl = vi.fn(async () => sse());
    await streamChat({ messages: [{ id: "u", role: "user", content: "hi", timestamp: 1 }], lab: "general", thinkingEffort, signal: new AbortController().signal, onDelta: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    return JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;
  };

  it("sends thinkingEffort in the JSON body", async () => {
    expect((await send("high")).thinkingEffort).toBe("high");
    expect((await send("low")).thinkingEffort).toBe("low");
    expect((await send("medium")).thinkingEffort).toBe("medium");
  });

  it("omits the field when none is given", async () => {
    expect("thinkingEffort" in (await send())).toBe(false);
  });
});
