import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type MeshLookupItem = {
  label?: string;
  resource?: string;
};

const MESH_LOOKUP_URL = 'https://id.nlm.nih.gov/mesh/lookup/descriptor';
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }
  if (q.length > 80) {
    return NextResponse.json({ error: 'query too long' }, { status: 400 });
  }

  try {
    const signal = AbortSignal.timeout(6000);
    let suggestions = await fetchMeshSuggestions(q, signal);
    for (const fallback of fallbackQueries(q)) {
      if (suggestions.length > 0) break;
      suggestions = await fetchMeshSuggestions(fallback, signal);
    }
    const normalizedQuery = normalizeMeshTerm(q);
    const exact = suggestions.find((item) => normalizeMeshTerm(item.label) === normalizedQuery) ?? null;

    return NextResponse.json(
      { suggestions, exact },
      { headers: { 'Cache-Control': CACHE_CONTROL } },
    );
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}

async function fetchMeshSuggestions(query: string, signal: AbortSignal): Promise<Array<Required<MeshLookupItem>>> {
  const url = new URL(MESH_LOOKUP_URL);
  url.searchParams.set('label', query);
  url.searchParams.set('match', 'contains');
  url.searchParams.set('limit', '10');

  const res = await fetch(url, {
    signal,
    headers: { accept: 'application/json' },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) return [];

  const raw = await res.json();
  const items: MeshLookupItem[] = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return items
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label.trim() : '',
      resource: typeof item.resource === 'string' ? item.resource : '',
    }))
    .filter((item): item is Required<MeshLookupItem> => {
      if (!item.label || !item.resource) return false;
      const key = item.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function fallbackQueries(query: string): string[] {
  const normalized = query
    .replace(/\b(primary|modified|adjusted|indexed|index|score|ratio)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized && normalized.toLowerCase() !== query.toLowerCase() ? [normalized] : [];
}

function normalizeMeshTerm(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-‐‑‒–—]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
