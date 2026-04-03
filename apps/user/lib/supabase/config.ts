const DEFAULT_APP_INSTANCE = "user";
const APP_INSTANCES = new Set(["user", "admin", "partner"]);

function resolveAppInstance() {
  const rawInstance = process.env.NEXT_PUBLIC_APP_INSTANCE?.trim().toLowerCase();
  if (rawInstance && APP_INSTANCES.has(rawInstance)) {
    return rawInstance;
  }
  return DEFAULT_APP_INSTANCE;
}

export function getSupabaseAuthCookieName() {
  return `sb-cryptoexchange-${resolveAppInstance()}-auth-token`;
}

export function getSupabaseAuthStorageKey() {
  return `cryptoexchange-${resolveAppInstance()}-auth-token`;
}

export function getSupabaseCookieOptions() {
  return {
    name: getSupabaseAuthCookieName(),
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365,
  };
}
