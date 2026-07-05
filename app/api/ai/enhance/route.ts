import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructured, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';
import { EnhanceMode, EnhanceResult } from '@/lib/ai/schemas';
import { citationPreservationInstruction } from '@/lib/ai/citation-safety';
import { MDPI_REWRITE_GUIDANCE } from '@/lib/ai/mdpi-editor-guidance';

// Sentinels: client encodes citations with U+E000/E001; route forwards them
// unchanged through the LLM and verifies they survived.
const OPEN = '';
const CLOSE = '';
const SENTINEL_RE = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');

function countSentinels(text: string): { indices: Set<number>; total: number } {
  const indices = new Set<number>();
  let total = 0;
  let m: RegExpExecArray | null;
  SENTINEL_RE.lastIndex = 0;
  while ((m = SENTINEL_RE.exec(text))) {
    indices.add(parseInt(m[1], 10));
    total++;
  }
  return { indices, total };
}

export const runtime = 'nodejs';

const BodySchema = z.object({
  text: z.string().min(10).max(8_000),
  mode: EnhanceMode,
  instruction: z.string().max(500).optional(),
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SYSTEM_TR =
  'Sen üst düzey bir akademik editörsün. Akademik manuskript metinlerini ' +
  'kullanıcının talep ettiği şekilde yeniden yazarsın: ton akademik kalır, ' +
  'anlam korunur, atıf işaretleri (örn. [3] veya sentinel tokenları) hiç değişmez. ' +
  'Yorum ekleme, açıklama yapma — sadece yeniden yazılmış metni döndür.';

const SYSTEM_EN =
  'You are a senior academic editor. Rewrite scientific manuscript text per the ' +
  "user's request: keep tone academic, preserve meaning, never modify citation " +
  'tokens (e.g. [3] or sentinel chars). No commentary; return only the rewritten text.';

const MODE_INSTR_TR: Record<string, string> = {
  expand: 'Metni 1.5-2x oranında GENİŞLET: aynı argümanı daha detaylı ifade et, somut örnekler veya açıklayıcı cümleler ekle. Ana iddiayı veya anlamı değiştirme.',
  shorten: 'Metni yaklaşık YARIYA KISALT: gereksiz tekrarları, dolgu kelimeleri çıkar, ana fikri koru.',
  rephrase: 'Metni YENİDEN YAZ: aynı anlamı farklı kelimelerle, daha akıcı şekilde ifade et.',
  'tone-academic': 'Tonu daha AKADEMİK yap: günlük dil ve gevşek ifadeleri akademik karşılıklarıyla değiştir, edilgen yapı kullan, daha resmi bir dil tercih et.',
  clarity: 'AÇIKLIĞI ARTIR: uzun cümleleri böl, belirsiz ifadeleri netleştir, mantıksal sırayı düzelt.',
  concision: 'SADELEŞTIR: gereksiz kelimeleri çıkar, kısa ve net cümleler kur, anlam kaybı olmasın.',
  grammar: 'DİLBİLGİSİ ve YAZIM hatalarını düzelt. Üslubu koru, sadece dilbilgisi hatalarını düzelt.',
};

const MODE_INSTR_EN: Record<string, string> = {
  expand: 'EXPAND text to ~1.5-2x: develop the same argument in more detail, add concrete examples or clarifying sentences. Do not change the core claim.',
  shorten: 'SHORTEN text to ~half: remove redundancy and filler, keep the main idea.',
  rephrase: 'REPHRASE: convey the same meaning with different wording, more fluent.',
  'tone-academic': 'Make tone more ACADEMIC: replace colloquialisms, prefer passive voice and formal register.',
  clarity: 'IMPROVE CLARITY: split long sentences, disambiguate, fix logical order.',
  concision: 'TIGHTEN: cut filler, use short crisp sentences, no meaning loss.',
  grammar: 'Fix GRAMMAR and SPELLING only. Preserve voice; do not rewrite for style.',
};

function buildPrompt(args: {
  encodedText: string;
  mode: z.infer<typeof EnhanceMode>;
  instruction?: string;
  lang: 'tr' | 'en';
  citationCount: number;
}): string {
  const { encodedText, mode, instruction, lang, citationCount } = args;
  const isTr = lang === 'tr';
  const modeInstr = (isTr ? MODE_INSTR_TR : MODE_INSTR_EN)[mode];
  const schemaInstr = isTr
    ? 'JSON şeması: {"after":"yeniden yazılmış metin","rationale":"kısa gerekçe"}'
    : 'JSON schema: {"after":"rewritten text","rationale":"brief rationale"}';
  const parts: string[] = [
    modeInstr,
    MDPI_REWRITE_GUIDANCE,
    schemaInstr,
    isTr ? 'METİN:' : 'TEXT:',
    encodedText,
  ];
  if (instruction) {
    parts.push(isTr ? `EK TALİMAT: ${instruction}` : `EXTRA INSTRUCTION: ${instruction}`);
  }
  if (citationCount > 0) parts.push(citationPreservationInstruction(citationCount));
  parts.push(isTr ? 'Sadece geçerli JSON döndür.' : 'Return valid JSON only.');
  return parts.join('\n\n');
}

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
  // Client already encoded citations as sentinels. Count them so we can verify
  // preservation in the LLM output.
  const before = countSentinels(body.text);
  const prompt = buildPrompt({
    encodedText: body.text,
    mode: body.mode,
    instruction: body.instruction,
    lang: body.lang,
    citationCount: before.total,
  });
  try {
    const result = await generateStructured(prompt, EnhanceResult, {
      system: body.lang === 'tr' ? SYSTEM_TR : SYSTEM_EN,
      temperature: 0.3,
      maxTokens: 4096,
      config: cfg,
      signal: timeoutSignal(),
    });
    const after = countSentinels(result.after);
    const missing: number[] = [];
    before.indices.forEach((idx) => {
      if (!after.indices.has(idx)) missing.push(idx);
    });
    const extras: number[] = [];
    after.indices.forEach((idx) => {
      if (!before.indices.has(idx)) extras.push(idx);
    });
    return NextResponse.json({
      after: result.after,
      rationale: result.rationale,
      citationCheck: { total: before.total, missing, extras },
    });
  } catch (err) {
    console.error('[ai/enhance]', err);
    return aiErrorResponse(err);
  }
}
