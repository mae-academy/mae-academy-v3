import {
  ALL_BOOKS_CATEGORY,
  fetchBookById,
  fetchBooks,
  fetchRelatedBooks,
  sanitizeQuery,
  type FetchBooksParams,
  type LibraryBook,
} from './internetarchive';
import { fetchOpenLibraryBooks, fetchOpenLibraryWork } from './openlibrary';
import { fetchDoabBookByHandle, fetchDoabBooks } from './doab';
import { bookPath, cleanSubjects, doabHandleFromRef, parseBookRef, withDeadline, type BookSource, type UnifiedBook } from './bookSources';

export interface UnifiedBooksResult {
  books: UnifiedBook[];
  totalCount: number;
}

/** Per-source budget: a slow catalog is dropped rather than delaying the Internet Archive results. */
const OPEN_LIBRARY_DEADLINE_MS = 7000;
const DOAB_DEADLINE_MS = 5500;

/**
 * Open Library and DOAB only take part in plain text searches: they cannot apply our discipline / language / sort
 * semantics, so any filter or non-default sort keeps the (unchanged) Internet Archive engine on its own.
 */
export function usesExtraSources({ query = '', category = ALL_BOOKS_CATEGORY, language = 'all', sort = 'trending' }: FetchBooksParams): boolean {
  return sanitizeQuery(query) !== '' && category === ALL_BOOKS_CATEGORY && language === 'all' && sort === 'trending';
}

export const fromArchive = (book: LibraryBook): UnifiedBook => ({
  ...book,
  source: 'archive',
  hasPdf: book.pdfTier > 0,
  detailUrl: bookPath(book.id),
  sourceUrl: book.archiveUrl,
});

/** Unicode-aware, so Arabic / Chinese titles never collapse to an empty key. */
const NON_ALPHANUMERIC = new RegExp('[^\\p{L}\\p{N}]', 'gu'); // built at runtime: the tsconfig target predates the /u literal
export const normalizeTitle = (title: string): string => title.normalize('NFKD').toLowerCase().replace(NON_ALPHANUMERIC, '');

/**
 * Merges sources in priority order. Removes repeats by id, and drops a book when an EARLIER source already has the
 * same title (different editions inside one source are all kept: they are different files).
 */
export function mergeSources(sources: readonly (readonly UnifiedBook[])[]): UnifiedBook[] {
  const seenIds = new Set<string>();
  const titlesFromEarlierSources = new Set<string>();
  const merged: UnifiedBook[] = [];

  for (const source of sources) {
    const titlesInThisSource = new Set<string>();
    for (const book of source) {
      const key = normalizeTitle(book.title);
      if (seenIds.has(book.id) || (key !== '' && titlesFromEarlierSources.has(key))) continue;
      seenIds.add(book.id);
      if (key !== '') titlesInThisSource.add(key);
      merged.push(book);
    }
    titlesInThisSource.forEach((key) => titlesFromEarlierSources.add(key));
  }
  // Stable: books that open in-app first (best format first), catalog-only entries after them.
  return merged.sort((a, b) => b.pdfTier - a.pdfTier);
}

const settled = <T>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);

/**
 * Fail-safe multi-source search. Every source runs in parallel and independently; the search only fails when the
 * Internet Archive AND both extras fail. totalCount = Internet Archive + Open Library counts (DOAB reports none),
 * never the length of the merged page, so pagination keeps working.
 */
export async function searchAllBooks(params: FetchBooksParams, signal?: AbortSignal): Promise<UnifiedBooksResult> {
  if (!usesExtraSources(params)) {
    const archive = await fetchBooks(params, signal);
    return { books: archive.books.map(fromArchive), totalCount: archive.totalCount };
  }

  const query = params.query ?? '';
  const page = params.page ?? 1;
  const [archiveRes, olRes, doabRes] = await Promise.allSettled([
    fetchBooks(params, signal),
    withDeadline(fetchOpenLibraryBooks({ query, page }, signal), OPEN_LIBRARY_DEADLINE_MS),
    withDeadline(fetchDoabBooks({ query, page }, signal), DOAB_DEADLINE_MS),
  ]);

  const archive = settled(archiveRes);
  const openLibrary = settled(olRes);
  const doab = settled(doabRes);

  if (!archive && !openLibrary && !doab) {
    throw archiveRes.status === 'rejected' ? archiveRes.reason : new Error('No book source responded');
  }

  const books = mergeSources([archive?.books.map(fromArchive) ?? [], openLibrary?.books ?? [], doab ?? []]);
  return { books, totalCount: (archive?.totalCount ?? 0) + (openLibrary?.totalCount ?? 0) };
}

// ─── Detail page: one entry point for every source ─────────────────────────────────────────────────

/**
 * Resolves `/library/:id` for any source: `ol:OL123W` (Open Library work), `doab:<handle>` (DOAB record), otherwise an
 * Internet Archive identifier through the unchanged Internet Archive lookup.
 */
export async function fetchAnyBookById(id: string, signal?: AbortSignal): Promise<UnifiedBook> {
  const { source, ref } = parseBookRef(id);
  if (source === 'openlibrary') return fetchOpenLibraryWork(ref, signal);
  if (source === 'doab') return fetchDoabBookByHandle(doabHandleFromRef(ref), signal);
  return fromArchive(await fetchBookById(ref, signal));
}

const NON_WORD = new RegExp('[^\\p{L}\\p{N}]+', 'u'); // runtime-built: the tsconfig target predates the /u literal
const TITLE_STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'edition', 'introduction', 'volume', 'principles', 'basic', 'fundamentals', 'modern', 'advanced', 'applied', 'handbook', 'theory']);

/**
 * Search terms for "See Also". Catalog records often have no usable subjects, so fall back to the meaningful words
 * of the title; the related search itself always runs against the Internet Archive (books the reader can open).
 */
export function relatedSeeds(book: Pick<LibraryBook, 'subjects' | 'title'>): string[] {
  const subjects = cleanSubjects(book.subjects).slice(0, 3);
  if (subjects.length > 0) return subjects;
  const words = book.title.toLowerCase().split(NON_WORD).filter((w) => w.length >= 4 && !TITLE_STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 3);
}

export const fetchRelatedFor = (book: UnifiedBook, signal?: AbortSignal): Promise<LibraryBook[]> =>
  fetchRelatedBooks(relatedSeeds(book), book.id, signal);

export type { BookSource, UnifiedBook };
