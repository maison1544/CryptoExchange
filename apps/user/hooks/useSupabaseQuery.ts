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

export function useSupabaseRpc<T>(fnName: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await supabase.rpc(fnName, params);
      if (err) setError(err.message);
      else setData(result as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [fnName]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

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
