/**
 * MAE State-Space Studio visual system: monochrome blueprint instrument surface.
 * Matrix and equation treatments are rendered with KaTeX; vector marks remain solid
 * black/white so this control-theory studio has a deliberate technical contrast.
 */
import { AlertTriangle, BadgeCheck, Calculator, RotateCcw, Sigma } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { KatexMath } from "@/components/ui/KatexMath";
import { StateSpacePortraits } from "@/components/control/StateSpacePortraits";
import {
  ackermannPolePlacement,
  characteristicPolynomial,
  complexToLatex,
  controllabilityMatrix,
  eigenvalues,
  formatNumber,
  matrixToLatex,
  observabilityMatrix,
  rank,
  type Matrix,
} from "@/lib/matrixMath";

type SystemModel = { A: Matrix; B: Matrix; C: Matrix; D: Matrix };
type Order = 2 | 3;
type LocaleCode = "en" | "ar" | "es";
const CARD = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const HEADING = "text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white";
const FIELD = "rounded-xl border border-slate-200 bg-white text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white";

const initialSystem = (order: Order): SystemModel => order === 2
  ? { A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]] }
  : { A: [[0, 1, 0], [0, 0, 1], [-6, -11, -6]], B: [[0], [0], [1]], C: [[1, 0, 0]], D: [[0]] };

const initialPoles = (order: Order) => order === 2 ? [-4, -5] : [-4, -5, -6];

const studioCopy: Record<LocaleCode, {
  eyebrow: string; title: string; reset: string; order: string; stateOrder: string; systemMatrices: string; stateEquations: string;
  characteristic: string; openEigenvalues: string; controllability: string; observability: string; rank: string; complete: string;
  leoTitle: string; leoText: string; leoControllability: string; leoObservability: string; desiredPoles: string; poleHint: string;
  calculate: string; feedback: string; desiredCharacteristic: string; closedLoop: string; closedEigenvalues: string; placeUnavailable: string; matrixHint: string;
}> = {
  en: {
    eyebrow: "CONTROL THEORY / STATE FORM", title: "State-Space Studio", reset: "Reset canonical system", order: "System order", stateOrder: "Order",
    systemMatrices: "System matrices", stateEquations: "Live state equations", characteristic: "Characteristic polynomial", openEigenvalues: "Open-loop eigenvalues",
    controllability: "Controllability", observability: "Observability", rank: "Rank", complete: "Full rank", leoTitle: "Leo Alert",
    leoText: "Mathematical Flaw: System is Uncontrollable/Unobservable!", leoControllability: "The controllability matrix is rank deficient.", leoObservability: "The observability matrix is rank deficient.",
    desiredPoles: "Desired closed-loop poles", poleHint: "Enter one real pole per state.", calculate: "Apply Ackermann", feedback: "State-feedback gain", desiredCharacteristic: "Desired characteristic polynomial", closedLoop: "Closed-loop system", closedEigenvalues: "Closed-loop eigenvalues", placeUnavailable: "Pole placement requires a controllable system.", matrixHint: "Edit any coefficient; analysis updates in real time.",
  },
  ar: {
    eyebrow: "نظرية التحكم / صيغة الحالة", title: "استوديو فضاء الحالة", reset: "إعادة النظام القياسي", order: "رتبة النظام", stateOrder: "الرتبة",
    systemMatrices: "مصفوفات النظام", stateEquations: "معادلات الحالة الحية", characteristic: "كثيرة الحدود المميزة", openEigenvalues: "القيم الذاتية للحلقة المفتوحة",
    controllability: "القابلية للتحكم", observability: "القابلية للملاحظة", rank: "الرتبة", complete: "رتبة كاملة", leoTitle: "تنبيه ليو",
    leoText: "خلل رياضي: النظام غير قابل للتحكم أو الملاحظة!", leoControllability: "مصفوفة القابلية للتحكم ناقصة الرتبة.", leoObservability: "مصفوفة القابلية للملاحظة ناقصة الرتبة.",
    desiredPoles: "أقطاب الحلقة المغلقة المطلوبة", poleHint: "أدخل قطبًا حقيقيًا واحدًا لكل حالة.", calculate: "تطبيق أكرمان", feedback: "مكسب تغذية الحالة الراجعة", desiredCharacteristic: "كثيرة الحدود المميزة المطلوبة", closedLoop: "نظام الحلقة المغلقة", closedEigenvalues: "القيم الذاتية للحلقة المغلقة", placeUnavailable: "يتطلب تعيين الأقطاب نظامًا قابلًا للتحكم.", matrixHint: "عدّل أي معامل؛ يتحدث التحليل لحظيًا.",
  },
  es: {
    eyebrow: "TEORÍA DE CONTROL / FORMA DE ESTADO", title: "Estudio de espacio de estados", reset: "Restablecer sistema canónico", order: "Orden del sistema", stateOrder: "Orden",
    systemMatrices: "Matrices del sistema", stateEquations: "Ecuaciones de estado en vivo", characteristic: "Polinomio característico", openEigenvalues: "Valores propios de lazo abierto",
    controllability: "Controlabilidad", observability: "Observabilidad", rank: "Rango", complete: "Rango completo", leoTitle: "Alerta de Leo",
    leoText: "Falla matemática: ¡el sistema es incontrolable/no observable!", leoControllability: "La matriz de controlabilidad tiene rango deficiente.", leoObservability: "La matriz de observabilidad tiene rango deficiente.",
    desiredPoles: "Polos deseados de lazo cerrado", poleHint: "Ingrese un polo real por cada estado.", calculate: "Aplicar Ackermann", feedback: "Ganancia de realimentación de estado", desiredCharacteristic: "Polinomio característico deseado", closedLoop: "Sistema de lazo cerrado", closedEigenvalues: "Valores propios de lazo cerrado", placeUnavailable: "La ubicación de polos requiere un sistema controlable.", matrixHint: "Edite cualquier coeficiente; el análisis se actualiza en tiempo real.",
  },
};

