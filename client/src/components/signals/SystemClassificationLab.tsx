/**
 * MAE Academy / Signals & Systems — Tab B System Classification laboratory.
 * The shared MathLive editor feeds a pure classifier; each accordion presents
 * a traceable KaTeX proof plus an imperative visual counterexample or proof.
 */
import { Activity, Braces, CheckCircle2, ChevronRight, CircleAlert, FunctionSquare, Sigma, Timer, Waves } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { KatexMath } from "@/components/ui/KatexMath";
import { StatusBadge, StudioSlider, StudioCard, InnerBox } from "@/components/common/templates";
import { MathLiveSignalInput, type MathLiveSignalInputHandle } from "@/components/signals/MathLiveSignalInput";
import SystemProofCanvas from "@/components/signals/SystemProofCanvas";
import { classifySystem, parseSystemExpression, PILLAR_OUTLINE, type Pillar, type PillarId } from "@/features/signals/engines/systemClassifier";

const tex = String.raw;
const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";

const presets = [
  { label: tex`y(t)=x(2t)`, latex: "y(t)=x(2t)" }, { label: tex`y(t)=t\,x(t)`, latex: "y(t)=t\\,x(t)" }, { label: tex`y(t)=x(t)+5`, latex: "y(t)=x(t)+5" },
  { label: tex`y(t)=x^2(t)`, latex: "y(t)=x^2(t)" }, { label: tex`y(t)=\int_{-\infty}^{t}x(\tau)\,d\tau`, latex: "y(t)=\\int_{-\\infty}^{t}x(\\tau)\\,d\\tau" },
] as const;

// Canonical test signals injected verbatim into the mathfield; the classifier grammar parses each one.
const signalPills = [
  { label: tex`u(t)`, latex: "u(t)" }, { label: tex`r(t)`, latex: "r(t)" }, { label: tex`\text{rect}(t)`, latex: "\\text{rect}(t)" },
  { label: tex`\Lambda(t)`, latex: "\\Lambda(t)" }, { label: tex`\text{sinc}(t)`, latex: "\\text{sinc}(t)" }, { label: tex`\text{sgn}(t)`, latex: "\\text{sgn}(t)" },
  { label: tex`\sin(\omega t)`, latex: "\\sin(\\omega t)" }, { label: tex`\cos(\omega t)`, latex: "\\cos(\\omega t)" }, { label: tex`\delta(t)`, latex: "\\delta(t)" },
] as const;

const tokenPills = [
  { label: tex`x(t)`, latex: "x(t)" }, { label: tex`y(t)`, latex: "y(t)=" }, { label: tex`x(2t)`, latex: "x(2t)" }, { label: tex`t\,x(t)`, latex: "t\\,x(t)" },
  { label: tex`x^2(t)`, latex: "x^{2}(t)" }, { label: tex`\int_{-\infty}^{t}d\tau`, latex: "\\int_{-\\infty}^{t}x(\\tau)\\,d\\tau" }, { label: tex`\int_{-\infty}^{\infty}dt`, latex: "\\int_{-\\infty}^{\\infty}x(t)\\,dt" }, { label: tex`\infty`, latex: "\\infty" }, { label: tex`-\infty`, latex: "-\\infty" }, { label: tex`\frac{d}{dt}`, latex: "\\frac{d}{dt}x(t)" }, { label: tex`x'(t)`, latex: "x^{\\prime}(t)" }, { label: tex`x''(t)`, latex: "x^{\\prime\\prime}(t)" },
  { label: tex`+1`, latex: "+1" }, { label: tex`+5`, latex: "+5" }, { label: tex`-5`, latex: "-5" },
] as const;

const pill = "rounded-full px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 transition-all cursor-pointer";

function PillarIcon({ id }: { id: PillarId }) { const icons = { linearity: FunctionSquare, time: Timer, causality: ChevronRight, memory: Braces, stability: Activity }; const Icon = icons[id]; return <Icon className="h-4 w-4" />; }
function Slider({ label, value, onChange, min, max, step = 0.1 }: { label: string; value: number; onChange: (next: number) => void; min: number; max: number; step?: number }) { return <StudioSlider label={<KatexMath math={label} />} value={value} onChange={onChange} min={min} max={max} step={step} />; }

function PendingBadge() {
  return (
    <StatusBadge variant="neutral" className="gap-1.5 uppercase tracking-[0.1em] text-[10px]">
      <CircleAlert className="h-3.5 w-3.5" />
      Syntax check
    </StatusBadge>
  );
}

