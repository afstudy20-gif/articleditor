import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GaSpecSchema } from '@/lib/graphical-abstract/spec';
import {
  createFlowClient,
  renderResultToDataUrl,
  FlowUnavailableError,
  FlowSpecError,
  FlowAuthError,
} from '@/lib/graphical-abstract/flow-client';
import { flowBaseUrlFromEnv } from '@/lib/graphical-abstract/flow-url';

export const runtime = 'nodejs';

/**
 * Rendering is separate from authoring on purpose. Authoring costs a minute of local CLI
 * time; rendering is cheap, idempotent, and needed repeatedly — re-render at another
 * publisher target, re-render after the author edits the spec by hand, render a PNG for
 * insertion after previewing the SVG. Fused into one route, a render failure would throw
 * away a spec the author just waited a minute for.
 */

const BodySchema = z.object({
  spec: z.unknown(),
  format: z.enum(['svg', 'png']).default('svg'),
  dpi: z.number().int().min(72).max(1200).optional(),
  pad: z.number().int().min(0).max(200).optional(),
});

/** Its own budget, well away from the shared AI limit that authoring uses. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, number[]>();

function rateLimited(req: Request): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? 'local';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  if (rateLimited(req)) {
    return NextResponse.json(
      { error: 'Çok fazla istek. / Too many requests.', code: 'rate_limited' },
      { status: 429 },
    );
  }

  const baseUrl = (() => {
    try {
      return flowBaseUrlFromEnv(process.env);
    } catch (err) {
      console.error('[flow/render]', err);
      return null;
    }
  })();

  if (!baseUrl) {
    return NextResponse.json(
      {
        error:
          'AcademicFlow render sunucusu yapılandırılmamış (FLOW_SERVER_URL). / ' +
          'The AcademicFlow render server is not configured (FLOW_SERVER_URL).',
        code: 'flow_not_configured',
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

  // Validate here rather than relying on flow-app's shallow check, which does not look at
  // figure ids, chart kinds or unknown keys.
  const parsed = GaSpecSchema.safeParse(body.spec);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Geçersiz grafiksel özet tanımı. / Invalid graphical-abstract spec.',
        code: 'invalid_spec',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 422 },
    );
  }

  try {
    const client = createFlowClient({ baseUrl, apiKey: process.env.FLOW_API_KEY });
    const result = await client.render(parsed.data, {
      format: body.format,
      dpi: body.dpi,
      pad: body.pad,
    });
    return NextResponse.json({
      dataUrl: renderResultToDataUrl(result),
      contentType: result.contentType,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    console.error('[flow/render]', err);
    if (err instanceof FlowUnavailableError) {
      return NextResponse.json(
        {
          error:
            'AcademicFlow render sunucusu çalışmıyor. flow-app dizininde `npm run serve` çalıştırın. / ' +
            'The AcademicFlow render server is not running. Start it with `npm run serve` in the flow-app repo.',
          code: 'flow_unavailable',
        },
        { status: 503 },
      );
    }
    if (err instanceof FlowAuthError) {
      return NextResponse.json(
        {
          error: 'Render sunucusu API anahtarını reddetti. / The render server rejected the API key.',
          code: 'flow_auth',
        },
        { status: 502 },
      );
    }
    if (err instanceof FlowSpecError) {
      return NextResponse.json(
        {
          error: 'Render sunucusu tanımı reddetti. / The render server rejected the spec.',
          code: 'invalid_spec',
          issues: err.errors,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: 'Render başarısız oldu. / Rendering failed.', code: 'flow_render_failed' },
      { status: 502 },
    );
  }
}
