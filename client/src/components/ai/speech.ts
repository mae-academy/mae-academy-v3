import { useSyncExternalStore } from "react";
import { stripLegacySchematicTag } from "@shared/aiTypes";
import { recognitionLang } from "./voiceInput";

/* ---------- text preparation (pure) ---------- */

export type SpokenLang = "en" | "ar" | "es";

const WORDS: Record<SpokenLang, Record<string, string>> = {
  en: { over: "over", squared: "squared", cubed: "cubed", power: "to the power of", sub: "sub", sqrt: "square root of", root: "root", equals: "equals", plus: "plus", minus: "minus", times: "times", ohms: "ohms", pm: "plus or minus", leq: "less than or equal to", geq: "greater than or equal to", neq: "not equal to", approx: "approximately", to: "goes to", sum: "sum", integral: "integral", infinity: "infinity", degrees: "degrees", code: "code block omitted", partial: "partial", nabla: "nabla", of: "of" },
  ar: { over: "على", squared: "تربيع", cubed: "تكعيب", power: "أس", sub: "سفلي", sqrt: "الجذر التربيعي لـ", root: "جذر", equals: "يساوي", plus: "زائد", minus: "ناقص", times: "ضرب", ohms: "أوم", pm: "زائد أو ناقص", leq: "أصغر من أو يساوي", geq: "أكبر من أو يساوي", neq: "لا يساوي", approx: "تقريبًا", to: "يؤول إلى", sum: "مجموع", integral: "تكامل", infinity: "ما لا نهاية", degrees: "درجة", code: "تم حذف كتلة الشيفرة", partial: "جزئي", nabla: "نابلا", of: "لـ" },
  es: { over: "entre", squared: "al cuadrado", cubed: "al cubo", power: "elevado a", sub: "sub", sqrt: "raíz cuadrada de", root: "raíz", equals: "igual a", plus: "más", minus: "menos", times: "por", ohms: "ohmios", pm: "más o menos", leq: "menor o igual que", geq: "mayor o igual que", neq: "distinto de", approx: "aproximadamente", to: "tiende a", sum: "suma", integral: "integral", infinity: "infinito", degrees: "grados", code: "bloque de código omitido", partial: "parcial", nabla: "nabla", of: "de" },
};

const GREEK = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"];
const FUNCTIONS = ["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "lim", "max", "min", "det", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh"];
const UNICODE_GREEK: Record<string, string> = { α: "alpha", β: "beta", γ: "gamma", δ: "delta", Δ: "delta", ε: "epsilon", θ: "theta", λ: "lambda", μ: "mu", π: "pi", ρ: "rho", σ: "sigma", τ: "tau", φ: "phi", ω: "omega", ζ: "zeta" };

