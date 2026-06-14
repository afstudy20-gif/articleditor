const API_BASE = 'https://api.copyleaks.com';
const IDENTITY_BASE = 'https://id.copyleaks.com';
const MAX_AI_CHUNK = 24_000;

export interface CopyleaksConfig {
  email: string;
  apiKey: string;
  sandbox: boolean;
}

export interface AiDetectionSegment {
  text: string;
  label: 'ai' | 'human' | 'mixed';
  probability: number | null;
}

export interface AiDetectionResult {
  aiProbability: number;
  humanProbability: number;
  segments: AiDetectionSegment[];
  chunks: number;
}

export interface PlagiarismSource {
  id: string;
  title: string;
  url: string | null;
  matchedWords: number | null;
}

export interface PlagiarismResult {
  scanId: string;
  status: 'pending' | 'completed' | 'error';
  score: {
    aggregated: number;
    identical: number;
    minorChanges: number;
    relatedMeaning: number;
  } | null;
  sources: PlagiarismSource[];
  totalWords: number | null;
  credits: number | null;
  error?: string;
  updatedAt: string;
}

type FetchLike = typeof fetch;

let cachedToken: { value: string; expiresAt: number } | null = null;

export function copyleaksConfigFromEnv(): CopyleaksConfig | null {
  const email = process.env.COPYLEAKS_EMAIL?.trim();
  const apiKey = process.env.COPYLEAKS_API_KEY?.trim();
  if (!email || !apiKey) return null;
  return {
    email,
    apiKey,
    sandbox: process.env.COPYLEAKS_SANDBOX === 'true',
  };
}

export function chunkForAiDetection(
  text: string,
  maxCharacters = MAX_AI_CHUNK,
): string[] {
  if (maxCharacters < 510) {
    throw new Error('AI detection chunks must allow at least 510 characters.');
  }
  if (text.length <= maxCharacters) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + maxCharacters, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end);
      if (boundary > cursor + Math.floor(maxCharacters * 0.6)) end = boundary + 1;
    }
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  const last = chunks.at(-1);
  if (chunks.length > 1 && last && last.length < 255) {
    chunks.pop();
    const previous = chunks.pop()!;
    const borrowed = 255 - last.length;
    const splitAt = previous.length - borrowed;
    chunks.push(previous.slice(0, splitAt), previous.slice(splitAt) + last);
  }
  return chunks;
}

export function normalizeAiDetectionResponse(input: unknown): Omit<AiDetectionResult, 'chunks'> {
  const value = asRecord(input);
  const summary = asRecord(value.summary);
  const aiProbability = clampProbability(numberValue(summary.ai) ?? numberValue(value.aiProbability) ?? 0);
  const humanProbability = clampProbability(
    numberValue(summary.human) ?? numberValue(value.humanProbability) ?? 1 - aiProbability,
  );
  const classifications = Array.isArray(value.classifications) ? value.classifications : [];
  const segments = classifications.map((item): AiDetectionSegment => {
    const segment = asRecord(item);
    const classification = segment.classification;
    return {
      text: stringValue(segment.text) ?? '',
      label:
        classification === 2 || classification === 'ai'
          ? 'ai'
          : classification === 1 || classification === 'human'
            ? 'human'
            : 'mixed',
      probability: nullableProbability(numberValue(segment.probability)),
    };
  });
  return { aiProbability, humanProbability, segments };
}

