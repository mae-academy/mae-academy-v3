import { memo, useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { RotateCcw, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CodeBlock } from "@/components/ai/CodeBlock";
import { cn } from "@/lib/utils";
import { EngineStatus, pillButton } from "./engineUi";
import { ParamPlot } from "./ParamPlot";
import { computeOutputs, defaultValues, fieldText, formatSI, parseNumericInput, parseParamsSpec, positionToValue, sliderBounds, valueToPosition, type ParamDef } from "./paramsSpec";

export function ParamsPending() {
  const { t } = useTranslation("ai");
  return <EngineStatus icon={<SlidersHorizontal className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />} text={t("params.preparing")} />;
}

function NumberField({ param, value, onCommit, label }: { param: ParamDef; value: number; onCommit: (value: number) => void; label: string }) {
  const [draft, setDraft] = useState(() => fieldText(value, param.unit));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(fieldText(value, param.unit));
  }, [value, focused, param.unit]);

  const commit = () => {
    const parsed = parseNumericInput(draft, param.unit);
    if (parsed === null) {
      setInvalid(true);
      setDraft(fieldText(value, param.unit));
      return;
    }
    setInvalid(false);
    const clamped = Math.min(param.max, Math.max(param.min, parsed));
    onCommit(clamped);
    setDraft(fieldText(clamped, param.unit));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setDraft(fieldText(value, param.unit));
      setInvalid(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1" dir="ltr">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "h-11 w-24 rounded-lg border bg-white px-2 text-end font-mono text-sm tabular-nums text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 sm:h-9",
          invalid ? "border-red-500" : "border-slate-300",
        )}
      />
      {param.unit ? <span className="min-w-6 text-sm text-slate-600 dark:text-zinc-300">{param.unit}</span> : null}
    </span>
  );
}

function ParameterRow({ param, value, onChange }: { param: ParamDef; value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation("ai");
  const id = useId();
  const bounds = sliderBounds(param);
  return (
    <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} dir="auto" className="min-w-0 break-words text-sm font-medium text-slate-800 dark:text-zinc-100">
            {param.label}
          </label>
          <span dir="ltr" className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-zinc-400" aria-hidden="true">{formatSI(value, param.unit)}</span>
        </div>
        <input
          id={id}
          type="range"
          dir="ltr"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={valueToPosition(param, value)}
          aria-valuetext={formatSI(value, param.unit)}
          onChange={(event) => onChange(positionToValue(param, Number(event.target.value)))}
          className="mt-1 block h-8 w-full cursor-pointer accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        />
        <div dir="ltr" className="flex justify-between text-[11px] tabular-nums text-slate-500 dark:text-zinc-400" aria-hidden="true">
          <span>{formatSI(param.min, param.unit)}</span>
          <span>{formatSI(param.max, param.unit)}</span>
        </div>
      </div>
      <NumberField param={param} value={value} onCommit={onChange} label={t("params.exact", { name: param.label })} />
    </div>
  );
}

export interface InteractiveParameterSliderProps {
  /** The raw text of the ```json:interactive-params fence (untrusted: validated, formulas run in the safe expression engine). */
  code: string;
}

function InteractiveParameterSliderImpl({ code }: InteractiveParameterSliderProps) {
  const { t } = useTranslation("ai");
  const parsed = useMemo(() => parseParamsSpec(code), [code]);
  const [values, setValues] = useState<Record<string, number>>(() => (parsed.ok ? defaultValues(parsed.spec) : {}));
  const [showJson, setShowJson] = useState(false);

  // New spec text (streamed edit or a changed message) starts from its defaults.
  useEffect(() => {
    if (parsed.ok) setValues(defaultValues(parsed.spec));
  }, [parsed]);

  const results = useMemo(() => (parsed.ok ? computeOutputs(parsed.spec, values) : []), [parsed, values]);

  if (!parsed.ok) {
    return (
      <figure className="my-4">
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
            {t("params.errorTitle")}
          </p>
          <ul dir="auto" className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
            {parsed.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="break-words">{t(`params.issue.${issue.code}`, issue.values)}</li>
            ))}
          </ul>
        </div>
        <CodeBlock code={code} language="json" />
      </figure>
    );
  }

  const { spec } = parsed;
  const reset = () => setValues(defaultValues(spec));
  return (
    <figure className="my-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]" data-testid="interactive-params">
      <figcaption dir="auto" className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-white/10">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <span className="min-w-0 break-words">{spec.title || t("params.label")}</span>
      </figcaption>
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-4">
          {spec.parameters.map((param) => (
            <ParameterRow key={param.name} param={param} value={values[param.name] ?? param.default} onChange={(value) => setValues((current) => ({ ...current, [param.name]: value }))} />
          ))}
        </div>
        <div role="group" aria-label={t("params.results")} aria-live="polite" className="grid gap-2 sm:grid-cols-2">
          {results.map((result, index) => (
            <div key={`${result.label}-${index}`} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-white/[0.06] dark:ring-white/10">
              <p dir="auto" className="text-xs font-medium text-slate-600 dark:text-zinc-300">{result.label}</p>
              <p dir="ltr" className="text-start text-xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50" data-testid="param-output">{result.text}</p>
            </div>
          ))}
        </div>
        {spec.plot ? <ParamPlot plot={spec.plot} values={values} alt={t("params.plotAlt", { y: spec.plot.yLabel, x: spec.plot.xLabel })} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={pillButton} onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("params.reset")}
          </button>
          <button type="button" className="min-h-11 rounded-lg px-2 text-xs font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-zinc-300 dark:hover:text-zinc-50 sm:min-h-8" aria-pressed={showJson} onClick={() => setShowJson((shown) => !shown)}>
            {showJson ? t("params.hideJson") : t("params.viewJson")}
          </button>
        </div>
        {showJson ? <CodeBlock code={code} language="json" /> : null}
      </div>
    </figure>
  );
}

export const InteractiveParameterSlider = memo(InteractiveParameterSliderImpl);
export default InteractiveParameterSlider;
