export interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  citations: number;
  abstract: string;
  pdfUrl: string | null;
  /** How confidently pdfUrl can be previewed through our proxy (see computePdfTier). */
  pdfTier: PdfTier;
  landingPageUrl: string;
  primaryConceptId?: string | null;
  /** Same-origin first-page thumbnail, present only for papers the server has already rendered successfully. */
  thumbUrl?: string;
}

/**
 * Preview reliability of a paper's PDF link, from measured host behaviour:
 * 4 = host that previewed >=85% of the time, 3 = likely (nature.com or a direct PDF on an open repository),
 * 2 = unknown host, 1 = host that blocks server fetches, 0 = no PDF link.
 */
export type PdfTier = 0 | 1 | 2 | 3 | 4;

export type ResearchSort = 'trending' | 'top_cited' | 'newest' | 'earliest';

export interface FetchResearchParams {
  query?: string;
  category?: string;
  language?: string;
  sort?: ResearchSort;
  page?: number;
  perPage?: number;
}

export interface FetchResearchResult {
  papers: ResearchPaper[];
  totalCount: number;
}

/** Thrown for any non-2xx response so the UI can surface it instead of showing fake data. */
export class OpenAlexError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OpenAlexError';
  }
}

interface OpenAlexLocation {
  pdf_url?: string | null;
  landing_page_url?: string | null;
  source?: { type?: string | null } | null;
}

interface OpenAlexWork {
  id: string;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: { author?: { display_name?: string | null } | null }[] | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: { oa_url?: string | null } | null;
  primary_topic?: { id?: string } | null;
}

interface OpenAlexResponse {
  meta?: { count?: number };
  results?: OpenAlexWork[];
}

const API_URL = 'https://api.openalex.org/works';
const ALL_CATEGORY = 'All Engineering';

/** OpenAlex primary_topic.field ids (ML-assigned topic taxonomy; far stricter than legacy concepts). */
const F = { CHEM_ENG: '15', COMPUTER_SCIENCE: '17', ENERGY: '21', ENGINEERING: '22', MATERIALS: '25' } as const;

/** Legacy concept ids used as a whitelist / blacklist on top of the topic-field scope. */
const CONCEPT = {
  ENGINEERING: 'C127413603',
  COMPUTER_SCIENCE: 'C41008148',
  MEDICINE: 'C71924100',
  BUSINESS: 'C144133560',
  BIOLOGY: 'C86803240',
} as const;

/** OpenAlex negation syntax is `field:!value` (NOT `!field:value`, which is a 400). */
const NEGATIVE_FILTERS = [
  'primary_topic.domain.id:!4', // Health Sciences
  'primary_topic.domain.id:!2', // Social Sciences
  `concepts.id:!${CONCEPT.MEDICINE}`,
  `concepts.id:!${CONCEPT.BUSINESS}`,
  `concepts.id:!${CONCEPT.BIOLOGY}`,
  // Catch-all topics the classifier dumps non-Latin-script / management papers into
  // (T14423 alone holds ~20M works, e.g. Arabic "Six Sigma in libraries").
  'primary_topic.id:!T14423', // Military Technology and Strategies
  'primary_topic.id:!T14064', // Organizational and Employee Performance
  // Education topics the classifier files under Computer Science (verified ids; Engineering Education T12124 is kept).
  'primary_topic.id:!T14409', // Educational Systems and Policies
  'primary_topic.id:!T13836', // Educational Research and Pedagogy
  'primary_topic.id:!T11122', // Online Learning and Analytics
  'primary_topic.id:!T11370', // Mobile Learning in Education
  'primary_topic.id:!T13565', // Education and Learning Interventions
] as const;

interface DisciplineScope {
  /** Anchor search terms; quoted segments are phrase matches. */
  search: string;
  fields: readonly string[];
}

/** Every discipline is anchored to a hard-science field so finance/genetics/medical hits cannot leak in. */
const HARD_SCIENCE_FIELDS = [F.ENGINEERING, F.COMPUTER_SCIENCE, F.MATERIALS, F.ENERGY] as const;
const ENG = [F.ENGINEERING] as const;
const CS = [F.COMPUTER_SCIENCE] as const;

