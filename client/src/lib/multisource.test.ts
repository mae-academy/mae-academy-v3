import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOpenLibraryUrl, fetchOpenLibraryBooks, fetchOpenLibraryWork, mapOpenLibraryDoc, mapOpenLibraryWork, publicIaCandidates, uniqueNames } from './openlibrary';
import { buildDoabUrl, fetchDoabBookByHandle, fetchDoabBooks, mapDoabItem } from './doab';
import { fetchAnyBookById, fetchRelatedFor, fromArchive, mergeSources, normalizeTitle, relatedSeeds, searchAllBooks, usesExtraSources } from './unifiedBooks';
import { bookPath, cleanSubjects, doabHandleFromRef, doabIdFromHandle, parseBookRef, withDeadline, type UnifiedBook } from './bookSources';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status = 500) => ({ ok: false, status, json: async () => ({}) });

describe('Open Library mapping', () => {
  it('builds a sanitised search URL with an explicit field list', () => {
    const p = new URL(buildOpenLibraryUrl({ query: 'control "systems" (modern)', page: 2 })).searchParams;
    expect(p.get('q')).toBe('control systems modern');
    expect(p.get('limit')).toBe('15');
    expect(p.get('page')).toBe('2');
    expect(p.get('fields')).toContain('ebook_access');
  });

  it('a verified-readable work is handed to the Internet Archive pipeline by its ia id', () => {
    const book = mapOpenLibraryDoc({ key: '/works/OL1W', title: 'Modern Control Systems', subtitle: '11th ed', author_name: ['R. Dorf'], first_publish_year: 2008, cover_i: 87423, ia: ['moderncontrol00dorf'], ebook_access: 'public', subject: ['Control', 'Automation'] }, 'moderncontrol00dorf');
    expect(book).toMatchObject({
      id: 'moderncontrol00dorf',
      title: 'Modern Control Systems: 11th ed',
      authors: ['R. Dorf'],
      year: 2008,
      source: 'openlibrary',
      hasPdf: true,
      pdfTier: 3,
      detailUrl: '/library/moderncontrol00dorf',
      sourceUrl: 'https://openlibrary.org/works/OL1W',
      coverUrl: 'https://covers.openlibrary.org/b/id/87423-M.jpg',
      description: 'Control, Automation',
    });
  });

  it('everything else is a catalog entry that links to openlibrary.org and sorts last', () => {
    const book = mapOpenLibraryDoc({ key: '/works/OL2W', title: 'Fundamentals', publish_year: [1999], ebook_access: 'printdisabled', ia: ['x'] }, null);
    expect(book).toMatchObject({ id: 'ol:OL2W', hasPdf: false, pdfTier: 0, year: 1999, detailUrl: '/library/ol%3AOL2W', sourceUrl: 'https://openlibrary.org/works/OL2W', coverUrl: '' });
    expect(mapOpenLibraryDoc({ title: 'No key' }, null)).toBeNull();
    expect(mapOpenLibraryDoc({ key: '/works/OL3W' }, null)).toBeNull();
  });

  it('only public works contribute candidates to verify', () => {
    expect(publicIaCandidates({ ebook_access: 'public', ia: ['a', 'b', 'c', 'd'] })).toEqual(['a', 'b', 'c']);
    expect(publicIaCandidates({ ebook_access: 'borrowable', ia: ['a'] })).toEqual([]);
  });

  it('fetch: readable only when the backend confirms a real PDF; optimistic when the backend is down', async () => {
    const docs = [
      { key: '/works/OL1W', title: 'A', ebook_access: 'public', ia: ['bad-ia', 'good-ia'] },
      { key: '/works/OL2W', title: 'B', ebook_access: 'borrowable', ia: ['lend'] },
    ];
    const stub = (resolver: 'ok' | 'down') =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: unknown) => {
          if (String(input).includes('/api/library/resolve-pdfs')) {
            if (resolver === 'down') throw new Error('down');
            return ok({ results: { 'bad-ia': null, 'good-ia': 'https://archive.org/download/good-ia/f.pdf' } });
          }
          return ok({ numFound: 726, docs });
        }),
      );
    stub('ok');
    let result = await fetchOpenLibraryBooks({ query: 'x' });
    expect(result.totalCount).toBe(726);
    expect(result.books.map((b) => [b.id, b.hasPdf])).toEqual([['good-ia', true], ['ol:OL2W', false]]);
    stub('down');
    result = await fetchOpenLibraryBooks({ query: 'x' });
    expect(result.books[0]).toMatchObject({ id: 'bad-ia', hasPdf: true });
  });
});

