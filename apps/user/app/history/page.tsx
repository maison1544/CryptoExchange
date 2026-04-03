"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, Search, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import {
  formatDisplayNumber,
  formatKrw,
  formatUsdt,
} from "@/lib/utils/numberFormat";
import { formatDateTime } from "@/lib/utils/formatDate";

const supabase = createClient();

type HistoryTab = "trade" | "deposit" | "withdrawal" | "point";

interface TradeRecord {
  id: number;
  pair: string;
  side: "long" | "short";
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  amount: number;
  pnl: number;
  fee: number;
  time: string;
  status: "closed" | "liquidated";
}

interface DepositRecord {
  id: number;
  amount: number;
  depositor: string;
  status: "pending" | "approved" | "rejected";
  time: string;
  reason?: string;
}

interface WithdrawalRecord {
  id: number;
  amount: number;
  bank: string;
  account: string;
  status: "pending" | "approved" | "rejected";
  time: string;
  reason?: string;
}

interface PointRecord {
  id: number;
  type: "charge" | "use" | "bonus" | "refund";
  description: string;
  amount: number;
  balance?: number | null;
  time: string;
}

type FuturesPositionRow = {
  id: number;
  symbol: string;
  direction: "long" | "short";
  leverage: number | string | null;
  entry_price: number | string | null;
  exit_price: number | string | null;
  size: number | string | null;
  pnl: number | string | null;
  fee: number | string | null;
  closed_at: string | null;
  status: "closed" | "liquidated";
};

type DepositRow = {
  id: number;
  amount: number | string | null;
  depositor_name: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reject_reason: string | null;
};

type WithdrawalRow = {
  id: number;
  amount: number | string | null;
  bank: string | null;
  account_number: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reject_reason: string | null;
};

const pointTypeConfig = {
  charge: { label: "충전", color: "text-blue-400" },
  use: { label: "사용", color: "text-red-400" },
  bonus: { label: "보너스", color: "text-purple-400" },
  refund: { label: "정산", color: "text-green-400" },
};

