import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizePdfUrl } from '@/lib/pdf/proxy';
import { decodeProxyUrlParam, resolvePdfSource } from '@/lib/pdf/resolve';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PDF_BYTES = 50 * 1024 * 1024;

const BodySchema = z.object({
  url: z.string().min(1),
});

async function proxyPdf(url: URL): Promise<Response> {
  let target = (await resolvePdfSource(url.href)) ?? url;

  const response = await fetch(target, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.1',
      'User-Agent': 'Mozilla/5.0 (compatible; ARTED/1.0; +https://arted.drtr.uk)',
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
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = decodeProxyUrlParam(request.nextUrl.searchParams);
  if (!url) {
    return NextResponse.json({ error: 'Unsupported PDF URL.' }, { status: 400 });
  }

  try {
    return await proxyPdf(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF fetch failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const url = sanitizePdfUrl(body.url);
  if (!url) {
    return NextResponse.json({ error: 'Unsupported PDF URL.' }, { status: 400 });
  }

  try {
    return await proxyPdf(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF fetch failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}