import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructured, isAIConfigured, configFromHeaders } from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';

export const runtime = 'nodejs';

const BodySchema = z.object({
  mode: z.enum(['rules', 'example']),
  text: z.string().min(3).max(8_000),
  lang: z.enum(['tr', 'en']).default('en'),
});

// Mirror of the editable knobs in lib/refs/style-spec.ts (all optional — the
// model fills what it can infer; the client merges onto the current spec).
const StyleSpecSchema = z.object({
  mode: z.enum(['numeric', 'author-year']).optional(),
  inText: z
    .object({
      bracket: z.enum(['square', 'paren', 'curly', 'superscript']).optional(),
      authorYearOpen: z.string().max(3).optional(),
      authorYearClose: z.string().max(3).optional(),
      authorYearSep: z.string().max(4).optional(),
      etAlAfter: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
  authors: z
    .object({
      nameOrder: z.enum(['family-initials', 'family-comma-initials', 'initials-family']).optional(),
      initialPeriods: z.boolean().optional(),
      initialSpaces: z.boolean().optional(),
      maxBeforeEtAl: z.number().int().min(1).max(50).optional(),
      showCount: z.number().int().min(1).max(50).optional(),
      etAlText: z.string().max(20).optional(),
      delimiter: z.string().max(4).optional(),
      useAndBeforeLast: z.boolean().optional(),
      andText: z.string().max(6).optional(),
    })
    .optional(),
  title: z.object({ emphasis: z.enum(['plain', 'italic', 'quoted']).optional(), suffix: z.string().max(3).optional() }).optional(),
  journal: z.object({ emphasis: z.enum(['plain', 'italic', 'quoted']).optional(), suffix: z.string().max(3).optional() }).optional(),
  locator: z.enum(['vancouver', 'apa', 'ieee']).optional(),
  doi: z.object({ include: z.boolean().optional(), prefix: z.string().max(20).optional() }).optional(),
  bib: z.object({ number: z.enum(['dot', 'bracket', 'none']).optional(), order: z.enum(['citation', 'alphabetical']).optional() }).optional(),
});

const SCHEMA_DOC = `JSON schema (all fields optional, infer only what is evident):
{
 "mode":"numeric|author-year",
 "inText":{"bracket":"square|paren|curly|superscript","authorYearOpen":"(","authorYearClose":")","authorYearSep":", ","etAlAfter":2},
 "authors":{"nameOrder":"family-initials|family-comma-initials|initials-family","initialPeriods":bool,"initialSpaces":bool,"maxBeforeEtAl":6,"showCount":6,"etAlText":"et al.","delimiter":", ","useAndBeforeLast":bool,"andText":"&"},
 "title":{"emphasis":"plain|italic|quoted","suffix":"."},
 "journal":{"emphasis":"plain|italic|quoted","suffix":"."},
 "locator":"vancouver|apa|ieee",
 "doi":{"include":bool,"prefix":"doi: "},
 "bib":{"number":"dot|bracket|none","order":"citation|alphabetical"}
}
Guidance: numeric styles use [n]/(n)/superscript and number the bibliography; author-year styles cite (Author, Year) and order alphabetically.
"nameOrder" family-initials="Smith JA", family-comma-initials="Smith, J. A.", initials-family="J. A. Smith".
"locator": vancouver="2019;15(3):123-130", apa="15(3), 123-130", ieee="vol. 15, no. 3, pp. 123-130".`;

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

  const task =
    body.mode === 'example'
      ? 'Infer a citation style configuration from this EXAMPLE reference/citation:'
      : "Infer a citation style configuration from this journal's INSTRUCTIONS-FOR-AUTHORS text:";
  const prompt = `${task}\n\n"""\n${body.text}\n"""\n\n${SCHEMA_DOC}\n\nReturn ONLY valid JSON matching the schema, no prose.`;

  try {
    const result = await generateStructured(prompt, StyleSpecSchema, {
      system:
        'You convert journal citation rules or example citations into a structured style config. ' +
        'Only set fields you are confident about; omit the rest.',
      temperature: 0.1,
      maxTokens: 1024,
      config: cfg,
      signal: timeoutSignal(),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ai/style]', err);
    return aiErrorResponse(err);
  }
}
