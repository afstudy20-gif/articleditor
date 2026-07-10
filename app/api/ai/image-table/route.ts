import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ImageTableResult } from '@/lib/ai/schemas';
import {
  configFromHeaders,
  getVisionProvider,
  isVisionConfigured,
} from '@/lib/ai/provider';
import { checkRateLimit, timeoutSignal, aiErrorResponse } from '@/lib/ai/guard';
import { generateVisionCli, isCliVisionEnabled, CliVisionError } from '@/lib/ai/cli-vision';
import {
  parseImageDataUrl,
  buildImageTablePrompt,
  buildCliImageTablePrompt,
  imageResultToParsedTable,
} from '@/lib/tables/image-table';

export const runtime = 'nodejs';

// Base64 inflates ~33%; 8 MB decoded ≈ 11 MB string. Cap the payload.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const BodySchema = z.object({
  imageDataUrl: z.string().min(32).max(16_000_000),
  lang: z.enum(['tr', 'en']).default('tr'),
});

const SYSTEM =
  'You transcribe tables from images into structured JSON with perfect fidelity. ' +
  'You never invent, translate or reformat cell content.';

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : trimmed;
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  const config = configFromHeaders(req.headers);
  const cliBackend = isCliVisionEnabled();
  if (!isVisionConfigured(config) && !cliBackend) {
    return NextResponse.json(
      {
        error:
          'Görsel destekli AI yapılandırılmamış (Gemini/OpenAI/Anthropic anahtarı ya da ' +
          'AI_LOCAL_CLI_VISION=claude|zcode|kimi gerekir). / No vision-capable AI is configured ' +
          '(needs a Gemini, OpenAI or Anthropic key, or AI_LOCAL_CLI_VISION=claude|zcode|kimi for ' +
          'a local CLI fallback).',
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

  const image = parseImageDataUrl(body.imageDataUrl);
  if (!image) {
    return NextResponse.json(
      {
        error:
          'Desteklenmeyen görsel. PNG, JPEG, WebP veya GIF gerekir. / ' +
          'Unsupported image — provide a PNG, JPEG, WebP or GIF.',
      },
      { status: 400 },
    );
  }
  if (image.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Görsel çok büyük (maks. 8 MB). / Image too large (max 8 MB).' },
      { status: 413 },
    );
  }

  const provider = getVisionProvider(config);
  const prompt = buildImageTablePrompt(body.lang);

  try {
    let raw: string;
    if (provider?.generateVision) {
      raw = await provider.generateVision(prompt, image, {
        system: SYSTEM,
        temperature: 0,
        maxTokens: 8_192,
        jsonMode: true,
        signal: timeoutSignal(),
      });
    } else if (cliBackend) {
      // No server API key configured — fall back to a local CLI agent already
      // authenticated on this machine (dev-only; see AI_LOCAL_CLI_VISION docs).
      // Uses the condensed prompt: the long API-oriented one measurably
      // degraded one CLI backend's own internal tool-call behavior.
      raw = await generateVisionCli(cliBackend, buildCliImageTablePrompt(body.lang), image);
    } else {
      return NextResponse.json(
        { error: 'No vision-capable AI is configured.' },
        { status: 503 },
      );
    }
    const parsed = ImageTableResult.parse(JSON.parse(stripCodeFence(raw)));
    const table = imageResultToParsedTable(parsed);
    if (!table) {
      return NextResponse.json(
        {
          error:
            body.lang === 'tr'
              ? 'Görselde tablo algılanamadı.'
              : 'No table could be detected in the image.',
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ table });
  } catch (err) {
    if (err instanceof CliVisionError) {
      console.error('[ai/image-table:cli]', err);
      return NextResponse.json(
        {
          error:
            'Yerel CLI görsel işleme başarısız oldu. / Local CLI vision processing failed.',
          code: 'cli_vision_error',
        },
        { status: 502 },
      );
    }
    return aiErrorResponse(err);
  }
}
