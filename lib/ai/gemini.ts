// Gemini provider adapter using @google/generative-ai SDK.
// Maps unified GenerateOptions to Gemini's GenerationConfig + safety settings.

import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerationConfig,
} from '@google/generative-ai';
import { AIError, type GenerateOptions } from './provider';

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError('gemini', 'config', 'GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(key);
}

function getModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

function buildConfig(opts?: GenerateOptions): GenerationConfig {
  const cfg: GenerationConfig = {
    temperature: opts?.temperature ?? 0.2,
    maxOutputTokens: opts?.maxTokens ?? 8192,
  };
  if (opts?.jsonMode) {
    cfg.responseMimeType = 'application/json';
  }
  return cfg;
}

export async function generateTextGemini(
  prompt: string,
  opts?: GenerateOptions,
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: getModel(),
    systemInstruction: opts?.system,
    generationConfig: buildConfig(opts),
    safetySettings,
  });
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text) throw new AIError('gemini', 'generate', 'Empty response');
    return text;
  } catch (err) {
    if (err instanceof AIError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('gemini', 'generate', msg);
  }
}

export async function* streamTextGemini(
  prompt: string,
  opts?: GenerateOptions,
): AsyncIterable<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: getModel(),
    systemInstruction: opts?.system,
    generationConfig: buildConfig(opts),
    safetySettings,
  });
  try {
    const result = await model.generateContentStream(prompt);
    for await (const chunk of result.stream) {
      const piece = chunk.text();
      if (piece) yield piece;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('gemini', 'stream', msg);
  }
}

export async function embedBatchGemini(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  const modelName = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
  const model = client.getGenerativeModel({ model: modelName });
  try {
    // Gemini supports batchEmbedContents; we call per-text for simpler error handling.
    // For large batches consider switching to batchEmbedContents() with grouped requests.
    const out: number[][] = [];
    for (const text of texts) {
      const result = await model.embedContent(text);
      out.push(result.embedding.values);
    }
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('gemini', 'embed', msg);
  }
}
