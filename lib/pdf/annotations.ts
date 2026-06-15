'use client';

import { kvGet, kvSet } from '@/store/db';

/**
 * Per-document annotation persistence. Fabric canvas JSON is cached in memory
 * and debounced to IndexedDB (key `anno:<docKey>`), so drawings survive page
 * navigation and reloads. Keyed by document — different PDFs no longer share
 * annotations by page number.
 */

type PageMap = Record<number, string>;

const cache = new Map<string, PageMap>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const kvKey = (docKey: string) => `anno:${docKey}`;

/** Stable per-document id, shared by the viewer and the folder saver so both
 *  reference the same annotation set. */
export function docKeyForSource(source: File | string): string {
  if (typeof source === 'string') return source;
  return `file:${source.name}:${source.size}:${source.lastModified}`;
}

export async function loadAnnotations(docKey: string): Promise<PageMap> {
  const cached = cache.get(docKey);
  if (cached) return cached;
  const stored = (await kvGet<PageMap>(kvKey(docKey))) ?? {};
  cache.set(docKey, stored);
  return stored;
}

export function getPageAnnotation(docKey: string, pageNum: number): string | undefined {
  return cache.get(docKey)?.[pageNum];
}

export function setPageAnnotation(docKey: string, pageNum: number, json: string): void {
  const next: PageMap = { ...(cache.get(docKey) ?? {}), [pageNum]: json };
  cache.set(docKey, next);
  schedulePersist(docKey);
}

function schedulePersist(docKey: string): void {
  const existing = timers.get(docKey);
  if (existing) clearTimeout(existing);
  timers.set(
    docKey,
    setTimeout(() => {
      timers.delete(docKey);
      const map = cache.get(docKey);
      if (map) void kvSet(kvKey(docKey), map);
    }, 500),
  );
}

/** Persist immediately, cancelling any pending debounce (e.g. on unmount). */
export async function flushAnnotations(docKey: string): Promise<void> {
  const existing = timers.get(docKey);
  if (existing) {
    clearTimeout(existing);
    timers.delete(docKey);
  }
  const map = cache.get(docKey);
  if (map) await kvSet(kvKey(docKey), map);
}
