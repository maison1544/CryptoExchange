import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function callEdgeFunction(fnName: string, body: unknown, jwt?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function callApiRoute(path: string, body: unknown, jwt?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    return {
      error: payload?.error || `요청에 실패했습니다. (${res.status})`,
    };
  }

  return payload || { success: true };
}

export async function signUp(data: {
  email: string;
  password: string;
  name: string;
  phone: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
  joinCode?: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      return {
        error:
          payload?.error || `회원가입 요청에 실패했습니다. (${res.status})`,
      };
    }

    return payload || { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        error:
          "회원가입 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
      };
    }

    return {
      error:
        error instanceof Error
          ? error.message
          : "네트워크 오류로 회원가입에 실패했습니다.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function recordUserLogin(accessToken?: string) {
  const token =
    accessToken ||
    (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { error: "No session" };
  return callApiRoute("/api/record-login", { accountType: "user" }, token);
}

export async function recordBackofficeLogin(accessToken?: string) {
  const token =
    accessToken ||
    (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { error: "No session" };
  return callApiRoute(
    "/api/record-login",
    { accountType: "backoffice" },
    token,
  );
}

export async function validateReferralCode(code: string) {
  return callEdgeFunction("validate-referral-code", { referralCode: code });
}
