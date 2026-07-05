// Shared error classifiers for the AI layer. Kept dependency-free so both
// `provider.ts` (retry logic) and `guard.ts` (HTTP error mapping) can import
// it without creating an import cycle.

/** True when an error represents an aborted/timed-out request. */
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    /\baborted\b|\btimed?\s*out\b|\bETIMEDOUT\b/i.test(err.message)
  );
}

const TRANSIENT_RE =
  /\b(429|500|502|503|504|529)\b|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|overloaded|temporar|rate.?limit|quota/i;

/**
 * True when an error is likely transient (network blip, upstream 5xx, rate
 * limit) and worth retrying. Abort/timeout errors are never transient — the
 * caller asked to stop.
 */
export function isTransientError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_RE.test(msg);
}
