import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { groupLabel, partName, useFluidT } from '../i18n/fluidText';
import type { FluidLibraryItem } from '../models/fluidCatalog';

/** Compact "Replace" button opening a searchable, categorised part list, as in the Circuit Studio inspector. */
export function ReplaceComponentControl({ colors, currentType, groups, onReplace }: { colors: Palette; currentType: string; groups: Record<string, FluidLibraryItem[]>; onReplace: (type: string) => void }) {
  const tr = useFluidT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => { if (container.current && !container.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const categories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return Object.entries(groups).flatMap(([group, items]) => {
      const matches = items.filter(item => item.id !== currentType && (!needle || partName(tr, item.id, item.name).toLowerCase().includes(needle)));
      return matches.length ? [[groupLabel(tr, group), matches] as const] : [];
    });
  }, [groups, currentType, query, tr]);

  return (
    <div ref={container} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        aria-label={tr('inspector.replace')}
        aria-expanded={open}
        title={tr('inspector.replaceTip')}
        onClick={() => setOpen(value => !value)}
        style={{ width: '100%', height: 32, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 12, border: `1px solid ${colors.line}`, background: colors.input, color: colors.text, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}
      >
        <RefreshCw size={13} style={{ flexShrink: 0, color: colors.muted }} />
        <span>{tr('inspector.replaceButton')}</span>
      </button>
      {open && (
        <div role="listbox" style={{ position: 'absolute', zIndex: 50, top: '100%', insetInlineEnd: 0, marginTop: 6, width: 260, maxHeight: 340, overflowY: 'auto', background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.35)', padding: 10 }}>
          <input autoFocus aria-label={tr('inspector.replaceSearch')} placeholder={tr('inspector.replaceSearch')} value={query} onChange={event => setQuery(event.target.value)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, marginBottom: 6, background: colors.input, color: colors.text, border: `1px solid ${colors.line}`, borderRadius: 12, padding: '4px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          {categories.map(([group, items]) => (
            <div key={group} style={{ marginBottom: 8 }}>
              <div className="mae-panel-section-header" style={{ padding: '4px 2px', fontSize: 10, opacity: 0.75 }}>{group}</div>
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => { onReplace(item.id); setOpen(false); setQuery(''); }}
                  className="hover:bg-slate-100 dark:hover:bg-slate-800/60"
                  style={{ width: '100%', textAlign: 'start', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                >
                  {partName(tr, item.id, item.name)}
                </button>
              ))}
            </div>
          ))}
          {categories.length === 0 && <div style={{ padding: 10, fontSize: 11, color: colors.subtle, textAlign: 'center' }}>{tr('inspector.replaceEmpty')}</div>}
        </div>
      )}
    </div>
  );
}
