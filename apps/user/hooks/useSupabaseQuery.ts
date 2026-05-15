"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export function useSupabaseQuery<T>(
  table: string,
  options?: {
    select?: string;
    eq?: Record<string, unknown>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    enabled?: boolean;
  },
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (options?.enabled === false) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase.from(table).select(options?.select ?? "*");

      if (options?.eq) {
        for (const [key, value] of Object.entries(options.eq)) {
          query = query.eq(key, value);
        }
      }
      if (options?.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending ?? false,
        });
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data: result, error: err } = await query;
      if (err) {
        setError(err.message);
      } else {
        setData((result as T[]) ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [table, options?.select, options?.enabled, options?.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// `useSupabaseRpc` was removed in the security hardening pass. Direct
// RPC calls from the browser are no longer permitted; sensitive RPCs
// have had their EXECUTE privilege revoked from `anon`/`authenticated`,
// and all callable flows go through `/api/...` server routes that use
// the service-role key. Re-introducing a generic client RPC helper
// would invite future regressions, so the helper is intentionally not
// available.

export function useUserProfile() {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      setProfile(data);
      setLoading(false);
    };
    load();
  }, []);

  return { profile, loading };
}

export { supabase };
