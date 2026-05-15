import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side login rate-limit gate.
 *
 * Called by AuthContext.login() *before* supabase.auth.signInWithPassword().
 * The actual sliding-window logic lives in the
 * `check_and_record_login_attempt` Postgres RPC so the window cutoff uses
 * server `now()` (not the client's clock) and the attempt history survives
 * Vercel cold-starts and round-robins across serverless instances.
 *
 * Two independent buckets are checked per call:
 *   - IP bucket:    20 attempts / 5 minutes — catches password-spray from a
 *                   single source against many emails.
 *   - Email bucket: 8  attempts / 15 minutes — catches credential-stuffing
 *                   against a single account regardless of source IP.
 *
 * The route fails *open* on DB errors so an outage cannot lock every user
 * out of login. Supabase Auth still applies its own throttle as a backstop.
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { allowed: true, fallback: true, reason: "server_config_missing" },
      { status: 200 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "";

  const body = (await req.json().catch(() => null)) as
    | { email?: unknown }
    | null;
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();

  if (!email && !ip) {
    return NextResponse.json({ allowed: true, fallback: true });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseAdmin.rpc(
    "check_and_record_login_attempt",
    { p_email: email, p_ip: ip },
  );

  if (error) {
    return NextResponse.json({ allowed: true, fallback: true });
  }

  const payload = (data ?? {}) as {
    allowed?: boolean;
    reason?: string;
    retry_after_seconds?: number;
    attempts_in_window?: number;
  };

  if (payload.allowed === false) {
    const retryAfter = Math.max(1, payload.retry_after_seconds ?? 60);
    return NextResponse.json(
      {
        allowed: false,
        error: "너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.",
        retryAfterSeconds: retryAfter,
        reason: payload.reason ?? "unknown",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  return NextResponse.json({ allowed: true });
}
