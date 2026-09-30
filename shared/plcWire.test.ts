import { describe, expect, it } from 'vitest';
import { applyDiff, canonicalJson, encodeDiff, flattenSnapshot, fromBase64, toBase64, unflattenSnapshot, WireError, type SnapshotShape } from './plcWire';

const rand = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

describe('diff codec', () => {
  it('round-trips random images against random bases', () => {
    const r = rand(7);
    for (let round = 0; round < 200; round++) {
      const n = Math.floor(r() * 400);
      const base = Uint8Array.from({ length: n }, () => (r() < 0.8 ? 0 : Math.floor(r() * 256)));
      const next = base.slice();
      for (let k = 0; k < Math.floor(r() * 20); k++) if (n > 0) next[Math.floor(r() * n)] = Math.floor(r() * 256);
      expect(applyDiff(base, encodeDiff(base, next))).toEqual(next);
    }
  });

  it('an idle 5 KB image costs a few bytes, and a single changed cell a few more', () => {
    const zeros = new Uint8Array(5120 + 3000);
    expect(encodeDiff(zeros, zeros).length).toBeLessThanOrEqual(3);
    const one = zeros.slice();
    one[5000] = 9;
    expect(encodeDiff(zeros, one).length).toBeLessThanOrEqual(8);
  });

  it('only touches changed cells: an edit the receiver made to a cell the sender left alone survives', () => {
    const base = new Uint8Array(16);
    const senderNext = base.slice();
    senderNext[3] = 7; // the server changed cell 3 only
    const receiverLocal = base.slice();
    receiverLocal[10] = 99; // the user edited cell 10 while the request was in flight
    const merged = applyDiff(receiverLocal, encodeDiff(base, senderNext));
    expect(merged[3]).toBe(7);
    expect(merged[10]).toBe(99);
  });

  it('rejects malformed diffs instead of reading or writing out of bounds', () => {
    const base = new Uint8Array(8);
    expect(() => applyDiff(base, Uint8Array.from([9]))).toThrow(WireError); // wrong total
    expect(() => applyDiff(base, Uint8Array.from([8, 0, 200]))).toThrow(WireError); // run past the end
    expect(() => applyDiff(base, Uint8Array.from([8, 0, 3, 1]))).toThrow(WireError); // truncated literal
    expect(() => applyDiff(base, Uint8Array.from([8, 0, 0]))).toThrow(WireError); // empty run (would loop)
    expect(() => applyDiff(base, Uint8Array.from([8, 0x80, 0x80, 0x80, 0x80, 0x80]))).toThrow(WireError); // varint too long
  });
});

describe('snapshot image', () => {
  const shape = (fill: (i: number) => number): SnapshotShape => ({
    profileId: 'P',
    bytes: { I: Uint8Array.from([1, 2]), Q: Uint8Array.from([3]), M: Uint8Array.from({ length: 4 }, (_, i) => fill(i)), V: Uint8Array.from({ length: 6 }, (_, i) => fill(i + 10)) },
    indexed: { T: { current: Uint16Array.from([0x1234, 0xffff, 0]), preset: Uint16Array.from([5, 6, 7]), status: Uint8Array.from([1, 0, 1]) }, C: { current: Uint16Array.from([9]), preset: Uint16Array.from([8]), status: Uint8Array.from([0]) } },
  });

  it('flatten/unflatten is lossless, including 16-bit values', () => {
    const s = shape((i) => i * 3);
    const back = unflattenSnapshot(s, flattenSnapshot(s));
    expect(back).toEqual(s);
  });

  it('refuses an image of the wrong size', () => {
    expect(() => unflattenSnapshot(shape(() => 0), new Uint8Array(3))).toThrow(WireError);
  });
});

describe('base64 and canonical JSON', () => {
  it('base64 round-trips all byte values', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
  });
  it('canonical JSON ignores key order and undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe(canonicalJson({ a: { d: [1, { x: 1, y: 2 }] }, b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});
