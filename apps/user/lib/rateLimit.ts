/**
 * Best-effort in-memory rate limiter for *authenticated* serverless API
 * routes (abuse mitigation on top of an already-required session cookie).
 *
 * DO NOT USE FOR UNAUTHENTICATED ENDPOINTS such as login, signup,
 * password-reset or any other surface an attacker can hit without first
 * proving identity. The Map lives inside a single Vercel worker, so:
 *   - cold-starts wipe it,
 *   - traffic round-robined across N instances effectively multiplies
 *     the limit by N,
 *   - and there is no cross-region coordination.
 *
 * Login / signup brute-force defence is implemented via the
 * `check_and_record_login_attempt` and `check_and_record_signup_attempt`
 * Postgres RPCs, which use a single shared DB table and server-side
 * `now()` so every worker sees the same window.
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
