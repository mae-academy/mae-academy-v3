import { renderKatexHtml } from "@/components/ui/KatexMath";
import { ZWSP, cleanText, parseComposerValue, serializeSegments, type ComposerSegment } from "./composerModel";

/**
 * DOM side of the composer editor. The editable root holds only text nodes, `<br>` and "math nodes": a math node is either a live
 * MathLive `<math-field>` or, until MathLive is available (or if it fails), an atomic KaTeX chip. Both carry `data-mae-math`,
 * are `contenteditable="false"` islands, and every one is padded by text nodes (ZWSP when empty) so the caret always has a text
 * position beside it. Nothing here knows about React.
 */

export const MATH_ATTR = "data-mae-math";

export interface MathFieldLike extends HTMLElement {
  value: string;
  getValue: (format?: string) => string;
  executeCommand: (command: string | [string, ...unknown[]]) => boolean | void;
  insert?: (latex: string, options?: Record<string, unknown>) => boolean;
  position?: number;
  lastOffset?: number;
  selection?: { ranges: number[][] };
}

export function isMathNode(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute(MATH_ATTR);
}

export function isChip(node: Node | null | undefined): boolean {
  return isMathNode(node) && node.tagName.toLowerCase() !== "math-field";
}

/** The math node (field or chip) that contains `node`, if any. */
export function mathNodeOf(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (isMathNode(current)) return current;
    current = current.parentNode ?? (current as ShadowRoot).host ?? null;
  }
  return null;
}

/** The formula's LaTeX without the unfilled boxes; falls back to the stored copy when the element cannot answer. */
export function readLatex(node: HTMLElement): string {
  const field = node as Partial<MathFieldLike>;
  // A detached copy (selection clone) has no editor state; the stored copy is the formula.
  if (node.isConnected && typeof field.getValue === "function") {
    try {
      return field.getValue("latex-without-placeholders").trim();
    } catch {
      /* not mounted yet */
    }
  }
  return (node.getAttribute("data-latex") ?? "").trim();
}

export function isEmptyMath(node: HTMLElement): boolean {
  return readLatex(node) === "";
}

/** The behaviour switches every live field gets: a quiet inline editor, no keyboard, no menu, no sounds. */
export function configureField(field: MathFieldLike): void {
  // Attributes are safe before the element is mounted; `menuItems` (and any command) is not and is set in `normalizeRoot`.
  field.setAttribute("math-virtual-keyboard-policy", "manual");
  field.setAttribute("default-mode", "math");
  field.setAttribute("smart-mode", "off");
}

function finishField(field: MathFieldLike): void {
  if (field.hasAttribute("data-ready") || !field.isConnected) return;
  try {
    // Elements the browser parsed for us (insertHTML) are not always upgraded yet.
    customElements.upgrade(field);
    (field as unknown as Record<string, unknown>).menuItems = [];
    field.value = field.getAttribute("data-latex") ?? "";
    field.setAttribute("data-ready", "");
  } catch {
    /* not mounted yet; the next normalize retries */
  }
}

export interface CreateMathOptions {
  /** `<math-field>` is defined: create a live editor; otherwise an atomic KaTeX chip. */
  live: boolean;
  label: string;
}

export function createMathNode(latex: string, display: boolean, { live, label }: CreateMathOptions): HTMLElement {
  let node: HTMLElement;
  if (live) {
    const field = document.createElement("math-field") as MathFieldLike;
    field.className = "mae-math";
    configureField(field);
    node = field;
  } else {
    node = document.createElement("span");
    node.className = "mae-math mae-math-chip";
    node.setAttribute("role", "img");
    node.innerHTML = renderKatexHtml(latex, false);
  }
  node.setAttribute(MATH_ATTR, "");
  // MathLive treats a host with contenteditable="false" as read-only (verified in Chromium), so only chips carry it.
  if (!live) node.setAttribute("contenteditable", "false");
  node.setAttribute("dir", "ltr");
  node.setAttribute("translate", "no");
  node.setAttribute("data-latex", latex);
  if (display) node.setAttribute("data-display", "");
  node.setAttribute("aria-label", label);
  return node;
}