export function normalizePlagiarismWebhook(
  scanId: string,
  input: unknown,
): PlagiarismResult {
  const value = asRecord(input);
  const results = asRecord(value.results);
  const score = asRecord(results.score);
  const sources = [
    ...(Array.isArray(results.internet) ? results.internet : []),
    ...(Array.isArray(results.database) ? results.database : []),
    ...(Array.isArray(results.repositories) ? results.repositories : []),
  ].map((item): PlagiarismSource => {
    const source = asRecord(item);
    const metadata = asRecord(source.metadata);
    return {
      id: stringValue(source.id) ?? stringValue(source.scanId) ?? crypto.randomUUID(),
      title: stringValue(source.title) ?? 'Untitled source',
      url: stringValue(metadata.finalUrl) ?? stringValue(metadata.canonicalUrl),
      matchedWords: nullableNumber(source.matchedWords),
    };
  });
  const scanned = asRecord(value.scannedDocument);
  const aggregated = numberValue(score.aggregatedScore);
  return {
    scanId,
    status: 'completed',
    score:
      aggregated == null
        ? null
        : {
            aggregated,
            identical: numberValue(score.identicalWords) ?? 0,
            minorChanges: numberValue(score.minorChangedWords) ?? 0,
            relatedMeaning: numberValue(score.relatedMeaningWords) ?? 0,
          },
    sources,
    totalWords: nullableNumber(scanned.totalWords),
    credits: nullableNumber(scanned.credits),
    updatedAt: new Date().toISOString(),
  };
}

export async function scanAiText(
  text: string,
  config: CopyleaksConfig,
  fetcher: FetchLike = fetch,
): Promise<AiDetectionResult> {
  const token = await getAccessToken(config, fetcher);
  const chunks = chunkForAiDetection(text).filter((chunk) => chunk.trim().length >= 255);
  if (chunks.length === 0) throw new Error('AI detection requires at least 255 characters.');
  const normalized: Array<Omit<AiDetectionResult, 'chunks'> & { weight: number }> = [];
  for (const chunk of chunks) {
    const response = await fetcher(
      `${API_BASE}/v2/writer-detector/${crypto.randomUUID()}/check`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: chunk, sandbox: config.sandbox }),
      },
    );
    const data = await readJson(response);
    if (!response.ok) throw new Error(apiError(data, response.status));
    normalized.push({ ...normalizeAiDetectionResponse(data), weight: chunk.length });
  }
  const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0);
  return {
    aiProbability:
      normalized.reduce((sum, item) => sum + item.aiProbability * item.weight, 0) / totalWeight,
    humanProbability:
      normalized.reduce((sum, item) => sum + item.humanProbability * item.weight, 0) / totalWeight,
    segments: normalized.flatMap((item) => item.segments),
    chunks: chunks.length,
  };
}

export async function submitPlagiarismScan(
  input: {
    scanId: string;
    text: string;
    filename: string;
    statusWebhook: string;
  },
  config: CopyleaksConfig,
  fetcher: FetchLike = fetch,
): Promise<void> {
  const token = await getAccessToken(config, fetcher);
  const response = await fetcher(`${API_BASE}/v3/scans/submit/file/${input.scanId}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base64: Buffer.from(input.text, 'utf8').toString('base64'),
      filename: input.filename,
      properties: {
        webhooks: { status: input.statusWebhook },
        sandbox: config.sandbox,
        includeHtml: false,
        sensitivityLevel: 3,
      },
    }),
  });
  if (!response.ok) {
    const data = await readJson(response);
    throw new Error(apiError(data, response.status));
  }
}

async function getAccessToken(config: CopyleaksConfig, fetcher: FetchLike): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetcher(`${IDENTITY_BASE}/v3/account/login/api`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: config.email, key: config.apiKey }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(apiError(data, response.status));
  const token = stringValue(asRecord(data).access_token);
  if (!token) throw new Error('Copyleaks authentication did not return an access token.');
  cachedToken = { value: token, expiresAt: Date.now() + 45 * 60_000 };
  return token;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

function apiError(input: unknown, status: number): string {
  const value = asRecord(input);
  return (
    stringValue(value.message) ??
    stringValue(value.error) ??
    `Copyleaks request failed with HTTP ${status}.`
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function nullableNumber(value: unknown): number | null {
  return numberValue(value);
}

function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nullableProbability(value: number | null): number | null {
  return value == null ? null : clampProbability(value);
}
