"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getSupabaseAuthCookieName,
  getSupabaseAuthStorageKey,
} from "@/lib/supabase/config";
import { recordBackofficeLogin, recordUserLogin } from "@/lib/api/auth";
import type { User, Session } from "@supabase/supabase-js";

export type UserRole = "user" | "admin" | "agent" | null;

interface AuthContextType {
  isLoggedIn: boolean;
  isInitialized: boolean;
  user: User | null;
  session: Session | null;
  role: UserRole;
  login: (
    email: string,
    password: string,
  ) => Promise<{ error?: string; role?: UserRole }>;
  logout: (redirectTo?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const supabase = createClient();
const authCookieName = getSupabaseAuthCookieName();
const authStorageKey = getSupabaseAuthStorageKey();
const ROLE_REQUEST_TIMEOUT_MS = 5000;
const LOGIN_API_TIMEOUT_MS = 30000;

type LoginApiResponse = {
  error?: string;
  role?: UserRole;
  user?: User | null;
  session?: Session | null;
};

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function loginViaApi(
  email: string,
  password: string,
): Promise<LoginApiResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    LOGIN_API_TIMEOUT_MS,
  );

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    let payload: LoginApiResponse | null = null;
    try {
      payload = (await res.json()) as LoginApiResponse;
    } catch {
      payload = null;
    }

    if (!res.ok) {
      return {
        error: payload?.error || `로그인에 실패했습니다. (${res.status})`,
      };
    }

    return payload || { error: "로그인 응답을 확인할 수 없습니다." };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        error: "로그인 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
      };
    }

    return {
      error:
        error instanceof Error ? error.message : "로그인 요청에 실패했습니다.",
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function detectRole(userId: string): Promise<UserRole> {
  try {
    const { data: admin } = await supabase
      .from("admins")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (admin) return "admin";

    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (agent) return "agent";

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, status")
      .eq("id", userId)
      .maybeSingle();
    if (profile) {
      if (profile.status === "pending_approval") return "pending" as UserRole;
      if (profile.status === "suspended" || profile.status === "banned")
        return "suspended" as UserRole;
      return "user";
    }
  } catch {
    // RLS or network error — fallback to null
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const loginInProgressRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (cancelled) return;

      // Always update session/user synchronously
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (event === "INITIAL_SESSION") {
        if (!cancelled) setIsInitialized(true);
        if (newSession?.user) {
          try {
            const r = await withTimeout(
              detectRole(newSession.user.id),
              ROLE_REQUEST_TIMEOUT_MS,
              "권한 확인 시간이 초과되었습니다.",
            );
            if (!cancelled) setRole(r);
          } catch {
            if (!cancelled) setRole(null);
          }
        } else if (!cancelled) {
          setRole(null);
        }
      } else if (event === "SIGNED_IN") {
        if (!cancelled) setIsInitialized(true);
        // Detect role only if login() is NOT actively running (e.g. page refresh)
        if (!loginInProgressRef.current && newSession?.user) {
          try {
            const r = await withTimeout(
              detectRole(newSession.user.id),
              ROLE_REQUEST_TIMEOUT_MS,
              "권한 확인 시간이 초과되었습니다.",
            );
            if (!cancelled) setRole(r);
          } catch {
            // ignore — role will remain as-is
          }
        }
      } else if (event === "SIGNED_OUT") {
        if (!cancelled) {
          setRole(null);
          setIsInitialized(true);
        }
      } else {
        // TOKEN_REFRESHED etc — just keep initialized
        if (!cancelled) setIsInitialized(true);
      }
    });

    const timer = window.setTimeout(() => {
      if (!cancelled) setIsInitialized(true);
    }, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ error?: string; role?: UserRole }> => {
      loginInProgressRef.current = true;
      try {
        const loginResult = await loginViaApi(email, password);
        if (loginResult.error) {
          return { error: loginResult.error };
        }

        const nextUser = loginResult.user ?? null;
        const nextSession = loginResult.session ?? null;
        const nextRole = loginResult.role ?? null;

        if (!nextUser || !nextSession || !nextRole) {
          return { error: "로그인 응답을 확인할 수 없습니다." };
        }

        try {
          await withTimeout(
            supabase.auth.setSession({
              access_token: nextSession.access_token,
              refresh_token: nextSession.refresh_token,
            }),
            5000,
            "세션 저장 시간이 초과되었습니다. 다시 시도해주세요.",
          );
        } catch {}

        try {
          if (nextRole === "user") {
            await withTimeout(
              recordUserLogin(nextSession.access_token),
              4000,
              "사용자 로그인 기록 저장 시간이 초과되었습니다.",
            );
          } else if (nextRole === "admin" || nextRole === "agent") {
            await withTimeout(
              recordBackofficeLogin(nextSession.access_token),
              4000,
              "관리자 로그인 기록 저장 시간이 초과되었습니다.",
            );
          }
        } catch {}

        setUser(nextUser);
        setSession(nextSession);
        setRole(nextRole);
        setIsInitialized(true);
        return { role: nextRole };
      } finally {
        loginInProgressRef.current = false;
      }
    },
    [],
  );

  const logout = useCallback(async (redirectTo?: string) => {
    await supabase.auth.signOut();
    document.cookie.split(";").forEach((c) => {
      const name = c.trim().split("=")[0];
      if (name === authCookieName || name.startsWith(`${authCookieName}.`)) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });
    window.localStorage.removeItem(authStorageKey);
    setUser(null);
    setSession(null);
    setRole(null);
    window.location.href = redirectTo || "/login";
  }, []);

  const isLoggedIn = !!session;

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, isInitialized, user, session, role, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