function formatTradePrice(value: number) {
  if (value >= 1000) {
    return formatDisplayNumber(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (value >= 1) {
    return formatDisplayNumber(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  return formatDisplayNumber(value, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

export default function HistoryPage() {
  const { isLoggedIn, user } = useAuth();
  const [activeTab, setActiveTab] = useState<HistoryTab>("trade");
  const [searchTerm, setSearchTerm] = useState("");
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("futures_positions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["closed", "liquidated"])
      .order("closed_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        setTrades(
          (data as FuturesPositionRow[]).map((p) => ({
            id: p.id,
            pair: p.symbol.replace("USDT", "/USDT"),
            side:
              p.direction === "long" ? ("long" as const) : ("short" as const),
            leverage: Number(p.leverage),
            entryPrice: Number(p.entry_price),
            exitPrice: Number(p.exit_price) || Number(p.entry_price),
            amount: Number(p.size),
            pnl: Number(p.pnl) || 0,
            fee: Number(p.fee) || 0,
            time: formatDateTime(p.closed_at),
            status: p.status as "closed" | "liquidated",
          })),
        );
      });

    supabase
      .from("deposits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        setDeposits(
          (data as DepositRow[]).map((d) => ({
            id: d.id,
            amount: Number(d.amount),
            depositor: d.depositor_name || "-",
            status: d.status,
            time: formatDateTime(d.created_at),
            reason: d.reject_reason ?? undefined,
          })),
        );
      });

    supabase
      .from("withdrawals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        setWithdrawals(
          (data as WithdrawalRow[]).map((w) => ({
            id: w.id,
            amount: Number(w.amount),
            bank: w.bank || "-",
            account: w.account_number || "-",
            status: w.status,
            time: formatDateTime(w.created_at),
            reason: w.reject_reason ?? undefined,
          })),
        );
      });
  }, [user]);

  const points = useMemo<PointRecord[]>(() => {
    if (!user) return [];

    return [
      ...deposits
        .filter((item) => item.status === "approved")
        .map((item) => ({
          id: Number(`1${item.id}`),
          type: "charge" as const,
          description: `입금 승인 (${item.depositor})`,
          amount: item.amount,
          balance: null,
          time: item.time,
        })),
      ...withdrawals
        .filter((item) => item.status === "approved")
        .map((item) => ({
          id: Number(`2${item.id}`),
          type: "use" as const,
          description: `출금 완료 (${item.bank} ${item.account})`,
          amount: -item.amount,
          balance: null,
          time: item.time,
        })),
      ...trades.map((item) => ({
        id: Number(`3${item.id}`),
        type: "refund" as const,
        description: `${item.pair} ${item.side === "long" ? "롱" : "숏"} 정산`,
        amount: item.pnl - item.fee,
        balance: null,
        time: item.time,
      })),
    ].sort((a, b) => b.time.localeCompare(a.time));
  }, [deposits, trades, user, withdrawals]);

  const tradeSummary = useMemo(() => {
    if (!user) {
      return {
        totalPnl: 0,
        totalFee: 0,
        winRate: 0,
        totalTrades: 0,
      };
    }

    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const totalFee = trades.reduce((s, t) => s + t.fee, 0);
    const wins = trades.filter((t) => t.pnl > 0).length;
    return {
      totalPnl,
      totalFee,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      totalTrades: trades.length,
    };
  }, [trades, user]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredTrades = useMemo(() => {
    if (!user) return [];

    return trades.filter(
      (item) =>
        !normalizedSearch ||
        item.pair.toLowerCase().includes(normalizedSearch) ||
        item.time.toLowerCase().includes(normalizedSearch),
    );
  }, [normalizedSearch, trades, user]);

  const filteredDeposits = useMemo(() => {
    if (!user) return [];

    return deposits.filter(
      (item) =>
        !normalizedSearch ||
        item.depositor.toLowerCase().includes(normalizedSearch) ||
        item.time.toLowerCase().includes(normalizedSearch),
    );
  }, [deposits, normalizedSearch, user]);

  const filteredWithdrawals = useMemo(() => {
    if (!user) return [];

    return withdrawals.filter(
      (item) =>
        !normalizedSearch ||
        item.bank.toLowerCase().includes(normalizedSearch) ||
        item.account.toLowerCase().includes(normalizedSearch) ||
        item.time.toLowerCase().includes(normalizedSearch),
    );
  }, [normalizedSearch, user, withdrawals]);

  const filteredPoints = useMemo(
    () =>
      points.filter(
        (item) =>
          !normalizedSearch ||
          item.description.toLowerCase().includes(normalizedSearch) ||
          item.time.toLowerCase().includes(normalizedSearch),
      ),
    [normalizedSearch, points],
  );

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-y-auto bg-background p-6 lg:p-8 text-sm">
        <div className="max-w-6xl mx-auto w-full space-y-6 pb-10 relative">
          {!isLoggedIn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 rounded-xl">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Lock size={24} className="text-gray-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                로그인이 필요합니다
              </h2>
              <p className="text-gray-400 mb-6">
                거래 내역을 확인하려면 로그인하세요.
              </p>
              <button
                onClick={() => (window.location.href = "/login")}
                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-colors"
              >
                로그인
              </button>
            </div>
          )}

          <h1 className="text-2xl font-semibold text-white">거래 내역</h1>

          {/* Summary Cards */}
          {activeTab === "trade" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">총 거래</div>
                <div className="text-lg text-white font-bold">
                  {tradeSummary.totalTrades}건
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">총 손익</div>
                <div
                  className={cn(
                    "text-lg font-bold",
                    tradeSummary.totalPnl >= 0
                      ? "text-green-400"
                      : "text-red-400",
                  )}
                >
                  {formatUsdt(tradeSummary.totalPnl, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    signed: true,
                  })}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">승률</div>
                <div className="text-lg text-yellow-500 font-bold">
                  {formatDisplayNumber(tradeSummary.winRate, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  %
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">총 수수료</div>
                <div className="text-lg text-gray-300 font-bold">
                  {formatUsdt(tradeSummary.totalFee, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-800">
            {(
              [
                { key: "trade", label: "거래 내역" },
                { key: "deposit", label: "입금 내역" },
                { key: "withdrawal", label: "출금 내역" },
                { key: "point", label: "자산 내역" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === tab.key
                    ? "border-yellow-500 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="검색어를 입력하세요"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-gray-700 placeholder-gray-600"
            />
          </div>

          {/* Trade History */}
          {activeTab === "trade" && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-gray-400 bg-gray-800/50 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">시간</th>
                    <th className="px-4 py-3 text-left font-medium">페어</th>
                    <th className="px-4 py-3 text-center font-medium">방향</th>
                    <th className="px-4 py-3 text-right font-medium">
                      레버리지
                    </th>
                    <th className="px-4 py-3 text-right font-medium">진입가</th>
                    <th className="px-4 py-3 text-right font-medium">청산가</th>
                    <th className="px-4 py-3 text-right font-medium">손익</th>
                    <th className="px-4 py-3 text-right font-medium">수수료</th>
                    <th className="px-4 py-3 text-center font-medium">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredTrades.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-800/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {t.time}
                      </td>
                      <td className="px-4 py-3 text-white font-medium">
                        {t.pair}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium",
                            t.side === "long"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-red-500/10 text-red-400",
                          )}
                        >
                          {t.side === "long" ? (
                            <ArrowUpRight size={10} />
                          ) : (
                            <ArrowDownRight size={10} />
                          )}
                          {t.side === "long" ? "롱" : "숏"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-yellow-500">
                        {t.leverage}x
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {formatTradePrice(t.entryPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {formatTradePrice(t.exitPrice)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-medium",
                          t.pnl >= 0 ? "text-green-400" : "text-red-400",
                        )}
                      >
                        {formatUsdt(t.pnl, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          signed: true,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {formatDisplayNumber(t.fee, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded",
                            t.status === "closed"
                              ? "bg-gray-800 text-gray-400"
                              : "bg-red-500/10 text-red-400",
                          )}
                        >
                          {t.status === "closed" ? "종료" : "청산"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Deposit History */}
          {activeTab === "deposit" && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-gray-400 bg-gray-800/50 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">시간</th>
                    <th className="px-4 py-3 text-right font-medium">금액</th>
                    <th className="px-4 py-3 text-left font-medium">입금자</th>
                    <th className="px-4 py-3 text-center font-medium">상태</th>
                    <th className="px-4 py-3 text-left font-medium">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredDeposits.map((d) => (
                    <tr
                      key={d.id}
                      className="hover:bg-gray-800/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400">{d.time}</td>
                      <td className="px-4 py-3 text-right text-green-400 font-medium">
                        {formatKrw(d.amount, {
                          signed: true,
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{d.depositor}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn("text-xs px-2 py-0.5 rounded", {
                            "bg-yellow-500/10 text-yellow-400":
                              d.status === "pending",
                            "bg-green-500/10 text-green-400":
                              d.status === "approved",
                            "bg-red-500/10 text-red-400":
                              d.status === "rejected",
                          })}
                        >
                          {d.status === "pending"
                            ? "대기"
                            : d.status === "approved"
                              ? "완료"
                              : "거절"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-red-400 text-xs">
                        {d.reason || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Withdrawal History */}
          {activeTab === "withdrawal" && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-gray-400 bg-gray-800/50 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">시간</th>
                    <th className="px-4 py-3 text-right font-medium">금액</th>
                    <th className="px-4 py-3 text-left font-medium">
                      출금 계좌
                    </th>
                    <th className="px-4 py-3 text-center font-medium">상태</th>
                    <th className="px-4 py-3 text-left font-medium">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredWithdrawals.map((w) => (
                    <tr
                      key={w.id}
                      className="hover:bg-gray-800/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400">{w.time}</td>
                      <td className="px-4 py-3 text-right text-red-400 font-medium">
                        {formatKrw(-w.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">
                        {w.bank} {w.account}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn("text-xs px-2 py-0.5 rounded", {
                            "bg-yellow-500/10 text-yellow-400":
                              w.status === "pending",
                            "bg-green-500/10 text-green-400":
                              w.status === "approved",
                            "bg-red-500/10 text-red-400":
                              w.status === "rejected",
                          })}
                        >
                          {w.status === "pending"
                            ? "대기"
                            : w.status === "approved"
                              ? "완료"
                              : "거절"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-red-400 text-xs">
                        {w.reason || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Point History */}
          {activeTab === "point" && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-gray-400 bg-gray-800/50 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">시간</th>
                    <th className="px-4 py-3 text-left font-medium">유형</th>
                    <th className="px-4 py-3 text-left font-medium">내용</th>
                    <th className="px-4 py-3 text-right font-medium">금액</th>
                    <th className="px-4 py-3 text-right font-medium">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredPoints.map((p) => {
                    const config = pointTypeConfig[p.type];
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-gray-800/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-400">{p.time}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded bg-gray-800 font-medium",
                              config.color,
                            )}
                          >
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          {p.description}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-medium",
                            p.amount >= 0 ? "text-green-400" : "text-red-400",
                          )}
                        >
                          {formatUsdt(p.amount, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            signed: true,
                          })}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {formatUsdt(p.balance, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
