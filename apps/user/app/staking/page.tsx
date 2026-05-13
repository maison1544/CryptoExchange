"use client";

import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { UserModal } from "@/components/ui/UserModal";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  UserMetricCard,
  UserPageHeader,
  UserPanel,
} from "@/components/ui/UserSurface";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { formatDateTime } from "@/lib/utils/formatDate";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";
import type { DbStakingPosition, DbStakingProduct } from "@/lib/types/database";

const supabase = createClient();

const stakingPeriods = [
  { days: 7, rateMin: 0.5, rateMax: 1.0 },
  { days: 30, rateMin: 2.0, rateMax: 5.0 },
  { days: 90, rateMin: 6.0, rateMax: 10.0 },
  { days: 180, rateMin: 12.0, rateMax: 20.0 },
  { days: 365, rateMin: 25.0, rateMax: 35.0 },
];

const statusMap: Record<string, string> = {
  active: "진행중",
  completed: "완료",
  cancelled: "취소",
};

function formatRatePercent(value: number) {
  return `${formatDisplayNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

type StakingHistoryRecord = {
  id: number;
  date: string;
  type: string;
  amount: number;
  period: string;
  rate: string;
  profit: string;
  endDate: string;
  status: string;
};

type StakingPositionRecord = DbStakingPosition & {
  staking_products: Pick<
    DbStakingProduct,
    "name" | "duration_days" | "annual_rate"
  > | null;
};

export default function StakingPage() {
  const { isLoggedIn, user } = useAuth();
  const { addToast } = useNotification();
  const [stakingType, setStakingType] = useState<"stable" | "variable">(
    "stable",
  );
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [stakingHistory, setStakingHistory] = useState<StakingHistoryRecord[]>(
    [],
  );
  const [products, setProducts] = useState<DbStakingProduct[]>([]);
  const [userBalance, setUserBalance] = useState(0);
  const [stakingBalance, setStakingBalance] = useState(0);
  const [lockedBalance, setLockedBalance] = useState(0);
  const [activeStakingCount, setActiveStakingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const loadStakingData = useCallback(async () => {
    if (!user) return;

    const [posRes, balRes] = await Promise.all([
      supabase
        .from("staking_positions")
        .select("*, staking_products(name, duration_days, annual_rate)")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false }),
      supabase
        .from("user_profiles")
        .select("staking_balance")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const stakingPositions = (posRes.data ?? []) as StakingPositionRecord[];

    setStakingHistory(
      stakingPositions.map((p) => ({
        id: p.id,
        date: formatDateTime(p.started_at),
        type: "안정형",
        amount: Number(p.amount),
        period: `${p.staking_products?.duration_days ?? 0}일`,
        rate: p.staking_products?.annual_rate
          ? formatRatePercent(Number(p.staking_products.annual_rate) * 100)
          : "-",
        profit:
          Number(p.total_earned) > 0
            ? formatDisplayNumber(Number(p.total_earned), {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : "-",
        endDate: formatDateTime(p.ends_at),
        status: statusMap[p.status] || p.status,
      })),
    );

    const available = Number(balRes.data?.staking_balance ?? 0);
    setUserBalance(available);

    const active = stakingPositions.filter((p) => p.status === "active");
    setActiveStakingCount(active.length);

    const locked = active.reduce(
      (sum, position) => sum + Number(position.amount),
      0,
    );
    setLockedBalance(locked);

    const earned = active.reduce(
      (sum, position) => sum + Number(position.total_earned || 0),
      0,
    );
    setStakingBalance(available + locked + earned);
  }, [user]);

  useEffect(() => {
    supabase
      .from("staking_products")
      .select("*")
      .eq("is_active", true)
      .order("duration_days")
      .then(({ data }) => {
        if (data) setProducts(data as DbStakingProduct[]);
      });
  }, []);

  useEffect(() => {
    void loadStakingData();
  }, [loadStakingData]);

  const availableBalance = userBalance;

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-background relative">
        {!isLoggedIn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Lock size={24} className="text-gray-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              로그인이 필요합니다
            </h2>
            <p className="text-gray-400 mb-6">
              스테이킹을 이용하려면 로그인하세요.
            </p>
            <button
              onClick={() => (window.location.href = "/login")}
              className="px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-colors"
            >
              로그인
            </button>
          </div>
        )}
        <div className="max-w-5xl mx-auto px-4 py-8">
          <UserPageHeader
            eyebrow="Staking"
            title="보유 USDT를 일정 기간 예치해 수익을 만듭니다."
            description="사용 가능 잔액, 잠금 금액, 진행 중 계약 수를 같은 흐름에서 확인하고 바로 신청할 수 있게 정리했습니다."
          />

          <div className="mb-6 mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <UserMetricCard
              label="총 스테이킹 잔고"
              value={formatUsdt(stakingBalance, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            />
            <UserMetricCard
              label="사용 가능"
              tone="success"
              value={formatUsdt(availableBalance, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              subvalue="일반 잔고로 이동 가능한 수량"
            />
            <UserMetricCard
              label="잠금된 금액"
              tone="warning"
              value={formatUsdt(lockedBalance, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            />
            <UserMetricCard
              label="진행 중 계약"
              value={`${activeStakingCount}`}
              subvalue="활성 스테이킹 건수"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <UserPanel
              title="스테이킹 신청"
              description="유형, 기간, 금액을 확인한 뒤 계약을 생성합니다."
              contentClassName="px-5 py-5"
            >
              {/* Type Selection */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">
                  스테이킹 유형
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStakingType("stable")}
                    className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                      stakingType === "stable"
                        ? "bg-yellow-500 text-black"
                        : "border border-white/8 bg-white/3 text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    안정형
                  </button>
                  <button
                    onClick={() => setStakingType("variable")}
                    className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                      stakingType === "variable"
                        ? "bg-yellow-500 text-black"
                        : "border border-white/8 bg-white/3 text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    변동형
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {stakingType === "stable"
                    ? "기본 스테이킹"
                    : "변동 수익형 스테이킹"}
                </p>
              </div>

              {/* Period Selection */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">
                  스테이킹 기간
                </label>
                <div className="space-y-2">
                  {stakingPeriods.map((p) => (
                    <button
                      key={p.days}
                      onClick={() => setSelectedPeriod(p.days)}
                      className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors ${
                        selectedPeriod === p.days
                          ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-500"
                          : "border border-white/8 bg-white/3 text-gray-300 hover:bg-white/5"
                      }`}
                    >
                      <span className="font-medium">{p.days}일</span>
                      <span className="text-xs">
                        예상 수익률 : {p.rateMin}% ~ {p.rateMax}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">
                  스테이킹 금액
                </label>
                <div className="flex items-center overflow-hidden rounded-2xl border border-white/8 bg-white/3 focus-within:border-yellow-500/50 focus-within:bg-white/4">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white focus:outline-none"
                  />
                  <span className="px-4 text-sm text-gray-400 font-medium">
                    USDT
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-500">
                    사용 가능:{" "}
                    {formatUsdt(availableBalance, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    최대 스테이킹 금액:{" "}
                    {formatUsdt(availableBalance, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <button
                className="w-full rounded-full bg-yellow-500 py-3 text-sm font-semibold text-black transition-colors hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500"
                disabled={!selectedPeriod || !amount || Number(amount) <= 0}
                onClick={() => setShowConfirmModal(true)}
              >
                스테이킹 신청
              </button>

              {/* Info */}
              <div className="mt-4 rounded-2xl border border-white/8 bg-white/3 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs">ℹ️</span>
                  <span className="text-xs text-gray-300 font-medium">
                    안내사항
                  </span>
                </div>
                <ul className="space-y-1 text-[11px] text-gray-500 list-disc list-inside">
                  <li>스테이킹 기간 동안 자금은 잠금 처리됩니다.</li>
                  <li>
                    만기일에 원금과 수익이 자동으로 스테이킹 잔고로 지급됩니다.
                  </li>
                  <li>중도 해지는 불가능하며, 관리자에게 문의해주세요.</li>
                </ul>
              </div>
            </UserPanel>

            <UserPanel
              title="스테이킹 내역"
              description="활성/완료/취소 계약의 기간, 수익률, 수익금을 확인합니다."
              contentClassName="px-5 py-5"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-175">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2 px-2 text-gray-500 font-medium whitespace-nowrap">
                        시작일
                      </th>
                      <th className="text-left py-2 px-2 text-gray-500 font-medium">
                        유형
                      </th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">
                        금액
                      </th>
                      <th className="text-center py-2 px-2 text-gray-500 font-medium">
                        기간
                      </th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">
                        수익률
                      </th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">
                        수익금
                      </th>
                      <th className="text-left py-2 px-2 text-gray-500 font-medium whitespace-nowrap">
                        만기일
                      </th>
                      <th className="text-center py-2 px-2 text-gray-500 font-medium">
                        상태
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stakingHistory.map((s) => (
                      <tr key={s.id} className="border-b border-gray-800/50">
                        <td className="py-2.5 text-gray-400 whitespace-nowrap">
                          {s.date}
                        </td>
                        <td className="py-2.5 text-white">{s.type}</td>
                        <td className="py-2.5 text-white text-right">
                          {formatDisplayNumber(s.amount, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2.5 text-gray-300 text-center">
                          {s.period}
                        </td>
                        <td className="py-2.5 text-gray-300 text-right">
                          {s.rate}
                        </td>
                        <td className="py-2.5 text-gray-300 text-right">
                          {s.profit}
                        </td>
                        <td className="py-2.5 text-gray-400 whitespace-nowrap">
                          {s.endDate}
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              s.status === "진행중"
                                ? "bg-yellow-500/10 text-yellow-400"
                                : s.status === "완료"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-gray-700 text-gray-400"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </UserPanel>
          </div>
        </div>
      </div>

      {showConfirmModal && selectedPeriod && (
        <UserModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="스테이킹 계약 확인"
          description="계약 조건을 확인한 뒤 신청을 확정합니다."
          size="sm"
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-full border border-white/8 bg-white/3 py-2.5 text-sm text-white transition-colors hover:bg-white/5"
              >
                취소
              </button>
              <ActionButton
                onClick={async () => {
                  if (!user) return;
                  if (!selectedPeriod || !amount) return;
                  const product = products.find(
                    (p) => p.duration_days === selectedPeriod,
                  );
                  if (!product) {
                    addToast({
                      title: "스테이킹 신청 불가",
                      message: "해당 기간의 상품이 없습니다.",
                      type: "error",
                    });
                    return;
                  }
                  const numAmount = Number(amount);
                  if (numAmount > availableBalance) {
                    addToast({
                      title: "스테이킹 신청 불가",
                      message: "잔액이 부족합니다.",
                      type: "error",
                    });
                    return;
                  }
                  setSubmitting(true);
                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();

                    if (!session?.access_token) {
                      throw new Error("로그인이 필요합니다.");
                    }

                    const response = await fetch("/api/staking/subscribe", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        productId: product.id,
                        amount: numAmount,
                      }),
                    });

                    const payload = await response.json().catch(() => null);

                    if (!response.ok) {
                      throw new Error(
                        payload?.error ||
                          "스테이킹 신청 중 오류가 발생했습니다.",
                      );
                    }

                    await supabase.from("notifications").insert({
                      user_id: user.id,
                      title: "스테이킹 신청 완료",
                      body: `${formatUsdt(numAmount, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}를 ${selectedPeriod}일 스테이킹 신청했습니다.`,
                      type: "staking",
                    });

                    setShowConfirmModal(false);
                    setAmount("");
                    setSelectedPeriod(null);
                    await loadStakingData();
                    addToast({
                      title: "스테이킹 신청 완료",
                      message: "스테이킹이 정상적으로 신청되었습니다.",
                      type: "success",
                    });
                  } catch (error) {
                    addToast({
                      title: "스테이킹 신청 실패",
                      message:
                        error instanceof Error
                          ? error.message
                          : "스테이킹 신청 중 오류가 발생했습니다.",
                      type: "error",
                    });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="flex-1 rounded-full bg-yellow-500 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-400"
              >
                {submitting ? "처리 중..." : "계약 확인"}
              </ActionButton>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">유형</div>
                <div className="text-white font-medium">
                  {stakingType === "stable" ? "안정형" : "변동형"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">기간</div>
                <div className="text-white font-medium">{selectedPeriod}일</div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">예치 금액</div>
                <div className="text-white font-medium">
                  {formatUsdt(Number(amount), {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">예상 수익률</div>
                <div className="text-yellow-500 font-medium">
                  {
                    stakingPeriods.find((p) => p.days === selectedPeriod)
                      ?.rateMin
                  }
                  % ~{" "}
                  {
                    stakingPeriods.find((p) => p.days === selectedPeriod)
                      ?.rateMax
                  }
                  %
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-500/90">
              스테이킹 기간 동안 자금은 잠금 처리되며 중도 해지는 불가능합니다.
              만기일에 원금과 수익이 자동 지급됩니다.
            </div>
          </div>
        </UserModal>
      )}
    </AppLayout>
  );
}
