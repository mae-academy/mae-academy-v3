import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { buildOpenAlexUrl, computePdfTier, isDefaultView, resetFeaturedCache, fetchOpenAlexPapers, fetchRelatedWorks, prioritizePdf, verifyPdfUrls, reconstructAbstract, OpenAlexError, type PdfTier } from './openalex';

const q = (url: string) => new URL(url).searchParams;

beforeEach(resetFeaturedCache);
afterEach(() => vi.unstubAllGlobals());

describe('buildOpenAlexUrl', () => {
  it('All Engineering: no search token, hard-science field scope, citation sort', () => {
    const p = q(buildOpenAlexUrl({}));
    expect(p.has('search')).toBe(false);
    expect(p.get('filter')).toBe('is_oa:true,type:article,primary_topic.field.id:22|17|25|21,concepts.id:C127413603|C41008148,primary_topic.domain.id:!4,primary_topic.domain.id:!2,concepts.id:!C71924100,concepts.id:!C144133560,concepts.id:!C86803240,primary_topic.id:!T14423,primary_topic.id:!T14064,primary_topic.id:!T14409,primary_topic.id:!T13836,primary_topic.id:!T11122,primary_topic.id:!T11370,primary_topic.id:!T13565');
    expect(p.get('sort')).toBe('cited_by_count:desc');
  });
  it('sub-discipline keeps its search anchor and field shield', () => {
    const p = q(buildOpenAlexUrl({ category: 'Artificial Intelligence & Machine Learning' }));
    expect(p.get('search')).toBe('"artificial intelligence"');
    expect(p.get('filter')).toBe('is_oa:true,type:article,primary_topic.field.id:17,concepts.id:C127413603|C41008148,primary_topic.domain.id:!4,primary_topic.domain.id:!2,concepts.id:!C71924100,concepts.id:!C144133560,concepts.id:!C86803240,primary_topic.id:!T14423,primary_topic.id:!T14064,primary_topic.id:!T14409,primary_topic.id:!T13836,primary_topic.id:!T11122,primary_topic.id:!T11370,primary_topic.id:!T13565');
    expect(p.get('sort')).toBe('relevance_score:desc');
  });
  it('language filter retains the field scope; user query is appended; & is sanitised', () => {
    const url = buildOpenAlexUrl({ category: 'Electrical & Electronics', language: 'ar', query: 'MEMS & RF' });
    const p = q(url);
    expect(p.get('filter')).toBe('is_oa:true,type:article,primary_topic.field.id:22,concepts.id:C127413603|C41008148,primary_topic.domain.id:!4,primary_topic.domain.id:!2,concepts.id:!C71924100,concepts.id:!C144133560,concepts.id:!C86803240,primary_topic.id:!T14423,primary_topic.id:!T14064,primary_topic.id:!T14409,primary_topic.id:!T13836,primary_topic.id:!T11122,primary_topic.id:!T11370,primary_topic.id:!T13565,language:ar');
    expect(p.get('search')).toBe('"electrical engineering" MEMS and RF');
  });
  it.each([
    ['top_cited', 'cited_by_count:desc'],
    ['newest', 'publication_year:desc'],
    ['earliest', 'publication_year:asc'],
  ] as const)('maps %s', (sort, expected) => {
    expect(q(buildOpenAlexUrl({ sort, query: 'x' })).get('sort')).toBe(expected);
  });
  it('newest excludes future-dated records', () => {
    expect(q(buildOpenAlexUrl({ sort: 'newest' })).get('filter')).toMatch(/to_publication_date:\d{4}-\d{2}-\d{2}/);
  });
});

describe('reconstructAbstract', () => {
  it('orders words by position and tolerates junk', () => {
    expect(reconstructAbstract({ world: [1], hello: [0] })).toBe('hello world');
    expect(reconstructAbstract(null)).toBe('');
    expect(reconstructAbstract({ a: 'x' as unknown as number[] })).toBe('');
  });
});

