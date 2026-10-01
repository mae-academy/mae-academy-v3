import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useActiveSimulatorSeo } from "@/seo/useSimulatorSeo";

/**
 * Collapsible theory + how-to text beneath a simulator workspace. The content is plain HTML that is
 * always in the DOM (visually collapsed only) so crawlers index it, and it follows the active mode.
 */
export default function SimulatorDocumentation() {
  const entry = useActiveSimulatorSeo();
  const [open, setOpen] = useState(false);
  if (!entry) return null;
  const { docs, name } = entry;
  const panelId = `sim-docs-${entry.key}`;
  const heading = "text-sm font-semibold text-slate-900 dark:text-slate-100";

  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className="mx-auto mt-8 w-full max-w-5xl rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4 text-left shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.03]"
      dir="ltr"
    >
      <h2 id={`${panelId}-title`} className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 text-left text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          <span>About the {name}: theory &amp; how to use</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      <div id={panelId} className={`${open ? "mt-4" : "sr-only"} space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300`}>
        <div>
          <h3 className={`mb-1 ${heading}`}>Overview</h3>
          <p>{docs.overview}</p>
        </div>
        <div>
          <h3 className={`mb-1 ${heading}`}>Governing equations and theory</h3>
          <ul className="list-disc space-y-1 ps-5">
            {docs.theory.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <div>
          <h3 className={`mb-1 ${heading}`}>How to use</h3>
          <ol className="list-decimal space-y-1 ps-5">
            {docs.steps.map((line) => <li key={line}>{line}</li>)}
          </ol>
        </div>
        {docs.uses && (
          <div>
            <h3 className={`mb-1 ${heading}`}>Typical uses</h3>
            <p>{docs.uses}</p>
          </div>
        )}
      </div>
    </section>
  );
}
