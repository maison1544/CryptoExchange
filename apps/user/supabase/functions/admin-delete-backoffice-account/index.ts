import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getBearer } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Missing env" }, 500);

  try {
    const jwt = getBearer(req);
    if (!jwt) return jsonResponse({ error: "Missing auth token" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !authData?.user) return jsonResponse({ error: "Invalid auth token" }, 401);

    const { data: adminRow } = await supabaseAdmin
      .from("admins").select("id, role").eq("id", authData.user.id).maybeSingle();
    if (!adminRow) return jsonResponse({ error: "Admin privileges required" }, 403);

    const body = await req.json().catch(() => null);
    const { accountType, userId } = body || {};

    if (accountType !== "admin" && accountType !== "agent") return jsonResponse({ error: "Invalid accountType" }, 400);
    if (typeof userId !== "string" || !userId) return jsonResponse({ error: "Invalid userId" }, 400);
    if (accountType === "admin" && userId === authData.user.id) return jsonResponse({ error: "Cannot delete own account" }, 400);

    // Privilege-escalation guard: deleting admin accounts is restricted
    // to super_admins. A regular admin who could remove a super_admin
    // would either lock the org out or pave the way for a takeover. The
    // 'cannot delete own account' check above is defense-in-depth for
    // self-foot-gun, not a security boundary.
    if (accountType === "admin" && adminRow.role !== "super_admin") {
      return jsonResponse(
        { error: "super_admin privileges required to delete admin accounts" },
        403,
      );
    }

    // If deleting agent, detach members
    if (accountType === "agent") {
      await supabaseAdmin.from("user_profiles").update({ agent_id: null }).eq("agent_id", userId);
    }

    const tableName = accountType === "admin" ? "admins" : "agents";
    await supabaseAdmin.from(tableName).delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
