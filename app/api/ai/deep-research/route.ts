import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Ref } from '@/store/types';
import { generateStructured, isAIConfigured, AIError, configFromHeaders } from '@/lib/ai/provider';
import { DeepResearchResult } from '@/lib/ai/schemas';
import { searchCrossRef } from '@/lib/lookup/crossref';
import { searchOpenAlex } from '@/lib/lookup/openalex';
import { searchPubmed, fetchPubmedSummaries } from '@/lib/lookup/pubmed';

export const runtime = 'nodejs';

const BodySchema = z.object({
  title: z.string().max(500).optional(),
  abstract: z.string().min(50).max(8_000),
  outline: z.string().max(4_000).optional(),
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SUBQUERY_SYSTEM_TR =
  'Sen bir bilim editörüsün. Verilen makale özetinden ilgili literatürü taramak için ' +
  '5 adet farklı, dar kapsamlı arama sorgusu üretirsin. Sorgular İngilizce, akademik ' +
  'literatür terminolojisi kullanır.';

const SUBQUERY_SYSTEM_EN =
  'You are a science editor. Generate 5 distinct, narrowly-scoped search queries to ' +
  'survey related literature for the given manuscript. Queries in English.';

const SubQuerySchema = z.object({
  queries: z.array(z.string().min(5).max(200)).min(2).max(8),
});

const CLUSTER_SYSTEM_TR =
  'Sen bir akademik editörsün. Aday referanslardan tematik kümeler oluşturur, her küme için ' +
  'kısa bir özet ve makale konumlandırma için bir "takeaway" üretirsin. Aday listesinde ' +
  'olmayan referanslara atıfta bulunma.';

const CLUSTER_SYSTEM_EN =
  'You are an academic editor. Cluster the candidate references into themes; for each cluster ' +
  'produce a summary and a positioning takeaway. Do not invent refs.';

function dedupeRefs(refs: Ref[]): Ref[] {
  const map = new Map<string, Ref>();
  for (const r of refs) {
    const key = r.doi ? `doi:${r.doi.toLowerCase().trim()}` : r.pmid ? `pmid:${r.pmid}` : `t:${(r.title ?? '').toLowerCase().slice(0, 80)}`;
    if (!key.trim()) continue;
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values());
}

export async function POST(req: Request) {
  const cfg = configFromHeaders(req.headers);
  if (!isAIConfigured(cfg)) {
    return NextResponse.json(
      { error: 'AI configured değil. GEMINI_API_KEY veya benzeri ayarlanmalı.' },
      { status: 503 },
    );
  }
  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid body';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const mailto = process.env.CROSSREF_MAILTO;
  const ncbiKey = process.env.NCBI_API_KEY;
  const ncbiEmail = process.env.NCBI_EMAIL;

  try {
    // 1. Sub-query generation.
    const subqPrompt = [
      body.lang === 'tr'
        ? 'Aşağıdaki makale özetinden 5 farklı, dar kapsamlı, İngilizce literatür arama sorgusu üret.'
        : 'Generate 5 distinct narrow-scope literature search queries (English) for the abstract.',
      body.title ? `Başlık: ${body.title}` : '',
      `Özet:\n${body.abstract}`,
      body.outline ? `Outline:\n${body.outline}` : '',
      'JSON: {"queries":["q1","q2",...]}',
    ]
      .filter(Boolean)
      .join('\n\n');

    const subq = await generateStructured(subqPrompt, SubQuerySchema, {
      system: body.lang === 'tr' ? SUBQUERY_SYSTEM_TR : SUBQUERY_SYSTEM_EN,
      temperature: 0.5,
      maxTokens: 1024,
      config: cfg,
    });

    // 2. Parallel retrieval across CrossRef + OpenAlex + PubMed per sub-query.
    const allRefs: Ref[] = [];
    await Promise.all(
      subq.queries.slice(0, 5).map(async (q) => {
        const [cr, oa, pm] = await Promise.allSettled([
          searchCrossRef(q, { mailto, rows: 5 }),
          searchOpenAlex(q, { mailto }),
          (async () => {
            const ids = await searchPubmed(q, { apiKey: ncbiKey, email: ncbiEmail, retmax: 5 });
            return ids.length === 0 ? [] : fetchPubmedSummaries(ids, { apiKey: ncbiKey, email: ncbiEmail });
          })(),
        ]);
        if (cr.status === 'fulfilled') allRefs.push(...cr.value.refs);
        if (oa.status === 'fulfilled') {
          allRefs.push(
            ...oa.value.map((o, i) => ({
              id: `oa-dr-${i}-${Math.random().toString(36).slice(2, 8)}`,
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
            })),
          );
        }
        if (pm.status === 'fulfilled') allRefs.push(...pm.value);
      }),
    );

    const deduped = dedupeRefs(allRefs).slice(0, 30); // cap to keep LLM input reasonable

    // 3. LLM clusters the candidates by theme.
    const candidates = deduped.map((r, i) => ({
      id: `c${i}`,
      title: r.title,
      year: r.year,
      first_author: r.authors[0]?.family || r.authors[0]?.literal,
      doi: r.doi,
      abstract: r.abstract?.slice(0, 600),
    }));

    const clusterPrompt = [
      body.lang === 'tr'
        ? 'Aşağıdaki aday referansları 3-6 tematik küme halinde grupla. Her küme için kısa bir özet ve makale konumlandırması için bir "takeaway" üret. ref_ids alanında sadece aday listesindeki id\'leri kullan.'
        : 'Cluster the candidates into 3-6 thematic groups. For each cluster produce a summary and a positioning takeaway. Use only ids from the candidate list in ref_ids.',
      body.title ? `Makale başlığı: ${body.title}` : '',
      `Makale özeti:\n${body.abstract}`,
      `Aday referanslar:\n${JSON.stringify(candidates, null, 2)}`,
      'JSON: {"clusters":[{"theme":"...","ref_ids":["c0","c2"],"summary":"...","takeaway":"..."}],"positioning":"genel konumlandırma"}',
    ]
      .filter(Boolean)
      .join('\n\n');

    const clusters = await generateStructured(clusterPrompt, DeepResearchResult, {
      system: body.lang === 'tr' ? CLUSTER_SYSTEM_TR : CLUSTER_SYSTEM_EN,
      temperature: 0.3,
      maxTokens: 3072,
      config: cfg,
    });

    // 4. Map ref_ids back to full Ref objects.
    const idToRef = new Map(candidates.map((c, i) => [c.id, deduped[i]]));
    const enriched = clusters.clusters.map((c) => ({
      theme: c.theme,
      summary: c.summary,
      takeaway: c.takeaway,
      refs: c.ref_ids.map((id) => idToRef.get(id)).filter((r): r is Ref => Boolean(r)),
    }));

    return NextResponse.json({
      clusters: enriched,
      positioning: clusters.positioning,
      queries: subq.queries,
    });
  } catch (err) {
    const status = err instanceof AIError && err.stage === 'config' ? 503 : 500;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status });
  }
}
