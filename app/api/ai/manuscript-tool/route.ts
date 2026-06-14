import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ManuscriptToolMode,
  ManuscriptToolResult,
} from '@/lib/ai/schemas';
import { generateStructured, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';
import { citationPreservationInstruction } from '@/lib/ai/citation-safety';

export const runtime = 'nodejs';

const BodySchema = z.object({
  mode: ManuscriptToolMode,
  text: z.string().min(20).max(30_000),
  context: z.string().max(20_000).optional(),
  lang: z.enum(['tr', 'en']).default('tr'),
  preserveCitations: z.boolean().default(false),
});

const SYSTEM =
  'You are a senior scientific and medical manuscript editor. Preserve all reported findings, ' +
  'numbers, uncertainty, direction of effects, citations, and causal strength. Never invent data, ' +
  'methods, limitations, references, or clinical implications. Use polished journal-ready English.';

function instruction(mode: z.infer<typeof ManuscriptToolMode>, hasContext: boolean): string {
  switch (mode) {
    case 'abstract':
      return hasContext
        ? 'Improve the supplied abstract for accuracy, concision, academic tone, logical flow, and balanced reporting. Ensure objectives, methods, main results, and conclusions are represented when supported by context.'
        : 'Create a concise, journal-ready abstract from the supplied manuscript. Include only information explicitly present in the manuscript.';
    case 'titles':
      return 'Propose 8 concise, specific research article titles. Include a mix of descriptive, design-led, and finding-led options. Avoid claims stronger than the supplied text.';
    case 'discussion':
      return 'Strengthen the Discussion section: improve interpretation, comparison logic, limitations, clinical/research implications, cautious language, and paragraph flow. Do not add unsupported literature or findings.';
    case 'conclusion':
      return 'Strengthen the Conclusion section: make it concise, directly supported by results, appropriately cautious, and clear about implications. Remove repetition and unsupported recommendations.';
  }
}

function buildPrompt(body: z.infer<typeof BodySchema>, encoded: string, citationCount: number): string {
  const schema =
    body.mode === 'titles'
      ? '{"options":["title 1","title 2"],"rationale":"brief selection guidance","cautions":[]}'
      : '{"output":"revised section","rationale":"brief account of improvements","cautions":["facts the author should verify"]}';
  return [
    instruction(body.mode, Boolean(body.context)),
    `Explain the changes in ${body.lang === 'tr' ? 'Turkish' : 'English'}, but write manuscript text in English.`,
    `JSON schema: ${schema}`,
    `PRIMARY TEXT:\n${encoded}`,
    body.context ? `MANUSCRIPT CONTEXT:\n${body.context}` : '',
    citationCount > 0 ? citationPreservationInstruction(citationCount) : '',
    'Return valid JSON only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;
  const config = configFromHeaders(req.headers);
  if (!isAIConfigured(config)) {
    return NextResponse.json(
      { error: 'AI yapılandırılmamış. / AI is not configured.' },
      { status: 503 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: 400 },
    );
  }

  const encoded = body.text;
  const citationTokens = body.preserveCitations
    ? encoded.match(/\uE000\d+\uE001/g) ?? []
    : [];
  try {
    const result = await generateStructured(
      buildPrompt(body, encoded, citationTokens.length),
      ManuscriptToolResult,
      {
        system: SYSTEM,
        temperature: body.mode === 'titles' ? 0.55 : 0.2,
        maxTokens: body.mode === 'titles' ? 2_048 : 6_000,
        config,
        signal: timeoutSignal(),
      },
    );
    if (
      (body.mode === 'titles' && (!result.options || result.options.length === 0)) ||
      (body.mode !== 'titles' && !result.output?.trim())
    ) {
      return NextResponse.json(
        {
          error:
            body.lang === 'tr'
              ? 'AI aracı kullanılabilir bir metin üretmedi.'
              : 'The AI tool did not produce usable manuscript text.',
        },
        { status: 502 },
      );
    }
    const returnedTokens = body.preserveCitations
      ? result.output?.match(/\uE000\d+\uE001/g) ?? []
      : [];
    if (
      body.mode !== 'titles' &&
      (returnedTokens.length !== citationTokens.length ||
        returnedTokens.some((token, index) => token !== citationTokens[index]))
    ) {
      return NextResponse.json(
        {
          error:
            body.lang === 'tr'
              ? 'AI çıktısı metin içi atıfları güvenli biçimde koruyamadı. Değişiklik uygulanmadı.'
              : 'The AI output did not preserve inline citations safely. No change was applied.',
        },
        { status: 422 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ai/manuscript-tool]', error);
    return aiErrorResponse(error);
  }
}
