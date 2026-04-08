import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/clientIp";
import { rateLimit } from "@/lib/rateLimit";

type RecordLoginBody = {
  accountType?: "user" | "backoffice";
};

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`record-login:${clientIp}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length)
    : authHeader;

  if (!jwt) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RecordLoginBody | null;
  const accountType = body?.accountType;

  if (accountType !== "user" && accountType !== "backoffice") {
    return NextResponse.json(
      { error: "Invalid account type" },
      { status: 400 },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(jwt);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const userId = user.id;
  const now = new Date().toISOString();
  const resolvedIp = getClientIp(req.headers);
  const userAgent = req.headers.get("user-agent") ?? "-";

  if (accountType === "user") {
    // Profile fetch + login log insert in parallel (1 RTT)
    const [profileResult, loginLogResult] = await Promise.all([
      supabaseAdmin
        .from("user_profiles")
        .select("id, join_ip")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin.from("login_logs").insert({
        user_id: userId,
        login_at: now,
        ip_address: resolvedIp || "-",
        user_agent: userAgent,
        success: true,
      }),
    ]);

    if (profileResult.error) {
      return NextResponse.json(
        { error: profileResult.error.message },
        { status: 400 },
      );
    }

    const profile = profileResult.data;
    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    if (loginLogResult.error) {
      return NextResponse.json(
        { error: loginLogResult.error.message },
        { status: 400 },
      );
    }

    const updateData: Record<string, string | boolean | null> = {
      last_login_at: now,
      last_login_ip: resolvedIp,
      is_online: true,
      last_activity: now,
      updated_at: now,
    };

    if (!profile.join_ip && resolvedIp) {
      updateData.join_ip = resolvedIp;
    }

    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update(updateData)
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, ip: resolvedIp });
  }

  // Backoffice: admin + agent check in parallel (1 RTT)
  const [adminResult, agentResult] = await Promise.all([
    supabaseAdmin.from("admins").select("id").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("agents").select("id").eq("id", userId).maybeSingle(),
  ]);

  if (adminResult.data) {
    const { error: updateAdminError } = await supabaseAdmin
      .from("admins")
      .update({
        last_login_at: now,
        last_login_ip: resolvedIp,
        updated_at: now,
      })
      .eq("id", userId);

    if (updateAdminError) {
      return NextResponse.json(
        { error: updateAdminError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      accountType: "admin",
      ip: resolvedIp,
    });
  }

  if (agentResult.data) {
    const { error: updateAgentError } = await supabaseAdmin
      .from("agents")
      .update({
        last_login_at: now,
        last_login_ip: resolvedIp,
        updated_at: now,
      })
      .eq("id", userId);

    if (updateAgentError) {
      return NextResponse.json(
        { error: updateAgentError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      accountType: "agent",
      ip: resolvedIp,
    });
  }

  return NextResponse.json({ error: "Account not found" }, { status: 404 });
}
