import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  getBearer,
  getClientIp,
} from "../_shared/cors.ts";

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

    const userId = authData.user.id;
    const now = new Date().toISOString();
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "-";

    const { data: userRow } = await supabaseAdmin
      .from("user_profiles")
      .select("id, join_ip")
      .eq("id", userId)
      .maybeSingle();

    if (!userRow) return jsonResponse({ error: "User profile not found" }, 404);

    await supabaseAdmin.from("login_logs").insert({
      user_id: userId,
      login_at: now,
      ip_address: ip || "-",
      user_agent: userAgent,
      success: true,
    });

    const updateData: Record<string, unknown> = {
      last_login_at: now,
      last_login_ip: ip,
      is_online: true,
      last_activity: now,
      updated_at: now,
    };
    if (!userRow.join_ip && ip) updateData.join_ip = ip;

    await supabaseAdmin
      .from("user_profiles")
      .update(updateData)
      .eq("id", userId);

    return jsonResponse({ success: true, ip });
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
