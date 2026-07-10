// Gemini provider adapter using @google/generative-ai SDK.
// Accepts ResolvedGeminiConfig (key, model, embedModel) from server-side env.

import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerationConfig,
} from '@google/generative-ai';
import { AIError, type GenerateOptions } from './provider';

type GeminiCfg = { apiKey?: string; model: string; embedModel: string };

function getClient(cfg: GeminiCfg): GoogleGenerativeAI {
  if (!cfg.apiKey) throw new AIError('gemini', 'config', 'GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(cfg.apiKey);
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
  if (opts?.jsonMode) cfg.responseMimeType = 'application/json';
  return cfg;
}

export async function generateTextGemini(
  prompt: string,
  opts: GenerateOptions | undefined,
  cfg: GeminiCfg,
): Promise<string> {
  const client = getClient(cfg);
  const model = client.getGenerativeModel({
    model: cfg.model,
    systemInstruction: opts?.system,
    generationConfig: buildConfig(opts),
    safetySettings,
  });
  try {
    const result = await model.generateContent(
      prompt,
      opts?.signal ? { signal: opts.signal } : undefined,
    );
    const text = result.response.text();
    if (!text) throw new AIError('gemini', 'generate', 'Empty response');
    return text;
  } catch (err) {
    if (err instanceof AIError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('gemini', 'generate', msg);
  }
}

export async function generateVisionGemini(
  prompt: string,
  image: { mimeType: string; base64: string },
  opts: GenerateOptions | undefined,
  cfg: GeminiCfg,
): Promise<string> {
  const client = getClient(cfg);
  const model = client.getGenerativeModel({
    model: cfg.model,
    systemInstruction: opts?.system,
    generationConfig: buildConfig(opts),
    safetySettings,
  });
  try {
    const result = await model.generateContent(
      [
        { text: prompt },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
      ],
      opts?.signal ? { signal: opts.signal } : undefined,
    );
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
  opts: GenerateOptions | undefined,
  cfg: GeminiCfg,
): AsyncIterable<string> {
  const client = getClient(cfg);
  const model = client.getGenerativeModel({
    model: cfg.model,
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

export async function embedBatchGemini(
  texts: string[],
  cfg: GeminiCfg,
  signal?: AbortSignal,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient(cfg);
  const model = client.getGenerativeModel({ model: cfg.embedModel });
  try {
    const out: number[][] = [];
    for (const text of texts) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const result = await model.embedContent(
        text,
        signal ? { signal } : undefined,
      );
      out.push(result.embedding.values);
    }
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIError('gemini', 'embed', msg);
  }
}
