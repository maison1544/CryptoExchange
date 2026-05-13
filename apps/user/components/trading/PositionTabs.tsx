"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTimeText } from "@/components/ui/DateTimeText";
import { FuturesCloseConfirmContent } from "@/components/trading/FuturesCloseConfirmContent";
import { UserModal } from "@/components/ui/UserModal";
import { ActionButton } from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import { resolveFuturesFeeRate } from "@/lib/utils/siteSettings";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";
import {
  computeCrossMarginAccountMetrics,
  getBinanceStyleWalletBalance,
  getEstimatedCrossLiquidationPrice,
  type OpenPositionForRisk,
} from "@/lib/utils/futuresRisk";
import type { Position } from "@/types";

const DEFAULT_FEE_RATE = 0.00035;
const supabase = createClient();

type TradeHistoryItem = {
  id: string;
  openedAt: string | null;
  closedAt: string | null;
  symbol: string;
  side: "매수" | "매도";
  entryPrice: number;
  exitPrice: number;
  amount: number;
  fee: number;
  realizedPnl: number;
  leverage: number;
  marginMode: "cross" | "isolated";
  roe: number;
  status: "closed" | "liquidated";
};

type PendingOrderItem = {
  id: string;
  placedAt: string | null;
  symbol: string;
  side: "매수" | "매도";
  price: number;
  amount: number;
  leverage: number;
  marginMode: "cross" | "isolated";
  margin: number;
  fee: number;
  reservedAmount: number;
};

interface PositionTabsProps {
  positions: Position[];
  currentPrice: number | null;
  currentMarkPrice: number | null;
  currentSymbol: string;
  onRemovePosition: (posId: string) => void;
}

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

