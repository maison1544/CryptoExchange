"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { processDeposit, processWithdrawal } from "@/lib/api/admin";
import {
  getWalletSummary,
  requestDeposit,
  requestWithdrawal,
  type WalletSummaryResponse,
} from "@/lib/api/wallet";
import { formatDateTime } from "@/lib/utils/formatDate";
import type { DbDeposit, DbWithdrawal } from "@/lib/types/database";
import { useAuth } from "@/contexts/AuthContext";
import {
  defaultUsdtKrwRate,
  defaultWithdrawalSettings,
  getUsdtKrwRate,
  getWithdrawalSettings,
  type WithdrawalSettings,
} from "@/lib/utils/siteSettings";

const supabase = createClient();

// ── 타입 정의 ──────────────────────────────────────────────────────────────
export interface DepositRequest {
  id: number;
  userId: string;
  name: string;
  email: string;
  amount: number;
  depositorName: string;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  date: string;
}

export interface WithdrawalRequest {
  id: number;
  userId: string;
  name: string;
  email: string;
  amount: number;
  fee: number;
  bank: string;
  accountNumber: string;
  accountHolder: string;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  date: string;
  createdAt: string;
}

export interface WithdrawalRequestResult {
  success: boolean;
  error?: string;
  fee?: number;
  deductedAmount?: number;
}

export interface DepositRequestResult {
  success: boolean;
  error?: string;
}

export interface DepositWithdrawalActionResult {
  success: boolean;
  error?: string;
}

export interface BankProfile {
  bank: string;
  accountNumber: string;
  accountHolder: string;
}

interface DepositWithdrawalContextType {
  deposits: DepositRequest[];
  withdrawals: WithdrawalRequest[];
  userPoints: number;
  availablePoints: number;
  bankProfile: BankProfile;
  usdtKrwRate: number;
  withdrawalSettings: WithdrawalSettings;
  loading: boolean;
  addDeposit: (data: {
    amount: number;
    depositorName: string;
  }) => Promise<DepositRequestResult>;
  addWithdrawal: (data: {
    amount: number;
    bank: string;
    accountNumber: string;
    accountHolder: string;
  }) => Promise<WithdrawalRequestResult>;
  approveDeposit: (id: number) => Promise<DepositWithdrawalActionResult>;
  rejectDeposit: (
    id: number,
    reason: string,
  ) => Promise<DepositWithdrawalActionResult>;
  approveWithdrawal: (id: number) => Promise<DepositWithdrawalActionResult>;
  rejectWithdrawal: (
    id: number,
    reason: string,
  ) => Promise<DepositWithdrawalActionResult>;
  refetch: () => Promise<void>;
}

// ── Context ─────────────────────────────────────────────────────────────────
const DepositWithdrawalContext =
  createContext<DepositWithdrawalContextType | null>(null);

const defaultBankProfile: BankProfile = {
  bank: "",
  accountNumber: "",
  accountHolder: "",
};

function toDepositRequest(d: DbDeposit): DepositRequest {
  return {
    id: d.id,
    userId: d.user_id,
    name: "",
    email: "",
    amount: Number(d.amount),
    depositorName: d.depositor_name,
    status: d.status,
    rejectReason: d.reject_reason,
    date: formatDateTime(d.created_at),
  };
}

function toWithdrawalRequest(w: DbWithdrawal): WithdrawalRequest {
  return {
    id: w.id,
    userId: w.user_id || "",
    name: "",
    email: "",
    amount: Number(w.amount),
    fee: Number(w.fee ?? 0),
    bank: w.bank,
    accountNumber: w.account_number,
    accountHolder: w.account_holder,
    status: w.status,
    rejectReason: w.reject_reason,
    date: formatDateTime(w.created_at),
    createdAt: w.created_at,
  };
}

