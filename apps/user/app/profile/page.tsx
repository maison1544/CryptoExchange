"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DbFuturesPosition, DbUserProfile } from "@/lib/types/database";
import {
  TrendingUp,
  Calendar,
  Mail,
  Building2,
  Copy,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useDepositWithdrawal } from "@/contexts/DepositWithdrawalContext";
import { useNotification } from "@/contexts/NotificationContext";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

const supabase = createClient();

type ProfileTradeRow = Pick<
  DbFuturesPosition,
  | "id"
  | "symbol"
  | "leverage"
  | "size"
  | "entry_price"
  | "pnl"
  | "fee"
  | "closed_at"
  | "status"
>;

function formatProfilePercent(value: number) {
  return `${formatDisplayNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatProfileUsdt(value: number, signed = false) {
  return formatUsdt(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signed,
  });
}

function formatVolumeInMillions(value: number) {
  return `${formatDisplayNumber(value / 1_000_000, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;
}

function formatPair(symbol: string) {
  return symbol.endsWith("USDT")
    ? `${symbol.slice(0, -"USDT".length)}/USDT`
    : symbol;
}

export default function ProfilePage() {
  const { isLoggedIn, user } = useAuth();
  const { userPoints } = useDepositWithdrawal();
  const { addToast } = useNotification();
  const [currentTime] = useState(() => Date.now());
  const [profile, setProfile] = useState<DbUserProfile | null>(null);
  const [trades, setTrades] = useState<ProfileTradeRow[]>([]);

  useEffect(() => {
    if (!user) return;

    let isCurrent = true;

    Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("futures_positions")
        .select(
          "id, symbol, leverage, size, entry_price, pnl, fee, closed_at, status",
        )
        .eq("user_id", user.id)
        .in("status", ["closed", "liquidated"])
        .order("closed_at", { ascending: true }),
    ]).then(([profileResult, tradesResult]) => {
      if (!isCurrent) return;
      setProfile((profileResult.data as DbUserProfile | null) ?? null);
      setTrades((tradesResult.data as ProfileTradeRow[] | null) ?? []);
    });

    return () => {
      isCurrent = false;
    };
  }, [user]);

  const currentProfile = profile?.id === user?.id ? profile : null;
  const currentTrades = useMemo(
    () => (profile?.id === user?.id ? trades : []),
    [profile?.id, trades, user?.id],
  );

  const profileInfo = currentProfile
    ? {
        displayName: currentProfile.name,
        email: currentProfile.email,
        joinDate: new Date(currentProfile.created_at).toISOString().split("T")[0],
        referralCode: currentProfile.referral_code_used || "-",
        bank: currentProfile.bank_name || "-",
        account: currentProfile.bank_account || "-",
        holder: currentProfile.bank_account_holder || "-",
      }
    : {
        displayName: "Loading...",
        email: "",
        joinDate: "",
        referralCode: "-",
        bank: "-",
        account: "-",
        holder: "-",
      };

  const joinDays = currentProfile
    ? Math.floor(
        (currentTime - new Date(currentProfile.created_at).getTime()) / 86400000,
      )
    : 0;
  const tradeStats = useMemo(() => {
    const totalTrades = currentTrades.length;
    const totalPnl = currentTrades.reduce(
      (sum, trade) => sum + Number(trade.pnl || 0),
      0,
    );
    const wins = currentTrades.filter(
      (trade) => Number(trade.pnl || 0) > 0,
    ).length;
    const totalVolume = currentTrades.reduce(
      (sum, trade) =>
        sum + Number(trade.size || 0) * Number(trade.entry_price || 0),
      0,
    );
    const avgLeverage =
      totalTrades > 0
        ? currentTrades.reduce(
            (sum, trade) => sum + Number(trade.leverage || 0),
            0,
          ) /
          totalTrades
        : 0;
    const symbolCounts = currentTrades.reduce<Record<string, number>>(
      (acc, trade) => {
        acc[trade.symbol] = (acc[trade.symbol] || 0) + 1;
        return acc;
      },
      {},
    );
    const favorSymbol =
      Object.entries(symbolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
    let currentWinStreak = 0;
    let longestWinStreak = 0;
    const dailyPnl = currentTrades.reduce<Record<string, number>>((acc, trade) => {
      if (!trade.closed_at) return acc;
      const day = new Date(trade.closed_at).toISOString().split("T")[0];
      acc[day] = (acc[day] || 0) + Number(trade.pnl || 0);
      return acc;
    }, {});

    for (const trade of currentTrades) {
      if (Number(trade.pnl || 0) > 0) {
        currentWinStreak += 1;
        longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
      } else {
        currentWinStreak = 0;
      }
    }

    const dailyValues = Object.values(dailyPnl);

    return {
      totalTrades,
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
      totalPnl,
      avgLeverage,
      favorPair: favorSymbol === "-" ? "-" : formatPair(favorSymbol),
      longestWinStreak,
      maxDayPnl: dailyValues.length > 0 ? Math.max(...dailyValues, 0) : 0,
      maxDayLoss: dailyValues.length > 0 ? Math.min(...dailyValues, 0) : 0,
      totalVolume,
      joinDays,
    };
  }, [currentTrades, joinDays]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast({
      title: "복사 완료",
      message: "클립보드에 복사되었습니다.",
      type: "success",
    });
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-y-auto bg-background p-6 lg:p-8 text-sm">
        <div className="max-w-5xl mx-auto w-full space-y-6 pb-10 relative">
          {!isLoggedIn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 rounded-xl">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Lock size={24} className="text-gray-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                로그인이 필요합니다
              </h2>
              <p className="text-gray-400 mb-6">
                프로필을 확인하려면 로그인하세요.
              </p>
              <button
                onClick={() => (window.location.href = "/login")}
                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-colors"
              >
                로그인
              </button>
            </div>
          )}

          {/* Profile Header */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div>
              <h1 className="text-xl font-bold text-white">
                {profileInfo.displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Mail size={12} />
                  {profileInfo.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  가입일 {profileInfo.joinDate}
                </span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">보유 USDT</div>
                <div className="text-lg font-bold text-yellow-500">
                  {formatProfileUsdt(userPoints)}
                </div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">총 거래</div>
                <div className="text-lg font-bold text-white">
                  {formatDisplayNumber(tradeStats.totalTrades, {
                    maximumFractionDigits: 0,
                  })}
                  건
                </div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">승률</div>
                <div className="text-lg font-bold text-white">
                  {formatProfilePercent(tradeStats.winRate)}
                </div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">총 손익</div>
                <div
                  className={cn(
                    "text-lg font-bold",
                    tradeStats.totalPnl >= 0 ? "text-green-400" : "text-red-400",
                  )}
                >
                  {formatProfileUsdt(tradeStats.totalPnl, true)}
                </div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">활동일수</div>
                <div className="text-lg font-bold text-white">
                  {formatDisplayNumber(tradeStats.joinDays, {
                    maximumFractionDigits: 0,
                  })}
                  일
                </div>
              </div>
            </div>
          </div>

          {/* Section Tabs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Trading Stats */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-yellow-500" />
                거래 통계
              </h3>
              <div className="space-y-3">
                {[
                  {
                    label: "총 거래량",
                    value: formatVolumeInMillions(tradeStats.totalVolume),
                  },
                  {
                    label: "평균 레버리지",
                    value: `${formatDisplayNumber(tradeStats.avgLeverage, {
                      maximumFractionDigits: 0,
                    })}x`,
                  },
                  { label: "주요 거래 페어", value: tradeStats.favorPair },
                  {
                    label: "최대 연승",
                    value: `${formatDisplayNumber(tradeStats.longestWinStreak, {
                      maximumFractionDigits: 0,
                    })}연승`,
                  },
                  {
                    label: "일일 최대 수익",
                    value: formatProfileUsdt(tradeStats.maxDayPnl, true),
                    color: "text-green-400",
                  },
                  {
                    label: "일일 최대 손실",
                    value: formatProfileUsdt(tradeStats.maxDayLoss),
                    color: "text-red-400",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0"
                  >
                    <span className="text-gray-400">{item.label}</span>
                    <span
                      className={cn(
                        "font-medium font-mono",
                        (item as { color?: string }).color || "text-white",
                      )}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Account Info */}
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                  <Building2 size={16} className="text-yellow-500" />
                  출금 계좌 정보
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-800/50">
                    <span className="text-gray-400">은행</span>
                    <span className="text-white">{profileInfo.bank}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800/50">
                    <span className="text-gray-400">계좌번호</span>
                    <span className="text-white">{profileInfo.account}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-400">예금주</span>
                    <span className="text-white">{profileInfo.holder}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <h3 className="text-white font-medium mb-3">추천인 코드</h3>
                <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-3">
                  <span className="text-yellow-500 font-mono font-bold flex-1">
                    {profileInfo.referralCode}
                  </span>
                  <button
                    onClick={() => handleCopy(profileInfo.referralCode)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