const CATEGORY_SCOPES: Record<string, DisciplineScope> = {
  'Mechatronics Engineering': { search: 'mechatronics', fields: ENG },
  'Robotics & Automation': { search: 'robotics automation', fields: ENG },
  'Control Systems Engineering': { search: '"control systems"', fields: ENG },
  'Mechanical Engineering': { search: '"mechanical engineering"', fields: ENG },
  'Electrical & Electronics': { search: '"electrical engineering"', fields: ENG },
  'Civil & Structural Engineering': { search: '"civil engineering"', fields: ENG },
  'Artificial Intelligence & Machine Learning': { search: '"artificial intelligence"', fields: CS },
  'Computer & Software Engineering': { search: '"software engineering"', fields: CS },
  'Smart Systems & IoT': { search: '"internet of things" embedded', fields: [F.ENGINEERING, F.COMPUTER_SCIENCE] },
  'Aerospace & Aeronautical': { search: 'aerospace aeronautical', fields: ENG },
  'Energy & Power Systems': { search: '"power systems" energy', fields: [F.ENGINEERING, F.ENERGY] },
  'Automotive Engineering': { search: '"automotive engineering" vehicle', fields: ENG },
  'Biomedical Engineering': { search: '"biomedical engineering"', fields: ENG },
  'Materials & Nanotechnology': { search: 'materials nanotechnology', fields: [F.MATERIALS, F.ENGINEERING] },
  'Chemical & Process Engineering': { search: '"chemical engineering" process', fields: [F.CHEM_ENG, F.ENGINEERING] },
  'Telecommunications Engineering': { search: 'telecommunications', fields: [F.ENGINEERING, F.COMPUTER_SCIENCE] },
  'Industrial & Systems Engineering': { search: '"industrial engineering" systems', fields: ENG },
};

const SORT_MAP = {
  trending: 'relevance_score:desc',
  top_cited: 'cited_by_count:desc',
  newest: 'publication_year:desc',
  earliest: 'publication_year:asc',
} as const satisfies Record<ResearchSort, string>;

/** Pure URL builder (URLSearchParams handles `&`, quotes and non-latin input safely). */
export function buildOpenAlexUrl({
  query = '',
  category = ALL_CATEGORY,
  language = 'all',
  sort = 'trending',
  page = 1,
  perPage = 24,
}: FetchResearchParams): string {
  const scope = category !== ALL_CATEGORY ? CATEGORY_SCOPES[category] : undefined;
  const fields = scope?.fields ?? HARD_SCIENCE_FIELDS;

  // Topic-field scope is ALWAYS kept, including under a language filter.
  const filters: string[] = [
    'is_oa:true',
    'type:article',
    `primary_topic.field.id:${fields.join('|')}`,
    `concepts.id:${CONCEPT.ENGINEERING}|${CONCEPT.COMPUTER_SCIENCE}`,
    ...NEGATIVE_FILTERS,
  ];
  if (language && language !== 'all') filters.push(`language:${language}`);
  // OpenAlex indexes future-dated records; exclude them so "newest" starts at today.
  if (sort === 'newest') filters.push(`to_publication_date:${new Date().toISOString().slice(0, 10)}`);

  const searchTerms = [scope?.search ?? '', query.trim().replace(/&/g, ' and ')].filter(Boolean);
  const search = searchTerms.join(' ').replace(/\s+/g, ' ').trim();

  // relevance_score needs a real text query; otherwise rank by citations.
  const sortParam = sort === 'trending' && !search ? SORT_MAP.top_cited : SORT_MAP[sort];

  const params = new URLSearchParams({
    filter: filters.join(','),
    sort: sortParam,
    page: String(page),
    per_page: String(perPage),
    mailto: 'contact@mae-academy.com',
  });

  if (search) params.set('search', search);

  const apiKey = ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_OPENALEX_API_KEY;
  if (apiKey) params.set('api_key', apiKey);

  return `${API_URL}?${params.toString()}`;
}

/** Never throws: malformed indexes yield an empty string. */
export function reconstructAbstract(index: OpenAlexWork['abstract_inverted_index']): string {
  if (!index || typeof index !== 'object') return '';
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (Number.isInteger(pos) && pos >= 0) slots[pos] = word;
    }
  }
  return slots.filter((w): w is string => typeof w === 'string').join(' ');
}

/*
 * Host reliability, measured by pushing 846 live open-access PDF links (engineering / CS / materials / energy)
 * through our own /api/pdf-proxy. Base domains match themselves and all subdomains.
 */
const RELIABLE_PDF_HOSTS = [
  'arxiv.org', // 32/32
  'springer.com', // 50/57
  'springeropen.com',
  'biomedcentral.com',
  'frontiersin.org',
  'numdam.org',
  'nasa.gov',
  'jair.org',
  'dagstuhl.de',
  'kuleuven.be',
] as const;

