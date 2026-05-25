// Client-side helpers to compute + cache embeddings for a Ref library.
// Each ref's embedding represents (title + abstract + container) so cosine
// similarity matches semantic content across both surface form + topic.

import type { Ref } from '@/store/types';
import { aiHeaders } from './user-keys';

export function embedInputFor(ref: Ref): string {
  const parts: string[] = [];
  if (ref.title) parts.push(ref.title);
  if (ref.containerTitle) parts.push(ref.containerTitle);
  if (ref.abstract) parts.push(ref.abstract);
  if (parts.length === 0 && ref.raw) parts.push(ref.raw);
  return parts.join('\n').trim();
}

// Cheap stable hash to detect "input changed since embedding was computed".
export function hashInput(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export function refNeedsEmbedding(ref: Ref): boolean {
  const input = embedInputFor(ref);
  if (input.length === 0) return false;
  if (!ref.embedding || ref.embedding.length === 0) return true;
  const sig = hashInput(input);
  return ref.embeddingSource !== sig;
}

export async function embedTexts(texts: string[]): Promise<{ embeddings: number[][]; provider: string }> {
  const res = await fetch('/api/ai/embed-batch', {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Embed all refs lacking up-to-date embeddings; returns new array of refs.
// Batches calls to /api/ai/embed-batch in groups of N to respect API limits.
export async function embedMissingRefs(
  refs: Ref[],
  opts: { batchSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<Ref[]> {
  const batchSize = opts.batchSize ?? 16;
  const targets: Array<{ index: number; input: string }> = [];
  refs.forEach((r, i) => {
    if (refNeedsEmbedding(r)) {
      const input = embedInputFor(r);
      if (input.length > 0) targets.push({ index: i, input });
    }
  });
  if (targets.length === 0) return refs;

  const out: Ref[] = refs.map((r) => ({ ...r }));
  let done = 0;
  for (let start = 0; start < targets.length; start += batchSize) {
    const slice = targets.slice(start, start + batchSize);
    const { embeddings } = await embedTexts(slice.map((t) => t.input));
    slice.forEach((target, j) => {
      const emb = embeddings[j];
      if (emb) {
        out[target.index] = {
          ...out[target.index],
          embedding: emb,
          embeddingSource: hashInput(target.input),
        };
      }
    });
    done += slice.length;
    opts.onProgress?.(done, targets.length);
  }
  return out;
}
