// In-memory TTL cache with single-flight request deduplication for external
// metadata lookups (CrossRef / PubMed / OpenAlex). Two wins:
//   - TTL cache: identical lookups within the window skip the network.
//   - Single-flight: concurrent identical lookups share ONE in-flight promise
//     instead of each firing its own request (deduplication).
//
// Failures are never cached: only resolved values are stored, and the in-flight
// entry is always cleared, so a transient error is retried on the next call.

type Entry<T> = { value: T; expires: number };

export interface LookupCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour — bibliographic metadata is stable
const DEFAULT_MAX_ENTRIES = 500;

export class LookupCache {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(opts: LookupCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Return the cached value for `key`, or run `fn` to produce it. Concurrent
   * calls with the same key while a lookup is in flight share its result.
   */
  async resolve<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    const hit = this.store.get(key);
    if (hit && hit.expires > now) {
      // Touch for LRU recency: re-insert moves the key to the newest position.
      this.store.delete(key);
      this.store.set(key, hit);
      return hit.value as T;
    }
    if (hit) this.store.delete(key); // expired

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      const value = await fn();
      this.write(key, value);
      return value;
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise as Promise<T>;
  }

  private write(key: string, value: unknown): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}