const LIKELY_PDF_HOSTS = ['nature.com'] as const; // 22/28

/** Answered with a landing page or 4xx/5xx in (nearly) every probe. NIH/PMC included: 0/6. */
const BLOCKED_PDF_HOSTS = [
  'doi.org',
  'handle.net',
  'sciencedirect.com',
  'els-cdn.com',
  'ieee.org',
  'acm.org',
  'wiley.com',
  'oup.com',
  'iop.org',
  'iucr.org',
  'rsc.org',
  'asme.org',
  'aps.org',
  'sagepub.com',
  'mdpi.com', // 3/22
  'hal.science', // 8/41
  'osti.gov',
  'epfl.ch',
  'projecteuclid.org',
  'nih.gov',
  'esaim-m2an.org',
  'hindawi.com',
  'escholarship.org',
  'zenodo.org',
  'doaj.org',
  'worktribe.com',
  'jstatsoft.org',
] as const;

const hostMatches = (host: string, list: readonly string[]): boolean =>
  list.some((domain) => host === domain || host.endsWith(`.${domain}`));

/** Ranks a resolved PDF link by how likely it is to actually render in the in-page viewer. */
export function computePdfTier(pdfUrl: string | null, location: OpenAlexLocation | null | undefined): PdfTier {
  if (!pdfUrl) return 0;
  let url: URL;
  try {
    url = new URL(pdfUrl);
  } catch {
    return 0;
  }
  const host = url.hostname.toLowerCase();
  if (hostMatches(host, BLOCKED_PDF_HOSTS)) return 1;
  if (hostMatches(host, RELIABLE_PDF_HOSTS)) return 4;
  if (hostMatches(host, LIKELY_PDF_HOSTS)) return 3;
  const looksDirect = /\.pdf($|\?)/i.test(url.pathname) || /\/pdf(\/|$)/i.test(url.pathname);
  return looksDirect && location?.source?.type === 'repository' ? 3 : 2;
}

export function parseWork(work: OpenAlexWork): ResearchPaper {
  // Same precedence as before, but remember which location the link came from.
  const candidates: [string | null | undefined, OpenAlexLocation | null | undefined][] = [
    [work.primary_location?.pdf_url, work.primary_location],
    [work.open_access?.oa_url, work.best_oa_location],
    [work.best_oa_location?.pdf_url, work.best_oa_location],
  ];
  const [pdfUrl, pdfLocation] = candidates.find(([url]) => Boolean(url)) ?? [null, null];

  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 3);

  const primaryConceptId = work.primary_topic?.id || null;

  return {
    id: work.id,
    title: work.title || work.display_name || 'Untitled Engineering Research',
    authors: authors.length > 0 ? authors : ['Multiple Authors'],
    year: work.publication_year ?? 0,
    citations: work.cited_by_count ?? 0,
    abstract: reconstructAbstract(work.abstract_inverted_index) || 'No abstract available for this publication.',
    pdfUrl: pdfUrl || null,
    pdfTier: computePdfTier(pdfUrl || null, pdfLocation),
    landingPageUrl: work.primary_location?.landing_page_url || work.id,
    primaryConceptId,
  };
}

/**
 * "PDF-first" ordering on ALREADY-MAPPED papers: previewable PDFs (highest tier) first, papers without a PDF last.
 * Equivalent to splitting into buckets and concatenating; stable, so the API's order is kept inside each bucket,
 * and nothing is dropped.
 */
export function prioritizePdf<T extends { pdfTier: PdfTier }>(papers: readonly T[]): T[] {
  return [...papers].sort((a, b) => b.pdfTier - a.pdfTier);
}

async function fetchStandardPage(url: string, signal?: AbortSignal): Promise<FetchResearchResult> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new OpenAlexError(
      res.status === 429 ? 'OpenAlex rate limit reached. Set VITE_OPENALEX_API_KEY or retry later.' : `OpenAlex request failed (${res.status})`,
      res.status,
    );
  }
  const data = (await res.json()) as OpenAlexResponse;

  // Dedupe by id: a work must never render twice in one grid.
  const seen = new Set<string>();
  const papers: ResearchPaper[] = [];
  for (const work of data.results ?? []) {
    if (!work.id || seen.has(work.id)) continue;
    seen.add(work.id);
    papers.push(parseWork(work));
  }

  // Reorders this page only; totalCount stays OpenAlex's meta.count so pagination is unaffected.
  return { papers: prioritizePdf(papers), totalCount: data.meta?.count ?? 0 };
}

