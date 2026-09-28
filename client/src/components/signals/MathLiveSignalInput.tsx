/**
 * MAE Academy / Signals & Systems — structured math input.
 * MathLive owns the live command/block tree, DOM projection, and logical cursor;
 * React only observes committed LaTeX, never emulates a text-editor caret.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { MathfieldElement } from "mathlive";

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

export type MathLiveSignalInputHandle = {
  focus: () => void;
  insert: (latex: string, selectionMode?: "placeholder" | "after" | "before" | "item") => void;
  backspace: () => void;
  setValue: (latex: string) => void;
};

type Props = { value: string; onChange: (latex: string) => void; onBlur?: () => void; labelledBy: string; /** Borderless inline variant for embedding inside a host row that already draws the chrome. */ compact?: boolean };

export const MathLiveSignalInput = forwardRef<MathLiveSignalInputHandle, Props>(function MathLiveSignalInput({ value, onChange, onBlur, labelledBy, compact = false }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const latestChange = useRef(onChange);
  latestChange.current = onChange;
  const latestBlur = useRef(onBlur);
  latestBlur.current = onBlur;

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const field = document.createElement("math-field") as MathfieldElement;
    field.className = compact
      ? "mae-mathlive-field block min-h-10 w-full bg-transparent px-1 py-1 text-xl text-slate-900 outline-none dark:text-white"
      : "mae-mathlive-field block min-h-14 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-2xl text-slate-900 shadow-sm backdrop-blur outline-none transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900/70 dark:text-white";
    field.setAttribute("aria-labelledby", labelledBy);
    field.setAttribute("math-virtual-keyboard-policy", "manual");
    field.setAttribute("smart-fence", "on");
    field.setAttribute("smart-superscript", "on");
    field.setAttribute("placeholder", "\\sin\\!\\left(2\\pi t\\right)");
    field.style.setProperty("--hue", "262");
    field.style.setProperty("--selection-background-color", "rgba(139, 92, 246, 0.25)");
    field.style.setProperty("--caret-color", "#a78bfa");
    // MathLive's \text{...} (rect, sinc, sgn, …) renders via .ML__text, which defaults to a
    // sans-serif CSS stack unlike math-mode content — force it onto the same KaTeX serif family.
    field.style.setProperty("--text-font-family", "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif");
    field.value = value;
    field.smartFence = true;
    field.smartSuperscript = true;
    field.defaultMode = "math";
    const handleInput = () => latestChange.current(field.value);
    const handleBlur = () => { if (latestBlur.current) latestBlur.current(); };
    field.addEventListener("input", handleInput);
    field.addEventListener("focusout", handleBlur);
    host.replaceChildren(field); fieldRef.current = field;
    // Strip the Desmos-style chrome once mounted: no context menu, no virtual-keyboard toggle.
    field.menuItems = [];
    const stripToggles = () => field.shadowRoot?.querySelector(".ML__toggles")?.remove();
    stripToggles();
    const toggles = new MutationObserver(stripToggles);
    if (field.shadowRoot) toggles.observe(field.shadowRoot, { childList: true, subtree: true });
    return () => { toggles.disconnect(); field.removeEventListener("input", handleInput); field.removeEventListener("focusout", handleBlur); field.remove(); fieldRef.current = null; };
  }, [labelledBy, compact]);

  useEffect(() => { const field = fieldRef.current; if (field && field.value !== value) field.value = value; }, [value]);

  useImperativeHandle(ref, () => ({
    focus: () => fieldRef.current?.focus(),
    // An unfocused field still holds a full-document selection, so pill insertions append instead of replacing.
    insert: (latex, selectionMode = "placeholder") => { const field = fieldRef.current; if (!field) return; const appending = document.activeElement !== field; field.focus(); if (appending) field.position = field.lastOffset; field.insert(latex, { format: "latex", focus: true, selectionMode, scrollIntoView: true }); },
    backspace: () => { const field = fieldRef.current; if (!field) return; field.focus(); field.executeCommand("deleteBackward"); },
    setValue: (latex) => { const field = fieldRef.current; if (field) field.value = latex; },
  }), []);

  return <div ref={hostRef} className="min-w-0" />;
});

export default MathLiveSignalInput;