function MatrixGrid({ name, matrix, onChange }: { name: string; matrix: Matrix; onChange: (row: number, column: number, value: number) => void }) {
  return <div className="space-y-2"><div className="flex items-center justify-between"><KatexMath math={name} className="text-base font-bold text-slate-800 dark:text-white" /><span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{matrix.length} × {matrix[0].length}</span></div><div className="inline-grid gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950" style={{ gridTemplateColumns: `repeat(${matrix[0].length}, minmax(0, 1fr))` }}>{matrix.map((row, rowIndex) => row.map((value, columnIndex) => <input key={`${name}-${rowIndex}-${columnIndex}`} aria-label={`${name} ${rowIndex + 1}, ${columnIndex + 1}`} inputMode="decimal" type="number" step="any" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(rowIndex, columnIndex, Number(event.target.value) || 0)} className={`h-9 min-w-0 px-1 text-center font-mono text-xs ${FIELD}`} />))}</div></div>;
}

function LeoAlert({ messages, copy }: { messages: string[]; copy: typeof studioCopy.en }) {
  return <aside className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10"><div className="flex gap-3"><div className="mt-0.5 rounded-full border border-rose-300 p-1.5 text-rose-600 dark:border-rose-400/50 dark:text-rose-300"><AlertTriangle className="h-4 w-4" /></div><div><h3 className="text-sm font-bold uppercase tracking-wider text-rose-700 dark:text-rose-200">{copy.leoTitle}</h3><KatexMath math={`\\text{${copy.leoText.replace(/[{}]/g, "")}}`} displayMode className="mt-2 block overflow-x-auto text-sm font-semibold text-slate-800 dark:text-white" /><p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{messages.join(" ")}</p></div></div></aside>;
}

