import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

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
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid body" }, 400);

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

    if (!email || !password || !name || !phone) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: "비밀번호는 6자 이상이어야 합니다." }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Validate referral code if provided
    let agentId: string | null = null;
    if (joinCode && joinCode.trim()) {
      const normalized = joinCode.trim().toUpperCase();
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("referral_code", normalized)
        .eq("is_active", true)
        .maybeSingle();
      if (!agent)
        return jsonResponse({ error: "유효하지 않은 추천 코드입니다." }, 400);
      agentId = agent.id;
    }

    // Create auth user
    const { data: createdAuth, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
      });
    if (authErr || !createdAuth.user) {
      const msg = authErr?.message || "Failed to create user";
      if (msg.includes("already been registered")) {
        return jsonResponse({ error: "이미 가입된 이메일입니다." }, 409);
      }
      return jsonResponse({ error: msg }, 400);
    }

    // Create user profile
    const { error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: createdAuth.user.id,
        email: email.trim(),
        name: name.trim(),
        phone: phone.trim(),
        bank_name: bankName || null,
        bank_account: bankAccount || null,
        bank_account_holder: bankAccountHolder || null,
        agent_id: agentId,
        referral_code_used: joinCode?.trim().toUpperCase() || null,
        status: "pending_approval",
      });

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuth.user.id);
      return jsonResponse({ error: profileErr.message }, 400);
    }

    return jsonResponse({ success: true, id: createdAuth.user.id });
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
