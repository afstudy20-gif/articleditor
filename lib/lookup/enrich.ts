import type { Ref } from '@/store/types';
import { searchCrossRef, getCrossRefByDoi } from './crossref';
import { searchPubmed, fetchPubmedSummaries, fetchPubmedAbstract } from './pubmed';
import { getOpenAlexByDoi, searchOpenAlex } from './openalex';

export type EnrichOptions = {
  mailto?: string;
  ncbiKey?: string;
  ncbiEmail?: string;
};

function cleanDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)]+$/, '')
    .trim();
}

export async function enrichRef(ref: Ref, opts: EnrichOptions = {}): Promise<Ref> {
  let enriched = ref;
  if (enriched.doi) {
    enriched.doi = cleanDoi(enriched.doi);
  }

  const MATCH_THRESHOLD = 0.45;

  if (enriched.doi) {
    const fresh = await getCrossRefByDoi(enriched.doi, { mailto: opts.mailto }).catch(() => null);
    if (fresh) enriched = mergeRef(enriched, fresh);
  } else {
    const query = buildQuery(ref);
    if (query) {
      const candidates: Ref[] = [];

      const cr = await searchCrossRef(query, { mailto: opts.mailto, rows: 5 }).catch(() => null);
      if (cr) candidates.push(...cr.refs);

      // OpenAlex search — independent fallback, often better metadata than CrossRef alone.
      const oa = await searchOpenAlex(query, { mailto: opts.mailto }).catch(() => []);
      for (let i = 0; i < oa.length; i += 1) {
        const o = oa[i];
        candidates.push({
          id: `oa-${o.openalexId ?? i}`,
          type: 'journal-article',
          authors: o.authors ?? [],
          title: o.title,
          containerTitle: o.containerTitle,
          year: o.year,
          volume: o.volume,
          issue: o.issue,
          pages: o.pages,
          doi: o.doi,
          abstract: o.abstract,
        });
      }

      const best = pickBestMatch(ref, candidates);
      if (best && best.score >= MATCH_THRESHOLD) {
        enriched = mergeRef(enriched, best.candidate);
      } else {
        const pmids = await searchPubmed(query, {
          apiKey: opts.ncbiKey,
          email: opts.ncbiEmail,
          retmax: 5,
        }).catch(() => [] as string[]);
        if (pmids.length > 0) {
          const summaries = await fetchPubmedSummaries(pmids, {
            apiKey: opts.ncbiKey,
            email: opts.ncbiEmail,
          }).catch(() => [] as Ref[]);
          const pmBest = pickBestMatch(ref, summaries);
          if (pmBest && pmBest.score >= MATCH_THRESHOLD) {
            enriched = mergeRef(enriched, pmBest.candidate);
          }
        }
      }
    }
  }

  // OpenAlex pass: fills abstract that CrossRef Elsevier records skip.
  if (enriched.doi && !enriched.abstract) {
    const oa = await getOpenAlexByDoi(enriched.doi, { mailto: opts.mailto }).catch(() => null);
    if (oa) enriched = mergePartial(enriched, oa);
  }

  // PubMed efetch pass: if still no abstract but ref has DOI/title, try to find PMID then efetch.
  if (!enriched.abstract && (enriched.doi || enriched.title || enriched.pmid)) {
    let pmid: string | undefined = enriched.pmid;
    if (!pmid && enriched.doi) {
      // PubMed esearch needs [doi] field tag for exact DOI lookup, otherwise
      // it tokenizes the DOI string and returns unrelated papers.
      const pmids = await searchPubmed(`${enriched.doi}[doi]`, {
        apiKey: opts.ncbiKey,
        email: opts.ncbiEmail,
        retmax: 1,
      }).catch(() => [] as string[]);
      pmid = pmids[0];
    }
    if (!pmid && enriched.title) {
      // Title + first author family + year — narrowest field-tagged query.
      const parts = [`${enriched.title}[Title]`];
      const fam = enriched.authors[0]?.family;
      if (fam) parts.push(`${fam}[Author]`);
      if (enriched.year) parts.push(`${enriched.year}[PDAT]`);
      const pmids = await searchPubmed(parts.join(' AND '), {
        apiKey: opts.ncbiKey,
        email: opts.ncbiEmail,
        retmax: 1,
      }).catch(() => [] as string[]);
      pmid = pmids[0];
    }
    if (pmid) {
      const abs = await fetchPubmedAbstract(pmid, { apiKey: opts.ncbiKey, email: opts.ncbiEmail }).catch(
        () => null,
      );
      if (abs) {
        enriched = { ...enriched, abstract: abs, pmid: enriched.pmid || pmid };
      } else if (!enriched.pmid) {
        enriched = { ...enriched, pmid };
      }
    }
  }

  return enriched;
}

