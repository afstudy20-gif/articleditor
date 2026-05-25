// Unified AI provider interface. Gemini default; Anthropic + OpenAI + DeepSeek + NVIDIA fallback.
// DeepSeek + NVIDIA use the openai-sdk transport with a vendor-specific baseUrl.
//
// Configuration precedence per request:
//   1. ProviderConfig parsed from X-AI-* request headers
//   2. process.env (server-side fallback for self-hosted instances)

import { z } from 'zod';
import { generateTextGemini, streamTextGemini, embedBatchGemini } from './gemini';
import { generateTextAnthropic, streamTextAnthropic } from './anthropic';
import { generateTextOpenAI, streamTextOpenAI, embedBatchOpenAI } from './openai';
import { PROVIDERS, getProviderMeta, type ProviderId } from './registry';

export type ProviderName = ProviderId;

export type ProviderConfig = {
  gemini?: { apiKey?: string; model?: string; embedModel?: string };
  anthropic?: { apiKey?: string; model?: string };
  openai?: { apiKey?: string; baseUrl?: string; model?: string; embedModel?: string };
  deepseek?: { apiKey?: string; model?: string };
  nvidia?: { apiKey?: string; model?: string };
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

export function configFromHeaders(headers: Headers): ProviderConfig {
  const get = (name: string): string | undefined => {
    const v = headers.get(name);
    return v && v.trim() ? v.trim() : undefined;
  };
  const preferredRaw = get('X-AI-Preferred-Provider');
  const valid = PROVIDERS.map((p) => p.id);
  const preferred = valid.includes(preferredRaw as ProviderId)
    ? (preferredRaw as ProviderName)
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
    deepseek: {
      apiKey: get('X-AI-DeepSeek-Key'),
      model: get('X-AI-DeepSeek-Model'),
    },
    nvidia: {
      apiKey: get('X-AI-NVIDIA-Key'),
      model: get('X-AI-NVIDIA-Model'),
    },
    preferred,
  };
}

export type ResolvedConfig = {
  gemini: { apiKey?: string; model: string; embedModel: string };
  anthropic: { apiKey?: string; model: string };
  openai: { apiKey?: string; baseUrl?: string; model: string; embedModel: string };
  deepseek: { apiKey?: string; model: string; baseUrl: string };
  nvidia: { apiKey?: string; model: string; baseUrl: string };
  preferred?: ProviderName;
};

export function resolveConfig(cfg?: ProviderConfig): ResolvedConfig {
  const deepseekMeta = getProviderMeta('deepseek');
  const nvidiaMeta = getProviderMeta('nvidia');
  return {
    gemini: {
      apiKey: cfg?.gemini?.apiKey || process.env.GEMINI_API_KEY,
      model: cfg?.gemini?.model || process.env.GEMINI_MODEL || getProviderMeta('gemini').defaultModel,
      embedModel:
        cfg?.gemini?.embedModel || process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
    },
    anthropic: {
      apiKey: cfg?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY,
      model:
        cfg?.anthropic?.model || process.env.ANTHROPIC_MODEL || getProviderMeta('anthropic').defaultModel,
    },
    openai: {
      apiKey: cfg?.openai?.apiKey || process.env.OPENAI_API_KEY,
      baseUrl: cfg?.openai?.baseUrl || process.env.OPENAI_BASE_URL,
      model: cfg?.openai?.model || process.env.OPENAI_MODEL || getProviderMeta('openai').defaultModel,
      embedModel:
        cfg?.openai?.embedModel || process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
    },
    deepseek: {
      apiKey: cfg?.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY,
      model: cfg?.deepseek?.model || process.env.DEEPSEEK_MODEL || deepseekMeta.defaultModel,
      baseUrl: deepseekMeta.baseUrl!,
    },
    nvidia: {
      apiKey: cfg?.nvidia?.apiKey || process.env.NVIDIA_API_KEY,
      model: cfg?.nvidia?.model || process.env.NVIDIA_MODEL || nvidiaMeta.defaultModel,
      baseUrl: nvidiaMeta.baseUrl!,
    },
    preferred: cfg?.preferred,
  };
}

export function getDefaultProvider(cfg?: ProviderConfig): ProviderName {
  const r = resolveConfig(cfg);
  if (r.preferred && r[r.preferred].apiKey) return r.preferred;
  // Priority order — Gemini first since most-tested.
  const order: ProviderName[] = ['gemini', 'anthropic', 'openai', 'deepseek', 'nvidia'];
  for (const p of order) if (r[p].apiKey) return p;
  return 'gemini';
}

export function isAIConfigured(cfg?: ProviderConfig): boolean {
  const r = resolveConfig(cfg);
  return Boolean(
    r.gemini.apiKey || r.anthropic.apiKey || r.openai.apiKey || r.deepseek.apiKey || r.nvidia.apiKey,
  );
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
    case 'deepseek':
      // OpenAI-compatible; reuse openai adapter with vendor-specific baseUrl.
      return {
        name: 'deepseek',
        generateText: (p, o) =>
          generateTextOpenAI(p, o, {
            apiKey: r.deepseek.apiKey,
            baseUrl: r.deepseek.baseUrl,
            model: r.deepseek.model,
            embedModel: '',
          }),
        streamText: (p, o) =>
          streamTextOpenAI(p, o, {
            apiKey: r.deepseek.apiKey,
            baseUrl: r.deepseek.baseUrl,
            model: r.deepseek.model,
            embedModel: '',
          }),
      };
    case 'nvidia':
      return {
        name: 'nvidia',
        generateText: (p, o) =>
          generateTextOpenAI(p, o, {
            apiKey: r.nvidia.apiKey,
            baseUrl: r.nvidia.baseUrl,
            model: r.nvidia.model,
            embedModel: '',
          }),
        streamText: (p, o) =>
          streamTextOpenAI(p, o, {
            apiKey: r.nvidia.apiKey,
            baseUrl: r.nvidia.baseUrl,
            model: r.nvidia.model,
            embedModel: '',
          }),
      };
    default:
      throw new AIError(provider, 'config', `Unknown provider: ${provider}`);
  }
}

// JSON-validated structured output with one retry on schema parse failure.
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
