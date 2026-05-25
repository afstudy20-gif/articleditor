import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Ref } from '@/store/types';
import { enrichRef } from '@/lib/lookup/enrich';
import { searchCrossRef, getCrossRefByDoi } from '@/lib/lookup/crossref';
import { searchPubmed, fetchPubmedSummaries } from '@/lib/lookup/pubmed';
import { searchOpenAlex } from '@/lib/lookup/openalex';

export const runtime = 'nodejs';

const BodySchema = z.object({
  mode: z.enum(['enrich', 'search', 'doi']),
  ref: z.any().optional(),
  query: z.string().optional(),
  doi: z.string().optional(),
  fromYear: z.number().int().min(1700).max(2100).optional(),
  toYear: z.number().int().min(1700).max(2100).optional(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const mailto = process.env.CROSSREF_MAILTO;
  const ncbiKey = process.env.NCBI_API_KEY;
  const ncbiEmail = process.env.NCBI_EMAIL;

  try {
    if (parsed.mode === 'enrich' && parsed.ref) {
      const enriched = await enrichRef(parsed.ref, { mailto, ncbiKey, ncbiEmail });
      return NextResponse.json({ ref: enriched });
    }
    if (parsed.mode === 'search' && parsed.query) {
      const q = parsed.query;
      const fromYear = parsed.fromYear;
      const toYear = parsed.toYear;
      // PubMed year filter: AND YYYY[PDAT] for single year, AND YYYY:YYYY[PDAT] for range.
      let pmQuery = q;
      if (fromYear && toYear) pmQuery = `${q} AND ${fromYear}:${toYear}[PDAT]`;
      else if (fromYear) pmQuery = `${q} AND ${fromYear}:3000[PDAT]`;
      else if (toYear) pmQuery = `${q} AND 1700:${toYear}[PDAT]`;
      const [crResult, oaResult, pmResult] = await Promise.allSettled([
        searchCrossRef(q, { mailto, rows: 5, fromYear, toYear }),
        searchOpenAlex(q, { mailto, fromYear, toYear }),
        (async () => {
          const ids = await searchPubmed(pmQuery, { apiKey: ncbiKey, email: ncbiEmail, retmax: 5 });
          return ids.length === 0 ? [] : fetchPubmedSummaries(ids, { apiKey: ncbiKey, email: ncbiEmail });
        })(),
      ]);
      const crRefs: Ref[] = crResult.status === 'fulfilled' ? crResult.value.refs : [];
      const oaRefs: Ref[] =
        oaResult.status === 'fulfilled'
          ? oaResult.value.map((o, i) => ({
              id: `oa${i}`,
              type: 'journal-article' as const,
              authors: o.authors ?? [],
              title: o.title,
              containerTitle: o.containerTitle,
              year: o.year,
              volume: o.volume,
              issue: o.issue,
              pages: o.pages,
              doi: o.doi,
              abstract: o.abstract,
            }))
          : [];
      const pmRefs: Ref[] = pmResult.status === 'fulfilled' ? pmResult.value : [];
      const refs = mergeRefs([
        { source: 'CrossRef', refs: crRefs },
        { source: 'PubMed', refs: pmRefs },
        { source: 'OpenAlex', refs: oaRefs },
      ]);
      return NextResponse.json({ refs });
    }
    if (parsed.mode === 'doi' && parsed.doi) {
      const raw = parsed.doi.trim();
      // PMID = pure digits (PubMed IDs are 1-9 digit numbers). Anything else
      // treat as DOI (incl. forms like "https://doi.org/10.x/y" or "doi:10.x/y").
      const isPmid = /^\d{1,9}$/.test(raw);
      if (isPmid) {
        const refs = await fetchPubmedSummaries([raw], { apiKey: ncbiKey, email: ncbiEmail });
        const ref = refs[0] ?? null;
        if (!ref) {
          return NextResponse.json({ error: `PMID ${raw} bulunamadı.` }, { status: 404 });
        }
        return NextResponse.json({ ref });
      }
      const ref = await getCrossRefByDoi(raw, { mailto });
      if (!ref) {
        return NextResponse.json({ error: `DOI bulunamadı: ${raw}` }, { status: 404 });
      }
      return NextResponse.json({ ref });
    }
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

type SourceBatch = { source: string; refs: Ref[] };

// Merge results from multiple sources, deduplicating by DOI (case-insensitive)
// or by normalized title+year fallback. Earlier sources win for primary fields,
// later sources fill missing fields (PMID, abstract, etc.).
function mergeRefs(batches: SourceBatch[]): Ref[] {
  const byKey = new Map<string, Ref>();
  const order: string[] = [];

  function keyFor(r: Ref): string | null {
    if (r.doi) return `doi:${r.doi.toLowerCase().trim()}`;
    if (r.pmid) return `pmid:${r.pmid.trim()}`;
    const t = r.title?.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    if (t) return `t:${t}|${r.year ?? ''}`;
    return null;
  }

  function fill<T>(a: T | undefined, b: T | undefined): T | undefined {
    return a !== undefined && a !== null && a !== ('' as unknown as T) ? a : b;
  }

  for (const batch of batches) {
    for (const r of batch.refs) {
      const k = keyFor(r);
      if (!k) continue;
      const existing = byKey.get(k);
      if (!existing) {
        byKey.set(k, { ...r, source: batch.source });
        order.push(k);
      } else {
        // Fill gaps from later sources; track combined source label.
        const merged: Ref = {
          ...existing,
          authors: existing.authors.length > 0 ? existing.authors : r.authors,
          title: fill(existing.title, r.title),
          containerTitle: fill(existing.containerTitle, r.containerTitle),
          year: fill(existing.year, r.year),
          volume: fill(existing.volume, r.volume),
          issue: fill(existing.issue, r.issue),
          pages: fill(existing.pages, r.pages),
          publisher: fill(existing.publisher, r.publisher),
          doi: fill(existing.doi, r.doi),
          pmid: fill(existing.pmid, r.pmid),
          url: fill(existing.url, r.url),
          abstract: fill(existing.abstract, r.abstract),
          source: existing.source ? `${existing.source}+${batch.source}` : batch.source,
        };
        byKey.set(k, merged);
      }
    }
  }
  return order.map((k) => byKey.get(k)!).filter(Boolean);
}
