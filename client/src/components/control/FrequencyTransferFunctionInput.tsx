import { useEffect, useMemo, useState, type ReactNode } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { parseRootsList, rootsToPolynomial } from "@/lib/controlMath";

export type FrequencyTransferMode = "polynomial" | "zpk" | "second-order";

export type FrequencyTransferFunction = {
  mode: FrequencyTransferMode;
  numerator: number[];
  denominator: number[];
  numeratorText: string;
  denominatorText: string;
  zpk: { gain: number; zeros: string; poles: string };
  secondOrder: { wn: number; zeta: number };
};

type FrequencyTransferFunctionInputProps = {
  onChange: (transferFunction: FrequencyTransferFunction) => void;
};

const CARD = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const HEADING = "text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white";
const FIELD_CLASS = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white";

function parseCoefficients(value: string) {
  const coefficients = value.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return coefficients.length ? coefficients : [1];
}

export function FrequencyTransferFunctionInput({ onChange }: FrequencyTransferFunctionInputProps) {
  const [mode, setMode] = useState<FrequencyTransferMode>("second-order");
  const [numeratorText, setNumeratorText] = useState("1");
  const [denominatorText, setDenominatorText] = useState("1 1.2 1");
  const [zpkGain, setZpkGain] = useState("1");
  const [zerosText, setZerosText] = useState("");
  const [polesText, setPolesText] = useState("-0.6+0.8j, -0.6-0.8j");
  const [wn, setWn] = useState(1);
  const [zeta, setZeta] = useState(0.6);

  const transferFunction = useMemo<FrequencyTransferFunction>(() => {
    const polynomial = { numerator: parseCoefficients(numeratorText), denominator: parseCoefficients(denominatorText) };
    const zpk = {
      numerator: rootsToPolynomial(parseRootsList(zerosText)).map((coefficient) => coefficient * (Number(zpkGain) || 1)),
      denominator: rootsToPolynomial(parseRootsList(polesText)),
    };
    const standard = { numerator: [wn * wn], denominator: [1, 2 * zeta * wn, wn * wn] };
    const active = mode === "polynomial" ? polynomial : mode === "zpk" ? zpk : standard;
    return {
      mode,
      numerator: active.numerator,
      denominator: active.denominator,
      numeratorText,
      denominatorText,
      zpk: { gain: Number(zpkGain) || 1, zeros: zerosText, poles: polesText },
      secondOrder: { wn, zeta },
    };
  }, [denominatorText, mode, numeratorText, polesText, wn, zerosText, zeta, zpkGain]);

  useEffect(() => onChange(transferFunction), [onChange, transferFunction]);

  const transferEquation = mode === "second-order"
    ? "G(s)=\\frac{\\omega_n^2}{s^2+2\\zeta\\omega_n s+\\omega_n^2}"
    : "G(s)=\\frac{N(s)}{D(s)}";

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 className={HEADING}>Transfer Function Engine</h3>
          <KatexMath math="G(s)=\\frac{N(s)}{D(s)}" className="mt-1 block text-sm text-violet-700 dark:text-violet-300" />
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["polynomial", "\\mathrm{Polynomial}"],
            ["zpk", "\\mathrm{ZPK}"],
            ["second-order", "\\mathrm{2^{nd}\\ Order}"],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => setMode(value)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${mode === value ? "border-violet-400 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-violet-100" : "border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:text-violet-200"}`}>
              <KatexMath math={label} />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_0.78fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "polynomial" && <>
            <Field label="N(s)\ \mathrm{coefficients}" hint="highest power → constant"><input className={FIELD_CLASS} value={numeratorText} onChange={(event) => setNumeratorText(event.target.value)} /></Field>
            <Field label="D(s)\ \mathrm{coefficients}" hint="highest power → constant"><input className={FIELD_CLASS} value={denominatorText} onChange={(event) => setDenominatorText(event.target.value)} /></Field>
          </>}
          {mode === "zpk" && <>
            <Field label="K"><input className={FIELD_CLASS} type="number" step="any" value={zpkGain} onChange={(event) => setZpkGain(event.target.value)} /></Field>
            <Field label="z_i" hint="e.g. −2, −1+3j"><input className={FIELD_CLASS} value={zerosText} onChange={(event) => setZerosText(event.target.value)} /></Field>
            <Field label="p_i" hint="conjugates explicitly listed" className="sm:col-span-2"><input className={FIELD_CLASS} value={polesText} onChange={(event) => setPolesText(event.target.value)} /></Field>
          </>}
          {mode === "second-order" && <>
            <RangeField label="\\omega_n" value={wn} min={0.1} max={20} step={0.1} onChange={setWn} />
            <RangeField label="\\zeta" value={zeta} min={0.05} max={2} step={0.01} onChange={setZeta} />
          </>}
        </div>
        <div className="flex min-h-36 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 dark:border-slate-800 dark:bg-slate-950">
          <KatexMath math={transferEquation} displayMode className="max-w-full overflow-x-auto text-xl text-slate-950 dark:text-white" />
        </div>
      </div>
    </section>
  );
}

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><KatexMath math={label} className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400" />{children}{hint && <span className="mt-1 block font-mono text-[10px] text-slate-500 dark:text-slate-400">{hint}</span>}</label>;
}

function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="block"><div className="mb-1.5 flex items-center justify-between"><KatexMath math={label} className="text-xs font-bold text-slate-500 dark:text-slate-400" /><KatexMath math={value.toFixed(step < 0.1 ? 2 : 1)} className="font-mono text-xs text-violet-700 dark:text-violet-300" /></div><input className="w-full accent-blue-600" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
