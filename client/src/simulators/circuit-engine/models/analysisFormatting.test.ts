import { describe, expect, it } from 'vitest';
import { compactMathNumbers } from '@/simulators/circuit-engine/models/analysisFormatting';

describe('academic math number compaction', () => {
  it('formats numerical literals without corrupting LaTeX identifiers or color macros', () => {
    const math = '\\textcolor{#3b82f6}{V_{1}}=12.340000\\,\\mathrm{V}\\qquad R_{12}=1000';
    const compacted = compactMathNumbers(math, 2);
    expect(compacted).toContain('#3b82f6');
    expect(compacted).toContain('V_{1}');
    expect(compacted).toContain('R_{12}');
    expect(compacted).toContain('12.34');
    expect(compacted).toContain('1000');
  });
});
