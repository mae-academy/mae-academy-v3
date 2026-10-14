import { describe, expect, it } from 'vitest';
import { MAX_SCHEMATIC_PROMPT_CHARS, SCHEMATIC_TAG_REGEX, splitSchematicTag, splitSimMarker } from './aiTypes';

const PROMPT = 'A crisp high-contrast black-and-white electrical schematic of a 5V Buck converter, white background';
const TAG = `[GENERATE_SCHEMATIC: ${PROMPT}]`;

describe('splitSchematicTag', () => {
  it('extracts a complete trailing tag', () => {
    expect(splitSchematicTag(`Netlist below.\n\n${TAG}`)).toEqual({ text: 'Netlist below.', prompt: PROMPT });
    expect(SCHEMATIC_TAG_REGEX.test(TAG)).toBe(true);
  });

  it('removes a tag in the middle of the text and keeps what follows', () => {
    expect(splitSchematicTag(`Before.\n${TAG}\nAfter.`)).toEqual({ text: 'Before.\n\nAfter.', prompt: PROMPT });
  });

  it('returns null when there is no tag and leaves prose that merely mentions it', () => {
    expect(splitSchematicTag('Plain answer')).toEqual({ text: 'Plain answer', prompt: null });
    expect(splitSchematicTag('see a[GENERATE_SCHEMATIC: x] here').prompt).toBeNull();
    expect(splitSchematicTag('array a[1] and b[')).toEqual({ text: 'array a[1] and b[', prompt: null });
  });

  it('hides every partial tag while streaming', () => {
    for (const n of [1, 5, 10, 19, 20]) {
      expect(splitSchematicTag(`Text\n\n${TAG.slice(0, n)}`), String(n)).toEqual({ text: 'Text', prompt: null });
    }
    expect(splitSchematicTag(`Text\n\n[GENERATE_SCHEMATIC: A crisp hi`)).toEqual({ text: 'Text', prompt: null });
    expect(splitSchematicTag(`[GENERATE_`)).toEqual({ text: '', prompt: null });
    expect(splitSchematicTag(`Text\n\n${TAG.slice(0, -1)}`).text).toBe('Text');
  });

  it('cooperates with the simulator marker in either streaming state', () => {
    const full = `Answer.\n\n${TAG}\n[[SIM:power]]`;
    const sim = splitSimMarker(full);
    expect(sim.lab).toBe('power');
    expect(splitSchematicTag(sim.text)).toEqual({ text: 'Answer.', prompt: PROMPT });
    // partial marker after a complete tag
    const partialSim = splitSimMarker(`Answer.\n\n${TAG}\n[[SI`);
    expect(splitSchematicTag(partialSim.text)).toEqual({ text: 'Answer.', prompt: PROMPT });
    // tag called first with the marker still present
    expect(splitSchematicTag(full).prompt).toBe(PROMPT);
    expect(splitSchematicTag(full).text).toBe('Answer.\n\n[[SIM:power]]');
  });

  it('handles CRLF line endings', () => {
    expect(splitSchematicTag(`Answer.\r\n\r\n${TAG}\r\n`)).toEqual({ text: 'Answer.', prompt: PROMPT });
  });

  it('tolerates brackets inside the prompt and collapses whitespace', () => {
    const out = splitSchematicTag('X\n[GENERATE_SCHEMATIC: a [labelled]  node\tgraph ]');
    expect(out).toEqual({ text: 'X', prompt: 'a [labelled] node graph' });
  });

  it('caps the prompt length and uses the last tag when several appear', () => {
    const long = splitSchematicTag(`[GENERATE_SCHEMATIC: ${'x'.repeat(5000)}]`);
    expect(long.prompt).toHaveLength(MAX_SCHEMATIC_PROMPT_CHARS);
    const two = splitSchematicTag('a\n[GENERATE_SCHEMATIC: first one]\nb\n[GENERATE_SCHEMATIC: second one]');
    expect(two.prompt).toBe('second one');
    expect(two.text).toBe('a\n\nb');
  });
});
