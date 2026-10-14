// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SUGGESTIONS, SuggestionChips } from "./SuggestionChips";

afterEach(cleanup);

describe("SuggestionChips", () => {
  it("shows the four starter prompts, with no lab-specific ones", () => {
    render(<SuggestionChips onFill={() => {}} onAttach={() => {}} />);
    expect(SUGGESTIONS).toHaveLength(4);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Analyze this KVL circuit", "Explain Root Locus angle criteria", "Design a 5V Buck converter", "Solve a schematic from a photo"]);
  });

  it("text chips hand their text to onFill; the photo chip hands a prompt to onAttach instead", () => {
    const onFill = vi.fn();
    const onAttach = vi.fn();
    render(<SuggestionChips onFill={onFill} onAttach={onAttach} />);
    fireEvent.click(screen.getByRole("button", { name: "Design a 5V Buck converter" }));
    expect(onFill).toHaveBeenCalledWith("Design a 5V Buck converter");
    expect(onAttach).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Solve a schematic from a photo" }));
    expect(onAttach).toHaveBeenCalledWith("Solve the circuit in this image step by step.");
    expect(onFill).toHaveBeenCalledTimes(1);
  });

  it("every chip is a labelled, keyboard-reachable button inside a labelled list", () => {
    render(<SuggestionChips onFill={() => {}} onAttach={() => {}} />);
    expect(screen.getByRole("list", { name: "Suggested prompts" })).toBeTruthy();
    for (const button of screen.getAllByRole("button")) expect(button.getAttribute("type")).toBe("button");
  });
});