/** Spoken-ish LaTeX: modest on purpose (fractions, roots, powers, subscripts, Greek, common operators). */
export function latexToSpoken(tex: string, lang: SpokenLang = "en"): string {
  const w = WORDS[lang];
  let s = ` ${tex} `;

  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)(?![a-zA-Z])\s*/g, "");
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|mathbb|mathcal|operatorname|textbf|boldsymbol|vec|hat|bar|tilde|overline|underline)\s*\{([^{}]*)\}/g, " $1 ");
  // Innermost-first so nested fractions and roots resolve.
  for (let i = 0; i < 8; i++) {
    const before = s;
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ` $1 ${w.over} $2 `);
    s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, ` $1 ${w.root} $2 `);
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, ` ${w.sqrt} $1 `);
    s = s.replace(/\\sqrt\s*([A-Za-z0-9])/g, ` ${w.sqrt} $1 `);
    if (s === before) break;
  }
  // Powers: ^2 and ^3 have names; the rest read as "to the power of".
  s = s.replace(/\^\s*\{\s*\\circ\s*\}|\^\s*\\circ/g, ` ${w.degrees} `);
  s = s.replace(/\^\s*(?:\{\s*([^{}]*?)\s*\}|(\\[A-Za-z]+|[A-Za-z0-9]))/g, (_m, braced: string | undefined, bare: string | undefined) => {
    const exp = (braced ?? bare ?? "").trim();
    if (exp === "2") return ` ${w.squared} `;
    if (exp === "3") return ` ${w.cubed} `;
    return ` ${w.power} ${exp} `;
  });
  s = s.replace(/_\s*(?:\{\s*([^{}]*?)\s*\}|(\\[A-Za-z]+|[A-Za-z0-9]))/g, (_m, braced: string | undefined, bare: string | undefined) => ` ${w.sub} ${(braced ?? bare ?? "").trim()} `);

  s = s.replace(/\\Omega(?![a-zA-Z])|\u03A9|\u2126/g, ` ${w.ohms} `);
  s = s.replace(new RegExp(`\\\\(${GREEK.join("|")}|var(?:epsilon|theta|phi|rho|sigma))(?![a-zA-Z])`, "gi"), (_m, name: string) => ` ${name.replace(/^var/i, "").toLowerCase()} `);
  s = s.replace(/\\(Delta|Gamma|Theta|Lambda|Pi|Sigma|Phi|Psi)(?![a-zA-Z])/g, (_m, name: string) => ` ${name.toLowerCase()} `);
  s = s.replace(/[αβγδΔεθλμπρστφωζ]/g, (c) => ` ${UNICODE_GREEK[c]} `);
  s = s.replace(/\\(?:cdot|times)(?![a-zA-Z])/g, ` ${w.times} `);
  s = s.replace(/\\pm(?![a-zA-Z])/g, ` ${w.pm} `);
  s = s.replace(/\\(?:leq?|leqslant)(?![a-zA-Z])/g, ` ${w.leq} `);
  s = s.replace(/\\(?:geq?|geqslant)(?![a-zA-Z])/g, ` ${w.geq} `);
  s = s.replace(/\\neq?(?![a-zA-Z])/g, ` ${w.neq} `);
  s = s.replace(/\\approx(?![a-zA-Z])/g, ` ${w.approx} `);
  s = s.replace(/\\(?:to|rightarrow|longrightarrow)(?![a-zA-Z])/g, ` ${w.to} `);
  s = s.replace(/\\sum(?![a-zA-Z])/g, ` ${w.sum} `);
  s = s.replace(/\\(?:int|oint)(?![a-zA-Z])/g, ` ${w.integral} `);
  s = s.replace(/\\infty(?![a-zA-Z])/g, ` ${w.infinity} `);
  s = s.replace(/\\partial(?![a-zA-Z])/g, ` ${w.partial} `);
  s = s.replace(/\\nabla(?![a-zA-Z])/g, ` ${w.nabla} `);
  s = s.replace(new RegExp(`\\\\(${FUNCTIONS.join("|")})(?![a-zA-Z])`, "g"), " $1 ");
  s = s.replace(/\\\\/g, ", ");
  s = s.replace(/\\[,;:!> ]|\\(?:quad|qquad)(?![a-zA-Z])/g, " ");
  s = s.replace(/\\(?:begin|end)\s*\{[^{}]*\}/g, " ");
  s = s.replace(/\\[a-zA-Z]+/g, " "); // any command we do not know is skipped rather than read out as "backslash"
  s = s.replace(/[{}$&]/g, " ");
  s = s.replace(/=/g, ` ${w.equals} `).replace(/\+/g, ` ${w.plus} `).replace(/(?<=[\w)\s])\s-\s?|(?<=[\w)])-(?=[\w(])/g, ` ${w.minus} `);
  s = s.replace(/\*/g, ` ${w.times} `).replace(/<=/g, ` ${w.leq} `).replace(/>=/g, ` ${w.geq} `);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Plain, speakable text from a (cleaned) Markdown + LaTeX answer: no code, no schematics, no tables syntax, no markup.
 * Code blocks become a short spoken note; `schematic` fences and the JSON they carry are dropped silently.
 */
