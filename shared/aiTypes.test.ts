import { describe, expect, it } from 'vitest';
import { stripLegacySchematicTag } from './aiTypes';

const TAG = '[GENERATE_SCHEMATIC: A buck converter, [labelled] nodes]';

describe('stripLegacySchematicTag', () => {
  it('removes a complete legacy tag and keeps the surrounding text', () => {
    expect(stripLegacySchematicTag(`Netlist below.\n\n${TAG}`)).toBe('Netlist below.');
    expect(stripLegacySchematicTag(`Before.\n${TAG}\nAfter.`)).toBe('Before.\n\nAfter.');
    expect(stripLegacySchematicTag(`Answer.\n\n${TAG}\n\n[[SIM:power]]`)).toBe('Answer.\n\n[[SIM:power]]');
  });
  it('removes unclosed or partial tags', () => {
    expect(stripLegacySchematicTag('Text\n\n[GENERATE_SCHEMATIC: A crisp hi')).toBe('Text');
    expect(stripLegacySchematicTag('Text\n\n[GENERATE_')).toBe('Text');
  });
  it('leaves ordinary text and quoted tags alone', () => {
    expect(stripLegacySchematicTag('Plain answer')).toBe('Plain answer');
    expect(stripLegacySchematicTag('array a[1] and b[')).toBe('array a[1] and b[');
    expect(stripLegacySchematicTag('see a[GENERATE_SCHEMATIC: x] here')).toBe('see a[GENERATE_SCHEMATIC: x] here');
  });
  it('is idempotent', () => {
    const once = stripLegacySchematicTag(`X\n${TAG}\nY`);
    expect(stripLegacySchematicTag(once)).toBe(once);
  });
  it('also hides the retired illustration tag (complete, unclosed, partial)', () => {
    const img = '[GENERATE_IMAGE: Publication-grade technical illustration of motor types, labeled]';
    expect(stripLegacySchematicTag(`Types.\n\n${img}`)).toBe('Types.');
    expect(stripLegacySchematicTag(`Types.\n\n${img}\n[[SIM:power]]`)).toBe('Types.\n\n[[SIM:power]]');
    for (const tail of ['[GENERATE_IMAGE', '[GENERATE_IMAGE:', '[GENERATE_IMAGE: Publication-grade tech']) {
      expect(stripLegacySchematicTag(`Text.\n\n${tail}`), tail).toBe('Text.');
    }
    expect(stripLegacySchematicTag('see a[GENERATE_IMAGE: x] here')).toBe('see a[GENERATE_IMAGE: x] here');
  });
});
