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
    const { userId, newPassword } = body || {};

    if (typeof userId !== "string" || !userId) return jsonResponse({ error: "Invalid userId" }, 400);
    if (typeof newPassword !== "string" || newPassword.length < 6) return jsonResponse({ error: "비밀번호를 6자리 이상 입력해야 합니다." }, 400);

    // Privilege-escalation guard: a regular admin must not be able to
    // change another backoffice user's password (admin or agent), which
    // would let them sign in as that account. Only super_admins can
    // reset backoffice passwords. Resetting a regular user's password
    // remains available to all admins.
    if (adminRow.role !== "super_admin") {
      const [{ data: targetAdmin }, { data: targetAgent }] = await Promise.all([
        supabaseAdmin.from("admins").select("id").eq("id", userId).maybeSingle(),
        supabaseAdmin.from("agents").select("id").eq("id", userId).maybeSingle(),
      ]);
      if (targetAdmin || targetAgent) {
        return jsonResponse(
          { error: "super_admin privileges required to reset backoffice passwords" },
          403,
        );
      }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return jsonResponse({ error: error.message }, 400);

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
