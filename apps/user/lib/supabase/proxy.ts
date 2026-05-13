import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseCookieOptions } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // IMPORTANT: must use the same Supabase project URL/key as the browser
  // client (lib/supabase/client.ts) and server client (lib/supabase/server.ts)
  // and the login route (app/api/auth/login/route.ts). If these diverge (e.g.
  // SUPABASE_URL points at project A while NEXT_PUBLIC_SUPABASE_URL points at
  // project B), the browser signs in against A and writes A-issued cookies,
  // but the middleware here would try to validate them against B — getUser()
  // fails, the user appears anonymous, and every protected route redirects
  // back to /login. NEXT_PUBLIC_* env vars ARE available at runtime in the
  // Edge Runtime via process.env, so reading them directly is safe.
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  const supabase = createServerClient(url, key, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
          headers: supabaseResponse.headers,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}
