import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolvePdfSource } from '@/lib/pdf/resolve';
import { sanitizePdfUrl } from '@/lib/pdf/proxy';

export const runtime = 'nodejs';

const BodySchema = z.object({
  url: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const resolved = await resolvePdfSource(body.url);
    if (!resolved) {
      return NextResponse.json({ error: 'Unsupported PDF URL.' }, { status: 400 });
    }
    return NextResponse.json({ pdfUrl: resolved.href });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF resolve failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = sanitizePdfUrl(new URL(request.url).searchParams.get('url'));
  if (!url) {
    return NextResponse.json({ error: 'Unsupported PDF URL.' }, { status: 400 });
  }
  try {
    const resolved = await resolvePdfSource(url.href);
    if (!resolved) {
      return NextResponse.json({ error: 'Unsupported PDF URL.' }, { status: 400 });
    }
    return NextResponse.json({ pdfUrl: resolved.href });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF resolve failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}