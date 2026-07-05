import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider, getDefaultProvider, isAIConfigured, AIError, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';

export const runtime = 'nodejs';

const BodySchema = z.object({
  texts: z.array(z.string().min(1).max(8_000)).min(1).max(64),
});

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  const cfg = configFromHeaders(req.headers);
  if (!isAIConfigured(cfg)) {
    return NextResponse.json(
      { error: 'AI configured değil. Server env içinde AI provider anahtarı ayarlanmalı.' },
      { status: 503 },
    );
  }
  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid body';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  try {
    // Pick first provider that supports embeddings.
    const order: Array<ReturnType<typeof getDefaultProvider>> = ['gemini', 'openai'];
    let lastErr: Error | null = null;
    const signal = timeoutSignal();
    for (const name of order) {
      try {
        const provider = getProvider(name, cfg);
        if (!provider.embedBatch) continue;
        const embeddings = await provider.embedBatch(body.texts, signal);
        const dim = embeddings[0]?.length ?? 0;
        return NextResponse.json({ embeddings, provider: name, dim });
      } catch (err) {
        if (err instanceof AIError && err.stage === 'config') {
          continue; // try next provider
        }
        lastErr = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }
    throw lastErr ?? new Error('No embedding provider available');
  } catch (err) {
    console.error('[ai/embed-batch]', err);
    return aiErrorResponse(err);
  }
}
