import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, aiErrorResponse } from '@/lib/ai/guard';
import { configFromHeaders, isAIConfigured, getProvider } from '@/lib/ai/provider';
import { generateTextCli, isCliTextEnabled, CliTextError, CLI_TEXT_LABELS } from '@/lib/ai/cli-text';
import { GaSpecSchema } from '@/lib/graphical-abstract/spec';
import { getTarget, DEFAULT_TARGET_ID } from '@/lib/graphical-abstract/targets';
import { selectManuscriptExcerpt } from '@/lib/graphical-abstract/excerpt';
import {
  buildGaPrompt,
  buildGroundingRepairPrompt,
  buildDisclosure,
  GA_SYSTEM_PROMPT,
} from '@/lib/graphical-abstract/prompt';
import { validateGaSpec, hasBlockingIssue } from '@/lib/graphical-abstract/rules';
import { buildSourceIndex, checkGrounding } from '@/lib/graphical-abstract/number-grounding';
import { checkArmConsistency } from '@/lib/graphical-abstract/arm-consistency';
import { collectSpecFields } from '@/lib/graphical-abstract/spec-fields';

export const runtime = 'nodejs';

/**
 * Authors a graphical-abstract spec from a manuscript.
 *
 * The model writes JSON only — never an image. Elsevier bans general-purpose generative-AI
 * image tools for graphical abstracts but explicitly permits AI-assisted schematics and
 * diagrams with disclosure, and AcademicFlow renders the JSON deterministically from a
 * fixed icon library. That distinction is what makes the output submittable.
 *
 * Rendering lives in /api/flow/render. This route never touches the render server, so a
 * stopped renderer cannot destroy a spec that took a minute of CLI time to produce.
 */

const BodySchema = z.object({
  mode: z.enum(['graphical', 'visual']),
  targetId: z.string().max(40).default(DEFAULT_TARGET_ID),
  lang: z.enum(['tr', 'en']).default('tr'),
  title: z.string().max(600).optional(),
  abstractText: z.string().max(20_000).optional(),
  keywords: z.array(z.string().max(120)).max(30).optional(),
  bodyText: z.string().max(400_000).optional(),
  captions: z.array(z.string().max(600)).max(80).optional(),
});

const CLI_TIMEOUT_MS = 120_000;

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : trimmed;
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  const config = configFromHeaders(req.headers);
  const cliBackend = isCliTextEnabled();
  if (!cliBackend && !isAIConfigured(config)) {
    return NextResponse.json(
      {
        error:
          'AI yapılandırılmamış. Yerel CLI için AI_LOCAL_CLI_TEXT=claude|kimi|codex ayarlayın ' +
          'ya da bir sağlayıcı anahtarı tanımlayın. / No AI is configured. Set ' +
          'AI_LOCAL_CLI_TEXT=claude|kimi|codex for the local CLI, or configure a provider key.',
        code: 'not_configured',
      },
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

  const target = getTarget(body.targetId);
  if (!target) {
    return NextResponse.json(
      { error: `Unknown target: ${body.targetId}`, code: 'unknown_target' },
      { status: 400 },
    );
  }

  const manuscript = selectManuscriptExcerpt({
    title: body.title,
    abstractText: body.abstractText,
    keywords: body.keywords,
    bodyText: body.bodyText,
    captions: body.captions,
  });

  if (!manuscript.text.trim()) {
    return NextResponse.json(
      {
        error:
          'Makale metni boş — önce başlık ve özet girin. / The manuscript is empty; add a title and abstract first.',
        code: 'empty_manuscript',
      },
      { status: 400 },
    );
  }

  const prompt = buildGaPrompt({
    mode: body.mode,
    target,
    manuscript,
    existingFigureCaptions: body.captions,
    lang: body.lang,
  });

  // Grounding needs the same text the model was given, or a number the model copied
  // correctly from a section that was excerpted away would look fabricated.
  const sourceIndex = buildSourceIndex(manuscript.text);

  async function generate(text: string): Promise<string> {
    if (cliBackend) return generateTextCli(cliBackend, text, { timeoutMs: CLI_TIMEOUT_MS });
    return getProvider(undefined, config).generateText(text, {
      system: GA_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 8_192,
      jsonMode: true,
    });
  }

  try {
    const raw = await generate(prompt);
    let parsed = GaSpecSchema.safeParse(JSON.parse(stripCodeFence(raw)));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Model geçerli bir tanım üretemedi. / The model did not produce a valid spec.',
          code: 'invalid_spec',
          issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 422 },
      );
    }

    let spec = parsed.data;
    let fields = collectSpecFields(spec);
    let ungrounded = checkGrounding(fields, sourceIndex);

    // One corrective round-trip before bothering the author, mirroring the schema-reminder
    // retry in lib/ai/provider.ts. Numbers are never silently rewritten here — the model
    // is asked to fix its own claims against the paper.
    let repaired = false;
    if (ungrounded.length > 0) {
      try {
        const retry = await generate(`${prompt}\n\n${buildGroundingRepairPrompt(ungrounded)}`);
        const reparse = GaSpecSchema.safeParse(JSON.parse(stripCodeFence(retry)));
        if (reparse.success) {
          const retryFields = collectSpecFields(reparse.data);
          const retryUngrounded = checkGrounding(retryFields, sourceIndex);
          if (retryUngrounded.length < ungrounded.length) {
            spec = reparse.data;
            fields = retryFields;
            ungrounded = retryUngrounded;
            repaired = true;
          }
        }
      } catch (err) {
        // A failed repair leaves the first spec intact; the author still sees the issues.
        console.error('[ai/graphical-abstract:repair]', err);
      }
    }

    const issues = validateGaSpec(spec, {
      mode: body.mode,
      target,
      existingFigureCaptions: body.captions,
    });
    const armWarnings = checkArmConsistency(fields, sourceIndex);

    const modelLabel = cliBackend ? CLI_TEXT_LABELS[cliBackend] : getProvider(undefined, config).name;

    return NextResponse.json({
      spec,
      issues,
      ungrounded,
      armWarnings,
      repaired,
      // HTTP 200 with a blocking flag rather than 422: the author has already waited a
      // minute, and an unexpected rounding convention is a question for them, not a reason
      // to throw the work away. The UI refuses to insert while this is true.
      blocking: hasBlockingIssue(issues) || ungrounded.length > 0,
      disclosure: buildDisclosure(modelLabel, body.lang),
      target: { id: target.id, publisher: target.publisher, presetId: target.presetId },
      mode: body.mode,
      manuscript: { included: manuscript.included, truncated: manuscript.truncated },
    });
  } catch (err) {
    if (err instanceof CliTextError) {
      console.error('[ai/graphical-abstract:cli]', err);
      return NextResponse.json(
        {
          error: 'Yerel CLI çalıştırılamadı. / The local CLI run failed.',
          code: 'cli_text_error',
        },
        { status: 502 },
      );
    }
    if (err instanceof SyntaxError) {
      console.error('[ai/graphical-abstract]', err);
      return NextResponse.json(
        {
          error: 'Model JSON döndürmedi. / The model did not return JSON.',
          code: 'invalid_json',
        },
        { status: 422 },
      );
    }
    console.error('[ai/graphical-abstract]', err);
    return aiErrorResponse(err);
  }
}
