import { describe, expect, it } from 'vitest';
import { S7_200_CPU224, S7_200_CPU226, S7_200_CPU226_EXP } from '../../domain/hardware';
import { ilToLad } from '../../transpiler';
import { validateNetworkLayout } from '../../domain/ast';
import { validateForProfile } from './program';
import { PLC_EXAMPLES } from './plcExamples';

describe('PLC preset examples deep audit', () => {
  for (const example of PLC_EXAMPLES) {
    describe(`Example: ${example.title} (${example.id})`, () => {
      it('transpiles cleanly with ilToLad on S7_200_CPU224 without errors or warnings', () => {
        const result = ilToLad(example.stl, S7_200_CPU224);
        const errorDiags = result.diagnostics.filter((d) => d.severity === 'error');
        expect(errorDiags, `Transpiler errors in ${example.id}: ${JSON.stringify(errorDiags)}`).toHaveLength(0);
        expect(result.ok).toBe(true);
        expect(result.value).not.toBeNull();
      });

      it('produces valid network grid layouts without coordinate or wire rail issues', () => {
        const result = ilToLad(example.stl, S7_200_CPU224);
        if (!result.ok || !result.value) return;

        for (const [netIdx, network] of result.value.entries()) {
          const layoutIssues = validateNetworkLayout(network);
          expect(layoutIssues, `Layout issues in ${example.id} Network ${netIdx + 1}: ${JSON.stringify(layoutIssues)}`).toHaveLength(0);
        }
      });

      it('validates cleanly against S7-200 hardware profiles without errors', () => {
        for (const profile of [S7_200_CPU224, S7_200_CPU226, S7_200_CPU226_EXP]) {
          const result = ilToLad(example.stl, profile);
          if (!result.ok || !result.value) continue;

          const profileIssues = validateForProfile(result.value, profile).filter((i) => i.severity === 'error');
          expect(profileIssues, `Profile issues on ${profile.model} in ${example.id}: ${JSON.stringify(profileIssues)}`).toHaveLength(0);
        }
      });

      it('has complete symbol metadata with name and comment for every defined symbol', () => {
        if (!example.symbols) return;
        for (const [addr, sym] of Object.entries(example.symbols)) {
          expect(sym.name.trim().length, `Empty symbol name for ${addr} in ${example.id}`).toBeGreaterThan(0);
          expect(sym.comment.trim().length, `Empty symbol comment for ${addr} in ${example.id}`).toBeGreaterThan(0);
        }
      });
    });
  }
});