export function DepositWithdrawalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: authUser, isInitialized, role } = useAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [userPoints, setUserPoints] = useState(0);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [bankProfile, setBankProfile] =
    useState<BankProfile>(defaultBankProfile);
  const [usdtKrwRate, setUsdtKrwRate] = useState(defaultUsdtKrwRate);
  const [withdrawalSettings, setWithdrawalSettings] =
    useState<WithdrawalSettings>(defaultWithdrawalSettings);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    if (!authUser) {
      setDeposits([]);
      setWithdrawals([]);
      setUserPoints(0);
      setAvailablePoints(0);
      setBankProfile(defaultBankProfile);
      setUsdtKrwRate(defaultUsdtKrwRate);
      setWithdrawalSettings(defaultWithdrawalSettings);
      setUserId(null);
      setLoading(false);
      return;
    }
    const uid = authUser.id;
    setUserId(uid);
    const isAdmin = role === "admin";

    if (!isAdmin) {
      const summary = await getWalletSummary();

      if (!summary || summary.success !== true) {
        setDeposits([]);
        setWithdrawals([]);
        setUserPoints(0);
        setAvailablePoints(0);
        setBankProfile(defaultBankProfile);
        setUsdtKrwRate(defaultUsdtKrwRate);
        setWithdrawalSettings(defaultWithdrawalSettings);
        setLoading(false);
        return;
      }

      const walletSummary = summary as WalletSummaryResponse;

      setDeposits(walletSummary.deposits.map(toDepositRequest));
      setWithdrawals(walletSummary.withdrawals.map(toWithdrawalRequest));
      setUserPoints(Number(walletSummary.userPoints ?? 0));
      setAvailablePoints(Number(walletSummary.availablePoints ?? 0));
      setBankProfile({
        bank: walletSummary.bankProfile?.bank || "",
        accountNumber: walletSummary.bankProfile?.accountNumber || "",
        accountHolder: walletSummary.bankProfile?.accountHolder || "",
      });
      setUsdtKrwRate(Number(walletSummary.usdtKrwRate ?? defaultUsdtKrwRate));
      setWithdrawalSettings(
        walletSummary.withdrawalSettings ?? defaultWithdrawalSettings,
      );
      setLoading(false);
      return;
    }

    // Admin sees ALL deposits/withdrawals; regular user sees only own
    const depQuery = supabase
      .from("deposits")
      .select("*")
      .order("created_at", { ascending: false });
    const wdQuery = supabase
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false });
    if (!isAdmin) {
      depQuery.eq("user_id", uid);
      wdQuery.eq("user_id", uid);
    }

    const [depRes, wdRes, profileRes, settingsRes] = await Promise.all([
      depQuery,
      wdQuery,
      isAdmin
        ? Promise.resolve({ data: null })
        : supabase
            .from("user_profiles")
            .select("wallet_balance, available_balance")
            .eq("id", uid)
            .maybeSingle(),
      supabase
        .from("site_settings")
        .select("key, value")
        .in("key", [
          "usdt_krw_rate",
          "withdraw_fee",
          "min_withdraw",
          "daily_max_withdraw",
          "single_max_withdraw",
        ]),
    ]);

    setDeposits(((depRes.data as DbDeposit[]) ?? []).map(toDepositRequest));
    setWithdrawals(
      ((wdRes.data as DbWithdrawal[]) ?? []).map(toWithdrawalRequest),
    );
    setUserPoints(Number(profileRes.data?.wallet_balance ?? 0));
    setAvailablePoints(
      Number(
        profileRes.data?.available_balance ??
          profileRes.data?.wallet_balance ??
          0,
      ),
    );
    setBankProfile(defaultBankProfile);
    const settingsMap = Object.fromEntries(
      (
        (settingsRes.data as Array<{ key: string; value: string }> | null) || []
      ).map((row) => [row.key, row.value]),
    );
    setUsdtKrwRate(getUsdtKrwRate(settingsMap));
    setWithdrawalSettings(getWithdrawalSettings(settingsMap));
    setLoading(false);
  }, [authUser, role]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const timer = setTimeout(() => {
      void fetchAll();
    }, 0);

    return () => clearTimeout(timer);
  }, [isInitialized, fetchAll]);

  const addDeposit = useCallback(
    async (data: {
      amount: number;
      depositorName: string;
    }): Promise<DepositRequestResult> => {
      if (!userId) {
        return {
          success: false,
          error: "로그인이 필요합니다.",
        };
      }

      const result = await requestDeposit(data);

      if (!result || result.success !== true) {
        return {
          success: false,
          error: result?.error || "입금 신청 처리에 실패했습니다.",
        };
      }

      await fetchAll();

      return {
        success: true,
      };
    },
    [userId, fetchAll],
  );

  const addWithdrawal = useCallback(
    async (data: {
      amount: number;
      bank: string;
      accountNumber: string;
      accountHolder: string;
    }): Promise<WithdrawalRequestResult> => {
      if (!userId) {
        return { success: false, error: "로그인이 필요합니다." };
      }

      const result = await requestWithdrawal(data);

      if (!result || result.success !== true) {
        return {
          success: false,
          error: result.error || "출금 신청 처리에 실패했습니다.",
        };
      }

      await fetchAll();

      return {
        success: true,
        fee: Number(result?.fee ?? 0),
        deductedAmount: Number(
          result?.deducted_amount ?? data.amount + Number(result?.fee ?? 0),
        ),
      };
    },
    [userId, fetchAll],
  );

  const approveDeposit = useCallback(
    async (id: number) => {
      const { data, error } = await processDeposit(id, "approve");

      if (error || data?.success !== true) {
        return {
          success: false,
          error:
            error?.message || data?.error || "입금 요청 처리에 실패했습니다.",
        };
      }

      await fetchAll();

      return {
        success: true,
      };
    },
    [fetchAll],
  );

  const rejectDeposit = useCallback(
    async (id: number, reason: string) => {
      const { data, error } = await processDeposit(id, "reject", reason);

      if (error || data?.success !== true) {
        return {
          success: false,
          error:
            error?.message || data?.error || "입금 요청 처리에 실패했습니다.",
        };
      }

      await fetchAll();

      return {
        success: true,
      };
    },
    [fetchAll],
  );

  const approveWithdrawal = useCallback(
    async (id: number) => {
      const { data, error } = await processWithdrawal(id, "approve");

      if (error || data?.success !== true) {
        return {
          success: false,
          error:
            error?.message || data?.error || "출금 요청 처리에 실패했습니다.",
        };
      }

      await fetchAll();

      return {
        success: true,
      };
    },
    [fetchAll],
  );

  const rejectWithdrawal = useCallback(
    async (id: number, reason: string) => {
      const { data, error } = await processWithdrawal(id, "reject", reason);

      if (error || data?.success !== true) {
        return {
          success: false,
          error:
            error?.message || data?.error || "출금 요청 처리에 실패했습니다.",
        };
      }

      await fetchAll();

      return {
        success: true,
      };
    },
    [fetchAll],
  );

  return (
    <DepositWithdrawalContext.Provider
      value={{
        deposits,
        withdrawals,
        userPoints,
        availablePoints,
        bankProfile,
        usdtKrwRate,
        withdrawalSettings,
        loading,
        addDeposit,
        addWithdrawal,
        approveDeposit,
        rejectDeposit,
        approveWithdrawal,
        rejectWithdrawal,
        refetch: fetchAll,
      }}
    >
      {children}
    </DepositWithdrawalContext.Provider>
  );
}

export function useDepositWithdrawal() {
  const ctx = useContext(DepositWithdrawalContext);
  if (!ctx) {
    throw new Error(
      "useDepositWithdrawal must be used within DepositWithdrawalProvider",
    );
  }
  return ctx;
}
