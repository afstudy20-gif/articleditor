import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructured, isAIConfigured, AIError, configFromHeaders } from '@/lib/ai/provider';
import { ScoreResult } from '@/lib/ai/schemas';
import { encodeCitations, citationPreservationInstruction } from '@/lib/ai/citation-safety';

export const runtime = 'nodejs';

const BodySchema = z.object({
  text: z.string().min(50).max(30_000),
  scope: z.enum(['paragraph', 'section', 'document']).default('document'),
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SYSTEM_TR =
  'Sen üst düzey bir akademik editörsün. Akademik manuskript metnini üç eksende ' +
  '(clarity / coherence / academic_tone) 0-100 arası puanlar ve yapıcı, somut iyileştirme ' +
  'önerileri sunarsın. Puanlar liberal değil, gerçekçi olmalı (mükemmel metinler 90+, ' +
  'tipik manuskript 60-75, ciddi sorunlu 40 altı).';

const SYSTEM_EN =
  'You are a senior academic editor. Score academic manuscripts on three axes ' +
  '(clarity / coherence / academic_tone) from 0-100 with realistic calibration ' +
  '(excellent 90+, typical 60-75, weak <40), and propose concrete improvements.';

function buildPrompt(args: { encodedText: string; scope: string; lang: 'tr' | 'en'; citationCount: number }): string {
  const { encodedText, scope, lang, citationCount } = args;
  const isTr = lang === 'tr';
  const scopeLabel =
    scope === 'paragraph'
      ? isTr
        ? 'tek paragraf'
        : 'single paragraph'
      : scope === 'section'
        ? isTr
          ? 'bölüm'
          : 'section'
        : isTr
          ? 'belge geneli'
          : 'full document';

  const instr = isTr
    ? `${scopeLabel.toUpperCase()} kapsamında değerlendir. JSON şemasına uy:\n` +
      '{"clarity":N,"coherence":N,"academic_tone":N,"overall":N,' +
      '"breakdown":[{"aspect":"...","score":N,"notes":"..."}],' +
      '"recommendations":["..."]}\n' +
      'Tüm puanlar 0-100. `breakdown` 3-6 alt-eksen. ' +
      '`recommendations` en kritik 3-5 öneri, somut ve uygulanabilir, Türkçe.'
    : `Evaluate ${scopeLabel}. Match this JSON schema:\n` +
      '{"clarity":N,"coherence":N,"academic_tone":N,"overall":N,' +
      '"breakdown":[{"aspect":"...","score":N,"notes":"..."}],' +
      '"recommendations":["..."]}\n' +
      'All scores 0-100. `breakdown` 3-6 sub-axes. ' +
      '`recommendations` top 3-5 concrete, actionable items in English.';
  const parts = [instr, isTr ? 'METİN:' : 'TEXT:', encodedText];
  if (citationCount > 0) parts.push(citationPreservationInstruction(citationCount));
  parts.push(isTr ? 'Sadece geçerli JSON döndür.' : 'Return valid JSON only.');
  return parts.join('\n\n');
}

export async function POST(req: Request) {
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
  const { encoded, placeholders } = encodeCitations(body.text);
  const prompt = buildPrompt({
    encodedText: encoded,
    scope: body.scope,
    lang: body.lang,
    citationCount: placeholders.length,
  });
  try {
    const result = await generateStructured(prompt, ScoreResult, {
      system: body.lang === 'tr' ? SYSTEM_TR : SYSTEM_EN,
      temperature: 0.2,
      maxTokens: 2048,
      config: cfg,
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AIError && err.stage === 'config' ? 503 : 500;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status });
  }
}
