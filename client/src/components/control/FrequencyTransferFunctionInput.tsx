import { useEffect, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { parseRootsList, rootsToPolynomial, type Complex } from "@/lib/controlMath";

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

const CARD = "bg-white dark:bg-slate-900 border border-slate-200/80 shadow-sm rounded-2xl p-6";
const HEADING = "text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white";
const FIELD_INPUT = "w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500";
const tabCls = (active: boolean) => `rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ${active ? "bg-gradient-to-r from-blue-600 to-pink-500 text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-slate-200"}`;

function parseCoefficients(value: string) {
  const coefficients = value.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return coefficients.length ? coefficients : [1];
}

function renderPoly(coeffs: number[]) {
  if (coeffs.length === 0) return "0";
  let str = "";
  const degree = coeffs.length - 1;
  for (let i = 0; i <= degree; i++) {
    const c = coeffs[i];
    if (Math.abs(c) < 1e-9) continue;
    const power = degree - i;
    const rounded = Math.round(c * 10000) / 10000;
    let term = "";
    if (Math.abs(c) !== 1 || power === 0) {
      term += String(rounded);
    } else if (c === -1) {
      term += "-";
    }
    if (power > 0) {
      term += "s";
      if (power > 1) term += `^{${power}}`;
    }
    if (str && c > 0) str += " + " + term;
    else if (str && c < 0) str += " - " + term.replace("-", "");
    else str += term;
  }
  return str || "0";
}

const fmtNum = (value: number) => Math.round(value * 10000) / 10000;

// Renders numeric factored factors like `(s + 2)`, `s`, or a real quadratic
// `(s^{2}+1.2s+1)` for complex-conjugate pairs — mirroring Root Locus.
function formatFactored(roots: Complex[]) {
  if (roots.length === 0) return "1";
  const used = new Set<number>();
  let out = "";
  for (let i = 0; i < roots.length; i++) {
    if (used.has(i)) continue;
    const r = roots[i];
    if (Math.abs(r.re) < 1e-9 && Math.abs(r.im) < 1e-9) {
      out += "s";
      continue;
    }
    if (Math.abs(r.im) > 1e-9) {
      let conj = -1;
      for (let j = i + 1; j < roots.length; j++) {
        if (!used.has(j) && Math.abs(roots[j].re - r.re) < 1e-5 && Math.abs(roots[j].im + r.im) < 1e-5) {
          conj = j;
          break;
        }
      }
      if (conj !== -1) {
        used.add(conj);
        const a = fmtNum(r.re);
        const lin = fmtNum(-2 * a);
        const quad = fmtNum(a * a + r.im * r.im);
        const linPart = lin !== 0 ? `${lin < 0 ? "" : "+"}${lin}s` : "";
        const quadPart = quad !== 0 ? `+${quad}` : "";
        out += `(s^{2}${linPart}${quadPart})`;
        continue;
      }
    }
    const sign = r.re < 0 ? "+" : "-";
    out += `(s ${sign} ${fmtNum(Math.abs(r.re))})`;
  }
  return out;
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

  const transferEquation = (() => {
    if (mode === "second-order") {
      const fmt = (value: number) => String(Math.round(value * 10000) / 10000);
      const squared = fmt(wn * wn);
      const linear = fmt(2 * zeta * wn);
      return `G(s)=\\frac{\\omega_n^2}{s^2+2\\zeta\\omega_n\\,s+\\omega_n^2}=\\frac{${squared}}{s^2+${linear}\\,s+${squared}}`;
    }
    if (mode === "zpk") {
      const zeros = parseRootsList(zerosText);
      const poles = parseRootsList(polesText);
      const gain = Number(zpkGain) || 1;
      const gainTop = Math.abs(gain - 1) < 1e-9 ? "" : `${fmtNum(gain)}`;
      const zeroFactors = zeros.length ? formatFactored(zeros) : "";
      const numeratorFactors = `${gainTop}${zeroFactors}` || "1";
      return `G(s)=\\frac{${numeratorFactors}}{${formatFactored(poles)}}`;
    }
    return `G(s)=\\frac{${renderPoly(transferFunction.numerator)}}{${renderPoly(transferFunction.denominator)}}`;
  })();

  return (
    <div className={CARD}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className={HEADING}>Transfer Function Engine</h3>

        {/* Toggle Mode */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMode("polynomial")} className={tabCls(mode === "polynomial")}>Polynomial</button>
          <button onClick={() => setMode("zpk")} className={tabCls(mode === "zpk")}>ZPK</button>
          <button onClick={() => setMode("second-order")} className={tabCls(mode === "second-order")}>2nd Order</button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          {mode === "polynomial" ? (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="N(s) \text{ coefficients}" /></label>
                <input type="text" value={numeratorText} onChange={(e) => setNumeratorText(e.target.value)} className={FIELD_INPUT} placeholder="e.g. 1" />
                <p className="text-[10px] text-slate-400 mt-1">Space-separated from highest to lowest power.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="D(s) \text{ coefficients}" /></label>
                <input type="text" value={denominatorText} onChange={(e) => setDenominatorText(e.target.value)} className={FIELD_INPUT} placeholder="e.g. 1 1.2 1" />
              </div>
            </>
          ) : mode === "zpk" ? (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\text{DC Gain } (K)" /></label>
                <input type="text" value={zpkGain} onChange={(e) => setZpkGain(e.target.value)} className={FIELD_INPUT} placeholder="1" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\text{Zeros } z_i" /></label>
                <input type="text" value={zerosText} onChange={(e) => setZerosText(e.target.value)} className={FIELD_INPUT} placeholder="e.g. -2, -1+3j" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\text{Poles } p_i" /></label>
                <input type="text" value={polesText} onChange={(e) => setPolesText(e.target.value)} className={FIELD_INPUT} placeholder="e.g. 0, -1, -2" />
                <p className="text-[10px] text-slate-400 mt-1">Comma-separated roots. Use 'j' for complex conjugate pairs.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\omega_n" /></label>
                <input type="number" step="any" value={wn} onChange={(e) => setWn(Number(e.target.value))} className={FIELD_INPUT} placeholder="e.g. 1" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\zeta" /></label>
                <input type="number" step="any" value={zeta} onChange={(e) => setZeta(Number(e.target.value))} className={FIELD_INPUT} placeholder="e.g. 0.6" />
              </div>
            </>
          )}
        </div>

        {/* Display */}
        <div className="flex min-h-[180px] items-center justify-center overflow-x-auto rounded-2xl border border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-950">
          <KatexMath math={transferEquation} displayMode={true} className="text-xl text-slate-900 dark:text-white" />
        </div>
      </div>
    </div>
  );
}
