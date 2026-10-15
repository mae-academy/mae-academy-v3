// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THINKING_EFFORT_KEY, loadThinkingEffort, saveThinkingEffort } from "./chatStorage";
import { streamChat } from "./streamChat";
import { ThinkingEffortSelector } from "./ThinkingEffortSelector";

afterEach(cleanup);

describe("ThinkingEffortSelector", () => {
  it("is a labelled radio group with Low / Med / High and exactly one selected", () => {
    render(<ThinkingEffortSelector value="medium" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Thinking" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Low", "Med", "High"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  });

  it("explains each level in its tooltip", () => {
    render(<ThinkingEffortSelector value="medium" onChange={() => {}} />);
    const title = (effort: string) => document.querySelector(`[data-thinking-effort="${effort}"]`)?.getAttribute("title");
    expect(title("low")).toBe("Fast answers, minimal reasoning tokens");
    expect(title("medium")).toBe("Recommended for engineering coursework");
    expect(title("high")).toBe("Exhaustive step-by-step proofs & complex matrices");
  });

  it("reports the clicked level and supports arrow-key movement", () => {
    const onChange = vi.fn();
    render(<ThinkingEffortSelector value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Thinking: High" }));
    expect(onChange).toHaveBeenLastCalledWith("high");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Thinking: Med" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("high");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Thinking: Med" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("low");
  });

  it("only the selected radio is in the tab order", () => {
    render(<ThinkingEffortSelector value="high" onChange={() => {}} />);
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
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
