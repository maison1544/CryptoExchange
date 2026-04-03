import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabaseAuthStorageKey,
  getSupabaseCookieOptions,
} from "@/lib/supabase/config";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSupabaseCookieOptions(),
      auth: {
        storageKey: getSupabaseAuthStorageKey(),
      },
    },
  );
}
