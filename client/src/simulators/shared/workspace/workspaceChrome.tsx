import React from 'react';
import { V3Math } from '@/components/ui/V3Math';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';

/* Unified signature gradient matching the Mesh tab button exactly (135deg from blue-600 through purple to rose). */
export const TAB_GRADIENT = 'linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #E11D48 100%)';
export const TAB_ACTIVE_SHADOW = '0 1px 3px rgba(2, 6, 23, 0.18)';

export const CONTROL_SYSTEMS_HEADING = 'text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white';

export interface WorkspaceShortcut {
  key: string;
  label: string;
}

/** Canonical workspace shortcuts list; every binding listed is implemented by both studios. */
export const WORKSPACE_SHORTCUTS: ReadonlyArray<WorkspaceShortcut> = [
  { key: 'R', label: 'Rotate' },
  { key: 'Del', label: 'Delete' },
  { key: 'Alt + Drag', label: 'Pan' },
  { key: 'Ctrl/Cmd + Z', label: 'Undo' },
  { key: 'Ctrl/Cmd + C/V', label: 'Copy/Paste' },
];

export interface ToolbarButtonProps {
  colors: Palette;
  icon?: React.ReactNode;
  label?: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  rounded?: boolean;
}

export function ToolbarButton({ colors, icon, label, title, onClick, active, disabled, rounded }: ToolbarButtonProps) {
  const isActive = Boolean(active) && !disabled;
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: isActive ? '1px solid transparent' : `1px solid ${colors.line}`,
        background: isActive ? TAB_GRADIENT : colors.panelAlt,
        color: isActive ? '#ffffff' : disabled ? colors.subtle : colors.muted,
        borderRadius: rounded ? 9999 : 8,
        padding: '6px 12px',
        minHeight: 32,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: isActive ? TAB_ACTIVE_SHADOW : 'none',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        transition: 'background .15s ease',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function ToolbarDivider({ colors }: { colors: Palette }) {
  return <span style={{ width: 1, height: 20, background: colors.line, margin: '0 1px', flexShrink: 0 }} />;
}

export interface InspectorHeaderProps {
  colors: Palette;
  title: React.ReactNode;
  subtitle: string;
}

export function InspectorHeader({ colors, title, subtitle }: InspectorHeaderProps) {
  return (
    <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${colors.line}` }}>
      <div>
        <div className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{title}</div>
        <div className="text-slate-600 dark:text-slate-400" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.25 }}>{subtitle}</div>
      </div>
    </div>
  );
}

export interface InspectorButtonProps {
  colors: Palette;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}

export function InspectorButton({ colors, children, onClick, danger, active, disabled }: InspectorButtonProps) {
  const tone = danger ? colors.danger : active ? colors.primary : colors.muted;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        minHeight: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: `1px solid ${tone}55`,
        borderRadius: 8,
        background: active || danger ? `${tone}0d` : colors.panelAlt,
        color: tone,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

export function InspectorSection({ colors, label, children }: { colors: Palette; label: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '12px 15px', borderBottom: `1px solid ${colors.line}` }}>
      <div className="mae-panel-section-header" style={{ marginBottom: 8 }}>{label}</div>
      {children}
    </section>
  );
}

export function ElectricalLabel({ label, unit }: { label: string; unit?: string }) {
  return (
    <>
      {label}
      {unit && <span style={{ marginInlineStart: 3, color: 'inherit' }}><V3Math math={`\\mathrm{${unit}}`} /></span>}
    </>
  );
}

export function PropertyRow({ colors, label, unit, children }: { colors: Palette; label: string; unit?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 156px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <span className="mae-panel-field-label" style={{ lineHeight: 1.25 }}>
        <ElectricalLabel label={label} unit={unit} />
      </span>
      {children}
    </label>
  );
}

/** Fixed empty-state copy for the right panel's inspector slot (shared shell contract). */
export const INSPECTOR_EMPTY_STATE_TEXT = 'Select an element to inspect its properties.';
