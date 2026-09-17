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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            {copy.variablesTitle}
          </h3>
        </div>
        <span className="rounded-full border border-slate-200 dark:border-[#1a1d24] bg-slate-100 dark:bg-[#13161c] px-2.5 py-0.5 font-mono text-[10px] font-bold text-violet-600 dark:text-violet-400">
          {entries.length} variables
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#1a1d24] bg-white dark:bg-[#090a0d]">
        <div className="grid grid-cols-[1fr_1fr_1.4fr] bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-[#13161c] dark:text-slate-400 border-b border-slate-200 dark:border-[#1a1d24]">
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
                className={`grid grid-cols-[1fr_1fr_1.4fr] border-t border-slate-100 dark:border-[#1a1d24] px-3 py-2 font-mono text-xs ${
                  changed
                    ? "bg-violet-50 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                <span className="truncate font-semibold">{name}</span>
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
          <div className="px-4 py-8 text-center font-mono text-xs text-slate-400 dark:text-slate-500">
            {copy.empty}
          </div>
        )}
      </div>

      {callStack.length > 0 && (
        <div className="border-t border-slate-200 dark:border-[#1a1d24] pt-3">
          <h4 className={subheading}>{copy.callStackTitle}</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {callStack.map((frame, index) => (
              <span
                key={`${frame}-${index}`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-200"
              >
                {frame}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AssemblerVariables;

