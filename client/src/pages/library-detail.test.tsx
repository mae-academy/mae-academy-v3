// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedBook } from '@/lib/bookSources';

const mocks = vi.hoisted(() => ({ fetchAnyBookById: vi.fn(), fetchRelatedFor: vi.fn() }));
vi.mock('@/lib/unifiedBooks', () => mocks);
vi.mock('@/components/RestrictedPdfViewer', () => ({ default: () => <div>viewer-stub</div> }));

import LibraryDetail from './LibraryDetail';

const base: UnifiedBook = {
  id: 'ol:OL1874294W', title: 'Modern control systems', authors: ['Richard C. Dorf'], year: 1967, downloads: 0,
  description: 'A classic textbook.', subjects: ['Control theory'], coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  archiveUrl: 'https://openlibrary.org/works/OL1874294W', pdfUrl: null, pdfTier: 0, source: 'openlibrary', hasPdf: false,
  detailUrl: '/library/ol%3AOL1874294W', sourceUrl: 'https://openlibrary.org/works/OL1874294W',
};
const related = { ...base, id: 'related-1', title: 'Related Book', description: 'Another book.', source: undefined, coverUrl: '' };

beforeEach(() => {
  mocks.fetchRelatedFor.mockResolvedValue([related]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LibraryDetail', () => {
  it('catalog record (Open Library): split layout with the preview-unavailable card, provider link, no download, See Also', async () => {
    mocks.fetchAnyBookById.mockResolvedValue(base);
    render(<LibraryDetail params={{ id: 'ol%3AOL1874294W' }} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Modern control systems' })).toBeTruthy();
    expect(mocks.fetchAnyBookById).toHaveBeenCalledWith('ol:OL1874294W', expect.anything()); // percent-decoded
    expect(screen.getByText('CATALOG RECORD')).toBeTruthy();
    expect(screen.getAllByText('Open Library').length).toBeGreaterThan(0);
    expect(screen.getByText('Description / Synopsis')).toBeTruthy();
    expect(screen.getByText('A classic textbook.')).toBeTruthy();

    expect(screen.getByText('In-Browser Preview Unavailable')).toBeTruthy();
    expect(screen.queryByText('viewer-stub')).toBeNull();
    expect(screen.queryByRole('button', { name: /Download Book PDF/ })).toBeNull();

    const providerLink = screen.getByRole('link', { name: /View on Open Library/ });
    expect(providerLink.getAttribute('href')).toBe('https://openlibrary.org/works/OL1874294W');
    expect(providerLink.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('link', { name: /Open Library Page/ })).toBeTruthy();

    expect(await screen.findByText('See Also / Related Books')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Details/ }).getAttribute('href')).toBe('/library/related-1');
    expect(screen.getByRole('link', { name: /Back to Search/ }).getAttribute('href')).toBe('/library');
  });

  it('readable Internet Archive book: viewer mounted and download button present', async () => {
    mocks.fetchAnyBookById.mockResolvedValue({ ...base, id: 'progit-en', source: 'archive', hasPdf: true, pdfTier: 3, pdfUrl: 'https://archive.org/download/progit-en/progit.pdf', sourceUrl: 'https://archive.org/details/progit-en' });
    render(<LibraryDetail params={{ id: 'progit-en' }} />);
    expect(await screen.findByText('viewer-stub')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download Book PDF/ })).toBeTruthy();
    expect(screen.getByText('FREE TO READ')).toBeTruthy();
    expect(screen.getAllByText(/Internet Archive Page/).length).toBeGreaterThan(0);
    expect(screen.queryByText('In-Browser Preview Unavailable')).toBeNull();
  });

  it('DOAB record without a cover renders cleanly and hides the empty cover image', async () => {
    mocks.fetchAnyBookById.mockResolvedValue({ ...base, id: 'doab:20.500_1', source: 'doab', coverUrl: '', sourceUrl: 'https://doi.org/10.5772/x' });
    const { container } = render(<LibraryDetail params={{ id: 'doab%3A20.500_1' }} />);
    expect(await screen.findByRole('link', { name: /View on DOAB/ })).toBeTruthy();
    expect(container.querySelector('header img')).toBeNull();
  });

  it('a related-books failure never hides the book; an unknown book shows the not-found state', async () => {
    mocks.fetchAnyBookById.mockResolvedValue(base);
    mocks.fetchRelatedFor.mockRejectedValue(new Error('archive down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<LibraryDetail params={{ id: 'ol:OL1874294W' }} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Modern control systems' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('See Also / Related Books')).toBeNull());
    cleanup();
    mocks.fetchAnyBookById.mockRejectedValue(new Error('Request failed (404)'));
    render(<LibraryDetail params={{ id: 'ol:OL404W' }} />);
    expect(await screen.findByText('Book Not Found')).toBeTruthy();
  });
});
