import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enrichRef } from '@/lib/lookup/enrich';
import { searchCrossRef, getCrossRefByDoi } from '@/lib/lookup/crossref';

export const runtime = 'nodejs';

const BodySchema = z.object({
  mode: z.enum(['enrich', 'search', 'doi']),
  ref: z.any().optional(),
  query: z.string().optional(),
  doi: z.string().optional(),
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
      const { refs } = await searchCrossRef(parsed.query, { mailto, rows: 5 });
      return NextResponse.json({ refs });
    }
    if (parsed.mode === 'doi' && parsed.doi) {
      const ref = await getCrossRefByDoi(parsed.doi, { mailto });
      return NextResponse.json({ ref });
    }
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
