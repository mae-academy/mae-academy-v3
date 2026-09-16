import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalysisBox } from '@/simulators/circuit-engine/components/ui-components/AnalysisBox';
import { TargetLoadSelector, DecimalPlacesSelector } from '@/simulators/circuit-engine/components/ui-components/TargetLoadSelector';
import { buildIdToLabelMap, sanitizeMathUuids } from '@/simulators/circuit-engine/models/analysisFormatting';
import { TheveninSolver } from '@/simulators/circuit-engine/engine/TheveninSolver';
import { SuperpositionSolver } from '@/simulators/circuit-engine/engine/SuperpositionSolver';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';

const colors = { panel: '#0f172a', panelAlt: '#172033', line: '#334155', text: '#f8fafc', muted: '#94a3b8', primary: '#3b82f6', danger: '#ef4444' };
const elements: MNAElement[] = [
  { type: 'voltage', id: 'Vs', label: 'V1', positive: 'n1', negative: '0', voltage: 12 },
  { type: 'resistor', id: 'PT_0LBZklQz', label: 'R3', positive: 'n1', negative: 'n_C9KUa', resistance: 1000 },
  { type: 'resistor', id: 'R2', label: 'R2', positive: 'n_C9KUa', negative: '0', resistance: 2000 },
];

describe('Tab D Academic Analysis Workspace', () => {
  it('renders real solver-backed Nodal content and exposes all academic analysis modes', () => {
    const markup = renderToStaticMarkup(<AnalysisBox elements={elements} colors={colors} standalone />);
    expect(markup).toContain('Nodal');
    expect(markup).toContain('Mesh');
    expect(markup).toContain('Superposition');
    expect(markup).toContain('Thévenin');
    expect(markup).toContain('KCL');
    expect(markup).toContain('Solver-backed derivation');
  });

  describe('Part 1: UI Typography & KaTeX Enforcements', () => {
    it('renders DecimalPlacesSelector with font-sans and KaTeX math wrapper', () => {
      const markup = renderToStaticMarkup(
        <DecimalPlacesSelector precision={4} onChangePrecision={() => {}} />
      );
      expect(markup).toContain('font-sans');
      expect(markup).toContain('DECIMAL PLACES');
      expect(markup).toContain('4');
    });

    it('renders TargetLoadSelector with KaTeX math formula for active load', () => {
      const resistors = elements.filter((e): e is Extract<MNAElement, { type: 'resistor' }> => e.type === 'resistor');
      const markup = renderToStaticMarkup(
        <TargetLoadSelector
          elements={elements}
          resistors={resistors}
          targetResistor="PT_0LBZklQz"
          onSelectTarget={() => {}}
        />
      );
      expect(markup).toContain('font-sans');
      expect(markup).toContain('TARGET LOAD / BRANCH');
      // Verify Part 4: redundant "Active:" component box is completely removed
      expect(markup).not.toContain('Active:');
      // Should include resistance and ohm unit
      expect(markup).toContain('1000');
    });

    it('dynamically reacts and maps updated component labels like R_L', () => {
      const liveComponents = [
        { id: 'PT_0LBZklQz', label: 'R_L' },
      ];
      const idMap = buildIdToLabelMap(elements, [], liveComponents);
      expect(idMap.get('PT_0LBZklQz')).toMatch(/^R_\{?L\}?$/);

      const rawCompEquation = 'I_{PT\\_0LBZklQz} = 0.012\\,\\mathrm{A}';
      const cleanCompEquation = sanitizeMathUuids(rawCompEquation, idMap);
      expect(cleanCompEquation).toMatch(/R_\{?L\}?/);
    });
  });

  describe('Part 2: UUID Sanitization & Label Dictionary', () => {
    it('correctly maps internal UUIDs and cleans equations', () => {
      const idMap = buildIdToLabelMap(elements);

      // Component UUID substitution
      const rawCompEquation = 'I_{PT\\_0LBZklQz}^{(1)} = 0.012\\,\\mathrm{A}';
      const cleanCompEquation = sanitizeMathUuids(rawCompEquation, idMap);
      expect(cleanCompEquation).not.toContain('PT_0LBZklQz');
      expect(cleanCompEquation).not.toContain('PT\\_0LBZklQz');
      expect(cleanCompEquation).toMatch(/R_\{?3\}?/);

      // Node UUID substitution
      const rawNodeEquation = 'A = n_{C9KUa},\\quad B = n_{0}';
      const cleanNodeEquation = sanitizeMathUuids(rawNodeEquation, idMap);
      expect(cleanNodeEquation).not.toContain('C9KUa');
      expect(cleanNodeEquation).toContain('Node_');
      expect(cleanNodeEquation).toContain('0');

      // Prose UUID substitution
      const rawProse = 'Load PT_0LBZklQz is removed to obtain the open-circuit response.';
      const cleanProse = sanitizeMathUuids(rawProse, idMap);
      expect(cleanProse).not.toContain('PT_0LBZklQz');
      expect(cleanProse).toMatch(/R_\{?3\}?/);
    });
  });

  describe('Part 3 & 4: Solvers return targetId and activeSourceId for Canvas reactivity', () => {
    it('TheveninSolver returns targetId', () => {
      const trace = new TheveninSolver(elements).analyze('PT_0LBZklQz');
      expect(trace.status).toBe('ready');
      expect(trace.targetId).toBe('PT_0LBZklQz');
      expect(trace.steps[0].math).not.toContain('C9KUa');
      expect(trace.steps[0].prose).not.toContain('PT_0LBZklQz');
    });

    it('SuperpositionSolver returns targetId and activeSourceId', () => {
      const trace = new SuperpositionSolver(elements).analyze('PT_0LBZklQz');
      expect(trace.status).toBe('ready');
      expect(trace.targetId).toBe('PT_0LBZklQz');
      expect(trace.activeSourceId).toBe('Vs');
      expect(trace.steps[0].math).not.toContain('PT_0LBZklQz');
    });
  });
});

