/**
 * MAE Assembler Studio: CPU execution-state registers & flags reference.
 * Optimized for high legibility, compact grid alignment, and crisp subregister typography.
 */
import type { AssemblerFlag } from "@/components/assembler/AssemblerFlags";

export type RegisterSnapshot = {
  AX: string;
  BX: string;
  CX: string;
  DX: string;
  SI: string;
  DI: string;
  BP: string;
  SP: string;
  IP: string;
  CS: string;
  DS: string;
  ES: string;
  SS: string;
};

export type RegisterProps = {
  registers: RegisterSnapshot;
  flags: Record<AssemblerFlag, boolean>;
  flashTick: number;
  copy?: {
    cpu?: string;
    general?: string;
    pointers?: string;
    segments?: string;
    physical?: string;
    flags?: string;
    on?: string;
    off?: string;
  };
};

const cell =
  "rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-[#1a1d24] dark:bg-[#090a0d]";
const subheading =
  "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5";
const FLAG_ORDER: AssemblerFlag[] = [
  "ZF",
  "SF",
  "CF",
  "OF",
  "PF",
  "AF",
  "IF",
  "DF",
];

function WordRegister({
  name,
  value,
  flashTick,
}: {
  name: "AX" | "BX" | "CX" | "DX";
  value: string;
  flashTick: number;
}) {
  const high = `${name[0]}H`;
  const low = `${name[0]}L`;

  return (
    <article
      key={name}
      className={`${cell} transition-none`}
    >
      <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-[#1a1d24]">
        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
          {name}
        </span>
        <span className="font-mono text-xs font-bold text-violet-700 dark:text-violet-300">
          {value}
        </span>
      </div>

      {/* High-contrast, larger 8-bit subregister cells */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-[#1a1d24] dark:bg-[#13161c]">
          <span className="text-[11px] font-extrabold text-violet-600 dark:text-violet-400">
            {high}
          </span>
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
            {value.slice(0, 2)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-[#1a1d24] dark:bg-[#13161c]">
          <span className="text-[11px] font-extrabold text-violet-600 dark:text-violet-400">
            {low}
          </span>
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
            {value.slice(2)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function AssemblerRegisters({
  registers,
  flags,
  flashTick,
  copy,
}: RegisterProps) {
  const pointers: Array<keyof RegisterSnapshot> = [
    "SI",
    "DI",
    "BP",
    "SP",
    "IP",
  ];
  const segments: Array<keyof RegisterSnapshot> = ["CS", "DS", "ES", "SS"];

  return (
    <div className="space-y-3">
      {/* General Purpose Registers */}
      <div>
        <h4 className={subheading}>{copy?.general ?? "General Purpose"}</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <WordRegister name="AX" value={registers.AX} flashTick={flashTick} />
          <WordRegister name="BX" value={registers.BX} flashTick={flashTick} />
          <WordRegister name="CX" value={registers.CX} flashTick={flashTick} />
          <WordRegister name="DX" value={registers.DX} flashTick={flashTick} />
        </div>
      </div>

      {/* Pointers & Segments Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Pointers */}
        <div>
          <h4 className={subheading}>{copy?.pointers ?? "Pointers & Indexes"}</h4>
          <div className="grid grid-cols-5 gap-1.5">
            {pointers.map(name => (
              <div
                key={name}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-1 py-1.5 text-center dark:border-[#1a1d24] dark:bg-[#090a0d]"
              >
                <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {name}
                </span>
                <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate block">
                  {registers[name]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Segments */}
        <div>
          <h4 className={subheading}>
            {copy?.segments ?? "Segments"} (Physical = Reg &times; 16)
          </h4>
          <div className="grid grid-cols-4 gap-1.5">
            {segments.map(name => (
              <div
                key={name}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-1 py-1.5 text-center dark:border-[#1a1d24] dark:bg-[#090a0d]"
              >
                <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {name}
                </span>
                <span className="font-mono text-[11px] font-bold text-violet-700 dark:text-violet-300 truncate block">
                  {registers[name]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Flags Register */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {copy?.flags ?? "Flags Register"}
          </h4>
          <span className="font-mono text-[10px] text-slate-400">
            ZF · SF · CF · OF · PF · AF · IF · DF
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {FLAG_ORDER.map(flag => {
            const enabled = flags[flag];
            return (
              <div
                key={flag}
                title={`${flag}: ${enabled ? "1 / on" : "0 / off"}`}
                className={`rounded-lg border p-1.5 text-center transition ${
                  enabled
                    ? "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-500/50 dark:bg-violet-950/30 dark:text-violet-200"
                    : "border-slate-200 bg-slate-50/50 text-slate-500 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-400"
                }`}
              >
                <span
                  className={`mx-auto block h-1.5 w-1.5 rounded-full mb-1 ${
                    enabled ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                />
                <span className="font-mono text-[10px] font-bold block">
                  {flag}
                </span>
                <span className="font-mono text-[9px] block text-slate-400">
                  {enabled ? "1" : "0"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AssemblerRegisters;
