import { NextResponse } from 'next/server';
import { copyleaksConfigFromEnv } from '@/lib/integrity/copyleaks';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const configured = Boolean(copyleaksConfigFromEnv());
  const webhookBase = resolvePublicWebhookBase(req);
  return NextResponse.json({
    provider: 'copyleaks',
    aiDetection: configured,
    plagiarism: configured && Boolean(webhookBase) && Boolean(process.env.COPYLEAKS_WEBHOOK_SECRET),
    sandbox: process.env.COPYLEAKS_SANDBOX === 'true',
  });
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
