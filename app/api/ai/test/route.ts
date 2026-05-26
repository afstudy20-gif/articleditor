import { NextResponse } from 'next/server';
import { configFromHeaders, getProvider, AIError, type ProviderName } from '@/lib/ai/provider';

export const runtime = 'nodejs';

const VALID: ProviderName[] = ['gemini', 'anthropic', 'openai', 'deepseek', 'nvidia'];

// Tiny round-trip test: ask the provider to reply with one word, measure
// latency, surface errors verbatim to the UI.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('provider') ?? '';
  if (!VALID.includes(raw as ProviderName)) {
    return NextResponse.json({ ok: false, error: `Unknown provider: ${raw}` }, { status: 400 });
  }
  const provider = raw as ProviderName;
  const cfg = configFromHeaders(req.headers);
  const started = Date.now();
  try {
    const p = getProvider(provider, cfg);
    const reply = await p.generateText('Reply with the single word: pong', {
      temperature: 0,
      maxTokens: 16,
    });
    return NextResponse.json({
      ok: true,
      provider,
      reply: reply.trim().slice(0, 80),
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    const isConfig = err instanceof AIError && err.stage === 'config';
    return NextResponse.json(
      {
        ok: false,
        provider,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      },
      { status: isConfig ? 503 : 500 },
    );
  }
}
