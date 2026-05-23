import type { Ref, Author } from '@/store/types';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export type PubmedSearchOptions = {
  apiKey?: string;
  email?: string;
  retmax?: number;
};

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPubmed(
  query: string,
  opts: PubmedSearchOptions = {},
): Promise<string[]> {
  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmode: 'json',
    retmax: String(opts.retmax ?? 5),
  });
  if (opts.apiKey) params.set('api_key', opts.apiKey);
  if (opts.email) params.set('email', opts.email);
  const url = `${EUTILS_BASE}/esearch.fcgi?${params.toString()}`;
  const res = await fetchWithTimeout(url, 10000);
  if (!res.ok) throw new Error(`PubMed esearch failed: ${res.status}`);
  const json = (await res.json()) as { esearchresult?: { idlist?: string[] } };
  return json.esearchresult?.idlist ?? [];
}

export async function fetchPubmedSummaries(
  pmids: string[],
  opts: PubmedSearchOptions = {},
): Promise<Ref[]> {
  if (pmids.length === 0) return [];
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'json',
  });
  if (opts.apiKey) params.set('api_key', opts.apiKey);
  if (opts.email) params.set('email', opts.email);
  const url = `${EUTILS_BASE}/esummary.fcgi?${params.toString()}`;
  const res = await fetchWithTimeout(url, 10000);
  if (!res.ok) throw new Error(`PubMed esummary failed: ${res.status}`);
  const json = (await res.json()) as { result?: Record<string, any> };
  const result = json.result;
  if (!result) return [];
  const out: Ref[] = [];
  for (const pmid of pmids) {
    const item = result[pmid];
    if (!item) continue;
    out.push(summaryToRef(item, pmid));
  }
  return out;
}

export async function fetchPubmedAbstract(pmid: string, opts: PubmedSearchOptions = {}): Promise<string | null> {
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmid,
    retmode: 'xml',
    rettype: 'abstract',
  });
  if (opts.apiKey) params.set('api_key', opts.apiKey);
  if (opts.email) params.set('email', opts.email);
  const url = `${EUTILS_BASE}/efetch.fcgi?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url, 12000);
    if (!res.ok) return null;
    const xml = await res.text();
    // Parse all AbstractText elements (may have multiple labelled sections).
    const segments: string[] = [];
    const re = /<AbstractText[^>]*?(?:Label="([^"]+)")?[^>]*>([\s\S]*?)<\/AbstractText>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const label = m[1];
      const body = m[2]
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      if (!body) continue;
      segments.push(label ? `${label.toUpperCase()}: ${body}` : body);
    }
    return segments.length > 0 ? segments.join('\n\n') : null;
  } catch {
    return null;
  }
}

function summaryToRef(item: any, pmid: string): Ref {
  const authors: Author[] = (item.authors ?? []).map((a: any) => {
    if (!a?.name) return { literal: '' };
    const parts = String(a.name).split(/\s+/);
    if (parts.length >= 2) return { family: parts.slice(0, -1).join(' '), given: parts[parts.length - 1] };
    return { family: a.name };
  });
  const year = item.pubdate ? parseInt(String(item.pubdate).slice(0, 4), 10) : undefined;
  const doi = (item.elocationid && String(item.elocationid).match(/10\.\d{4,9}\/[^\s]+/)?.[0]) || undefined;
  return {
    id: `pmid-${pmid}`,
    type: 'journal-article',
    authors,
    title: item.title,
    containerTitle: item.fulljournalname || item.source,
    year: Number.isFinite(year) ? (year as number) : undefined,
    volume: item.volume,
    issue: item.issue,
    pages: item.pages,
    doi,
    pmid,
  };
}
