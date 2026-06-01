import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';

export const runtime = 'nodejs';

const BodySchema = z.object({
  draft: z.string().min(1).max(12_000),
  instruction: z.string().max(2_000).optional(),
  lang: z.enum(['tr', 'en']).default('en'),
});

const SYSTEM_TR =
  'Sen akademik bir yazışma editörüsün. Cover letter / hakem yanıtı gibi metinleri ' +
  'profesyonel, kibar ve net hale getirirsin. Bilgi uydurma; sadece verilen taslağı iyileştir.';
const SYSTEM_EN =
  'You are an academic correspondence editor. You refine cover letters and reviewer ' +
  'responses to be professional, courteous and concise. Do not invent facts; only improve the given draft.';

export async function POST(req: Request): Promise<NextResponse> {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  const cfg = configFromHeaders(req.headers);
  if (!isAIConfigured(cfg)) {
    return NextResponse.json(
      { error: 'AI yapılandırılmamış. / AI not configured.', code: 'not_configured' },
      { status: 503 },
    );
  }

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body', code: 'bad_request' }, { status: 400 });
  }

  const isTr = body.lang === 'tr';
  const lead = isTr
    ? 'Aşağıdaki mektubu profesyonelce iyileştir; akademik ton kullan, kısa ve net tut. Yalnızca iyileştirilmiş metni döndür.'
    : 'Improve the following letter professionally; academic tone, concise. Return only the improved text.';
  const prompt = `${body.instruction ? `${body.instruction}\n\n` : ''}${lead}\n\n${body.draft}`;

  try {
    const provider = getProvider(undefined, cfg);
    const text = await provider.generateText(prompt, {
      system: isTr ? SYSTEM_TR : SYSTEM_EN,
      temperature: 0.4,
      maxTokens: 2048,
      signal: timeoutSignal(),
    });
    return NextResponse.json({ text });
  } catch (err) {
    console.error('[ai/letter]', err);
    return aiErrorResponse(err);
  }
}
