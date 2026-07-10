import OpenAI from 'openai';
import { AIError, type GenerateOptions } from './provider';

type OpenAICfg = { apiKey?: string; baseUrl?: string; model: string; embedModel: string };

function getClient(cfg: OpenAICfg): OpenAI {
  if (!cfg.apiKey) throw new AIError('openai', 'config', 'OPENAI_API_KEY not configured');
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
  });
}

export async function generateTextOpenAI(
  prompt: string,
  opts: GenerateOptions | undefined,
  cfg: OpenAICfg,
): Promise<string> {
  const client = getClient(cfg);
  try {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (opts?.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const res = await client.chat.completions.create(
      {
        model: cfg.model,
        messages,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 4096,
        response_format: opts?.jsonMode ? { type: 'json_object' } : undefined,
      },
      opts?.signal ? { signal: opts.signal } : undefined,
    );
    const text = res.choices[0]?.message?.content;
    if (!text) throw new AIError('openai', 'generate', 'Empty response');
    return text;
  } catch (err) {
    if (err instanceof AIError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('openai', 'generate', msg);
  }
}

export async function generateVisionOpenAI(
  prompt: string,
  image: { dataUrl: string },
  opts: GenerateOptions | undefined,
  cfg: OpenAICfg,
): Promise<string> {
  const client = getClient(cfg);
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (opts?.system) messages.push({ role: 'system', content: opts.system });
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image.dataUrl } },
      ],
    });
    const res = await client.chat.completions.create(
      {
        model: cfg.model,
        messages,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 4096,
        response_format: opts?.jsonMode ? { type: 'json_object' } : undefined,
      },
      opts?.signal ? { signal: opts.signal } : undefined,
    );
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
  opts: GenerateOptions | undefined,
  cfg: OpenAICfg,
): AsyncIterable<string> {
  const client = getClient(cfg);
  try {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (opts?.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const stream = await client.chat.completions.create({
      model: cfg.model,
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

export async function embedBatchOpenAI(
  texts: string[],
  cfg: OpenAICfg,
  signal?: AbortSignal,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient(cfg);
  try {
    const res = await client.embeddings.create(
      {
        model: cfg.embedModel,
        input: texts,
      },
      signal ? { signal } : undefined,
    );
    return res.data.map((d) => d.embedding);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('openai', 'embed', msg);
  }
}