describe('fetchOpenAlexPapers', () => {
  const work = (i: number) => ({
    id: `https://openalex.org/W${i}`,
    title: `Paper ${i}`,
    publication_year: 2020,
    cited_by_count: 100 - i,
    primary_location: { pdf_url: `https://x.org/${i}.pdf` },
  });

  it('returns unique ids/titles and drops duplicate works', async () => {
    const results = [...Array.from({ length: 24 }, (_, i) => work(i)), work(0)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ meta: { count: 500 }, results }) }));
    const { papers, totalCount } = await fetchOpenAlexPapers({});
    expect(totalCount).toBe(500);
    expect(papers).toHaveLength(24);
    expect(new Set(papers.map((p) => p.id)).size).toBe(24);
    expect(new Set(papers.map((p) => p.title)).size).toBe(24);
    expect(papers[3].pdfUrl).toBe('https://x.org/3.pdf');
  });

  it('throws OpenAlexError on 429 instead of serving fake data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchOpenAlexPapers({})).rejects.toBeInstanceOf(OpenAlexError);
  });
});

describe('computePdfTier', () => {
  const repo = { source: { type: 'repository' } };
  const journal = { source: { type: 'journal' } };
  it('ranks links by measured reliability', () => {
    expect(computePdfTier(null, null)).toBe(0);
    expect(computePdfTier('not a url', repo)).toBe(0);
    expect(computePdfTier('https://arxiv.org/pdf/2202.07127', repo)).toBe(4);
    expect(computePdfTier('https://link.springer.com/content/pdf/10.1007/x.pdf', journal)).toBe(4);
    expect(computePdfTier('https://www.nature.com/articles/x.pdf', journal)).toBe(3);
    expect(computePdfTier('https://some-university.edu/files/paper.pdf', repo)).toBe(3);
    expect(computePdfTier('https://x.org/paper.pdf', journal)).toBe(2);
    expect(computePdfTier('https://example.org/landing', repo)).toBe(2);
  });
  it('demotes hosts that block server-side fetches (incl. subdomains)', () => {
    expect(computePdfTier('https://doi.org/10.1/abc', repo)).toBe(1);
    expect(computePdfTier('https://www.sciencedirect.com/x.pdf', journal)).toBe(1);
    expect(computePdfTier('https://ieeexplore.ieee.org/ielx7/1/2/3.pdf', journal)).toBe(1);
    expect(computePdfTier('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1/pdf/', repo)).toBe(1);
    expect(computePdfTier('https://notdoi.org/x.pdf', journal)).toBe(2);
  });
});

