const ALLOWED_ORIGINS: string[] = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/** @deprecated Use getCorsHeaders(req) instead for origin-safe CORS */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : corsHeaders),
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
}

export function getBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return null;
  if (auth.toLowerCase().startsWith("bearer "))
    return auth.slice("bearer ".length);
  return auth;
}

export function getClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  const realIp = req.headers.get("x-real-ip");
  const fwd = req.headers.get("x-forwarded-for");
  const first = (v: string | null) => {
    const raw = v?.split(",")[0]?.trim() || null;
    if (!raw || raw === "-") return null;
    if (raw.toLowerCase() === "localhost") return "127.0.0.1";
    if (raw === "::1" || raw === "0:0:0:0:0:0:0:1") return "127.0.0.1";
    if (raw.startsWith("::ffff:")) return raw.slice("::ffff:".length);
    return raw;
  };
  return first(cf) || first(realIp) || first(fwd) || null;
}
