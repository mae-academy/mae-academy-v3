import { sanitizeQuery } from './internetarchive';
import { bookPath, doabIdFromHandle, fetchJsonWithTimeout, type UnifiedBook } from './bookSources';

/**
 * DOAB (Directory of Open Access Books) client (isolated). Findings that shape it (measured live):
 *  - The directory sends no CORS headers, so requests go through our backend route /api/library/doab.
 *  - It is a catalog: 0 of 360 sampled records carry a PDF bitstream (only covers and MARC/ONIX exports). The full
 *    text lives on the publisher's site behind the DOI, so DOAB entries are catalog-only: they sort after readable
 *    books and "Details" opens the DOI / DOAB record.
 *  - No total count is returned, so DOAB does not contribute to pagination totals.
 */

interface DoabMetadata {
  key: string;
  value: string;
}

interface DoabBitstream {
  bundleName?: string;
  retrieveLink?: string;
}

export interface DoabItem {
  handle?: string;
  name?: string;
  metadata?: DoabMetadata[];
  bitstreams?: DoabBitstream[];
}

export interface DoabParams {
  query: string;
  page?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 15;
const TIMEOUT_MS = 5000;
const ENDPOINT = '/api/library/doab';
const ITEM_ENDPOINT = '/api/library/doab-item';
const DOAB_HOST = 'https://directory.doabooks.org';

export function buildDoabUrl({ query, page = 1, limit = DEFAULT_LIMIT }: DoabParams): string {
  const params = new URLSearchParams({ query: sanitizeQuery(query), limit: String(limit), offset: String((page - 1) * limit) });
  return `${ENDPOINT}?${params.toString()}`;
}

const values = (metadata: DoabMetadata[] | undefined, ...keys: string[]): string[] =>
  (metadata ?? []).filter((m) => keys.includes(m.key)).map((m) => m.value.trim()).filter(Boolean);

/** DOAB stores names as "Last, First". */
const toDisplayName = (name: string): string => {
  const parts = name.split(',').map((p) => p.trim());
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : name;
};

const stripTags = (text: string): string => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const toDoiUrl = (doi: string): string => (/^https?:\/\//i.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:/i, '')}`);

export function mapDoabItem(item: DoabItem): UnifiedBook | null {
  const title = values(item.metadata, 'dc.title')[0] ?? item.name;
  if (!item.handle || !title) return null;

  const doi = values(item.metadata, 'oapen.identifier.doi')[0];
  const recordUrl = values(item.metadata, 'dc.identifier.uri')[0] ?? `https://directory.doabooks.org/handle/${item.handle}`;
  const issued = values(item.metadata, 'dc.date.issued')[0] ?? '';
  const year = Number(issued.slice(0, 4));
  const link = doi ? toDoiUrl(doi) : recordUrl;
  const subjects = values(item.metadata, 'dc.subject.other').flatMap((s) => s.split(/[,;]/)).map((s) => s.trim()).filter(Boolean);

  return {
    id: doabIdFromHandle(item.handle),
    title,
    authors: values(item.metadata, 'dc.contributor.author', 'dc.creator', 'dc.contributor.editor').map(toDisplayName),
    year: Number.isInteger(year) && year > 0 && year < 3000 ? year : 0,
    downloads: 0,
    description: stripTags(values(item.metadata, 'dc.description.abstract').join(' ')).slice(0, 2000),
    subjects: subjects.slice(0, 12),
    coverUrl: coverOf(item),
    archiveUrl: link,
    pdfUrl: null,
    pdfTier: 0,
    source: 'doab',
    hasPdf: false,
    detailUrl: bookPath(doabIdFromHandle(item.handle)),
    sourceUrl: link,
  };
}

/** Cover thumbnail, present only when the record was requested with bitstreams (single-record lookups). */
const coverOf = (item: DoabItem): string => {
  const link = item.bitstreams?.find((b) => b.bundleName === 'THUMBNAIL')?.retrieveLink;
  return link ? `${DOAB_HOST}${link}` : '';
};

/** Detail page: one DOAB record, fetched through our backend (the directory sends no CORS headers). */
export async function fetchDoabBookByHandle(handle: string, signal?: AbortSignal): Promise<UnifiedBook> {
  if (!/^\d+(\.\d+)*\/\d+$/.test(handle)) throw new Error(`"${handle}" is not a DOAB handle`);
  const item = await fetchJsonWithTimeout<DoabItem>(`${ITEM_ENDPOINT}?${new URLSearchParams({ handle }).toString()}`, 10000, signal);
  const book = mapDoabItem(item);
  if (!book) throw new Error('DOAB record not found');
  return book;
}

export async function fetchDoabBooks(params: DoabParams, signal?: AbortSignal): Promise<UnifiedBook[]> {
  const items = await fetchJsonWithTimeout<unknown>(buildDoabUrl(params), TIMEOUT_MS, signal);
  if (!Array.isArray(items)) return [];
  return (items as DoabItem[]).flatMap((item) => {
    const book = mapDoabItem(item);
    return book ? [book] : [];
  });
}
