import React, { useMemo } from 'react';
import type { EngineSnapshot } from '@shared/fluid/engine/types';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import type { FluidMedium } from '../../models/fluidCatalog';
import { CylinderCushionCutaway } from './CylinderCushionCutaway';
import { DualPressureCutaway } from './DualPressureCutaway';
import { ShuttleValveCutaway } from './ShuttleValveCutaway';
import { PressureGaugeCutaway } from './PressureGaugeCutaway';
import { QuickExhaustCutaway } from './QuickExhaustCutaway';
import { PressureValveCutaway } from './PressureValveCutaway';
import { CheckValveCutaway } from './CheckValveCutaway';
import { SpringCheckValveCutaway } from './SpringCheckValveCutaway';
import { FlowControlCutaway } from './FlowControlCutaways';
import { Spool22Cutaway } from './Spool22Cutaway';
import { Spool32Cutaway } from './Spool32Cutaway';
import { Spool42Cutaway } from './Spool42Cutaway';
import { Spool52Cutaway } from './Spool52Cutaway';
import { SingleActingCutaway } from './SingleActingCutaway';
import { Spool53Cutaway } from './Spool53Cutaway';
import { Spool43Cutaway } from './Spool43Cutaway';
import { AirReservoirCutaway } from './AirReservoirCutaway';
import { TimeDelayCutaway } from './TimeDelayCutaway';
import type { CutawayControl } from './cutawayControls';
import { analyzeCutaway, cutawayName, type CutawayAnalysis, type CutawayComponent, type StateTone } from './cutawayPhysics';
import { SANS, cutawayTheme } from './cutawayParts';
import { useFluidT } from '../../i18n/fluidText';

export interface CutawayViewerProps {
  component: CutawayComponent;
  snapshot: EngineSnapshot;
  medium: FluidMedium;
  colors: Palette;
  isDark: boolean;
  /** Sliders for the selected part, when it offers any. */
  controls?: CutawayControl[];
}

/** Brand palette: violet for tags and modes, industrial blue for pressure and live fluid, crimson for pilot / blocked states. */
const BRAND = { violet: '#7C3AED', blue: '#2563EB', crimson: '#E11D48' } as const;
const TONE_COLOR: Record<StateTone, string> = { idle: '#64748b', open: BRAND.blue, blocked: BRAND.crimson, active: BRAND.violet };

function Stage({ analysis, props }: { analysis: CutawayAnalysis; props: Pick<CutawayViewerProps, 'medium'> & { theme: ReturnType<typeof cutawayTheme> } }) {
  switch (analysis.kind) {
    case 'and': return <DualPressureCutaway analysis={analysis} {...props} />;
    case 'or': return <ShuttleValveCutaway analysis={analysis} {...props} />;
    case 'gauge': return <PressureGaugeCutaway analysis={analysis} {...props} />;
    case 'quickExhaust': return <QuickExhaustCutaway analysis={analysis} {...props} />;
    case 'regulator':
    case 'relief': return <PressureValveCutaway analysis={analysis} {...props} />;
    case 'check': return <CheckValveCutaway analysis={analysis} {...props} />;
    case 'springCheck': return <SpringCheckValveCutaway analysis={analysis} {...props} />;
    case 'throttle':
    case 'oneway': return <FlowControlCutaway analysis={analysis} {...props} />;
    case 'spool22': return <Spool22Cutaway analysis={analysis} {...props} />;
    case 'spool42': return <Spool42Cutaway analysis={analysis} {...props} />;
    case 'spool32': return <Spool32Cutaway analysis={analysis} {...props} />;
    case 'spool52': return <Spool52Cutaway analysis={analysis} {...props} />;
    case 'spool53': return <Spool53Cutaway analysis={analysis} {...props} />;
    case 'spool43': return <Spool43Cutaway analysis={analysis} {...props} />;
    case 'spool43float': return <Spool43Cutaway analysis={analysis} {...props} />;
    case 'cushion': return <CylinderCushionCutaway analysis={analysis} {...props} />;
    case 'single': return <SingleActingCutaway analysis={analysis} {...props} />;
    case 'reservoir': return <AirReservoirCutaway analysis={analysis} {...props} />;
    case 'timer': return <TimeDelayCutaway analysis={analysis} {...props} />;
  }
}

/**
 * Header (tag, state, live pressures), the mechanical stage and the plain-language flow
 * description of one component. Everything is derived from the snapshot, so the stage stays in
 * step with the running schematic.
 */
export function CutawayViewer({ component, snapshot, medium, colors, isDark, controls = [] }: CutawayViewerProps) {
  const tr = useFluidT();
  const analysis = useMemo(() => analyzeCutaway(component, snapshot, tr), [component, snapshot, tr]);
  const theme = useMemo(() => cutawayTheme(isDark), [isDark]);
  if (!analysis) return null;

  return (
    <div data-testid="cutaway-viewer" data-kind={analysis.kind} style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: colors.text }}>
          <span style={{ color: BRAND.violet }}>{component.label}</span> · {cutawayName(analysis.kind, tr)}
        </span>
        <span
          data-testid="cutaway-state"
          style={{ borderRadius: 9999, padding: '2px 10px', fontSize: 11, fontWeight: 600, color: TONE_COLOR[analysis.tone], border: `1px solid ${TONE_COLOR[analysis.tone]}55` }}
        >
          {analysis.state}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginInlineStart: 'auto' }} data-testid="cutaway-readings">
          {analysis.readings.map(reading => (
            <span key={reading.port} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.line}`, borderRadius: 8, padding: '2px 8px', fontFamily: SANS, fontSize: 11, color: colors.text }}>
              <span style={{ color: colors.muted }}>{reading.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: reading.bar > 0.01 ? BRAND.blue : colors.muted, fontWeight: 700 }}>{reading.bar.toFixed(1)} bar</span>
            </span>
          ))}
        </span>
      </header>

      {analysis.metrics && (
        <div data-testid="cutaway-metrics" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {analysis.metrics.map(metric => (
            <span key={metric.id} data-metric={metric.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, border: `1px solid ${colors.line}`, background: colors.panelAlt, borderRadius: 8, padding: '4px 10px', fontFamily: SANS, fontSize: 12, color: colors.text }}>
              <span style={{ color: colors.muted }}>{metric.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{metric.value}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ border: `1px solid ${colors.line}`, borderRadius: 12, background: colors.canvas, padding: 8 }}>
        <Stage analysis={analysis} props={{ medium, theme }} />
      </div>

      {controls.length > 0 && (
        <div data-testid="cutaway-controls" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {controls.map(control => (
            <label key={control.id} data-control={control.id} style={{ display: 'grid', gap: 4, fontFamily: SANS, fontSize: 12, color: colors.text }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{control.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{control.value} {control.unit}</span>
              </span>
              <input type="range" className="h-11 touch-pan-y sm:h-auto" aria-label={control.label} min={control.min} max={control.max} step={control.step} value={control.value} onChange={event => control.onChange(Number(event.target.value))} style={{ width: '100%', accentColor: colors.selection }} />
            </label>
          ))}
        </div>
      )}

      <p data-testid="cutaway-description" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: colors.text }}>{analysis.description}</p>
    </div>
  );
}
