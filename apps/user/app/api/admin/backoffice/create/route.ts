import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { BANK_OPTIONS } from "@/lib/constants/banks";

type BackofficeCreateBody = {
  accountType?: "admin" | "agent";
  username?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  grade?: string;
  commissionRate?: number;
  lossCommissionRate?: number;
  feeCommissionRate?: number;
  role?: "super_admin" | "admin";
  referralCode?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
};

function makeBackofficeEmail(username: string) {
  return `${
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-.]/g, "") || "user"
  }@backoffice.local`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function makeReferralCode(username: string) {
  return username
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);
}

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server config error");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const jwt = getBearer(req);

  if (!jwt) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const admin = getAdminClient();
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const { data: adminRow } = await admin
    .from("admins")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle<{ id: string; role: string }>();

  if (!adminRow) {
    return NextResponse.json(
      { error: "Admin privileges required" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as BackofficeCreateBody | null;
  const accountType = body?.accountType;
  const username = body?.username?.trim() || "";
  const name = body?.name?.trim() || "";
  const password = body?.password || "";
  const normalizedEmail = body?.email?.trim().toLowerCase() || "";
  const finalEmail = normalizedEmail || makeBackofficeEmail(username);

  if (accountType !== "admin" && accountType !== "agent") {
    return NextResponse.json({ error: "Invalid accountType" }, { status: 400 });
  }

  if (accountType === "admin" && adminRow.role !== "super_admin") {
    return NextResponse.json(
      { error: "최고관리자만 관리자 계정을 생성할 수 있습니다." },
      { status: 403 },
    );
  }

  if (username.length < 3) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "비밀번호를 6자리 이상 입력해야 합니다." },
      { status: 400 },
    );
  }

  if (!isValidEmail(finalEmail)) {
    return NextResponse.json(
      { error: "유효한 이메일을 입력해주세요." },
      { status: 400 },
    );
  }

  if (accountType === "admin") {
    const role = body?.role;

    if (role !== "super_admin" && role !== "admin") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("admins")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Account already exists" },
        { status: 409 },
      );
    }

    const { data: createdAuth, error: authCreateErr } =
      await admin.auth.admin.createUser({
        email: finalEmail,
        password,
        email_confirm: true,
      });

    if (authCreateErr || !createdAuth.user) {
      return NextResponse.json(
        { error: authCreateErr?.message || "Failed" },
        { status: 400 },
      );
    }

    const { error: insertErr } = await admin.from("admins").insert({
      id: createdAuth.user.id,
      username,
      name,
      email: finalEmail,
      role,
      is_active: true,
    });

    if (insertErr) {
      await admin.auth.admin.deleteUser(createdAuth.user.id);
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      id: createdAuth.user.id,
      email: finalEmail,
    });
  }

  const grade = body?.grade?.trim() || "총판";
  const bankName = body?.bankName?.trim() || "";

  if (grade !== "총판" && grade !== "대리점") {
    return NextResponse.json({ error: "Invalid grade" }, { status: 400 });
  }

  if (bankName && !BANK_OPTIONS.includes(bankName as (typeof BANK_OPTIONS)[number])) {
    return NextResponse.json({ error: "Invalid bank" }, { status: 400 });
  }

  const { data: existingAgent } = await admin
    .from("agents")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existingAgent) {
    return NextResponse.json(
      { error: "Account already exists" },
      { status: 409 },
    );
  }

  const finalCode =
    body?.referralCode?.trim().toUpperCase() || makeReferralCode(username);

  if (!finalCode) {
    return NextResponse.json(
      { error: "가입코드를 생성할 수 없는 아이디입니다." },
      { status: 400 },
    );
  }

  const { data: existingReferralCode } = await admin
    .from("agents")
    .select("id")
    .eq("referral_code", finalCode)
    .maybeSingle();

  if (existingReferralCode) {
    return NextResponse.json(
      { error: "이미 사용 중인 가입코드입니다. 다른 아이디를 입력해주세요." },
      { status: 409 },
    );
  }

  const { data: createdAuth, error: authCreateErr } =
    await admin.auth.admin.createUser({
      email: finalEmail,
      password,
      email_confirm: true,
    });

  if (authCreateErr || !createdAuth.user) {
    return NextResponse.json(
      { error: authCreateErr?.message || "Failed" },
      { status: 400 },
    );
  }

  const { error: insertErr } = await admin.from("agents").insert({
    id: createdAuth.user.id,
    username,
    name,
    email: finalEmail,
    phone: body?.phone?.trim() || null,
    grade,
    commission_rate: Number(body?.commissionRate) || 0,
    loss_commission_rate: Number(body?.lossCommissionRate) || 0,
    fee_commission_rate: Number(body?.feeCommissionRate) || 0,
    bank_name: bankName || null,
    bank_account: body?.bankAccount?.trim() || null,
    bank_account_holder: body?.bankAccountHolder?.trim() || null,
    referral_code: finalCode,
    is_active: true,
  });

  if (insertErr) {
    await admin.auth.admin.deleteUser(createdAuth.user.id);
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    id: createdAuth.user.id,
    referralCode: finalCode,
    email: finalEmail,
  });
}
