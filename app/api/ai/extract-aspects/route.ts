import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructured, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';
import { AspectExtract } from '@/lib/ai/schemas';

export const runtime = 'nodejs';

const BodySchema = z.object({
  title: z.string().max(500).optional(),
  abstract: z.string().max(8_000).optional(),
  authors: z.string().max(500).optional(),
  year: z.number().int().optional(),
  containerTitle: z.string().max(300).optional(),
  raw: z.string().max(2_000).optional(),
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SYSTEM_TR =
  'Sen bir tıp/bilim editörüsün. Verilen makale metadata ve özetinden yapısal alanları ' +
  'çıkartırsın: hedefler, yöntemler, veri kümeleri, değerlendirme protokolleri, ' +
  'kısıtlılıklar, katkılar, bulgular. Eksik bilgi varsa o alanı boş bırak. ' +
  'Halüsinasyon yapma — sadece metinde geçen veya açıkça çıkarımlanabilen bilgiyi kullan.';

const SYSTEM_EN =
  'You are a science editor. Extract structured aspects from the given article ' +
  'metadata + abstract: goals, methods, datasets, eval_protocols, limitations, ' +
  'contributions, findings. Leave a field empty if the source does not contain ' +
  'the information. Do NOT hallucinate.';

function buildPrompt(b: z.infer<typeof BodySchema>): string {
  const isTr = b.lang === 'tr';
  const refParts: string[] = [];
  if (b.title) refParts.push(`${isTr ? 'BAŞLIK' : 'TITLE'}: ${b.title}`);
  if (b.authors) refParts.push(`${isTr ? 'YAZARLAR' : 'AUTHORS'}: ${b.authors}`);
  if (b.year) refParts.push(`${isTr ? 'YIL' : 'YEAR'}: ${b.year}`);
  if (b.containerTitle) refParts.push(`${isTr ? 'KAYNAK' : 'JOURNAL'}: ${b.containerTitle}`);
  if (b.abstract) refParts.push(`${isTr ? 'ÖZET' : 'ABSTRACT'}:\n${b.abstract}`);
  if (!b.abstract && b.raw) refParts.push(`${isTr ? 'HAM' : 'RAW'}:\n${b.raw}`);
  const schema = isTr
    ? '{"goals":["..."],"methods":["..."],"datasets":["..."],"eval_protocols":["..."],"limitations":["..."],"contributions":["..."],"findings":["..."]}'
    : '{"goals":["..."],"methods":["..."],"datasets":["..."],"eval_protocols":["..."],"limitations":["..."],"contributions":["..."],"findings":["..."]}';
  const instr = isTr
    ? `Makale bilgisini analiz et ve şu JSON şemasına uy:\n${schema}\nMaddeler kısa ve Türkçe olsun. Bilgi olmayan alanları çıkartabilir veya boş array yapabilirsin.`
    : `Analyze the article info and match this JSON schema:\n${schema}\nUse short English bullets. Fields with no info can be omitted or set to empty array.`;
  return [instr, ...refParts, isTr ? 'Sadece geçerli JSON döndür.' : 'Return valid JSON only.'].join(
    '\n\n',
  );
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  const cfg = configFromHeaders(req.headers);
  if (!isAIConfigured(cfg)) {
    return NextResponse.json(
      { error: 'AI configured değil. GEMINI_API_KEY veya benzeri ayarlanmalı.' },
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
  if (!body.abstract && !body.raw && !body.title) {
    return NextResponse.json({ error: 'Yeterli kaynak yok (en az başlık veya özet gerekli)' }, { status: 400 });
  }
  try {
    const result = await generateStructured(buildPrompt(body), AspectExtract, {
      system: body.lang === 'tr' ? SYSTEM_TR : SYSTEM_EN,
      temperature: 0.1,
      maxTokens: 2048,
      config: cfg,
      signal: timeoutSignal(),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ai/extract-aspects]', err);
    return aiErrorResponse(err);
  }
}