describe('PDF-first ordering', () => {
  // i % 4: 0 = no pdf, 1 = blocked host, 2 = generic pdf, 3 = repository pdf
  const work = (i: number) => {
    const kind = i % 4;
    const base = { id: `https://openalex.org/W${i}`, title: `Paper ${i}`, cited_by_count: 1000 - i };
    if (kind === 1) return { ...base, primary_location: { pdf_url: `https://www.sciencedirect.com/${i}.pdf`, source: { type: 'journal' } } };
    if (kind === 2) return { ...base, primary_location: { pdf_url: `https://pub.org/${i}.pdf`, source: { type: 'journal' } } };
    if (kind === 3) return { ...base, primary_location: { pdf_url: `https://arxiv.org/pdf/${i}`, source: { type: 'repository' } } };
    return base;
  };
  const stubResults = (results: unknown[], count = 12345) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ meta: { count }, results }) }));

  it('prioritizePdf is stable, non-mutating and drops nothing', () => {
    const input: { id: string; pdfTier: PdfTier }[] = [
      { id: 'a', pdfTier: 0 }, { id: 'b', pdfTier: 2 }, { id: 'c', pdfTier: 3 }, { id: 'd', pdfTier: 2 }, { id: 'e', pdfTier: 1 },
    ];
    expect(prioritizePdf(input).map((p) => p.id)).toEqual(['c', 'b', 'd', 'e', 'a']);
    expect(input.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('main list: previewable PDFs first, API order kept per group, totalCount untouched', async () => {
    stubResults([4, 5, 6, 7, 8, 9].map(work), 9_000_000); // tiers 0,1,2,3,0,1
    const { papers, totalCount } = await fetchOpenAlexPapers({});
    expect(papers.map((p) => p.title)).toEqual(['Paper 7', 'Paper 6', 'Paper 5', 'Paper 9', 'Paper 4', 'Paper 8']);
    expect(papers.map((p) => p.pdfTier)).toEqual([4, 2, 1, 1, 0, 0]);
    expect(totalCount).toBe(9_000_000);
  });

  /** OpenAlex returns `results`; /api/check-pdfs answers `confirmed` as true and everything else as false. */
  const stubRelated = (results: unknown[], confirmed: (url: string) => boolean, checker: 'ok' | 'down' = 'ok') => {
    const mock = vi.fn(async (input: unknown, init?: { body?: string }) => {
      if (String(input).includes('/api/check-pdfs')) {
        if (checker === 'down') throw new Error('backend unreachable');
        const { urls } = JSON.parse(init?.body ?? '{}') as { urls: string[] };
        return { ok: true, json: async () => ({ results: Object.fromEntries(urls.map((u) => [u, confirmed(u)])) }) };
      }
      return { ok: true, json: async () => ({ meta: { count: 1 }, results }) };
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  };
  const checkCall = (mock: ReturnType<typeof stubRelated>) => mock.mock.calls.find(([u]) => String(u).includes('/api/check-pdfs'));

  it('related: pool of 40 (open-access only), excludes current paper, sends PDF candidates to the checker', async () => {
    const mock = stubRelated(Array.from({ length: 40 }, (_, i) => work(i)), () => true);
    const related = await fetchRelatedWorks('T1', 'W7'); // W7 is a tier-4 paper and the current one
    const searchParams = new URL(String(mock.mock.calls[0][0])).searchParams;
    expect(searchParams.get('per_page')).toBe('40');
    expect(searchParams.get('filter')).toBe('is_oa:true,primary_topic.id:T1');
    const [, init] = checkCall(mock)!;
    const sent = (JSON.parse(init?.body ?? '{}') as { urls: string[] }).urls;
    expect(init).toMatchObject({ method: 'POST' });
    expect(sent).not.toContain('https://arxiv.org/pdf/7');
    expect(sent).toHaveLength(29); // 40 works - 10 without a PDF - the current paper
    expect(related).toHaveLength(4);
    expect(related.some((p) => p.id.endsWith('/W7'))).toBe(false);
  });

  it('related: verified papers outrank unverified ones, even when the heuristic liked the unverified more', async () => {
    // W3 & W7 are arXiv (tier 4) but fail verification; W2 & W6 (tier 2) & W1 (tier 1) pass.
    const results = [1, 2, 3, 6, 7, 5].map(work);
    stubRelated(results, (url) => !url.includes('arxiv.org'));
    const related = await fetchRelatedWorks('T1', 'W999');
    expect(related.slice(0, 4).map((p) => p.title)).toEqual(['Paper 2', 'Paper 6', 'Paper 1', 'Paper 5']);
    expect(related.every((p) => !p.pdfUrl?.includes('arxiv.org'))).toBe(true);
  });

  it('related: tops up with the best unverified works when fewer than 4 are confirmed', async () => {
    stubRelated([0, 1, 2, 3, 4, 5].map(work), (url) => url.includes('pub.org')); // only W2 confirmed
    const related = await fetchRelatedWorks('T1', 'W999');
    expect(related.map((p) => p.title)).toEqual(['Paper 2', 'Paper 3', 'Paper 1', 'Paper 5']);
  });

  it('related: degrades to heuristic order when the checker is unreachable', async () => {
    stubRelated([0, 1, 2, 3, 4, 5].map(work), () => true, 'down');
    const related = await fetchRelatedWorks('T1', 'W999');
    expect(related.map((p) => p.pdfTier)).toEqual([4, 2, 1, 1]);
  });

  it('verifyPdfUrls returns only URLs confirmed true, and null on malformed answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: { a: true, b: false, c: true } }) }));
    expect([...(await verifyPdfUrls(['a', 'b', 'c']))!].sort()).toEqual(['a', 'c']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: 1 }) }));
    expect(await verifyPdfUrls(['a'])).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await verifyPdfUrls(['a'])).toBeNull();
  });
});

