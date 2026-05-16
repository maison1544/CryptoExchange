"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { UserModal } from "@/components/ui/UserModal";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  UserEmptyState,
  UserMetricCard,
  UserPageHeader,
  UserPanel,
} from "@/components/ui/UserSurface";
import {
  Eye,
  EyeOff,
  ArrowRightLeft,
  CreditCard,
  Wallet,
  TrendingUp,
  Lock as LockIcon,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDepositWithdrawal } from "@/contexts/DepositWithdrawalContext";
import { useNotification } from "@/contexts/NotificationContext";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatDisplayNumber, formatKrw } from "@/lib/utils/numberFormat";
import { convertUsdtToKrw } from "@/lib/utils/siteSettings";

const supabase = createClient();

const DEFAULT_WALLETS = {
  general: { total: 0, available: 0, locked: 0 },
  futures: {
    total: 0,
    available: 0,
    crossCollateral: 0,
    isolatedCollateral: 0,
    reservedOrders: 0,
  },
  staking: { total: 0, available: 0, locked: 0 },
};

type WalletType = "general" | "futures" | "staking";
const WALLET_LABELS: Record<WalletType, string> = {
  general: "일반 잔고",
  futures: "선물 잔고",
  staking: "스테이킹 잔고",
};

function bal(show: boolean, v: string) {
  return show ? v : "********";
}

function formatUsdtValue(value: number) {
  return formatDisplayNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedUsdtValue(value: number) {
  return formatDisplayNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signed: true,
  });
}

function formatPercentValue(value: number) {
  return `${formatDisplayNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signed: true,
  })}%`;
}

function formatApproxKrwFromUsdt(value: number, usdtKrwRate: number) {
  return formatKrw(convertUsdtToKrw(value, usdtKrwRate));
}

