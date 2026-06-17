import { NextRequest, NextResponse } from 'next/server';
import { extractPmcid, sanitizePdfUrl } from '@/lib/pdf/proxy';

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function GET(request: NextRequest): Promise<Response> {
  let url = sanitizePdfUrl(request.nextUrl.searchParams.get('url'));
  if (!url) {
    return NextResponse.json({ error: 'Unsupported PDF URL.' }, { status: 400 });
  }

  try {
    const pmcid = extractPmcid(url);
    if (pmcid) {
      url = (await resolvePmcPdf(pmcid)) ?? url;
    }
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'application/pdf',
        'User-Agent': 'ARTED/1.0 (+https://arted.drtr.uk)',
      },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `PDF source returned HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    if (!sanitizePdfUrl(response.url)) {
      return NextResponse.json({ error: 'PDF source redirected to a blocked host.' }, { status: 502 });
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF exceeds the 50 MB limit.' }, { status: 413 });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF exceeds the 50 MB limit.' }, { status: 413 });
    }
    const isPdf =
      response.headers.get('content-type')?.toLowerCase().includes('application/pdf') ||
      new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
    if (!isPdf) {
      return NextResponse.json({ error: 'The source did not return a PDF file.' }, { status: 502 });
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF fetch failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function resolvePmcPdf(pmcid: string): Promise<URL | null> {
  const ids = new URL('https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/');
  ids.searchParams.set('ids', pmcid);
  ids.searchParams.set('format', 'json');
  ids.searchParams.set('tool', 'arted');
  ids.searchParams.set('email', 'adycovs@gmail.com');
  const idResponse = await fetch(ids, { signal: AbortSignal.timeout(10_000) });
  if (!idResponse.ok) return null;
  const idData = await idResponse.json() as { records?: Array<{ doi?: string }> };
  const doi = idData.records?.[0]?.doi;
  if (!doi) return null;

  const crossref = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=adycovs@gmail.com`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!crossref.ok) return null;
  const data = await crossref.json() as {
    message?: { link?: Array<{ URL?: string; 'content-type'?: string }> };
  };
  const pdf = data.message?.link?.find((link) => link['content-type'] === 'application/pdf')?.URL;
  return sanitizePdfUrl(pdf);
}