describe('DOAB mapping', () => {
  const item = {
    handle: '20.500.12854/130855',
    name: 'Fallback name',
    metadata: [
      { key: 'dc.title', value: 'Applied Modern Control' },
      { key: 'dc.contributor.editor', value: 'Anh Tuan, Le' },
      { key: 'dc.date.issued', value: '2019-05-01' },
      { key: 'dc.description.abstract', value: '<p>Recent studies on <b>control</b>.</p>' },
      { key: 'oapen.identifier.doi', value: '10.5772/intechopen.75856' },
      { key: 'dc.identifier.uri', value: 'https://directory.doabooks.org/handle/20.500.12854/130855' },
      { key: 'dc.subject.other', value: 'simulation, iot; matlab' },
    ],
  };

  it('maps a DOAB record to a catalog entry: in-app route, DOI kept as the provider link', () => {
    expect(mapDoabItem(item)).toMatchObject({
      id: 'doab:20.500.12854_130855',
      title: 'Applied Modern Control',
      authors: ['Le Anh Tuan'],
      year: 2019,
      description: 'Recent studies on control .',
      subjects: ['simulation', 'iot', 'matlab'],
      source: 'doab',
      hasPdf: false,
      pdfTier: 0,
      detailUrl: '/library/doab%3A20.500.12854_130855',
      sourceUrl: 'https://doi.org/10.5772/intechopen.75856',
      coverUrl: '',
    });
  });

  it('falls back to the DOAB record page and to item.name; skips records without a handle', () => {
    const book = mapDoabItem({ handle: '1/2', name: 'Only name', metadata: [] });
    expect(book?.title).toBe('Only name');
    expect(book?.id).toBe('doab:1_2');
    expect(book?.detailUrl).toBe('/library/doab%3A1_2');
    expect(book?.sourceUrl).toBe('https://directory.doabooks.org/handle/1/2');
    expect(mapDoabItem({ name: 'x' })).toBeNull();
  });

  it('goes through our backend with an offset derived from the page', async () => {
    expect(buildDoabUrl({ query: 'control (systems)', page: 3 })).toBe('/api/library/doab?query=control+systems&limit=15&offset=30');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ not: 'an array' })));
    expect(await fetchDoabBooks({ query: 'x' })).toEqual([]);
  });
});

