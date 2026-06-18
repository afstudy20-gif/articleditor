// Browser client for the RAG chat endpoint.
//
// One-shot (no streaming yet): posts the question plus the retrieved context
// chunks to `/api/rag/chat` and returns the model answer plus the chunk ids it
// cited. Callers may pass their own `AbortSignal` (e.g. a "stop" button); a
// user abort is rethrown as `RagChatError` so the panel can distinguish it from
// a transport failure.

import { RagChatError } from './errors';

export type RagChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: number[];
};

export type RagChatRequest = {
  question: string;
  contextChunks: Array<{ id: string; text: string; refId: string; pageNo?: number }>;
  history?: RagChatMessage[];
};

export type RagChatResponse = { answer: string; citedChunkIds: string[] };

type ChatJsonResponse = { answer: string; citedChunkIds: string[] };

export async function ragChat(
  req: RagChatRequest,
  opts?: { signal?: AbortSignal },
): Promise<RagChatResponse> {
  let res: Response;
  try {
    res = await fetch('/api/rag/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: opts?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new RagChatError('Sohbet isteği iptal edildi.', err);
    }
    throw new RagChatError('Sohbet servisine ulaşılamadı.', err);
  }

  if (!res.ok) {
    const message = await safeErrorBody(res);
    throw new RagChatError(message, { status: res.status });
  }

  let json: ChatJsonResponse;
  try {
    json = (await res.json()) as ChatJsonResponse;
  } catch (err) {
    throw new RagChatError('Sohbet yanıtı okunamadı.', err);
  }

  if (typeof json.answer !== 'string') {
    throw new RagChatError('Sohbet yanıtı eksik.');
  }

  return {
    answer: json.answer,
    citedChunkIds: Array.isArray(json.citedChunkIds) ? json.citedChunkIds : [],
  };
}

async function safeErrorBody(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === 'string' && body.error.length > 0
      ? body.error
      : `Sohbet hatası (HTTP ${res.status}).`;
  } catch {
    return `Sohbet hatası (HTTP ${res.status}).`;
  }
}
