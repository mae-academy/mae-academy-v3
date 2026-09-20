export interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  citations: number;
  abstract: string;
  pdfUrl: string | null;
  landingPageUrl: string;
}

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

  const apiKey = (import.meta.env as Record<string, string | undefined>).VITE_OPENALEX_API_KEY;
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

export function parseWork(work: OpenAlexWork): ResearchPaper {
  const pdfUrl =
    work.primary_location?.pdf_url ||
    work.open_access?.oa_url ||
    work.best_oa_location?.pdf_url ||
    null;

  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 3);

  return {
    id: work.id,
    title: work.title || work.display_name || 'Untitled Engineering Research',
    authors: authors.length > 0 ? authors : ['Multiple Authors'],
    year: work.publication_year ?? 0,
    citations: work.cited_by_count ?? 0,
    abstract: reconstructAbstract(work.abstract_inverted_index) || 'No abstract available for this publication.',
    pdfUrl,
    landingPageUrl: work.primary_location?.landing_page_url || work.id,
  };
}

export async function fetchOpenAlexPapers(
  params: FetchResearchParams,
  signal?: AbortSignal,
): Promise<FetchResearchResult> {
  const res = await fetch(buildOpenAlexUrl(params), { signal });
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

  return { papers, totalCount: data.meta?.count ?? 0 };
}
