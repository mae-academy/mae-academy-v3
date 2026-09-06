/**
 * MAE State-Space Studio visual system: monochrome blueprint instrument surface.
 * Matrix and equation treatments are rendered with KaTeX; vector marks remain solid
 * black/white so this control-theory studio has a deliberate technical contrast.
 */
import { AlertTriangle, RotateCcw } from "lucide-react";
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
} from "@/features/linear-algebra/matrixMath";

type SystemModel = { A: Matrix; B: Matrix; C: Matrix; D: Matrix };
type Order = 2 | 3;
type LocaleCode = "en" | "ar" | "es";
const CARD = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const HEADING = "text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white";
const TAB_BASE = "px-3 py-1.5 text-xs font-medium shadow-sm rounded-lg cursor-pointer";
const TAB_ACTIVE = `${TAB_BASE} bg-brand-gradient text-white`;
const TAB_INACTIVE = `${TAB_BASE} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800`;
const MATRIX_INPUT = "h-9 w-14 bg-transparent text-center text-slate-800 text-lg tracking-wide outline-none rounded focus:ring-1 focus:ring-blue-500 dark:text-slate-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0";
const MATRIX_BRACKETS = "border-l-2 border-r-2 border-slate-800 dark:border-slate-300 px-2 py-1.5";

const initialSystem = (order: Order): SystemModel => order === 2
  ? { A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]] }
  : { A: [[0, 1, 0], [0, 0, 1], [-6, -11, -6]], B: [[0], [0], [1]], C: [[1, 0, 0]], D: [[0]] };

const initialPoles = (order: Order) => order === 2 ? [-4, -5] : [-4, -5, -6];

const studioCopy: Record<LocaleCode, {
  eyebrow: string; title: string; reset: string; order: string; stateOrder: string; systemMatrices: string; stateEquations: string;
  characteristic: string; openEigenvalues: string; controllability: string; observability: string; rank: string; complete: string;
  leoTitle: string; leoText: string; leoControllability: string; leoObservability: string; desiredPoles: string; poleHint: string;
  calculate: string; feedback: string; desiredCharacteristic: string; closedLoop: string; closedEigenvalues: string; placeUnavailable: string;
}> = {
  en: {
    eyebrow: "CONTROL THEORY / STATE FORM", title: "State-Space Studio", reset: "Reset canonical system", order: "System order", stateOrder: "Order",
    systemMatrices: "System matrices", stateEquations: "Live state equations", characteristic: "Characteristic polynomial", openEigenvalues: "Open-loop eigenvalues",
    controllability: "Controllability", observability: "Observability", rank: "Rank", complete: "Full rank", leoTitle: "Leo Alert",
    leoText: "Mathematical Flaw: System is Uncontrollable/Unobservable!", leoControllability: "The controllability matrix is rank deficient.", leoObservability: "The observability matrix is rank deficient.",
    desiredPoles: "Desired closed-loop poles", poleHint: "Enter one real pole per state.", calculate: "Apply Ackermann", feedback: "State-feedback gain", desiredCharacteristic: "Desired characteristic polynomial", closedLoop: "Closed-loop system", closedEigenvalues: "Closed-loop eigenvalues", placeUnavailable: "Pole placement requires a controllable system.",
  },
  ar: {
    eyebrow: "نظرية التحكم / صيغة الحالة", title: "استوديو فضاء الحالة", reset: "إعادة النظام القياسي", order: "رتبة النظام", stateOrder: "الرتبة",
    systemMatrices: "مصفوفات النظام", stateEquations: "معادلات الحالة الحية", characteristic: "كثيرة الحدود المميزة", openEigenvalues: "القيم الذاتية للحلقة المفتوحة",
    controllability: "القابلية للتحكم", observability: "القابلية للملاحظة", rank: "الرتبة", complete: "رتبة كاملة", leoTitle: "تنبيه ليو",
    leoText: "خلل رياضي: النظام غير قابل للتحكم أو الملاحظة!", leoControllability: "مصفوفة القابلية للتحكم ناقصة الرتبة.", leoObservability: "مصفوفة القابلية للملاحظة ناقصة الرتبة.",
    desiredPoles: "أقطاب الحلقة المغلقة المطلوبة", poleHint: "أدخل قطبًا حقيقيًا واحدًا لكل حالة.", calculate: "تطبيق أكرمان", feedback: "مكسب تغذية الحالة الراجعة", desiredCharacteristic: "كثيرة الحدود المميزة المطلوبة", closedLoop: "نظام الحلقة المغلقة", closedEigenvalues: "القيم الذاتية للحلقة المغلقة", placeUnavailable: "يتطلب تعيين الأقطاب نظامًا قابلًا للتحكم.",
  },
  es: {
    eyebrow: "TEORÍA DE CONTROL / FORMA DE ESTADO", title: "Estudio de espacio de estados", reset: "Restablecer sistema canónico", order: "Orden del sistema", stateOrder: "Orden",
    systemMatrices: "Matrices del sistema", stateEquations: "Ecuaciones de estado en vivo", characteristic: "Polinomio característico", openEigenvalues: "Valores propios de lazo abierto",
    controllability: "Controlabilidad", observability: "Observabilidad", rank: "Rango", complete: "Rango completo", leoTitle: "Alerta de Leo",
    leoText: "Falla matemática: ¡el sistema es incontrolable/no observable!", leoControllability: "La matriz de controlabilidad tiene rango deficiente.", leoObservability: "La matriz de observabilidad tiene rango deficiente.",
    desiredPoles: "Polos deseados de lazo cerrado", poleHint: "Ingrese un polo real por cada estado.", calculate: "Aplicar Ackermann", feedback: "Ganancia de realimentación de estado", desiredCharacteristic: "Polinomio característico deseado", closedLoop: "Sistema de lazo cerrado", closedEigenvalues: "Valores propios de lazo cerrado", placeUnavailable: "La ubicación de polos requiere un sistema controlable.",
  },
};

