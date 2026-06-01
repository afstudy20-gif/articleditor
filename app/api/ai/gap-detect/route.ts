import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructured, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';
import { GapDetectResult } from '@/lib/ai/schemas';
import { citationPreservationInstruction } from '@/lib/ai/citation-safety';

export const runtime = 'nodejs';

const BodySchema = z.object({
  text: z.string().min(30).max(20_000),
  scope: z.enum(['paragraph', 'document']).default('paragraph'),
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SYSTEM_TR =
  'Sen bir akademik editörsün. Bilimsel metindeki atıf gerektiren ' +
  '(ama atıfsız) iddiaları tespit edersin. Sadece sonuç/saptama/istatistik/tanım ' +
  'içeren cümleleri işaretle — genel bilgi veya tartışılan yorumları işaretleme. ' +
  'Atıf işaretleri (sentinel tokens) zaten atıflı kısımları gösterir; o cümleleri ' +
  'tekrar işaretleme.';

const SYSTEM_EN =
  'You are an academic editor. Detect claims in scientific text that REQUIRE citation ' +
  'but lack one. Only flag empirical/statistical/attributional/definitional claims — ' +
  'do not flag general background or interpretive discussion. Sentinel tokens mark ' +
  'already-cited sentences; do not re-flag those.';

const SENTINEL = '\\u{E000}\\d+\\u{E001}';

function buildPrompt(args: { text: string; scope: string; lang: 'tr' | 'en'; citationCount: number }): string {
  const { text, scope, lang, citationCount } = args;
  const isTr = lang === 'tr';
  const schema = isTr
    ? '{"claims":[{"quote":"metinden birebir alıntı (max 200 char)","claim_type":"empirical|theoretical|statistical|attribution|definition","rationale":"neden atıf gerekli"}]}'
    : '{"claims":[{"quote":"verbatim excerpt (max 200 chars)","claim_type":"empirical|theoretical|statistical|attribution|definition","rationale":"why citation is needed"}]}';
  const instr = isTr
    ? `${scope === 'document' ? 'BELGE' : 'PARAGRAF'} kapsamında, atıf gerektiren ` +
      `ancak atıfsız cümleleri bul. JSON şemasına uy:\n${schema}\n` +
      'En fazla 15 iddia döndür. Gerekçeler Türkçe.'
    : `Across the ${scope}, find sentences that require a citation but lack one. ` +
      `Match this JSON schema:\n${schema}\n` +
      'Return at most 15 claims. Rationales in English.';
  const parts = [instr, isTr ? 'METİN:' : 'TEXT:', text];
  if (citationCount > 0) {
    parts.push(citationPreservationInstruction(citationCount));
    parts.push(
      isTr
        ? 'NOT: Sentinel içeren cümleler zaten atıflı sayılır — onları işaretleme.'
        : 'NOTE: Sentences containing sentinels already have citations — do not flag them.',
    );
  }
  parts.push(isTr ? 'Sadece geçerli JSON döndür.' : 'Return valid JSON only.');
  return parts.join('\n\n');
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
  // Count existing sentinels for the preservation reminder.
  const sentinelRe = new RegExp(SENTINEL, 'gu');
  const matches = body.text.match(sentinelRe);
  const citationCount = matches ? matches.length : 0;
  try {
    const result = await generateStructured(
      buildPrompt({ text: body.text, scope: body.scope, lang: body.lang, citationCount }),
      GapDetectResult,
      {
        system: body.lang === 'tr' ? SYSTEM_TR : SYSTEM_EN,
        temperature: 0.2,
        maxTokens: 3072,
        config: cfg,
        signal: timeoutSignal(),
      },
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ai/gap-detect]', err);
    return aiErrorResponse(err);
  }
}