function formatTradeQuantity(value: number) {
  return formatDisplayNumber(value, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export function PositionTabs({
  positions,
  currentPrice,
  currentMarkPrice,
  currentSymbol,
  onRemovePosition,
}: PositionTabsProps) {
  const { isLoggedIn, user } = useAuth();
  const { addToast } = useNotification();
  const [activeTab, setActiveTab] = useState<
    "포지션" | "미체결주문" | "거래내역"
  >("포지션");
  const [closeModal, setCloseModal] = useState<Position | null>(null);
  const [closing, setClosing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryItem[]>([]);
  const [feeRate, setFeeRate] = useState(DEFAULT_FEE_RATE);
  const [walletBalance, setWalletBalance] = useState(0);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  const loadWalletBalance = useCallback(async () => {
    if (!user) {
      setWalletBalance(0);
      return;
    }

    const { data } = await supabase
      .from("user_profiles")
      .select("futures_balance")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      setWalletBalance(Number(data.futures_balance) || 0);
    }
  }, [user]);

  const loadPendingOrders = useCallback(async () => {
    if (!user) {
      setPendingOrders([]);
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);

    const { data, error } = await supabase
      .from("futures_orders")
      .select(
        "id, symbol, direction, margin_mode, leverage, size, price, margin, fee, reserved_amount, placed_at",
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("placed_at", { ascending: false });

    if (!error) {
      setPendingOrders(
        (data ?? []).map((order) => ({
          id: String(order.id),
          placedAt: order.placed_at,
          symbol: order.symbol,
          side: order.direction === "long" ? "매수" : "매도",
          price: Number(order.price ?? 0),
          amount: Number(order.size ?? 0),
          leverage: Number(order.leverage ?? 0),
          marginMode: order.margin_mode === "isolated" ? "isolated" : "cross",
          margin: Number(order.margin ?? 0),
          fee: Number(order.fee ?? 0),
          reservedAmount: Number(order.reserved_amount ?? 0),
        })),
      );
    }

    setOrdersLoading(false);
  }, [user]);

  useEffect(() => {
    void loadWalletBalance();
    void loadPendingOrders();

    if (!user) {
      return;
    }

    const reload = () => {
      void loadWalletBalance();
      void loadPendingOrders();
    };

    const interval = setInterval(reload, 3000);
    window.addEventListener("futures-orders-changed", reload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("futures-orders-changed", reload);
    };
  }, [loadPendingOrders, loadWalletBalance, user]);

  // Use MARK PRICE for equity/margin ratio display
  // Liquidation is handled by the backend worker — NOT by the frontend
  const accountMetrics = useMemo(() => {
    const crossPositions = positions.filter(
      (pos) => pos.marginMode !== "isolated",
    );

    if (crossPositions.length === 0 || walletBalance <= 0) {
      return null;
    }

    const effectiveMarkPrice = currentMarkPrice ?? currentPrice;
    const riskPositions: OpenPositionForRisk[] = crossPositions.map((pos) => ({
      direction: pos.type === "롱" ? ("long" as const) : ("short" as const),
      size: pos.size,
      entryPrice: pos.entryPrice,
      margin: pos.margin,
      markPrice:
        pos.symbol === currentSymbol && effectiveMarkPrice
          ? effectiveMarkPrice
          : pos.markPrice,
      marginMode: pos.marginMode,
    }));

    return computeCrossMarginAccountMetrics(walletBalance, riskPositions);
  }, [positions, walletBalance, currentMarkPrice, currentPrice, currentSymbol]);

  // Dynamically compute cross liquidation prices using current account equity
  const crossLiqPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    const crossPositions = positions.filter(
      (pos) => pos.marginMode !== "isolated",
    );

    if (crossPositions.length === 0 || walletBalance <= 0) {
      return map;
    }

    const totalCrossMargins = crossPositions.reduce(
      (sum, p) => sum + (p.margin || 0),
      0,
    );
    const totalCrossFees = crossPositions.reduce(
      (sum, p) => sum + (p.fee || 0),
      0,
    );
    const binanceWB = getBinanceStyleWalletBalance(
      walletBalance,
      totalCrossMargins,
      totalCrossFees,
    );
    const accountEquity = binanceWB - totalCrossFees;

    for (const pos of crossPositions) {
      const liqPrice = getEstimatedCrossLiquidationPrice({
        accountEquity,
        direction: pos.type === "롱" ? "long" : "short",
        entryPrice: pos.entryPrice,
        size: pos.size,
      });
      map.set(pos.id, liqPrice);
    }

    return map;
  }, [positions, walletBalance]);

  // Poll for backend-triggered liquidations: check if positions were closed
  useEffect(() => {
    if (!user || positions.length === 0) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("futures_positions")
        .select("id, status")
        .eq("user_id", user.id)
        .in(
          "id",
          positions.map((p) => Number(p.id)),
        )
        .neq("status", "open");

      if (data && data.length > 0) {
        for (const closed of data) {
          onRemovePosition(String(closed.id));
          if (closed.status === "liquidated") {
            addToast({
              title: "강제 청산",
              message: `포지션 #${closed.id}이 증거금 비율 초과로 청산되었습니다.`,
              type: "error",
            });
          }
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [user, positions, onRemovePosition, addToast]);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["taker_fee", "futures_fee"])
      .then(({ data }) => {
        const settings = (
          (data as Array<{
            key: string;
            value: string | number | null;
          }> | null) || []
        ).reduce<Record<string, string>>((acc, row) => {
          acc[row.key] = String(row.value ?? "");
          return acc;
        }, {});
        setFeeRate(resolveFuturesFeeRate(settings));
      });
  }, []);

  const loadTradeHistory = useCallback(async () => {
    if (!user) {
      setTradeHistory([]);
      return;
    }

    setHistoryLoading(true);

    const { data, error } = await supabase
      .from("futures_positions")
      .select(
        "id, symbol, direction, size, entry_price, exit_price, fee, pnl, status, closed_at, opened_at, leverage, margin_mode, margin",
      )
      .eq("user_id", user.id)
      .in("status", ["closed", "liquidated"])
      .order("closed_at", { ascending: false })
      .limit(30);

    if (error) {
      setHistoryLoading(false);
      return;
    }

    setTradeHistory(
      (data ?? []).map((item) => ({
        id: String(item.id),
        openedAt: item.opened_at,
        closedAt: item.closed_at,
        symbol: item.symbol,
        side: item.direction === "long" ? "매수" : "매도",
        entryPrice: Number(item.entry_price ?? 0),
        exitPrice: Number(item.exit_price ?? item.entry_price ?? 0),
        amount: Number(item.size ?? 0),
        fee: Number(item.fee ?? 0),
        realizedPnl: Number(item.pnl ?? 0),
        leverage: Number(item.leverage ?? 0),
        marginMode: item.margin_mode === "isolated" ? "isolated" : "cross",
        roe:
          Number(item.margin ?? 0) > 0
            ? (Number(item.pnl ?? 0) / Number(item.margin ?? 0)) * 100
            : 0,
        status: item.status === "liquidated" ? "liquidated" : "closed",
      })),
    );
    setHistoryLoading(false);
  }, [user]);

  useEffect(() => {
    void loadTradeHistory();
  }, [loadTradeHistory]);

  const tabs = useMemo(
    () => [
      { id: "포지션" as const, label: `포지션 (${positions.length})` },
      {
        id: "미체결주문" as const,
        label: `미체결 주문 (${pendingOrders.length})`,
      },
      { id: "거래내역" as const, label: `거래 내역 (${tradeHistory.length})` },
    ],
    [positions.length, pendingOrders.length, tradeHistory.length],
  );

  const handleClosePosition = useCallback(async () => {
    if (!closeModal) return;

    setClosing(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("로그인이 필요합니다.");
      }

      const response = await fetch("/api/futures/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          positionId: Number(closeModal.id),
          exitPrice:
            closeModal.symbol === currentSymbol && currentPrice
              ? currentPrice
              : closeModal.markPrice,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "포지션 청산에 실패했습니다.");
      }

      onRemovePosition(closeModal.id);
      setCloseModal(null);
      await loadTradeHistory();
      addToast({
        title: "청산 완료",
        message: `${closeModal.symbol} 포지션이 청산되었습니다.`,
        type: "success",
      });
    } catch (error) {
      addToast({
        title: "청산 실패",
        message:
          error instanceof Error
            ? error.message
            : "포지션 청산 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setClosing(false);
    }
  }, [
    addToast,
    closeModal,
    currentPrice,
    currentSymbol,
    loadTradeHistory,
    onRemovePosition,
  ]);

  const handleCancelOrder = useCallback(
    async (order: PendingOrderItem) => {
      if (!user) return;

      setCancelingOrderId(order.id);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("로그인이 필요합니다.");
        }

        const response = await fetch("/api/futures/orders/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            orderId: Number(order.id),
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "주문 취소에 실패했습니다.");
        }

        setPendingOrders((prevOrders) =>
          prevOrders.filter((prevOrder) => prevOrder.id !== order.id),
        );
        setWalletBalance(
          (prev) =>
            prev + Number(payload?.refundedAmount ?? order.reservedAmount),
        );
        window.dispatchEvent(new Event("futures-orders-changed"));
        addToast({
          title: "주문 취소 완료",
          message: `${order.symbol} 주문이 취소되었습니다.`,
          type: "success",
        });
      } catch (error) {
        addToast({
          title: "주문 취소 실패",
          message:
            error instanceof Error
              ? error.message
              : "주문 취소 중 오류가 발생했습니다.",
          type: "error",
        });
      } finally {
        setCancelingOrderId(null);
      }
    },
    [addToast, user],
  );

  return (
    <div className="flex h-full flex-col bg-background text-sm">
      <div className="scrollbar-hide shrink-0 overflow-x-auto border-b border-gray-800 px-4 pt-2">
        <div className="flex min-w-max space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                "whitespace-nowrap pb-2 text-xs font-medium transition-colors border-b-2",
                activeTab === tab.id
                  ? "border-yellow-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-hide relative">
        {!isLoggedIn && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <p className="text-gray-400 mb-4">
              {activeTab}을 확인하려면 로그인하세요.
            </p>
            <button
              onClick={() => (window.location.href = "/login")}
              className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-medium rounded transition-colors"
            >
              로그인
            </button>
          </div>
        )}

        {activeTab === "포지션" && accountMetrics && positions.length > 0 && (
          <div className="scrollbar-hide overflow-x-auto border-b border-gray-800 bg-[#0d1117] px-4 py-2 text-xs">
            <div className="flex min-w-max items-center gap-6 whitespace-nowrap">
              <div>
                <span className="text-gray-500 mr-1">Equity</span>
                <span className="text-white font-medium">
                  {formatUsdt(accountMetrics.equity, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">미실현 PnL</span>
                <span
                  className={cn(
                    accountMetrics.unrealizedPnl >= 0
                      ? "text-green-400"
                      : "text-red-400",
                    "font-medium",
                  )}
                >
                  {formatDisplayNumber(accountMetrics.unrealizedPnl, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    signed: true,
                  })}
                </span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">사용 증거금</span>
                <span className="text-gray-300">
                  {formatUsdt(accountMetrics.usedMargin, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">사용 가능</span>
                <span className="text-gray-300">
                  {formatUsdt(accountMetrics.availableBalance, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">증거금 비율</span>
                <span
                  className={cn(
                    accountMetrics.marginRatio >= 80
                      ? "text-red-400"
                      : accountMetrics.marginRatio >= 50
                        ? "text-yellow-400"
                        : "text-green-400",
                    "font-medium",
                  )}
                >
                  {formatDisplayNumber(accountMetrics.marginRatio, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  %
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "포지션" && (
          <div className="scrollbar-hide overflow-x-auto">
            <table className="w-full min-w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-background text-gray-500">
                <tr>
                  <th className="w-[18%] px-4 py-3 font-normal whitespace-nowrap">
                    심볼
                  </th>
                  <th className="w-[10%] px-4 py-3 font-normal whitespace-nowrap">
                    수량
                  </th>
                  <th className="w-[12%] px-4 py-3 font-normal whitespace-nowrap">
                    진입가격
                  </th>
                  <th className="w-[12%] px-4 py-3 font-normal whitespace-nowrap">
                    현재가격
                  </th>
                  <th className="w-[12%] px-4 py-3 font-normal whitespace-nowrap">
                    청산가격
                  </th>
                  <th className="w-[10%] px-4 py-3 font-normal whitespace-nowrap">
                    증거금
                  </th>
                  <th className="w-[16%] px-4 py-3 font-normal whitespace-nowrap">
                    미실현 손익 (ROE%)
                  </th>
                  <th className="w-[10%] px-4 py-3 text-right font-normal whitespace-nowrap">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      진행중인 포지션이 없습니다.
                    </td>
                  </tr>
                ) : (
                  positions.map((pos) => {
                    const markPrice =
                      pos.symbol === currentSymbol && currentPrice
                        ? currentPrice
                        : pos.markPrice;
                    const pnl =
                      pos.type === "롱"
                        ? (markPrice - pos.entryPrice) * pos.size
                        : (pos.entryPrice - markPrice) * pos.size;
                    const roe = pos.margin > 0 ? (pnl / pos.margin) * 100 : 0;

                    return (
                      <tr
                        key={pos.id}
                        className="border-t border-gray-800/50 hover:bg-gray-800/30"
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-200">
                              {pos.symbol}
                            </span>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px]",
                                pos.type === "롱"
                                  ? "bg-green-500/20 text-green-500"
                                  : "bg-red-500/20 text-red-500",
                              )}
                            >
                              {pos.leverage}x {pos.type}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300">
                              {pos.marginMode === "isolated" ? "격리" : "교차"}
                            </span>
                          </div>
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 whitespace-nowrap align-top",
                            pos.type === "롱"
                              ? "text-green-500"
                              : "text-red-500",
                          )}
                        >
                          {formatTradeQuantity(pos.size)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                          {formatTradePrice(pos.entryPrice)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                          {formatTradePrice(markPrice)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap align-top text-yellow-500">
                          {formatTradePrice(
                            pos.marginMode === "cross"
                              ? (crossLiqPriceMap.get(pos.id) ?? pos.liqPrice)
                              : pos.liqPrice,
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                          {formatUsdt(pos.margin, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 whitespace-nowrap align-top",
                            pnl >= 0 ? "text-green-500" : "text-red-500",
                          )}
                        >
                          {formatDisplayNumber(pnl, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            signed: true,
                          })}{" "}
                          (
                          {formatDisplayNumber(roe, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            signed: true,
                          })}
                          %)
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap align-top">
                          <button
                            onClick={() => setCloseModal(pos)}
                            className="text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
                          >
                            청산
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "미체결주문" && (
          <div className="scrollbar-hide overflow-x-auto">
            <table className="w-full min-w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-background text-gray-500">
                <tr>
                  <th className="w-[16%] px-4 py-3 font-normal whitespace-nowrap">
                    시간
                  </th>
                  <th className="w-[18%] px-4 py-3 font-normal whitespace-nowrap">
                    심볼
                  </th>
                  <th className="w-[10%] px-4 py-3 font-normal whitespace-nowrap">
                    방향
                  </th>
                  <th className="w-[12%] px-4 py-3 font-normal whitespace-nowrap">
                    주문가격
                  </th>
                  <th className="w-[10%] px-4 py-3 font-normal whitespace-nowrap">
                    수량
                  </th>
                  <th className="w-[12%] px-4 py-3 font-normal whitespace-nowrap">
                    증거금
                  </th>
                  <th className="w-[12%] px-4 py-3 font-normal whitespace-nowrap">
                    예약금액
                  </th>
                  <th className="w-[10%] px-4 py-3 text-right font-normal whitespace-nowrap">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      미체결 주문을 불러오는 중입니다.
                    </td>
                  </tr>
                ) : pendingOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      현재 미체결 주문이 없습니다.
                    </td>
                  </tr>
                ) : (
                  pendingOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-t border-gray-800/50 hover:bg-gray-800/30"
                    >
                      <td className="px-4 py-3 align-top text-gray-400">
                        <DateTimeText
                          value={order.placedAt}
                          className="whitespace-nowrap"
                        />
                      </td>
                      <td className="px-4 py-3 align-top font-semibold text-gray-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{order.symbol}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300">
                            {order.leverage}x{" "}
                            {order.marginMode === "isolated" ? "격리" : "교차"}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 whitespace-nowrap",
                          order.side === "매수"
                            ? "text-green-500"
                            : "text-red-500",
                        )}
                      >
                        {order.side}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                        {formatTradePrice(order.price)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                        {formatTradeQuantity(order.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                        {formatUsdt(order.margin, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-yellow-400">
                        {formatUsdt(order.reservedAmount, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <ActionButton
                          onClick={() => handleCancelOrder(order)}
                          disabled={cancelingOrderId === order.id}
                          className="text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancelingOrderId === order.id
                            ? "취소 중..."
                            : "취소"}
                        </ActionButton>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "거래내역" && (
          <div className="scrollbar-hide overflow-x-auto">
            <table className="w-full min-w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-background text-gray-500">
                <tr>
                  <th className="w-[16%] px-4 py-3 font-normal whitespace-nowrap">
                    시간
                  </th>
                  <th className="w-[16%] px-4 py-3 font-normal whitespace-nowrap">
                    심볼
                  </th>
                  <th className="w-[9%] px-4 py-3 font-normal whitespace-nowrap">
                    포지션
                  </th>
                  <th className="w-[9%] px-4 py-3 font-normal whitespace-nowrap">
                    마진모드
                  </th>
                  <th className="w-[8%] px-4 py-3 font-normal whitespace-nowrap">
                    레버리지
                  </th>
                  <th className="w-[10%] px-4 py-3 font-normal whitespace-nowrap">
                    진입가격
                  </th>
                  <th className="w-[10%] px-4 py-3 font-normal whitespace-nowrap">
                    종료가격
                  </th>
                  <th className="w-[8%] px-4 py-3 font-normal whitespace-nowrap">
                    수량
                  </th>
                  <th className="w-[8%] px-4 py-3 font-normal whitespace-nowrap">
                    수수료
                  </th>
                  <th className="w-[10%] px-4 py-3 font-normal whitespace-nowrap">
                    실현손익
                  </th>
                  <th className="w-[6%] px-4 py-3 text-right font-normal whitespace-nowrap">
                    ROE
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      거래 내역을 불러오는 중입니다.
                    </td>
                  </tr>
                ) : tradeHistory.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      거래 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  tradeHistory.map((trade) => (
                    <tr
                      key={trade.id}
                      className="border-t border-gray-800/50 hover:bg-gray-800/30"
                    >
                      <td className="px-4 py-3 align-top text-gray-400">
                        <div className="flex flex-col gap-1">
                          <DateTimeText
                            value={trade.closedAt}
                            className="whitespace-nowrap"
                          />
                          <span className="text-[11px] text-gray-500">
                            오픈 <DateTimeText value={trade.openedAt} />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top font-semibold text-gray-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{trade.symbol}</span>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px]",
                              trade.status === "liquidated"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-gray-700 text-gray-300",
                            )}
                          >
                            {trade.status === "liquidated"
                              ? "강제청산"
                              : "종료"}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 whitespace-nowrap align-top",
                          trade.side === "매수"
                            ? "text-green-500"
                            : "text-red-500",
                        )}
                      >
                        {trade.side}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                        {trade.marginMode === "isolated" ? "격리" : "교차"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                        {trade.leverage}x
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                        {formatTradePrice(trade.entryPrice)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                        {formatTradePrice(trade.exitPrice)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top text-gray-300">
                        {formatTradeQuantity(trade.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top text-gray-400">
                        {formatDisplayNumber(trade.fee, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 whitespace-nowrap align-top",
                          trade.realizedPnl >= 0
                            ? "text-green-500"
                            : "text-red-500",
                        )}
                      >
                        {formatDisplayNumber(trade.realizedPnl, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          signed: true,
                        })}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right whitespace-nowrap align-top",
                          trade.roe >= 0 ? "text-green-500" : "text-red-500",
                        )}
                      >
                        {formatDisplayNumber(trade.roe, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          signed: true,
                        })}
                        %
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {closeModal &&
        (() => {
          const markPrice =
            closeModal.symbol === currentSymbol && currentPrice
              ? currentPrice
              : closeModal.markPrice;
          const pnl =
            closeModal.type === "롱"
              ? (markPrice - closeModal.entryPrice) * closeModal.size
              : (closeModal.entryPrice - markPrice) * closeModal.size;
          const roe =
            closeModal.margin > 0 ? (pnl / closeModal.margin) * 100 : 0;
          const closeFee = markPrice * closeModal.size * feeRate;
          const expectedReturn = closeModal.margin + pnl - closeFee;

          return (
            <UserModal
              isOpen={true}
              onClose={() => !closing && setCloseModal(null)}
              title={`${closeModal.symbol} ${closeModal.type === "롱" ? "매수" : "매도"} 청산 확인`}
              description="현재 마크가격 기준 손익과 반환 예정 금액을 확인한 뒤 청산을 확정합니다."
              size="md"
              footer={
                <div className="flex gap-2">
                  <button
                    onClick={() => !closing && setCloseModal(null)}
                    className="flex-1 rounded-full border border-white/8 bg-white/3 py-2.5 text-sm text-white transition-colors hover:bg-white/5"
                    disabled={closing}
                  >
                    취소
                  </button>
                  <ActionButton
                    onClick={handleClosePosition}
                    className="flex-1 rounded-full bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
                    disabled={closing}
                  >
                    {closing ? "처리 중..." : "청산 확인"}
                  </ActionButton>
                </div>
              }
            >
              <FuturesCloseConfirmContent
                marginMode={closeModal.marginMode}
                markPrice={markPrice}
                entryPrice={closeModal.entryPrice}
                margin={closeModal.margin}
                size={closeModal.size}
                pnl={pnl}
                roe={roe}
                feeRate={feeRate}
                closeFee={closeFee}
                expectedReturn={expectedReturn}
              />
            </UserModal>
          );
        })()}
    </div>
  );
}
