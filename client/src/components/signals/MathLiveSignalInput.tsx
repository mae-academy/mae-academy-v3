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

type Props = { value: string; onChange: (latex: string) => void; labelledBy: string };

export const MathLiveSignalInput = forwardRef<MathLiveSignalInputHandle, Props>(function MathLiveSignalInput({ value, onChange, labelledBy }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const latestChange = useRef(onChange);
  latestChange.current = onChange;

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const field = document.createElement("math-field") as MathfieldElement;
    field.className = "mae-mathlive-field block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 shadow-inner outline-none transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
    field.setAttribute("aria-labelledby", labelledBy);
    field.setAttribute("math-virtual-keyboard-policy", "manual");
    field.setAttribute("smart-fence", "on");
    field.setAttribute("smart-superscript", "on");
    field.setAttribute("placeholder", "\\sin\\!\\left(2\\pi t\\right)");
    field.style.setProperty("--hue", "262");
    field.style.setProperty("--selection-background-color", "rgba(139, 92, 246, 0.25)");
    field.style.setProperty("--caret-color", "#a78bfa");
    field.value = value;
    field.smartFence = true;
    field.smartSuperscript = true;
    field.defaultMode = "math";
    const handleInput = () => latestChange.current(field.value);
    field.addEventListener("input", handleInput);
    host.replaceChildren(field); fieldRef.current = field;
    return () => { field.removeEventListener("input", handleInput); field.remove(); fieldRef.current = null; };
  }, [labelledBy]);

  useEffect(() => { const field = fieldRef.current; if (field && field.value !== value) field.value = value; }, [value]);

  useImperativeHandle(ref, () => ({
    focus: () => fieldRef.current?.focus(),
    insert: (latex, selectionMode = "placeholder") => { const field = fieldRef.current; if (!field) return; field.insert(latex, { format: "latex", focus: true, selectionMode, scrollIntoView: true }); },
    backspace: () => { const field = fieldRef.current; if (!field) return; field.focus(); field.executeCommand("deleteBackward"); },
    setValue: (latex) => { const field = fieldRef.current; if (field) field.value = latex; },
  }), []);

  return <div ref={hostRef} className="min-w-0" />;
});

export default MathLiveSignalInput;
