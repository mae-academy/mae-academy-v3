// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DigitalLogicSimulatorHome } from '@/simulators/digital-logic/components/pages/Home';

describe('DigitalLogicSimulatorHome (UnifiedWorkspaceShell wiring)', () => {
  it('renders the full shell-based workspace without throwing', () => {
    const markup = renderToStaticMarkup(<DigitalLogicSimulatorHome />);
    expect(markup).toContain('Component Library');
    expect(markup).toContain('Interactive Digital Logic Canvas');
    expect(markup).toContain('Logic Analysis Workspace');
    expect(markup).toContain('Active Element');
    expect(markup).toContain('Select an element to inspect its properties.');
    expect(markup).toContain('Canvas Ready');
    expect(markup).toContain('Digital Logic Lab');
    expect(markup).toContain('Workspace Shortcuts');
    expect(markup).toContain('Rotate');
    expect(markup).toContain('Space');
    expect(markup).toContain('Delete');
    expect(markup).toContain('KaTeX_Math');
  });
});
