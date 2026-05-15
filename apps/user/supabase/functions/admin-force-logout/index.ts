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
    const userId = body?.userId;
    if (typeof userId !== "string" || !userId) return jsonResponse({ error: "Invalid userId" }, 400);

    // Privilege-escalation / DoS guard: a regular admin must not be able
    // to log out another backoffice user (admin or agent). That would
    // both let them lock a super_admin out of the system and serve as a
    // recon primitive for whether a particular UUID maps to a backoffice
    // account. Forcing logout on a normal user remains available to all
    // admins.
    if (adminRow.role !== "super_admin") {
      const [{ data: targetAdmin }, { data: targetAgent }] = await Promise.all([
        supabaseAdmin.from("admins").select("id").eq("id", userId).maybeSingle(),
        supabaseAdmin.from("agents").select("id").eq("id", userId).maybeSingle(),
      ]);
      if (targetAdmin || targetAgent) {
        return jsonResponse(
          { error: "super_admin privileges required to log out backoffice users" },
          403,
        );
      }
    }

    // Revoke all sessions via Auth Admin API
    const endpoint = `${supabaseUrl}/auth/v1/admin/users/${userId}/logout?scope=global`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    });

    const revoked = resp.ok || resp.status === 204;

    return jsonResponse({ success: true, revoked });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
