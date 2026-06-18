import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type MeshLookupItem = {
  label?: string;
  resource?: string;
};

const MESH_LOOKUP_URL = 'https://id.nlm.nih.gov/mesh/lookup/descriptor';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }
  if (q.length > 80) {
    return NextResponse.json({ error: 'query too long' }, { status: 400 });
  }

  const url = new URL(MESH_LOOKUP_URL);
  url.searchParams.set('label', q);
  url.searchParams.set('match', 'contains');
  url.searchParams.set('limit', '10');

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: 'application/json' },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }
    const raw = await res.json();
    const items: MeshLookupItem[] = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const suggestions = items
      .map((item) => ({
        label: typeof item.label === 'string' ? item.label.trim() : '',
        resource: typeof item.resource === 'string' ? item.resource : '',
      }))
      .filter((item) => {
        if (!item.label) return false;
        const key = item.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

    return NextResponse.json(
      { suggestions },
      { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
    );
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
