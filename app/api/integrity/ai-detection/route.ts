import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/ai/guard';
import { copyleaksConfigFromEnv, scanAiText } from '@/lib/integrity/copyleaks';

export const runtime = 'nodejs';

const BodySchema = z.object({
  text: z.string().min(255).max(100_000),
});

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;
  const config = copyleaksConfigFromEnv();
  if (!config) {
    return NextResponse.json(
      { error: 'Copyleaks is not configured on the server.' },
      { status: 503 },
    );
  }
  try {
    const body = BodySchema.parse(await req.json());
    return NextResponse.json(await scanAiText(body.text, config));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI detection failed.';
    const status = error instanceof z.ZodError ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
