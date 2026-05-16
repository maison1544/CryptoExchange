import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getBearer } from "../_shared/cors.ts";

function makeBackofficeEmail(username: string) {
  return `${
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-\.]/g, "") || "user"
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey)
    return jsonResponse({ error: "Missing env" }, 500);

  try {
    const jwt = getBearer(req);
    if (!jwt) return jsonResponse({ error: "Missing auth token" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(jwt);
    if (authError || !authData?.user)
      return jsonResponse({ error: "Invalid auth token" }, 401);

    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("id, role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!adminRow)
      return jsonResponse({ error: "Admin privileges required" }, 403);

    const body = await req.json().catch(() => null);
    const {
      accountType,
      username,
      name,
      email,
      phone,
      password,
      grade,
      commissionRate,
      lossCommissionRate,
      feeCommissionRate,
      role,
      referralCode,
      bankName,
      bankAccount,
      bankAccountHolder,
    } = body || {};

    if (accountType !== "admin" && accountType !== "agent")
      return jsonResponse({ error: "Invalid accountType" }, 400);

    // Privilege-escalation guard: creating new admin accounts (especially
    // super_admin ones) is restricted to existing super_admins. A regular
    // admin who could create another super_admin account would effectively
    // be able to elevate their own privileges by signing in as the new
    // account.
    if (accountType === "admin" && adminRow.role !== "super_admin") {
      return jsonResponse(
        { error: "super_admin privileges required to create admin accounts" },
        403,
      );
    }
    if (!username || username.trim().length < 3)
      return jsonResponse({ error: "Invalid username" }, 400);
    if (!name || !name.trim())
      return jsonResponse({ error: "Invalid name" }, 400);
    if (!password || password.length < 6)
      return jsonResponse(
        { error: "비밀번호를 6자리 이상 입력해야 합니다." },
        400,
      );

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const finalEmail = normalizedEmail || makeBackofficeEmail(username);

    if (!isValidEmail(finalEmail)) {
      return jsonResponse({ error: "유효한 이메일을 입력해주세요." }, 400);
    }

    if (accountType === "admin") {
      if (role !== "super_admin" && role !== "admin")
        return jsonResponse({ error: "Invalid role" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("admins")
        .select("id")
        .eq("username", username.trim())
        .maybeSingle();
      if (existing)
        return jsonResponse({ error: "Account already exists" }, 409);

      const { data: createdAuth, error: authCreateErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: finalEmail,
          password,
          email_confirm: true,
        });
      if (authCreateErr || !createdAuth.user)
        return jsonResponse({ error: authCreateErr?.message || "Failed" }, 400);

      const { error: insertErr } = await supabaseAdmin.from("admins").insert({
        id: createdAuth.user.id,
        username: username.trim(),
        name: name.trim(),
        email: finalEmail,
        role,
        is_active: true,
      });
      if (insertErr) {
        await supabaseAdmin.auth.admin.deleteUser(createdAuth.user.id);
        return jsonResponse({ error: insertErr.message }, 400);
      }
      return jsonResponse({
        success: true,
        id: createdAuth.user.id,
        email: finalEmail,
      });
    }

    // Agent
    const { data: existingAgent } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("username", username.trim())
      .maybeSingle();
    if (existingAgent)
      return jsonResponse({ error: "Account already exists" }, 409);

    const finalCode = referralCode?.trim().toUpperCase() ||
      makeReferralCode(username);

    if (!finalCode) {
      return jsonResponse(
        { error: "가입코드를 생성할 수 없는 아이디입니다." },
        400,
      );
    }

    const { data: existingReferralCode } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("referral_code", finalCode)
      .maybeSingle();

    if (existingReferralCode) {
      return jsonResponse(
        { error: "이미 사용 중인 가입코드입니다. 다른 아이디를 입력해주세요." },
        409,
      );
    }

    const { data: createdAuth, error: authCreateErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: finalEmail,
        password,
        email_confirm: true,
      });
    if (authCreateErr || !createdAuth.user)
      return jsonResponse({ error: authCreateErr?.message || "Failed" }, 400);

    const { error: insertErr } = await supabaseAdmin.from("agents").insert({
      id: createdAuth.user.id,
      username: username.trim(),
      name: name.trim(),
      email: finalEmail,
      phone: typeof phone === "string" ? phone.trim() || null : null,
      grade: typeof grade === "string" && grade.trim() ? grade.trim() : "총판",
      commission_rate: Number(commissionRate) || 0,
      loss_commission_rate: Number(lossCommissionRate) || 0,
      fee_commission_rate: Number(feeCommissionRate) || 0,
      bank_name: typeof bankName === "string" ? bankName.trim() || null : null,
      bank_account:
        typeof bankAccount === "string" ? bankAccount.trim() || null : null,
      bank_account_holder:
        typeof bankAccountHolder === "string"
          ? bankAccountHolder.trim() || null
          : null,
      referral_code: finalCode,
      is_active: true,
    });
    if (insertErr) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuth.user.id);
      return jsonResponse({ error: insertErr.message }, 400);
    }

    return jsonResponse({
      success: true,
      id: createdAuth.user.id,
      referralCode: finalCode,
      email: finalEmail,
    });
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
