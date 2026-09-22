/**
 * Internet Archive data layer for the Academic Library. Mirrors the structure of openalex.ts:
 * pure URL builder -> mapping -> "PDF-first" ordering -> fetchers, with strict typing.
 *
 * Findings that shape this file (measured against the live API):
 *  - Search results only advertise file *formats*; real PDF file names are arbitrary ("php.pdf"), so
 *    `download/{id}/{id}.pdf` is NOT a valid guess (0 of 120 items). File names come from the metadata API.
 *  - Values of `language` are inconsistent ("eng" and "English"), so filters match both spellings.
 *  - advancedsearch.php refuses deep paging beyond 10,000 results, like OpenAlex.
 */

export interface LibraryBook {
  /** Internet Archive item identifier. */
  id: string;
  title: string;
  authors: string[];
  year: number;
  downloads: number;
  description: string;
  subjects: string[];
  coverUrl: string;
  archiveUrl: string;
  /** Real, URL-encoded PDF file URL. Only resolved on the detail page and for See Also; null in search results. */
  pdfUrl: string | null;
  /** Reading-format quality advertised by search: 3 = "Text PDF", 2 = other PDF, 0 = no PDF. */
  pdfTier: BookPdfTier;
}

export type BookPdfTier = 0 | 2 | 3;

export type LibrarySort = 'trending' | 'top_downloaded' | 'newest' | 'earliest';

export interface FetchBooksParams {
  query?: string;
  category?: string;
  language?: string;
  sort?: LibrarySort;
  page?: number;
  perPage?: number;
}

export interface FetchBooksResult {
  books: LibraryBook[];
  totalCount: number;
}

export class ArchiveError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ArchiveError';
  }
}

interface ArchiveDoc {
  identifier?: string;
  title?: string | string[];
  creator?: string | string[];
  year?: string | number;
  date?: string;
  description?: string | string[];
  subject?: string | string[];
  downloads?: number;
  format?: string | string[];
  language?: string | string[];
}

interface ArchiveSearchResponse {
  response?: { numFound?: number; docs?: ArchiveDoc[] };
}

export interface ArchiveFile {
  name: string;
  format?: string;
  size?: string | number;
  private?: string | boolean;
}

interface ArchiveMetadataResponse {
  metadata?: ArchiveDoc & { 'access-restricted-item'?: string; imagecount?: string };
  files?: ArchiveFile[];
  is_dark?: boolean;
}

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const METADATA_URL = 'https://archive.org/metadata';
export const ALL_BOOKS_CATEGORY = 'All Engineering';

const FIELDS = ['identifier', 'title', 'creator', 'year', 'date', 'description', 'subject', 'downloads', 'format'] as const;

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
const list = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : value ? [value] : []);

// ─── Query building ─────────────────────────────────────────────────────────────────────────────────

/**
 * Open, downloadable books only: no lending-library scans, no print-disabled / restricted items, and no periodicals
 * (magazine issues such as Popular Mechanics otherwise dominate the "trending" ranking).
 */
const OPEN_TEXTS =
  'mediatype:texts AND -access-restricted-item:true AND -collection:inlibrary AND -collection:printdisabled AND -collection:magazine_rack AND -collection:pulpmagazinearchive';

const subjectClause = (subjects: readonly string[]): string =>
  `subject:(${subjects.map((s) => (s.includes(' ') ? `"${s}"` : s)).join(' OR ')})`;

const CATEGORY_SUBJECTS: Record<string, readonly string[]> = {
  [ALL_BOOKS_CATEGORY]: ['engineering', 'computer science', 'mathematics', 'physics', 'mechanics', 'electronics', 'robotics', 'thermodynamics'],
  'Computer Science': ['computer science', 'programming', 'algorithms', 'software engineering', 'artificial intelligence'],
  Mathematics: ['mathematics', 'calculus', 'linear algebra', 'differential equations', 'numerical analysis'],
  Physics: ['physics', 'quantum mechanics', 'electromagnetism', 'optics', 'thermodynamics'],
  Mechanics: ['mechanics', 'statics', 'dynamics', 'fluid mechanics', 'strength of materials'],
  'Electrical & Electronics': ['electrical engineering', 'electronics', 'circuits', 'power electronics', 'signal processing'],
  'Mechanical Engineering': ['mechanical engineering', 'machine design', 'heat transfer', 'manufacturing'],
  'Civil & Structural': ['civil engineering', 'structural engineering', 'concrete', 'geotechnical'],
  'Robotics & Control': ['robotics', 'control theory', 'control systems', 'automation', 'mechatronics'],
  'Chemistry & Materials': ['chemical engineering', 'materials science', 'chemistry'],
  'Energy & Power': ['power systems', 'renewable energy', 'energy', 'electric power'],
  Aerospace: ['aerospace engineering', 'aeronautics', 'aerodynamics', 'astronautics'],
};

export const BOOK_CATEGORIES: readonly string[] = Object.keys(CATEGORY_SUBJECTS);

