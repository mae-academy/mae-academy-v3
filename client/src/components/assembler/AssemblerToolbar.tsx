/** MAE shared simulator styling: rounded technical card, compact control matrix, Tajawal labels. */
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Pause,
  Play,
  RotateCcw,
  StepForward,
} from "lucide-react";

import type { SupportedLanguage } from "@/features/execution-engine";

export type AssemblerTemplateGroup = { label: string; items: string[] };
export type AssemblerLanguageOption = {
  value: SupportedLanguage;
  label: string;
};
type ToolbarProps = {
  copy: {
    controls: string;
    run: string;
    pause: string;
    step: string;
    stepBack: string;
    reset: string;
    cycles: string;
    examples: string;
    prototype: string;
    language: string;
  };
  groups: AssemblerTemplateGroup[];
  selectedTemplate: string;
  cycles: number;
  running: boolean;
  busy?: boolean;
  language: SupportedLanguage;
  languageOptions: AssemblerLanguageOption[];
  onLanguageChange: (value: SupportedLanguage) => void;
  onTemplateChange: (value: string) => void;
  onRun: () => void;
  onStep: () => void;
  onStepBack: () => void;
  onReset: () => void;
};

export function AssemblerToolbar({
  copy,
  groups,
  selectedTemplate,
  cycles,
  running,
  busy = false,
  language,
  languageOptions,
  onLanguageChange,
  onTemplateChange,
  onRun,
  onStep,
  onStepBack,
  onReset,
}: ToolbarProps) {
  const control =
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-400 hover:text-violet-700 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
            {copy.controls}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {copy.prototype}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center dark:border-slate-800 dark:bg-slate-950">
          <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
            {copy.cycles}
          </span>
          <span className="mt-1 block font-mono text-sm font-bold text-violet-700 dark:text-violet-300">
            {cycles.toString().padStart(4, "0")}
          </span>
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <Code2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        <span className="sr-only">{copy.language}</span>
        <select
          aria-label={copy.language}
          value={language}
          onChange={event =>
            onLanguageChange(event.target.value as SupportedLanguage)
          }
          className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-700 outline-none dark:text-slate-200"
        >
          {languageOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-60 ${running ? "bg-emerald-600" : "bg-brand-gradient"}`}
        >
          {running ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {running ? copy.pause : copy.run}
        </button>
        <button
          type="button"
          onClick={onStep}
          disabled={busy}
          className={control}
        >
          <StepForward className="h-4 w-4" />
          {copy.step}
        </button>
        <button
          type="button"
          onClick={onStepBack}
          disabled={busy}
          className={control}
        >
          <ChevronLeft className="h-4 w-4" />
          {copy.stepBack}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className={control}
        >
          <RotateCcw className="h-4 w-4" />
          {copy.reset}
        </button>
      </div>
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <ChevronRight className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        <span className="sr-only">{copy.examples}</span>
        <select
          aria-label={copy.examples}
          value={selectedTemplate}
          onChange={event => onTemplateChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-700 outline-none dark:text-slate-200"
        >
          <option disabled value="">
            {copy.examples}
          </option>
          {groups.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </section>
  );
}

export default AssemblerToolbar;
