import type { Ref } from '@/store/types';

const OPENALEX_BASE = 'https://api.openalex.org';

type OpenAlexWork = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  abstract_inverted_index?: Record<string, number[]>;
  publication_year?: number;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
  biblio?: { volume?: string; issue?: string; first_page?: string; last_page?: string };
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

export type OpenAlexOptions = {
  mailto?: string;
  fromYear?: number;
  toYear?: number;
};

function cleanDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)]+$/, '')
    .trim();
}

export async function getOpenAlexByDoi(doi: string, opts: OpenAlexOptions = {}): Promise<Partial<Ref> | null> {
  const cleaned = cleanDoi(doi);
  const params = new URLSearchParams();
  const mailto = opts.mailto || 'polite@article-editor.com';
  params.set('mailto', mailto);
  const url = `${OPENALEX_BASE}/works/doi:${encodeURIComponent(cleaned)}${params.toString() ? `?${params}` : ''}`;
  try {
    const res = await fetchWithTimeout(url, 10000, {
      headers: { Accept: 'application/json', 'User-Agent': 'ArticleEditor/0.1' },
    });
    if (!res.ok) return null;
    const work = (await res.json()) as OpenAlexWork;
    return toPartialRef(work);
  } catch {
    return null;
  }
}

export type OpenAlexResult = Partial<Ref> & { doi?: string; openalexId?: string };

export async function searchOpenAlex(query: string, opts: OpenAlexOptions = {}): Promise<OpenAlexResult[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: '5',
  });
  const mailto = opts.mailto || 'polite@article-editor.com';
  params.set('mailto', mailto);
  const filters: string[] = [];
  if (opts.fromYear && opts.toYear) {
    filters.push(`publication_year:${opts.fromYear}-${opts.toYear}`);
  } else if (opts.fromYear) {
    filters.push(`from_publication_date:${opts.fromYear}-01-01`);
  } else if (opts.toYear) {
    filters.push(`to_publication_date:${opts.toYear}-12-31`);
  }
  if (filters.length > 0) params.set('filter', filters.join(','));
  const url = `${OPENALEX_BASE}/works?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url, 10000, {
      headers: { Accept: 'application/json', 'User-Agent': 'ArticleEditor/0.1' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: OpenAlexWork[] };
    return (json.results ?? []).map(toPartialRef);
  } catch {
    return [];
  }
}

function toPartialRef(w: OpenAlexWork): OpenAlexResult {
  const doi = w.doi ? w.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '') : undefined;
  const authors = (w.authorships ?? [])
    .map((a) => {
      const name = a.author?.display_name;
      if (!name) return undefined;
      const parts = name.split(/\s+/);
      if (parts.length >= 2) return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
      return { family: name };
    })
    .filter(Boolean) as Array<{ family?: string; given?: string }>;
  return {
    title: w.title,
    abstract: w.abstract_inverted_index ? reconstructAbstract(w.abstract_inverted_index) : undefined,
    year: w.publication_year,
    containerTitle: w.primary_location?.source?.display_name,
    volume: w.biblio?.volume,
    issue: w.biblio?.issue,
    pages: joinPages(w.biblio?.first_page, w.biblio?.last_page),
    doi,
    authors,
    openalexId: w.id,
  };
}

function joinPages(first?: string, last?: string): string | undefined {
  if (first && last) return `${first}-${last}`;
  return first || last;
}

// OpenAlex returns abstracts as inverted index { "word": [positions...] }.
// Reconstruct linear text.
function reconstructAbstract(inv: Record<string, number[]>): string {
  const tokens: Array<{ pos: number; word: string }> = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const p of positions) tokens.push({ pos: p, word });
  }
  tokens.sort((a, b) => a.pos - b.pos);
  return tokens.map((t) => t.word).join(' ');
}
