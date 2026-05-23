import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'article-editor', version: '1.0.0', ts: Date.now() });
}
