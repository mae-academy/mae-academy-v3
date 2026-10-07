// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import i18n from '@/i18n/config';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { ActiveElementProperties } from './ActiveElementProperties';
import { FluidAnalysisPanel } from './analysis/FluidAnalysisPanel';
import { defaultFluidProps, getFluidDefinition } from '../models/fluidCatalog';

afterEach(async () => {
  cleanup();
  await act(async () => { await i18n.changeLanguage('en'); });
});

const COLORS = { background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#fff', line: '#ddd', text: '#111', muted: '#666', subtle: '#999', primary: '#00f', accent: '#70f', danger: '#f00', selection: '#70f', grid: '#eee', wire: '#000', powered: '#00f', input: '#fff', shadow: '' } as unknown as Palette;
const EMOJI = /\p{Extended_Pictographic}/u;
const ARABIC = /[؀-ۿ]/;
const SNAPSHOT = new FluidEngine({ components: [], wires: [] }).getSnapshot();

function mountInspector(type: string) {
  const definition = getFluidDefinition(type)!;
  const component = { id: 'abc123', type, label: '1A1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: defaultFluidProps(definition) };
  return render(
    <I18nextProvider i18n={i18n}>
      <ActiveElementProperties component={component} definition={definition} colors={COLORS} sensorOptions={[]} onLabelChange={vi.fn()} onPropsChange={vi.fn()} />
      <FluidAnalysisPanel colors={COLORS} isDark={false} medium="PNEUMATIC" snapshot={SNAPSHOT} selected={undefined} initialTab="cutaway" />
    </I18nextProvider>,
  );
}

const visibleText = (root: HTMLElement) => root.textContent ?? '';
const labels = (root: HTMLElement) => Array.from(root.querySelectorAll('[aria-label]')).map(el => el.getAttribute('aria-label') ?? '');

describe('fluid studio language switching', () => {
  it.each([
    ['en', 'Cutaway Anatomy', 'Limit Switches', 'End-Position Cushioning'],
    ['ar', 'التشريح الداخلي', 'مفاتيح نهاية الشوط', 'تخميد نهاية الشوط'],
    ['es', 'Anatomía de Corte', 'Finales de Carrera', 'Amortiguación de Fin de Carrera'],
  ])('%s: tab, sections and parameters render in one language with no emoji', async (lang, tab, limits, cushioning) => {
    await act(async () => { await i18n.changeLanguage(lang); });
    const { container } = mountInspector('cylinder-double');
    const text = visibleText(container);
    expect(screen.getByRole('tab', { name: new RegExp(tab) })).toBeTruthy();
    expect(text).toContain(limits);
    expect(labels(container)).toContain(cushioning);
    expect(EMOJI.test(text)).toBe(false);
    if (lang !== 'en') expect(text).not.toContain('Cutaway');
    if (lang !== 'ar') expect(ARABIC.test(text)).toBe(false);
    // the dropdown shows the translated option while the stored value stays the engine token
    const select = container.querySelector('select[aria-label]') as HTMLSelectElement;
    expect(select.options[0].value).toBe('None');
  });

  it('ar: no English words survive in the inspector and the analysis panel', async () => {
    await act(async () => { await i18n.changeLanguage('ar'); });
    const { container } = mountInspector('cylinder-double');
    const words = (visibleText(container) + ' ' + labels(container).join(' ')).replace(/\b(S1|S2|1A1|bar|AND|OR)\b/g, '').match(/[A-Za-z]{3,}/g) ?? [];
    expect(words).toEqual([]);
  });
});
