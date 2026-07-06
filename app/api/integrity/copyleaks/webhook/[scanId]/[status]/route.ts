import { NextResponse } from 'next/server';
import { normalizePlagiarismWebhook, type PlagiarismResult } from '@/lib/integrity/copyleaks';
import { setPlagiarismResult } from '@/lib/integrity/store';
import { verifyRequestBodyHmac } from '@/lib/integrity/webhook-signature';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  context: { params: Promise<{ scanId: string; status: string }> },
) {
  const webhookSecret = process.env.COPYLEAKS_WEBHOOK_SECRET?.trim();
  const rawBody = await req.text();
  if (!webhookSecret || !verifyRequestBodyHmac(req, rawBody, webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized webhook.' }, { status: 401 });
  }
  const { scanId, status } = await context.params;
  const payload = parseJson(rawBody);
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

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function extractError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Copyleaks scan failed.';
  const value = payload as Record<string, unknown>;
  return typeof value.message === 'string' ? value.message : 'Copyleaks scan failed.';
}
