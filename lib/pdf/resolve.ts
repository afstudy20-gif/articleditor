import { extractPmcid, pickCrossrefPdfUrl, sanitizePdfUrl } from './proxy';

/** Europe PMC serves PMC PDFs with CORS * and works from our production server (SciELO often does not). */
export function europePmcPdfUrl(pmcid: string): URL | null {
  const id = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
  return sanitizePdfUrl(`https://europepmc.org/api/getPdf?pmcid=${encodeURIComponent(id)}`);
}

async function resolvePmcViaCrossref(pmcid: string): Promise<URL | null> {
  const ids = new URL('https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/');
  ids.searchParams.set('ids', pmcid);
  ids.searchParams.set('format', 'json');
  ids.searchParams.set('tool', 'arted');
  ids.searchParams.set('email', process.env.NCBI_EMAIL || 'adycovs@gmail.com');
  const idResponse = await fetch(ids, { signal: AbortSignal.timeout(10_000) });
  if (!idResponse.ok) return null;
  const idData = (await idResponse.json()) as { records?: Array<{ doi?: string }> };
  const doi = idData.records?.[0]?.doi;
  if (!doi) return null;

  const mailto = process.env.CROSSREF_MAILTO || 'adycovs@gmail.com';
  const crossref = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(mailto)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!crossref.ok) return null;
  const data = (await crossref.json()) as {
    message?: { link?: Array<{ URL?: string; 'content-type'?: string }> };
  };
  return pickCrossrefPdfUrl(data.message?.link);
}

export async function resolvePmcPdfUrl(pmcid: string): Promise<URL | null> {
  return europePmcPdfUrl(pmcid) ?? resolvePmcViaCrossref(pmcid);
}

/** Resolve publisher HTML links (e.g. PMC /pdf/ paths) to a direct HTTPS PDF URL when possible. */
export async function resolvePdfSource(raw: string | null | undefined): Promise<URL | null> {
  const initial = sanitizePdfUrl(raw);
  if (!initial) return null;

  const pmcid = extractPmcid(initial);
  if (pmcid) {
    return (await resolvePmcPdfUrl(pmcid)) ?? initial;
  }

  return initial;
}

export function decodeProxyUrlParam(
  searchParams: URLSearchParams,
): URL | null {
  const encoded = searchParams.get('b');
  if (encoded) {
    try {
      const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padLen = (4 - (padded.length % 4)) % 4;
      const decoded = Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
      return sanitizePdfUrl(decoded);
    } catch {
      return null;
    }
  }
  return sanitizePdfUrl(searchParams.get('url'));
}