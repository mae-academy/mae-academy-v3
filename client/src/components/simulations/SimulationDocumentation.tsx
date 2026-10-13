import { useId } from "react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import { useLocale } from "@/contexts/LocaleContext";

/**
 * Visible theory section rendered below a studio workbench. Prose lives in
 * `locales/<language>/simulationDocs.json`; the governing equations are language-neutral LaTeX and are
 * kept here, paired by index with each topic's `equations` captions.
 */
export type SimulationDocsTopic = "circuits" | "signals" | "control" | "fluid" | "logic" | "plc" | "arduino" | "powerElectronics" | "codeStudio";

export const EQUATIONS: Record<SimulationDocsTopic, string[]> = {
  circuits: [
    "V = I \\cdot R",
    "\\sum_{k} I_k = 0 \\quad \\text{at every node}",
    "\\sum_{k} V_k = 0 \\quad \\text{around every loop}",
    "G\\,\\mathbf{v} = \\mathbf{i}",
    "Z_R = R, \\quad Z_L = j\\omega L, \\quad Z_C = \\frac{1}{j\\omega C}",
    "P_{\\max} = \\frac{V_s^{2}}{4R_s}",
  ],
  signals: [
    "y(t) = \\int_{-\\infty}^{\\infty} x(\\tau)\\,h(t-\\tau)\\,d\\tau",
    "y[n] = \\sum_{k=-\\infty}^{\\infty} x[k]\\,h[n-k]",
    "c_n = \\frac{1}{T}\\int_{T} x(t)\\,e^{-jn\\omega_0 t}\\,dt, \\quad \\omega_0 = \\frac{2\\pi}{T}",
    "H(j\\omega) = \\frac{Y(j\\omega)}{X(j\\omega)}",
    "f_s > 2\\,f_{\\max}",
  ],
  control: [
    "Y(s) = G(s)\\,U(s)",
    "T(s) = \\frac{C(s)G(s)}{1 + C(s)G(s)}",
    "G(s) = \\frac{\\omega_n^{2}}{s^{2} + 2\\zeta\\omega_n s + \\omega_n^{2}}",
    "M_p = \\exp\\!\\left(-\\frac{\\zeta\\pi}{\\sqrt{1-\\zeta^{2}}}\\right)",
    "\\mathrm{PM} = 180^\\circ + \\angle L(j\\omega_c), \\quad |L(j\\omega_c)| = 1",
    "t_s \\approx \\frac{4}{\\zeta\\omega_n}",
  ],
  fluid: [
    "Re = \\frac{\\rho v D}{\\mu}",
    "A_1 v_1 = A_2 v_2 = Q",
    "p = \\frac{F}{A}, \\quad F_2 = F_1\\,\\frac{A_2}{A_1}",
    "\\Delta p = f\\,\\frac{L}{D}\\,\\frac{\\rho v^{2}}{2}",
    "Q = C_d\\,A\\sqrt{\\frac{2\\,\\Delta p}{\\rho}}",
    "P = p\\,Q",
  ],
  logic: [
    "A \\cdot B, \\quad A + B, \\quad \\overline{A}",
    "\\overline{A \\cdot B} = \\overline{A} + \\overline{B}",
    "F = \\sum m(1, 3, 5, 7) = C",
    "f_{\\max} \\approx \\frac{1}{t_{pd} + t_{su}}",
  ],
  plc: [
    "Q = (I_{0.0} \\cdot I_{0.1}) + I_{0.2}",
    "Q = (\\mathrm{Start} + Q)\\cdot\\overline{\\mathrm{Stop}}",
    "T_{\\text{scan}} = T_{\\text{in}} + T_{\\text{prog}} + T_{\\text{out}} + T_{\\text{ovh}}",
    "Q = 1 \\quad \\text{when} \\quad t_{\\text{acc}} \\ge PT",
  ],
  powerElectronics: [
    "V_{dc} = \\frac{2V_m}{\\pi}",
    "V_{dc} = \\frac{2V_m}{\\pi}\\cos\\alpha",
    "V_{out} = D\\,V_{in}",
    "V_{out} = \\frac{V_{in}}{1-D}",
    "\\mathrm{THD} = \\frac{\\sqrt{\\sum_{n\\ge 2} V_n^{2}}}{V_1}",
    "P_{sw} \\approx \\tfrac{1}{2}\\,V\\,I\\,(t_r + t_f)\\,f_{sw}",
  ],
  codeStudio: [
    "R \\leftarrow R \\mid (1 \\ll n)",
    "R \\leftarrow R \\,\\&\\, \\lnot(1 \\ll n)",
    "R \\leftarrow R \\oplus (1 \\ll n)",
    "\\mathrm{field} = (R \\,\\&\\, M) \\gg s",
    "T = \\frac{N_{\\mathrm{pre}}\\,(\\mathrm{TOP}+1)}{f_{\\mathrm{clk}}}",
    "\\mathrm{source} \\rightarrow \\mathrm{preprocess} \\rightarrow \\mathrm{compile} \\rightarrow \\mathrm{assemble} \\rightarrow \\mathrm{link} \\rightarrow \\mathrm{binary}",
  ],
  arduino: [
    "V_{\\text{in}} = \\frac{\\mathrm{ADC} \\cdot V_{\\text{ref}}}{1023}",
    "R = \\frac{V_s - V_f}{I}",
    "V_{\\text{avg}} = D\\,V_{cc}, \\quad D = \\frac{t_{\\text{on}}}{T}",
    "V_{IH} \\ge 0.6\\,V_{CC}, \\quad V_{IL} \\le 0.3\\,V_{CC}",
  ],
};

