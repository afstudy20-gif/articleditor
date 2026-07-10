import Anthropic from '@anthropic-ai/sdk';
import { AIError, type GenerateOptions } from './provider';

type AnthropicCfg = { apiKey?: string; model: string };

function getClient(cfg: AnthropicCfg): Anthropic {
  if (!cfg.apiKey) throw new AIError('anthropic', 'config', 'ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: cfg.apiKey });
}

export async function generateTextAnthropic(
  prompt: string,
  opts: GenerateOptions | undefined,
  cfg: AnthropicCfg,
): Promise<string> {
  const client = getClient(cfg);
  try {
    const res = await client.messages.create(
      {
        model: cfg.model,
        system: opts?.system,
        max_tokens: opts?.maxTokens ?? 4096,
        temperature: opts?.temperature ?? 0.2,
        messages: [{ role: 'user', content: prompt }],
      },
      opts?.signal ? { signal: opts.signal } : undefined,
    );
    const block = res.content.find((c) => c.type === 'text');
    if (!block || block.type !== 'text') throw new AIError('anthropic', 'generate', 'No text block');
    return block.text;
  } catch (err) {
    if (err instanceof AIError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('anthropic', 'generate', msg);
  }
}

export async function generateVisionAnthropic(
  prompt: string,
  image: { mimeType: string; base64: string },
  opts: GenerateOptions | undefined,
  cfg: AnthropicCfg,
): Promise<string> {
  const client = getClient(cfg);
  try {
    const res = await client.messages.create(
      {
        model: cfg.model,
        system: opts?.system,
        max_tokens: opts?.maxTokens ?? 4096,
        temperature: opts?.temperature ?? 0.2,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mimeType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/gif'
                    | 'image/webp',
                  data: image.base64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      },
      opts?.signal ? { signal: opts.signal } : undefined,
    );
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
  opts: GenerateOptions | undefined,
  cfg: AnthropicCfg,
): AsyncIterable<string> {
  const client = getClient(cfg);
  try {
    const stream = client.messages.stream({
      model: cfg.model,
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
