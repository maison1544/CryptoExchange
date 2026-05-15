import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side hook called by AuthContext.login() right after a successful
 * `supabase.auth.signInWithPassword()`. It resets the sliding-window
 * counters for both the IP bucket and the email bucket so a legitimate
 * user who fat-fingers their password a few times is not stuck on a
 * cool-down for the full window after they finally type it correctly.
 *
 * Failures are deliberately swallowed: at this point the user is already
 * authenticated; we must not bounce them back to the login form because
 * the audit table is unreachable.
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: true, fallback: true });
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
    return NextResponse.json({ ok: true, fallback: true });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await supabaseAdmin
    .rpc("mark_login_success", { p_email: email, p_ip: ip })
    .then(() => undefined)
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
