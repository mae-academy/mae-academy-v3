// @vitest-environment jsdom
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MathInputArea, type MathInputHandle } from "./MathInputArea";
import { caretToEndOfComposer, composer, composerMath, getComposerValue, StubMathField } from "./composerTestUtils";
import { setCaret } from "./composerDom";

interface HostProps {
  initial?: string;
  maxChars?: number;
  onSubmit?: () => void;
  onLimit?: () => void;
  onChange?: (value: string) => void;
}

function setup(props: HostProps = {}) {
  const handle = createRef<MathInputHandle>();
  const onChange = props.onChange ?? vi.fn();
  const onSubmit = props.onSubmit ?? vi.fn();
  const onLimit = props.onLimit ?? vi.fn();
  function Host() {
    const [value, setValue] = useState(props.initial ?? "");
    return (
      <MathInputArea
        ref={handle}
        value={value}
        onChange={(next) => { setValue(next); onChange(next); }}
        onSubmit={onSubmit}
        onLimit={onLimit}
        maxChars={props.maxChars}
        ariaLabel="Message MAE AI"
        placeholder="Ask anything"
      />
    );
  }
  render(<Host />);
  return { handle, onChange, onSubmit, onLimit };
}

/** Types at the caret when there is one in the editor (what the browser does), else at the end. */
const typeText = (data: string) => {
  const root = composer();
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const container = range?.startContainer;
  if (range && container && root.contains(container) && container !== root) {
    if (container.nodeType === Node.TEXT_NODE) {
      (container as Text).insertData(range.startOffset, data);
      setCaret(container, range.startOffset + data.length);
    } else {
      const node = document.createTextNode(data);
      range.insertNode(node);
      setCaret(node, data.length);
    }
  } else if (range && container === root) {
    const node = document.createTextNode(data);
    range.insertNode(node);
    setCaret(node, data.length);
  } else {
    const last = root.lastChild;
    if (last?.nodeType === Node.TEXT_NODE) (last as Text).data += data;
    else root.append(document.createTextNode(data));
  }
  fireEvent.input(root);
};
const field = (index = 0) => composerMath()[index] as StubMathField;
const nodes = () => Array.from(composer().childNodes).map((n) => (n.nodeType === Node.TEXT_NODE ? (n as Text).data.replace(/​/g, "") : (n as Element).tagName.toLowerCase()));

afterEach(cleanup);

describe("MathInputArea: structure and accessibility", () => {
  it("is a multiline textbox with a label, a placeholder, auto direction and mobile hints", () => {
    setup();
    const root = composer();
    expect(root.getAttribute("role")).toBe("textbox");
    expect(root.getAttribute("aria-multiline")).toBe("true");
    expect(root.getAttribute("dir")).toBe("auto");
    expect(root.getAttribute("contenteditable")).toBe("true");
    expect(root.getAttribute("inputmode")).toBe("text");
    expect(root.getAttribute("enterkeyhint")).toBe("send");
    expect(root.getAttribute("data-placeholder")).toBe("Ask anything");
    expect(root.hasAttribute("data-empty")).toBe(true);
  });

  it("renders a value with formulas as text and live math nodes, never raw dollars or commands", () => {
    setup({ initial: "Find $\\lim_{x \\to 0} f(x)$ now" });
    expect(nodes()).toEqual(["Find ", "math-field", " now"]);
    expect(composerMath()).toHaveLength(1);
    expect(field().value).toBe("\\lim_{x \\to 0} f(x)");
    expect(field().getAttribute("aria-label")).toBe("Formula");
    expect(composer().textContent).not.toMatch(/[$\\]/);
    expect(composer().hasAttribute("data-empty")).toBe(false);
    expect(getComposerValue()).toBe("Find $\\lim_{x \\to 0} f(x)$ now");
  });

  it("every formula has a text node on both sides so the caret can reach it", () => {
    setup({ initial: "$a$ $b$" });
    const root = composer();
    const children = Array.from(root.childNodes);
    expect(children[0].nodeType).toBe(Node.TEXT_NODE);
    expect(children[children.length - 1].nodeType).toBe(Node.TEXT_NODE);
    composerMath().forEach((m) => {
      expect(m.previousSibling?.nodeType).toBe(Node.TEXT_NODE);
      expect(m.nextSibling?.nodeType).toBe(Node.TEXT_NODE);
    });
    expect(getComposerValue()).toBe("$a$ $b$");
  });

  it("renders display math flagged and serializes it back with $$", () => {
    setup({ initial: "see $$\\int_0^1 x\\,dx$$ above" });
    expect(field().hasAttribute("data-display")).toBe(true);
    expect(getComposerValue()).toBe("see $$\\int_0^1 x\\,dx$$ above");
  });
});

