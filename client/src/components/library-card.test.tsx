// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import LibraryBookCard from './LibraryBookCard';
import type { LibraryBook } from '@/lib/internetarchive';

afterEach(cleanup);

const book: LibraryBook = {
  id: 'my book-1',
  title: 'Higher Engineering Mathematics',
  authors: ['B. S. Grewal'],
  year: 2012,
  downloads: 315831,
  description: 'A classic textbook.',
  subjects: ['mathematics'],
  coverUrl: 'https://archive.org/services/img/my%20book-1',
  archiveUrl: 'https://archive.org/details/my%20book-1',
  pdfUrl: null,
  pdfTier: 3,
};
const variants = { hidden: {}, visible: {} };

describe('LibraryBookCard', () => {
  it('shows title, author, year, compact downloads and a Details link that opens a new tab', () => {
    render(<LibraryBookCard book={book} itemVariants={variants} />);
    expect(screen.getByRole('heading', { name: 'Higher Engineering Mathematics' })).toBeTruthy();
    expect(screen.getByText('B. S. Grewal')).toBeTruthy();
    expect(screen.getByText('2012')).toBeTruthy();
    expect(screen.getByText('315.8K downloads')).toBeTruthy();
    const details = screen.getByRole('link', { name: /Details/ });
    expect(details.getAttribute('href')).toBe('/library/my%20book-1');
    expect(details.getAttribute('target')).toBe('_blank');
    expect(details.getAttribute('rel')).toContain('noopener');
  });

  it('falls back from the cached cover to the direct cover, then to the placeholder', () => {
    const { container } = render(<LibraryBookCard book={book} itemVariants={variants} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/library/cover?id=my%20book-1');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(book.coverUrl);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull(); // placeholder mockup, no broken image
  });

  it('handles books without authors or year', () => {
    render(<LibraryBookCard book={{ ...book, authors: [], year: 0 }} itemVariants={variants} />);
    expect(screen.getByText('Various Authors')).toBeTruthy();
  });

  it('unified books: source badge, and Details ALWAYS stays on our own /library/:id route (new tab)', () => {
    render(
      <LibraryBookCard
        book={{ ...book, id: 'doab:20.500_1', coverUrl: '', downloads: 0, source: 'doab' }}
        itemVariants={variants}
      />,
    );
    expect(screen.getByText('DOAB')).toBeTruthy();
    expect(screen.getByText('Catalog entry')).toBeTruthy();
    const details = screen.getByRole('link', { name: /Details/ });
    expect(details.getAttribute('href')).toBe('/library/doab%3A20.500_1');
    expect(details.getAttribute('target')).toBe('_blank');
    expect(details.getAttribute('href')).not.toMatch(/^https?:/);
  });

  it('non-Archive ids skip the local cover cache and, without a cover URL, show the placeholder', () => {
    const { container } = render(<LibraryBookCard book={{ ...book, id: 'ol:OL1W', coverUrl: '', source: 'openlibrary' }} itemVariants={variants} />);
    expect(container.querySelector('img')).toBeNull();
    cleanup();
    const withCover = render(<LibraryBookCard book={{ ...book, id: 'ol:OL1W', coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg', source: 'openlibrary' }} itemVariants={variants} />);
    expect(withCover.container.querySelector('img')?.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/1-M.jpg');
  });

  it('plain Archive books keep the exact previous look (no badge, "0 downloads" stays)', () => {
    render(<LibraryBookCard book={{ ...book, downloads: 0 }} itemVariants={variants} />);
    expect(screen.queryByText('Archive')).toBeNull();
    expect(screen.getByText('0 downloads')).toBeTruthy();
  });
});
