// Browser client for the RAG embedding endpoint.
//
// Sends texts to `/api/rag/embed` and decodes the base64-encoded little-endian
// Float32 payloads returned by the route into `Float32Array` vectors ready for
// `cosineSimilarity` / `topK`. The 30 s timeout protects the panel from a
// hanging provider call; `RagEmbedError` collapses every failure mode (network,
// HTTP, decode) into a single typed error the UI can render.

import { RagEmbedError } from './errors';

export type EmbedRequest = { texts: string[]; model?: string };
export type EmbedResponse = { vectors: Float32Array[]; model: string; dim: number };

const EMBED_TIMEOUT_MS = 30_000;

type EmbedJsonResponse = {
  vectors: string[];
  model: string;
  dim: number;
};

export async function embedTexts(req: EmbedRequest): Promise<EmbedResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('/api/rag/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new RagEmbedError('Embedding isteği zaman aşımına uğradı.', err);
    }
    throw new RagEmbedError('Embedding servisine ulaşılamadı.', err);
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const message = await safeErrorBody(res);
    throw new RagEmbedError(message, { status: res.status });
  }

  let json: EmbedJsonResponse;
  try {
    json = (await res.json()) as EmbedJsonResponse;
  } catch (err) {
    throw new RagEmbedError('Embedding yanıtı okunamadı.', err);
  }

  if (!Array.isArray(json.vectors) || json.vectors.length === 0) {
    throw new RagEmbedError('Embedding yanıtı boş döndü.');
  }

  let vectors: Float32Array[];
  try {
    vectors = json.vectors.map((b64) => decodeFloat32Base64(b64));
  } catch (err) {
    throw new RagEmbedError('Embedding vektörleri çözülemedi.', err);
  }

  return { vectors, model: json.model, dim: json.dim };
}

async function safeErrorBody(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === 'string' && body.error.length > 0
      ? body.error
      : `Embedding hatası (HTTP ${res.status}).`;
  } catch {
    return `Embedding hatası (HTTP ${res.status}).`;
  }
}

// Decode a base64 string into a Float32Array. The route emits little-endian
// Float32 bytes, which is the native byte order on every supported platform.
function decodeFloat32Base64(b64: string): Float32Array {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(buffer);
}
