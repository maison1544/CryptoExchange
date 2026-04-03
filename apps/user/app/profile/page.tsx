"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DbUserProfile } from "@/lib/types/database";
import {
  TrendingUp,
  Calendar,
  Mail,
  Building2,
  Edit3,
  Copy,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useDepositWithdrawal } from "@/contexts/DepositWithdrawalContext";
import { useNotification } from "@/contexts/NotificationContext";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

const supabase = createClient();

const kycConfig = {
  0: {
    label: "미인증",
    color: "text-gray-400",
    bg: "bg-gray-800",
    desc: "KYC 미인증 상태",
  },
  1: {
    label: "기본 인증",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    desc: "이메일 인증 완료",
  },
  2: {
    label: "완전 인증",
    color: "text-green-400",
    bg: "bg-green-500/10",
    desc: "신분증 인증 완료",
  },
};

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

export default function ProfilePage() {
  const { isLoggedIn, user } = useAuth();
  const { userPoints } = useDepositWithdrawal();
  const { addToast } = useNotification();
  const [currentTime] = useState(() => Date.now());
  const [profile, setProfile] = useState<DbUserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as DbUserProfile);
      });
  }, [user]);

  const mockProfile = profile
    ? {
        displayName: profile.name,
        email: profile.email,
        phone: profile.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1-****-$2"),
        joinDate: new Date(profile.created_at).toISOString().split("T")[0],
        kycLevel: 2 as 0 | 1 | 2,
        referralCode: profile.referral_code_used || "N/A",
        bank: profile.bank_name || "-",
        account: profile.bank_account || "-",
        holder: profile.bank_account_holder || "-",
      }
    : {
        displayName: "Loading...",
        email: "",
        phone: "",
        joinDate: "",
        kycLevel: 0 as 0 | 1 | 2,
        referralCode: "",
        bank: "-",
        account: "-",
        holder: "-",
      };

  const joinDays = profile
    ? Math.floor(
        (currentTime - new Date(profile.created_at).getTime()) / 86400000,
      )
    : 0;
  const mockStats = {
    totalTrades: 0,
    winRate: 0,
    totalPnl: 0,
    avgLeverage: 0,
    favorPair: "BTC/USDT",
    longestWinStreak: 0,
    maxDayPnl: 0,
    maxDayLoss: 0,
    totalVolume: 0,
    joinDays,
  };

  const kyc = kycConfig[mockProfile.kycLevel];

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
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-linear-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-2xl font-bold text-black">
                  {mockProfile.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-white">
                      {mockProfile.displayName}
                    </h1>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                        kyc.bg,
                        kyc.color,
                      )}
                    >
                      {kyc.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Mail size={12} />
                      {mockProfile.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      가입일 {mockProfile.joinDate}
                    </span>
                  </div>
                </div>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
                <Edit3 size={12} />
                프로필 수정
              </button>
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
                  {formatDisplayNumber(mockStats.totalTrades, {
                    maximumFractionDigits: 0,
                  })}
                  건
                </div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">승률</div>
                <div className="text-lg font-bold text-white">
                  {formatProfilePercent(mockStats.winRate)}
                </div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">총 손익</div>
                <div
                  className={cn(
                    "text-lg font-bold",
                    mockStats.totalPnl >= 0 ? "text-green-400" : "text-red-400",
                  )}
                >
                  {formatProfileUsdt(mockStats.totalPnl, true)}
                </div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">활동일수</div>
                <div className="text-lg font-bold text-white">
                  {formatDisplayNumber(mockStats.joinDays, {
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
                    value: formatVolumeInMillions(mockStats.totalVolume),
                  },
                  {
                    label: "평균 레버리지",
                    value: `${formatDisplayNumber(mockStats.avgLeverage, {
                      maximumFractionDigits: 0,
                    })}x`,
                  },
                  { label: "주요 거래 페어", value: mockStats.favorPair },
                  {
                    label: "최대 연승",
                    value: `${formatDisplayNumber(mockStats.longestWinStreak, {
                      maximumFractionDigits: 0,
                    })}연승`,
                  },
                  {
                    label: "일일 최대 수익",
                    value: formatProfileUsdt(mockStats.maxDayPnl, true),
                    color: "text-green-400",
                  },
                  {
                    label: "일일 최대 손실",
                    value: formatProfileUsdt(mockStats.maxDayLoss),
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
                    <span className="text-white">{mockProfile.bank}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800/50">
                    <span className="text-gray-400">계좌번호</span>
                    <span className="text-white">{mockProfile.account}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-400">예금주</span>
                    <span className="text-white">{mockProfile.holder}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <h3 className="text-white font-medium mb-3">추천인 코드</h3>
                <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-3">
                  <span className="text-yellow-500 font-mono font-bold flex-1">
                    {mockProfile.referralCode}
                  </span>
                  <button
                    onClick={() => handleCopy(mockProfile.referralCode)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  친구를 초대하면 거래 수수료의 20%를 리워드로 받습니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
