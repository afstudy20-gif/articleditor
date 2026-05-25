import Anthropic from '@anthropic-ai/sdk';
import { AIError, type GenerateOptions } from './provider';

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AIError('anthropic', 'config', 'ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: key });
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
}

export async function generateTextAnthropic(
  prompt: string,
  opts?: GenerateOptions,
): Promise<string> {
  const client = getClient();
  try {
    const res = await client.messages.create({
      model: getModel(),
      system: opts?.system,
      max_tokens: opts?.maxTokens ?? 4096,
      temperature: opts?.temperature ?? 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = res.content.find((c) => c.type === 'text');
    if (!block || block.type !== 'text') throw new AIError('anthropic', 'generate', 'No text block');
    return block.text;
  } catch (err) {
    if (err instanceof AIError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('anthropic', 'generate', msg);
  }
}

export async function* streamTextAnthropic(
  prompt: string,
  opts?: GenerateOptions,
): AsyncIterable<string> {
  const client = getClient();
  try {
    const stream = client.messages.stream({
      model: getModel(),
      system: opts?.system,
      max_tokens: opts?.maxTokens ?? 4096,
      temperature: opts?.temperature ?? 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('anthropic', 'stream', msg);
  }
}
