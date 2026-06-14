import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/ai/guard';
import {
  copyleaksConfigFromEnv,
  submitPlagiarismScan,
  type PlagiarismResult,
} from '@/lib/integrity/copyleaks';
import { setPlagiarismResult } from '@/lib/integrity/store';

export const runtime = 'nodejs';

const BodySchema = z.object({
  text: z.string().min(50).max(500_000),
  title: z.string().trim().min(1).max(160).default('manuscript'),
});

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;
  const config = copyleaksConfigFromEnv();
  const secret = process.env.COPYLEAKS_WEBHOOK_SECRET?.trim();
  const webhookBase = resolvePublicWebhookBase(req);
  if (!config) {
    return NextResponse.json(
      { error: 'Copyleaks is not configured on the server.' },
      { status: 503 },
    );
  }
  if (!secret || !webhookBase) {
    return NextResponse.json(
      {
        error:
          'Plagiarism scanning requires COPYLEAKS_WEBHOOK_SECRET and a public HTTPS COPYLEAKS_WEBHOOK_BASE_URL.',
      },
      { status: 503 },
    );
  }
  try {
    const body = BodySchema.parse(await req.json());
    const scanId = crypto.randomUUID().replaceAll('-', '');
    const statusWebhook =
      `${webhookBase}/api/integrity/copyleaks/webhook/${scanId}/{STATUS}` +
      `?token=${encodeURIComponent(secret)}`;
    const pending: PlagiarismResult = {
      scanId,
      status: 'pending',
      score: null,
      sources: [],
      totalWords: null,
      credits: null,
      updatedAt: new Date().toISOString(),
    };
    setPlagiarismResult(pending);
    await submitPlagiarismScan(
      {
        scanId,
        text: body.text,
        filename: `${safeFilename(body.title)}.txt`,
        statusWebhook,
      },
      config,
    );
    return NextResponse.json(pending, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plagiarism scan failed.';
    const status = error instanceof z.ZodError ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

function resolvePublicWebhookBase(req: Request): string | null {
  const candidate = process.env.COPYLEAKS_WEBHOOK_BASE_URL?.trim() || new URL(req.url).origin;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return null;
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function safeFilename(value: string): string {
  const safe = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return safe || 'manuscript';
}
