import { createClient } from "@/lib/supabase/client";
import type { DbDeposit, DbWithdrawal } from "@/lib/types/database";

const supabase = createClient();

type ApiErrorResult = {
  success?: false;
  error: string;
};

async function callWalletApi<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<T | ApiErrorResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      error: "No session",
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      success: false,
      error: payload?.error || `요청에 실패했습니다. (${response.status})`,
    };
  }

  return (payload || { success: true }) as T;
}

export type WalletSummaryResponse = {
  success: boolean;
  deposits: DbDeposit[];
  withdrawals: DbWithdrawal[];
  userPoints: number;
  availablePoints: number;
  bankProfile: {
    bank: string;
    accountNumber: string;
    accountHolder: string;
  };
  usdtKrwRate: number;
  withdrawalSettings: {
    withdrawFee: number;
    minWithdraw: number;
    dailyMaxWithdraw: number;
    singleMaxWithdraw: number;
  };
};

export type WalletDepositResponse = {
  success: boolean;
  error?: string;
  deposit_id?: number;
  status?: string;
  amount?: number;
  created_at?: string;
};

export type WalletWithdrawalResponse = {
  success: boolean;
  error?: string;
  message?: string;
  withdrawal_id?: number;
  status?: string;
  requested_amount?: number;
  fee?: number;
  deducted_amount?: number;
  created_at?: string;
  wallet_balance?: number;
  available_balance?: number;
};

export async function getWalletSummary() {
  return callWalletApi<WalletSummaryResponse>("/api/wallet/summary", {
    method: "GET",
  });
}

export async function requestDeposit(data: {
  amount: number;
  depositorName: string;
}) {
  const idempotencyKey = globalThis.crypto?.randomUUID?.();

  return callWalletApi<WalletDepositResponse>("/api/wallet/deposit", {
    method: "POST",
    body: data,
    idempotencyKey,
  });
}

export async function requestWithdrawal(data: {
  amount: number;
  bank: string;
  accountNumber: string;
  accountHolder: string;
}) {
  const idempotencyKey = globalThis.crypto?.randomUUID?.();

  return callWalletApi<WalletWithdrawalResponse>("/api/wallet/withdraw", {
    method: "POST",
    body: data,
    idempotencyKey,
  });
}