function VerdictBadge({ pillar }: { pillar: Pillar }) {
  return (
    <StatusBadge
      variant={pillar.passed ? "info" : "danger"}
      className="gap-1.5 uppercase tracking-[0.1em] text-[10px]"
    >
      {pillar.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {pillar.verdict}
    </StatusBadge>
  );
}

export function SystemClassificationLab() {
  const [expression, setExpression] = useState(tex`y(t)=x(2t)`);
  const [a, setA] = useState(1.2); const [b, setB] = useState(-0.7); const [t0, setT0] = useState(0.6);
  const editorRef = useRef<MathLiveSignalInputHandle>(null);
  const parsed = useMemo(() => parseSystemExpression(expression), [expression]);
  const report = useMemo(() => parsed.ok ? classifySystem(parsed.system) : null, [parsed]);
  const insert = (latex: string) => editorRef.current?.insert(latex, "after");

  return <div className="space-y-6">
    <StudioCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">System Classification</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Enter a system in terms of its input <KatexMath math="x(t)" />.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <InnerBox>
          <h3 id="system-mathfield-label" className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SIGNAL ENGINE</h3>
          {/* The mathfield itself is the single canonical KaTeX-typeset equation surface — no mirrored preview. */}
          <div className="mt-4"><MathLiveSignalInput ref={editorRef} value={expression} onChange={setExpression} labelledBy="system-mathfield-label" /></div>
          {!parsed.ok && <p className="mt-2 text-xs font-semibold leading-5 text-rose-600 dark:text-rose-300">{parsed.error}</p>}
          <div className="mt-4 space-y-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Canonical signals</p><div className="mt-2 flex flex-wrap gap-1.5">{signalPills.map((item) => <button key={item.latex} type="button" onClick={() => insert(`+${item.latex}`)} className={pill}><KatexMath math={item.label} /></button>)}</div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Variables &amp; operators</p><div className="mt-2 flex flex-wrap gap-1.5">{tokenPills.map((item) => <button key={item.latex} type="button" onClick={() => insert(item.latex)} className={pill}><KatexMath math={item.label} /></button>)}</div></div>
          </div>
        </InnerBox>
        <InnerBox>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">ACADEMIC TEST SYSTEMS</h3>
          <div className="mt-3 grid gap-2">{presets.map((preset) => <button key={preset.label} type="button" onClick={() => setExpression(preset.latex)} className={`flex min-h-10 items-center rounded-xl border px-3 text-left text-xs font-bold transition active:scale-[0.97] ${idle}`}><KatexMath math={preset.label} /></button>)}</div>
        </InnerBox>
      </div>
    </StudioCard>

    {/* The proof section stays mounted for every input state; only its per-pillar payload degrades. */}
    <StudioCard>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">FIVE CLASSIFICATION PILLARS</h3>
        <p className="max-w-md text-right text-xs leading-5 text-slate-500 dark:text-slate-400">Solid blue represents the direct system test. Dashed orange represents the comparison construction; overlap is the visual proof.</p>
      </div>
      <Accordion type="multiple" defaultValue={["linearity", "time"]} className="space-y-3">
        {PILLAR_OUTLINE.map((entry) => {
          const pillar = report?.pillars.find((candidate) => candidate.id === entry.id) ?? null;
          return <AccordionItem key={entry.id} value={entry.id} className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/40 p-0 border-0">
            <AccordionTrigger className="px-4 py-4 no-underline hover:no-underline">
              <span className="flex min-w-0 items-center gap-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${!pillar ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500" : pillar.passed ? "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200" : "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"}`}><PillarIcon id={entry.id} /></span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-black text-slate-900 dark:text-white">{entry.title}{pillar ? ` (${pillar.verdict})` : ""}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">{entry.visualLead}</span>
                </span>
              </span>
              {pillar ? <VerdictBadge pillar={pillar} /> : <PendingBadge />}
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-5">
              {pillar && parsed.ok ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)]">
                <div>
                  <SystemProofCanvas system={parsed.system} pillar={pillar.id} a={a} b={b} t0={t0} />
                  <div className="mt-3 flex flex-wrap gap-4">
                    {pillar.id === "linearity" && <><Slider label="a" value={a} onChange={setA} min={-2} max={2} /><Slider label="b" value={b} onChange={setB} min={-2} max={2} /></>}
                    {pillar.id === "time" && <Slider label="t_0" value={t0} onChange={setT0} min={-1.5} max={1.5} />}
                    {pillar.id === "causality" && <p className="text-xs text-rose-600 dark:text-rose-300">The red region represents future input samples relative to the marked output instant.</p>}
                    {pillar.id === "memory" && <p className="text-xs text-slate-500 dark:text-slate-400">Dashed slate: input <KatexMath math="x(t)" />. Solid trace: system output.</p>}
                    {pillar.id === "stability" && <p className="text-xs text-slate-500 dark:text-slate-400">Dashed slate: bounded <KatexMath math="u(t)" />. Auto-range preserves the exploding output envelope when applicable.</p>}
                  </div>
                </div>
                <InnerBox>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">DERIVATION</h3>
                  <div className="mt-3 space-y-3 overflow-x-auto">
                    {pillar.proof.map((step, index) => <KatexMath key={index} math={step} block className="block text-left text-xs leading-6 text-slate-600 dark:text-slate-300" />)}
                  </div>
                </InnerBox>
              </div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Awaiting valid input</p>
                <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">{parsed.ok ? "Recomputing the proof trace…" : parsed.error}</p>
              </div>}
            </AccordionContent>
          </AccordionItem>;
        })}
      </Accordion>
    </StudioCard>
  </div>;
}

export default SystemClassificationLab;