// ─── Default view: the first FEATURED_COUNT papers always have a working thumbnail ─────────────────

const FEATURED_RETRY_MS = 15_000;
const shortId = (id: string): string => id.replace('https://openalex.org/', '');

/** True for the landing view: no search text, no discipline, no language, default sort. */
export function isDefaultView({ query = '', category = ALL_CATEGORY, language = 'all', sort = 'trending' }: FetchResearchParams): boolean {
  return !query.trim() && category === ALL_CATEGORY && language === 'all' && sort === 'trending';
}

let featuredCache: { papers: ResearchPaper[]; fetchedAt: number } | null = null;
let featuredInFlight: Promise<ResearchPaper[]> | null = null;

export function resetFeaturedCache(): void {
  featuredCache = null;
  featuredInFlight = null;
}

interface FeaturedResponse {
  ready?: boolean;
  items?: { id?: unknown; pdfUrl?: unknown }[];
}

/** Server-verified papers (thumbnail already rendered) in ranking order. Empty when the server is not ready. */
async function requestFeatured(): Promise<ResearchPaper[]> {
  try {
    const res = await fetch('/api/research/featured');
    if (!res.ok) return [];
    const data = (await res.json()) as FeaturedResponse;
    const items = (data.items ?? []).filter(
      (item): item is { id: string; pdfUrl: string } => typeof item.id === 'string' && typeof item.pdfUrl === 'string',
    );
    if (!data.ready || items.length === 0) return [];

    const apiKey = ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_OPENALEX_API_KEY;
    const byId = new Map<string, ResearchPaper>();
    for (let i = 0; i < items.length; i += 100) {
      const params = new URLSearchParams({
        filter: `openalex:${items.slice(i, i + 100).map((item) => shortId(item.id)).join('|')}`,
        per_page: '100',
        mailto: 'contact@mae-academy.com',
      });
      if (apiKey) params.set('api_key', apiKey);
      const page = await fetch(`${API_URL}?${params.toString()}`);
      if (!page.ok) return [];
      for (const work of ((await page.json()) as OpenAlexResponse).results ?? []) byId.set(shortId(work.id), parseWork(work));
    }

    return items.flatMap((item) => {
      const paper = byId.get(shortId(item.id));
      // pdfUrl comes from the server's list so the thumbnail URL is exactly the one it rendered.
      return paper ? [{ ...paper, pdfUrl: item.pdfUrl, thumbUrl: `/api/pdf-thumb?url=${encodeURIComponent(item.pdfUrl)}` }] : [];
    });
  } catch {
    return [];
  }
}

function loadFeaturedPapers(): Promise<ResearchPaper[]> {
  if (featuredCache && (featuredCache.papers.length > 0 || Date.now() - featuredCache.fetchedAt < FEATURED_RETRY_MS)) {
    return Promise.resolve(featuredCache.papers);
  }
  featuredInFlight ??= requestFeatured()
    .then((papers) => {
      featuredCache = { papers, fetchedAt: Date.now() };
      return papers;
    })
    .finally(() => {
      featuredInFlight = null;
    });
  return featuredInFlight;
}

const withExcludedIds = (url: string, ids: readonly string[]): string => {
  const parsed = new URL(url);
  parsed.searchParams.set('filter', `${parsed.searchParams.get('filter')},openalex:!${ids.join('|')}`);
  return parsed.toString();
};

/**
 * Global positions [0, featured.length) come from the verified list; everything after that is the normal ranking
 * with those papers excluded, so nothing repeats. totalCount stays the real OpenAlex total.
 */
async function fetchDefaultViewPage(
  params: FetchResearchParams,
  featured: readonly ResearchPaper[],
  signal?: AbortSignal,
): Promise<FetchResearchResult> {
  const { page = 1, perPage = 24 } = params;
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const head = featured.slice(start, Math.min(end, featured.length));
  const excluded = featured.map((paper) => shortId(paper.id));
  const restUrl = (restPage: number, size: number): string =>
    withExcludedIds(buildOpenAlexUrl({ ...params, page: restPage, perPage: size }), excluded);

  const need = end - Math.max(start, featured.length);
  if (need <= 0) {
    const { totalCount } = await fetchStandardPage(restUrl(1, 1), signal); // count only
    return { papers: [...head], totalCount: totalCount + featured.length };
  }

  const restStart = Math.max(start, featured.length) - featured.length;
  const firstPage = Math.floor(restStart / perPage) + 1;
  const offset = restStart % perPage;
  const pages = [await fetchStandardPage(restUrl(firstPage, perPage), signal)];
  if (offset + need > perPage) pages.push(await fetchStandardPage(restUrl(firstPage + 1, perPage), signal));

  const rest = pages.flatMap((result) => result.papers).slice(offset, offset + need);
  return { papers: [...head, ...rest], totalCount: pages[0].totalCount + featured.length };
}

