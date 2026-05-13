import type { SupabaseClient } from "@supabase/supabase-js";

export type SettingsMap = Record<string, string>;

type SiteSettingRow = {
  key: string;
  value: string | number | null;
};

export type WithdrawalSettings = {
  withdrawFee: number;
  minWithdraw: number;
  dailyMaxWithdraw: number;
  singleMaxWithdraw: number;
};

export const defaultWithdrawalSettings: WithdrawalSettings = {
  withdrawFee: 0,
  minWithdraw: 10,
  dailyMaxWithdraw: 0,
  singleMaxWithdraw: 0,
};

export const defaultUsdtKrwRate = 1426;

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

export function getWithdrawalSettings(
  settings: SettingsMap | null | undefined,
): WithdrawalSettings {
  const source = settings || {};

  return {
    withdrawFee: parseNumericSetting(
      source.withdraw_fee,
      defaultWithdrawalSettings.withdrawFee,
    ),
    minWithdraw: parseNumericSetting(
      source.min_withdraw,
      defaultWithdrawalSettings.minWithdraw,
    ),
    dailyMaxWithdraw: parseNumericSetting(
      source.daily_max_withdraw,
      defaultWithdrawalSettings.dailyMaxWithdraw,
    ),
    singleMaxWithdraw: parseNumericSetting(
      source.single_max_withdraw,
      defaultWithdrawalSettings.singleMaxWithdraw,
    ),
  };
}

export function resolveFuturesFeeRate(
  settings: SettingsMap | null | undefined,
): number {
  const source = settings || {};
  const fallbackRate = parsePercentSetting(source.futures_fee, 0.00035);
  return parsePercentSetting(source.taker_fee, fallbackRate);
}

export function getUsdtKrwRate(
  settings: SettingsMap | null | undefined,
): number {
  const source = settings || {};
  return parseNumericSetting(source.usdt_krw_rate, defaultUsdtKrwRate);
}

export function convertKrwToUsdt(value: number, usdtKrwRate: number): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(usdtKrwRate) ||
    usdtKrwRate <= 0
  ) {
    return 0;
  }

  return value / usdtKrwRate;
}

export function convertUsdtToKrw(value: number, usdtKrwRate: number): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(usdtKrwRate) ||
    usdtKrwRate <= 0
  ) {
    return 0;
  }

  return value * usdtKrwRate;
}

export function formatLimitLabel(amount: number, unit = "USDT"): string {
  if (amount <= 0) {
    return "제한 없음";
  }

  return `${amount.toLocaleString()} ${unit}`;
}

export function parseJsonSetting<T>(value: string | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJsonSetting(value: unknown): string {
  return JSON.stringify(value);
}

export async function loadSiteSettings(
  supabase: SupabaseClient,
  keys?: string[],
): Promise<SettingsMap> {
  const uniqueKeys = [...new Set((keys || []).filter(Boolean))];

  let query = supabase.from("site_settings").select("key, value");

  if (uniqueKeys.length > 0) {
    query = query.in("key", uniqueKeys);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const settings: SettingsMap = {};

  ((data as SiteSettingRow[] | null) || []).forEach((row) => {
    settings[row.key] = String(row.value ?? "");
  });

  return settings;
}

export async function saveSiteSettings(
  supabase: SupabaseClient,
  settings: SettingsMap,
): Promise<void> {
  const entries = Object.entries(settings);

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from("site_settings").upsert(
    entries.map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    })),
  );

  if (error) {
    throw error;
  }
}
