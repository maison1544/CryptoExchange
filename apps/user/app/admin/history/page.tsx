"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminSummaryCard } from "@/components/admin/ui/AdminSummaryCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminActionDropdown } from "@/components/admin/ui/AdminActionDropdown";
import { AdminConfirmModal } from "@/components/admin/ui/AdminConfirmModal";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import { Download, Search, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TradeDirectionBadge } from "@/components/ui/TradeDirectionBadge";
import { adminPointTypeConfig } from "@/lib/types/entities";
import type { AdminPointType } from "@/lib/types/entities";
import { createClient } from "@/lib/supabase/client";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import {
  getPaginationBounds,
  normalizeTotalPages,
} from "@/lib/utils/pagination";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import {
  manageFuturesPosition,
  processDeposit,
  processWithdrawal,
} from "@/lib/api/admin";
import { formatDateTime } from "@/lib/utils/formatDate";
import {
  formatDisplayNumber,
  formatKrw,
  formatUsdt,
} from "@/lib/utils/numberFormat";

const supabase = createClient();
const PAGE_SIZE = 10;

type HistoryTab = "trades" | "deposits" | "withdrawals" | "points";

interface TradeRecord {
  id: number;
  userId: string;
  userName: string;
  pair: string;
  direction: "long" | "short";
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  fee: number;
  margin: number;
  status: "closed" | "liquidated" | "open";
  openedAt: string;
  closedAt: string;
  adminActionNote?: string;
  refundProcessedAt?: string;
  refundedAmount?: number;
  refundedFee?: number;
  forcedLiquidatedAt?: string;
}

interface DepositRecord {
  id: number;
  userId: string;
  userName: string;
  partner: string;
  content: string;
  amount: number;
  method: string;
  accountInfo: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  processedAt: string;
  memo: string;
}

interface WithdrawalRecord {
  id: number;
  userId: string;
  userName: string;
  partner: string;
  content: string;
  amount: number;
  bank: string;
  account: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  processedAt: string;
  memo: string;
}

interface PointRecord {
  id: number;
  userId: string;
  userName: string;
  type: "earn" | "spend" | "admin_add" | "admin_deduct";
  amount: number;
  balance?: number | null;
  description: string;
  createdAt: string;
}

type PendingAdminAction =
  | {
      kind: "deposit";
      id: number;
      action: "approve" | "reject";
      reason: string;
      details: Array<{ label: string; value: string }>;
    }
  | {
      kind: "withdrawal";
      id: number;
      action: "approve" | "reject";
      reason: string;
      details: Array<{ label: string; value: string }>;
    }
  | {
      kind: "trade";
      id: number;
      action: "force-liquidate" | "refund-trade";
      status: TradeRecord["status"];
      details: Array<{ label: string; value: string }>;
    };

function getPendingActionTitle(action: PendingAdminAction | null) {
  if (!action) return "";

  if (action.kind === "trade") {
    return action.action === "force-liquidate"
      ? "강제청산 확인"
      : "전액 환급 확인";
  }

  if (action.kind === "deposit") {
    return action.action === "approve" ? "입금 승인 확인" : "입금 거절 확인";
  }

  return action.action === "approve" ? "출금 승인 확인" : "출금 거절 확인";
}

function getPendingActionDescription(action: PendingAdminAction | null) {
  if (!action) return "";

  if (action.kind === "trade") {
    if (action.action === "force-liquidate") {
      return action.status !== "open"
        ? "이미 종료된 거래입니다. 강제청산 처리 이력을 추가로 남길지 확인해주세요."
        : "이 거래를 강제청산 처리합니다.";
    }

    return "이 거래의 증거금과 수수료를 전액 환급합니다.";
  }

  return action.action === "approve"
    ? "선택한 요청을 승인합니다."
    : "선택한 요청을 거절합니다.";
}

function getPendingActionConfirmLabel(action: PendingAdminAction | null) {
  if (!action) return "확인";

  if (action.kind === "trade") {
    return action.action === "force-liquidate" ? "강제청산" : "환급 실행";
  }

  return action.action === "approve" ? "승인" : "거절";
}

function getPendingActionConfirmVariant(
  action: PendingAdminAction | null,
): "primary" | "secondary" | "danger" {
  if (!action) return "primary";

  if (action.action === "approve") {
    return "primary";
  }

  if (action.kind === "trade" && action.action === "refund-trade") {
    return "secondary";
  }

  return "danger";
}

