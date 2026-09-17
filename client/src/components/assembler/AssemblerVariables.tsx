/** MAE Assembler Studio: variables & call-stack view for interpreted languages (Python/C/C++). */
import type { TraceStep } from "@/features/execution-engine";

type VariablesProps = {
  variables: TraceStep["variables"];
  previousVariables: TraceStep["variables"] | null;
  callStack: string[];
  copy: {
    variablesTitle: string;
    callStackTitle: string;
    empty: string;
    name: string;
    type: string;
    value: string;
  };
};

const cell =
  "rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950";
const subheading =
  "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AssemblerVariables({
  variables,
  previousVariables,
  callStack,
  copy,
}: VariablesProps) {
  const entries = Object.entries(variables);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
            {copy.variablesTitle}
          </h3>
          <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
            {copy.name} · {copy.type} · {copy.value}
          </p>
        </div>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-mono text-[10px] font-bold text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200">
          {entries.length}
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-[1fr_1fr_1.4fr] bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          <span>{copy.name}</span>
          <span>{copy.type}</span>
          <span>{copy.value}</span>
        </div>
        {entries.length ? (
          entries.map(([name, variable]) => {
            const previous = previousVariables?.[name];
            const changed =
              previous !== undefined &&
              stringifyValue(previous.value) !== stringifyValue(variable.value);
            return (
              <div
                key={name}
                className={`grid grid-cols-[1fr_1fr_1.4fr] border-t border-slate-100 px-3 py-2 font-mono text-xs dark:border-slate-800 ${changed ? "bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-100" : ""}`}
              >
                <span className="truncate font-bold">{name}</span>
                <span className="truncate text-slate-500 dark:text-slate-400">
                  {variable.type}
                </span>
                <span className="truncate">
                  {stringifyValue(variable.value)}
                </span>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-5 font-mono text-xs text-slate-500 dark:text-slate-400">
            {copy.empty}
          </p>
        )}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h4 className={subheading}>{copy.callStackTitle}</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {callStack.length ? (
            callStack.map((frame, index) => (
              <span
                key={`${frame}-${index}`}
                className={`${cell} font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200`}
              >
                {frame}
              </span>
            ))
          ) : (
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {copy.empty}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export default AssemblerVariables;