export async function fetchOpenAlexPapers(
  params: FetchResearchParams,
  signal?: AbortSignal,
): Promise<FetchResearchResult> {
  if (isDefaultView(params)) {
    const featured = await loadFeaturedPapers();
    if (featured.length > 0) return fetchDefaultViewPage(params, featured, signal);
  }
  return fetchStandardPage(buildOpenAlexUrl(params), signal);
}

export async function fetchWorkById(id: string, signal?: AbortSignal): Promise<ResearchPaper> {
  const workId = id.replace('https://openalex.org/', '');
  const url = `https://api.openalex.org/works/${workId}`;
  
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new OpenAlexError(`Failed to fetch work ${workId} (${res.status})`, res.status);
  }
  const data = await res.json() as OpenAlexWork;
  return parseWork(data);
}

const RELATED_POOL_SIZE = 40;
const RELATED_DISPLAY_COUNT = 4;
const VERIFY_CLIENT_TIMEOUT_MS = 5000;

/**
 * Asks our backend which URLs really serve PDF bytes (1 KB range request each, SSRF-safe, cached server-side).
 * Returns the set of confirmed URLs, or null when the checker is unreachable so callers can degrade to heuristics.
 */
export async function verifyPdfUrls(urls: readonly string[], signal?: AbortSignal): Promise<Set<string> | null> {
  if (urls.length === 0) return new Set();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), VERIFY_CLIENT_TIMEOUT_MS);
  const forwardAbort = () => timeout.abort();
  signal?.addEventListener('abort', forwardAbort);
  try {
    const res = await fetch('/api/check-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const results = typeof data === 'object' && data !== null ? (data as { results?: unknown }).results : undefined;
    if (typeof results !== 'object' || results === null) return null;
    return new Set(Object.entries(results as Record<string, unknown>).filter(([, ok]) => ok === true).map(([url]) => url));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export async function fetchRelatedWorks(conceptId: string | null | undefined, currentPaperId: string, signal?: AbortSignal): Promise<ResearchPaper[]> {
  const apiKey = ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_OPENALEX_API_KEY;
  const params = new URLSearchParams({
    sort: 'cited_by_count:desc',
    per_page: String(RELATED_POOL_SIZE), // oversample so 4 PDF-backed cards can be picked after sorting
    mailto: 'contact@mae-academy.com',
  });
  
  if (conceptId) {
    // If we have a concept/topic, filter by it
    params.set('filter', `is_oa:true,primary_topic.id:${conceptId}`);
  } else {
    // Fallback: Broad engineering scope
    params.set('filter', `is_oa:true,concepts.id:${CONCEPT.ENGINEERING}`);
  }

  if (apiKey) params.set('api_key', apiKey);

  const url = `${API_URL}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new OpenAlexError(`Failed to fetch related works (${res.status})`, res.status);
  }
  const data = await res.json() as OpenAlexResponse;
  
  const normalizedCurrentId = currentPaperId.replace('https://openalex.org/', '');
  const seen = new Set<string>();
  const papers: ResearchPaper[] = [];
  for (const work of data.results ?? []) {
    if (!work.id || seen.has(work.id) || work.id.replace('https://openalex.org/', '') === normalizedCurrentId) continue;
    seen.add(work.id);
    papers.push(parseWork(work));
  }

  // 1) heuristic order, 2) confirm the candidates with real requests, 3) verified first, the rest as top-up.
  const ranked = prioritizePdf(papers);
  const candidateUrls = ranked.flatMap((p) => (p.pdfUrl ? [p.pdfUrl] : []));
  const verified = await verifyPdfUrls(candidateUrls, signal);
  if (!verified) return ranked.slice(0, RELATED_DISPLAY_COUNT); // checker unavailable: heuristics only

  const confirmed = ranked.filter((p) => p.pdfUrl && verified.has(p.pdfUrl));
  const rest = ranked.filter((p) => !(p.pdfUrl && verified.has(p.pdfUrl)));
  return [...confirmed, ...rest].slice(0, RELATED_DISPLAY_COUNT);
}