/** Replaces a chip by a live field (same formula, same place). Returns the new node. */
export function upgradeChip(chip: HTMLElement, label: string): HTMLElement {
  const field = createMathNode(chip.getAttribute("data-latex") ?? "", chip.hasAttribute("data-display"), { live: true, label });
  chip.replaceWith(field);
  return field;
}

const text = (data: string) => document.createTextNode(data);

/** Builds the nodes for a message string: text with `<br>` for newlines, formulas as math nodes, each padded for the caret. */
export function buildFragment(source: string, options: CreateMathOptions): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const segment of parseComposerValue(source)) {
    if (segment.kind === "math") {
      fragment.append(createMathNode(segment.latex, segment.display, options));
      continue;
    }
    const lines = segment.text.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) fragment.append(document.createElement("br"));
      if (line) fragment.append(text(line));
    });
  }
  // A line break at the very end needs its placeholder `<br>` to show the empty line.
  if (fragment.lastChild instanceof HTMLBRElement) fragment.append(document.createElement("br"));
  return fragment;
}

/** Whether anything visible follows `node` among its siblings (empty and ZWSP-only text does not count). */
function hasContentAfter(node: Node): boolean {
  for (let sibling = node.nextSibling; sibling; sibling = sibling.nextSibling) {
    if (sibling.nodeType !== Node.TEXT_NODE || cleanText(sibling.textContent ?? "") !== "") return true;
  }
  return false;
}

const BLOCKS = new Set(["DIV", "P", "LI", "PRE"]);

/** Collects the root's content as segments. A single trailing `<br>` is the browser's placeholder, not a newline. */
export function collectSegments(root: HTMLElement): ComposerSegment[] {
  const segments: ComposerSegment[] = [];
  const pushText = (data: string) => {
    const last = segments[segments.length - 1];
    if (last?.kind === "text") last.text += data;
    else segments.push({ kind: "text", text: data });
  };
  const walk = (parent: Node) => {
    parent.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) pushText(child.textContent ?? "");
      else if (isMathNode(child)) segments.push({ kind: "math", latex: readLatex(child), display: child.hasAttribute("data-display") });
      else if (child instanceof HTMLBRElement) {
        if (hasContentAfter(child)) pushText("\n");
      } else if (child instanceof HTMLElement) {
        const block = BLOCKS.has(child.tagName);
        if (block && segments.length > 0) pushText("\n");
        walk(child);
      }
    });
  };
  walk(root);
  return segments;
}

export function serializeRoot(root: HTMLElement): string {
  return serializeSegments(collectSegments(root));
}

/** True when the root holds no text and no formula node at all (the placeholder shows). */
export function isRootEmpty(root: HTMLElement): boolean {
  return !root.querySelector(`[${MATH_ATTR}]`) && cleanText(root.textContent ?? "") === "";
}

/** Guarantees a text node on both sides of every math node. Idempotent; leaves existing text nodes (and the caret in them) alone. */
export function normalizeRoot(root: HTMLElement): void {
  for (const node of Array.from(root.children)) {
    if (!isMathNode(node)) continue;
    if (!isChip(node)) finishField(node as MathFieldLike);
    if (node.previousSibling?.nodeType !== Node.TEXT_NODE) node.before(text(ZWSP));
    if (node.nextSibling?.nodeType !== Node.TEXT_NODE) node.after(text(ZWSP));
  }
}

/** Replaces the whole content with `source`. */
export function renderRoot(root: HTMLElement, source: string, options: CreateMathOptions): void {
  root.replaceChildren(buildFragment(source, options));
  normalizeRoot(root);
}

/** Drops every empty formula (not the one holding the caret unless `includeActive`). Returns true when something was removed. */
export function removeEmptyMath(root: HTMLElement, except?: Element | null): boolean {
  let removed = false;
  root.querySelectorAll<HTMLElement>(`[${MATH_ATTR}]`).forEach((node) => {
    if (node !== except && isEmptyMath(node)) {
      node.remove();
      removed = true;
    }
  });
  if (removed) {
    root.normalize();
    normalizeRoot(root);
  }
  return removed;
}