type AdminTradeRow = {
  id: number;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  leverage: number | string | null;
  entry_price: number | string | null;
  exit_price: number | string | null;
  margin: number | string | null;
  pnl: number | string | null;
  fee: number | string | null;
  status: "open" | "closed" | "liquidated";
  opened_at: string | null;
  closed_at: string | null;
  admin_action_note?: string | null;
  refund_processed_at?: string | null;
  refunded_amount?: number | string | null;
  refunded_fee?: number | string | null;
  forced_liquidated_at?: string | null;
};

type AdminDepositRow = {
  id: number;
  user_id: string;
  amount: number | string | null;
  depositor_name: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  processed_at: string | null;
  reject_reason: string | null;
};

type AdminWithdrawalRow = {
  id: number;
  user_id: string;
  amount: number | string | null;
  bank_name: string | null;
  bank: string | null;
  bank_account: string | null;
  account_number: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  processed_at: string | null;
  reject_reason: string | null;
};

const TABS = [
  { id: "trades", label: "거래 내역" },
  { id: "deposits", label: "입금 내역" },
  { id: "withdrawals", label: "출금 내역" },
  { id: "points", label: "자산 내역" },
];

function formatPointAmount(point: PointRecord) {
  if (point.type === "earn" || point.type === "spend") {
    return formatUsdt(point.amount, { signed: true });
  }

  return formatKrw(point.amount, { signed: true });
}

function getPendingActionKey(action: PendingAdminAction | null) {
  if (!action) return "";

  if (action.kind === "trade") {
    return `trade-${action.id}-${action.action}`;
  }

  return `${action.kind}-${action.id}`;
}

