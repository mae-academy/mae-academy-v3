import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/aiTypes";
import { regenerateHistory } from "./chatThreads";
import { cleanMessageSource } from "./messageText";

describe("cleanMessageSource", () => {
  it("keeps Markdown, LaTeX and schematic fences, and removes the simulator marker", () => {
    const content = 'Use $V=IR$.\n\n```schematic\n{"title":"x"}\n```\n\n[[SIM:circuits]]';
    expect(cleanMessageSource(content)).toBe('Use $V=IR$.\n\n```schematic\n{"title":"x"}\n```');
  });
  it("removes legacy schematic and image tags, complete or unclosed", () => {
    expect(cleanMessageSource("Answer.\n\n[GENERATE_SCHEMATIC: a buck]\n[[SIM:power]]")).toBe("Answer.");
    expect(cleanMessageSource("Answer.\n\n[GENERATE_IMAGE: a buck converter diagram]\n[[SIM:power]]")).toBe("Answer.");
    expect(cleanMessageSource("Answer. [GENERATE_IMAGE: a buck conv")).toBe("Answer.");
    expect(cleanMessageSource("Before.\n[GENERATE_IMAGE: x]\nAfter.")).toBe("Before.\n\nAfter.");
  });
  it("leaves ordinary brackets alone", () => {
    expect(cleanMessageSource("Array a[0] and [link](u).")).toBe("Array a[0] and [link](u).");
  });
});

const m = (id: string, role: "user" | "model", extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role, content: id, timestamp: 1, ...extra });

describe("regenerateHistory", () => {
  it("drops the last assistant message and keeps the user message that prompted it", () => {
    const u1 = m("u1", "user");
    expect(regenerateHistory([u1, m("a1", "model")], "a1")).toEqual([u1]);
  });
  it("keeps earlier turns and carries an attached image along", () => {
    const u2 = m("u2", "user", { imageUrl: "data:image/png;base64,AAA" });
    const history = regenerateHistory([m("u1", "user"), m("a1", "model"), u2, m("a2", "model")], "a2");
    expect(history?.map((x) => x.id)).toEqual(["u1", "a1", "u2"]);
    expect(history?.[2].imageUrl).toBe("data:image/png;base64,AAA");
  });
  it("has nothing to regenerate for an older reply, a user message, a missing id or no preceding user message", () => {
    const thread = [m("u1", "user"), m("a1", "model"), m("u2", "user"), m("a2", "model")];
    expect(regenerateHistory(thread, "a1")).toBeNull();
    expect(regenerateHistory([m("u1", "user")], "u1")).toBeNull();
    expect(regenerateHistory(thread, "nope")).toBeNull();
    expect(regenerateHistory([m("a1", "model")], "a1")).toBeNull();
  });
});