/* ---- selection helpers ---- */

export function currentRange(root: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer) ? range : null;
}

export function setCaret(node: Node, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function caretToEnd(root: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const isPadText = (node: Node | null): node is Text => node?.nodeType === Node.TEXT_NODE;

/** Places the caret in the text node right after `node` (after its ZWSP pad). */
export function caretAfter(node: HTMLElement): void {
  const next = node.nextSibling;
  if (isPadText(next)) setCaret(next, next.data.startsWith(ZWSP) ? 1 : 0);
  else {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
}

/** Places the caret in the text node right before `node`. */
export function caretBefore(node: HTMLElement): void {
  const prev = node.previousSibling;
  if (isPadText(prev)) setCaret(prev, prev.data.length);
  else {
    const range = document.createRange();
    range.setStartBefore(node);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
}

/**
 * The math node the collapsed caret touches in DOM direction `direction`, if the caret is at that edge of its text (padding does
 * not count as text).
 */
export function adjacentMath(root: HTMLElement, direction: "forward" | "backward"): HTMLElement | null {
  const range = currentRange(root);
  if (!range || !range.collapsed) return null;
  const { startContainer: container, startOffset: offset } = range;
  if (container === root) {
    const node = direction === "forward" ? root.childNodes[offset] : root.childNodes[offset - 1];
    return isMathNode(node) ? node : null;
  }
  if (container.nodeType !== Node.TEXT_NODE || container.parentNode !== root) return null;
  const data = (container as Text).data;
  const rest = direction === "forward" ? data.slice(offset) : data.slice(0, offset);
  if (cleanText(rest) !== "") return null;
  const sibling = direction === "forward" ? container.nextSibling : container.previousSibling;
  return isMathNode(sibling) ? sibling : null;
}

/* ---- plain insertion with a fallback for environments without execCommand ---- */

function execInsert(command: "insertText" | "insertLineBreak", data?: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  try {
    return document.execCommand(command, false, data) === true;
  } catch {
    return false;
  }
}

/** Inserts plain text at the selection (replacing it). The browser's command keeps native undo; a Range edit covers the rest. */
export function insertPlainText(root: HTMLElement, data: string): void {
  const lines = data.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    if (index > 0) insertLineBreak(root);
    if (line === "") return;
    if (execInsert("insertText", line)) return;
    const range = currentRange(root);
    if (!range) return;
    range.deleteContents();
    const node = text(line);
    range.insertNode(node);
    setCaret(node, node.data.length);
  });
}

/** Inserts a line break at the selection; at the end of the content it adds the placeholder `<br>` that makes the new line visible. */
export function insertLineBreak(root: HTMLElement): void {
  if (execInsert("insertLineBreak")) {
    const range = currentRange(root);
    const br = range?.startContainer === root ? root.childNodes[range.startOffset - 1] : range?.startContainer.previousSibling;
    if (br instanceof HTMLBRElement && !hasContentAfter(br)) {
      br.after(document.createElement("br"));
      setCaret(br.parentNode as Node, Array.prototype.indexOf.call(br.parentNode?.childNodes, br) + 1);
    }
    return;
  }
  const range = currentRange(root);
  if (!range) return;
  range.deleteContents();
  const br = document.createElement("br");
  range.insertNode(br);
  if (!hasContentAfter(br)) br.after(document.createElement("br"));
  const after = document.createRange();
  after.setStartAfter(br);
  after.collapse(true);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(after);
}

/** The selected content as a wire string (formulas as `$…$`). */
export function selectionText(root: HTMLElement): string {
  const range = currentRange(root);
  if (!range || range.collapsed) return "";
  const holder = document.createElement("div");
  holder.append(range.cloneContents());
  // Cloned fields lost their state; the stored copy is the formula.
  return serializeRoot(holder);
}
