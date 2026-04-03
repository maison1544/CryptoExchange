/**
 * Simple in-memory rate limiter for serverless API routes.
 * For production at scale, replace with Redis-backed solution (e.g. @upstash/ratelimit).
 */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check rate limit for a given identifier.
 * @param identifier - unique key (e.g. IP address or user ID)
 * @param limit - max requests allowed in the window
 * @param windowMs - time window in milliseconds
 */
export function rateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60_000,
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count += 1;

  if (entry.count > limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  return {
    success: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
  };
}
