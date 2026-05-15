import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Enumeration-resistant DB-backed rate-limit. Each duplicate check is
  // effectively a probe asking "is this email/phone registered?" — the
  // in-memory Map limiter we used before reset on every cold-start and
  // was per-worker, so an attacker fanning out trivially extracted the
  // entire user list. The shared DB counter caps probes across all
  // workers using server `now()`.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "";
  if (ip) {
    const { data: gate, error: gateErr } = await supabaseAdmin.rpc(
      "check_and_record_duplicate_check",
      { p_ip: ip },
    );
    if (!gateErr) {
      const payload = (gate ?? {}) as {
        allowed?: boolean;
        retry_after_seconds?: number;
      };
      if (payload.allowed === false) {
        const retryAfter = Math.max(1, payload.retry_after_seconds ?? 60);
        return NextResponse.json(
          { error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfter) },
          },
        );
      }
    }
    // gateErr → fail open so a DB blip cannot lock out signup UX.
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { type, value, scope } = body as {
    type?: string;
    value?: string;
    scope?: string;
  };
  const trimmed = String(value || "").trim();

  if (!type || !trimmed) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const checkAll = scope === "all";

  if (type === "email") {
    const emailLower = trimmed.toLowerCase();

    const { data: userProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("email", emailLower)
      .maybeSingle();

    if (userProfile) {
      return NextResponse.json({
        duplicate: true,
        message: "이미 가입된 이메일입니다.",
      });
    }

    if (checkAll) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("email", emailLower)
        .maybeSingle();

      if (agent) {
        return NextResponse.json({
          duplicate: true,
          message: "이미 사용 중인 이메일입니다.",
        });
      }

      const { data: admin } = await supabaseAdmin
        .from("admins")
        .select("id")
        .eq("email", emailLower)
        .maybeSingle();

      if (admin) {
        return NextResponse.json({
          duplicate: true,
          message: "이미 사용 중인 이메일입니다.",
        });
      }
    }

    return NextResponse.json({
      duplicate: false,
      message: "사용 가능한 이메일입니다.",
    });
  }

  if (type === "phone") {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("phone", trimmed)
      .maybeSingle();

    if (profile) {
      return NextResponse.json({
        duplicate: true,
        message: "이미 가입된 전화번호입니다.",
      });
    }

    if (checkAll) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("phone", trimmed)
        .maybeSingle();

      if (agent) {
        return NextResponse.json({
          duplicate: true,
          message: "이미 사용 중인 전화번호입니다.",
        });
      }
    }

    return NextResponse.json({
      duplicate: false,
      message: "사용 가능한 전화번호입니다.",
    });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
