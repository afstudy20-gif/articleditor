import { NextResponse } from 'next/server';
import { isAIConfigured, getDefaultProvider } from '@/lib/ai/provider';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    configured: isAIConfigured(),
    provider: isAIConfigured() ? getDefaultProvider() : null,
  });
}
