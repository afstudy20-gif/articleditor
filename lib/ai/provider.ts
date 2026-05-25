// Unified AI provider interface. Gemini default; Anthropic + OpenAI fallback.
// Add new providers by implementing the AIProvider interface and registering in `getProvider()`.

import { generateTextGemini, streamTextGemini, embedBatchGemini } from './gemini';
import { generateTextAnthropic, streamTextAnthropic } from './anthropic';
import { generateTextOpenAI, streamTextOpenAI, embedBatchOpenAI } from './openai';

export type ProviderName = 'gemini' | 'anthropic' | 'openai';

export type GenerateOptions = {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

export interface AIProvider {
  name: ProviderName;
  generateText(prompt: string, opts?: GenerateOptions): Promise<string>;
  streamText(prompt: string, opts?: GenerateOptions): AsyncIterable<string>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}

export class AIError extends Error {
  constructor(
    public provider: ProviderName,
    public stage: 'generate' | 'stream' | 'embed' | 'config',
    message: string,
  ) {
    super(`[${provider}/${stage}] ${message}`);
    this.name = 'AIError';
  }
}

export function getDefaultProvider(): ProviderName {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'gemini'; // returns even without key so callers can surface config error
}

export function isAIConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
  );
}

export function getProvider(name?: ProviderName): AIProvider {
  const provider = name ?? getDefaultProvider();
  switch (provider) {
    case 'gemini':
      return {
        name: 'gemini',
        generateText: generateTextGemini,
        streamText: streamTextGemini,
        embedBatch: embedBatchGemini,
      };
    case 'anthropic':
      return {
        name: 'anthropic',
        generateText: generateTextAnthropic,
        streamText: streamTextAnthropic,
      };
    case 'openai':
      return {
        name: 'openai',
        generateText: generateTextOpenAI,
        streamText: streamTextOpenAI,
        embedBatch: embedBatchOpenAI,
      };
    default:
      throw new AIError(provider, 'config', `Unknown provider: ${provider}`);
  }
}

// Helper: generate JSON-validated output with one retry on schema parse failure.
// Caller passes a Zod schema; we attach a "reminder" to the prompt on retry.
import { z } from 'zod';

export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts?: GenerateOptions & { provider?: ProviderName },
): Promise<T> {
  const provider = getProvider(opts?.provider);
  const baseOpts: GenerateOptions = {
    ...opts,
    jsonMode: true,
    temperature: opts?.temperature ?? 0.2,
  };

  const tryOnce = async (extraInstr?: string): Promise<T> => {
    const fullPrompt = extraInstr ? `${prompt}\n\n${extraInstr}` : prompt;
    const raw = await provider.generateText(fullPrompt, baseOpts);
    const cleaned = stripCodeFence(raw);
    const parsed = JSON.parse(cleaned);
    return schema.parse(parsed);
  };

  try {
    return await tryOnce();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reminder =
      'IMPORTANT: Your previous response failed JSON schema validation. ' +
      `Error: ${msg.slice(0, 300)}. ` +
      'Respond with ONLY valid JSON, no prose, no code fences. Match the schema exactly.';
    return await tryOnce(reminder);
  }
}

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  // Match ```json\n...\n``` or ```\n...\n```
  const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : trimmed;
}
