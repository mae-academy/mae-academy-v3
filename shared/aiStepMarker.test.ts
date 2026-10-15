import { describe, expect, it } from 'vitest';
import { splitStepMarker, splitTrailingMarkers } from './aiTypes';

describe('splitStepMarker', () => {
  const cases: [string, string, { n: number; total: number } | null][] = [
    ['complete', 'Step one.\n[[STEP:2/5]]', { n: 2, total: 5 }],
    ['trailing whitespace', 'Step one.\n[[STEP:2/5]]  \n', { n: 2, total: 5 }],
    ['CRLF', 'Step one.\r\n[[STEP:1/4]]\r\n', { n: 1, total: 4 }],
    ['final step', 'Step one.\n[[STEP:4/4]]', { n: 4, total: 4 }],
    ['total below n is raised', 'Step one.\n[[STEP:3/2]]', { n: 3, total: 3 }],
    ['partial [[', 'Step one.\n[[', null],
    ['partial [[STE', 'Step one.\n[[STE', null],
    ['partial [[STEP:2', 'Step one.\n[[STEP:2', null],
    ['partial [[STEP:2/', 'Step one.\n[[STEP:2/', null],
    ['partial [[STEP:2/5]', 'Step one.\n[[STEP:2/5]', null],
  ];
  for (const [name, input, step] of cases) {
    it(`handles ${name}`, () => {
      const out = splitStepMarker(input);
      expect(out.step).toEqual(step);
      expect(out.text).toBe('Step one.');
    });
  }

  it('leaves prose with brackets alone', () => {
    for (const text of ['a[[STEP:1/2]] b', 'array x[[', 'no marker', 'The [[STEP:1/2]] is mid-text']) {
      expect(splitStepMarker(text)).toEqual({ text, step: null });
    }
  });

  it('cooperates with the simulator marker in either streaming state', () => {
    const full = 'Work.\n[[STEP:2/5]]\n[[SIM:circuits]]';
    expect(splitTrailingMarkers(full)).toEqual({ text: 'Work.', lab: 'circuits', step: { n: 2, total: 5 } });
    for (const partial of ['Work.\n[[STEP:2/5]]\n[[SI', 'Work.\n[[STEP:2/5]]\n[[']) {
      expect(splitTrailingMarkers(partial)).toEqual({ text: 'Work.', lab: null, step: { n: 2, total: 5 } });
    }
    expect(splitTrailingMarkers('Plain.')).toEqual({ text: 'Plain.', lab: null, step: null });
  });
});