describe("MathInputArea: value sync", () => {
  it("typing reports the string without re-rendering the DOM (the caret is never reset)", () => {
    const { onChange } = setup();
    typeText("he");
    const textNode = composer().firstChild;
    typeText("llo");
    expect(onChange).toHaveBeenLastCalledWith("hello");
    expect(composer().firstChild).toBe(textNode);
    expect(composer().hasAttribute("data-empty")).toBe(false);
  });

  it("re-renders when the outside value differs from the DOM (edit mode, chips, clear after send)", () => {
    const { handle } = setup();
    act(() => handle.current!.setValue("loaded $x^2$ text"));
    expect(composerMath()).toHaveLength(1);
    expect(field().value).toBe("x^2");
    act(() => handle.current!.clear());
    expect(getComposerValue()).toBe("");
    expect(composer().hasAttribute("data-empty")).toBe(true);
    expect(composerMath()).toHaveLength(0);
  });

  it("an edit inside a formula is reported as an updated string", () => {
    const { onChange } = setup({ initial: "a $x$ b" });
    field().type("x^{2}");
    expect(onChange).toHaveBeenLastCalledWith("a $x^{2}$ b");
  });

  it("empty formulas serialize to nothing and are removed on blur", () => {
    const { onChange } = setup({ initial: "a $x$ b" });
    field().type("");
    expect(getComposerValue()).toBe("a  b");
    vi.useFakeTimers();
    fireEvent.focusOut(composer(), { relatedTarget: null });
    act(() => { vi.runAllTimers(); });
    vi.useRealTimers();
    expect(composerMath()).toHaveLength(0);
    expect(onChange).toHaveBeenLastCalledWith("a  b");
  });

  it("does not touch the DOM while an IME composition is running", () => {
    const props = { onChange: () => {}, onSubmit: () => {}, ariaLabel: "Message MAE AI" };
    const view = render(<MathInputArea {...props} value="" />);
    const root = composer();
    root.append(document.createTextNode("a"));
    fireEvent.compositionStart(root);
    view.rerender(<MathInputArea {...props} value="replaced" />);
    expect(root.textContent).toBe("a");
    fireEvent.compositionEnd(root);
    view.rerender(<MathInputArea {...props} value="replaced again" />);
    expect(root.textContent).toBe("replaced again");
  });
});

