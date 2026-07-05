// Request protection for /api/ai/* routes:
//   - in-memory rate limiting (per client IP)
//   - request timeout signal
//   - error sanitization so internal/provider details never reach the client
//
// No `console` usage here (lib/ rule): the guard is a pure helper. Routes log
// the raw error server-side before returning the sanitized response.

import { NextResponse } from 'next/server';
import { AIError } from './provider';
import { isAbortError } from './errors';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20; // per window, per client
const buckets = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, times] of buckets) {
    const fresh = times.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Enforce the per-client request budget. Returns a 429 response when the limit
 * is exceeded, or `null` when the request may proceed.
 */
export function checkRateLimit(req: Request): NextResponse | null {
  const now = Date.now();
  sweep(now);
  const id = clientIp(req);
  const times = (buckets.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - times[0])) / 1000));
    return NextResponse.json(
      {
        error: 'Çok fazla istek. Lütfen biraz bekleyin. / Too many requests — please slow down.',
        code: 'rate_limited',
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  times.push(now);
  buckets.set(id, times);
  return null;
}

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

export const AI_TIMEOUT_MS = 75_000;

/** Abort signal that fires after `ms`, for passing into provider calls. */
export function timeoutSignal(ms: number = AI_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

// ---------------------------------------------------------------------------
// Error sanitization
// ---------------------------------------------------------------------------

type Sanitized = { status: number; body: { error: string; code: string } };

export function sanitizeAIError(err: unknown): Sanitized {
  if (isAbortError(err)) {
    return {
      status: 504,
      body: {
        error: 'AI isteği zaman aşımına uğradı. Lütfen tekrar deneyin. / Request timed out.',
        code: 'timeout',
      },
    };
  }

  if (err instanceof AIError) {
    if (err.stage === 'config') {
      return {
        status: 503,
        body: {
          error:
            'AI yapılandırılmamış. Sunucuda AI ortam değişkeni yok. / AI is not configured on the server.',
          code: 'not_configured',
        },
      };
    }
    const msg = err.message;
    if (/429|rate.?limit|quota|overloaded|529|temporar/i.test(msg)) {
      return {
        status: 502,
        body: {
          error:
            'AI sağlayıcısı meşgul veya kota doldu. Birazdan tekrar deneyin. / Provider busy or quota exceeded.',
          code: 'upstream_busy',
        },
      };
    }
    if (/401|403|api.?key|unauthor|invalid.?key/i.test(msg)) {
      return {
        status: 502,
        body: {
          error:
            'AI sağlayıcısı anahtarı reddetti. Anahtarınızı kontrol edin. / Provider rejected the API key.',
          code: 'upstream_auth',
        },
      };
    }
    return {
      status: 502,
      body: {
        error: 'AI sağlayıcısına ulaşılamadı. Lütfen tekrar deneyin. / Could not reach the AI provider.',
        code: 'upstream_error',
      },
    };
  }

  return {
    status: 500,
    body: { error: 'Beklenmeyen bir hata oluştu. / An unexpected error occurred.', code: 'internal' },
  };
}

/** Build a sanitized JSON error response (no stack traces, no provider detail). */
export function aiErrorResponse(err: unknown): NextResponse {
  const { status, body } = sanitizeAIError(err);
  return NextResponse.json(body, { status });
}
