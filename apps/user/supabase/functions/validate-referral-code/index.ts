import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Missing env" }, 500);

  try {
    const body = await req.json().catch(() => null);
    const code = (body?.referralCode ?? body?.code);
    if (typeof code !== "string" || !code.trim()) return jsonResponse({ valid: false });

    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9\-]{4,32}$/.test(normalized)) return jsonResponse({ valid: false });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("referral_code", normalized)
      .eq("is_active", true)
      .maybeSingle();

    return jsonResponse({ valid: !!data, agentId: data?.id ?? null });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
