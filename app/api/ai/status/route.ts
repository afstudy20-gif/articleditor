import { NextResponse } from 'next/server';
import { isAIConfigured, getDefaultProvider, configFromHeaders } from '@/lib/ai/provider';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const cfg = configFromHeaders(req.headers);
  return NextResponse.json({
    configured: isAIConfigured(cfg),
    provider: isAIConfigured(cfg) ? getDefaultProvider(cfg) : null,
  });
}
