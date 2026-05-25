// Per-browser API key storage for BYO-key mode.
// Keys are stored in localStorage (plain), sent via X-AI-* headers on AI calls.
// Server prefers headers over env (lib/ai/provider.ts).

export type UserKeys = {
  geminiKey?: string;
  geminiModel?: string;
  anthropicKey?: string;
  anthropicModel?: string;
  openaiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  preferredProvider?: 'gemini' | 'anthropic' | 'openai';
};

const STORAGE_KEY = 'enr_ai_keys_v1';

export function loadUserKeys(): UserKeys {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveUserKeys(keys: UserKeys): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  window.dispatchEvent(new CustomEvent('enr-keys-updated'));
}

export function clearUserKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('enr-keys-updated'));
}

export function hasAnyKey(keys: UserKeys = loadUserKeys()): boolean {
  return Boolean(keys.geminiKey || keys.anthropicKey || keys.openaiKey);
}

// Build headers attached to every AI fetch request.
export function aiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const k = loadUserKeys();
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (k.geminiKey) h['X-AI-Gemini-Key'] = k.geminiKey;
  if (k.geminiModel) h['X-AI-Gemini-Model'] = k.geminiModel;
  if (k.anthropicKey) h['X-AI-Anthropic-Key'] = k.anthropicKey;
  if (k.anthropicModel) h['X-AI-Anthropic-Model'] = k.anthropicModel;
  if (k.openaiKey) h['X-AI-OpenAI-Key'] = k.openaiKey;
  if (k.openaiBaseUrl) h['X-AI-OpenAI-BaseURL'] = k.openaiBaseUrl;
  if (k.openaiModel) h['X-AI-OpenAI-Model'] = k.openaiModel;
  if (k.preferredProvider) h['X-AI-Preferred-Provider'] = k.preferredProvider;
  return h;
}