function MatrixGrid({ name, matrix, onChange }: { name: string; matrix: Matrix; onChange: (row: number, column: number, value: number) => void }) {
  const columns = matrix[0].length;
  const rows = matrix.length;
  return <div className="flex w-full flex-col items-center"><div className="flex items-center justify-between w-full gap-3 pr-0.5"><KatexMath math={`${name} =`} className="text-base font-bold text-slate-800 dark:text-white" /><span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{rows} × {columns}</span></div><div className={`${MATRIX_BRACKETS} mt-2 flex justify-center`}><div className="inline-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{matrix.map((row, rowIndex) => row.map((value, columnIndex) => <input key={`${name}-${rowIndex}-${columnIndex}`} aria-label={`${name} ${rowIndex + 1}, ${columnIndex + 1}`} inputMode="decimal" type="number" step="any" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(rowIndex, columnIndex, Number(event.target.value) || 0)} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className={MATRIX_INPUT} />))}</div></div></div>;
}

function LeoAlert({ messages, copy }: { messages: string[]; copy: typeof studioCopy.en }) {
  return <aside className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10"><div className="flex gap-3"><div className="mt-0.5 rounded-full border border-rose-300 p-1.5 text-rose-600 dark:border-rose-400/50 dark:text-rose-300"><AlertTriangle className="h-4 w-4" /></div><div><h3 className="text-sm font-bold uppercase tracking-wider text-rose-700 dark:text-rose-200">{copy.leoTitle}</h3><KatexMath math={`\\text{${copy.leoText.replace(/[{}]/g, "")}}`} displayMode className="mt-2 block overflow-x-auto text-sm font-semibold text-slate-800 dark:text-white" /><p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{messages.join(" ")}</p></div></div></aside>;
}

