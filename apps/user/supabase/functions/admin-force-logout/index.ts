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
      .from("admins").select("id").eq("id", authData.user.id).maybeSingle();
    if (!adminRow) return jsonResponse({ error: "Admin privileges required" }, 403);

    const body = await req.json().catch(() => null);
    const userId = body?.userId;
    if (typeof userId !== "string" || !userId) return jsonResponse({ error: "Invalid userId" }, 400);

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
