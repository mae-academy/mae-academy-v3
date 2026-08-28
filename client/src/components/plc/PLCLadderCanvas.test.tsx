import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PLCLadderCanvas } from './PLCLadderCanvas';
import { addLadderParallelBranch, createInitialLadderDocument, createLadderInstruction, emptyLadderSelection } from './ladderEditorModel';

describe('PLCLadderCanvas DOM visual contract', () => {
  it('renders the documented DOM rail, wire, contact, coil and structured block hierarchy without SVG or Canvas', () => {
    const document = createInitialLadderDocument();
    const html = renderToStaticMarkup(<PLCLadderCanvas document={document} selection={emptyLadderSelection()} onSelect={() => undefined} onDeleteSelection={() => undefined}/>);
    expect(html).toContain('class="le-canvas"');
    expect(html).toContain('class="le-rung-tracks-grid"');
    expect(html).toContain('class="le-rung-main-rail"');
    expect(html).toContain('class="le-rung-end-rail"');
    expect(html).toContain('class="le-wire-line"');
    expect(html).toContain('class="le-contact-shape"');
    expect(html).toContain('class="le-coil-shape-side le-coil-shape-side-left"');
    expect(html).toContain('class="le-block-instruction-wrap"');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<canvas');
  });

  it('renders parallel paths as recursive branch columns with the required level boundaries', () => {
    const initial = createInitialLadderDocument(); const rung = initial.rungs[initial.rungIds[0]];
    const document = addLadderParallelBranch(initial, rung.circuit.id, 0, createLadderInstruction('XIO', ['AlternateStop']));
    const html = renderToStaticMarkup(<PLCLadderCanvas document={document} selection={emptyLadderSelection()} onSelect={() => undefined} onDeleteSelection={() => undefined}/>);
    expect(html).toContain('class="le-circuit-branch-group"');
    expect(html).toContain('class="le-circuit-branch-column"');
    expect((html.match(/le-circuit-branch-level-boundary/g) ?? [])).toHaveLength(3);
    expect(html).toContain('data-ladder-branch-id=');
  });
});
