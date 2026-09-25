/**
 * MAE State-Space Studio visual system: monochrome blueprint instrument surface.
 * Matrix and equation treatments are rendered with KaTeX; vector marks remain solid
 * black/white so this control-theory studio has a deliberate technical contrast.
 */
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { KatexMath } from "@/components/ui/KatexMath";
import {
  SegmentedControl,
  StudioCard,
  InnerBox,
  GradientButton,
  FormulaBox,
  StatusBadge,
} from "@/components/common/templates";
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
const MATRIX_INPUT = "w-12 h-9 text-center font-serif text-sm bg-slate-100/70 dark:bg-slate-800/70 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 border-none text-slate-800 dark:text-slate-100 transition-colors [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0";
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
  return <div className="flex w-full flex-col items-center"><div className="flex items-center justify-between w-full gap-3 pr-0.5"><KatexMath math={`${name} =`} className="text-base font-bold text-slate-800 dark:text-white" /><span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{rows} × {columns}</span></div><div className={`${MATRIX_BRACKETS} mt-2 flex justify-center`}><div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{matrix.map((row, rowIndex) => row.map((value, columnIndex) => <input key={`${name}-${rowIndex}-${columnIndex}`} aria-label={`${name} ${rowIndex + 1}, ${columnIndex + 1}`} inputMode="decimal" type="number" step="any" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(rowIndex, columnIndex, Number(event.target.value) || 0)} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className={MATRIX_INPUT} />))}</div></div></div>;
}

function LeoAlert({ messages, copy }: { messages: string[]; copy: typeof studioCopy.en }) {
  return (
    <aside className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/20 backdrop-blur-sm">
      <div className="flex gap-3">
        <div className="mt-0.5 rounded-full border border-rose-300 p-1.5 text-rose-600 dark:border-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">{copy.leoTitle}</h3>
            <StatusBadge variant="danger" label="Deficient Rank" />
          </div>
          <KatexMath math={`\\text{${copy.leoText.replace(/[{}]/g, "")}}`} displayMode className="block overflow-x-auto text-sm font-semibold text-slate-800 dark:text-white" />
          <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{messages.join(" ")}</p>
        </div>
      </div>
    </aside>
  );
}

