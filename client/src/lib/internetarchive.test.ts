import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ArchiveError,
  buildArchiveSearchUrl,
  buildDownloadUrl,
  computeBookPdfTier,
  fetchBookById,
  fetchBooks,
  fetchRelatedBooks,
  mapArchiveDoc,
  pickPdfFile,
  prioritizeBooks,
  sanitizeQuery,
  type ArchiveFile,
  type BookPdfTier,
} from './internetarchive';

afterEach(() => vi.unstubAllGlobals());

const params = (url: string) => new URL(url).searchParams;
const ok = (body: unknown) => ({ ok: true, json: async () => body });

describe('buildArchiveSearchUrl', () => {
  it('defaults: open texts only, engineering scope, trending sort, no text clause', () => {
    const p = params(buildArchiveSearchUrl({}));
    const q = p.get('q') ?? '';
    expect(q).toContain('mediatype:texts');
    expect(q).toContain('-access-restricted-item:true');
    expect(q).toContain('-collection:inlibrary');
    expect(q).toContain('-collection:magazine_rack');
    expect(q).toContain('subject:(engineering OR "computer science"');
    expect(p.getAll('sort[]')).toEqual(['week desc']);
    expect(p.get('rows')).toBe('24');
    expect(p.get('page')).toBe('1');
    expect(p.get('output')).toBe('json');
    expect(p.getAll('fl[]')).toContain('identifier');
  });

  it('adds category, language (both spellings) and sanitised text; keeps structure intact', () => {
    const q = params(buildArchiveSearchUrl({ category: 'Mechanics', language: 'ar', query: 'beams" OR (x:* -y)' })).get('q') ?? '';
    expect(q).toContain('subject:(mechanics OR statics');
    expect(q).toContain('language:(ara OR Arabic)');
    expect(q).toContain('(beams OR x y)');
    expect(q).not.toMatch(/[":*]\s*-y|x:\*/);
  });

  it('date sorts get a quality floor; other sorts do not', () => {
    expect(params(buildArchiveSearchUrl({ sort: 'newest' })).get('q')).toContain('downloads:[10 TO *]');
    expect(params(buildArchiveSearchUrl({ sort: 'earliest' })).getAll('sort[]')).toEqual(['date asc']);
    expect(params(buildArchiveSearchUrl({ sort: 'top_downloaded' })).get('q')).not.toContain('downloads:[10');
  });

  it('sanitizeQuery removes Lucene operators', () => {
    expect(sanitizeQuery('a+b -c "d" (e) [f] {g} ^h ~i *j ?k :l \\m /n')).toBe('a b c d e f g h i j k l m n');
  });
});

describe('PDF file selection', () => {
  const f = (name: string, format: string, size: number, extra: Partial<ArchiveFile> = {}): ArchiveFile => ({ name, format, size, ...extra });

  it('prefers Text PDF, then smaller size, and never a private or non-PDF file', () => {
    const picked = pickPdfFile([
      f('scan.pdf', 'Image Container PDF', 10),
      f('big.pdf', 'Text PDF', 900),
      f('small.pdf', 'Text PDF', 100),
      f('secret.pdf', 'Text PDF', 1, { private: 'true' }),
      f('book.epub', 'EPUB', 5),
    ]);
    expect(picked?.name).toBe('small.pdf');
    expect(pickPdfFile([f('a.epub', 'EPUB', 1)])).toBeNull();
    expect(pickPdfFile(undefined)).toBeNull();
  });

  it('encodes arbitrary file names, including sub-folders', () => {
    expect(buildDownloadUrl('my-book', 'Higher Engineering Maths (2nd).pdf')).toBe(
      'https://archive.org/download/my-book/Higher%20Engineering%20Maths%20(2nd).pdf',
    );
    expect(buildDownloadUrl('b', 'folder one/ü.pdf')).toBe('https://archive.org/download/b/folder%20one/%C3%BC.pdf');
  });
});

describe('mapArchiveDoc', () => {
  it('maps arrays/strings, cleans HTML, falls back to date for year, and derives cover + page URLs', () => {
    const book = mapArchiveDoc({
      identifier: 'abc def',
      title: ['First Title', 'Second'],
      creator: ['N/A', 'Ada Lovelace'],
      date: '1843-01-01T00:00:00Z',
      description: ['<p>Hello&nbsp;<b>world</b> &amp; more</p>', 'Second'],
      subject: 'engineering',
      downloads: 12,
      format: ['Text PDF', 'EPUB'],
    });
    expect(book).toMatchObject({
      id: 'abc def',
      title: 'First Title',
      authors: ['Ada Lovelace'],
      year: 1843,
      downloads: 12,
      subjects: ['engineering'],
      pdfUrl: null,
      pdfTier: 3,
      coverUrl: 'https://archive.org/services/img/abc%20def',
      archiveUrl: 'https://archive.org/details/abc%20def',
    });
    expect(book.description).toBe('Hello world & more\n\nSecond');
  });

  it('tiers the advertised formats', () => {
    expect(computeBookPdfTier(['EPUB', 'Text PDF'])).toBe(3);
    expect(computeBookPdfTier(['Image Container PDF'])).toBe(2);
    expect(computeBookPdfTier(['EPUB', 'DjVu'])).toBe(0);
    expect(computeBookPdfTier(undefined)).toBe(0);
  });

  it('prioritizeBooks is stable and drops nothing', () => {
    const input: { id: string; pdfTier: BookPdfTier }[] = [
      { id: 'a', pdfTier: 0 }, { id: 'b', pdfTier: 2 }, { id: 'c', pdfTier: 3 }, { id: 'd', pdfTier: 2 },
    ];
    expect(prioritizeBooks(input).map((b) => b.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(input.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('fetchers', () => {
  const doc = (id: string, format: string[]) => ({ identifier: id, title: `Book ${id}`, format });

  it('fetchBooks: dedupes, orders PDF-first, and keeps numFound as the total', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ response: { numFound: 807628, docs: [doc('a', ['EPUB']), doc('b', ['Text PDF']), doc('a', ['EPUB']), doc('c', ['Image Container PDF'])] } })));
    const { books, totalCount } = await fetchBooks({});
    expect(books.map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(totalCount).toBe(807628);
  });

  it('fetchBooks throws ArchiveError on HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchBooks({})).rejects.toBeInstanceOf(ArchiveError);
  });

  it('fetchBookById: resolves the real PDF, and returns none for restricted items', async () => {
    const meta = (restricted: boolean) => ({
      metadata: { identifier: 'x', title: 'X', 'access-restricted-item': restricted ? 'true' : undefined },
      files: [{ name: 'php.pdf', format: 'Text PDF', size: '5' }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(meta(false))));
    expect((await fetchBookById('x')).pdfUrl).toBe('https://archive.org/download/x/php.pdf');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(meta(true))));
    expect((await fetchBookById('x')).pdfUrl).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({})));
    await expect(fetchBookById('missing')).rejects.toMatchObject({ status: 404 });
  });

  /** archive.org search answers with 12 docs; the backend resolver confirms only ids in `confirmed`. */
  const stubRelated = (confirmed: string[] | 'down') => {
    const docs = Array.from({ length: 12 }, (_, i) => doc(`b${i}`, i % 3 === 0 ? ['EPUB'] : ['Text PDF']));
    const mock = vi.fn(async (input: unknown, init?: { body?: string }) => {
      if (String(input).includes('/api/library/resolve-pdfs')) {
        if (confirmed === 'down') throw new Error('backend down');
        const { ids } = JSON.parse(init?.body ?? '{}') as { ids: string[] };
        return ok({ results: Object.fromEntries(ids.map((id) => [id, confirmed.includes(id) ? `https://archive.org/download/${id}/f.pdf` : null])) });
      }
      return ok({ response: { numFound: 12, docs } });
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  };

  it('fetchRelatedBooks: excludes the current book, sends only PDF candidates, confirmed books first', async () => {
    const mock = stubRelated(['b8', 'b5']);
    const related = await fetchRelatedBooks(['machine design', 'engineering'], 'b1');
    const search = params(String(mock.mock.calls[0][0]));
    expect(search.get('rows')).toBe('41');
    expect(search.get('q')).toContain('subject:("machine design" OR engineering)');
    const sent = (JSON.parse(String(mock.mock.calls[1][1]?.body)) as { ids: string[] }).ids;
    expect(sent).not.toContain('b1');
    expect(sent).not.toContain('b0'); // b0 advertises no PDF
    expect(related.map((b) => b.id).slice(0, 2)).toEqual(['b5', 'b8']);
    expect(related[0].pdfUrl).toBe('https://archive.org/download/b5/f.pdf');
    expect(related).toHaveLength(4);
  });

  it('fetchRelatedBooks: degrades to the advertised-format order when the backend is unreachable', async () => {
    stubRelated('down');
    const related = await fetchRelatedBooks(['x-subject'], 'zzz');
    expect(related).toHaveLength(4);
    expect(related.every((b) => b.pdfTier === 3)).toBe(true);
    expect(related.every((b) => b.pdfUrl === null)).toBe(true);
  });
});
