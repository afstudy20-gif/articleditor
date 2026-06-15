'use client';

/**
 * Lightweight client-side translation via Google's public gtx endpoint
 * (same approach as the standalone pdf.editor). No API key required; the
 * endpoint supports CORS for the `gtx` client.
 */

export type TranslateResult = {
  translated: string;
  sourceLang: string;
  targetLang: string;
  /** True when the language could not be detected and the caller should ask. */
  needsManualLang?: boolean;
};

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

type GtxResponse = [Array<[string, string]>, unknown, string?];

/**
 * Translate `text`. When `sourceLang`/`targetLang` are omitted the language is
 * auto-detected: Turkish source falls back to English, everything else goes to
 * Turkish (mirrors the reading workflow — read foreign papers in Turkish, read
 * own Turkish text in English).
 */
export async function translateText(
  text: string,
  sourceLang?: string,
  targetLang?: string,
): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Empty text');
  }

  const sl = sourceLang ?? 'auto';
  const tl = targetLang ?? 'tr';
  const url = `${ENDPOINT}?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(trimmed)}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Translation failed (HTTP ${response.status})`);
  }
  const data = (await response.json()) as GtxResponse;
  const detected = data[2] || sourceLang || null;

  // Auto mode: Turkish source → English; undetectable → ask the caller.
  if (!sourceLang) {
    if (detected === 'tr') {
      return translateText(trimmed, 'tr', 'en');
    }
    if (!detected || detected === 'und') {
      return { translated: '', sourceLang: '', targetLang: tl, needsManualLang: true };
    }
  }

  const translated = data[0].map((chunk) => chunk[0]).join('');
  return {
    translated,
    sourceLang: sourceLang || detected || 'auto',
    targetLang: tl,
  };
}
