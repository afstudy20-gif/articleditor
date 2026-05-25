import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider, getDefaultProvider, isAIConfigured, AIError, configFromHeaders } from '@/lib/ai/provider';

export const runtime = 'nodejs';

const BodySchema = z.object({
  texts: z.array(z.string().min(1).max(8_000)).min(1).max(64),
});

export async function POST(req: Request) {
  const cfg = configFromHeaders(req.headers);
  if (!isAIConfigured(cfg)) {
    return NextResponse.json(
      { error: 'AI configured değil. Sağ üstteki ayarlardan API anahtarı gir.' },
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
    for (const name of order) {
      try {
        const provider = getProvider(name, cfg);
        if (!provider.embedBatch) continue;
        const embeddings = await provider.embedBatch(body.texts);
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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
