import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShareProjectModal } from './ShareProjectModal';

describe('ShareProjectModal Component', () => {
  it('does not render when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      <ShareProjectModal
        isOpen={false}
        onClose={() => {}}
        shareUrl="https://mae.academy/?project=abc"
        componentCount={5}
        wireCount={8}
      />
    );
    expect(markup).toBe('');
  });

  it('renders modal with backdrop, rounded-2xl container, and correct title', () => {
    const markup = renderToStaticMarkup(
      <ShareProjectModal
        isOpen={true}
        onClose={() => {}}
        shareUrl="https://mae.academy/?project=test-state"
        componentCount={7}
        wireCount={12}
        previewUrl="data:image/svg+xml;utf8,<svg></svg>"
      />
    );

    // Modal shell and backdrop
    expect(markup).toContain('z-[9999]');
    expect(markup).toContain('backdrop-blur-sm');
    expect(markup).toContain('rounded-2xl');

    // Title and stats
    expect(markup).toContain('Share Project');
    expect(markup).toContain('7 parts');
    expect(markup).toContain('12 wires');

    // Deep link input and copy button
    expect(markup).toContain('https://mae.academy/?project=test-state');
    expect(markup).toContain('Copy Link');

    // Preview image
    expect(markup).toContain('src="data:image/svg+xml;utf8,&lt;svg&gt;&lt;/svg&gt;"');
  });

  it('renders fallback schematic placeholder when no previewUrl is provided', () => {
    const markup = renderToStaticMarkup(
      <ShareProjectModal
        isOpen={true}
        onClose={() => {}}
        shareUrl="https://mae.academy/?project=empty"
        componentCount={0}
        wireCount={0}
        previewUrl={null}
      />
    );

    expect(markup).toContain('MAE Academy Schematic');
    expect(markup).toContain('0 parts');
    expect(markup).toContain('0 wires');
  });
});
