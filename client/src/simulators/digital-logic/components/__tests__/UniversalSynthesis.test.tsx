// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';
import { installInProcessLogicApi, uninstallInProcessLogicApi } from '@/simulators/digital-logic/remote/test-utils';

beforeAll(installInProcessLogicApi);
afterAll(uninstallInProcessLogicApi);
afterEach(cleanup);

describe('UniversalSynthesis view', () => {
  it('renders the architecture selector, four pedagogical derivation stages, and read-only gate diagram without duplicate input', async () => {
    const { container } = render(<UniversalSynthesis />);
    // the derivation arrives from the serverless engine
    expect(await screen.findByText(/Final NAND Logic/)).toBeTruthy();
    const markup = container.innerHTML;
    expect(markup).not.toContain('id="synthesis-expression"');
    expect(markup).toContain('Target Universal Architecture');
    expect(markup).toContain('Convert to All-NAND');
    expect(markup).toContain('Original SOP Expression');
    expect(markup).toContain('Apply Double Inversion');
    expect(markup).toContain('Apply De Morgan');
    expect(markup).toContain('Load Circuit to Canvas');
    expect(markup).not.toContain('Universal-gate schematic');
    expect(markup).not.toContain('NAND-only gate schematic');
    expect(markup).not.toContain('READ-ONLY');
  });

  it('safely handles non-SOP expressions without crashing and presents educational error and conversion action', async () => {
    const { container } = render(<UniversalSynthesis expression="(A + B)' . C" />);
    expect(await screen.findByText(/All-NAND synthesis requires a Sum of Products expression/)).toBeTruthy();
    const markup = container.innerHTML;
    expect(markup).not.toContain('id="synthesis-expression"');
    expect(markup).toContain('Invalid Synthesis Source');
    expect(markup).toContain('Convert to Canonical SOP');
    // Canonical form is rendered as KaTeX math, never raw pseudo-syntax.
    expect(markup).not.toContain('~A*~B*C');
    expect(markup).toContain('katex');
    expect(markup).toContain('Pedagogical Derivation');
  });
});
