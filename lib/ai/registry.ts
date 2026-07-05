// Single source of truth for AI provider metadata.
// Mirrors /Users/yh/claude/paper/backend/services/ai_providers.py PROVIDERS map.
// New providers added here flow to server-side resolveConfig once their
// key/model environment variables are wired into ProviderConfig.

export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'nvidia';

export type ProviderModel = { id: string; name: string };

export type ProviderMeta = {
  id: ProviderId;
  name: string;
  models: ProviderModel[];
  defaultModel: string;
  // OpenAI-compatible providers share the openai-sdk transport
  // with a vendor-specific base URL.
  openaiCompatible?: boolean;
  baseUrl?: string;
  keyPlaceholder?: string;
  helpUrl?: string;
};

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    models: [
      // Gemini 3 family
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (preview)' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (preview)' },
      // Gemini 2.5 family
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    ],
    defaultModel: 'gemini-3.5-flash',
    keyPlaceholder: 'AIzaSy...',
    helpUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (legacy)' },
    ],
    defaultModel: 'claude-sonnet-4-6',
    keyPlaceholder: 'sk-ant-...',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
      { id: 'o3', name: 'o3' },
      { id: 'o3-mini', name: 'o3-mini' },
      { id: 'o3-pro', name: 'o3-pro' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    ],
    defaultModel: 'gpt-5.4',
    keyPlaceholder: 'sk-...',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3.2' },
      { id: 'deepseek-reasoner', name: 'DeepSeek V3.2 Reasoner' },
    ],
    defaultModel: 'deepseek-chat',
    openaiCompatible: true,
    baseUrl: 'https://api.deepseek.com',
    keyPlaceholder: 'sk-...',
    helpUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    models: [
      { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1' },
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
      { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
      { id: 'qwen/qwen2.5-72b-instruct', name: 'Qwen 2.5 72B' },
      { id: 'mistralai/mistral-large-2-instruct', name: 'Mistral Large 2' },
      { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B' },
    ],
    defaultModel: 'meta/llama-3.3-70b-instruct',
    openaiCompatible: true,
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyPlaceholder: 'nvapi-...',
    helpUrl: 'https://build.nvidia.com/explore/discover',
  },
];

export function getProviderMeta(id: ProviderId): ProviderMeta {
  const meta = PROVIDERS.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown provider: ${id}`);
  return meta;
}

export function isValidModel(provider: ProviderId, model: string): boolean {
  const meta = PROVIDERS.find((p) => p.id === provider);
  if (!meta) return false;
  return meta.models.some((m) => m.id === model);
}
