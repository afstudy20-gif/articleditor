import OpenAI from 'openai';
import { AIError, type GenerateOptions } from './provider';

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AIError('openai', 'config', 'OPENAI_API_KEY not configured');
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

function getModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function getEmbedModel(): string {
  return process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
}

export async function generateTextOpenAI(
  prompt: string,
  opts?: GenerateOptions,
): Promise<string> {
  const client = getClient();
  try {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (opts?.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const res = await client.chat.completions.create({
      model: getModel(),
      messages,
      temperature: opts?.temperature ?? 0.2,
      max_tokens: opts?.maxTokens ?? 4096,
      response_format: opts?.jsonMode ? { type: 'json_object' } : undefined,
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new AIError('openai', 'generate', 'Empty response');
    return text;
  } catch (err) {
    if (err instanceof AIError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('openai', 'generate', msg);
  }
}

export async function* streamTextOpenAI(
  prompt: string,
  opts?: GenerateOptions,
): AsyncIterable<string> {
  const client = getClient();
  try {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (opts?.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const stream = await client.chat.completions.create({
      model: getModel(),
      messages,
      temperature: opts?.temperature ?? 0.2,
      max_tokens: opts?.maxTokens ?? 4096,
      stream: true,
    });
    for await (const chunk of stream) {
      const piece = chunk.choices[0]?.delta?.content;
      if (piece) yield piece;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('openai', 'stream', msg);
  }
}

export async function embedBatchOpenAI(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  try {
    const res = await client.embeddings.create({
      model: getEmbedModel(),
      input: texts,
    });
    return res.data.map((d) => d.embedding);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('openai', 'embed', msg);
  }
}