function StatusCard({ title, symbol, matrix, isFullRank }: { title: string; symbol: string; matrix: Matrix; isFullRank?: boolean }) {
  return (
    <StudioCard
      title={
        <div className="flex items-center gap-1.5">
          <KatexMath math={`${symbol} =`} className="text-xs font-bold text-slate-800 dark:text-white" />
          <span>{title}</span>
        </div>
      }
      actionSlot={
        isFullRank === false ? (
          <StatusBadge variant="danger" label="Rank Deficient" />
        ) : undefined
      }
    >
      <FormulaBox math={`${symbol}=${matrixToLatex(matrix)}`} />
    </StudioCard>
  );
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

  const messages = "controllable" in analysis ? [!analysis.controllable ? copy.leoControllability : "", !analysis.observable ? copy.leoObservability : ""].filter(Boolean) : [];

  return (
    <div className="space-y-6">
      <StudioCard
        title={copy.systemMatrices}
        actionSlot={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy.order}</span>
            <SegmentedControl options={[{ label: <KatexMath math="n = 2" />, value: 2 }, { label: <KatexMath math="n = 3" />, value: 3 }]} value={order} onChange={changeOrder} size="sm" aria-label="System Order" />
            <GradientButton variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {copy.reset}
            </GradientButton>
          </div>
        }
      >
        <div className="grid grid-cols-2 items-start gap-6 lg:grid-cols-4">
          <MatrixGrid name="A" matrix={system.A} onChange={(row, column, value) => updateMatrix("A", row, column, value)} />
          <MatrixGrid name="B" matrix={system.B} onChange={(row, column, value) => updateMatrix("B", row, column, value)} />
          <MatrixGrid name="C" matrix={system.C} onChange={(row, column, value) => updateMatrix("C", row, column, value)} />
          <MatrixGrid name="D" matrix={system.D} onChange={(row, column, value) => updateMatrix("D", row, column, value)} />
        </div>
      </StudioCard>

      {"error" in analysis ? (
        <StudioCard title="Analysis Error">
          <p className="text-sm text-rose-600 dark:text-rose-300">{analysis.error}</p>
        </StudioCard>
      ) : (
        <>
          <StudioCard title={copy.stateEquations}>
            <div className="grid gap-4 lg:grid-cols-2">
              <FormulaBox math={`\\dot{x}=(${matrixToLatex(system.A)})x+(${matrixToLatex(system.B)})u`} />
              <FormulaBox math={`y=(${matrixToLatex(system.C)})x+(${matrixToLatex(system.D)})u`} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <InnerBox title={copy.characteristic}>
                <KatexMath math={`\\det(sI-A)=${analysis.characteristic.map((coefficient, index) => `${index === 0 ? "" : coefficient >= 0 ? "+" : ""}${formatNumber(coefficient)}${index === analysis.characteristic.length - 1 ? "" : index === analysis.characteristic.length - 2 ? "s" : `s^{${analysis.characteristic.length - index - 1}}`}`).join("")}`} displayMode className="mt-2 block w-full overflow-x-auto text-center text-sm" />
              </InnerBox>
              <InnerBox title={copy.openEigenvalues}>
                <KatexMath math={`\\lambda(A)=\\left\\{${analysis.eigenvalues.map((value) => complexToLatex(value)).join(",\\;")}\\right\\}`} displayMode className="mt-2 block w-full overflow-x-auto text-center text-sm" />
              </InnerBox>
            </div>
          </StudioCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <StatusCard title={copy.controllability} symbol="\\mathcal{C}" matrix={analysis.controllability} isFullRank={analysis.controllable} />
            <StatusCard title={copy.observability} symbol="\\mathcal{O}" matrix={analysis.observability} isFullRank={analysis.observable} />
          </div>

          {messages.length > 0 && <LeoAlert messages={messages} copy={copy} />}

          <StudioCard
            title={copy.desiredPoles}
            subtitle={copy.poleHint}
            actionSlot={
              <GradientButton size="sm" onClick={() => setPlacementRequested(true)} disabled={!analysis.controllable}>
                {copy.calculate}
              </GradientButton>
            }
          >
            <div className="flex items-stretch gap-4">
              <div className="w-28 shrink-0 flex-col">
                <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Poles</p>
                <div className="flex flex-col gap-2">
                  {desiredPoles.map((pole, index) => (
                    <label key={index} className="flex items-center justify-between gap-1.5">
                      <KatexMath math={`\\mu_{${index + 1}}`} className="text-xs text-slate-600 dark:text-slate-300" />
                      <input
                        type="number"
                        step="any"
                        value={pole}
                        onChange={(event) => setDesiredPoles((current) => current.map((existing, position) => position === index ? Number(event.target.value) || 0 : existing))}
                        style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                        className="w-16 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-center text-slate-800 text-base tracking-wide outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                {placementRequested && placement ? (
                  <div className="grid h-full gap-3 sm:grid-cols-3">
                    <InnerBox title={copy.feedback}>
                      <KatexMath math={`K=${matrixToLatex([placement.gain])}`} displayMode className="mt-1 block overflow-x-auto text-center text-sm" />
                    </InnerBox>
                    <InnerBox title={copy.desiredCharacteristic}>
                      <KatexMath math={`\\phi_d(s)=${placement.desiredPolynomial.map((coefficient, index) => `${index === 0 ? "" : coefficient >= 0 ? "+" : ""}${formatNumber(coefficient)}${index === placement.desiredPolynomial.length - 1 ? "" : index === placement.desiredPolynomial.length - 2 ? "s" : `s^{${placement.desiredPolynomial.length - index - 1}}`}`).join("")}`} displayMode className="mt-1 block overflow-x-auto text-center text-sm" />
                    </InnerBox>
                    <InnerBox title={copy.closedLoop}>
                      <KatexMath math={`A_{cl}=A-BK=${matrixToLatex(placement.acl)}`} displayMode className="mt-1 block overflow-x-auto text-center text-sm" />
                      <KatexMath math={`\\lambda(A_{cl})=\\left\\{${placement.closedLoopEigenvalues.map((value) => complexToLatex(value)).join(",\\;")}\\right\\}`} displayMode className="mt-1 block overflow-x-auto text-center text-xs" />
                    </InnerBox>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {analysis.controllable ? copy.poleHint : copy.placeUnavailable}
                  </div>
                )}
              </div>
            </div>
          </StudioCard>

          <StateSpacePortraits matrix={system.A} closedLoopMatrix={placementRequested && placement ? placement.acl : undefined} order={order} />
        </>
      )}
    </div>
  );
}

export default StateSpaceStudio;
