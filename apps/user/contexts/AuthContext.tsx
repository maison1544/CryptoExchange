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

// `pending` / `suspended` are NOT user-facing roles — they signal an
// intermediate auth state that maps to a friendly Korean error message
// before we sign the user back out. Keep them internal to this module.
type ExtendedRole = "user" | "admin" | "agent" | "pending" | "suspended" | null;

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

/**
 * Role detection runs as the freshly-signed-in user, so RLS policies on
 * `admins`, `agents`, and `user_profiles` (all of which allow self-read
 * via `auth.uid() = id`) are sufficient — no service_role is needed.
 */
async function detectRole(userId: string): Promise<ExtendedRole> {
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
      if (profile.status === "pending_approval") return "pending";
      if (profile.status === "suspended" || profile.status === "banned") {
        return "suspended";
      }
      return "user";
    }
  } catch {
    // RLS or network error — fallback to null. Caller will treat as "no role".
  }
  return null;
}

/**
 * The auth context only exposes the three "active" roles to consumers;
 * the intermediate `pending` / `suspended` states are treated as "no
 * role" once the user has been signed back out.
 */
function narrowRole(ext: ExtendedRole): UserRole {
  if (ext === "user" || ext === "admin" || ext === "agent") return ext;
  return null;
}

/**
 * Map Supabase auth error messages to user-facing Korean copy. Anything
 * not explicitly recognised falls back to the raw message so we never
 * silently swallow a real error.
 */
function translateAuthError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (lower.includes("email not confirmed")) {
    return "이메일 인증이 완료되지 않았습니다.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.";
  }
  return rawMessage || "로그인에 실패했습니다.";
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
            if (!cancelled) setRole(narrowRole(r));
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
            if (!cancelled) setRole(narrowRole(r));
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
      // We previously POSTed to /api/auth/login and then mirrored the
      // returned session into the browser client via `setSession()`. That
      // hybrid flow had two well-known failure modes:
      //   1. `setSession()` acquires the same NavigatorLock that the auth
      //      client uses for its initial `INITIAL_SESSION` recovery. On a
      //      fresh page where the user clicks "login" before that recovery
      //      finishes, `setSession()` can deadlock until its 5 s timeout
      //      fires, the function then "succeeds" with state half-written,
      //      and the user has to refresh and retry to actually navigate.
      //   2. The server route writes the SSR cookie format while
      //      `setSession()` writes the browser-client format. Whichever
      //      runs second "wins" and the loser can leave the cookie in a
      //      state where the next middleware tick sees no user.
      //
      // The cleanest fix — and the one Supabase recommends in their
      // Next.js + @supabase/ssr docs — is to sign in directly via the
      // browser client. It writes the cookie via the configured storage
      // adapter (which matches what `createServerClient` reads on the
      // next request), fires `SIGNED_IN` exactly once, and never races
      // with itself.
      loginInProgressRef.current = true;
      try {
        const normalisedEmail = email.trim().toLowerCase();

        // Server-side rate-limit gate. Runs *before* signInWithPassword so
        // a brute-force attempt never reaches Supabase Auth, and the
        // window cutoff uses server-side `now()` instead of trusting the
        // client clock. Failures here fall open (the route already
        // handles its own fail-open behaviour), but anything returning a
        // non-2xx with a Korean error string is surfaced to the user.
        try {
          const gateRes = await fetch("/api/auth/check-login-rate-limit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: normalisedEmail }),
            credentials: "same-origin",
          });
          if (gateRes.status === 429) {
            const body = (await gateRes.json().catch(() => null)) as {
              error?: string;
            } | null;
            return {
              error:
                body?.error ??
                "너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.",
            };
          }
        } catch {
          // network error reaching our own API — fall through to Supabase
          // Auth which still has its own throttle as a last line of defence.
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalisedEmail,
          password,
        });

        if (error) {
          return { error: translateAuthError(error.message) };
        }

        if (!data.user || !data.session) {
          return { error: "로그인 응답을 확인할 수 없습니다." };
        }

        // Role check runs *after* sign-in (RLS allows the user to read
        // their own admin / agent / user_profile row). If they're in an
        // unusable state we immediately sign them back out so the
        // session does not survive past this function call.
        let detected: ExtendedRole = null;
        try {
          detected = await withTimeout(
            detectRole(data.user.id),
            ROLE_REQUEST_TIMEOUT_MS,
            "권한 확인 시간이 초과되었습니다. 다시 시도해주세요.",
          );
        } catch (err) {
          await supabase.auth.signOut().catch(() => {});
          return {
            error:
              err instanceof Error
                ? err.message
                : "권한 확인 중 오류가 발생했습니다.",
          };
        }

        if (detected === "pending") {
          await supabase.auth.signOut().catch(() => {});
          return {
            error: "관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.",
          };
        }
        if (detected === "suspended") {
          await supabase.auth.signOut().catch(() => {});
          return { error: "계정이 정지되었습니다. 관리자에게 문의하세요." };
        }
        if (!detected) {
          await supabase.auth.signOut().catch(() => {});
          return { error: "로그인 권한을 확인할 수 없습니다." };
        }

        // Record the login asynchronously — never block navigation on it.
        // The previous flow `await`ed this with a 4 s timeout, which made
        // a sluggish edge-function look like a frozen login button.
        const accessToken = data.session.access_token;
        if (detected === "user") {
          void recordUserLogin(accessToken).catch(() => {});
        } else {
          void recordBackofficeLogin(accessToken).catch(() => {});
        }

        // Reset the sliding-window counter for this IP+email pair so a
        // user who finally types their password correctly is not still
        // throttled. Fire-and-forget; failures must not block the UI.
        void fetch("/api/auth/mark-login-success", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalisedEmail }),
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => {});

        const narrowed = narrowRole(detected);
        setUser(data.user);
        setSession(data.session);
        setRole(narrowed);
        setIsInitialized(true);
        return { role: narrowed };
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
