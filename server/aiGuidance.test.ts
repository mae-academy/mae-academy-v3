import { describe, expect, it } from "vitest";
import { DOCUMENT_ANALYSIS_RULES } from "./aiDocumentPrompt";
import { HANDWRITING_AUDIT_RULES, STEP_MODE_RULES, buildSystemInstruction, cleanModelTurn, sanitizeChatRequest } from "./aiService";

const IMG = "data:image/png;base64,iVBORw0KGgo=";
const user = (content: string, extra: Record<string, unknown> = {}) => ({ id: "u", role: "user", content, timestamp: 1, ...extra });

describe("stepMode on the wire", () => {
  it("is carried only when it is the boolean true", () => {
    expect(sanitizeChatRequest({ messages: [user("hi")], stepMode: true }).stepMode).toBe(true);
    for (const value of [false, "true", 1, null, undefined, {}]) {
      expect(sanitizeChatRequest({ messages: [user("hi")], stepMode: value }).stepMode).toBe(false);
    }
    expect(sanitizeChatRequest({ messages: [user("hi")] }).stepMode).toBe(false);
  });

  it("strips a step marker from resent model turns, before or after the simulator marker", () => {
    expect(cleanModelTurn("Step one.\n\nWhat do you get?\n[[STEP:1/4]]")).toBe("Step one.\n\nWhat do you get?");
    expect(cleanModelTurn("Result.\n[[STEP:3/3]]\n[[SIM:circuits]]")).toBe("Result.");
  });
});

describe("STEP_MODE_RULES in the system instruction", () => {
  it("leaves the prompt byte-identical when off", () => {
    for (const lab of ["general", "control", "plc"] as const) {
      const plain = buildSystemInstruction(lab);
      expect(buildSystemInstruction(lab, { stepMode: false })).toBe(plain);
      expect(buildSystemInstruction(lab, {})).toBe(plain);
    }
    expect(buildSystemInstruction("general")).not.toContain("[[STEP:");
  });

  it("appends the rules between the integration rules (and document protocol) and the Context line when on", () => {
    const lean = buildSystemInstruction("control");
    const on = buildSystemInstruction("control", { stepMode: true });
    const at = lean.lastIndexOf("\nContext: ");
    expect(on).toBe(lean.slice(0, at + 1) + STEP_MODE_RULES + "\n\n" + lean.slice(at + 1));
    expect(on).toContain("[[STEP:n/N]]");
    expect(on).toMatch(/ONLY the first pedagogical step/);
    expect(on.indexOf("# MAE Academy platform integration")).toBeLessThan(on.indexOf("# Step-by-Step Guidance"));
    expect(on.indexOf("# Step-by-Step Guidance")).toBeLessThan(on.lastIndexOf("Context: "));
    const both = buildSystemInstruction("control", { stepMode: true, hasDocument: true });
    expect(both.indexOf(DOCUMENT_ANALYSIS_RULES)).toBeLessThan(both.indexOf(STEP_MODE_RULES));
  });
});

describe("HANDWRITING_AUDIT_RULES", () => {
  it("is added only for a request whose last user turn carries an image", () => {
    expect(sanitizeChatRequest({ messages: [user("check", { imageUrl: IMG })] }).hasImage).toBe(true);
    expect(sanitizeChatRequest({ messages: [user("check")] }).hasImage).toBe(false);
    expect(sanitizeChatRequest({ messages: [user("a", { imageUrl: IMG }), { id: "m", role: "model", content: "x", timestamp: 2 }, user("b")] }).hasImage).toBe(false);
  });

  it("leaves the prompt byte-identical without an image and inserts the audit rules before Context when with one", () => {
    const lean = buildSystemInstruction("circuits");
    expect(buildSystemInstruction("circuits", { hasImage: false })).toBe(lean);
    const withImage = buildSystemInstruction("circuits", { hasImage: true });
    const at = lean.lastIndexOf("\nContext: ");
    expect(withImage).toBe(lean.slice(0, at + 1) + HANDWRITING_AUDIT_RULES + "\n\n" + lean.slice(at + 1));
    expect(HANDWRITING_AUDIT_RULES.length).toBeLessThan(2400);
    for (const needle of ["Line 1", "[illegible]", "FIRST line", "propagated", "never invent", "coverage"]) {
      expect(HANDWRITING_AUDIT_RULES.toLowerCase()).toContain(needle.toLowerCase());
    }
  });
});