export function toSpokenText(markdown: string, lang: SpokenLang = "en"): string {
  const w = WORDS[lang];
  let s = markdown.replace(/\r\n?/g, "\n");

  // Fences first (an unclosed fence, as in a stopped stream, runs to the end).
  s = s.replace(/(^|\n)[ \t]*(```|~~~)([^\n]*)\n?([\s\S]*?)(?:\n[ \t]*\2[ \t]*(?=\n|$)|$)/g, (_m, lead: string, _fence: string, info: string) =>
    /^\s*schematic\b/i.test(info) ? `${lead}\n` : `${lead}\n${w.code}.\n`,
  );
  s = stripLegacySchematicTag(s.replace(/\[\[SIM:[a-z]+\]\]/g, " "));

  // Math before any other markdown: its symbols (`_`, `*`, `|`) must not be read as markup.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => `, ${latexToSpoken(tex, lang)}, `);
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex: string) => `, ${latexToSpoken(tex, lang)}, `);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex: string) => ` ${latexToSpoken(tex, lang)} `);
  s = s.replace(/(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$])/g, (_m, tex: string) => ` ${latexToSpoken(tex, lang)} `);

  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");

  const lines = s.split("\n").flatMap((raw) => {
    let line = raw.trim();
    if (/^\|?[\s:|-]+\|?$/.test(line) && line.includes("-") && line.includes("|")) return []; // table rule
    if (/^[-*_]{3,}$/.test(line)) return [];
    if (line.startsWith("|")) line = line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).filter(Boolean).join(", ");
    line = line.replace(/^#{1,6}\s+/, "").replace(/^>\s?/, "").replace(/^([-*+]|\d+[.)])\s+/, "");
    return [line];
  });
  s = lines.join("\n");
  s = s.replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(\*|_)(?=\S)(.+?)(?<=\S)\1/g, "$2").replace(/~~(.+?)~~/g, "$1");
  s = s.replace(/\u03A9|\u2126/g, ` ${w.ohms} `);
  return s.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").replace(/ ?\n ?/g, "\n").trim();
}

/** Splits into sentence-sized pieces (Chrome silently stops long utterances); pieces over `max` break at spaces. */
export function chunkSentences(text: string, max = 200): string[] {
  const pieces = text.split(/(?<=[.!?؟۔…:;\n])\s+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const piece of pieces) {
    let rest = piece;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max * 0.5) cut = max;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/** Share of letters that are Arabic script. */
export function arabicRatio(text: string): number {
  const letters = text.match(/[A-Za-z\u00C0-\u024F\u0370-\u04FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? [];
  if (letters.length === 0) return 0;
  const arabic = text.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g) ?? [];
  return arabic.length / letters.length;
}

/** `ar-SA` when more than 30% of the letters are Arabic, otherwise the UI language's tag. */
export function detectSpeechLang(text: string, uiLang: string | undefined | null): string {
  return arabicRatio(text) > 0.3 ? "ar-SA" : recognitionLang(uiLang);
}

export function spokenLangOf(tag: string): SpokenLang {
  const base = tag.slice(0, 2).toLowerCase();
  return base === "ar" || base === "es" ? base : "en";
}

/** Best installed voice for a BCP 47 tag: exact tag, then same language (preferring a local voice), else none. */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const norm = (v: string) => v.toLowerCase().replace("_", "-");
  const want = norm(lang);
  const base = want.split("-")[0];
  const exact = voices.filter((v) => norm(v.lang) === want);
  const same = voices.filter((v) => norm(v.lang).split("-")[0] === base);
  const pool = exact.length ? exact : same;
  return pool.find((v) => v.localService) ?? pool[0] ?? null;
}

/* ---------- speaking controller (one voice at a time, app-wide) ---------- */

export type SpeechProblem = "voice" | "failed";
export interface SpeechSnapshot {
  speakingId: string | null;
}

interface SynthLike {
  speak: (u: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  getVoices: () => SpeechSynthesisVoice[];
  addEventListener?: (type: "voiceschanged", cb: () => void) => void;
  removeEventListener?: (type: "voiceschanged", cb: () => void) => void;
}

export function isSpeechSynthesisSupported(target: { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown } | undefined = typeof window === "undefined" ? undefined : window): boolean {
  return !!target && !!target.speechSynthesis && typeof target.SpeechSynthesisUtterance === "function";
}

const VOICES_WAIT_MS = 500;

export interface SpeechController {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SpeechSnapshot;
  /** Speaks `text` as message `id`, replacing whatever was speaking. `onProblem` reports a missing voice or an engine failure. */
  speak: (id: string, text: string, uiLang: string, onProblem?: (problem: SpeechProblem) => void) => void;
  stop: () => void;
}

export function createSpeechController(getSynth: () => SynthLike | null, makeUtterance: (text: string) => SpeechSynthesisUtterance): SpeechController {
  let snapshot: SpeechSnapshot = { speakingId: null };
  const listeners = new Set<() => void>();
  let token = 0;

  const set = (speakingId: string | null) => {
    if (snapshot.speakingId === speakingId) return;
    snapshot = { speakingId };
    listeners.forEach((listener) => listener());
  };

  const loadVoices = (synth: SynthLike): Promise<SpeechSynthesisVoice[]> =>
    new Promise((resolve) => {
      const now = synth.getVoices();
      if (now.length > 0 || !synth.addEventListener) return resolve(now);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        synth.removeEventListener?.("voiceschanged", finish);
        resolve(synth.getVoices());
      };
      const timer = setTimeout(finish, VOICES_WAIT_MS);
      synth.addEventListener("voiceschanged", finish);
    });

  const stop = () => {
    token += 1;
    set(null);
    try { getSynth()?.cancel(); } catch { /* nothing to cancel */ }
  };

  const speak: SpeechController["speak"] = (id, text, uiLang, onProblem) => {
    const synth = getSynth();
    const chunks = chunkSentences(text);
    if (!synth || chunks.length === 0) return;
    const mine = ++token;
    try { synth.cancel(); } catch { /* ignore */ }
    set(id);
    const lang = detectSpeechLang(text, uiLang);

    void loadVoices(synth).then((voices) => {
      if (token !== mine) return;
      const voice = pickVoice(voices, lang);
      let index = 0;
      const next = () => {
        if (token !== mine) return;
        if (index >= chunks.length) { set(null); return; }
        const utterance = makeUtterance(chunks[index++]);
        utterance.lang = voice?.lang ?? lang;
        if (voice) utterance.voice = voice;
        utterance.onend = next;
        utterance.onerror = (event) => {
          if (token !== mine) return;
          const code = (event as SpeechSynthesisErrorEvent).error;
          if (code === "canceled" || code === "interrupted") return;
          token += 1;
          set(null);
          onProblem?.(voice ? "failed" : "voice");
        };
        try { synth.speak(utterance); } catch { token += 1; set(null); onProblem?.("failed"); }
      };
      next();
    });
  };

  return {
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    speak,
    stop,
  };
}

let shared: SpeechController | null = null;
/** The app-wide controller (lazy, so importing this module never touches `window`). */
export function getSpeechController(): SpeechController {
  shared ??= createSpeechController(
    () => (isSpeechSynthesisSupported() ? (window.speechSynthesis as unknown as SynthLike) : null),
    (text) => new SpeechSynthesisUtterance(text),
  );
  return shared;
}

export function stopSpeaking(): void {
  if (shared) shared.stop();
}

/** Which message (if any) is being read aloud, plus the shared speak / stop actions. */
export function useSpeech(controller: SpeechController = getSpeechController()) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { speakingId: snapshot.speakingId, speak: controller.speak, stop: controller.stop };
}
