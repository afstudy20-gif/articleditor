import type { Ref, Author } from '@/store/types';

const CROSSREF_BASE = 'https://api.crossref.org';

type CrossRefWork = {
  DOI?: string;
  title?: string[];
  'container-title'?: string[];
  author?: Array<{ family?: string; given?: string }>;
  issued?: { 'date-parts'?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  URL?: string;
  type?: string;
  score?: number;
  abstract?: string;
  subtitle?: string[];
};

export type CrossRefSearchOptions = {
  mailto?: string;
  rows?: number;
  fromYear?: number;
  toYear?: number;
};

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchCrossRef(
  query: string,
  opts: CrossRefSearchOptions = {},
): Promise<{ refs: Ref[]; raw: CrossRefWork[] }> {
  const rows = opts.rows ?? 5;
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(rows),
  });
  if (opts.mailto) params.set('mailto', opts.mailto);
  const filters: string[] = [];
  if (opts.fromYear) filters.push(`from-pub-date:${opts.fromYear}`);
  if (opts.toYear) filters.push(`until-pub-date:${opts.toYear}-12-31`);
  if (filters.length > 0) params.set('filter', filters.join(','));
  const url = `${CROSSREF_BASE}/works?${params.toString()}`;
  const res = await fetchWithTimeout(url, 12000, {
    headers: { Accept: 'application/json', 'User-Agent': 'ARTED/0.1 (mailto:' + (opts.mailto ?? 'noreply@arted') + ')' },
  });
  if (!res.ok) throw new Error(`CrossRef search failed: ${res.status}`);
  const json = (await res.json()) as { message?: { items?: CrossRefWork[] } };
  const items = json.message?.items ?? [];
  return { refs: items.map((it, i) => crossRefToRef(it, `cr${i}`)), raw: items };
}

function cleanDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)]+$/, '')
    .trim();
}

export async function getCrossRefByDoi(doi: string, opts: CrossRefSearchOptions = {}): Promise<Ref | null> {
  const cleaned = cleanDoi(doi);
  const params = new URLSearchParams();
  if (opts.mailto) params.set('mailto', opts.mailto);
  const url = `${CROSSREF_BASE}/works/${encodeURIComponent(cleaned)}${params.toString() ? `?${params}` : ''}`;
  const res = await fetchWithTimeout(url, 12000, {
    headers: { Accept: 'application/json', 'User-Agent': 'ArticleEditor/0.1' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { message?: CrossRefWork };
  if (!json.message) return null;
  return crossRefToRef(json.message, `doi-${cleaned}`);
}

function crossRefToRef(it: CrossRefWork, id: string): Ref {
  const authors: Author[] = (it.author ?? []).map((a) => ({ family: a.family, given: a.given }));
  const year =
    it.issued?.['date-parts']?.[0]?.[0] != null ? Number(it.issued['date-parts'][0][0]) : undefined;
  return {
    id,
    type: mapType(it.type),
    authors,
    title: (it.title && it.title[0]) || undefined,
    containerTitle: (it['container-title'] && it['container-title'][0]) || undefined,
    year,
    volume: it.volume,
    issue: it.issue,
    pages: it.page,
    publisher: it.publisher,
    doi: it.DOI,
    url: it.URL,
    abstract: it.abstract ? stripJatsTags(it.abstract) : undefined,
    confidence: it.score ? Math.min(1, it.score / 100) : undefined,
  };
}

function stripJatsTags(s: string): string {
  return s
    .replace(/<jats:title[^>]*>.*?<\/jats:title>/gi, '')
    .replace(/<\/?jats:[^>]+>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapType(t?: string): Ref['type'] {
  switch (t) {
    case 'journal-article':
      return 'journal-article';
    case 'book':
      return 'book';
    case 'book-chapter':
      return 'book-chapter';
    case 'proceedings-article':
      return 'conference-paper';
    case 'report':
      return 'report';
    case 'thesis':
      return 'thesis';
    case 'website':
    case 'page':
      return 'webpage';
    default:
      return 'journal-article';
  }
}
