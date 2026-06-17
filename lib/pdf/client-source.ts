/** Client-side PDF URL resolution and fetch (POST avoids WAF blocks on ?url= query strings). */

export async function resolvePdfUrl(source: string): Promise<string> {
  const response = await fetch('/api/pdf-resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: source }),
  });
  if (!response.ok) return source;
  const data = (await response.json()) as { pdfUrl?: string };
  return data.pdfUrl?.trim() || source;
}

export async function fetchPdfBytes(source: string): Promise<Uint8Array> {
  const response = await fetch('/api/pdf-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: source }),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return new Uint8Array(await response.arrayBuffer());
}