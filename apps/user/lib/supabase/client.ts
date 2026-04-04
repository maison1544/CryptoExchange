import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabaseAuthStorageKey,
  getSupabaseCookieOptions,
} from "@/lib/supabase/config";

export function createClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  return createBrowserClient(url, key, {
    cookieOptions: getSupabaseCookieOptions(),
    auth: {
      storageKey: getSupabaseAuthStorageKey(),
    },
  });
}
