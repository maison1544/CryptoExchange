import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseCookieOptions } from "@/lib/supabase/config";
import { rateLimit } from "@/lib/rateLimit";

type LoginBody = {
  email?: string;
  password?: string;
};

type LoginRole = "user" | "admin" | "agent" | "pending" | "suspended" | null;

type UserProfileStatusRow = {
  id: string;
  status: "pending_approval" | "active" | "suspended" | "banned";
};

type PendingCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

const LOGIN_REQUEST_TIMEOUT_MS = 30000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function detectRole(
  supabaseAdmin: any,
  userId: string,
): Promise<LoginRole> {
  const { data: admin } = await supabaseAdmin
    .from("admins")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (admin) return "admin";

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (agent) return "agent";

  const { data: profileData } = await supabaseAdmin
    .from("user_profiles")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileData as UserProfileStatusRow | null;

  if (!profile) return null;
  if (profile.status === "pending_approval") return "pending";
  if (profile.status === "suspended" || profile.status === "banned") {
    return "suspended";
  }

  return "user";
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as LoginBody | null;
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력해주세요." },
      { status: 400 },
    );
  }

  const pendingCookies: PendingCookie[] = [];
  const applyCookies = (response: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          pendingCookies.push({ name, value, options });
        });
      },
    },
  });

  const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      LOGIN_REQUEST_TIMEOUT_MS,
      "로그인 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
    );

    if (error || !data.user || !data.session) {
      return applyCookies(
        NextResponse.json(
          { error: error?.message || "로그인에 실패했습니다." },
          { status: 401 },
        ),
      );
    }

    const role = await withTimeout(
      detectRole(supabaseAdmin, data.user.id),
      5000,
      "로그인 후 권한 확인 시간이 초과되었습니다. 다시 시도해주세요.",
    );

    if (role === "pending") {
      await supabase.auth.signOut();
      return applyCookies(
        NextResponse.json(
          { error: "관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다." },
          { status: 403 },
        ),
      );
    }

    if (role === "suspended") {
      await supabase.auth.signOut();
      return applyCookies(
        NextResponse.json(
          { error: "계정이 정지되었습니다. 관리자에게 문의하세요." },
          { status: 403 },
        ),
      );
    }

    if (!role) {
      await supabase.auth.signOut();
      return applyCookies(
        NextResponse.json(
          { error: "로그인 권한을 확인할 수 없습니다." },
          { status: 403 },
        ),
      );
    }

    return applyCookies(
      NextResponse.json({ role, user: data.user, session: data.session }),
    );
  } catch (error) {
    const isTimeoutError =
      error instanceof Error && error.message.includes("시간이 초과되었습니다");

    return applyCookies(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "로그인 요청을 처리하지 못했습니다.",
        },
        { status: isTimeoutError ? 504 : 500 },
      ),
    );
  }
}