describe('unified aggregation', () => {
  const book = (id: string, title: string, source: UnifiedBook['source'], pdfTier: UnifiedBook['pdfTier'] = 0): UnifiedBook => ({
    id, title, authors: [], year: 2000, downloads: 0, description: '', subjects: [], coverUrl: '', archiveUrl: '', pdfUrl: null,
    pdfTier, source, hasPdf: pdfTier > 0, detailUrl: `/library/${id}`, sourceUrl: `https://example.org/${id}`,
  });

  it('only plain text searches use the extra sources', () => {
    expect(usesExtraSources({ query: 'modern control' })).toBe(true);
    expect(usesExtraSources({})).toBe(false);
    expect(usesExtraSources({ query: '!!!' })).toBe(false);
    expect(usesExtraSources({ query: 'x', category: 'Mechanics' })).toBe(false);
    expect(usesExtraSources({ query: 'x', language: 'ar' })).toBe(false);
    expect(usesExtraSources({ query: 'x', sort: 'newest' })).toBe(false);
  });

  it('title normalisation is Unicode-aware (non-Latin titles never collapse to an empty key)', () => {
    expect(normalizeTitle('Modern Control Systems, 11th Ed.')).toBe('moderncontrolsystems11thed');
    expect(normalizeTitle('ميكانيك تحليلي')).toBe('ميكانيكتحليلي');
    expect(normalizeTitle('!!!')).toBe('');
  });

  it('merge: removes repeats by id and by title across sources, but keeps editions inside one source', () => {
    const merged = mergeSources([
      [book('ia1', 'Modern Control Systems', 'archive', 3), book('ia2', 'Modern Control Systems', 'archive', 2)],
      [book('ia1', 'Modern Control Systems', 'openlibrary', 3), book('ol:1', 'MODERN control systems!', 'openlibrary'), book('ol:2', 'Other Book', 'openlibrary')],
      [book('doab:1', 'Modern Control Systems', 'doab'), book('doab:2', 'DOAB Only', 'doab')],
      [],
    ]);
    expect(merged.map((b) => b.id)).toEqual(['ia1', 'ia2', 'ol:2', 'doab:2']);
  });

  it('merge: books that open in-app come before catalog entries, best format first, order otherwise stable', () => {
    const merged = mergeSources([[book('a', 'A', 'archive', 2)], [book('b', 'B', 'openlibrary', 0), book('c', 'C', 'openlibrary', 3)], [book('d', 'D', 'doab')]]);
    expect(merged.map((b) => b.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  /** Routes each URL to a canned answer; `null` simulates that source being down. */
  const stubSources = (s: { archive?: unknown | null; ol?: unknown | null; doab?: unknown | null }) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        const answer = url.includes('archive.org/advancedsearch') ? s.archive : url.includes('openlibrary.org') ? s.ol : url.includes('/api/library/doab') ? s.doab : { results: {} };
        if (answer === null || answer === undefined) throw new Error('source down');
        return ok(answer);
      }),
    );
  const archiveAnswer = { response: { numFound: 1000, docs: [{ identifier: 'ia1', title: 'Modern Control Systems', format: ['Text PDF'] }] } };
  const olAnswer = { numFound: 726, docs: [{ key: '/works/OL9W', title: 'Modern Control Theory', ebook_access: 'no_ebook' }] };
  const doabAnswer = [{ handle: '1/1', name: 'Applied Modern Control', metadata: [{ key: 'dc.title', value: 'Applied Modern Control' }] }];

  it('all three sources: merged, deduped, readable first, total = archive + open library (not the page length)', async () => {
    stubSources({ archive: archiveAnswer, ol: olAnswer, doab: doabAnswer });
    const { books, totalCount } = await searchAllBooks({ query: 'modern control' });
    expect(books.map((b) => [b.source, b.hasPdf])).toEqual([['archive', true], ['openlibrary', false], ['doab', false]]);
    expect(totalCount).toBe(1726);
  });

  it.each([
    ['Open Library down', { archive: archiveAnswer, ol: null, doab: doabAnswer }, 2, 1000],
    ['DOAB down', { archive: archiveAnswer, ol: olAnswer, doab: null }, 2, 1726],
    ['both extras down', { archive: archiveAnswer, ol: null, doab: null }, 1, 1000],
    ['extras return nothing', { archive: archiveAnswer, ol: { numFound: 0, docs: [] }, doab: [] }, 1, 1000],
  ])('fail-safe: %s still returns the Internet Archive results', async (_label, sources, count, total) => {
    stubSources(sources);
    const { books, totalCount } = await searchAllBooks({ query: 'modern control' });
    expect(books).toHaveLength(count);
    expect(books[0].source).toBe('archive');
    expect(totalCount).toBe(total);
  });

  it('fail-safe: a hung extra source is dropped after its deadline instead of blocking the results', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown, init?: { signal?: AbortSignal }) => {
        const url = String(input);
        if (url.includes('archive.org/advancedsearch')) return Promise.resolve(ok(archiveAnswer));
        return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))); // never answers
      }),
    );
    const pending = searchAllBooks({ query: 'modern control' });
    await vi.advanceTimersByTimeAsync(8000);
    const { books } = await pending;
    expect(books.map((b) => b.source)).toEqual(['archive']);
  });

  it('archive failing does not hide the extras; everything failing surfaces the archive error', async () => {
    stubSources({ archive: null, ol: olAnswer, doab: doabAnswer });
    const partial = await searchAllBooks({ query: 'modern control' });
    expect(partial.books.map((b) => b.source)).toEqual(['openlibrary', 'doab']);
    expect(partial.totalCount).toBe(726);
    stubSources({ archive: null, ol: null, doab: null });
    await expect(searchAllBooks({ query: 'modern control' })).rejects.toThrow('source down');
  });

  it('filters / default view bypass the extras entirely (Internet Archive engine only, zero extra requests)', async () => {
    stubSources({ archive: archiveAnswer, ol: olAnswer, doab: doabAnswer });
    const { books } = await searchAllBooks({ category: 'Mechanics', query: 'beams' });
    expect(books.map((b) => b.source)).toEqual(['archive']);
    const calls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(calls.some((u) => u.includes('openlibrary.org') || u.includes('/api/library/doab'))).toBe(false);
  });

  it('fromArchive keeps every Internet Archive field and adds source / hasPdf / in-app detail path', () => {
    const converted = fromArchive({ id: 'a b', title: 'T', authors: [], year: 1, downloads: 5, description: '', subjects: [], coverUrl: '', archiveUrl: '', pdfUrl: null, pdfTier: 2 });
    expect(converted).toMatchObject({ id: 'a b', downloads: 5, source: 'archive', hasPdf: true, detailUrl: '/library/a%20b', sourceUrl: '' });
  });

  it('withDeadline rejects slow promises and passes fast ones through', async () => {
    vi.useFakeTimers();
    const slow = withDeadline(new Promise<string>(() => undefined), 100);
    const assertion = expect(slow).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    vi.useRealTimers();
    await expect(withDeadline(Promise.resolve('fast'), 100)).resolves.toBe('fast');
  });
});

