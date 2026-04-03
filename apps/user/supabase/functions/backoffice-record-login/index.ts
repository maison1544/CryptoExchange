import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getBearer, getClientIp } from "../_shared/cors.ts";

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

    const userId = authData.user.id;
    const now = new Date().toISOString();
    const ip = getClientIp(req);

    // Check admins first
    const { data: adminRow } = await supabaseAdmin
      .from("admins").select("id").eq("id", userId).maybeSingle();

    if (adminRow) {
      await supabaseAdmin.from("admins").update({
        last_login_at: now, last_login_ip: ip, updated_at: now,
      }).eq("id", userId);
      return jsonResponse({ success: true, accountType: "admin", ip });
    }

    // Check agents
    const { data: agentRow } = await supabaseAdmin
      .from("agents").select("id").eq("id", userId).maybeSingle();

    if (agentRow) {
      await supabaseAdmin.from("agents").update({
        last_login_at: now, last_login_ip: ip, updated_at: now,
      }).eq("id", userId);
      return jsonResponse({ success: true, accountType: "agent", ip });
    }

    return jsonResponse({ error: "Account not found" }, 404);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
