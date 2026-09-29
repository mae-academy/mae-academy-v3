import { useTranslation } from 'react-i18next';
import React from 'react';
import { V3Math } from '@/components/ui/V3Math';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';

/* Unified signature gradient (pure horizontal left-to-right from blue-600 through purple to rose). */
export const TAB_GRADIENT = 'linear-gradient(to right, #2563EB, #7C3AED, #E11D48)';
export const TAB_ACTIVE_SHADOW = '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)';

export const CONTROL_SYSTEMS_HEADING = 'text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white';

export interface WorkspaceShortcut {
  key: string;
  label: string;
}

/** Canonical workspace shortcuts list; every binding listed is implemented by both studios. */
export const WORKSPACE_SHORTCUTS: ReadonlyArray<WorkspaceShortcut> = [
  { key: 'Space', label: 'Rotate' },
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
      className={isActive ? "btn-active-brand" : ""}
      style={{
        border: isActive ? 'none' : `1px solid ${colors.line}`,
        background: isActive ? undefined : colors.panelAlt,
        color: isActive ? '#ffffff' : disabled ? colors.subtle : colors.muted,
        borderRadius: 9999,
        padding: '6px 14px',
        minHeight: 32,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: isActive ? '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)' : 'none',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        transition: 'all 0.2s ease-in-out',
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
        <div className="mae-i18n-text text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{title}</div>
        <div className="mae-i18n-text text-slate-600 dark:text-slate-400" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.25 }}>{subtitle}</div>
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

const INSPECTOR_TERMS: Record<string, Record<string, string>> = {
  ar: {"Clock Period (ms)": "دورة الساعة (ms)", "Clock Period": "دورة الساعة", "Color": "اللون", "Component": "المكوّن", "Content": "المحتوى", "Initial State": "الحالة الابتدائية", "Input Count": "عدد المداخل", "Instance label": "تسمية العنصر", "Logic Meaning": "المعنى المنطقي", "Logic properties": "الخصائص المنطقية", "Logic state": "الحالة المنطقية", "Logic State": "الحالة المنطقية", "Move": "إزاحة", "Reference": "المرجع", "Routing Mode": "نمط التوصيل", "Routing": "التوصيل", "Show Label": "إظهار التسمية", "Show Value": "إظهار القيمة", "Size": "الحجم", "Text properties": "خصائص النص", "Toggle key": "مفتاح التبديل", "Trigger Edge": "حافة التفعيل", "Bit Width": "عرض البت", "Selector Count": "عدد خطوط الاختيار", "Divide By": "القسمة على", "Auto reference prefix": "بادئة المرجع التلقائية"},
  es: {"Clock Period (ms)": "Periodo de reloj (ms)", "Clock Period": "Periodo de reloj", "Color": "Color", "Component": "Componente", "Content": "Contenido", "Initial State": "Estado inicial", "Input Count": "Número de entradas", "Instance label": "Etiqueta de instancia", "Logic Meaning": "Significado lógico", "Logic properties": "Propiedades lógicas", "Logic state": "Estado lógico", "Logic State": "Estado lógico", "Move": "Mover", "Reference": "Referencia", "Routing Mode": "Modo de trazado", "Routing": "Trazado", "Show Label": "Mostrar etiqueta", "Show Value": "Mostrar valor", "Size": "Tamaño", "Text properties": "Propiedades del texto", "Toggle key": "Tecla de conmutación", "Trigger Edge": "Flanco de disparo", "Bit Width": "Ancho de bits", "Selector Count": "Líneas de selección", "Divide By": "Dividir por", "Auto reference prefix": "Prefijo de referencia automático"},
};

/** Localises shared inspector captions; unknown captions (and English) pass through unchanged. */
export function useInspectorText() {
  const { i18n } = useTranslation();
  const table = INSPECTOR_TERMS[(i18n.language || 'en').slice(0, 2)];
  return (label: string) => table?.[label] ?? label;
}

export function InspectorSection({ colors, label, children }: { colors: Palette; label: string; children: React.ReactNode }) {
  const tx = useInspectorText();
  return (
    <section style={{ padding: '12px 15px', borderBottom: `1px solid ${colors.line}` }}>
      <div className="mae-panel-section-header mae-i18n-text" style={{ marginBottom: 8 }}>{tx(label)}</div>
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
  const tx = useInspectorText();
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 156px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <span className="mae-panel-field-label mae-i18n-text" style={{ lineHeight: 1.25 }}>
        <ElectricalLabel label={tx(label)} unit={unit} />
      </span>
      {children}
    </label>
  );
}

/** Fixed empty-state copy for the right panel's inspector slot (shared shell contract). */
export const INSPECTOR_EMPTY_STATE_TEXT = 'Select an element to inspect its properties.';
