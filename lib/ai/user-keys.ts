const STORAGE_KEY = 'enr_ai_keys_v1';

// Browser-side API keys are disabled. AI routes use only server-side
// configuration, so no provider secret is stored in localStorage or sent via
// X-AI-* headers.
export function clearUserKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function aiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (typeof window !== 'undefined') clearUserKeys();
  return { 'Content-Type': 'application/json', ...extra };
}