function mergePartial(original: Ref, partial: Partial<Ref>): Ref {
  return {
    ...original,
    abstract: original.abstract || partial.abstract,
    containerTitle: original.containerTitle || partial.containerTitle,
    volume: original.volume || partial.volume,
    issue: original.issue || partial.issue,
    pages: original.pages || partial.pages,
    year: original.year || partial.year,
  };
}

type MatchResult = { candidate: Ref; score: number };

function pickBestMatch(original: Ref, candidates: Ref[]): MatchResult | null {
  if (candidates.length === 0) return null;
  let best: MatchResult | null = null;
  for (const c of candidates) {
    const s = matchScore(original, c);
    if (!best || s > best.score) best = { candidate: c, score: s };
  }
  return best;
}

function cleanTextForMatching(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Heuristic similarity score in [0, 1].
function matchScore(orig: Ref, cand: Ref): number {
  let score = 0;
  const yearOrig = orig.year;
  const yearCand = cand.year;
  if (yearOrig && yearCand) {
    if (yearOrig === yearCand) score += 0.25;
    else if (Math.abs(yearOrig - yearCand) === 1) score += 0.1;
  }
  // First author family match (case-insensitive, normalized).
  const a1 = normFam(orig.authors[0]?.family ?? orig.authors[0]?.literal ?? orig.authors[0]?.given);
  const a2 = normFam(cand.authors[0]?.family ?? cand.authors[0]?.literal ?? cand.authors[0]?.given);
  if (a1 && a2) {
    if (a1 === a2) {
      score += 0.3;
    } else if (a1.includes(a2) || a2.includes(a1)) {
      score += 0.15;
    } else {
      // First author mismatch penalty!
      score -= 0.3;
    }
  } else if (a1 && !a2) {
    // Original has author, candidate does not (poor metadata / corrigendum).
    score -= 0.15;
  }
  // Title token overlap.
  const t1 = tokenize(orig.title);
  const t2 = tokenize(cand.title);
  if (t1.size > 0 && t2.size > 0) {
    let common = 0;
    for (const w of t1) if (t2.has(w)) common++;
    const overlap = common / Math.max(t1.size, 1);
    score += Math.min(0.45, overlap * 0.5);
  }
  return Math.min(1, Math.max(0, score));
}

function normFam(s: string | undefined): string {
  if (!s) return '';
  return cleanTextForMatching(s).replace(/[^a-z]/g, '');
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'with', 'to', 'from',
  'by', 'at', 'as', 'is', 'are', 'be', 'been', 'this', 'that', 'these', 'those',
  've', 'ile', 'bir', 'de', 'da',
]);

function tokenize(s: string | undefined): Set<string> {
  if (!s) return new Set();
  const cleaned = cleanTextForMatching(s);
  const out = new Set<string>();
  for (const raw of cleaned.split(/[^a-z0-9]+/g)) {
    const w = raw.trim();
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

function buildQuery(ref: Ref): string {
  const parts: string[] = [];
  if (ref.title) parts.push(ref.title);
  if (ref.authors[0]?.family) parts.push(ref.authors[0].family);
  if (ref.year) parts.push(String(ref.year));
  if (parts.length === 0 && ref.raw) parts.push(ref.raw.slice(0, 240));
  return parts.join(' ').trim();
}

function mergeRef(original: Ref, fresh: Ref): Ref {
  return {
    ...original,
    type: fresh.type || original.type,
    authors: fresh.authors.length > 0 ? fresh.authors : original.authors,
    title: fresh.title || original.title,
    containerTitle: fresh.containerTitle || original.containerTitle,
    year: fresh.year || original.year,
    volume: fresh.volume || original.volume,
    issue: fresh.issue || original.issue,
    pages: fresh.pages || original.pages,
    publisher: fresh.publisher || original.publisher,
    doi: fresh.doi || original.doi,
    pmid: fresh.pmid || original.pmid,
    url: fresh.url || original.url,
    abstract: fresh.abstract || original.abstract,
    confidence: Math.max(original.confidence ?? 0, fresh.confidence ?? 0),
  };
}
