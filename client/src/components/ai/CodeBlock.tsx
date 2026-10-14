import { memo, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

const LANGUAGE_LABELS: Record<string, string> = {
  cpp: "C++", "c++": "C++", cxx: "C++", cc: "C++", hpp: "C++",
  c: "C", h: "C",
  arduino: "Arduino", ino: "Arduino",
  python: "Python", py: "Python",
  matlab: "MATLAB", m: "MATLAB", octave: "Octave",
  javascript: "JavaScript", js: "JavaScript", jsx: "JavaScript",
  typescript: "TypeScript", ts: "TypeScript", tsx: "TypeScript",
  verilog: "Verilog", systemverilog: "SystemVerilog", sv: "SystemVerilog", vhdl: "VHDL",
  asm: "Assembly", assembly: "Assembly", masm: "Assembly", nasm: "Assembly", masm8086: "Assembly",
  bash: "Shell", sh: "Shell", shell: "Shell", zsh: "Shell",
  json: "JSON", yaml: "YAML", yml: "YAML", xml: "XML", html: "HTML", css: "CSS",
  latex: "LaTeX", tex: "LaTeX",
  spice: "SPICE", sp: "SPICE", cir: "SPICE",
  st: "Structured Text", ladder: "Ladder", sql: "SQL", java: "Java", rust: "Rust", go: "Go",
};

/** Human label for a fence info string; unknown languages keep their own name, none gives null. */
export function languageLabel(language: string | undefined): string | null {
  const key = (language ?? "").trim().toLowerCase();
  if (!key || key === "text" || key === "txt" || key === "plaintext") return null;
  return LANGUAGE_LABELS[key] ?? key.replace(/^./, (c) => c.toUpperCase());
}

/** Clipboard write that also works on insecure origins and older browsers; resolves false when blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission denied or unfocused document: fall back */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

type CopyState = "idle" | "copied" | "failed";

function CodeBlockImpl({ code, language }: { code: string; language?: string }) {
  const { t } = useTranslation("ai");
  const [copy, setCopy] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const label = languageLabel(language) ?? t("chat.codeLabel");
  const onCopy = async () => {
    const ok = await copyText(code);
    setCopy(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy("idle"), 1800);
  };

  return (
    // Code is always left-to-right, even inside Arabic replies.
    <div dir="ltr" className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left dark:border-white/[0.08] dark:bg-[#08080A]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/80 py-1 ps-3 pe-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 dark:text-zinc-300 dark:hover:bg-white/[0.08]"
        >
          {copy === "copied" ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>{copy === "copied" ? t("chat.copied") : copy === "failed" ? t("chat.copyFailed") : t("chat.copy")}</span>
        </button>
        <span role="status" aria-live="polite" className="sr-only">{copy === "copied" ? t("chat.copied") : copy === "failed" ? t("chat.copyFailed") : ""}</span>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-slate-800 dark:text-zinc-200"><code className="font-mono whitespace-pre">{code}</code></pre>
    </div>
  );
}

export const CodeBlock = memo(CodeBlockImpl);
export default CodeBlock;
