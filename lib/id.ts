/**
 * Collision-safe ID generation.
 *
 * Uses the platform `crypto.randomUUID()` (122 bits of entropy) instead of
 * `Date.now() + Math.random()`, which collides when many objects are created
 * in the same millisecond. Falls back to a `crypto.getRandomValues()`-based
 * UUID v4 when `randomUUID` is unavailable (e.g. browsers on a non-secure
 * origin such as `http://192.168.x.x`), and finally to `Math.random()` only
 * if no Web Crypto API exists at all.
 *
 * Backward compatibility: IDs are opaque strings used as Dexie primary keys.
 * Existing records keep their legacy `p_…` / `ref_…` IDs and continue to work;
 * only newly created records use the UUID form. No data migration is required.
 */

function fallbackUuidV4(): string {
  const bytes = new Uint8Array(16);
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Set RFC 4122 version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-` +
    `${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
  );
}

/** Generate a UUID v4. Prefer the native implementation when present. */
export function uuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return fallbackUuidV4();
}

/**
 * Generate a collision-safe ID with an optional human-readable prefix.
 * Example: `newId('ref')` → `"ref_3f2a…"`.
 */
export function newId(prefix?: string): string {
  const id = uuid();
  return prefix ? `${prefix}_${id}` : id;
}