function StatusCard({ title, symbol, matrix }: { title: string; symbol: string; matrix: Matrix }) {
  return <section className={CARD}><h3 className={HEADING}>{title}</h3><KatexMath math={`${symbol}=${matrixToLatex(matrix)}`} displayMode className="mt-4 block overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-white" /></section>;
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

  return <div className="space-y-6">

    <section className={CARD}><div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><h3 className={HEADING}>{copy.systemMatrices}</h3><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.order}</span><div className="flex items-center gap-1">{([2, 3] as const).map((value) => <button key={value} type="button" onClick={() => changeOrder(value)} className={order === value ? TAB_ACTIVE : TAB_INACTIVE}><KatexMath math={`n = ${value}`} /></button>)}</div><button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-400 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-violet-200"><RotateCcw className="h-3.5 w-3.5" />{copy.reset}</button></div></div><div className="mt-5 grid grid-cols-2 items-start gap-6 lg:grid-cols-4"><MatrixGrid name="A" matrix={system.A} onChange={(row, column, value) => updateMatrix("A", row, column, value)} /><MatrixGrid name="B" matrix={system.B} onChange={(row, column, value) => updateMatrix("B", row, column, value)} /><MatrixGrid name="C" matrix={system.C} onChange={(row, column, value) => updateMatrix("C", row, column, value)} /><MatrixGrid name="D" matrix={system.D} onChange={(row, column, value) => updateMatrix("D", row, column, value)} /></div></section>

    {"error" in analysis ? <section className={card}><p className="text-sm text-rose-600 dark:text-rose-300">{analysis.error}</p></section> : <><section className={card}><h3 className={HEADING}>{copy.stateEquations}</h3><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="flex min-h-20 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950"><KatexMath math={`\\dot{x}=(${matrixToLatex(system.A)})x+(${matrixToLatex(system.B)})u`} displayMode className="block overflow-x-auto text-base text-slate-950 dark:text-white" /></div><div className="flex min-h-20 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950"><KatexMath math={`y=(${matrixToLatex(system.C)})x+(${matrixToLatex(system.D)})u`} displayMode className="block overflow-x-auto text-base text-slate-950 dark:text-white" /></div></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.characteristic}</p><KatexMath math={`\\det(sI-A)=${analysis.characteristic.map((coefficient, index) => `${index === 0 ? "" : coefficient >= 0 ? "+" : ""}${formatNumber(coefficient)}${index === analysis.characteristic.length - 1 ? "" : index === analysis.characteristic.length - 2 ? "s" : `s^{${analysis.characteristic.length - index - 1}}`}`).join("")}`} displayMode className="mt-3 block w-full overflow-x-auto text-center text-sm" /></div><div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.openEigenvalues}</p><KatexMath math={`\\lambda(A)=\\left\\{${analysis.eigenvalues.map((value) => complexToLatex(value)).join(",\\;")}\\right\\}`} displayMode className="mt-3 block w-full overflow-x-auto text-center text-sm" /></div></div></section>

      <section className="grid gap-5 lg:grid-cols-2"><StatusCard title={copy.controllability} symbol="\mathcal{C}" matrix={analysis.controllability} /><StatusCard title={copy.observability} symbol="\mathcal{O}" matrix={analysis.observability} /></section>

      {messages.length > 0 && <LeoAlert messages={messages} copy={copy} />}

      <section className={card}><div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h3 className={HEADING}>{copy.desiredPoles}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.poleHint}</p></div><button type="button" onClick={() => setPlacementRequested(true)} disabled={!analysis.controllable} className={`${analysis.controllable ? TAB_ACTIVE : TAB_INACTIVE} disabled:cursor-not-allowed disabled:opacity-40`}>{copy.calculate}</button></div><div className="mt-4 flex items-stretch gap-4"><div className="w-24 shrink-0 flex-col"><p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Poles</p><div className="flex flex-col gap-1.5">{desiredPoles.map((pole, index) => <label key={index} className="flex items-center justify-between gap-1.5"><KatexMath math={`\\mu_{${index + 1}}`} className="text-xs text-slate-600 dark:text-slate-300" /><input type="number" step="any" value={pole} onChange={(event) => setDesiredPoles((current) => current.map((existing, position) => position === index ? Number(event.target.value) || 0 : existing))} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className="w-14 rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-slate-800 text-lg tracking-wide outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0" /></label>)}</div></div><div className="min-w-0 flex-1">{placementRequested && placement ? <div className="grid h-full gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.feedback}</p><KatexMath math={`K=${matrixToLatex([placement.gain])}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.desiredCharacteristic}</p><KatexMath math={`\\phi_d(s)=${placement.desiredPolynomial.map((coefficient, index) => `${index === 0 ? "" : coefficient >= 0 ? "+" : ""}${formatNumber(coefficient)}${index === placement.desiredPolynomial.length - 1 ? "" : index === placement.desiredPolynomial.length - 2 ? "s" : `s^{${placement.desiredPolynomial.length - index - 1}}`}`).join("")}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.closedLoop}</p><KatexMath math={`A_{cl}=A-BK=${matrixToLatex(placement.acl)}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /><KatexMath math={`\\lambda(A_{cl})=\\left\\{${placement.closedLoopEigenvalues.map((value) => complexToLatex(value)).join(",\\;")}\\right\\}`} displayMode className="mt-2 block overflow-x-auto text-center text-sm" /></div></div> : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">{analysis.controllable ? copy.poleHint : copy.placeUnavailable}</div>}</div></div></section>
      <StateSpacePortraits matrix={system.A} closedLoopMatrix={placementRequested && placement ? placement.acl : undefined} order={order} />
    </>}
  </div>;
}

export default StateSpaceStudio;