const LANGUAGE_CODES: Record<string, string> = {
  en: '(eng OR English)',
  ar: '(ara OR Arabic)',
  es: '(spa OR Spanish)',
  de: '(ger OR deu OR German)',
  fr: '(fre OR fra OR French)',
  zh: '(chi OR zho OR Chinese)',
  ja: '(jpn OR Japanese)',
  it: '(ita OR Italian)',
  ru: '(rus OR Russian)',
};

const SORT_MAP = {
  trending: 'week desc',
  top_downloaded: 'downloads desc',
  newest: 'date desc',
  earliest: 'date asc',
} as const satisfies Record<LibrarySort, string>;

/** Removes Lucene operators / quotes so user text can never change the structure of the query. */
export const sanitizeQuery = (raw: string): string =>
  raw.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();

/** Pure URL builder (URLSearchParams handles all encoding). */
export function buildArchiveSearchUrl({
  query = '',
  category = ALL_BOOKS_CATEGORY,
  language = 'all',
  sort = 'trending',
  page = 1,
  perPage = 24,
}: FetchBooksParams): string {
  const clauses = [OPEN_TEXTS, subjectClause(CATEGORY_SUBJECTS[category] ?? CATEGORY_SUBJECTS[ALL_BOOKS_CATEGORY])];
  const text = sanitizeQuery(query);
  if (text) clauses.push(`(${text})`);
  const languageClause = LANGUAGE_CODES[language];
  if (languageClause) clauses.push(`language:${languageClause}`);
  // Date-sorted views are otherwise flooded by undated items and bulk record dumps with no readers.
  if (sort === 'newest' || sort === 'earliest') clauses.push('year:[1000 TO 3000]', 'downloads:[10 TO *]');

  const params = new URLSearchParams({ q: clauses.join(' AND '), rows: String(perPage), page: String(page), output: 'json' });
  FIELDS.forEach((field) => params.append('fl[]', field));
  params.append('sort[]', SORT_MAP[sort]);
  return `${SEARCH_URL}?${params.toString()}`;
}

// ─── Mapping ────────────────────────────────────────────────────────────────────────────────────────

const stripHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const parseYear = (doc: Pick<ArchiveDoc, 'year' | 'date'>): number => {
  const candidate = Number(doc.year) || Number(String(doc.date ?? '').slice(0, 4));
  return Number.isInteger(candidate) && candidate > 0 && candidate < 3000 ? candidate : 0;
};

/** Tier from the format list advertised by search. Says nothing about the file name. */
export function computeBookPdfTier(format: string | string[] | undefined): BookPdfTier {
  const formats = list(format);
  if (formats.includes('Text PDF')) return 3;
  if (formats.some((f) => f.includes('PDF'))) return 2;
  return 0;
}

const MAX_DESCRIPTION = 2000;

export function mapArchiveDoc(doc: ArchiveDoc, pdfUrl: string | null = null): LibraryBook {
  const id = doc.identifier ?? '';
  const description = stripHtml(list(doc.description).join('\n\n'));
  return {
    id,
    title: first(doc.title) || 'Untitled Book',
    authors: list(doc.creator).filter((name) => name && name.toUpperCase() !== 'N/A'),
    year: parseYear(doc),
    downloads: Number(doc.downloads) || 0,
    description: description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION).trimEnd()}…` : description,
    subjects: list(doc.subject).slice(0, 12),
    coverUrl: `https://archive.org/services/img/${encodeURIComponent(id)}`,
    archiveUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
    pdfUrl,
    pdfTier: computeBookPdfTier(doc.format),
  };
}

/** Same contract as openalex.ts: previewable formats first, stable, nothing dropped. */
export function prioritizeBooks<T extends { pdfTier: BookPdfTier }>(books: readonly T[]): T[] {
  return [...books].sort((a, b) => b.pdfTier - a.pdfTier);
}

// ─── PDF file selection (from the metadata API) ─────────────────────────────────────────────────────

const PDF_FORMAT_RANK: Record<string, number> = { 'Text PDF': 3, 'Additional Text PDF': 2, 'Image Container PDF': 1 };

const toSize = (size: ArchiveFile['size']): number => Number(size) || Number.MAX_SAFE_INTEGER;

/**
 * Picks the file to read/download: an OCR'd "Text PDF" first, then other PDF derivatives.
 * Ties go to the smaller file so the preview starts faster. Private files are never chosen.
 */
export function pickPdfFile(files: readonly ArchiveFile[] | undefined): ArchiveFile | null {
  const candidates = (files ?? []).filter(
    (file) => /\.pdf$/i.test(file.name) && String(file.private) !== 'true' && file.format !== undefined && file.format in PDF_FORMAT_RANK,
  );
  candidates.sort(
    (a, b) => PDF_FORMAT_RANK[b.format as string] - PDF_FORMAT_RANK[a.format as string] || toSize(a.size) - toSize(b.size),
  );
  return candidates[0] ?? null;
}

/** File names are arbitrary (spaces, unicode, sub-folders): encode every path segment. */
export const buildDownloadUrl = (id: string, fileName: string): string =>
  `https://archive.org/download/${encodeURIComponent(id)}/${fileName.split('/').map(encodeURIComponent).join('/')}`;

