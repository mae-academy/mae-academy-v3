/* Per-channel 2x2 measurement block for the persistent oscilloscope widget: [Vrms, Vdc] / [Vpp, f]
   in KaTeX, or a slim "not connected" row. Always visible when connected, adhering to global application theme. */
import { V3Math } from '@/components/ui/V3Math';

export interface ChannelMeasurements {
  frequency: number;
  vpp: number;
  vrms: number;
  vdc: number;
}

export function MeasurementTable({
  channel,
  color,
  isConnected,
  measurements,
}: {
  channel: string;
  color: string;
  isConnected: boolean;
  measurements?: ChannelMeasurements;
}) {
  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 py-1 px-0.5 text-[10px] font-mono">
        <span className="min-w-[28px] font-bold" style={{ color }}>{channel.toUpperCase()}</span>
        <span className="text-slate-400 dark:text-slate-500 italic">not connected</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg bg-slate-50 dark:bg-[#0d0f12] border border-slate-200/80 dark:border-[#1a1d24] p-2 shadow-xs transition-colors"
      style={{ borderLeft: `3.5px solid ${color}` }}
    >
      <div className="flex justify-between items-center mb-1.5 pb-1 border-b border-slate-200 dark:border-[#1a1d24]">
        <span className="text-[11px] font-bold" style={{ color }}>{channel.toUpperCase()}</span>
        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">● Connected</span>
      </div>
      <div className="grid grid-cols-2 gap-[1px] bg-slate-200 dark:bg-[#1a1d24] rounded overflow-hidden border border-slate-200 dark:border-[#1a1d24]">
        <MeasurementCell math={`V_{\\text{rms}} = ${measurements!.vrms.toFixed(2)}\\ \\text{V}`} />
        <MeasurementCell math={`V_{\\text{dc}} = ${measurements!.vdc.toFixed(2)}\\ \\text{V}`} />
        <MeasurementCell math={`V_{\\text{pp}} = ${measurements!.vpp.toFixed(2)}\\ \\text{V}`} />
        <MeasurementCell math={`f = ${measurements!.frequency.toFixed(1)}\\ \\text{Hz}`} />
      </div>
    </div>
  );
}

function MeasurementCell({ math }: { math: string }) {
  return (
    <div className="bg-white dark:bg-[#090a0d] py-1 px-1 text-center text-[10.5px] text-slate-800 dark:text-[#f8fafc]">
      <V3Math math={math} />
    </div>
  );
}
