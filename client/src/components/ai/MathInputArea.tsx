import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { fillFirstPlaceholder, hasPlaceholder, isMovableSelection, parseComposerValue, stepsToFirstBox, stripPlaceholders } from "./composerModel";
import {
  MATH_ATTR,
  adjacentMath,
  caretAfter,
  caretBefore,
  createMathNode,
  currentRange,
  insertLineBreak,
  insertPlainText,
  isChip,
  isEmptyMath,
  isRootEmpty,
  mathNodeOf,
  normalizeRoot,
  readLatex,
  removeEmptyMath,
  renderRoot,
  selectionText,
  serializeRoot,
  setCaret,
  upgradeChip,
  type MathFieldLike,
} from "./composerDom";
import { isMathLiveReady, loadMathLive } from "./mathliveLoader";
import "./MathInputArea.css";

export interface MathInputHandle {
  /** Focuses the editor and puts the caret at the end. */
  focus: () => void;
  /** Inserts plain text at the caret (replacing the selection). */
  insertText: (text: string) => void;
  /**
   * Inserts a formula built from a MathLive `template` (`\placeholder{}` marks the boxes) at the caret and puts the caret in its first box.
   * With the caret already inside a formula the template goes into THAT formula. `fallbackLatex` is what the atomic chip shows if MathLive
   * cannot load. Returns false when the message limit would be exceeded; a Promise while MathLive is still loading.
   */
  insertMath: (template: string, fallbackLatex?: string) => boolean | Promise<boolean>;
  /** The content as the wire string: text with `$…$` / `$$…$$` formulas. Empty formulas are left out. */
  getValue: () => string;
  /** Replaces the content with a wire string and notifies `onChange`. */
  setValue: (value: string) => void;
  /** The selected content as a wire string ("" when collapsed). */
  getSelectionText: () => string;
  clear: () => void;
  /** Starts loading MathLive ahead of the first formula. */
  preload: () => void;
}

export interface MathInputAreaProps {
  /** The wire string. The DOM is re-rendered only when it differs from what the editor already serializes to. */
  value: string;
  onChange: (value: string) => void;
  /** Enter (without Shift, outside IME composition). */
  onSubmit: () => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  /** Typing and pasting beyond this many serialized characters is refused. */
  maxChars?: number;
  /** Keystrokes, pastes and insertions: lets the mascot lean in. */
  onActivity?: () => void;
  /** An edit was refused by `maxChars`. */
  onLimit?: () => void;
  /** Escape pressed in the editor or a formula (not during IME composition). */
  onEscape?: (event: KeyboardEvent) => void;
  className?: string;
  ref?: Ref<MathInputHandle>;
}

const INPUT_TYPES_WITH_TEXT = new Set(["insertText", "insertFromPaste", "insertFromDrop", "insertReplacementText"]);

/**
 * The composer's text box: a plain-text `contenteditable` whose formulas are inline MathLive fields (KaTeX chips until MathLive is
 * available). The outside sees one string with `$…$` delimiters; the student never sees a dollar sign or a backslash command.
 *
 * Caret model: text and formulas are siblings; every formula is padded by text nodes (ZWSP when empty), so the caret always has a
 * text position beside a formula. Arrow keys and Backspace/Delete at such an edge are handled here (enter the formula, or remove an
 * empty one); inside a formula MathLive owns the caret and reports leaving with a `move-out` event, which puts the caret back in the
 * neighbouring text. Undo: native for text; a formula inserted from the keypad is a plain DOM insertion (insertHTML does not upgrade
 * custom elements), so it is not a native undo step; edits inside a formula use MathLive's own undo.
 */
