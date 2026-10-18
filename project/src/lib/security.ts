/**
 * Security & Input Sanitization Suite for GyftKart
 * Provides XSS prevention, injection guarding, canonical data validators,
 * and client-side sliding-window rate limiting for sensitive operations.
 */

// -----------------------------------------------------------------------------
// 1. Input Sanitization & Anti-XSS Utilities
// -----------------------------------------------------------------------------

/**
 * Strips script tags, HTML tags, javascript: URIs, inline event handlers,
 * and dangerous control characters from user text.
 */
export function sanitizeInput(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') return '';

  return input
    .slice(0, maxLength)
    // Remove null bytes
    .replace(/\0/g, '')
    // Strip script and iframe tags completely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Strip html tags
    .replace(/<[^>]*>/g, '')
    // Disarm javascript: or data: URI schemes
    .replace(/(?:javascript|data|vbscript):/gi, '')
    // Strip inline event attributes like onerror=, onclick=
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Validates and sanitizes Indian Banking UTR (Unique Transaction Reference) / RRN.
 * Must be exactly 12 numeric digits.
 */
export function sanitizeUtr(utr: string): { isValid: boolean; cleanUtr: string; error?: string } {
  if (typeof utr !== 'string') {
    return { isValid: false, cleanUtr: '', error: 'UTR must be a valid string.' };
  }

  // Strip all whitespace, dashes, and non-numeric characters
  const cleanUtr = utr.trim().replace(/\D/g, '');

  if (cleanUtr.length !== 12) {
    return {
      isValid: false,
      cleanUtr,
      error: `UTR must be exactly 12 numeric digits (received ${cleanUtr.length}).`,
    };
  }

  return { isValid: true, cleanUtr };
}

/**
 * Validates and sanitizes email address.
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') return '';
  return email
    .trim()
    .toLowerCase()
    .replace(/[\0\s'"`<>]/g, '')
    .slice(0, 255);
}

/**
 * Validates and standardizes Indian phone numbers.
 */
export function sanitizePhone(phone: string): string {
  if (typeof phone !== 'string') return '';
  // Keep only digits and optional leading '+'
  const digits = phone.trim().replace(/[^\d+]/g, '');
  return digits.slice(0, 15);
}

/**
 * Sanitizes search input to prevent SQL/regex injection and excessive length.
 */
export function sanitizeSearchQuery(query: string, maxLen = 120): string {
  if (typeof query !== 'string') return '';
  return query
    .slice(0, maxLen)
    .replace(/['";\\]/g, '') // strip quotes, semicolons, backslashes
    .replace(/--|\/\*|\*\//g, '') // strip SQL comment tokens
    .trim();
}

// -----------------------------------------------------------------------------
// 2. Client-Side Sliding-Window Rate Limiter
// -----------------------------------------------------------------------------

interface RateLimitBucket {
  timestamps: number[];
}

const memoryRateLimitStore: Map<string, RateLimitBucket> = new Map();

/**
 * Enforces rate limiting on client actions (e.g. login attempts, UTR submissions,
 * wallet top-up requests) to mitigate rapid-fire brute-force abuse.
 *
 * @param actionKey Unique action identifier (e.g. 'auth:login', 'upi:proof:<id>')
 * @param maxAttempts Maximum allowed attempts within the window
 * @param windowSeconds Window length in seconds
 */
export function checkRateLimit(
  actionKey: string,
  maxAttempts = 5,
  windowSeconds = 60
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // Retrieve or initialize bucket from memory and sessionStorage
  let bucket: RateLimitBucket | undefined = memoryRateLimitStore.get(actionKey);

  if (!bucket) {
    try {
      const stored = sessionStorage.getItem(`gyftkart_rl_${actionKey}`);
      if (stored) {
        bucket = JSON.parse(stored) as RateLimitBucket;
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
  }

  if (!bucket || !Array.isArray(bucket.timestamps)) {
    bucket = { timestamps: [] };
  }

  // Filter timestamps within the active sliding window
  const activeTimestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxAttempts) {
    const oldest = activeTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  // Record this attempt
  activeTimestamps.push(now);
  bucket.timestamps = activeTimestamps;
  memoryRateLimitStore.set(actionKey, bucket);

  try {
    sessionStorage.setItem(`gyftkart_rl_${actionKey}`, JSON.stringify(bucket));
  } catch {
    // Ignore storage quota errors
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - activeTimestamps.length),
    retryAfterSeconds: 0,
  };
}

/**
 * Resets rate limit for a given action (e.g. on successful login).
 */
export function resetRateLimit(actionKey: string): void {
  memoryRateLimitStore.delete(actionKey);
  try {
    sessionStorage.removeItem(`gyftkart_rl_${actionKey}`);
  } catch {
    // Ignore storage errors
  }
}