export default function AdminHistoryPage() {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const [activeTab, setActiveTab] = useState<HistoryTab>("trades");
  const [searchTerm, setSearchTerm] = useState("");
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [points, setPoints] = useState<PointRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [summaryStats, setSummaryStats] = useState({
    totalPnl: 0,
    totalFee: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
  });
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(
    null,
  );
  const totalPages = normalizeTotalPages(totalCount, PAGE_SIZE);
  const resolvedCurrentPage = Math.min(currentPage, totalPages);

  const applyHistoryData = useCallback(
    (payload: {
      trades: TradeRecord[];
      deposits: DepositRecord[];
      withdrawals: WithdrawalRecord[];
      points: PointRecord[];
      totalCount: number;
    }) => {
      setTrades(payload.trades);
      setDeposits(payload.deposits);
      setWithdrawals(payload.withdrawals);
      setPoints(payload.points);
      setTotalCount(payload.totalCount);
    },
    [],
  );

  const fetchSummaryStats = useCallback(async () => {
    if (!isInitialized || role !== "admin") {
      return {
        totalPnl: 0,
        totalFee: 0,
        pendingDeposits: 0,
        pendingWithdrawals: 0,
      };
    }

    const [tradeStatsRes, pendingDepositsRes, pendingWithdrawalsRes] =
      await Promise.all([
        supabase.from("futures_positions").select("pnl, fee"),
        supabase
          .from("deposits")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("withdrawals")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);

    const tradeStats =
      (tradeStatsRes.data as
        | { pnl: number | string | null; fee: number | string | null }[]
        | null) ?? [];

    return {
      totalPnl: tradeStats.reduce(
        (sum, item) => sum + (Number(item.pnl) || 0),
        0,
      ),
      totalFee: tradeStats.reduce(
        (sum, item) => sum + (Number(item.fee) || 0),
        0,
      ),
      pendingDeposits: Number(pendingDepositsRes.count ?? 0),
      pendingWithdrawals: Number(pendingWithdrawalsRes.count ?? 0),
    };
  }, [isInitialized, role]);

  const fetchHistoryData = useCallback(async () => {
    if (!isInitialized || role !== "admin") {
      return {
        trades: [] as TradeRecord[],
        deposits: [] as DepositRecord[],
        withdrawals: [] as WithdrawalRecord[],
        points: [] as PointRecord[],
        totalCount: 0,
      };
    }

    const trimmedSearch = searchTerm.trim();
    const { from, to } = getPaginationBounds(resolvedCurrentPage, PAGE_SIZE);
    const pageWindowSize = resolvedCurrentPage * PAGE_SIZE;

    let matchedUserIds: string[] | null = null;
    if (trimmedSearch) {
      const { data: matchedUsers } = await supabase
        .from("user_profiles")
        .select("id")
        .or(`email.ilike.%${trimmedSearch}%,name.ilike.%${trimmedSearch}%`);
      matchedUserIds = ((matchedUsers as { id: string }[] | null) ?? [])
        .map((item) => item.id)
        .filter(Boolean);
    }

    const getUserProfiles = async (userIds: string[]) => {
      const validUserIds = [...new Set(userIds.filter(Boolean))];
      if (validUserIds.length === 0) {
        return [] as UserDisplayProfile[];
      }
      const { data } = await supabase
        .from("user_profiles")
        .select("id, name, email")
        .in("id", validUserIds);
      return (data as UserDisplayProfile[] | null) ?? [];
    };

    const mapTrades = (
      rows: AdminTradeRow[],
      emailById: Record<string, string>,
      nameById: Record<string, string>,
    ) =>
      rows.map((item) => ({
        id: item.id,
        userId: emailById[item.user_id] || "-",
        userName: nameById[item.user_id] || "-",
        pair: item.symbol.replace("USDT", "/USDT"),
        direction: item.direction,
        leverage: Number(item.leverage),
        entryPrice: Number(item.entry_price),
        exitPrice: Number(item.exit_price) || 0,
        margin: Number(item.margin) || 0,
        pnl: Number(item.pnl) || 0,
        fee: Number(item.fee) || 0,
        status: item.status,
        openedAt: formatDateTime(item.opened_at),
        closedAt: formatDateTime(item.closed_at),
        adminActionNote: item.admin_action_note || "",
        refundProcessedAt: item.refund_processed_at || "",
        refundedAmount: Number(item.refunded_amount) || 0,
        refundedFee: Number(item.refunded_fee) || 0,
        forcedLiquidatedAt: item.forced_liquidated_at || "",
      }));

    const mapDeposits = (
      rows: AdminDepositRow[],
      emailById: Record<string, string>,
      nameById: Record<string, string>,
    ) =>
      rows.map((item) => ({
        id: item.id,
        userId: emailById[item.user_id] || "-",
        userName: nameById[item.user_id] || "-",
        partner: "-",
        content: "KRW 입금",
        method: "무통장입금",
        amount: Number(item.amount),
        accountInfo: item.depositor_name || "-",
        status: item.status,
        createdAt: formatDateTime(item.created_at),
        processedAt: formatDateTime(item.processed_at),
        memo: item.reject_reason || "",
      }));

    const mapWithdrawals = (
      rows: AdminWithdrawalRow[],
      emailById: Record<string, string>,
      nameById: Record<string, string>,
    ) =>
      rows.map((item) => ({
        id: item.id,
        userId: emailById[item.user_id] || "-",
        userName: nameById[item.user_id] || "-",
        partner: "-",
        content: "KRW 출금",
        amount: Number(item.amount),
        bank: item.bank_name || item.bank || "-",
        account: item.bank_account || item.account_number || "-",
        status: item.status,
        createdAt: formatDateTime(item.created_at),
        processedAt: formatDateTime(item.processed_at),
        memo: item.reject_reason || "",
      }));

    if (activeTab === "trades") {
      let query = supabase
        .from("futures_positions")
        .select("*", { count: "exact" })
        .order("opened_at", { ascending: false });

      if (trimmedSearch) {
        if (matchedUserIds && matchedUserIds.length > 0) {
          query = query.or(
            `symbol.ilike.%${trimmedSearch}%,user_id.in.(${matchedUserIds.join(",")})`,
          );
        } else {
          query = query.ilike("symbol", `%${trimmedSearch}%`);
        }
      }

      const { data, count } = await query.range(from, to);
      const rows = (data as AdminTradeRow[] | null) ?? [];
      const profiles = await getUserProfiles(rows.map((item) => item.user_id));
      const { emailById, nameById } = createUserDisplayMaps(profiles);

      return {
        trades: mapTrades(rows, emailById, nameById),
        deposits: [] as DepositRecord[],
        withdrawals: [] as WithdrawalRecord[],
        points: [] as PointRecord[],
        totalCount: Number(count ?? 0),
      };
    }

    if (activeTab === "deposits") {
      let query = supabase
        .from("deposits")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (trimmedSearch) {
        if (matchedUserIds && matchedUserIds.length > 0) {
          query = query.or(
            `depositor_name.ilike.%${trimmedSearch}%,user_id.in.(${matchedUserIds.join(",")})`,
          );
        } else {
          query = query.ilike("depositor_name", `%${trimmedSearch}%`);
        }
      }

      const { data, count } = await query.range(from, to);
      const rows = (data as AdminDepositRow[] | null) ?? [];
      const profiles = await getUserProfiles(rows.map((item) => item.user_id));
      const { emailById, nameById } = createUserDisplayMaps(profiles);

      return {
        trades: [] as TradeRecord[],
        deposits: mapDeposits(rows, emailById, nameById),
        withdrawals: [] as WithdrawalRecord[],
        points: [] as PointRecord[],
        totalCount: Number(count ?? 0),
      };
    }

    if (activeTab === "withdrawals") {
      let query = supabase
        .from("withdrawals")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (trimmedSearch) {
        if (matchedUserIds && matchedUserIds.length > 0) {
          query = query.or(
            `bank_name.ilike.%${trimmedSearch}%,bank.ilike.%${trimmedSearch}%,bank_account.ilike.%${trimmedSearch}%,account_number.ilike.%${trimmedSearch}%,user_id.in.(${matchedUserIds.join(",")})`,
          );
        } else {
          query = query.or(
            `bank_name.ilike.%${trimmedSearch}%,bank.ilike.%${trimmedSearch}%,bank_account.ilike.%${trimmedSearch}%,account_number.ilike.%${trimmedSearch}%`,
          );
        }
      }

      const { data, count } = await query.range(from, to);
      const rows = (data as AdminWithdrawalRow[] | null) ?? [];
      const profiles = await getUserProfiles(rows.map((item) => item.user_id));
      const { emailById, nameById } = createUserDisplayMaps(profiles);

      return {
        trades: [] as TradeRecord[],
        deposits: [] as DepositRecord[],
        withdrawals: mapWithdrawals(rows, emailById, nameById),
        points: [] as PointRecord[],
        totalCount: Number(count ?? 0),
      };
    }

    let tradeQuery = supabase
      .from("futures_positions")
      .select("*", { count: "exact" })
      .in("status", ["closed", "liquidated"])
      .order("closed_at", { ascending: false });
    let depositQuery = supabase
      .from("deposits")
      .select("*", { count: "exact" })
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    let withdrawalQuery = supabase
      .from("withdrawals")
      .select("*", { count: "exact" })
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (trimmedSearch) {
      if (matchedUserIds && matchedUserIds.length > 0) {
        tradeQuery = tradeQuery.or(
          `symbol.ilike.%${trimmedSearch}%,user_id.in.(${matchedUserIds.join(",")})`,
        );
        depositQuery = depositQuery.or(
          `depositor_name.ilike.%${trimmedSearch}%,user_id.in.(${matchedUserIds.join(",")})`,
        );
        withdrawalQuery = withdrawalQuery.or(
          `bank_name.ilike.%${trimmedSearch}%,bank.ilike.%${trimmedSearch}%,bank_account.ilike.%${trimmedSearch}%,account_number.ilike.%${trimmedSearch}%,user_id.in.(${matchedUserIds.join(",")})`,
        );
      } else {
        tradeQuery = tradeQuery.ilike("symbol", `%${trimmedSearch}%`);
        depositQuery = depositQuery.ilike(
          "depositor_name",
          `%${trimmedSearch}%`,
        );
        withdrawalQuery = withdrawalQuery.or(
          `bank_name.ilike.%${trimmedSearch}%,bank.ilike.%${trimmedSearch}%,bank_account.ilike.%${trimmedSearch}%,account_number.ilike.%${trimmedSearch}%`,
        );
      }
    }

    const [tradeRes, depositRes, withdrawalRes] = await Promise.all([
      tradeQuery.range(0, pageWindowSize - 1),
      depositQuery.range(0, pageWindowSize - 1),
      withdrawalQuery.range(0, pageWindowSize - 1),
    ]);

    const tradeRows = (tradeRes.data as AdminTradeRow[] | null) ?? [];
    const depositRows = (depositRes.data as AdminDepositRow[] | null) ?? [];
    const withdrawalRows =
      (withdrawalRes.data as AdminWithdrawalRow[] | null) ?? [];
    const profiles = await getUserProfiles([
      ...tradeRows.map((item) => item.user_id),
      ...depositRows.map((item) => item.user_id),
      ...withdrawalRows.map((item) => item.user_id),
    ]);
    const { emailById, nameById } = createUserDisplayMaps(profiles);
    const tradePoints = mapTrades(tradeRows, emailById, nameById)
      .filter((item) => item.status !== "open")
      .map((item) => ({
        id: Number(`3${item.id}`),
        userId: item.userId,
        userName: item.userName,
        type: item.pnl >= 0 ? ("earn" as const) : ("spend" as const),
        amount: item.pnl - item.fee,
        balance: null,
        description: `${item.pair} ${item.direction === "long" ? "롱" : "숏"} 정산`,
        createdAt: item.closedAt === "-" ? item.openedAt : item.closedAt,
      }));
    const depositPoints = mapDeposits(depositRows, emailById, nameById).map(
      (item) => ({
        id: Number(`1${item.id}`),
        userId: item.userId,
        userName: item.userName,
        type: "admin_add" as const,
        amount: item.amount,
        balance: null,
        description: `입금 승인 (${item.accountInfo})`,
        createdAt: item.createdAt,
      }),
    );
    const withdrawalPoints = mapWithdrawals(
      withdrawalRows,
      emailById,
      nameById,
    ).map((item) => ({
      id: Number(`2${item.id}`),
      userId: item.userId,
      userName: item.userName,
      type: "admin_deduct" as const,
      amount: -item.amount,
      balance: null,
      description: `출금 완료 (${item.bank} / ${item.account})`,
      createdAt: item.createdAt,
    }));
    const mergedPoints = [...depositPoints, ...withdrawalPoints, ...tradePoints]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(from, to + 1);

    return {
      trades: [] as TradeRecord[],
      deposits: [] as DepositRecord[],
      withdrawals: [] as WithdrawalRecord[],
      points: mergedPoints,
      totalCount:
        Number(tradeRes.count ?? 0) +
        Number(depositRes.count ?? 0) +
        Number(withdrawalRes.count ?? 0),
    };
  }, [activeTab, isInitialized, resolvedCurrentPage, role, searchTerm]);

  useEffect(() => {
    void fetchHistoryData().then(applyHistoryData);
  }, [applyHistoryData, fetchHistoryData]);

  useEffect(() => {
    void fetchSummaryStats().then(setSummaryStats);
  }, [fetchSummaryStats]);

  const handleDepositAction = useCallback(
    async (depositId: number, action: "approve" | "reject", reason = "") => {
      const normalizedReason = reason.trim();

      if (action === "reject" && !normalizedReason) {
        return;
      }

      setProcessingId(`deposit-${depositId}`);

      const { data, error } = await processDeposit(
        depositId,
        action,
        normalizedReason,
      );

      if (error || data?.success === false) {
        addToast({
          title: "처리 실패",
          message:
            error?.message ?? data?.error ?? "입금 요청 처리에 실패했습니다.",
          type: "error",
        });
      } else {
        addToast({
          title: "처리 완료",
          message:
            action === "approve"
              ? "입금 요청을 승인했습니다."
              : "입금 요청을 거절했습니다.",
          type: "success",
        });
        const [historyData, nextSummaryStats] = await Promise.all([
          fetchHistoryData(),
          fetchSummaryStats(),
        ]);
        applyHistoryData(historyData);
        setSummaryStats(nextSummaryStats);
        setPendingAction(null);
      }

      setProcessingId("");
    },
    [addToast, applyHistoryData, fetchHistoryData, fetchSummaryStats],
  );

  const handleWithdrawalAction = useCallback(
    async (withdrawalId: number, action: "approve" | "reject", reason = "") => {
      const normalizedReason = reason.trim();

      if (action === "reject" && !normalizedReason) {
        return;
      }

      setProcessingId(`withdrawal-${withdrawalId}`);

      const { data, error } = await processWithdrawal(
        withdrawalId,
        action,
        normalizedReason,
      );

      if (error || data?.success === false) {
        addToast({
          title: "처리 실패",
          message:
            error?.message ?? data?.error ?? "출금 요청 처리에 실패했습니다.",
          type: "error",
        });
      } else {
        addToast({
          title: "처리 완료",
          message:
            action === "approve"
              ? "출금 요청을 승인했습니다."
              : "출금 요청을 거절했습니다.",
          type: "success",
        });
        const [historyData, nextSummaryStats] = await Promise.all([
          fetchHistoryData(),
          fetchSummaryStats(),
        ]);
        applyHistoryData(historyData);
        setSummaryStats(nextSummaryStats);
        setPendingAction(null);
      }

      setProcessingId("");
    },
    [addToast, applyHistoryData, fetchHistoryData, fetchSummaryStats],
  );

  const handleTradeAction = useCallback(
    async (tradeId: number, action: "force-liquidate" | "refund-trade") => {
      setProcessingId(`trade-${tradeId}-${action}`);

      const result = await manageFuturesPosition(tradeId, action);

      if (!result?.success) {
        addToast({
          title: "거래 관리 실패",
          message: result?.error || "거래 관리 작업을 처리하지 못했습니다.",
          type: "error",
        });
      } else {
        addToast({
          title: "거래 관리 완료",
          message:
            result?.message ||
            (action === "force-liquidate"
              ? "포지션을 강제청산했습니다."
              : "담보금과 수수료를 환급했습니다."),
          type: "success",
        });
        const [historyData, nextSummaryStats] = await Promise.all([
          fetchHistoryData(),
          fetchSummaryStats(),
        ]);
        applyHistoryData(historyData);
        setSummaryStats(nextSummaryStats);
        setPendingAction(null);
      }

      setProcessingId("");
    },
    [addToast, applyHistoryData, fetchHistoryData, fetchSummaryStats],
  );

  const openDepositAction = useCallback(
    (deposit: DepositRecord, action: "approve" | "reject") => {
      setPendingAction({
        kind: "deposit",
        id: deposit.id,
        action,
        reason: "",
        details: [
          { label: "회원", value: `${deposit.userName} (${deposit.userId})` },
          { label: "금액", value: formatKrw(deposit.amount) },
          { label: "계좌정보", value: deposit.accountInfo || "-" },
        ],
      });
    },
    [],
  );

  const openWithdrawalAction = useCallback(
    (withdrawal: WithdrawalRecord, action: "approve" | "reject") => {
      setPendingAction({
        kind: "withdrawal",
        id: withdrawal.id,
        action,
        reason: "",
        details: [
          {
            label: "회원",
            value: `${withdrawal.userName} (${withdrawal.userId})`,
          },
          { label: "금액", value: formatKrw(withdrawal.amount) },
          {
            label: "계좌",
            value: `${withdrawal.bank} / ${withdrawal.account}`,
          },
        ],
      });
    },
    [],
  );

  const openTradeAction = useCallback(
    (trade: TradeRecord, action: "force-liquidate" | "refund-trade") => {
      setPendingAction({
        kind: "trade",
        id: trade.id,
        action,
        status: trade.status,
        details: [
          { label: "회원", value: `${trade.userName} (${trade.userId})` },
          { label: "페어", value: trade.pair },
          { label: "증거금", value: formatUsdt(trade.margin) },
          { label: "수수료", value: formatUsdt(trade.fee) },
          {
            label: action === "refund-trade" ? "환급 예정" : "현재 상태",
            value:
              action === "refund-trade"
                ? formatUsdt((trade.margin || 0) + (trade.fee || 0))
                : trade.status,
          },
        ],
      });
    },
    [],
  );

  const submitPendingAction = useCallback(async () => {
    if (!pendingAction) return;

    if (
      (pendingAction.kind === "deposit" ||
        pendingAction.kind === "withdrawal") &&
      pendingAction.action === "reject" &&
      !pendingAction.reason.trim()
    ) {
      addToast({
        title: "사유 입력 필요",
        message: "거절 사유를 입력해주세요.",
        type: "error",
      });
      return;
    }

    if (pendingAction.kind === "deposit") {
      await handleDepositAction(
        pendingAction.id,
        pendingAction.action,
        pendingAction.reason,
      );
      return;
    }

    if (pendingAction.kind === "withdrawal") {
      await handleWithdrawalAction(
        pendingAction.id,
        pendingAction.action,
        pendingAction.reason,
      );
      return;
    }

    await handleTradeAction(pendingAction.id, pendingAction.action);
  }, [
    addToast,
    handleDepositAction,
    handleTradeAction,
    handleWithdrawalAction,
    pendingAction,
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <AdminPageHeader
        title="거래/결제 내역"
        description="전체 회원의 거래, 입출금, 자산 내역을 조회합니다."
      >
        <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors flex items-center gap-1.5">
          <Download size={14} />
          CSV 내보내기
        </button>
      </AdminPageHeader>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AdminSummaryCard
          label="총 거래 손익"
          value={formatUsdt(summaryStats.totalPnl, { signed: true })}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="총 수수료 수익"
          value={formatUsdt(summaryStats.totalFee)}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="입금 대기"
          value={`${summaryStats.pendingDeposits}건`}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="출금 대기"
          value={`${summaryStats.pendingWithdrawals}건`}
          valueClassName="text-lg font-bold text-white"
        />
      </div>

      <AdminTabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={(id) => {
          setActiveTab(id as HistoryTab);
          setCurrentPage(1);
        }}
      />

      {/* 검색 */}
      <div className="relative max-w-sm">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="회원명 또는 이메일 검색..."
          className="w-full bg-[#111827] border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-gray-700 placeholder-gray-600"
        />
      </div>

      {/* 테이블 */}
      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="scrollbar-hide overflow-x-auto">
          {activeTab === "trades" && (
            <AdminTable
              headers={[
                "시간",
                "회원",
                "페어",
                "방향",
                "배율",
                "진입가",
                "청산가",
                "손익",
                "수수료",
                "마진",
                "상태",
                "관리",
              ]}
            >
              {trades.map((t) => (
                <AdminTableRow key={t.id}>
                  <AdminTableCell className="text-xs whitespace-nowrap text-gray-400">
                    {t.openedAt}
                  </AdminTableCell>
                  <AdminTableCell>
                    <div className="text-white text-xs font-medium">
                      {t.userName}
                    </div>
                    <div className="text-[10px] text-gray-500">{t.userId}</div>
                  </AdminTableCell>
                  <AdminTableCell className="text-white font-medium">
                    {t.pair}
                  </AdminTableCell>
                  <AdminTableCell>
                    <TradeDirectionBadge direction={t.direction} />
                  </AdminTableCell>
                  <AdminTableCell className="text-yellow-500 text-xs">
                    {t.leverage}x
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-300 text-xs">
                    {formatDisplayNumber(t.entryPrice, {
                      maximumFractionDigits: 6,
                    })}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-300 text-xs">
                    {t.exitPrice === 0
                      ? "-"
                      : formatDisplayNumber(t.exitPrice, {
                          maximumFractionDigits: 6,
                        })}
                  </AdminTableCell>
                  <AdminTableCell
                    className={`text-xs font-medium ${t.pnl > 0 ? "text-green-400" : t.pnl < 0 ? "text-red-400" : "text-gray-400"}`}
                  >
                    {formatUsdt(t.pnl, { signed: true })}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs">
                    {formatUsdt(t.fee)}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {t.margin > 0 ? formatUsdt(t.margin) : "-"}
                  </AdminTableCell>
                  <AdminTableCell>
                    <StatusBadge status={t.status} />
                  </AdminTableCell>
                  <AdminTableCell className="text-xs">
                    <div className="flex min-w-30 flex-col gap-1">
                      <AdminActionDropdown
                        options={[
                          {
                            label: "전액 환급",
                            onSelect: () => openTradeAction(t, "refund-trade"),
                            tone: "success",
                            disabled:
                              Boolean(t.refundProcessedAt) ||
                              processingId === `trade-${t.id}-refund-trade`,
                          },
                          {
                            label: "강제청산",
                            onSelect: () =>
                              openTradeAction(t, "force-liquidate"),
                            tone: "danger",
                            disabled:
                              Boolean(t.forcedLiquidatedAt) ||
                              processingId === `trade-${t.id}-force-liquidate`,
                          },
                        ]}
                      />
                      {t.refundProcessedAt ? (
                        <span className="text-emerald-400">
                          환급 완료
                          {t.refundedAmount || t.refundedFee
                            ? ` (${formatUsdt(
                                Number(t.refundedAmount || 0) +
                                  Number(t.refundedFee || 0),
                              )})`
                            : ""}
                        </span>
                      ) : null}
                      {t.forcedLiquidatedAt ? (
                        <span className="text-red-400">강제청산 완료</span>
                      ) : null}
                      {t.adminActionNote ? (
                        <span className="text-[10px] text-gray-500">
                          {t.adminActionNote}
                        </span>
                      ) : null}
                    </div>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
          )}

          {activeTab === "deposits" && (
            <AdminTable
              headers={[
                "신청일시",
                "이메일",
                "이름",
                "파트너",
                "내용",
                "금액",
                "계좌정보",
                "상태",
                "처리시간",
                "메모",
                "관리",
              ]}
            >
              {deposits.map((d) => (
                <AdminTableRow key={d.id}>
                  <AdminTableCell className="text-xs whitespace-nowrap text-gray-400">
                    {d.createdAt}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {d.userId}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-white font-medium">
                    {d.userName}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-400">
                    {d.partner}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {d.content}
                  </AdminTableCell>
                  <AdminTableCell className="text-green-400 font-medium text-xs">
                    <span className="flex items-center gap-1">
                      <ArrowDownCircle size={12} />
                      {formatKrw(d.amount, { signed: true })}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {d.accountInfo}
                  </AdminTableCell>
                  <AdminTableCell>
                    <StatusBadge status={d.status} />
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs whitespace-nowrap">
                    {d.processedAt}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs">
                    {d.memo || "-"}
                  </AdminTableCell>
                  <AdminTableCell>
                    {d.status === "pending" && (
                      <AdminActionDropdown
                        disabled={processingId === `deposit-${d.id}`}
                        options={[
                          {
                            label: "승인",
                            onSelect: () => openDepositAction(d, "approve"),
                            tone: "success",
                          },
                          {
                            label: "거절",
                            onSelect: () => openDepositAction(d, "reject"),
                            tone: "danger",
                          },
                        ]}
                      />
                    )}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
          )}

          {activeTab === "withdrawals" && (
            <AdminTable
              headers={[
                "신청일시",
                "이메일",
                "이름",
                "파트너",
                "내용",
                "금액",
                "계좌정보",
                "상태",
                "처리시간",
                "메모",
                "관리",
              ]}
            >
              {withdrawals.map((w) => (
                <AdminTableRow key={w.id}>
                  <AdminTableCell className="text-xs whitespace-nowrap text-gray-400">
                    {w.createdAt}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {w.userId}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-white font-medium">
                    {w.userName}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-400">
                    {w.partner}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {w.content}
                  </AdminTableCell>
                  <AdminTableCell className="text-red-400 font-medium text-xs">
                    <span className="flex items-center gap-1">
                      <ArrowUpCircle size={12} />
                      {formatKrw(-w.amount)}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {w.bank} / {w.account}
                  </AdminTableCell>
                  <AdminTableCell>
                    <StatusBadge status={w.status} />
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs whitespace-nowrap">
                    {w.processedAt}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs">
                    {w.memo || "-"}
                  </AdminTableCell>
                  <AdminTableCell>
                    {w.status === "pending" && (
                      <AdminActionDropdown
                        disabled={processingId === `withdrawal-${w.id}`}
                        options={[
                          {
                            label: "승인",
                            onSelect: () => openWithdrawalAction(w, "approve"),
                            tone: "success",
                          },
                          {
                            label: "거절",
                            onSelect: () => openWithdrawalAction(w, "reject"),
                            tone: "danger",
                          },
                        ]}
                      />
                    )}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
          )}

          {activeTab === "points" && (
            <AdminTable
              headers={["시간", "회원", "유형", "금액", "잔액", "설명"]}
            >
              {points.map((p) => (
                <AdminTableRow key={p.id}>
                  <AdminTableCell className="text-xs whitespace-nowrap text-gray-400">
                    {p.createdAt}
                  </AdminTableCell>
                  <AdminTableCell>
                    <div className="text-white text-xs font-medium">
                      {p.userName}
                    </div>
                    <div className="text-[10px] text-gray-500">{p.userId}</div>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        p.type === "earn"
                          ? "bg-green-500/10 text-green-400"
                          : p.type === "spend"
                            ? "bg-red-500/10 text-red-400"
                            : p.type === "admin_add"
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-orange-500/10 text-orange-400"
                      }`}
                    >
                      {adminPointTypeConfig[p.type as AdminPointType].label}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell
                    className={`font-medium ${adminPointTypeConfig[p.type as AdminPointType].color}`}
                  >
                    {formatPointAmount(p)}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-300">
                    {p.balance == null ? "-" : formatDisplayNumber(p.balance)}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs">
                    {p.description}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
          )}
        </div>
        <AdminPagination
          currentPage={resolvedCurrentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          className="px-4 pb-4"
        />
      </div>
      <AdminConfirmModal
        isOpen={!!pendingAction}
        onClose={() => {
          if (!processingId) {
            setPendingAction(null);
          }
        }}
        title={getPendingActionTitle(pendingAction)}
        description={getPendingActionDescription(pendingAction)}
        details={pendingAction?.details ?? []}
        confirmLabel={getPendingActionConfirmLabel(pendingAction)}
        confirmVariant={getPendingActionConfirmVariant(pendingAction)}
        isProcessing={processingId === getPendingActionKey(pendingAction)}
        onConfirm={() => {
          void submitPendingAction();
        }}
      >
        {pendingAction &&
        pendingAction.kind !== "trade" &&
        pendingAction.action === "reject" ? (
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">거절 사유</label>
            <input
              value={pendingAction.reason}
              onChange={(e) =>
                setPendingAction((current) => {
                  if (!current || current.kind === "trade") {
                    return current;
                  }

                  return {
                    ...current,
                    reason: e.target.value,
                  };
                })
              }
              placeholder="거절 사유를 입력하세요"
              className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
            />
          </div>
        ) : null}
      </AdminConfirmModal>
    </div>
  );
}
