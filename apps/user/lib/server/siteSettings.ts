import type { SupabaseClient } from "@supabase/supabase-js";

export type SiteSettingsMap = Record<string, string>;
type SiteSettingRow = {
  key: string;
  value: string | number | null;
};

export async function getSiteSettings(
  supabase: SupabaseClient,
  keys: string[],
): Promise<SiteSettingsMap> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];

  if (uniqueKeys.length === 0) {
    return {};
  }

  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", uniqueKeys);

  const settings: SiteSettingsMap = {};

  ((data as SiteSettingRow[] | null) || []).forEach((row) => {
    settings[row.key] = String(row.value ?? "");
  });

  return settings;
}

export function parseNumericSetting(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parsePercentSetting(
  value: string | undefined,
  fallbackRate: number,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallbackRate;
  }

  return parsed / 100;
}

export function resolveFuturesFeeRate(settings: SiteSettingsMap): number {
  const fallbackRate = parsePercentSetting(settings.futures_fee, 0.00035);
  return parsePercentSetting(settings.taker_fee, fallbackRate);
}
