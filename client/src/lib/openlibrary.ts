import { resolveBookPdfs, sanitizeQuery } from './internetarchive';
import { bookPath, cleanSubjects, fetchJsonWithTimeout, type UnifiedBook } from './bookSources';

/**
 * Open Library client (isolated). Findings that shape it (measured live):
 *  - Most `ia` identifiers are lending-library scans (`ebook_access` printdisabled / borrowable): only ~3% are public.
 *  - `{ia}/{ia}.pdf` is not a real file name, so readable books are handed to the Internet Archive pipeline by their
 *    `ia` id and the real PDF is confirmed through the existing resolver.
 *  - Everything else is a catalog entry: it sorts last and "Details" opens openlibrary.org.
 */

export interface OpenLibraryDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  publish_year?: number[];
  cover_i?: number;
  ia?: string[];
  ebook_access?: string;
  subject?: string[];
}

interface OpenLibraryResponse {
  numFound?: number;
  docs?: OpenLibraryDoc[];
}

export interface OpenLibraryParams {
  query: string;
  page?: number;
  limit?: number;
}

export interface OpenLibraryResult {
  books: UnifiedBook[];
  totalCount: number;
}

const SEARCH_URL = 'https://openlibrary.org/search.json';
const FIELDS = 'key,title,subtitle,author_name,first_publish_year,publish_year,cover_i,ia,ebook_access,subject';
const DEFAULT_LIMIT = 15;
const TIMEOUT_MS = 5000;
const IA_CANDIDATES_PER_DOC = 3;

export function buildOpenLibraryUrl({ query, page = 1, limit = DEFAULT_LIMIT }: OpenLibraryParams): string {
  const params = new URLSearchParams({ q: sanitizeQuery(query), limit: String(limit), page: String(page), fields: FIELDS });
  return `${SEARCH_URL}?${params.toString()}`;
}

/** IA identifiers worth verifying for a work that Open Library says is publicly readable. */
export const publicIaCandidates = (doc: OpenLibraryDoc): string[] =>
  doc.ebook_access === 'public' ? (doc.ia ?? []).slice(0, IA_CANDIDATES_PER_DOC) : [];

/** `readableIa` is the verified Internet Archive item for this work, or null for a catalog-only entry. */
export function mapOpenLibraryDoc(doc: OpenLibraryDoc, readableIa: string | null): UnifiedBook | null {
  if (!doc.key || !doc.title) return null;
  const workPath = doc.key;
  const pageUrl = `https://openlibrary.org${workPath}`;
  const readable = readableIa !== null;
  const id = readableIa ?? `ol:${workPath.replace(/^\/works\//, '')}`;
  const year = doc.first_publish_year ?? doc.publish_year?.[0] ?? 0;

  return {
    id,
    title: doc.subtitle ? `${doc.title}: ${doc.subtitle}` : doc.title,
    authors: doc.author_name ?? [],
    year: Number.isInteger(year) && year > 0 ? year : 0,
    downloads: 0,
    description: cleanSubjects(doc.subject).slice(0, 8).join(', '),
    subjects: cleanSubjects(doc.subject).slice(0, 12),
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
    archiveUrl: pageUrl,
    pdfUrl: null,
    pdfTier: readable ? 3 : 0,
    source: 'openlibrary',
    hasPdf: readable,
    detailUrl: bookPath(id),
    sourceUrl: pageUrl,
  };
}

// ─── Detail page: one Open Library work ─────────────────────────────────────────────────────────────

interface OpenLibraryWork {
  title?: string;
  subtitle?: string;
  description?: string | { value?: string };
  subjects?: string[];
  covers?: number[];
  first_publish_date?: string;
  authors?: { author?: { key?: string } }[];
}

const WORK_TIMEOUT_MS = 8000;

/** Open Library often has several author records for one person ("Richard C. Dorf" / "Richard C Dorf"). */
export const uniqueNames = (names: readonly string[]): string[] => {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const MAX_AUTHORS = 4;

export function mapOpenLibraryWork(work: OpenLibraryWork, authors: string[], workId: string): UnifiedBook {
  const id = `ol:${workId}`;
  const pageUrl = `https://openlibrary.org/works/${workId}`;
  const cover = work.covers?.find((c) => c > 0);
  const description = typeof work.description === 'string' ? work.description : work.description?.value ?? '';
  const year = Number(work.first_publish_date?.match(/\d{4}/)?.[0]);
  const subjects = cleanSubjects(work.subjects);

  return {
    id,
    title: work.subtitle ? `${work.title ?? 'Untitled Book'}: ${work.subtitle}` : work.title ?? 'Untitled Book',
    authors,
    year: Number.isInteger(year) && year > 0 ? year : 0,
    downloads: 0,
    description: description.trim().slice(0, 2000) || subjects.slice(0, 8).join(', '),
    subjects: subjects.slice(0, 12),
    coverUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : '',
    archiveUrl: pageUrl,
    pdfUrl: null, // a catalog record: there is no open direct PDF stream to hand to the viewer
    pdfTier: 0,
    source: 'openlibrary',
    hasPdf: false,
    detailUrl: bookPath(id),
    sourceUrl: pageUrl,
  };
}

/** `workId` is the bare key, e.g. `OL1874294W`. Author names are looked up in parallel and never block the page. */
export async function fetchOpenLibraryWork(workId: string, signal?: AbortSignal): Promise<UnifiedBook> {
  if (!/^OL\d+W$/.test(workId)) throw new Error(`"${workId}" is not an Open Library work id`);
  const work = await fetchJsonWithTimeout<OpenLibraryWork>(`https://openlibrary.org/works/${workId}.json`, WORK_TIMEOUT_MS, signal);

  const authorKeys = (work.authors ?? []).flatMap((a) => (a.author?.key && /^\/authors\/OL\d+A$/.test(a.author.key) ? [a.author.key] : [])).slice(0, MAX_AUTHORS);
  const names = await Promise.allSettled(authorKeys.map((key) => fetchJsonWithTimeout<{ name?: string }>(`https://openlibrary.org${key}.json`, WORK_TIMEOUT_MS, signal)));
  const authors = uniqueNames(names.flatMap((n) => (n.status === 'fulfilled' && n.value.name ? [n.value.name] : [])));
  return mapOpenLibraryWork(work, authors, workId);
}

export async function fetchOpenLibraryBooks(params: OpenLibraryParams, signal?: AbortSignal): Promise<OpenLibraryResult> {
  const data = await fetchJsonWithTimeout<OpenLibraryResponse>(buildOpenLibraryUrl(params), TIMEOUT_MS, signal);
  const docs = data.docs ?? [];

  // Confirm which "public" works really have a downloadable PDF (backend metadata lookup). Null = backend unreachable.
  const candidates = Array.from(new Set(docs.flatMap(publicIaCandidates)));
  const resolved = await resolveBookPdfs(candidates, signal);

  const books: UnifiedBook[] = [];
  for (const doc of docs) {
    const options = publicIaCandidates(doc);
    const readableIa = resolved ? options.find((ia) => resolved[ia]) ?? null : options[0] ?? null;
    const book = mapOpenLibraryDoc(doc, readableIa);
    if (book) books.push(book);
  }
  return { books, totalCount: data.numFound ?? 0 };
}
