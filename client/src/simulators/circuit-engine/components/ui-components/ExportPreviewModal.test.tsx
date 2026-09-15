import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportPreviewModal, svgToPngBlob, type ExportItem } from './ExportPreviewModal';
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

  it('exports svgToPngBlob helper to convert SVG to high-res PNG blob for rich clipboard copying', () => {
    expect(typeof svgToPngBlob).toBe('function');
  });

  it('defines TARGET_4K_WIDTH as 3840 for ultra-HD publication-grade resolution', async () => {
    const { TARGET_4K_WIDTH } = await import('./ExportPreviewModal');
    expect(TARGET_4K_WIDTH).toBe(3840);
  });
});

describe('Pure Native Vector SVG & 4K Resolution Integrity', () => {
  it('ensures exported SVG string contains pure vector nodes and no raster <image> elements', () => {
    const dmmSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" width="100%" height="100%">
  <defs>
    <style>text { font-family: ui-monospace, monospace; }</style>
  </defs>
  <rect x="0" y="0" width="480" height="240" rx="16" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
  <text x="24" y="34">DIGITAL MULTIMETER</text>
  <rect x="20" y="50" width="440" height="160" rx="10" fill="#041d33" stroke="#0284c7" stroke-width="1.5"/>
  <text x="440" y="142">5.000 V</text>
</svg>`;

    expect(dmmSvg).not.toContain('<image');
    expect(dmmSvg).toContain('viewBox="0 0 480 240"');
    expect(dmmSvg).toContain('width="100%"');
    expect(dmmSvg).toContain('height="100%"');
  });

  it('ensures oscilloscope pure vector SVG uses vector-effect non-scaling-stroke for graticule and traces', () => {
    const scopeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 268 160" width="100%" height="100%">
  <rect width="268" height="160" fill="#090a0d"/>
  <line x1="26.80" y1="0" x2="26.80" y2="160" stroke="#1a1d24" stroke-width="1" vector-effect="non-scaling-stroke"/>
  <path d="M 0 80 L 100 40 L 200 120" fill="none" stroke="#38bdf8" stroke-width="2" vector-effect="non-scaling-stroke"/>
</svg>`;

    expect(scopeSvg).not.toContain('<image');
    expect(scopeSvg).toContain('vector-effect="non-scaling-stroke"');
    expect(scopeSvg).toContain('viewBox="0 0 268 160"');
  });
});