describe('ids and routing', () => {
  it('every id becomes one URL-safe in-app path', () => {
    expect(bookPath('progit-en')).toBe('/library/progit-en');
    expect(bookPath('ol:OL1874294W')).toBe('/library/ol%3AOL1874294W');
    expect(bookPath(doabIdFromHandle('20.500.12854/130855'))).toBe('/library/doab%3A20.500.12854_130855');
  });

  it('parseBookRef resolves each prefix; unprefixed and ia: ids are Internet Archive identifiers', () => {
    expect(parseBookRef('ol:OL1W')).toEqual({ source: 'openlibrary', ref: 'OL1W' });
    expect(parseBookRef('doab:20.500.12854_130855')).toEqual({ source: 'doab', ref: '20.500.12854_130855' });
    expect(parseBookRef('progit-en')).toEqual({ source: 'archive', ref: 'progit-en' });
    expect(parseBookRef('ia:progit-en')).toEqual({ source: 'archive', ref: 'progit-en' });
    expect(doabHandleFromRef('20.500.12854_130855')).toBe('20.500.12854/130855');
  });

  it('cleanSubjects drops housekeeping tags', () => {
    expect(cleanSubjects(['Control theory', 'Accessible book', 'open_syllabus_project', 'In library', 'ab', 'Feedback control systems'])).toEqual(['Control theory', 'Feedback control systems']);
  });
});