function StatusCard({ title, symbol, matrix, value, complete, rankLabel }: { title: string; symbol: string; matrix: Matrix; value: number; complete: boolean; rankLabel: string }) {
  return <section className={CARD}><div className="flex items-center justify-between gap-3"><h3 className={HEADING}>{title}</h3><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${complete ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-400/50 dark:bg-violet-500/15 dark:text-violet-200" : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200"}`}>{complete ? <BadgeCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}<KatexMath math={`${rankLabel}=${value}`} /></span></div><KatexMath math={`${symbol}=${matrixToLatex(matrix)}`} displayMode className="mt-4 block overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-white" /></section>;
}

export function StateSpaceStudio() {
  const { locale } = useLocale();
  const copy = studioCopy[locale as LocaleCode] ?? studioCopy.en;
  const [order, setOrder] = useState<Order>(2);
  const [system, setSystem] = useState<SystemModel>(() => initialSystem(2));
  const [desiredPoles, setDesiredPoles] = useState<number[]>(() => initialPoles(2));
  const [placementRequested, setPlacementRequested] = useState(true);

  const analysis = useMemo(() => {
    try {
      const controllability = controllabilityMatrix(system.A, system.B);
      const observability = observabilityMatrix(system.A, system.C);
      const controllabilityRank = rank(controllability);
      const observabilityRank = rank(observability);
      return { characteristic: characteristicPolynomial(system.A), eigenvalues: eigenvalues(system.A), controllability, observability, controllabilityRank, observabilityRank, controllable: controllabilityRank === order, observable: observabilityRank === order };
    } catch (error) { return { error: error instanceof Error ? error.message : "Analysis unavailable" }; }
  }, [order, system]);

  const placement = useMemo(() => {
    if (!("controllable" in analysis) || !analysis.controllable) return null;
    try { return ackermannPolePlacement(system.A, system.B, desiredPoles); } catch { return null; }
  }, [analysis, desiredPoles, system.A, system.B]);

  const updateMatrix = (key: keyof SystemModel, row: number, column: number, value: number) => setSystem((current) => ({ ...current, [key]: current[key].map((existingRow, rowIndex) => existingRow.map((existingValue, columnIndex) => rowIndex === row && columnIndex === column ? value : existingValue)) }));
  const changeOrder = (nextOrder: Order) => { setOrder(nextOrder); setSystem(initialSystem(nextOrder)); setDesiredPoles(initialPoles(nextOrder)); setPlacementRequested(true); };
  const reset = () => changeOrder(order);

  const card = CARD;
  const messages = "controllable" in analysis ? [!analysis.controllable ? copy.leoControllability : "", !analysis.observable ? copy.leoObservability : ""].filter(Boolean) : [];

  return <div className="space-y-6"><section className={card}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className={HEADING}>{copy.title}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.matrixHint}</p></div><button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-400 hover:text-violet-700 active:scale-[.97] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-violet-400 dark:hover:text-violet-200"><RotateCcw className="h-4 w-4" />{copy.reset}</button></div></section>

    <section className={card}><div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h3 className={HEADING}>{copy.systemMatrices}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.matrixHint}</p></div><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-500 dark:text-slate-400">{copy.order}</span>{([2, 3] as const).map((value) => <button key={value} type="button" onClick={() => changeOrder(value)} className={`h-8 min-w-10 rounded-xl border text-xs font-bold transition ${order === value ? "border-violet-400 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-violet-100" : "border-slate-200 bg-white text-slate-500 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:text-violet-200"}`}><KatexMath math={`n=${value}`} /></button>)}</div></div><div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><MatrixGrid name="A" matrix={system.A} onChange={(row, column, value) => updateMatrix("A", row, column, value)} /><MatrixGrid name="B" matrix={system.B} onChange={(row, column, value) => updateMatrix("B", row, column, value)} /><MatrixGrid name="C" matrix={system.C} onChange={(row, column, value) => updateMatrix("C", row, column, value)} /><MatrixGrid name="D" matrix={system.D} onChange={(row, column, value) => updateMatrix("D", row, column, value)} /></div></section>

    {"error" in analysis ? <section className={card}><p className="text-sm text-rose-600 dark:text-rose-300">{analysis.error}</p></section> : <><section className={card}><div className="flex items-center gap-2"><Sigma className="h-4 w-4 text-violet-600 dark:text-violet-300" /><h3 className={HEADING}>{copy.stateEquations}</h3></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><KatexMath math={`\\dot{x}=(${matrixToLatex(system.A)})x+(${matrixToLatex(system.B)})u`} displayMode className="block overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-base text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-white" /><KatexMath math={`y=(${matrixToLatex(system.C)})x+(${matrixToLatex(system.D)})u`} displayMode className="block overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-base text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-white" /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.characteristic}</p><KatexMath math={`\\det(sI-A)=${analysis.characteristic.map((coefficient, index) => `${index === 0 ? "" : coefficient >= 0 ? "+" : ""}${formatNumber(coefficient)}${index === analysis.characteristic.length - 1 ? "" : index === analysis.characteristic.length - 2 ? "s" : `s^{${analysis.characteristic.length - index - 1}}`}`).join("")}`} displayMode className="mt-3 block overflow-x-auto text-center text-sm" /></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.openEigenvalues}</p><KatexMath math={`\\lambda(A)=\\left\\{${analysis.eigenvalues.map((value) => complexToLatex(value)).join(",\\;")}\\right\\}`} displayMode className="mt-3 block overflow-x-auto text-center text-sm" /></div></div></section>

      <section className="grid gap-5 lg:grid-cols-2"><StatusCard title={copy.controllability} symbol="\\mathcal{C}" matrix={analysis.controllability} value={analysis.controllabilityRank} complete={analysis.controllable} rankLabel="\\operatorname{rank}(\\mathcal{C})" /><StatusCard title={copy.observability} symbol="\\mathcal{O}" matrix={analysis.observability} value={analysis.observabilityRank} complete={analysis.observable} rankLabel="\\operatorname{rank}(\\mathcal{O})" /></section>

      {messages.length > 0 ? <LeoAlert messages={messages} copy={copy} /> : <section className="flex items-center gap-3 rounded-3xl border border-violet-200 bg-violet-50 p-5 shadow-sm dark:border-violet-400/30 dark:bg-violet-500/10"><BadgeCheck className="h-5 w-5 text-violet-600 dark:text-violet-300" /><div><p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-200">{copy.complete}</p><KatexMath math={`\\operatorname{rank}(\\mathcal{C})=\\operatorname{rank}(\\mathcal{O})=${order}`} className="mt-1 text-xs text-slate-700 dark:text-slate-200" /></div></section>}

      <section className={card}><div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h3 className={HEADING}>{copy.desiredPoles}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.poleHint}</p></div><button type="button" onClick={() => setPlacementRequested(true)} disabled={!analysis.controllable} className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-violet-500 to-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-500/20 transition hover:scale-[1.02] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40"><Calculator className="h-4 w-4" />{copy.calculate}</button></div><div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{desiredPoles.map((pole, index) => <label key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><KatexMath math={`\\mu_{${index + 1}}`} className="text-xs text-slate-500 dark:text-slate-400" /><input type="number" step="any" value={pole} onChange={(event) => setDesiredPoles((current) => current.map((existing, position) => position === index ? Number(event.target.value) || 0 : existing))} className={`mt-2 w-full border-b bg-transparent pb-1 font-mono text-sm font-bold ${FIELD}`} /></label>)}</div>{placementRequested && placement ? <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.feedback}</p><KatexMath math={`K=${matrixToLatex([placement.gain])}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.desiredCharacteristic}</p><KatexMath math={`\\phi_d(s)=${placement.desiredPolynomial.map((coefficient, index) => `${index === 0 ? "" : coefficient >= 0 ? "+" : ""}${formatNumber(coefficient)}${index === placement.desiredPolynomial.length - 1 ? "" : index === placement.desiredPolynomial.length - 2 ? "s" : `s^{${placement.desiredPolynomial.length - index - 1}}`}`).join("")}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.closedLoop}</p><KatexMath math={`A_{cl}=A-BK=${matrixToLatex(placement.acl)}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /><KatexMath math={`\\lambda(A_{cl})=\\left\\{${placement.closedLoopEigenvalues.map((value) => complexToLatex(value)).join(",\\;")}\\right\\}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /></div></div> : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">{analysis.controllable ? copy.poleHint : copy.placeUnavailable}</div>}</div></section>
      <StateSpacePortraits matrix={system.A} closedLoopMatrix={placementRequested && placement ? placement.acl : undefined} order={order} />
    </>}
  </div>;
}

export default StateSpaceStudio;
