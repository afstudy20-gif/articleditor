// Unified AI provider interface. Gemini default; Anthropic + OpenAI + DeepSeek + NVIDIA fallback.
// DeepSeek + NVIDIA use the openai-sdk transport with a vendor-specific baseUrl.
//
// AI credentials are server-side only. Browser BYO-key headers are ignored.

import { z } from 'zod';
import { generateTextGemini, generateVisionGemini, streamTextGemini, embedBatchGemini } from './gemini';
import { generateTextAnthropic, generateVisionAnthropic, streamTextAnthropic } from './anthropic';
import { generateTextOpenAI, generateVisionOpenAI, streamTextOpenAI, embedBatchOpenAI } from './openai';
import { PROVIDERS, getProviderMeta, type ProviderId } from './registry';
import { isAbortError, isTransientError } from './errors';

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
  /** Aborts the upstream provider call (used for request timeouts). */
  signal?: AbortSignal;
};

/** A decoded image for vision requests. */
export type VisionImage = {
  mimeType: string;
  base64: string;
  /** `data:<mime>;base64,<data>` — used by the OpenAI transport. */
  dataUrl: string;
};

export interface AIProvider {
  name: ProviderName;
  generateText(prompt: string, opts?: GenerateOptions): Promise<string>;
  streamText(prompt: string, opts?: GenerateOptions): AsyncIterable<string>;
  embedBatch?(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  /** Present only on providers with multimodal (vision) support. */
  generateVision?(prompt: string, image: VisionImage, opts?: GenerateOptions): Promise<string>;
}

// Providers with reliable image understanding, in preference order.
const VISION_PROVIDERS: readonly ProviderName[] = ['gemini', 'openai', 'anthropic'];

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

export function configFromHeaders(_headers: Headers): ProviderConfig {
  return {};
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
        embedBatch: (t, s) => embedBatchGemini(t, r.gemini, s),
        generateVision: (p, img, o) =>
          generateVisionGemini(p, { mimeType: img.mimeType, base64: img.base64 }, o, r.gemini),
      };
    case 'anthropic':
      return {
        name: 'anthropic',
        generateText: (p, o) => generateTextAnthropic(p, o, r.anthropic),
        streamText: (p, o) => streamTextAnthropic(p, o, r.anthropic),
        generateVision: (p, img, o) =>
          generateVisionAnthropic(p, { mimeType: img.mimeType, base64: img.base64 }, o, r.anthropic),
      };
    case 'openai':
      return {
        name: 'openai',
        generateText: (p, o) => generateTextOpenAI(p, o, r.openai),
        streamText: (p, o) => streamTextOpenAI(p, o, r.openai),
        embedBatch: (t, s) => embedBatchOpenAI(t, r.openai, s),
        generateVision: (p, img, o) =>
          generateVisionOpenAI(p, { dataUrl: img.dataUrl }, o, r.openai),
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

/** First vision-capable provider that has a configured key, or null. */
export function getVisionProvider(cfg?: ProviderConfig): AIProvider | null {
  const r = resolveConfig(cfg);
  // Honor an explicit preference when it is vision-capable and configured.
  if (r.preferred && VISION_PROVIDERS.includes(r.preferred) && r[r.preferred].apiKey) {
    return getProvider(r.preferred, cfg);
  }
  for (const name of VISION_PROVIDERS) {
    if (r[name].apiKey) return getProvider(name, cfg);
  }
  return null;
}

/** True when at least one vision-capable provider is configured. */
export function isVisionConfigured(cfg?: ProviderConfig): boolean {
  const r = resolveConfig(cfg);
  return VISION_PROVIDERS.some((name) => Boolean(r[name].apiKey));
}

// Max transient (network/upstream-5xx) retries, on top of one schema-reminder
// retry. Aborted/timed-out requests are never retried.
const MAX_NET_RETRIES = 2;

// JSON-validated structured output. Retries once with a schema reminder on
// parse failure, and up to MAX_NET_RETRIES times with exponential backoff on
// transient network/upstream errors. Respects opts.signal for cancellation.
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

  const callModel = (extraInstr?: string): Promise<string> => {
    const fullPrompt = extraInstr ? `${prompt}\n\n${extraInstr}` : prompt;
    return provider.generateText(fullPrompt, baseOpts);
  };
  const parse = (raw: string): T => schema.parse(JSON.parse(stripCodeFence(raw)));

  let schemaRetried = false;
  let netRetries = 0;
  let reminder: string | undefined;

  for (;;) {
    try {
      const raw = await callModel(reminder);
      try {
        return parse(raw);
      } catch (parseErr) {
        if (schemaRetried) throw parseErr;
        schemaRetried = true;
        reminder = schemaReminder(parseErr);
        continue;
      }
    } catch (err) {
      // User/route timeout — stop immediately, do not burn retries.
      if (isAbortError(err)) throw err;
      if (isTransientError(err) && netRetries < MAX_NET_RETRIES) {
        netRetries += 1;
        await delay(backoffMs(netRetries), opts?.signal);
        continue;
      }
      throw err;
    }
  }
}

function schemaReminder(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    'IMPORTANT: Your previous response failed JSON schema validation. ' +
    `Error: ${msg.slice(0, 300)}. ` +
    'Respond with ONLY valid JSON, no prose, no code fences. Match the schema exactly.'
  );
}

function backoffMs(attempt: number): number {
  return Math.min(2000, 250 * 2 ** attempt);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : trimmed;
}
