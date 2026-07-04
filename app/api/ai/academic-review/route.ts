import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AcademicReviewResult } from '@/lib/ai/schemas';
import { generateStructured, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';
import { MDPI_EDITOR_GUIDANCE } from '@/lib/ai/mdpi-editor-guidance';

export const runtime = 'nodejs';

const ReviewBlockSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().min(1).max(4_000),
  section: z.string().max(120).optional(),
});

const BodySchema = z
  .object({
    blocks: z.array(ReviewBlockSchema).min(1).max(30),
    lang: z.enum(['tr', 'en']).default('tr'),
    manuscriptType: z.string().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    const total = value.blocks.reduce((sum, block) => sum + block.text.length, 0);
    if (total > 12_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Review chunk exceeds 12,000 characters',
        path: ['blocks'],
      });
    }
  });

const SYSTEM =
  'You are a senior scientific and medical manuscript editor. Review English academic writing ' +
  'with special care for authors who speak English as an additional language. Preserve scientific ' +
  'meaning, numerical values, citations, technical terms, hedging, and causal strength. Never invent ' +
  'results or references. Report only concrete, actionable issues supported by an exact quote.';

function buildPrompt(body: z.infer<typeof BodySchema>): string {
  const explanationLanguage = body.lang === 'tr' ? 'Turkish' : 'English';
  return [
    'Review every supplied manuscript block. Return at most 30 high-value issues.',
    'Use these categories exactly:',
    'mechanics, grammar, academic-tone, word-choice, readability, phrasing, structure, evidence, statistics, consistency.',
    'Category guidance:',
    '- mechanics: punctuation, capitalization, spacing, hyphenation, spelling',
    '- grammar: agreement, tense, articles, prepositions, syntax',
    '- academic-tone: formality, objectivity, cautious scientific claims',
    '- word-choice: imprecise, non-idiomatic, or discipline-inappropriate vocabulary',
    '- readability: excessive length, ambiguity, density, poor transitions',
    '- phrasing: redundancy, awkward construction, concision, fluency',
    '- structure: paragraph purpose, logical order, section-level organization',
    '- evidence: unsupported or overstated claims, missing qualification',
    '- statistics: incomplete or inconsistent medical/statistical reporting; do not recalculate results',
    '- consistency: terminology, abbreviations, tense, US/UK English, labels',
    MDPI_EDITOR_GUIDANCE,
    `Write explanations in ${explanationLanguage}; replacements must use the manuscript's language.`,
    'The quote must be copied verbatim from one block and should not include citation markers.',
    'Use occurrence=0 for the first exact occurrence inside that block, 1 for the second, and so on.',
    'Omit replacement only when the issue is structural or cannot be fixed by replacing the quote.',
    'JSON schema:',
    '{"issues":[{"category":"...","severity":"low|med|high","blockId":"exact supplied id",' +
      '"quote":"exact text","occurrence":0,"explanation":"...","replacement":"...",' +
      '"confidence":0.0}],"summary":"brief overall assessment"}',
    body.manuscriptType ? `MANUSCRIPT TYPE: ${body.manuscriptType}` : '',
    `BLOCKS:\n${JSON.stringify(body.blocks)}`,
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

  try {
    const result = await generateStructured(buildPrompt(body), AcademicReviewResult, {
      system: SYSTEM,
      temperature: 0.1,
      maxTokens: 6_000,
      config,
      signal: timeoutSignal(),
    });
    const validBlockIds = new Set(body.blocks.map((block) => block.id));
    return NextResponse.json({
      ...result,
      issues: result.issues.filter((issue) => validBlockIds.has(issue.blockId)),
    });
  } catch (error) {
    console.error('[ai/academic-review]', error);
    return aiErrorResponse(error);
  }
}
