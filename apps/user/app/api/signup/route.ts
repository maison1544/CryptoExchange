import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/clientIp";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`signup:${ip}`, 5, 60_000);
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "잘못된 요청 본문입니다." },
        { status: 400 },
      );
    }

    const {
      email,
      password,
      name,
      phone,
      bankName,
      bankAccount,
      bankAccountHolder,
      joinCode,
    } = body;
    const normalizedEmail = String(email || "").trim();
    const normalizedName = String(name || "").trim();
    const normalizedPhone = String(phone || "").trim();
    const normalizedBankName = String(bankName || "").trim();
    const normalizedBankAccount = String(bankAccount || "").trim();
    const normalizedBankAccountHolder = String(bankAccountHolder || "").trim();
    const normalizedJoinCode = String(joinCode || "")
      .trim()
      .toUpperCase();
    const ip = getClientIp(req.headers);

    if (!normalizedEmail || !password || !normalizedName || !normalizedPhone) {
      return NextResponse.json(
        { error: "필수 입력값이 누락되었습니다." },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "비밀번호는 6자 이상이어야 합니다." },
        { status: 400 },
      );
    }

    // Check phone number duplicate
    const { data: existingPhone } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (existingPhone) {
      return NextResponse.json(
        { error: "이미 가입된 전화번호입니다." },
        { status: 409 },
      );
    }

    // Validate referral code if provided
    let agentId: string | null = null;
    if (normalizedJoinCode) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("referral_code", normalizedJoinCode)
        .eq("is_active", true)
        .maybeSingle();
      if (!agent) {
        return NextResponse.json(
          { error: "유효하지 않은 추천 코드입니다." },
          { status: 400 },
        );
      }
      agentId = agent.id;
    }

    // Create auth user
    const { data: createdAuth, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });
    if (authErr || !createdAuth.user) {
      const msg = authErr?.message || "Failed to create user";
      if (msg.includes("already been registered")) {
        return NextResponse.json(
          { error: "이미 가입된 이메일입니다." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Create user profile with pending_approval status
    const { error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: createdAuth.user.id,
        email: normalizedEmail,
        name: normalizedName,
        phone: normalizedPhone,
        bank_name: normalizedBankName || null,
        bank_account: normalizedBankAccount || null,
        bank_account_holder: normalizedBankAccountHolder || null,
        agent_id: agentId,
        referral_code_used: normalizedJoinCode || null,
        status: "pending_approval",
        wallet_balance: 0,
        available_balance: 0,
        futures_balance: 0,
        staking_balance: 0,
        is_online: false,
        join_ip: ip,
      });

    if (profileErr) {
      await supabaseAdmin.auth.admin
        .deleteUser(createdAuth.user.id)
        .catch(() => {
          return null;
        });
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: createdAuth.user.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
