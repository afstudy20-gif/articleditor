import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

// RAG chat route.
//
// Answers the user's question strictly from the supplied context chunks using
// Anthropic's claude-sonnet-4-6. The model emits inline `[chunk_id]` citations;
// we parse them out of the answer and also return the unique cited ids. When the
// context does not support an answer, the system prompt forces the fixed
// "not found" fallback so the UI can detect an empty result.
//
// Provider/SDK detail is never leaked to the client; the catch-all logs the raw
// error server-side and returns a generic message.

export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-4-6';
const MAX_CHUNKS = 40;
const MAX_CHUNK_CHARS = 8_000;
const MAX_QUESTION_CHARS = 4_000;
const MAX_HISTORY = 20;
const ANTHROPIC_TIMEOUT_MS = 75_000;
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT =
  'Sen bir akademik araştırma asistanısın. Kullanıcının sorusunu YALNIZCA ' +
  'aşağıda verilen "BAĞLAM" bölümündeki kaynak parçalarından (chunk) yanıtla. ' +
  'Her iddianın sonuna, dayandığın parçanın kimliğini [chunk_id] biçiminde ekle. ' +
  'Aynı cümle birden fazla parçaya dayanıyorsa hepsini listele (örn. [a1b2][c3d4]). ' +
  'BAĞLAM dışındaki bilgiyi kullanma. BAĞLAM, soruyu yanıtlamak için yetersizse, ' +
  'hiç citation ekleme ve tam olarak şu cümleyi döndür: ' +
  '"Bu sorunun cevabı kütüphanedeki referanslarda bulunamadı."';

const NOT_FOUND_FALLBACK = 'Bu sorunun cevabı kütüphanedeki referanslarda bulunamadı.';
const CITATION_RE = /\[([a-z0-9-]+)\]/gi;

const BodySchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_CHARS),
  contextChunks: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1).max(MAX_CHUNK_CHARS),
        refId: z.string().min(1).max(128),
        pageNo: z.number().int().finite().nonnegative().optional(),
      }),
    )
    .max(MAX_CHUNKS),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(MAX_QUESTION_CHARS),
        citations: z.array(z.number().int()).optional(),
      }),
    )
    .max(MAX_HISTORY)
    .optional(),
});

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Sunucuda Anthropic anahtarı yapılandırılmamış.' },
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

  const client = new Anthropic({ apiKey });
  const messages = buildMessages(body);

  let answer: string;
  try {
    const res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages,
      },
      { signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS) },
    );
    answer = extractText(res);
  } catch (err) {
    return chatErrorResponse(err);
  }

  const citedChunkIds = extractCitations(answer, body.contextChunks);
  return NextResponse.json({ answer, citedChunkIds });
}

function buildMessages(body: z.infer<typeof BodySchema>): ChatMessage[] {
  const contextBlock = body.contextChunks
    .map((chunk) => {
      const page = chunk.pageNo !== undefined ? ` (s. ${chunk.pageNo})` : '';
      return `[${chunk.id}]${page}\n${chunk.text}`;
    })
    .join('\n\n---\n\n');

  const messages: ChatMessage[] = [];
  if (body.history) {
    for (const msg of body.history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({
    role: 'user',
    content: `BAĞLAM:\n${contextBlock}\n\nSORU: ${body.question}`,
  });
  return messages;
}

function extractText(res: Anthropic.Messages.Message): string {
  const block = res.content.find((c): c is Anthropic.TextBlock => c.type === 'text');
  if (!block) {
    throw new Error('Anthropic yanıtı metin bloğu içermiyor.');
  }
  return block.text.trim();
}

// Collect unique cited ids in first-appearance order, keeping only ids that map
// to a real context chunk so model hallucinations of ids are filtered out.
function extractCitations(
  answer: string,
  chunks: Array<{ id: string }>,
): string[] {
  if (answer === NOT_FOUND_FALLBACK) return [];

  const validIds = new Set(chunks.map((c) => c.id));
  const seen = new Set<string>();
  const ordered: string[] = [];

  CITATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_RE.exec(answer)) !== null) {
    const id = match[1];
    if (!id || !validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

function chatErrorResponse(err: unknown): Response {
  if (err instanceof Error) {
    const combined = `${err.name} ${err.message}`;
    if (/timed?\s*out|abort/i.test(combined)) {
      return NextResponse.json(
        { error: 'Sohbet isteği zaman aşımına uğradı.' },
        { status: 504 },
      );
    }
  }
  return NextResponse.json(
    { error: 'Sohbet sırasında beklenmeyen bir hata oluştu.' },
    { status: 502 },
  );
}
