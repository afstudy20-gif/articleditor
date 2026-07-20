import type { Ref } from '@/store/types';

/**
 * Best-effort DOI/title enrichment via the server lookup proxy — only
 * title + first author + year (or a DOI) ever leaves the browser.
 * Returns the input ref unchanged on any failure.
 */
export async function enrichRefViaServer(ref: Ref): Promise<Ref> {
  try {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'enrich', ref }),
    });
    if (!res.ok) return ref;
    const data = (await res.json().catch(() => null)) as { ref?: Ref } | null;
    return data?.ref ?? ref;
  } catch {
    return ref;
  }
}
