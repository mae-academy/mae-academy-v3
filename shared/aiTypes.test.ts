import { describe, expect, it } from 'vitest';
import { IMAGE_TAG_REGEX, MAX_IMAGE_PROMPT_CHARS, splitImageTag, splitSimMarker, stripLegacySchematicTag } from './aiTypes';

const IMG_PROMPT = 'Publication-grade technical illustration of motor types, labeled components (stator, rotor).';
const IMG_TAG = `[GENERATE_IMAGE: ${IMG_PROMPT}]`;

describe('splitImageTag', () => {
  it('extracts a trailing tag and its prompt', () => {
    expect(splitImageTag(`Explanation.\n\n${IMG_TAG}`)).toEqual({ text: 'Explanation.', prompt: IMG_PROMPT });
  });
  it('cooperates with splitSimMarker called first', () => {
    const { text } = splitSimMarker(`Explanation.\n\n${IMG_TAG}\n[[SIM:power]]`);
    expect(splitImageTag(text)).toEqual({ text: 'Explanation.', prompt: IMG_PROMPT });
  });
  it('handles CRLF and brackets inside the prompt', () => {
    expect(splitImageTag('A.\r\n[GENERATE_IMAGE: draw a [motor] cutaway view]\r\n')).toEqual({ text: 'A.', prompt: 'draw a motor cutaway view' });
  });
  it('hides partial tags mid-stream with no prompt', () => {
    for (const tail of ['[', '[GENER', '[GENERATE_IMAGE', '[GENERATE_IMAGE:', '[GENERATE_IMAGE: Publication-grade tech']) {
      expect(splitImageTag(`Text.\n\n${tail}`), tail).toEqual({ text: 'Text.', prompt: null });
    }
  });
  it('leaves ordinary brackets alone and keeps the first of several tags', () => {
    expect(splitImageTag('array a[1] and b[')).toEqual({ text: 'array a[1] and b[', prompt: null });
    expect(splitImageTag('see a[GENERATE_IMAGE: x y z] here').prompt).toBeNull();
    expect(splitImageTag('A\n[GENERATE_IMAGE: first prompt here]\n[GENERATE_IMAGE: second prompt here]')).toEqual({ text: 'A', prompt: 'first prompt here' });
  });
  it('clamps the prompt, matches the strict regex and is idempotent', () => {
    expect(splitImageTag(`x\n[GENERATE_IMAGE: ${'a'.repeat(1500)}]`).prompt).toHaveLength(MAX_IMAGE_PROMPT_CHARS);
    expect(IMAGE_TAG_REGEX.exec(IMG_TAG)?.[1]).toBeTruthy();
    const once = splitImageTag(`X\n${IMG_TAG}\nY`).text;
    expect(splitImageTag(once)).toEqual({ text: once, prompt: null });
  });
});

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
