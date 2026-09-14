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

export function MeasurementTable({ channel, color, isConnected, measurements, isDarkMode = true, showValues = true }: { channel: string; color: string; isConnected: boolean; measurements?: ChannelMeasurements; isDarkMode?: boolean; showValues?: boolean }) {
  const boxBg = isDarkMode ? '#0f172a' : '#f8fafc';
  const gridLine = isDarkMode ? '#1e293b' : '#e2e8f0';
  const cellText = isDarkMode ? '#e2e8f0' : '#1e293b';
  const statusText = '#64748b';
  const notConnectedText = '#94a3b8';

  if (!isConnected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
        <span style={{ minWidth: 28, fontWeight: 700, color }}>{channel.toUpperCase()}</span>
        <span style={{ color: notConnectedText, fontStyle: 'italic' }}>not connected</span>
      </div>
    );
  }

  if (!showValues) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `3px solid ${color}`, borderRadius: 4, background: boxBg, padding: '6px 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{channel.toUpperCase()}</span>
        <span style={{ fontSize: 9, color: statusText }}>● Connected</span>
      </div>
    );
  }

  return (
    <div style={{ borderLeft: `3px solid ${color}`, borderRadius: 4, background: boxBg, padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${gridLine}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{channel.toUpperCase()}</span>
        <span style={{ fontSize: 9, color: statusText }}>● Connected</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: gridLine, borderRadius: 3, overflow: 'hidden' }}>
        <MeasurementCell math={`V_{\\text{rms}} = ${measurements!.vrms.toFixed(2)}\\ \\text{V}`} bg={boxBg} text={cellText} />
        <MeasurementCell math={`V_{\\text{dc}} = ${measurements!.vdc.toFixed(2)}\\ \\text{V}`} bg={boxBg} text={cellText} />
        <MeasurementCell math={`V_{\\text{pp}} = ${measurements!.vpp.toFixed(2)}\\ \\text{V}`} bg={boxBg} text={cellText} />
        <MeasurementCell math={`f = ${measurements!.frequency.toFixed(1)}\\ \\text{Hz}`} bg={boxBg} text={cellText} />
      </div>
    </div>
  );
}

function MeasurementCell({ math, bg, text }: { math: string; bg: string; text: string }) {
  return (
    <div style={{ background: bg, padding: '6px 4px', textAlign: 'center', fontSize: 10.5, color: text }}>
      <V3Math math={math} />
    </div>
  );
}
