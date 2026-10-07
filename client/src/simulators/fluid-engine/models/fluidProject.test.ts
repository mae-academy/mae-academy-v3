import { describe, expect, it, vi } from 'vitest';
import { defaultFluidProps, getFluidDefinition } from './fluidCatalog';
import { startStopExample } from './ladderExamples';
import { decodeSharePayload, encodeSharePayload, parseFluidProject, serializeFluidProject, type FluidProject } from './fluidProject';

const part = (id: string, type: string) => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: '1V1', props: defaultFluidProps(getFluidDefinition(type)!) });
const wire = { id: 'w1', fromComp: 'a', fromTerm: '1', toComp: 'b', toTerm: '2', path: [], routing: 'orthogonal' as const };
const project: FluidProject = { medium: 'PNEUMATIC', components: [part('a', 'cylinder-double'), part('b', 'cylinder-double')], wires: [wire], texts: [] };

describe('fluid project file', () => {
  it('round-trips a schematic', () => {
    expect(parseFluidProject(serializeFluidProject(project))).toEqual(project);
  });

  it('round-trips the relay ladder, also through a share link, and leaves old projects without one', () => {
    const ladder = startStopExample();
    expect(parseFluidProject(serializeFluidProject({ ...project, ladder })).ladder).toEqual(ladder);
    expect(parseFluidProject(decodeSharePayload(encodeSharePayload({ ...project, ladder }))).ladder).toEqual(ladder);
    expect(parseFluidProject(serializeFluidProject(project)).ladder).toBeUndefined();
  });

  it('drops a damaged ladder instead of failing the whole project', () => {
    const text = JSON.stringify({ ...JSON.parse(serializeFluidProject(project)), ladder: { paths: 'broken' } });
    expect(parseFluidProject(text).ladder).toEqual({ paths: [] });
  });

  it.each([
    ['garbage', 'nope', 'not valid JSON'],
    ['a foreign file', '{"components":[],"wires":[]}', 'not a fluid schematic file'],
    ['an unknown part', serializeFluidProject({ ...project, components: [part('a', 'cylinder-double'), { ...part('b', 'cylinder-double'), type: 'warp-drive' }] }), 'unknown component type'],
  ])('rejects %s', (_name, text, message) => {
    expect(() => parseFluidProject(text)).toThrow(message);
  });

  it('skips a pipe whose part is missing and keeps the rest of the schematic', () => {
    const warn = vi.fn();
    const loaded = parseFluidProject(serializeFluidProject({ ...project, components: [part('a', 'cylinder-double')] }), warn);
    expect(loaded.components).toHaveLength(1);
    expect(loaded.wires).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing component'));
  });

  it('keeps pipes that end on a T-junction pseudo-node', () => {
    const tapped = [
      { ...wire, id: 'w1', toComp: 'junc_abc123', toTerm: 'p' },
      { ...wire, id: 'w2', fromComp: 'junc_abc123', fromTerm: 'p' },
      { ...wire, id: 'w3', fromComp: 'a', toComp: 'junc_abc123', toTerm: 'p', junctionWireId: 'w1' },
    ];
    const warn = vi.fn();
    const loaded = parseFluidProject(serializeFluidProject({ ...project, wires: tapped }), warn);
    expect(loaded.wires).toEqual(tapped);
    expect(warn).not.toHaveBeenCalled();
  });

  it('round-trips a share-link payload and still reads raw JSON links', () => {
    const encoded = encodeSharePayload(project);
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(parseFluidProject(decodeSharePayload(encoded))).toEqual(project);
    expect(parseFluidProject(decodeSharePayload(serializeFluidProject(project)))).toEqual(project);
    expect(() => decodeSharePayload('!!')).toThrow('damaged');
  });
});