describe('default view: verified-thumbnail papers first', () => {
  const featuredIds = ['W1', 'W2', 'W3'];
  const raw = (id: string) => ({
    id: `https://openalex.org/${id}`,
    title: `Paper ${id}`,
    primary_location: { pdf_url: `https://arxiv.org/pdf/${id}`, source: { type: 'repository' } },
  });
  const ok = (body: unknown) => ({ ok: true, json: async () => body });

  /** Simulates the server's featured list, OpenAlex's by-id lookup (returned reversed on purpose) and the rest query. */
  const stub = (opts: { ready?: boolean } = {}) => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/api/research/featured')) {
          return ok({ ready: opts.ready ?? true, items: featuredIds.map((id) => ({ id: `https://openalex.org/${id}`, pdfUrl: `https://arxiv.org/pdf/${id}` })) });
        }
        const params = new URL(url).searchParams;
        const filter = params.get('filter') ?? '';
        if (filter.startsWith('openalex:') && !filter.includes(',')) return ok({ results: [...featuredIds].reverse().map(raw) });
        const page = Number(params.get('page'));
        const size = Number(params.get('per_page'));
        return ok({ meta: { count: 1000 }, results: Array.from({ length: size }, (_, i) => raw(`R${(page - 1) * size + i}`)) });
      }),
    );
    return urls;
  };
  const restCalls = (urls: string[]) => urls.filter((u) => u.includes('api.openalex.org') && (new URL(u).searchParams.get('filter') ?? '').includes(',openalex:!'));

  it('detects the default view only when nothing is searched or filtered', () => {
    expect(isDefaultView({})).toBe(true);
    expect(isDefaultView({ query: '   ' })).toBe(true);
    expect(isDefaultView({ query: 'x' })).toBe(false);
    expect(isDefaultView({ category: 'Robotics & Automation' })).toBe(false);
    expect(isDefaultView({ language: 'ar' })).toBe(false);
    expect(isDefaultView({ sort: 'newest' })).toBe(false);
  });

  it('page fully inside the featured list: server order, thumbnails, real total count', async () => {
    const urls = stub();
    const { papers, totalCount } = await fetchOpenAlexPapers({ page: 1, perPage: 2 });
    expect(papers.map((p) => p.title)).toEqual(['Paper W1', 'Paper W2']); // server order, not OpenAlex's reversed order
    expect(papers[0].thumbUrl).toBe(`/api/pdf-thumb?url=${encodeURIComponent('https://arxiv.org/pdf/W1')}`);
    expect(totalCount).toBe(1003);
    expect(new URL(restCalls(urls)[0]).searchParams.get('per_page')).toBe('1'); // count-only request
  });

  it('page straddling the boundary: last featured paper, then the first non-featured one, with exclusion', async () => {
    const urls = stub();
    const { papers, totalCount } = await fetchOpenAlexPapers({ page: 2, perPage: 2 });
    expect(papers.map((p) => p.title)).toEqual(['Paper W3', 'Paper R0']);
    expect(papers[0].thumbUrl).toBeDefined();
    expect(papers[1].thumbUrl).toBeUndefined();
    expect(totalCount).toBe(1003);
    expect(new URL(restCalls(urls)[0]).searchParams.get('filter')).toContain(',openalex:!W1|W2|W3');
  });

  it('page after the boundary that spans two rest pages, without gaps or repeats', async () => {
    const urls = stub();
    const { papers } = await fetchOpenAlexPapers({ page: 3, perPage: 2 }); // global 4..5 -> rest 1..2
    expect(papers.map((p) => p.title)).toEqual(['Paper R1', 'Paper R2']);
    expect(restCalls(urls)).toHaveLength(2);
  });

  it('falls back to the normal query when the server list is not ready', async () => {
    const urls = stub({ ready: false });
    const { papers } = await fetchOpenAlexPapers({ page: 1, perPage: 2 });
    expect(papers.every((p) => p.thumbUrl === undefined)).toBe(true);
    expect(restCalls(urls)).toHaveLength(0);
  });

  it('never asks for the featured list when the user searches or filters', async () => {
    const urls = stub();
    await fetchOpenAlexPapers({ query: 'mechatronics', page: 1, perPage: 2 });
    await fetchOpenAlexPapers({ category: 'Robotics & Automation', page: 1, perPage: 2 });
    expect(urls.some((u) => u.includes('/api/research/featured'))).toBe(false);
  });
});