export default function AssetsPage() {
  const [showBalance, setShowBalance] = useState(true);
  const { isLoggedIn, user } = useAuth();
  const { usdtKrwRate } = useDepositWithdrawal();
  const { addToast } = useNotification();
  const [transferModal, setTransferModal] = useState(false);
  const [transferFrom, setTransferFrom] = useState<WalletType>("general");
  const [transferTo, setTransferTo] = useState<WalletType>("futures");
  const [transferAmount, setTransferAmount] = useState("");
  const [wallets, setWallets] = useState(DEFAULT_WALLETS);
  const [dailyPnl, setDailyPnl] = useState(0);
  const [weeklyPnl, setWeeklyPnl] = useState(0);

  const loadWallets = useCallback(() => {
    if (!user) return;

    Promise.all([
      supabase
        .from("user_profiles")
        .select(
          "wallet_balance, available_balance, futures_balance, staking_balance",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("futures_positions")
        .select("margin, margin_mode")
        .eq("user_id", user.id)
        .eq("status", "open"),
      supabase
        .from("staking_positions")
        .select("amount, total_earned")
        .eq("user_id", user.id)
        .eq("status", "active"),
      supabase
        .from("futures_orders")
        .select("reserved_amount")
        .eq("user_id", user.id)
        .eq("status", "pending"),
    ]).then(([profileRes, positionsRes, stakingRes, pendingOrdersRes]) => {
      if (!profileRes.data) return;
      const bal = Number(profileRes.data.wallet_balance);
      const avail = Number(profileRes.data.available_balance);
      const futBal = Number(profileRes.data.futures_balance);
      const stakingBal = Number(profileRes.data.staking_balance);
      const crossCollateral = (positionsRes.data ?? []).reduce(
        (
          s: number,
          p: {
            margin: number | string;
            margin_mode?: "cross" | "isolated" | null;
          },
        ) => (p.margin_mode === "isolated" ? s : s + Number(p.margin || 0)),
        0,
      );
      const isolatedCollateral = (positionsRes.data ?? []).reduce(
        (
          s: number,
          p: {
            margin: number | string;
            margin_mode?: "cross" | "isolated" | null;
          },
        ) => (p.margin_mode === "isolated" ? s + Number(p.margin || 0) : s),
        0,
      );
      const openMargin = crossCollateral + isolatedCollateral;
      const reservedOrders = (pendingOrdersRes.data ?? []).reduce(
        (s: number, order: { reserved_amount: number | string }) =>
          s + Number(order.reserved_amount || 0),
        0,
      );
      const stakingLocked = (stakingRes.data ?? []).reduce(
        (s: number, p: { amount: number | string }) =>
          s + Number(p.amount || 0),
        0,
      );
      const stakingEarned = (stakingRes.data ?? []).reduce(
        (s: number, p: { total_earned?: number | string | null }) =>
          s + Number(p.total_earned || 0),
        0,
      );
      setWallets({
        general: { total: bal, available: avail, locked: bal - avail },
        futures: {
          total: futBal + openMargin + reservedOrders,
          available: futBal,
          crossCollateral,
          isolatedCollateral,
          reservedOrders,
        },
        staking: {
          total: stakingBal + stakingLocked + stakingEarned,
          available: stakingBal,
          locked: stakingLocked,
        },
      });
    });
  }, [user]);

  useEffect(() => {
    loadWallets();

    // Fetch realized PnL from closed positions
    if (!user) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    supabase
      .from("futures_positions")
      .select("pnl, closed_at")
      .eq("user_id", user.id)
      .in("status", ["closed", "liquidated"])
      .gte("closed_at", weekStart.toISOString())
      .then(({ data }) => {
        if (!data) return;
        let dPnl = 0;
        let wPnl = 0;
        for (const p of data) {
          const pnl = Number(p.pnl) || 0;
          wPnl += pnl;
          if (new Date(p.closed_at) >= todayStart) dPnl += pnl;
        }
        setDailyPnl(dPnl);
        setWeeklyPnl(wPnl);
      });
  }, [user, loadWallets]);

  const total =
    wallets.general.total + wallets.futures.total + wallets.staking.total;

  return (
    <AppLayout>
      <div className="h-full flex flex-col bg-background overflow-y-auto p-6 lg:p-8">
        <div className="max-w-7xl mx-auto w-full space-y-6 pb-10">
          <UserPageHeader
            eyebrow="Asset overview"
            title="지갑별 자산과 손익 흐름을 한 번에 확인합니다."
            description="일반, 선물, 스테이킹 지갑을 같은 기준으로 비교하고 즉시 전환할 수 있도록 정리했습니다."
            actions={
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/3 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {showBalance ? <Eye size={16} /> : <EyeOff size={16} />}
                {showBalance ? "잔액 숨기기" : "잔액 보기"}
              </button>
            }
          />

          {!isLoggedIn ? (
            <UserEmptyState
              icon={<CreditCard size={32} />}
              title="로그인 후 자산을 확인할 수 있습니다"
              description="개인 지갑 잔액, 증거금 상세, 거래 내역을 보려면 먼저 로그인하세요."
              action={
                <button
                  onClick={() => (window.location.href = "/login")}
                  className="rounded-full bg-yellow-500 px-8 py-3 font-semibold text-black transition-colors hover:bg-yellow-400"
                >
                  로그인
                </button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UserMetricCard
                  label="예상 자산"
                  value={`${bal(showBalance, formatUsdtValue(total))} USDT`}
                  subvalue={`≈ ${bal(showBalance, formatApproxKrwFromUsdt(total, usdtKrwRate))}`}
                  tone="default"
                />
                <UserMetricCard
                  label="오늘의 실현손익"
                  value={bal(
                    showBalance,
                    `${formatSignedUsdtValue(dailyPnl)} USDT`,
                  )}
                  subvalue={`${bal(
                    showBalance,
                    total > 0
                      ? formatPercentValue((dailyPnl / total) * 100)
                      : "0.00%",
                  )} · ≈ ${bal(
                    showBalance,
                    formatApproxKrwFromUsdt(Math.abs(dailyPnl), usdtKrwRate),
                  )}`}
                  tone={dailyPnl >= 0 ? "success" : "danger"}
                />
                <UserMetricCard
                  label="금주의 실현손익"
                  value={bal(
                    showBalance,
                    `${formatSignedUsdtValue(weeklyPnl)} USDT`,
                  )}
                  subvalue={`${bal(
                    showBalance,
                    total > 0
                      ? formatPercentValue((weeklyPnl / total) * 100)
                      : "0.00%",
                  )} · ≈ ${bal(
                    showBalance,
                    formatApproxKrwFromUsdt(Math.abs(weeklyPnl), usdtKrwRate),
                  )}`}
                  tone={weeklyPnl >= 0 ? "success" : "danger"}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    key: "general" as WalletType,
                    icon: Wallet,
                    color: "text-emerald-400",
                    bgColor: "bg-emerald-500/10",
                    desc: "입출금 및 내부 전환 가능",
                  },
                  {
                    key: "futures" as WalletType,
                    icon: TrendingUp,
                    color: "text-yellow-400",
                    bgColor: "bg-yellow-500/10",
                    desc: "선물 거래 증거금 전용",
                  },
                  {
                    key: "staking" as WalletType,
                    icon: LockIcon,
                    color: "text-blue-400",
                    bgColor: "bg-blue-500/10",
                    desc: "스테이킹 예치 전용",
                  },
                ].map((w) => (
                  <UserPanel
                    key={w.key}
                    className="h-full"
                    contentClassName="space-y-3 px-5 py-5"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center",
                          w.bgColor,
                        )}
                      >
                        <w.icon size={18} className={w.color} />
                      </div>
                      <div>
                        <div className="text-white font-bold text-sm">
                          {WALLET_LABELS[w.key]}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {w.desc}
                        </div>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-white mb-1">
                      {bal(
                        showBalance,
                        formatUsdtValue(wallets[w.key].total),
                      )}{" "}
                      <span className="text-sm text-gray-500 font-normal">
                        USDT
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      ≈{" "}
                      {bal(
                        showBalance,
                        formatApproxKrwFromUsdt(
                          wallets[w.key].total,
                          usdtKrwRate,
                        ),
                      )}
                    </div>
                    <div className="space-y-1 mb-3 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-gray-500">사용 가능</span>
                        <div className="text-right">
                          <div className="text-green-400">
                            {bal(
                              showBalance,
                              `${formatUsdtValue(wallets[w.key].available)} USDT`,
                            )}
                          </div>
                          <div className="text-gray-500">
                            {bal(
                              showBalance,
                              formatApproxKrwFromUsdt(
                                wallets[w.key].available,
                                usdtKrwRate,
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                      {w.key === "futures" && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-500">교차 담보금</span>
                            <div className="text-right">
                              <div className="text-yellow-400">
                                {bal(
                                  showBalance,
                                  `${formatUsdtValue(wallets.futures.crossCollateral)} USDT`,
                                )}
                              </div>
                              <div className="text-gray-500">
                                {bal(
                                  showBalance,
                                  formatApproxKrwFromUsdt(
                                    wallets.futures.crossCollateral,
                                    usdtKrwRate,
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">격리 담보금</span>
                            <div className="text-right">
                              <div className="text-orange-400">
                                {bal(
                                  showBalance,
                                  `${formatUsdtValue(wallets.futures.isolatedCollateral)} USDT`,
                                )}
                              </div>
                              <div className="text-gray-500">
                                {bal(
                                  showBalance,
                                  formatApproxKrwFromUsdt(
                                    wallets.futures.isolatedCollateral,
                                    usdtKrwRate,
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">
                              예약 주문 잠금
                            </span>
                            <div className="text-right">
                              <div className="text-blue-400">
                                {bal(
                                  showBalance,
                                  `${formatUsdtValue(wallets.futures.reservedOrders)} USDT`,
                                )}
                              </div>
                              <div className="text-gray-500">
                                {bal(
                                  showBalance,
                                  formatApproxKrwFromUsdt(
                                    wallets.futures.reservedOrders,
                                    usdtKrwRate,
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                      {w.key === "staking" && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">예치 잠금</span>
                          <div className="text-right">
                            <div className="text-blue-400">
                              {bal(
                                showBalance,
                                `${formatUsdtValue(wallets.staking.locked)} USDT`,
                              )}
                            </div>
                            <div className="text-gray-500">
                              {bal(
                                showBalance,
                                formatApproxKrwFromUsdt(
                                  wallets.staking.locked,
                                  usdtKrwRate,
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {w.key === "general" &&
                        wallets.general.locked > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">잠금</span>
                            <div className="text-right">
                              <div className="text-gray-400">
                                {bal(
                                  showBalance,
                                  `${formatUsdtValue(wallets.general.locked)} USDT`,
                                )}
                              </div>
                              <div className="text-gray-500">
                                {bal(
                                  showBalance,
                                  formatApproxKrwFromUsdt(
                                    wallets.general.locked,
                                    usdtKrwRate,
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                    <button
                      onClick={() => {
                        setTransferFrom(w.key);
                        setTransferTo(
                          w.key === "general" ? "futures" : "general",
                        );
                        setTransferModal(true);
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/8 bg-white/3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <ArrowRightLeft size={12} /> 전환
                    </button>
                  </UserPanel>
                ))}
              </div>

              <UserPanel
                title="자산 상세 내역"
                description="지갑별 총액과 전체 합계를 같은 기준으로 비교합니다."
              >
                <div className="space-y-3 text-sm">
                  {[
                    {
                      label: "일반 잔고",
                      val: wallets.general.total,
                      color: "text-emerald-400",
                    },
                    {
                      label: "선물 잔고 (증거금)",
                      val: wallets.futures.total,
                      color: "text-yellow-400",
                    },
                    {
                      label: "스테이킹 잔고",
                      val: wallets.staking.total,
                      color: "text-blue-400",
                    },
                  ].map((r) => (
                    <div
                      key={r.label}
                      className="flex justify-between items-center py-2 border-b border-gray-800/50"
                    >
                      <span className="text-gray-400">{r.label}</span>
                      <span className={cn("font-medium", r.color)}>
                        <span className="block text-right">
                          {bal(showBalance, `${formatUsdtValue(r.val)} USDT`)}
                        </span>
                        <span className="block text-right text-[11px] text-gray-500 font-normal mt-1">
                          {bal(
                            showBalance,
                            formatApproxKrwFromUsdt(r.val, usdtKrwRate),
                          )}
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-400 font-medium">
                      합계 (예상 자산)
                    </span>
                    <span className="text-white font-bold">
                      <span className="block text-right">
                        {bal(showBalance, `${formatUsdtValue(total)} USDT`)}
                      </span>
                      <span className="block text-right text-[11px] text-gray-500 font-normal mt-1">
                        {bal(
                          showBalance,
                          formatApproxKrwFromUsdt(total, usdtKrwRate),
                        )}
                      </span>
                    </span>
                  </div>
                </div>
              </UserPanel>
            </>
          )}
        </div>
      </div>

      {transferModal && (
        <UserModal
          isOpen={transferModal}
          onClose={() => setTransferModal(false)}
          title="자산 전환"
          description="지갑 간 자산을 즉시 이동합니다."
          size="sm"
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => setTransferModal(false)}
                className="flex-1 rounded-full border border-white/8 bg-white/3 py-2.5 text-sm text-white transition-colors hover:bg-white/5"
              >
                취소
              </button>
              <ActionButton
                onClick={async () => {
                  const amt = Number(transferAmount);
                  if (!amt || amt <= 0) {
                    addToast({
                      title: "전환 실패",
                      message: "금액을 입력해주세요.",
                      type: "error",
                    });
                    return;
                  }
                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    if (!session?.access_token)
                      throw new Error("로그인이 필요합니다.");
                    const res = await fetch("/api/transfer", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        from: transferFrom,
                        to: transferTo,
                        amount: amt,
                      }),
                    });
                    const result = await res.json().catch(() => null);
                    if (!res.ok)
                      throw new Error(result?.error || "전환에 실패했습니다.");
                    addToast({
                      title: "지갑 전환 완료",
                      message: `${WALLET_LABELS[transferFrom]} → ${WALLET_LABELS[transferTo]}: ${transferAmount} USDT`,
                      type: "success",
                    });
                    setTransferModal(false);
                    setTransferAmount("");
                    loadWallets();
                  } catch (err) {
                    addToast({
                      title: "전환 실패",
                      message:
                        err instanceof Error
                          ? err.message
                          : "전환 중 오류가 발생했습니다.",
                      type: "error",
                    });
                  }
                }}
                className="flex-1 rounded-full bg-yellow-500 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-yellow-400"
              >
                전환하기
              </ActionButton>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                보내는 지갑
              </label>
              <select
                value={transferFrom}
                onChange={(e) => setTransferFrom(e.target.value as WalletType)}
                className="w-full rounded-2xl border border-white/8 bg-white/3 px-3 py-2.5 text-sm text-white focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none"
              >
                {(Object.keys(WALLET_LABELS) as WalletType[]).map((k) => (
                  <option key={k} value={k}>
                    {WALLET_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-center">
              <ArrowRightLeft size={16} className="text-gray-500 rotate-90" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                받는 지갑
              </label>
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value as WalletType)}
                className="w-full rounded-2xl border border-white/8 bg-white/3 px-3 py-2.5 text-sm text-white focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none"
              >
                {(Object.keys(WALLET_LABELS) as WalletType[])
                  .filter((k) => k !== transferFrom)
                  .map((k) => (
                    <option key={k} value={k}>
                      {WALLET_LABELS[k]}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                전환 금액
              </label>
              <div className="flex items-center overflow-hidden rounded-2xl border border-white/8 bg-white/3 focus-within:border-yellow-500/50 focus-within:bg-white/4">
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none"
                />
                <span className="px-3 text-sm text-gray-400">USDT</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-500">
                  사용 가능:{" "}
                  {formatUsdtValue(wallets[transferFrom].available)} USDT
                </span>
                <button
                  onClick={() =>
                    setTransferAmount(
                      String(wallets[transferFrom].available),
                    )
                  }
                  className="text-[10px] text-yellow-500 hover:text-yellow-400"
                >
                  전액
                </button>
              </div>
            </div>
          </div>
        </UserModal>
      )}
    </AppLayout>
  );
}
