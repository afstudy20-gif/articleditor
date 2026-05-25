// Unified AI provider interface. Gemini default; Anthropic + OpenAI fallback.
// Add new providers by implementing the AIProvider interface and registering in `getProvider()`.
//
// Configuration precedence per request:
//   1. ProviderConfig passed explicitly (parsed from X-AI-* request headers)
//   2. process.env (server-side fallback for self-hosted instances)
// This enables BYO-key mode without sacrificing server-side env defaults.

import { z } from 'zod';
import { generateTextGemini, streamTextGemini, embedBatchGemini } from './gemini';
import { generateTextAnthropic, streamTextAnthropic } from './anthropic';
import { generateTextOpenAI, streamTextOpenAI, embedBatchOpenAI } from './openai';

export type ProviderName = 'gemini' | 'anthropic' | 'openai';

export type ProviderConfig = {
  gemini?: { apiKey?: string; model?: string; embedModel?: string };
  anthropic?: { apiKey?: string; model?: string };
  openai?: { apiKey?: string; baseUrl?: string; model?: string; embedModel?: string };
  preferred?: ProviderName;
};

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

// Read X-AI-* headers from an incoming request into a ProviderConfig.
// Empty/whitespace values are ignored so the env fallback applies.
export function configFromHeaders(headers: Headers): ProviderConfig {
  const get = (name: string): string | undefined => {
    const v = headers.get(name);
    return v && v.trim() ? v.trim() : undefined;
  };
  const preferredRaw = get('X-AI-Preferred-Provider');
  const preferred: ProviderName | undefined =
    preferredRaw === 'gemini' || preferredRaw === 'anthropic' || preferredRaw === 'openai'
      ? preferredRaw
      : undefined;
  return {
    gemini: {
      apiKey: get('X-AI-Gemini-Key'),
      model: get('X-AI-Gemini-Model'),
      embedModel: get('X-AI-Gemini-Embed-Model'),
    },
    anthropic: {
      apiKey: get('X-AI-Anthropic-Key'),
      model: get('X-AI-Anthropic-Model'),
    },
    openai: {
      apiKey: get('X-AI-OpenAI-Key'),
      baseUrl: get('X-AI-OpenAI-BaseURL'),
      model: get('X-AI-OpenAI-Model'),
      embedModel: get('X-AI-OpenAI-Embed-Model'),
    },
    preferred,
  };
}

// Resolve effective config: per-request overrides + env fallback.
export function resolveConfig(cfg?: ProviderConfig): {
  gemini: { apiKey?: string; model: string; embedModel: string };
  anthropic: { apiKey?: string; model: string };
  openai: { apiKey?: string; baseUrl?: string; model: string; embedModel: string };
  preferred?: ProviderName;
} {
  return {
    gemini: {
      apiKey: cfg?.gemini?.apiKey || process.env.GEMINI_API_KEY,
      model: cfg?.gemini?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      embedModel:
        cfg?.gemini?.embedModel || process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
    },
    anthropic: {
      apiKey: cfg?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY,
      model: cfg?.anthropic?.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
    },
    openai: {
      apiKey: cfg?.openai?.apiKey || process.env.OPENAI_API_KEY,
      baseUrl: cfg?.openai?.baseUrl || process.env.OPENAI_BASE_URL,
      model: cfg?.openai?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      embedModel:
        cfg?.openai?.embedModel || process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
    },
    preferred: cfg?.preferred,
  };
}

export function getDefaultProvider(cfg?: ProviderConfig): ProviderName {
  const r = resolveConfig(cfg);
  if (r.preferred && r[r.preferred].apiKey) return r.preferred;
  if (r.gemini.apiKey) return 'gemini';
  if (r.anthropic.apiKey) return 'anthropic';
  if (r.openai.apiKey) return 'openai';
  return 'gemini';
}

export function isAIConfigured(cfg?: ProviderConfig): boolean {
  const r = resolveConfig(cfg);
  return Boolean(r.gemini.apiKey || r.anthropic.apiKey || r.openai.apiKey);
}

export function getProvider(name?: ProviderName, cfg?: ProviderConfig): AIProvider {
  const provider = name ?? getDefaultProvider(cfg);
  const r = resolveConfig(cfg);
  switch (provider) {
    case 'gemini':
      return {
        name: 'gemini',
        generateText: (p, o) => generateTextGemini(p, o, r.gemini),
        streamText: (p, o) => streamTextGemini(p, o, r.gemini),
        embedBatch: (t) => embedBatchGemini(t, r.gemini),
      };
    case 'anthropic':
      return {
        name: 'anthropic',
        generateText: (p, o) => generateTextAnthropic(p, o, r.anthropic),
        streamText: (p, o) => streamTextAnthropic(p, o, r.anthropic),
      };
    case 'openai':
      return {
        name: 'openai',
        generateText: (p, o) => generateTextOpenAI(p, o, r.openai),
        streamText: (p, o) => streamTextOpenAI(p, o, r.openai),
        embedBatch: (t) => embedBatchOpenAI(t, r.openai),
      };
    default:
      throw new AIError(provider, 'config', `Unknown provider: ${provider}`);
  }
}

// Helper: generate JSON-validated output with one retry on schema parse failure.
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts?: GenerateOptions & { provider?: ProviderName; config?: ProviderConfig },
): Promise<T> {
  const provider = getProvider(opts?.provider, opts?.config);
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
  const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : trimmed;
}