// ─── Fetchers ───────────────────────────────────────────────────────────────────────────────────────

async function readJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new ArchiveError(`${what} failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

/** Search (search page). PDF-first ordering runs on the mapped page; totalCount is Internet Archive's numFound. */
export async function fetchBooks(params: FetchBooksParams, signal?: AbortSignal): Promise<FetchBooksResult> {
  const data = await readJson<ArchiveSearchResponse>(await fetch(buildArchiveSearchUrl(params), { signal }), 'Internet Archive search');

  const seen = new Set<string>();
  const books: LibraryBook[] = [];
  for (const doc of data.response?.docs ?? []) {
    if (!doc.identifier || seen.has(doc.identifier)) continue;
    seen.add(doc.identifier);
    books.push(mapArchiveDoc(doc));
  }
  return { books: prioritizeBooks(books), totalCount: data.response?.numFound ?? 0 };
}

/** Detail page: full metadata plus the real PDF file (null when the item is restricted or has no PDF). */
export async function fetchBookById(id: string, signal?: AbortSignal): Promise<LibraryBook> {
  const data = await readJson<ArchiveMetadataResponse>(await fetch(`${METADATA_URL}/${encodeURIComponent(id)}`, { signal }), 'Book lookup');
  if (!data.metadata) throw new ArchiveError(`Book ${id} was not found`, 404);

  const restricted = data.metadata['access-restricted-item'] === 'true' || data.is_dark === true;
  const file = restricted ? null : pickPdfFile(data.files);
  const book = mapArchiveDoc({ ...data.metadata, identifier: data.metadata.identifier ?? id }, file ? buildDownloadUrl(id, file.name) : null);
  return { ...book, pdfTier: file ? 3 : 0 };
}

const RELATED_POOL_SIZE = 40;
const RELATED_DISPLAY_COUNT = 4;
const RESOLVE_CLIENT_TIMEOUT_MS = 8000;

type ResolvedPdfs = Record<string, string | null>;

/**
 * Preflight for See Also: asks our backend to resolve the real PDF file of each candidate from the metadata API
 * (a book is "confirmed" only if a non-restricted PDF file exists). Null when the backend is unreachable.
 */
export async function resolveBookPdfs(ids: readonly string[], signal?: AbortSignal): Promise<ResolvedPdfs | null> {
  if (ids.length === 0) return {};
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), RESOLVE_CLIENT_TIMEOUT_MS);
  const forwardAbort = () => timeout.abort();
  signal?.addEventListener('abort', forwardAbort);
  try {
    const res = await fetch('/api/library/resolve-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const results = typeof data === 'object' && data !== null ? (data as { results?: unknown }).results : undefined;
    if (typeof results !== 'object' || results === null) return null;
    const resolved: ResolvedPdfs = {};
    for (const [id, url] of Object.entries(results as Record<string, unknown>)) resolved[id] = typeof url === 'string' ? url : null;
    return resolved;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * See Also: 40 books on the same subject -> advertised-format order -> backend confirms which have a real PDF
 * -> confirmed first (top up with the rest) -> top 4. Degrades to the format order if the backend is down.
 */
export async function fetchRelatedBooks(subjects: readonly string[], currentId: string, signal?: AbortSignal): Promise<LibraryBook[]> {
  const usable = subjects.filter((s) => s.length > 2 && s.length < 60).slice(0, 3);
  const clauses = [OPEN_TEXTS, usable.length ? subjectClause(usable.map(sanitizeQuery).filter(Boolean)) : subjectClause(CATEGORY_SUBJECTS[ALL_BOOKS_CATEGORY])];
  const params = new URLSearchParams({ q: clauses.join(' AND '), rows: String(RELATED_POOL_SIZE + 1), page: '1', output: 'json' });
  FIELDS.forEach((field) => params.append('fl[]', field));
  params.append('sort[]', SORT_MAP.top_downloaded);

  const data = await readJson<ArchiveSearchResponse>(await fetch(`${SEARCH_URL}?${params.toString()}`, { signal }), 'Related books');
  const seen = new Set<string>([currentId]);
  const books: LibraryBook[] = [];
  for (const doc of data.response?.docs ?? []) {
    if (!doc.identifier || seen.has(doc.identifier)) continue;
    seen.add(doc.identifier);
    books.push(mapArchiveDoc(doc));
  }

  const ranked = prioritizeBooks(books);
  const resolved = await resolveBookPdfs(ranked.filter((b) => b.pdfTier > 0).map((b) => b.id), signal);
  if (!resolved) return ranked.slice(0, RELATED_DISPLAY_COUNT);

  const withPdf = ranked.filter((b) => resolved[b.id]).map((b) => ({ ...b, pdfUrl: resolved[b.id] }));
  const rest = ranked.filter((b) => !resolved[b.id]);
  return [...withPdf, ...rest].slice(0, RELATED_DISPLAY_COUNT);
}
