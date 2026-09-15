import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportPreviewModal, type ExportItem } from './ExportPreviewModal';
import { getComponentsByCategory, getDef, COMPONENT_DEFS } from '@/simulators/circuit-engine/models/componentDefs';

describe('Part 1: Classic Control Components Hidden (UI Only)', () => {
  it('marks Classic Control components as hidden in component definitions', () => {
    expect(COMPONENT_DEFS['aux-contact-no']?.hidden).toBe(true);
    expect(COMPONENT_DEFS['aux-contact-3phase']?.hidden).toBe(true);
    expect(COMPONENT_DEFS['coil']?.hidden).toBe(true);
    expect(COMPONENT_DEFS['contactor']?.hidden).toBe(true);
  });

  it('filters out hidden Classic Control components from getComponentsByCategory', () => {
    const classicComponents = getComponentsByCategory('Classic Control');
    expect(classicComponents.length).toBe(0);

    const protectionComponents = getComponentsByCategory('Protection');
    expect(protectionComponents.some(c => c.id === 'contactor')).toBe(false);
  });

  it('still preserves definition and SPICE model logic via getDef', () => {
    expect(getDef('coil')).toBeDefined();
    expect(getDef('contactor')).toBeDefined();
    expect(getDef('aux-contact-no')).toBeDefined();
    expect(getDef('aux-contact-3phase')).toBeDefined();
  });
});

describe('Part 3: ExportPreviewModal Component', () => {
  it('does not render when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      <ExportPreviewModal
        isOpen={false}
        onClose={() => {}}
        items={[]}
        format="png"
      />
    );
    expect(markup).toBe('');
  });

  it('renders modal with MAE Academy dark theme and multiple preview items with correct filenames', () => {
    const testItems: ExportItem[] = [
      {
        id: 'circuit-main',
        title: 'Circuit Schematic',
        filename: 'circuit-1.png',
        format: 'png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 800,
        height: 600,
      },
      {
        id: 'scope-1',
        title: 'Live Oscilloscope (OSC-1)',
        filename: 'oscilloscope-1.png',
        format: 'png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 268,
        height: 160,
      },
      {
        id: 'dmm-1',
        title: 'Digital Multimeter (DMM-1)',
        filename: 'dmm-1.png',
        format: 'png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 480,
        height: 240,
      },
    ];

    const markup = renderToStaticMarkup(
      <ExportPreviewModal
        isOpen={true}
        onClose={() => {}}
        items={testItems}
        format="png"
      />
    );

    // Verify modal styling classes
    expect(markup).toContain('backdrop-blur-sm');
    expect(markup).toContain('dark:bg-[#0d0f12]');
    expect(markup).toContain('dark:border-[#1b2028]');
    expect(markup).toContain('rounded-2xl');

    // Verify filenames and headers
    expect(markup).toContain('circuit-1.png');
    expect(markup).toContain('oscilloscope-1.png');
    expect(markup).toContain('dmm-1.png');
    expect(markup).toContain('Circuit Schematic');
    expect(markup).toContain('Live Oscilloscope (OSC-1)');
    expect(markup).toContain('Digital Multimeter (DMM-1)');

    // Verify actions
    expect(markup).toContain('Copy');
    expect(markup).toContain('Save');
    expect(markup).toContain('Download All');
    expect(markup).toContain('bg-gradient-to-r from-blue-600 via-purple-600 to-rose-500');
  });

  it('renders Copy button for SVG export items and displays SVG filenames', () => {
    const svgItems: ExportItem[] = [
      {
        id: 'circuit-main',
        title: 'Circuit Schematic',
        filename: 'circuit-1.svg',
        format: 'svg',
        dataUrl: 'data:image/svg+xml;utf8,<svg></svg>',
        svgString: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      },
    ];

    const markup = renderToStaticMarkup(
      <ExportPreviewModal
        isOpen={true}
        onClose={() => {}}
        items={svgItems}
        format="svg"
      />
    );

    expect(markup).toContain('circuit-1.svg');
    expect(markup).toContain('Copy');
    expect(markup).toContain('Save');
  });
});
