import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

type RouteContext = {
  params: Promise<{
    memberId: string;
  }>;
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) return null;
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }
  return authHeader;
}

const RECENT_LIMIT = 30;

export async function GET(req: NextRequest, context: RouteContext) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`member-detail:${ip}`, 30, 60_000);
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

  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const { memberId } = await context.params;
  if (!memberId) {
    return NextResponse.json({ error: "Missing member id" }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const profileSelect =
    "id, email, name, phone, status, wallet_balance, available_balance, futures_balance, staking_balance, bank_name, bank_account, bank_account_holder, referral_code_used, join_ip, last_login_ip, last_login_at, is_online, last_activity, created_at, agent_id";
  const depositSelect =
    "id, amount, depositor_name, status, reject_reason, processed_at, created_at";
  const withdrawalSelect =
    "id, amount, bank, account_number, account_holder, status, reject_reason, processed_at, created_at";
  const positionSelect =
    "id, symbol, direction, margin_mode, leverage, size, entry_price, exit_price, liquidation_price, margin, pnl, fee, status, opened_at, closed_at";
  const stakingSelect =
    "id, amount, daily_reward, total_earned, status, cancel_reason, started_at, ends_at, completed_at, staking_products(id, name, annual_rate, duration_days)";
  const loginLogSelect =
    "id, login_at, ip_address, user_agent, success, failure_reason";

  // Stage 1: Auth + minimal profile fetch (only the agent_id is needed
  // for role-based access checks). Data queries are deferred until the
  // caller proves authorization, so an unauthorized request never causes
  // the database to materialize private trading/login history.
  const [authResult, profileResult] = await Promise.all([
    supabaseAdmin.auth.getUser(jwt),
    supabaseAdmin
      .from("user_profiles")
      .select(profileSelect)
      .eq("id", memberId)
      .maybeSingle(),
  ]);

  const user = authResult.data?.user;
  if (authResult.error || !user) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const profile = profileResult.data;
  if (profileResult.error) {
    return NextResponse.json(
      { error: profileResult.error.message },
      { status: 400 },
    );
  }
  if (!profile) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Stage 2: Authorization. Self, admins, and the owning agent are the
  // only roles that may view a member's full history.
  const isOwner = user.id === memberId;
  if (!isOwner) {
    const [{ data: adminRow }, { data: agentRow }] = await Promise.all([
      supabaseAdmin.from("admins").select("id").eq("id", user.id).maybeSingle(),
      supabaseAdmin.from("agents").select("id").eq("id", user.id).maybeSingle(),
    ]);
    const isAdmin = Boolean(adminRow);
    const isAgentOwner = Boolean(agentRow) && profile.agent_id === user.id;

    if (!isAdmin && !isAgentOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Stage 3: Authorized — now fetch the heavy related data in parallel.
  const [deposits, withdrawals, positions, stakings, loginLogs] =
    await Promise.all([
      supabaseAdmin
        .from("deposits")
        .select(depositSelect)
        .eq("user_id", memberId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabaseAdmin
        .from("withdrawals")
        .select(withdrawalSelect)
        .eq("user_id", memberId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabaseAdmin
        .from("futures_positions")
        .select(positionSelect)
        .eq("user_id", memberId)
        .order("opened_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabaseAdmin
        .from("staking_positions")
        .select(stakingSelect)
        .eq("user_id", memberId)
        .order("started_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabaseAdmin
        .from("login_logs")
        .select(loginLogSelect)
        .eq("user_id", memberId)
        .order("login_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

  const firstError = [
    deposits.error,
    withdrawals.error,
    positions.error,
    stakings.error,
    loginLogs.error,
  ].find(Boolean);

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  return NextResponse.json({
    profile,
    deposits: deposits.data || [],
    withdrawals: withdrawals.data || [],
    positions: positions.data || [],
    stakings: stakings.data || [],
    loginLogs: loginLogs.data || [],
  });
}
