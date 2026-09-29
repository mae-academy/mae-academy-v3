/**
 * MAE Academy / Signals & Systems — canonical Signal Engine terminal.
 * One glassmorphic calculator shared by every studio: one inline row per signal (KaTeX prefix +
 * MathLive editor), split numeric keypad + signal/operator palette, and the symbolic/explicit
 * calculus strip backed by the unified signal parser. With several channels every row is visible
 * at once and the last-clicked/focused row receives all key insertions.
 */
import { forwardRef, useId, useImperativeHandle, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Delete } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import { MathLiveSignalInput, type MathLiveSignalInputHandle } from "@/components/signals/MathLiveSignalInput";
import { cn } from "@/lib/utils";
import {
  differentiateExpression,
  integrateExpression,
  NUMPAD_ROWS,
  OPERATOR_TOKENS,
  SIGNAL_TOKENS,
  discreteTokens,
  spectrumTokens,
  splitSignalEquation,
  transferTokens,
  wrapDerivativeLatex,
  wrapIntegralLatex,
  type OperatorResult,
  type SignalToken,
} from "@/lib/signals/unifiedSignalParser";

/** t: signals; n: discrete sequences; s/z: transfer functions; w: Fourier spectra X(jω). */
export type TerminalDomain = "t" | "n" | "s" | "z" | "w";

export type TerminalChannel = {
  id: string;
  /** KaTeX row prefix without the equals sign, e.g. "x(t)"; a matching "x(t)=" inside `value` is stripped. */
  lhs?: string;
  /** Active-row highlight; defaults to blue. */
  accent?: "blue" | "rose";
  value: string;
  onChange: (latex: string) => void;
  error?: string | null;
};

export type UnifiedSignalEngineTerminalHandle = {
  /** Imperative preview write (no React commit), e.g. while dragging a pole. */
  setValue: (latex: string, channelId?: string) => void;
  focus: () => void;
};

type Props = {
  channels: readonly TerminalChannel[];
  title?: string;
  domain?: TerminalDomain;
  /** Symbolic/explicit calculus strip; defaults to on for the time domain. */
  calculus?: boolean;
  extraTokens?: readonly SignalToken[];
  extraTokensLabel?: string;
  signalTokens?: readonly SignalToken[];
  signalTokensLabel?: string;
  operatorTokens?: readonly SignalToken[];
  operatorTokensLabel?: string;
  className?: string;
  children?: ReactNode;
};

type CalculusStatus = { tone: "info" | "warn" | "error"; text: string } | null;

const key = "inline-flex h-10 min-w-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 px-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-400 hover:text-violet-700 active:scale-95 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-violet-500 dark:hover:text-violet-200 cursor-pointer";
const chip = "inline-flex h-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-violet-400 active:scale-95 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-violet-500 cursor-pointer";
const sectionLabel = "text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400";
const rowIdle = "border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-900/50";
const rowActive = {
  blue: "border-blue-500/80 bg-blue-500/5 ring-2 ring-blue-500/20",
  rose: "border-rose-500/80 bg-rose-500/5 ring-2 ring-rose-500/20",
} as const;

