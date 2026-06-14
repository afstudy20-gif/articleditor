import { NextResponse } from 'next/server';
import { getPlagiarismResult } from '@/lib/integrity/store';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  context: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await context.params;
  const result = getPlagiarismResult(scanId);
  if (!result) {
    return NextResponse.json({ error: 'Scan not found or expired.' }, { status: 404 });
  }
  return NextResponse.json(result);
}
