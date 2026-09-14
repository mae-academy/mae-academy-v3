/* Student-facing "show your work" panels for the selected oscilloscope channel: how peak/Vpp and
   frequency are actually measured (using the real crossing detector, not a simplified stand-in that
   could disagree with the number shown elsewhere), plus a plain-language control reference. */
import { useState, type ReactNode } from 'react';
import type { SamplePoint } from '@/simulators/circuit-engine/models/circuitTypes';
import { risingCrossings } from '@/simulators/circuit-engine/engine/spice/spiceParser';
import { V3Math } from '@/components/ui/V3Math';

type PanelColors = { line: string; subtle: string; muted: string };
type Tool = 'peak' | 'frequency' | 'help' | null;

export function EducationalToolsPanel({ colors, samples, frequencyHz }: { colors: PanelColors; samples: SamplePoint[]; frequencyHz: number }) {
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const toggle = (tool: Tool) => setActiveTool(current => current === tool ? null : tool);

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.line}` }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <ToolButton colors={colors} icon="📈" label="Peak" active={activeTool === 'peak'} onClick={() => toggle('peak')} />
        <ToolButton colors={colors} icon="〰️" label="Frequency" active={activeTool === 'frequency'} onClick={() => toggle('frequency')} />
        <ToolButton colors={colors} icon="?" label="Help" active={activeTool === 'help'} onClick={() => toggle('help')} />
      </div>
      {activeTool === 'peak' && <PeakPanel colors={colors} samples={samples} onClose={() => setActiveTool(null)} />}
      {activeTool === 'frequency' && <FrequencyPanel colors={colors} samples={samples} frequencyHz={frequencyHz} onClose={() => setActiveTool(null)} />}
      {activeTool === 'help' && <HelpPanel colors={colors} onClose={() => setActiveTool(null)} />}
    </div>
  );
}

function ToolButton({ colors, icon, label, active, onClick }: { colors: PanelColors; icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '7px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
        border: `1px solid ${active ? '#2563eb' : colors.line}`,
        background: active ? '#2563eb' : '#fff',
        color: active ? '#fff' : '#334155',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
    </button>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ marginTop: 10, borderRadius: 6, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#2563eb', color: '#fff' }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{title}</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', opacity: 0.85 }}>✕</button>
      </div>
      <div style={{ padding: 12, fontSize: 11.5, color: '#1e293b', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <p style={{ background: '#fff8e1', borderLeft: '3px solid #fbc02d', borderRadius: 4, padding: '7px 10px', margin: '10px 0 0', fontSize: 10.5 }}>💡 {children}</p>;
}

function PeakPanel({ colors, samples, onClose }: { colors: PanelColors; samples: SamplePoint[]; onClose: () => void }) {
  if (samples.length === 0) {
    return <PanelShell title="📈 Peak measurement" onClose={onClose}><p>Channel not connected — nothing to measure yet.</p></PanelShell>;
  }
  let peakPositive = -Infinity;
  let peakNegative = Infinity;
  for (const sample of samples) {
    if (sample.value > peakPositive) peakPositive = sample.value;
    if (sample.value < peakNegative) peakNegative = sample.value;
  }
  const peakToPeak = peakPositive - peakNegative;
  const largest = Math.max(Math.abs(peakPositive), Math.abs(peakNegative), 1e-9);

  return (
    <PanelShell title="📈 How peak voltage is measured" onClose={onClose}>
      <p style={{ margin: '0 0 8px', fontStyle: 'italic', color: colors.muted }}>The scope scans every captured sample and keeps the highest and lowest values it sees.</p>
      <div style={{ background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <MeasureRow label="Peak +" value={`${peakPositive.toFixed(2)} V`} barWidth={Math.max(0, peakPositive) / largest} color="#22c55e" />
        <MeasureRow label="Peak −" value={`${peakNegative.toFixed(2)} V`} barWidth={Math.max(0, -peakNegative) / largest} color="#ef4444" />
        <div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Peak-to-peak</span><span>{peakToPeak.toFixed(2)} V</span>
        </div>
      </div>
      <div style={{ background: '#eff6ff', borderLeft: '3px solid #2563eb', borderRadius: 4, padding: 10, margin: '10px 0 0', textAlign: 'center' }}>
        <V3Math math={`V_{\\text{pp}} = V_{\\text{max}} - V_{\\text{min}} = ${peakToPeak.toFixed(2)}\\ \\text{V}`} />
      </div>
      <Tip>Adjust Volt/Div so the peaks fill most of the screen — a signal squeezed into a couple of pixels is hard to read accurately.</Tip>
    </PanelShell>
  );
}

function FrequencyPanel({ colors, samples, frequencyHz, onClose }: { colors: PanelColors; samples: SamplePoint[]; frequencyHz: number; onClose: () => void }) {
  if (samples.length === 0) {
    return <PanelShell title="〰️ Frequency measurement" onClose={onClose}><p>Channel not connected — nothing to measure yet.</p></PanelShell>;
  }
  // The exact same crossing detector the app's own frequency reading uses — this is the real
  // working, not a simplified stand-in that could disagree with the f shown next to the channel.
  const crossings = risingCrossings(samples.map(sample => sample.value), samples.map(sample => sample.time));
  const cycles = Math.max(0, crossings.length - 1);
  const duration = cycles > 0 ? crossings[crossings.length - 1] - crossings[0] : 0;

  return (
    <PanelShell title="〰️ How frequency is measured" onClose={onClose}>
      <p style={{ margin: '0 0 8px', fontStyle: 'italic', color: colors.muted }}>
        The scope finds every point where the signal rises through its own mid-level (not necessarily 0 V — that stays correct even with a DC offset), then divides whole cycles by the time between the first and last crossing.
      </p>
      <div style={{ background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Step n={1} text={<>Rising crossings found: <strong>{crossings.length}</strong></>} />
        <Step n={2} text={<>Whole cycles between them: <strong>{cycles}</strong></>} />
        <Step n={3} text={<>Time from first to last crossing: <strong>{duration.toFixed(6)} s</strong></>} />
      </div>
      <div style={{ background: '#eff6ff', borderLeft: '3px solid #2563eb', borderRadius: 4, padding: 10, margin: '10px 0 0', textAlign: 'center' }}>
        {cycles > 0
          ? <V3Math math={`f = \\dfrac{\\text{cycles}}{\\text{time}} = \\dfrac{${cycles}}{${duration.toFixed(6)}} = ${frequencyHz.toFixed(2)}\\ \\text{Hz}`} />
          : <V3Math math="\\text{Fewer than two crossings — no frequency to compute.}" />}
      </div>
      <Tip>Set Time/Div to show 2–3 complete cycles — too few and a single glitch throws the count off, too many and you're just measuring noise between them.</Tip>
    </PanelShell>
  );
}

function HelpPanel({ colors, onClose }: { colors: PanelColors; onClose: () => void }) {
  return (
    <PanelShell title="? Oscilloscope help" onClose={onClose}>
      <HelpSection colors={colors} title="⚙️ Controls">
        <li><strong>Channel</strong> — which probe (CH1–CH4) the sliders below edit.</li>
        <li><strong>Offset</strong> — shifts the trace up/down; range and step scale with Volt/Div.</li>
        <li><strong>Time/Div</strong> — horizontal zoom: how much time each of the 10 grid columns spans.</li>
        <li><strong>Volt/Div</strong> — vertical zoom: how many volts each of the 8 grid rows spans.</li>
        <li><strong>Time Shift</strong> — scrolls the visible window within what was actually captured.</li>
        <li><strong>Autoscale</strong> — picks Offset/Time-Div/Volt-Div automatically to fit the signal.</li>
      </HelpSection>
      <HelpSection colors={colors} title="📊 Measurements">
        <li><V3Math math="f" /> — cycles per second.</li>
        <li><V3Math math="V_{\text{rms}}" /> — root-mean-square, the DC-equivalent heating value of the AC signal.</li>
        <li><V3Math math="V_{\text{dc}}" /> — the signal's average (constant-offset) level.</li>
        <li><V3Math math="V_{\text{pp}}" /> — peak-to-peak, the full swing top to bottom.</li>
      </HelpSection>
      <HelpSection colors={colors} title="🎓 Tips" last>
        <li>Start with Autoscale, then fine-tune Time/Div and Volt/Div by hand.</li>
        <li>Use the Peak and Frequency tools above to see exactly how each number was computed.</li>
      </HelpSection>
    </PanelShell>
  );
}

function HelpSection({ colors, title, last, children }: { colors: PanelColors; title: string; last?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginBottom: last ? 0 : 10, paddingBottom: last ? 0 : 10, borderBottom: last ? 'none' : `1px solid ${colors.line}` }}>
      <div style={{ fontWeight: 700, marginBottom: 5 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>{children}</ul>
    </div>
  );
}

function Step({ n, text }: { n: number; text: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span>{text}</span>
    </div>
  );
}

function MeasureRow({ label, value, barWidth, color }: { label: string; value: string; barWidth: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 56, fontWeight: 600 }}>{label}</span>
      <span style={{ width: 68, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{value}</span>
      <span style={{ flex: 1, height: 10, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(1, barWidth)) * 100}%`, background: color }} />
      </span>
    </div>
  );
}
