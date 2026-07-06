import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_HEADERS = [
  'x-copyleaks-signature',
  'x-webhook-signature',
  'x-arted-signature',
];

export function hmacSha256Hex(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export function verifyBodyHmac(
  body: string,
  secret: string,
  signature: string | null,
): boolean {
  if (!secret || !signature) return false;
  const normalized = normalizeSignature(signature);
  if (!normalized) return false;
  const expected = hmacSha256Hex(body, secret);
  return safeEqualHex(normalized, expected);
}

export function verifyRequestBodyHmac(req: Request, body: string, secret: string): boolean {
  const signature = SIGNATURE_HEADERS
    .map((header) => req.headers.get(header))
    .find((value): value is string => Boolean(value?.trim())) ?? null;
  return verifyBodyHmac(body, secret, signature);
}

function normalizeSignature(signature: string): string | null {
  const value = signature.trim();
  const withoutPrefix = value.startsWith('sha256=') ? value.slice('sha256='.length) : value;
  if (/^[0-9a-f]{64}$/i.test(withoutPrefix)) return withoutPrefix.toLowerCase();

  try {
    const decoded = Buffer.from(withoutPrefix, 'base64').toString('hex');
    return /^[0-9a-f]{64}$/i.test(decoded) ? decoded.toLowerCase() : null;
  } catch {
    return null;
  }
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
