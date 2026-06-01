import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructured, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';
import { CompareResult } from '@/lib/ai/schemas';

export const runtime = 'nodejs';

const AspectShape = z.object({
  goals: z.array(z.string()).optional(),
  methods: z.array(z.string()).optional(),
  datasets: z.array(z.string()).optional(),
  eval_protocols: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  contributions: z.array(z.string()).optional(),
  findings: z.array(z.string()).optional(),
});

const TargetRefShape = z.object({
  title: z.string().optional(),
  abstract: z.string().optional(),
  authors: z.string().optional(),
  year: z.number().int().optional(),
  containerTitle: z.string().optional(),
  aspects: AspectShape.optional(),
});

const BodySchema = z.object({
  myAbstract: z.string().min(50).max(8_000),
  myOutline: z.string().max(4_000).optional(),
  targetRef: TargetRefShape,
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SYSTEM_TR =
  'Sen bir akademik editörsün. Kullanıcının çalışmasını hedef bir makale ile karşılaştırır, ' +
  'örtüşmeleri, kullanıcının makalesinde olmayan ama hedefte olan boşlukları ve farklılaştırıcı ' +
  'noktaları belirlersin. Halüsinasyon yapma — sadece verilen metinlerden çıkarımla.';

const SYSTEM_EN =
  'You are an academic editor. Compare the user’s manuscript against a target paper. Identify ' +
  'overlaps, gaps (present in target but missing from user), and differentiators. Do not hallucinate — ' +
  'use only the provided texts.';

function buildPrompt(b: z.infer<typeof BodySchema>): string {
  const isTr = b.lang === 'tr';
  const targetParts: string[] = [];
  if (b.targetRef.title) targetParts.push(`Başlık: ${b.targetRef.title}`);
  if (b.targetRef.authors) targetParts.push(`Yazarlar: ${b.targetRef.authors}`);
  if (b.targetRef.year) targetParts.push(`Yıl: ${b.targetRef.year}`);
  if (b.targetRef.containerTitle) targetParts.push(`Kaynak: ${b.targetRef.containerTitle}`);
  if (b.targetRef.abstract) targetParts.push(`Özet:\n${b.targetRef.abstract}`);
  if (b.targetRef.aspects) {
    targetParts.push(`Aspectler (önceden çıkarılmış):\n${JSON.stringify(b.targetRef.aspects, null, 2)}`);
  }

  const schema =
    '{"overlaps":[{"aspect":"hedef/yöntem/veri vb.","mine":"benim çalışmamda","theirs":"hedef çalışmada","note":"opsiyonel not"}],' +
    '"gaps":["hedefte var, bende yok olan boşluklar"],' +
    '"differentiators":["benim çalışmamı ayırıcı kılan noktalar"],' +
    '"citation_snippet":"bu hedef makaleyi alıntılarken kullanılabilecek 1-2 cümlelik özet"}';

  const instr = isTr
    ? `JSON şemasına uy:\n${schema}\nDurağan değil, somut karşılaştırma yap. 'overlaps' 3-6 madde, 'gaps' 2-5 madde, 'differentiators' 2-4 madde. Çıktı Türkçe.`
    : `Match this JSON schema:\n${schema.replace(/Türkçe/g, 'English')}\nReturn concrete comparison (no fluff). overlaps 3-6 items, gaps 2-5, differentiators 2-4. Output in English.`;

  return [
    instr,
    isTr ? 'BENİM ÖZETIM:' : 'MY ABSTRACT:',
    b.myAbstract,
    ...(b.myOutline ? [isTr ? 'BENİM OUTLINE:' : 'MY OUTLINE:', b.myOutline] : []),
    isTr ? 'HEDEF MAKALE:' : 'TARGET PAPER:',
    targetParts.join('\n'),
    isTr ? 'Sadece geçerli JSON döndür.' : 'Return valid JSON only.',
  ].join('\n\n');
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
  if (!body.targetRef.title && !body.targetRef.abstract && !body.targetRef.aspects) {
    return NextResponse.json({ error: 'Hedef makale için en az başlık veya özet gerekli' }, { status: 400 });
  }
  try {
    const result = await generateStructured(buildPrompt(body), CompareResult, {
      system: body.lang === 'tr' ? SYSTEM_TR : SYSTEM_EN,
      temperature: 0.2,
      maxTokens: 3072,
      config: cfg,
      signal: timeoutSignal(),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ai/compare]', err);
    return aiErrorResponse(err);
  }
}