/** Keeps the MathLive caret: a mousedown on a key must never steal focus from the field. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

function operatorTokensFor(domain: TerminalDomain) {
  return domain === "t" || domain === "n" ? OPERATOR_TOKENS : OPERATOR_TOKENS.filter((token) => ["plus", "minus", "times", "divide", "power"].includes(token.id));
}

export const UnifiedSignalEngineTerminal = forwardRef<UnifiedSignalEngineTerminalHandle, Props>(function UnifiedSignalEngineTerminal(
  {
    channels,
    title,
    domain = "t",
    calculus = domain === "t",
    extraTokens,
    extraTokensLabel,
    signalTokens: customSignalTokens,
    signalTokensLabel,
    operatorTokens: customOperatorTokens,
    operatorTokensLabel,
    className,
    children,
  },
  ref,
) {
  const { t } = useTranslation('simulators');
  const resolvedTitle = title ?? t('signals.signalEngineTitle', 'Signal Engine');
  const resolvedExtraTokensLabel = extraTokensLabel ?? t('signals.studioTokensLabel', 'Studio tokens');
  const uid = useId();
  const labelId = `${uid}-label`;
  const editors = useRef<Record<string, MathLiveSignalInputHandle | null>>({});
  const [activeId, setActiveId] = useState(channels[0]?.id ?? "");
  const [status, setStatus] = useState<CalculusStatus>(null);
  const active = channels.find((channel) => channel.id === activeId) ?? channels[0];
  const signalTokens = useMemo(
    () => customSignalTokens ?? (domain === "t" ? SIGNAL_TOKENS : domain === "n" ? discreteTokens() : domain === "w" ? spectrumTokens() : transferTokens(domain)),
    [customSignalTokens, domain],
  );
  const operatorTokens = useMemo(
    () => customOperatorTokens ?? operatorTokensFor(domain),
    [customOperatorTokens, domain],
  );

  useImperativeHandle(ref, () => ({
    setValue: (latex, channelId) => { editors.current[channelId ?? active?.id ?? ""]?.setValue(splitSignalEquation(latex).rhs); },
    focus: () => editors.current[active?.id ?? ""]?.focus(),
  }), [active?.id]);

  if (!active) return null;

  const activeEditor = () => editors.current[active.id];
  /** Fields hold only the right-hand side; the prefix lives in the row label. */
  const fieldValue = (channel: TerminalChannel) => (channel.lhs ? splitSignalEquation(channel.value).rhs : channel.value);
  const commit = (latex: string) => { setStatus(null); active.onChange(latex); };
  const insert = (token: Pick<SignalToken, "insert" | "mode">) => { setStatus(null); activeEditor()?.insert(token.insert, token.mode); };
  const clear = () => { activeEditor()?.setValue(""); commit(""); };
  const applyOperator = (result: OperatorResult, verb: string) => {
    if (!result.ok) { setStatus({ tone: "error", text: result.error }); return; }
    active.onChange(result.latex);
    setStatus(result.method === "symbolic"
      ? { tone: "info", text: `${verb} symbolically.` }
      : { tone: "warn", text: `${verb}; terms without a closed form are evaluated numerically (Δt = 0.005).` });
  };

  return (
    <section className={cn("rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80", className)}>
      <header className="border-b border-slate-100 pb-3 dark:border-slate-800/80">
        <h3 id={labelId} className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">{resolvedTitle}</h3>
      </header>

      {/* A. One inline row per signal: KaTeX prefix + live MathLive editor. */}
      <div className={cn("mt-4 grid w-full grid-cols-1 gap-4", channels.length > 1 && "md:grid-cols-2")}>
        {channels.map((channel) => {
          const selected = channel.id === active.id;
          const rowLabelId = `${uid}-${channel.id}`;
          return (
            <div key={channel.id}>
              <div
                data-channel={channel.id}
                onClick={() => setActiveId(channel.id)}
                onFocusCapture={() => setActiveId(channel.id)}
                className={cn("flex items-center gap-2.5 rounded-xl border p-3 transition-all", channels.length > 1 && "cursor-pointer", channels.length > 1 && selected ? rowActive[channel.accent ?? "blue"] : rowIdle)}
              >
                {channel.lhs && (
                  <span id={rowLabelId} className="font-serif text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <KatexMath math={`${channel.lhs}=`} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <MathLiveSignalInput
                    compact
                    ref={(handle) => { editors.current[channel.id] = handle; }}
                    value={fieldValue(channel)}
                    onChange={(latex) => { setStatus(null); channel.onChange(latex); }}
                    labelledBy={channel.lhs ? rowLabelId : labelId}
                  />
                </div>
              </div>
              {channel.error && <p role="alert" className="mt-2 text-xs font-medium text-rose-500">{t('signals.syntaxErrorPrefix', 'Syntax error:')} {channel.error}</p>}
            </div>
          );
        })}
      </div>
      {status && (
        <p role="status" className={cn("mt-2 text-xs font-medium", status.tone === "info" ? "text-blue-600 dark:text-blue-300" : status.tone === "warn" ? "text-amber-600 dark:text-amber-300" : "text-rose-500")}>
          {status.text}
        </p>
      )}

      {/* B. Split terminal: numeric keypad | signal & operator palette. */}
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(11rem,13rem)_minmax(0,1fr)]">
        <div>
          <p className={sectionLabel}>{t('signals.keypadLabel', 'Keypad')}</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {NUMPAD_ROWS.flat().map((digit) => (
              <button key={digit} type="button" aria-label={digit} onMouseDown={keepFocus} onClick={() => insert({ insert: digit, mode: "after" })} className={key}><KatexMath math={digit} /></button>
            ))}
            <button type="button" aria-label="Decimal point" onMouseDown={keepFocus} onClick={() => insert({ insert: ".", mode: "after" })} className={key}><KatexMath math="." /></button>
            <button type="button" aria-label="Backspace" onMouseDown={keepFocus} onClick={() => { setStatus(null); activeEditor()?.backspace(); }} className={key}><Delete className="h-4 w-4" /></button>
            <button type="button" aria-label="Clear" onMouseDown={keepFocus} onClick={clear} className={cn(key, "text-rose-600 hover:border-rose-400 hover:text-rose-700 dark:text-rose-300 dark:hover:border-rose-500 dark:hover:text-rose-200")}>AC</button>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <p className={sectionLabel}>{signalTokensLabel ?? (domain === "t" ? t('signals.signalsLabel', 'Signals') : domain === "n" ? t('signals.sequencesLabel', 'Sequences') : domain === "w" ? t('signals.spectrumLabel', 'Spectrum') : t('signals.transferFunctionLabel', 'Transfer function'))}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {signalTokens.map((token) => (
                <button key={token.id} type="button" aria-label={token.ariaLabel} onMouseDown={keepFocus} onClick={() => insert(token)} className={chip}><KatexMath math={token.label} /></button>
              ))}
            </div>
          </div>
          <div>
            <p className={sectionLabel}>{operatorTokensLabel ?? t('signals.operatorsConstants', 'Operators & constants')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {operatorTokens.map((token) => (
                <button key={token.id} type="button" aria-label={token.ariaLabel} onMouseDown={keepFocus} onClick={() => insert(token)} className={cn(chip, "min-w-10")}><KatexMath math={token.label} /></button>
              ))}
            </div>
          </div>
          {extraTokens && extraTokens.length > 0 && (
            <div>
              <p className={sectionLabel}>{resolvedExtraTokensLabel}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {extraTokens.map((token) => (
                  <button key={token.id} type="button" aria-label={token.ariaLabel} onMouseDown={keepFocus} onClick={() => insert(token)} className={chip}><KatexMath math={token.label} /></button>
                ))}
              </div>
            </div>
          )}
          {calculus && (
            <div>
              <p className={sectionLabel}>{t('signals.calculusEngineLabel', 'Calculus Engine')}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" aria-label="Differentiate Expression" title="Differentiate Expression" onMouseDown={keepFocus} onClick={() => applyOperator(differentiateExpression(active.value), "Differentiated")} className={chip}><KatexMath math={String.raw`\frac{d}{dt}f(t)`} /></button>
                <button type="button" aria-label="Integrate Expression" title="Integrate Expression" onMouseDown={keepFocus} onClick={() => applyOperator(integrateExpression(active.value), "Integrated")} className={chip}><KatexMath math={String.raw`\int f(t)\,dt`} /></button>
                <button type="button" aria-label="Wrap in derivative operator" title="Wrap in d/dt ( … )" onMouseDown={keepFocus} onClick={() => commit(wrapDerivativeLatex(active.value))} className={chip}><KatexMath math={String.raw`\text{Wrap }\frac{d}{dt}`} /></button>
                <button type="button" aria-label="Wrap in running integral operator" title="Wrap in ∫ ( … ) dτ" onMouseDown={keepFocus} onClick={() => commit(wrapIntegralLatex(active.value))} className={chip}><KatexMath math={String.raw`\text{Wrap }\int`} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
      {children}
    </section>
  );
});

export default UnifiedSignalEngineTerminal;
