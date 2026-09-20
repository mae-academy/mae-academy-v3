import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildOpenAlexUrl, fetchOpenAlexPapers, reconstructAbstract, OpenAlexError } from './openalex';

const q = (url: string) => new URL(url).searchParams;

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
