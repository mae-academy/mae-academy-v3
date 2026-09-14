/* Per-channel 2x2 measurement block for the persistent oscilloscope widget: [Vrms, Vdc] / [Vpp, f]
   in KaTeX, or a slim "not connected" row. Grid div, not a <table> — matches the rest of the app,
   which renders every panel with inline-styled divs rather than semantic tables. */
import { V3Math } from '@/components/ui/V3Math';

export interface ChannelMeasurements {
  frequency: number;
  vpp: number;
  vrms: number;
  vdc: number;
}

export function MeasurementTable({ channel, color, isConnected, measurements }: { channel: string; color: string; isConnected: boolean; measurements?: ChannelMeasurements }) {
  if (!isConnected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
        <span style={{ minWidth: 28, fontWeight: 700, color }}>{channel.toUpperCase()}</span>
        <span style={{ color: '#555', fontStyle: 'italic' }}>not connected</span>
      </div>
    );
  }

  return (
    <div style={{ borderLeft: `3px solid ${color}`, borderRadius: 4, background: '#0f172a', padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #1e293b' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{channel.toUpperCase()}</span>
        <span style={{ fontSize: 9, color: '#64748b' }}>● Connected</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
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
    <div style={{ background: '#0f172a', padding: '6px 4px', textAlign: 'center', fontSize: 10.5, color: '#e2e8f0' }}>
      <V3Math math={math} />
    </div>
  );
}
