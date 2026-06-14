import { NextResponse } from 'next/server';
import { normalizePlagiarismWebhook, type PlagiarismResult } from '@/lib/integrity/copyleaks';
import { setPlagiarismResult } from '@/lib/integrity/store';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  context: { params: Promise<{ scanId: string; status: string }> },
) {
  const expectedToken = process.env.COPYLEAKS_WEBHOOK_SECRET?.trim();
  const suppliedToken = new URL(req.url).searchParams.get('token');
  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized webhook.' }, { status: 401 });
  }
  const { scanId, status } = await context.params;
  const payload = await req.json().catch(() => ({}));
  if (status === 'completed') {
    setPlagiarismResult(normalizePlagiarismWebhook(scanId, payload));
  } else if (status === 'error') {
    const result: PlagiarismResult = {
      scanId,
      status: 'error',
      score: null,
      sources: [],
      totalWords: null,
      credits: null,
      error: extractError(payload),
      updatedAt: new Date().toISOString(),
    };
    setPlagiarismResult(result);
  }
  return new NextResponse(null, { status: 204 });
}

function extractError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Copyleaks scan failed.';
  const value = payload as Record<string, unknown>;
  return typeof value.message === 'string' ? value.message : 'Copyleaks scan failed.';
}
