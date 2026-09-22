import type { LibraryBook } from './internetarchive';

/**
 * Shared vocabulary for the multi-source Academic Library. Kept apart from internetarchive.ts on purpose:
 * the Internet Archive engine is unchanged and each extra source only depends on this file.
 */
export type BookSource = 'archive' | 'openlibrary' | 'doab';

export interface UnifiedBook extends LibraryBook {
  source: BookSource;
  /** True only when the book can be previewed and downloaded inside the app. */
  hasPdf: boolean;
  /** In-app detail route for EVERY source (`/library/<id>`); cards never link to an external site. */
  detailUrl: string;
  /** The source's own record page (Internet Archive item, Open Library work, DOI / DOAB record): the reader's "view on provider" link. */
  sourceUrl: string;
}

/**
 * Id scheme (URL-safe, resolvable by the detail page):
 *   Internet Archive: the raw identifier (or `ia:<identifier>`)   Open Library: `ol:OL123W`   DOAB: `doab:20.500.12854_130855`
 * Internet Archive identifiers can never contain ":", so the prefixes cannot collide with them.
 */
export const bookPath = (id: string): string => `/library/${encodeURIComponent(id)}`;

export interface BookRef {
  source: BookSource;
  ref: string;
}

export function parseBookRef(id: string): BookRef {
  if (id.startsWith('ol:')) return { source: 'openlibrary', ref: id.slice(3) };
  if (id.startsWith('doab:')) return { source: 'doab', ref: id.slice(5) };
  return { source: 'archive', ref: id.startsWith('ia:') ? id.slice(3) : id };
}

/** Handles look like `20.500.12854/130855`; the slash becomes "_" so the id stays one URL segment. */
export const doabIdFromHandle = (handle: string): string => `doab:${handle.replace('/', '_')}`;
export const doabHandleFromRef = (ref: string): string => ref.replace('_', '/');

export const SOURCE_PAGE_LABEL: Record<BookSource, string> = {
  archive: 'Internet Archive',
  openlibrary: 'Open Library',
  doab: 'DOAB',
};

/** Open Library subjects contain housekeeping tags that make useless search terms and descriptions. */
const JUNK_SUBJECT = /^(accessible book|protected daisy|in library|lending library|large type books|internet archive wishlist|overdrive|open_syllabus_project|reading level|nyt:|new york times)/i;
export const cleanSubjects = (subjects: readonly string[] | undefined): string[] =>
  (subjects ?? []).map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 60 && !s.includes('_') && !JUNK_SUBJECT.test(s));

export const SOURCE_LABELS: Record<BookSource, string> = {
  archive: 'Archive',
  openlibrary: 'OpenLib',
  doab: 'DOAB',
};

export class SourceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SourceError';
  }
}

/** JSON GET with its own deadline, so one slow catalog can never hold the search hostage. */
export async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const forwardAbort = () => timeout.abort();
  signal?.addEventListener('abort', forwardAbort);
  try {
    const res = await fetch(url, { signal: timeout.signal });
    if (!res.ok) throw new SourceError(`Request failed (${res.status})`, res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Rejects if `promise` has not settled within `ms` (the underlying work is left to finish or fail on its own). */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SourceError(`Timed out after ${ms} ms`, 408)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
