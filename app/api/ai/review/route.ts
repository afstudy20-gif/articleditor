import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructured, isAIConfigured, AIError } from '@/lib/ai/provider';
import { ReviewResult } from '@/lib/ai/schemas';
import { encodeCitations, citationPreservationInstruction } from '@/lib/ai/citation-safety';

export const runtime = 'nodejs';

const BodySchema = z.object({
  text: z.string().min(20).max(20_000),
  context: z.string().max(10_000).optional(),
  section: z.string().max(60).optional(),
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SYSTEM_TR =
  'Sen üst düzey bir akademik editörsün. Tıbbi ve bilimsel manuskripti gözden geçirir, ' +
  'her sorunu kategorize edip (clarity, tone, structure, evidence, grammar, consistency, flow), ' +
  'önem (low/med/high) ile derecelendirip yapıcı düzeltme önerisi sunarsın. ' +
  'Tekrar etme. Genel yorum yapma. Sadece somut, paragraftan birebir alıntılanabilir sorunları işaretle.';

const SYSTEM_EN =
  'You are a senior academic editor reviewing scientific/medical manuscripts. ' +
  'Categorize each issue (clarity, tone, structure, evidence, grammar, consistency, flow), ' +
  'rate severity (low/med/high), and propose a concrete fix. ' +
  'Skip generic comments — every issue must reference text from the input.';

function buildPrompt(args: {
  encodedText: string;
  context?: string;
  section?: string;
  lang: 'tr' | 'en';
  citationCount: number;
}): string {
  const { encodedText, context, section, lang, citationCount } = args;
  const isTr = lang === 'tr';
  const labelText = isTr ? 'METİN' : 'TEXT';
  const labelCtx = isTr ? 'BÖLGE BAĞLAMI' : 'SURROUNDING CONTEXT';
  const labelSec = isTr ? 'BÖLÜM' : 'SECTION';
  const instr = isTr
    ? 'Aşağıdaki metni akademik editör olarak gözden geçir. JSON şemasına uy:\n' +
      '{"issues":[{"category":"clarity|tone|structure|evidence|grammar|consistency|flow",' +
      '"severity":"low|med|high","quote":"metinden alıntı (max 120 char)",' +
      '"comment":"sorun kısa açıklama","suggestion":"somut düzeltme"}],"summary":"genel değerlendirme (1-2 cümle)"}\n' +
      'Yorumlar Türkçe olsun. En fazla 12 sorun döndür.'
    : 'Review the following text as an academic editor. Match this JSON schema:\n' +
      '{"issues":[{"category":"clarity|tone|structure|evidence|grammar|consistency|flow",' +
      '"severity":"low|med|high","quote":"verbatim quote from text (max 120 chars)",' +
      '"comment":"brief issue description","suggestion":"concrete fix"}],"summary":"overall 1-2 sentence assessment"}\n' +
      'Comments in English. Return at most 12 issues.';
  const parts: string[] = [instr];
  if (section) parts.push(`${labelSec}: ${section}`);
  if (context) parts.push(`${labelCtx}:\n${context}`);
  parts.push(`${labelText}:\n${encodedText}`);
  if (citationCount > 0) parts.push(citationPreservationInstruction(citationCount));
  parts.push(isTr ? 'Sadece geçerli JSON döndür.' : 'Return valid JSON only.');
  return parts.join('\n\n');
}

export async function POST(req: Request) {
  if (!isAIConfigured()) {
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

  const { encoded, placeholders } = encodeCitations(body.text);
  const prompt = buildPrompt({
    encodedText: encoded,
    context: body.context,
    section: body.section,
    lang: body.lang,
    citationCount: placeholders.length,
  });

  try {
    const result = await generateStructured(prompt, ReviewResult, {
      system: body.lang === 'tr' ? SYSTEM_TR : SYSTEM_EN,
      temperature: 0.2,
      maxTokens: 4096,
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AIError && err.stage === 'config' ? 503 : 500;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status });
  }
}
