/** Decodes standard (or URL-safe) base64 into bytes.
 *  Used for PDFs handed over by the RefDown extension, which can only pass
 *  JSON-serializable values across the extension/page boundary. */
export function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