/** Studio route slug (see SimulationDetail) to the docs topic it displays, when one exists. */
const TOPIC_BY_SLUG: Record<string, SimulationDocsTopic> = {
  "circuit-lab": "circuits",
  "signals-and-systems": "signals",
  "control-systems": "control",
  "digital-logic-design": "logic",
  "power-electronics": "powerElectronics",
  code: "codeStudio",
  plc: "plc",
  "arduino-studio": "arduino",
  "pneumatics-and-hydraulics": "fluid",
};

export function docsTopicForSlug(slug: string | undefined): SimulationDocsTopic | null {
  return slug ? TOPIC_BY_SLUG[slug] ?? null : null;
}

interface SimulationDocumentationProps {
  topic: SimulationDocsTopic;
}

const sectionClass = "mt-10 border-t border-slate-200/80 pt-8 dark:border-white/[0.08]";
const headingClass = "text-xl font-bold tracking-tight text-slate-900 dark:text-white break-words";
const subheadingClass = "mt-6 text-base font-semibold text-slate-900 dark:text-slate-100 break-words";
const bodyClass = "mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words";

export default function SimulationDocumentation({ topic }: SimulationDocumentationProps) {
  const { t } = useTranslation("simulationDocs");
  const { locale, isRtl } = useLocale();
  const uid = useId();
  const equations = EQUATIONS[topic];
  const captions = t(`topics.${topic}.equations`, { returnObjects: true }) as string[];
  const principles = t(`topics.${topic}.principles`, { returnObjects: true }) as { heading: string; body: string }[];
  const parameters = t(`topics.${topic}.parameters`, { returnObjects: true }) as { term: string; body: string }[];
  const experiments = t(`topics.${topic}.experiments`, { returnObjects: true }) as { title: string; body: string }[];
  const applications = t(`topics.${topic}.applications`, { returnObjects: true }) as { field: string; body: string }[];

  return (
    <article
      lang={locale}
      dir={isRtl ? "rtl" : "ltr"}
      aria-labelledby={`${uid}-title`}
      className="mx-auto mt-10 w-full max-w-[1380px] text-start"
    >
      <header>
        <h2 id={`${uid}-title`} className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white break-words sm:text-3xl">
          {t(`topics.${topic}.title`)}
        </h2>
        <p className={`${bodyClass} max-w-3xl`}>{t(`topics.${topic}.intro`)}</p>
      </header>

      <section aria-labelledby={`${uid}-principles`} className={sectionClass}>
        <h3 id={`${uid}-principles`} className={headingClass}>{t("sections.principles")}</h3>
        {principles.map((item) => (
          <div key={item.heading}>
            <h4 className={subheadingClass}>{item.heading}</h4>
            <p className={bodyClass}>{item.body}</p>
          </div>
        ))}
        <div className="mt-6 space-y-4">
          <h4 className={subheadingClass}>{t("labels.equations")}</h4>
          {equations.map((tex, index) => (
            <figure
              key={tex}
              className="scroll-x rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-center dark:border-white/[0.08] dark:bg-white/[0.03]"
            >
              <div className="text-base text-slate-900 dark:text-slate-100">
                <KatexMath math={tex} displayMode />
              </div>
              <figcaption className="mt-2 text-xs text-slate-600 dark:text-slate-400 break-words">{captions[index]}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section aria-labelledby={`${uid}-parameters`} className={sectionClass}>
        <h3 id={`${uid}-parameters`} className={headingClass}>{t("sections.parameters")}</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {parameters.map((item) => (
            <div key={item.term} className="min-w-0 rounded-xl border border-slate-200/80 p-4 dark:border-white/[0.08]">
              <dt className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">{item.term}</dt>
              <dd className={bodyClass}>{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby={`${uid}-experiments`} className={sectionClass}>
        <h3 id={`${uid}-experiments`} className={headingClass}>{t("sections.experiments")}</h3>
        <ol className="mt-4 space-y-5 ps-5">
          {experiments.map((item) => (
            <li key={item.title} className="ps-1">
              <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 break-words">{item.title}</h4>
              <p className={bodyClass}>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${uid}-applications`} className={sectionClass}>
        <h3 id={`${uid}-applications`} className={headingClass}>{t("sections.applications")}</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {applications.map((item) => (
            <div key={item.field} className="min-w-0 rounded-xl border border-slate-200/80 p-4 dark:border-white/[0.08]">
              <dt className="text-sm font-semibold text-violet-700 dark:text-violet-300 break-words">{item.field}</dt>
              <dd className={bodyClass}>{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
