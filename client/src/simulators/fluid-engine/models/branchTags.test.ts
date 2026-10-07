import { describe, expect, it } from 'vitest';
import { defaultFluidProps, getFluidDefinition } from './fluidCatalog';
import { MANUAL_TAG_PROP, inheritBranchTags } from './branchTags';

const part = (id: string, type: string, label: string, props: Record<string, unknown> = {}) => ({ id, type, label, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const pipe = (a: string, b: string) => ({ id: `${a}-${b}`, fromComp: a, fromTerm: '1', toComp: b, toTerm: '1', path: [], routing: 'orthogonal' as const });

describe('branch inheritance by wiring', () => {
  const cylinder = part('c2', 'cylinder-double', '2A1', { [MANUAL_TAG_PROP]: true });
  const drop = part('v', 'valve-5-2', '1V3');

  it('a freshly dropped valve piped to 2A1 joins circuit 2 as its next free valve', () => {
    expect(inheritBranchTags([cylinder, drop], [], pipe('v', 'c2'))).toEqual([{ id: 'v', label: '2V1' }]);
    expect(inheritBranchTags([cylinder, part('x', 'valve-3-2-nc', '2V1'), drop], [], pipe('c2', 'v'))).toEqual([{ id: 'v', label: '2V2' }]);
  });

  it('a piped part anchors its branch too, so a chain of valves continues the numbering', () => {
    const first = part('v1', 'valve-5-2', '2V1');
    expect(inheritBranchTags([first, drop], [pipe('v1', 'c2')], pipe('v1', 'v'))).toEqual([{ id: 'v', label: '2V2' }]);
  });

  it('a part that is already piped keeps its branch, so only a floating end is renumbered', () => {
    const settled = [pipe('v', 'other')];
    expect(inheritBranchTags([cylinder, drop, part('other', 'valve-3-2-nc', '1V1')], settled, pipe('v', 'c2'))).toEqual([]);
  });

  it('disconnecting and wiring elsewhere updates the prefix', () => {
    const one = part('c1', 'cylinder-double', '1A1');
    const three = part('c3', 'cylinder-double', '3A1', { [MANUAL_TAG_PROP]: true });
    expect(inheritBranchTags([one, three, drop], [], pipe('v', 'c3'))).toEqual([{ id: 'v', label: '3V1' }]); // the 1-wire was removed first
  });

  it('never touches hand-typed tags, energy parts or parts already in the branch', () => {
    expect(inheritBranchTags([cylinder, part('v', 'valve-5-2', '1V3', { [MANUAL_TAG_PROP]: true })], [], pipe('v', 'c2'))).toEqual([]);
    expect(inheritBranchTags([cylinder, part('s', 'service-unit', '0Z1')], [], pipe('s', 'c2'))).toEqual([]);
    expect(inheritBranchTags([cylinder, part('v', 'valve-5-2', '2V4')], [], pipe('v', 'c2'))).toEqual([]);
    expect(inheritBranchTags([part('s', 'pressure-source', '0Z1'), drop], [], pipe('s', 'v'))).toEqual([]); // supply (circuit 0) does not pull parts into 0
  });

  it('two untouched parts piped together stay as they are', () => {
    expect(inheritBranchTags([drop, part('w', 'valve-3-2-nc', '1V4')], [], pipe('v', 'w'))).toEqual([]);
    expect(inheritBranchTags([part('c', 'cylinder-double', '2A1'), drop], [], pipe('v', 'c'))).toEqual([]);
  });
});