export function MathInputArea({ value, onChange, onSubmit, placeholder, ariaLabel, disabled = false, maxChars, onActivity, onLimit, onEscape, className, ref }: MathInputAreaProps) {
  const { t } = useTranslation("ai");
  const rootRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const lastKey = useRef("");
  const hopping = useRef(false);
  const lastRange = useRef<Range | null>(null);
  const formulaLabel = t("mathInput.formula");

  const latest = useRef({ onChange, onSubmit, onActivity, onLimit, onEscape, maxChars, formulaLabel, value });
  latest.current = { onChange, onSubmit, onActivity, onLimit, onEscape, maxChars, formulaLabel, value };

  const mathOptions = useCallback(() => ({ live: isMathLiveReady(), label: latest.current.formulaLabel }), []);

  /** Reads the DOM, keeps the placeholder flag current, and reports the string. */
  const emit = useCallback(() => {
    const root = rootRef.current;
    if (!root) return "";
    const next = serializeRoot(root);
    root.toggleAttribute("data-empty", isRootEmpty(root));
    if (next !== latest.current.value) latest.current.onChange(next);
    return next;
  }, []);

  /** Turns chips into live fields once MathLive is in (never while composing, never touching text nodes). */
  const upgradeChips = useCallback(() => {
    const root = rootRef.current;
    if (!root || composing.current || !isMathLiveReady()) return;
    root.querySelectorAll<HTMLElement>(`[${MATH_ATTR}]`).forEach((node) => {
      if (isChip(node)) upgradeChip(node, latest.current.formulaLabel);
    });
    normalizeRoot(root); // finishes the new fields (content, menu)
  }, []);

  const ensureLive = useCallback(() => {
    if (isMathLiveReady()) return;
    void loadMathLive().then((ok) => {
      if (ok) upgradeChips();
    });
  }, [upgradeChips]);

  const render = useCallback(
    (source: string) => {
      const root = rootRef.current;
      if (!root) return;
      renderRoot(root, source, mathOptions());
      root.toggleAttribute("data-empty", isRootEmpty(root));
      if (parseComposerValue(source).some((s) => s.kind === "math")) ensureLive();
    },
    [ensureLive, mathOptions],
  );

  // External changes (edit mode, chips, clearing after send) re-render; the editor's own typing already matches, so the caret is left alone.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || composing.current) return;
    if (serializeRoot(root) !== value) {
      render(value);
      const canonical = serializeRoot(root);
      if (canonical !== value) latest.current.onChange(canonical);
    } else {
      root.toggleAttribute("data-empty", isRootEmpty(root));
    }
  }, [value, render]);

  /** How many more characters fit after `replacing` selected ones are overwritten. */
  const roomFor = useCallback((replacing: number) => {
    const max = latest.current.maxChars;
    const root = rootRef.current;
    if (max === undefined || !root) return Infinity;
    return max - (serializeRoot(root).length - replacing);
  }, []);

  /* ---- placing the caret ---- */

  const focusEditor = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const last = root.lastChild;
    if (last?.nodeType === Node.TEXT_NODE) range.setStart(last, (last as Text).data.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const enterMath = useCallback((node: HTMLElement, edge: "start" | "end") => {
    if (isChip(node)) {
      if (edge === "start") caretAfter(node);
      else caretBefore(node);
      return;
    }
    const field = node as MathFieldLike;
    field.focus();
    field.executeCommand(edge === "start" ? "moveToMathfieldStart" : "moveToMathfieldEnd");
  }, []);

  const leaveMath = useCallback((node: HTMLElement, direction: "forward" | "backward") => {
    const root = rootRef.current;
    if (!root) return;
    root.focus({ preventScroll: true });
    if (direction === "forward") caretAfter(node);
    else caretBefore(node);
  }, []);

  const removeMath = useCallback(
    (node: HTMLElement, caret: "before" | "after") => {
      const root = rootRef.current;
      if (!root) return;
      const prev = node.previousSibling;
      const next = node.nextSibling;
      root.focus({ preventScroll: true });
      node.remove();
      root.normalize();
      normalizeRoot(root);
      const anchor = caret === "before" ? prev : next;
      if (anchor?.nodeType === Node.TEXT_NODE && root.contains(anchor)) setCaret(anchor, caret === "before" ? (anchor as Text).data.length : 0);
      else focusEditor();
      emit();
    },
    [emit, focusEditor],
  );

  /* ---- inserting ---- */

  const insertMath = useCallback(
    (template: string, fallbackLatex?: string): boolean | Promise<boolean> => {
      const root = rootRef.current;
      if (!root || disabled) return false;
      const saved = currentRange(root)?.cloneRange() ?? lastRange.current?.cloneRange() ?? null;

      const run = (): boolean => {
        const live = isMathLiveReady();
        const empty = stripPlaceholders(template);
        const max = latest.current.maxChars;
        if (max !== undefined && serializeRoot(root).length + empty.length + 2 > max) {
          latest.current.onLimit?.();
          return false;
        }
        latest.current.onActivity?.();

        // The caret is inside a formula: the template goes into that one.
        const inner = mathNodeOf(document.activeElement, root);
        if (inner && !isChip(inner)) {
          const field = inner as MathFieldLike;
          field.focus();
          if (typeof field.insert === "function") field.insert(template, { format: "latex", selectionMode: "placeholder", focus: true });
          else field.executeCommand(["insert", template]);
          emit();
          return true;
        }

        if (saved && root.contains(saved.startContainer) && root.contains(saved.endContainer)) {
          root.focus({ preventScroll: true });
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(saved);
        } else {
          focusEditor();
        }
        const range = currentRange(root);
        if (!range) return false;

        let latex = template;
        if (!range.collapsed) {
          const fragment = range.cloneContents();
          const plain = !fragment.querySelector(`[${MATH_ATTR}]`);
          const selected = (fragment.textContent ?? "").replace(/​/g, "");
          if (plain && hasPlaceholder(template) && isMovableSelection(selected)) latex = fillFirstPlaceholder(template, selected);
          range.deleteContents();
        }
        if (!live) {
          latex = stripPlaceholders(fallbackLatex ?? latex);
          if (latex.trim() === "") return false;
        }

        const node = createMathNode(latex, false, { live, label: latest.current.formulaLabel });
        // A Range insertion: `execCommand("insertHTML")` was tried and leaves custom elements un-upgraded, so the formula is not a
        // native undo step (Ctrl+Z reverts text edits; edits inside a formula use MathLive's own undo).
        const placed = node;
        (currentRange(root) ?? range).insertNode(node);
        root.normalize();
        normalizeRoot(root);

        if (live) {
          const field = placed as MathFieldLike;
          field.focus();
          if (hasPlaceholder(latex)) {
            field.executeCommand("moveToMathfieldStart");
            for (let step = stepsToFirstBox(latex); step > 0; step--) field.executeCommand("moveToNextPlaceholder");
          } else {
            field.executeCommand("moveToMathfieldEnd");
          }
        } else {
          caretAfter(placed);
        }
        emit();
        return true;
      };

      if (isMathLiveReady()) return run();
      return loadMathLive().then(() => run());
    },
    [disabled, emit, focusEditor],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: focusEditor,
      insertText: (text: string) => {
        const root = rootRef.current;
        if (!root || !text) return;
        if (!currentRange(root)) focusEditor();
        const room = roomFor(selectionText(root).length);
        if (room <= 0) {
          latest.current.onLimit?.();
          return;
        }
        insertPlainText(root, text.slice(0, room));
        emit();
      },
      insertMath,
      getValue: () => (rootRef.current ? serializeRoot(rootRef.current) : latest.current.value),
      setValue: (next: string) => {
        render(next);
        emit();
      },
      getSelectionText: () => (rootRef.current ? selectionText(rootRef.current) : ""),
      clear: () => {
        const root = rootRef.current;
        if (!root) return;
        root.replaceChildren();
        emit();
      },
      preload: ensureLive,
    }),
    [emit, ensureLive, focusEditor, insertMath, render, roomFor],
  );

  /* ---- native events ---- */

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onInput = () => {
      // A formula edited from inside keeps a plain copy for the fallbacks (selection clone, serialization of unmounted fields).
      root.querySelectorAll<HTMLElement>(`[${MATH_ATTR}]`).forEach((node) => {
        if (!isChip(node)) node.setAttribute("data-latex", readLatex(node));
      });
      if (!composing.current) {
        root.normalize();
        normalizeRoot(root);
      }
      latest.current.onActivity?.();
      emit();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      lastKey.current = event.key;
      const inner = mathNodeOf(event.target as Node, root);
      const imeBusy = composing.current || event.isComposing || event.keyCode === 229;
      if (event.key === "Escape") {
        if (!imeBusy) latest.current.onEscape?.(event);
        return;
      }
      if (event.key === "Enter") {
        if (imeBusy) return;
        if (event.shiftKey) {
          if (inner) return;
          event.preventDefault();
          insertLineBreak(root);
          emit();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        latest.current.onSubmit();
        return;
      }
      if (imeBusy) return;

      if (inner) {
        // Tab hops to another empty box while the formula has one (MathLive's own Tab leaves; its "next" follows model order, which
        // puts a superscript before a subscript, so fall back to "previous"); with none left Tab leaves the editor as usual.
        if (event.key === "Tab" && !event.shiftKey && !isChip(inner)) {
          const f = inner as MathFieldLike;
          if (/\\placeholder(\[[^\]]*\])?\{\}/.test(f.getValue("latex"))) {
            const where = () => JSON.stringify(f.selection?.ranges);
            const before = where();
            // A "next" with nowhere to go makes MathLive report move-out (and move focus on); swallow that while hopping.
            hopping.current = true;
            try {
              f.executeCommand("moveToNextPlaceholder");
              // Only from a caret (a box just typed into), never from a selected empty box: that would cycle between two boxes and trap Tab.
              const range = f.selection?.ranges[0];
              if (where() === before && range && range[0] === range[1]) f.executeCommand("moveToPreviousPlaceholder");
            } finally {
              hopping.current = false;
            }
            if (where() !== before) {
              event.preventDefault();
              event.stopPropagation();
            }
          }
          return;
        }
        // An empty formula goes away on Backspace / Delete; MathLive would only bounce the key.
        if ((event.key === "Backspace" || event.key === "Delete") && !isChip(inner) && isEmptyMath(inner)) {
          event.preventDefault();
          event.stopPropagation();
          removeMath(inner, event.key === "Backspace" ? "before" : "after");
        }
        return;
      }
      if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const rtl = getComputedStyle(root).direction === "rtl";
        const forward = (event.key === "ArrowRight") !== rtl;
        const node = adjacentMath(root, forward ? "forward" : "backward");
        if (node) {
          event.preventDefault();
          enterMath(node, forward ? "start" : "end");
        }
      } else if (event.key === "Backspace" || event.key === "Delete") {
        const forward = event.key === "Delete";
        const node = adjacentMath(root, forward ? "forward" : "backward");
        if (!node) return;
        event.preventDefault();
        if (isChip(node) || isEmptyMath(node)) removeMath(node, forward ? "after" : "before");
        else enterMath(node, forward ? "start" : "end");
      }
    };

    const onMoveOut = (event: Event) => {
      const node = mathNodeOf(event.target as Node, root);
      if (!node) return;
      if (hopping.current) {
        event.preventDefault();
        return;
      }
      // Tab keeps its job: leave the editor.
      if (lastKey.current === "Tab") return;
      const direction = (event as CustomEvent<{ direction: string }>).detail?.direction;
      event.preventDefault();
      // Up / Down inside a formula with nowhere to go stay in it; only Left / Right (backward / forward) leave.
      if (direction === "backward" || direction === "forward") leaveMath(node, direction);
    };

    const onBeforeInput = (event: InputEvent) => {
      if (mathNodeOf(event.target as Node, root)) return;
      const type = event.inputType;
      // Soft keyboards report Enter as a paragraph insertion, not a key.
      if (type === "insertParagraph") {
        event.preventDefault();
        if (!composing.current && !event.isComposing) latest.current.onSubmit();
        return;
      }
      if (composing.current || event.isComposing || !INPUT_TYPES_WITH_TEXT.has(type)) return;
      const range = currentRange(root);
      const replacing = range && !range.collapsed ? selectionText(root).length : 0;
      const data = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
      if (data && data.length > roomFor(replacing)) {
        event.preventDefault();
        latest.current.onLimit?.();
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (mathNodeOf(event.target as Node, root)) return;
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      // Files (and image-only clipboards) belong to the composer's attach logic.
      if (!pasted) return;
      event.preventDefault();
      latest.current.onActivity?.();
      const range = currentRange(root);
      const replacing = range && !range.collapsed ? selectionText(root).length : 0;
      const room = roomFor(replacing);
      if (room <= 0) {
        latest.current.onLimit?.();
        return;
      }
      const text = pasted.length > room ? pasted.slice(0, room) : pasted;
      if (pasted.length > room) latest.current.onLimit?.();
      if (!range) focusEditor();
      if (text.includes("$") && parseComposerValue(text).some((s) => s.kind === "math")) insertWire(text);
      else insertPlainText(root, text);
      emit();
    };

    /** Pasted text that carries `$…$` becomes formulas. */
    const insertWire = (text: string) => {
      const live = isMathLiveReady();
      if (!live) ensureLive();
      const range = currentRange(root);
      if (!range) return;
      range.deleteContents();
      const holder = document.createElement("div");
      renderRoot(holder, text, { live, label: latest.current.formulaLabel });
      const last = holder.lastChild;
      const fragment = document.createDocumentFragment();
      while (holder.firstChild) fragment.append(holder.firstChild);
      range.insertNode(fragment);
      root.normalize();
      normalizeRoot(root);
      if (last?.parentNode === root) setCaret(last, last.nodeType === Node.TEXT_NODE ? (last as Text).data.length : 0);
    };

    const onCopy = (event: ClipboardEvent) => {
      const range = currentRange(root);
      if (!range || range.collapsed || mathNodeOf(event.target as Node, root)) return;
      event.clipboardData?.setData("text/plain", selectionText(root));
      event.preventDefault();
      if (event.type === "cut") {
        if (typeof document.execCommand === "function" && document.execCommand("delete")) return;
        range.deleteContents();
        normalizeRoot(root);
        emit();
      }
    };

    const onDrop = (event: DragEvent) => {
      const transfer = event.dataTransfer;
      if (!transfer || Array.from(transfer.types).includes("Files")) return;
      event.preventDefault();
      const text = transfer.getData("text/plain");
      if (!text) return;
      const point = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(event.clientX, event.clientY);
      if (point && root.contains(point.startContainer)) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(point);
      } else if (!currentRange(root)) focusEditor();
      insertPlainText(root, text);
      emit();
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && root.contains(next)) return;
      // Wait out focus moving between the editor and a formula; only a real exit prunes empty formulas.
      window.setTimeout(() => {
        if (root.contains(document.activeElement)) return;
        if (removeEmptyMath(root)) emit();
      }, 0);
    };

    const onSelectionChange = () => {
      const range = currentRange(root);
      if (range) lastRange.current = range.cloneRange();
    };

    const onCompositionStart = () => {
      composing.current = true;
    };
    const onCompositionEnd = () => {
      composing.current = false;
      const max = latest.current.maxChars;
      if (max !== undefined && serializeRoot(root).length > max) latest.current.onLimit?.();
      onInput();
    };

    root.addEventListener("keydown", onKeyDown, true);
    root.addEventListener("move-out", onMoveOut, true);
    root.addEventListener("input", onInput);
    root.addEventListener("beforeinput", onBeforeInput);
    root.addEventListener("paste", onPaste);
    root.addEventListener("copy", onCopy);
    root.addEventListener("cut", onCopy);
    root.addEventListener("drop", onDrop);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("compositionstart", onCompositionStart);
    root.addEventListener("compositionend", onCompositionEnd);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      root.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("move-out", onMoveOut, true);
      root.removeEventListener("input", onInput);
      root.removeEventListener("beforeinput", onBeforeInput);
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("copy", onCopy);
      root.removeEventListener("cut", onCopy);
      root.removeEventListener("drop", onDrop);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("compositionstart", onCompositionStart);
      root.removeEventListener("compositionend", onCompositionEnd);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [emit, enterMath, ensureLive, focusEditor, leaveMath, removeMath, roomFor]);

  return (
    <div
      ref={rootRef}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-placeholder={placeholder}
      contentEditable={!disabled}
      tabIndex={disabled ? -1 : 0}
      suppressContentEditableWarning
      dir="auto"
      spellCheck
      inputMode="text"
      enterKeyHint="send"
      data-placeholder={placeholder}
      data-math-input
      className={`mae-math-input ${className ?? ""}`}
    />
  );
}

export default MathInputArea;