describe('detail loaders', () => {
  const stubDetail = (routes: Record<string, unknown>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        const hit = Object.entries(routes).find(([fragment]) => url.includes(fragment));
        if (!hit) return { ok: false, status: 404, json: async () => ({}) };
        return ok(hit[1]);
      }),
    );

  it('Open Library work: metadata, author names, object-style description, no PDF, provider link kept', async () => {
    stubDetail({
      '/works/OL1874294W.json': { title: 'Modern control systems', description: { type: '/type/text', value: 'A classic.' }, first_publish_date: 'March 1967', covers: [-1, 87423], subjects: ['Control theory', 'Accessible book'], authors: [{ author: { key: '/authors/OL224406A' } }, { author: { key: '/authors/OL1A' } }] },
      '/authors/OL224406A.json': { name: 'Richard C. Dorf' },
    });
    const book = await fetchAnyBookById('ol:OL1874294W');
    expect(book).toMatchObject({
      id: 'ol:OL1874294W', title: 'Modern control systems', authors: ['Richard C. Dorf'], year: 1967, description: 'A classic.',
      subjects: ['Control theory'], pdfUrl: null, hasPdf: false, source: 'openlibrary',
      coverUrl: 'https://covers.openlibrary.org/b/id/87423-L.jpg', sourceUrl: 'https://openlibrary.org/works/OL1874294W', detailUrl: '/library/ol%3AOL1874294W',
    });
  });

  it('Open Library work: string / missing description and a failing author lookup never break the page', () => {
    expect(mapOpenLibraryWork({ title: 'T', description: 'plain text' }, [], 'OL2W').description).toBe('plain text');
    expect(mapOpenLibraryWork({ title: 'T', subjects: ['Robotics', 'Automation'] }, [], 'OL2W').description).toBe('Robotics, Automation');
    expect(mapOpenLibraryWork({}, [], 'OL2W').title).toBe('Untitled Book');
  });

  it('one person listed under several author records is shown once', () => {
    expect(uniqueNames(['Richard C. Dorf', 'Richard C Dorf', 'Robert H. Bishop', 'RICHARD C. DORF'])).toEqual(['Richard C. Dorf', 'Robert H. Bishop']);
    expect(uniqueNames(['', '...'])).toEqual([]);
  });

  it('rejects malformed ids before making any request', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchOpenLibraryWork('../etc')).rejects.toThrow('not an Open Library work id');
    await expect(fetchDoabBookByHandle('not a handle')).rejects.toThrow('not a DOAB handle');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('DOAB record: handle restored from the id, cover thumbnail taken from the bitstreams', async () => {
    stubDetail({
      '/api/library/doab-item?handle=20.500.12854%2F130855': {
        handle: '20.500.12854/130855', name: 'Applied Modern Control',
        metadata: [{ key: 'dc.title', value: 'Applied Modern Control' }, { key: 'oapen.identifier.doi', value: '10.5772/x' }],
        bitstreams: [{ bundleName: 'EXPORT', retrieveLink: '/rest/bitstreams/a/retrieve' }, { bundleName: 'THUMBNAIL', retrieveLink: '/rest/bitstreams/b/retrieve' }],
      },
    });
    const book = await fetchAnyBookById('doab:20.500.12854_130855');
    expect(book).toMatchObject({ id: 'doab:20.500.12854_130855', source: 'doab', pdfUrl: null, coverUrl: 'https://directory.doabooks.org/rest/bitstreams/b/retrieve', sourceUrl: 'https://doi.org/10.5772/x' });
  });

  it('a raw Internet Archive identifier still goes through the unchanged Internet Archive lookup', async () => {
    stubDetail({ 'archive.org/metadata/progit-en': { metadata: { identifier: 'progit-en', title: 'Pro Git' }, files: [{ name: 'progit.pdf', format: 'Text PDF', size: '9' }] } });
    const book = await fetchAnyBookById('progit-en');
    expect(book).toMatchObject({ id: 'progit-en', source: 'archive', hasPdf: true, pdfUrl: 'https://archive.org/download/progit-en/progit.pdf' });
  });

  it('unknown records surface an error instead of a blank page', async () => {
    stubDetail({});
    await expect(fetchAnyBookById('ol:OL9W')).rejects.toBeTruthy();
    await expect(fetchAnyBookById('doab:1.2_3')).rejects.toBeTruthy();
  });
});

describe('See Also for catalog records', () => {
  it('uses cleaned subjects, else meaningful title words', () => {
    expect(relatedSeeds({ title: 'X', subjects: ['Control theory', 'Accessible book', 'Robotics'] })).toEqual(['Control theory', 'Robotics']);
    expect(relatedSeeds({ title: 'Modern Control Systems and Their Applications', subjects: [] })).toEqual(['control', 'systems', 'their']);
    expect(relatedSeeds({ title: 'The Art', subjects: ['Accessible book'] })).toEqual([]);
  });

  it('fetchRelatedFor searches the Internet Archive with those seeds and never returns the record itself', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input).includes('/api/library/resolve-pdfs')) return ok({ results: { r1: 'https://archive.org/download/r1/f.pdf' } });
        return ok({ response: { numFound: 2, docs: [{ identifier: 'r1', title: 'Related One', format: ['Text PDF'] }, { identifier: 'r2', title: 'Related Two', format: ['Text PDF'] }] } });
      }),
    );
    const book: UnifiedBook = { id: 'ol:OL1W', title: 'Modern Control Systems', authors: [], year: 0, downloads: 0, description: '', subjects: ['Control theory'], coverUrl: '', archiveUrl: '', pdfUrl: null, pdfTier: 0, source: 'openlibrary', hasPdf: false, detailUrl: '', sourceUrl: '' };
    const related = await fetchRelatedFor(book);
    const searchUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(searchUrl.hostname).toBe('archive.org');
    expect(searchUrl.searchParams.get('q')).toContain('subject:("Control theory")');
    expect(related.map((b) => b.id)).toEqual(['r1', 'r2']);
  });
});
