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
});