describe("MathInputArea: Enter and IME", () => {
  it("Enter submits; Shift+Enter inserts a line break and does not", () => {
    const { onSubmit } = setup();
    typeText("one");
    caretToEndOfComposer();
    expect(fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true })).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(composer().querySelectorAll("br").length).toBeGreaterThan(0);
    typeText("two");
    expect(getComposerValue()).toBe("one\ntwo");
    expect(fireEvent.keyDown(composer(), { key: "Enter" })).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Enter during IME composition confirms the candidate instead of sending", () => {
    const { onSubmit } = setup();
    typeText("ni");
    fireEvent.keyDown(composer(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(composer(), { key: "Enter", keyCode: 229 });
    fireEvent.compositionStart(composer());
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(composer());
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Enter inside a formula submits too", () => {
    const { onSubmit } = setup({ initial: "$x$" });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("a soft keyboard's paragraph insertion is a send", () => {
    const { onSubmit } = setup();
    const event = new InputEvent("beforeinput", { inputType: "insertParagraph", cancelable: true, bubbles: true });
    expect(composer().dispatchEvent(event)).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("MathInputArea: moving between text and formulas", () => {
  it("ArrowRight from the end of the text before a formula enters it at its start; ArrowLeft from the text after enters at its end", () => {
    setup({ initial: "ab$x$cd" });
    const root = composer();
    const before = root.firstChild as Text;
    setCaret(before, before.data.length);
    expect(fireEvent.keyDown(root, { key: "ArrowRight" })).toBe(false);
    expect(field().commands).toEqual(["moveToMathfieldStart"]);
    expect(document.activeElement).toBe(field());

    const after = root.lastChild as Text;
    setCaret(after, after.data.startsWith("​") ? 1 : 0);
    expect(fireEvent.keyDown(root, { key: "ArrowLeft" })).toBe(false);
    expect(field().commands).toEqual(["moveToMathfieldStart", "moveToMathfieldEnd"]);
  });

  it("arrows inside the text are left to the browser", () => {
    setup({ initial: "abc$x$" });
    const first = composer().firstChild as Text;
    setCaret(first, 1);
    expect(fireEvent.keyDown(composer(), { key: "ArrowRight" })).toBe(true);
    expect(field().commands).toEqual([]);
  });

  it("a move-out event puts the caret in the neighbouring text and keeps the editor focused", () => {
    setup({ initial: "ab$x$cd" });
    const mf = field();
    fireEvent.keyDown(mf, { key: "ArrowRight" });
    const moved = new CustomEvent("move-out", { detail: { direction: "forward" }, cancelable: true, bubbles: true });
    expect(mf.dispatchEvent(moved)).toBe(false);
    const range = window.getSelection()!.getRangeAt(0);
    expect(range.startContainer).toBe(mf.nextSibling);
    expect(document.activeElement).toBe(composer());

    const back = new CustomEvent("move-out", { detail: { direction: "backward" }, cancelable: true, bubbles: true });
    mf.dispatchEvent(back);
    expect(window.getSelection()!.getRangeAt(0).startContainer).toBe(mf.previousSibling);
  });

  it("move-out caused by Tab is not cancelled, so focus leaves the editor", () => {
    setup({ initial: "$x$" });
    const mf = field();
    fireEvent.keyDown(mf, { key: "Tab" });
    const moved = new CustomEvent("move-out", { detail: { direction: "forward" }, cancelable: true, bubbles: true });
    expect(mf.dispatchEvent(moved)).toBe(true);
  });

  it("Backspace right after an empty formula removes it; after a filled one it enters it instead", () => {
    setup({ initial: "a$x$b$y$c" });
    const second = field(1);
    second.type("");
    const afterSecond = second.nextSibling as Text;
    setCaret(afterSecond, afterSecond.data.startsWith("​") ? 1 : 0);
    expect(fireEvent.keyDown(composer(), { key: "Backspace" })).toBe(false);
    expect(composerMath()).toHaveLength(1);

    const afterFirst = field(0).nextSibling as Text;
    setCaret(afterFirst, afterFirst.data.startsWith("​") ? 1 : 0);
    fireEvent.keyDown(composer(), { key: "Backspace" });
    expect(composerMath()).toHaveLength(1);
    expect(field().commands).toEqual(["moveToMathfieldEnd"]);
  });

  it("Delete before an empty formula removes it", () => {
    setup({ initial: "a$x$b" });
    field().type("");
    const before = composer().firstChild as Text;
    setCaret(before, before.data.length);
    fireEvent.keyDown(composer(), { key: "Delete" });
    expect(composerMath()).toHaveLength(0);
    expect(getComposerValue()).toBe("ab");
  });

  it("Backspace inside an empty formula removes it and puts the caret in the text before", () => {
    setup({ initial: "ab$x$" });
    const mf = field();
    mf.type("");
    expect(fireEvent.keyDown(mf, { key: "Backspace" })).toBe(false);
    expect(composerMath()).toHaveLength(0);
    expect(getComposerValue()).toBe("ab");
  });
});

describe("MathInputArea: paste, copy, limit", () => {
  const clipboard = (plain: string, html = "", files: File[] = []) => ({ getData: (type: string) => (type === "text/plain" ? plain : type === "text/html" ? html : ""), files });

  it("pastes plain text only, ignoring the HTML flavour", () => {
    const { onChange } = setup();
    caretToEndOfComposer();
    const notPrevented = fireEvent.paste(composer(), { clipboardData: clipboard("hello <world>", "<b>hello</b>") });
    expect(notPrevented).toBe(false);
    expect(getComposerValue()).toBe("hello <world>");
    expect(composer().querySelector("b")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith("hello <world>");
  });

  it("pasted text with $…$ becomes a formula", () => {
    setup();
    caretToEndOfComposer();
    fireEvent.paste(composer(), { clipboardData: clipboard("so $x^2$ ok") });
    expect(composerMath()).toHaveLength(1);
    expect(getComposerValue()).toBe("so $x^2$ ok");
  });

  it("leaves a file-only paste to the composer's attach logic", () => {
    setup();
    const file = new File(["x"], "a.png", { type: "image/png" });
    expect(fireEvent.paste(composer(), { clipboardData: clipboard("", "", [file]) })).toBe(true);
    expect(getComposerValue()).toBe("");
  });

  it("refuses typing past maxChars and reports it", () => {
    const { onLimit } = setup({ initial: "abcde", maxChars: 5 });
    const event = new InputEvent("beforeinput", { inputType: "insertText", data: "f", cancelable: true, bubbles: true });
    expect(composer().dispatchEvent(event)).toBe(false);
    expect(onLimit).toHaveBeenCalledTimes(1);
  });

  it("truncates a paste to the room that is left", () => {
    const { onLimit } = setup({ initial: "abc", maxChars: 6 });
    caretToEndOfComposer();
    fireEvent.paste(composer(), { clipboardData: clipboard("defghi") });
    expect(getComposerValue()).toBe("abcdef");
    expect(onLimit).toHaveBeenCalled();
  });

  it("counts a formula's delimiters toward the limit", () => {
    const { onLimit } = setup({ initial: "$x$", maxChars: 4 });
    const event = new InputEvent("beforeinput", { inputType: "insertText", data: "ab", cancelable: true, bubbles: true });
    expect(composer().dispatchEvent(event)).toBe(false);
    expect(onLimit).toHaveBeenCalled();
  });

  it("copies the selection as the wire string", () => {
    const { handle } = setup({ initial: "a $x$ b" });
    const range = document.createRange();
    range.selectNodeContents(composer());
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(handle.current!.getSelectionText()).toBe("a $x$ b");
    const data: Record<string, string> = {};
    fireEvent.copy(composer(), { clipboardData: { setData: (t: string, v: string) => { data[t] = v; } } });
    expect(data["text/plain"]).toBe("a $x$ b");
  });
});

describe("MathInputArea: imperative handle", () => {
  it("insertText inserts at the caret and reports; getValue reads the DOM", () => {
    const { handle, onChange } = setup({ initial: "ab" });
    setCaret(composer().firstChild!, 1);
    act(() => handle.current!.insertText("X"));
    expect(handle.current!.getValue()).toBe("aXb");
    expect(onChange).toHaveBeenLastCalledWith("aXb");
  });

  it("insertText appends when the editor has no caret and refuses past the limit", () => {
    const { handle, onLimit } = setup({ initial: "ab", maxChars: 3 });
    act(() => handle.current!.insertText("c"));
    expect(handle.current!.getValue()).toBe("abc");
    act(() => handle.current!.insertText("d"));
    expect(handle.current!.getValue()).toBe("abc");
    expect(onLimit).toHaveBeenCalled();
  });

  it("insertMath creates a field, runs the placeholder commands, and returns true", () => {
    const { handle } = setup();
    let result: boolean | Promise<boolean> = false;
    act(() => { result = handle.current!.insertMath("\\frac{\\placeholder{}}{\\placeholder{}}", "\\frac{a}{b}"); });
    expect(result).toBe(true);
    expect(field().commands).toEqual(["moveToMathfieldStart", "moveToNextPlaceholder"]);
    expect(document.activeElement).toBe(field());
  });

  it("insertMath reports a refusal when the limit would be exceeded", () => {
    const { handle, onLimit } = setup({ initial: "abc", maxChars: 6 });
    let result: boolean | Promise<boolean> = true;
    act(() => { result = handle.current!.insertMath("\\frac{\\placeholder{}}{\\placeholder{}}"); });
    expect(result).toBe(false);
    expect(onLimit).toHaveBeenCalled();
    expect(composerMath()).toHaveLength(0);
  });
});
