/**
 * MAE Academy / Signals & Systems — Tab B System Classification laboratory.
 * The unified Signal Engine terminal feeds a pure classifier; each accordion presents
 * a traceable KaTeX proof plus an imperative visual counterexample or proof.
 */
import { Activity, Braces, CheckCircle2, ChevronRight, CircleAlert, FunctionSquare, Sigma, Timer, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { KatexMath } from "@/components/ui/KatexMath";
import { StatusBadge, StudioSlider, StudioCard, InnerBox } from "@/components/common/templates";
import { UnifiedSignalEngineTerminal } from "@/components/signals/common/UnifiedSignalEngineTerminal";
import type { SignalToken } from "@/lib/signals/unifiedSignalParser";
import SystemProofCanvas from "@/components/signals/SystemProofCanvas";
import { classifySystem, evaluateSystem, parseSystemExpression, PILLAR_OUTLINE, x2, type Pillar, type PillarId } from "@/features/signals/engines/systemClassifier";

const tex = String.raw;
const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";

const presets = [
  { label: tex`y(t)=x(2t)`, latex: "y(t)=x(2t)" }, { label: tex`y(t)=t\,x(t)`, latex: "y(t)=t\\,x(t)" }, { label: tex`y(t)=x(t)+5`, latex: "y(t)=x(t)+5" },
  { label: tex`y(t)=x^2(t)`, latex: "y(t)=x^2(t)" }, { label: tex`y(t)=\int_{-\infty}^{t}x(\tau)\,d\tau`, latex: "y(t)=\\int_{-\\infty}^{t}x(\\tau)\\,d\\tau" },
] as const;

// System-specific input tokens strictly aligned with the classifier grammar:
// input samples x(t), scaled x(2t), shifted x(t-1), reflected x(-t), power x^2(t),
// time-multipliers t x(t), running integral, derivatives, and canonical step source.
const systemSignalTokens: readonly SignalToken[] = [
  { id: "x", label: tex`x(t)`, insert: "x(t)", mode: "after", ariaLabel: "Input x of t" },
  { id: "x2t", label: tex`x(2t)`, insert: "x(2t)", mode: "after", ariaLabel: "Time-scaled input x(2t)" },
  { id: "xshift", label: tex`x(t-1)`, insert: "x(t-1)", mode: "after", ariaLabel: "Time-shifted input x(t-1)" },
  { id: "xrefl", label: tex`x(-t)`, insert: "x(-t)", mode: "after", ariaLabel: "Time-reflected input x(-t)" },
  { id: "xsq", label: tex`x^2(t)`, insert: "x^{2}(t)", mode: "after", ariaLabel: "Squared input x^2(t)" },
  { id: "tx", label: tex`t\,x(t)`, insert: "t\\,x(t)", mode: "after", ariaLabel: "Time-weighted input t x(t)" },
  { id: "t", label: tex`t`, insert: "t", mode: "after", ariaLabel: "Time variable t" },
  { id: "u", label: tex`u(t)`, insert: "u(t)", mode: "after", ariaLabel: "Unit step source u(t)" },
];

const systemOperatorTokens: readonly SignalToken[] = [
  { id: "plus", label: "+", insert: "+", mode: "after", ariaLabel: "Plus" },
  { id: "minus", label: "-", insert: "-", mode: "after", ariaLabel: "Minus" },
  { id: "times", label: tex`\times`, insert: tex`\times`, mode: "after", ariaLabel: "Multiply" },
  { id: "power", label: tex`x^{\square}`, insert: "^{#?}", mode: "placeholder", ariaLabel: "Power" },
];

const systemExtraTokens: readonly SignalToken[] = [
  { id: "runint", label: tex`\int_{-\infty}^{t}x(\tau)\,d\tau`, insert: "\\int_{-\\infty}^{t}x(\\tau)\\,d\\tau", mode: "after", ariaLabel: "Running integral of the input" },
  { id: "defint", label: tex`\int_{-\infty}^{\infty}x(t)\,dt`, insert: "\\int_{-\\infty}^{\\infty}x(t)\\,dt", mode: "after", ariaLabel: "Definite integral of the input" },
  { id: "ddt", label: tex`\frac{d}{dt}x(t)`, insert: "\\frac{d}{dt}x(t)", mode: "after", ariaLabel: "Derivative of the input" },
  { id: "xp", label: tex`x'(t)`, insert: "x^{\\prime}(t)", mode: "after", ariaLabel: "First derivative of the input" },
  { id: "xpp", label: tex`x''(t)`, insert: "x^{\\prime\\prime}(t)", mode: "after", ariaLabel: "Second derivative of the input" },
];

import {
  PillarDerivationCard,
  PillarIcon,
  PillarSubtitle,
  PendingBadge,
  VerdictBadge,
} from "@/features/signals/ui/ClassificationPillars";

function Slider({
  label,
  value,
  onChange,
  min = -2,
  max = 2,
  step = 0.1,
  className,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <StudioSlider
      label={<KatexMath math={label} />}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      showLimits
      valueDisplay={<span className="font-serif text-xs"><KatexMath math={`${label} = ${value.toFixed(1)}`} /></span>}
      className={`min-w-[200px] max-w-sm flex-1 [&_.relative.flex]:h-6 [&_span.h-1\\.5]:h-2.5 [&_span.h-4.w-4]:h-5 [&_span.h-4.w-4]:w-5 [&_span.h-4.w-4]:shadow-md ${className ?? ""}`}
    />
  );
}

export function SystemClassificationLab() {
  const { t } = useTranslation('simulators');
  const [expression, setExpression] = useState(tex`y(t)=x(2t)`);
  const [a, setA] = useState(1.0); const [b, setB] = useState(-1.0); const [t0, setT0] = useState(1.0);
  const parsed = useMemo(() => parseSystemExpression(expression), [expression]);
  const report = useMemo(() => parsed.ok ? classifySystem(parsed.system) : null, [parsed]);

  return <div className="space-y-6">
    <StudioCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">{t('signals.systemClassification', 'System Classification')}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{t('signals.systemClassificationDescription', 'Enter a system in terms of its input ')}<KatexMath math="x(t)" />.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <UnifiedSignalEngineTerminal
          channels={[{ id: "y", lhs: "y(t)", value: expression, onChange: (rhs) => setExpression(`y(t)=${rhs}`), error: parsed.ok ? null : parsed.error }]}
          signalTokens={systemSignalTokens}
          signalTokensLabel={t('signals.systemInputsLabel', 'System inputs')}
          operatorTokens={systemOperatorTokens}
          operatorTokensLabel={t('signals.operatorsPowersLabel', 'Operators & powers')}
          extraTokens={systemExtraTokens}
          extraTokensLabel={t('signals.systemCalculusLabel', 'System calculus & derivatives')}
          calculus={false}
        />
        <InnerBox className="self-start">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">{t('signals.academicTestSystems', 'Academic test systems')}</h3>
          <div className="mt-3 grid gap-2">{presets.map((preset) => <button key={preset.label} type="button" onClick={() => setExpression(preset.latex)} className={`flex min-h-10 items-center rounded-xl border px-3 text-left text-xs font-bold transition active:scale-[0.97] ${idle}`}><KatexMath math={preset.label} /></button>)}</div>
        </InnerBox>
      </div>
    </StudioCard>

    {/* The proof section stays mounted for every input state; only its per-pillar payload degrades. */}
    <StudioCard>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">{t('signals.fiveClassificationPillars', 'Five classification pillars')}</h3>
        <p className="max-w-md text-right text-xs leading-5 text-slate-500 dark:text-slate-400">{t('signals.pillarsLegend', 'Solid blue represents the direct system test. Dashed red represents the comparison construction; overlap is the visual proof.')}</p>
      </div>
      <Accordion type="multiple" defaultValue={["linearity", "time"]} className="space-y-3">
        {PILLAR_OUTLINE.map((entry) => {
          const pillar = report?.pillars.find((candidate) => candidate.id === entry.id) ?? null;
          return <AccordionItem key={entry.id} value={entry.id} className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/40 p-0 border-0">
            <AccordionTrigger className="px-4 py-4 no-underline hover:no-underline">
              <span className="flex min-w-0 items-center gap-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${!pillar ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500" : pillar.passed ? "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200" : "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"}`}><PillarIcon id={entry.id} /></span>
                <span className="min-w-0 text-left">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900 dark:text-white">{entry.title}</span>
                    {pillar ? <VerdictBadge pillar={pillar} /> : <PendingBadge />}
                  </span>
                  <PillarSubtitle id={entry.id} />
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-5">
              {pillar && parsed.ok ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)]">
                <div>
                  <SystemProofCanvas system={parsed.system} pillar={pillar.id} a={a} b={b} t0={t0} />
                  <div className="mt-4 flex flex-col gap-3">
                    {pillar.id === "linearity" && (
                      <div className="flex flex-wrap items-center gap-4">
                        <Slider label="a" value={a} onChange={setA} min={-2} max={2} step={0.1} />
                        <Slider label="b" value={b} onChange={setB} min={-2} max={2} step={0.1} />
                      </div>
                    )}
                    {pillar.id === "time" && (
                      <div className="flex flex-wrap items-center gap-4">
                        <Slider label="t_0" value={t0} onChange={setT0} min={-2} max={2} step={0.1} />
                      </div>
                    )}
                    {pillar.id === "causality" && <p className="text-xs text-rose-600 dark:text-rose-300">{t('signals.causalityLegend', 'The red region represents future input samples relative to the marked output instant.')}</p>}
                    {pillar.id === "memory" && <p className="text-xs text-slate-500 dark:text-slate-400">{t('signals.memoryLegendPrefix', 'Dashed red: input ')}<KatexMath math="x(t)" />{t('signals.memoryLegendSuffix', '. Solid blue: system output.')}</p>}
                    {pillar.id === "stability" && <p className="text-xs text-slate-500 dark:text-slate-400">{t('signals.stabilityLegendPrefix', 'Dashed red: bounded ')}<KatexMath math="u(t)" />{t('signals.stabilityLegendSuffix', '. Solid blue: system output.')}</p>}
                  </div>
                </div>
                <PillarDerivationCard proof={pillar.proof} />
              </div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('signals.awaitingValidInput', 'Awaiting valid input')}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">{parsed.ok ? t('signals.recomputingProofTrace', 'Recomputing the proof trace…') : parsed.error}</p>
              </div>}
            </AccordionContent>
          </AccordionItem>;
        })}
      </Accordion>
    </StudioCard>
  </div>;
}

export default SystemClassificationLab;
