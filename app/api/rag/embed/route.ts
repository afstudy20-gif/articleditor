import { NextResponse } from 'next/server';
import { z } from 'zod';

// RAG embedding route.
//
// Independent of @/lib/ai/*: calls the OpenAI embeddings API directly with the
// server-side OPENAI_API_KEY. Returns vectors as base64-encoded little-endian
// Float32 payloads so the browser client can decode them into Float32Array
// without a full JSON array of numbers (~4x smaller on the wire).
//
// Provider details are never echoed to the client; the catch-all maps every
// failure to a generic message and logs the raw error server-side.

export const runtime = 'nodejs';

const MODEL = 'text-embedding-3-small';
const EXPECTED_DIM = 1536;
const MAX_TEXTS = 100;
const MAX_TEXT_CHARS = 16_000;
const OPENAI_TIMEOUT_MS = 60_000;
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';

const BodySchema = z.object({
  texts: z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_TEXTS),
  model: z.string().max(64).optional(),
});

type OpenAIEmbeddingResponse = {
  model: string;
  data: Array<{ embedding: number[]; index: number }>;
};

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Sunucuda OpenAI embedding anahtarı yapılandırılmamış.' },
      { status: 500 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid body';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const model = body.model?.trim() || MODEL;

  let payload: OpenAIEmbeddingResponse;
  try {
    payload = await callOpenAI(model, body.texts, apiKey);
  } catch (err) {
    return embedErrorResponse(err);
  }

  if (!Array.isArray(payload.data) || payload.data.length !== body.texts.length) {
    return NextResponse.json(
      { error: 'Embedding sağlayıcısı beklenmeyen yanıt döndürdü.' },
      { status: 502 },
    );
  }

  // OpenAI may return embeddings out of input order when batching; sort by the
  // provider-supplied index before encoding so vectors align with `texts`.
  const ordered = [...payload.data].sort((a, b) => a.index - b.index);
  const dim = ordered[0]?.embedding.length ?? 0;
  if (dim === 0 || dim !== EXPECTED_DIM) {
    return NextResponse.json(
      { error: 'Embedding boyutu beklenenden farklı.' },
      { status: 502 },
    );
  }

  const vectors = ordered.map((entry) => encodeFloat32Base64(entry.embedding));
  return NextResponse.json({ vectors, model: payload.model || model, dim });
}

async function callOpenAI(
  model: string,
  texts: string[],
  apiKey: string,
): Promise<OpenAIEmbeddingResponse> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await safeUpstreamBody(res);
    throw new UpstreamError(
      `OpenAI embeddings HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      res.status,
    );
  }

  return (await res.json()) as OpenAIEmbeddingResponse;
}

class UpstreamError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'UpstreamError';
  }
}

function encodeFloat32Base64(values: number[]): string {
  const view = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    view[i] = values[i];
  }
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function safeUpstreamBody(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (body.error && typeof body.error === 'object') {
      const message = (body.error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    if (typeof body.error === 'string') return body.error;
  } catch {
    /* ignore — the status code is enough */
  }
  return '';
}

function embedErrorResponse(err: unknown): Response {
  if (err instanceof UpstreamError) {
    return NextResponse.json(
      { error: 'Embedding sağlayıcısı çağrısı başarısız oldu.' },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
    );
  }
  if (err instanceof Error && /timed?\s*out|abort/i.test(err.name + err.message)) {
    return NextResponse.json(
      { error: 'Embedding isteği zaman aşımına uğradı.' },
      { status: 504 },
    );
  }
  return NextResponse.json(
    { error: 'Embedding sırasında beklenmeyen bir hata oluştu.' },
    { status: 500 },
  );
}
