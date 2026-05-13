"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserModal } from "@/components/ui/UserModal";
import { ActionButton } from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import { resolveFuturesFeeRate } from "@/lib/utils/siteSettings";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";
import {
  getBinanceStyleWalletBalance,
  getEstimatedCrossLiquidationPrice,
  getEstimatedIsolatedLiquidationPrice,
  computeCrossMarginAccountMetrics,
  type FuturesMarginMode,
  type OpenPositionForRisk,
} from "@/lib/utils/futuresRisk";
import type { Position, BinanceTickerData } from "@/types";

const supabase = createClient();
const DEFAULT_FEE_RATE = 0.00035;
const QTY_PERCENTS = [10, 30, 50, 75] as const;
const LEV_PRESETS = [5, 10, 25, 50] as const;

interface OrderPanelProps {
  currentPrice: number | null;
  /**
   * Price selected by the user in the order book. Pair this with
   * `orderPriceTick` so that clicking the same price twice still re-applies
   * the value (the tick should increment on every click).
   */
  orderPrice: number | null;
  orderPriceTick?: number;
  symbol: string;
  ticker: BinanceTickerData | null;
  onAddPosition: (pos: Position) => void;
}

type OpenPositionSnapshot = OpenPositionForRisk & {
  _symbol: string;
  _fee: number;
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

function formatTradeQuantity(value: number) {
  return formatDisplayNumber(value, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatPlainInput(value: number, fractionDigits: number) {
  return formatDisplayNumber(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  });
}

function getTradePriceInputDigits(value: number) {
  if (value >= 1000) {
    return 2;
  }

  if (value >= 1) {
    return 4;
  }

  return 6;
}

export function OrderPanel({
  currentPrice,
  orderPrice,
  orderPriceTick,
  symbol,
  onAddPosition,
}: OrderPanelProps) {
  const { isLoggedIn, user } = useAuth();
  const { addToast } = useNotification();
  const [side, setSide] = useState<"매수" | "매도">("매수");
  const [marginMode, setMarginMode] = useState<FuturesMarginMode>("cross");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [leverage, setLeverage] = useState(10);
  const [qty, setQty] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [marginInput, setMarginInput] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [openPositionsForRisk, setOpenPositionsForRisk] = useState<
    OpenPositionSnapshot[]
  >([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [feeRate, setFeeRate] = useState(DEFAULT_FEE_RATE);

  const loadAccountSnapshot = useCallback(async () => {
    if (!user) {
      setWalletBalance(0);
      setOpenPositionsForRisk([]);
      return;
    }

    const [profileResult, positionsResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("futures_balance")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("futures_positions")
        .select(
          "direction, size, entry_price, margin, fee, symbol, margin_mode",
        )
        .eq("user_id", user.id)
        .eq("status", "open"),
    ]);

    if (profileResult.data) {
      setWalletBalance(Number(profileResult.data.futures_balance) || 0);
    }

    if (positionsResult.data) {
      setOpenPositionsForRisk(
        positionsResult.data.map(
          (p: {
            direction: string;
            size: number | string;
            entry_price: number | string;
            margin: number | string;
            fee: number | string;
            symbol: string;
            margin_mode?: FuturesMarginMode | null;
          }) => ({
            direction: p.direction as "long" | "short",
            size: Number(p.size),
            entryPrice: Number(p.entry_price),
            margin: Number(p.margin),
            markPrice: Number(p.entry_price),
            marginMode: p.margin_mode === "isolated" ? "isolated" : "cross",
            _symbol: p.symbol,
            _fee: Number(p.fee || 0),
          }),
        ),
      );
    }
  }, [user]);

  useEffect(() => {
    void loadAccountSnapshot();

    if (!user) {
      return;
    }

    const interval = setInterval(() => {
      void loadAccountSnapshot();
    }, 3000);

    return () => clearInterval(interval);
  }, [loadAccountSnapshot, user]);

  // When switching into limit mode, auto-fill the price with the current
  // market price if the user has not typed one yet. This avoids the case where
  // the field stays empty (or holds a stale tiny value) and produces an
  // unrealistically large position size on confirm.
  useEffect(() => {
    if (
      orderType === "limit" &&
      !priceInput &&
      currentPrice &&
      currentPrice > 0
    ) {
      setPriceInput(
        formatPlainInput(currentPrice, getTradePriceInputDigits(currentPrice)),
      );
    }
  }, [currentPrice, orderType, priceInput]);

  // When the user clicks a price in the order book, jump into limit mode and
  // load that exact price into the price input. We key the effect on the
  // monotonically-increasing `orderPriceTick` so that re-clicking the same
  // price still triggers a sync.
  useEffect(() => {
    if (orderPriceTick === undefined) return;
    if (orderPrice == null || !Number.isFinite(orderPrice) || orderPrice <= 0) {
      return;
    }
    setOrderType("limit");
    setPriceInput(
      formatPlainInput(orderPrice, getTradePriceInputDigits(orderPrice)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderPriceTick]);

  const crossPositionsForRisk = useMemo(
    () => openPositionsForRisk.filter((p) => p.marginMode !== "isolated"),
    [openPositionsForRisk],
  );

  const accountMetrics = useMemo(() => {
    const positionsWithPrice = crossPositionsForRisk.map((p) => ({
      ...p,
      markPrice:
        p._symbol === symbol && currentPrice ? currentPrice : p.markPrice,
    }));
    return computeCrossMarginAccountMetrics(walletBalance, positionsWithPrice);
  }, [walletBalance, crossPositionsForRisk, currentPrice, symbol]);

  const userBalance = accountMetrics.availableBalance;

  const effectivePrice =
    orderType === "limit"
      ? Number(priceInput.replace(/,/g, "")) || 0
      : (currentPrice ?? 0);

  // Warn the user when a limit price differs from the live market price by
  // more than 10%. This is the typical "fat-finger" guard exchanges show, and
  // it directly prevents the case where a hand-typed price like 200 USDT for
  // BTC (vs. market ~65,000 USDT) produces an absurd 49 BTC quantity.
  const priceDeviationPercent =
    orderType === "limit" &&
    effectivePrice > 0 &&
    currentPrice &&
    currentPrice > 0
      ? ((effectivePrice - currentPrice) / currentPrice) * 100
      : null;
  const priceDeviationWarning =
    priceDeviationPercent != null && Math.abs(priceDeviationPercent) >= 10;
  const qtyNum = Number(qty.replace(/,/g, "")) || 0;
  const positionValue = effectivePrice * qtyNum;
  const margin = useMemo(() => {
    if (effectivePrice <= 0 || leverage <= 0 || qtyNum <= 0) return 0;
    return positionValue / leverage;
  }, [effectivePrice, leverage, positionValue, qtyNum]);
  const fee = positionValue * feeRate;
  const totalCost = margin + fee;
  const availableMargin = userBalance > 0 ? userBalance / (1 + feeRate) : 0;
  const maxQty =
    effectivePrice > 0 && leverage > 0
      ? (availableMargin * leverage) / effectivePrice
      : 0;
  const liqPrice = useMemo(() => {
    if (effectivePrice <= 0 || qtyNum <= 0) return 0;

    if (marginMode === "isolated") {
      return getEstimatedIsolatedLiquidationPrice({
        direction: side === "매수" ? "long" : "short",
        entryPrice: effectivePrice,
        size: qtyNum,
        margin,
      });
    }

    // Binance-style WB = our wallet_balance + SUM(existing open margins + fees)
    const existingMargins = crossPositionsForRisk.reduce(
      (sum, p) => sum + (Number(p.margin) || 0),
      0,
    );
    const existingFees = crossPositionsForRisk.reduce(
      (sum, p) => sum + (Number(p._fee) || 0),
      0,
    );
    const binanceWB = getBinanceStyleWalletBalance(
      walletBalance,
      existingMargins,
      existingFees,
    );
    // After new position opens, Binance WB decreases only by new fee
    const accountEquity = binanceWB - fee;

    return getEstimatedCrossLiquidationPrice({
      accountEquity,
      direction: side === "매수" ? "long" : "short",
      entryPrice: effectivePrice,
      size: qtyNum,
    });
  }, [
    crossPositionsForRisk,
    effectivePrice,
    fee,
    margin,
    marginMode,
    qtyNum,
    side,
    walletBalance,
  ]);

  useEffect(() => {
    const nextMargin = Number(marginInput.replace(/,/g, "")) || 0;
    if (effectivePrice <= 0 || leverage <= 0) return;
    if (nextMargin <= 0) {
      if (!marginInput) setQty("");
      return;
    }
    setQty(formatPlainInput((nextMargin * leverage) / effectivePrice, 4));
  }, [effectivePrice, leverage, marginInput]);

  const handleQtyChange = (value: string) => {
    setQty(value);
    const nextQty = Number(value.replace(/,/g, "")) || 0;
    if (effectivePrice <= 0 || leverage <= 0 || nextQty <= 0) {
      setMarginInput("");
      return;
    }
    setMarginInput(formatPlainInput((nextQty * effectivePrice) / leverage, 2));
  };

  const handleMarginChange = (value: string) => {
    setMarginInput(value);
    const nextMargin = Number(value.replace(/,/g, "")) || 0;
    if (effectivePrice <= 0 || leverage <= 0 || nextMargin <= 0) {
      setQty("");
      return;
    }
    setQty(formatPlainInput((nextMargin * leverage) / effectivePrice, 4));
  };

  const setQtyPercent = (percent: number) => {
    if (effectivePrice <= 0 || leverage <= 0 || userBalance <= 0) return;
    const nextMargin = availableMargin * (percent / 100);
    setMarginInput(formatPlainInput(nextMargin, 2));
    setQty(formatPlainInput((nextMargin * leverage) / effectivePrice, 4));
  };

  const handleOrder = () => {
    if (qtyNum <= 0 || effectivePrice <= 0) return;
    if (totalCost > userBalance) {
      addToast({
        title: "주문 실패",
        message: "사용 가능한 잔액이 부족합니다.",
        type: "error",
      });
      return;
    }
    setShowConfirm(true);
  };

  const confirmOrder = useCallback(async () => {
    if (!user || qtyNum <= 0 || effectivePrice <= 0) return;

    setOrderLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("로그인이 필요합니다.");
      }

      const response = await fetch("/api/futures/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          symbol,
          direction: side === "매수" ? "long" : "short",
          marginMode,
          leverage,
          size: qtyNum,
          entryPrice: effectivePrice,
          orderType,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "주문을 처리하지 못했습니다.");
      }

      if (payload?.position) {
        const inserted = payload.position;
        const deductedMargin = Number(
          payload.deductedMargin ?? inserted.margin ?? margin,
        );
        const positionMargin = Number(inserted.margin ?? margin);

        onAddPosition({
          id: String(inserted.id),
          symbol: inserted.symbol,
          type: inserted.direction === "long" ? "롱" : "숏",
          marginMode:
            inserted.margin_mode === "isolated" ? "isolated" : "cross",
          size: Number(inserted.size),
          entryPrice: Number(inserted.entry_price),
          markPrice: currentPrice ?? Number(inserted.entry_price),
          liqPrice: Number(inserted.liquidation_price),
          marginRatio:
            userBalance > 0 ? (positionMargin / userBalance) * 100 : 0,
          margin: positionMargin,
          fee: Number(inserted.fee ?? 0),
          pnl: 0,
          pnlPercent: 0,
          leverage: Number(inserted.leverage),
        });

        setWalletBalance((prev) => Math.max(0, prev - deductedMargin));
        setOpenPositionsForRisk((prev) => [
          ...prev,
          {
            direction: inserted.direction as "long" | "short",
            size: Number(inserted.size),
            entryPrice: Number(inserted.entry_price),
            margin: positionMargin,
            markPrice: currentPrice ?? Number(inserted.entry_price),
            marginMode:
              inserted.margin_mode === "isolated" ? "isolated" : "cross",
            _symbol: inserted.symbol,
            _fee: Number(inserted.fee ?? fee),
          },
        ]);
        setQty("");
        setMarginInput("");
        if (orderType === "limit" && currentPrice && currentPrice > 0) {
          setPriceInput(
            formatPlainInput(
              currentPrice,
              getTradePriceInputDigits(currentPrice),
            ),
          );
        }
        setShowConfirm(false);
        addToast({
          title: "주문 완료",
          message: `${inserted.symbol} ${inserted.direction === "long" ? "롱" : "숏"} 포지션이 생성되었습니다.`,
          type: "success",
        });
      } else if (payload?.order) {
        const reservedAmount = Number(payload.reservedAmount ?? totalCost);

        setWalletBalance((prev) => Math.max(0, prev - reservedAmount));
        setQty("");
        setMarginInput("");
        if (orderType === "limit" && currentPrice && currentPrice > 0) {
          setPriceInput(
            formatPlainInput(
              currentPrice,
              getTradePriceInputDigits(currentPrice),
            ),
          );
        }
        setShowConfirm(false);
        window.dispatchEvent(new Event("futures-orders-changed"));
        addToast({
          title: "지정가 주문 접수",
          message: `${symbol} ${side === "매수" ? "매수" : "매도"} 지정가 주문이 등록되었습니다.`,
          type: "success",
        });
      } else {
        throw new Error("주문 응답 형식이 올바르지 않습니다.");
      }
    } catch (error) {
      addToast({
        title: "주문 실패",
        message:
          error instanceof Error
            ? error.message
            : "주문 처리 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setOrderLoading(false);
    }
  }, [
    addToast,
    currentPrice,
    effectivePrice,
    leverage,
    margin,
    marginMode,
    onAddPosition,
    orderType,
    priceInput,
    qtyNum,
    side,
    symbol,
    totalCost,
    user,
    userBalance,
  ]);

  return (
    <div className="relative h-full w-full shrink-0 overflow-y-auto bg-background text-sm lg:w-75">
      <div className="p-3 space-y-2 border-b border-gray-800">
        <div className="flex gap-2">
          <div className="flex bg-gray-900 rounded p-0.5 border border-gray-800">
            <button
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors",
                marginMode === "cross"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300",
              )}
              onClick={() => setMarginMode("cross")}
            >
              교차
            </button>
            <button
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors",
                marginMode === "isolated"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300",
              )}
              onClick={() => setMarginMode("isolated")}
            >
              격리
            </button>
          </div>
          <div className="flex bg-gray-900 rounded p-0.5 border border-gray-800">
            <button
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors",
                side === "매수"
                  ? "bg-green-600 text-white"
                  : "text-gray-500 hover:text-gray-300",
              )}
              onClick={() => setSide("매수")}
            >
              매수
            </button>
            <button
              className={cn(
                "px-3 py-1 text-xs rounded font-medium transition-colors",
                side === "매도"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:text-gray-300",
              )}
              onClick={() => setSide("매도")}
            >
              매도
            </button>
          </div>
        </div>
        <div className="flex bg-gray-900 rounded p-0.5 border border-gray-800 w-fit">
          <button
            className={cn(
              "px-3 py-1 text-xs rounded font-medium transition-colors",
              orderType === "market"
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300",
            )}
            onClick={() => setOrderType("market")}
          >
            시장가
          </button>
          <button
            className={cn(
              "px-3 py-1 text-xs rounded font-medium transition-colors",
              orderType === "limit"
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300",
            )}
            onClick={() => setOrderType("limit")}
          >
            지정가
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-3 py-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
            <span>사용 가능:</span>
            <span className="shrink-0 whitespace-nowrap text-gray-300">
              {isLoggedIn
                ? formatUsdt(accountMetrics.availableBalance, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : formatUsdt(0, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </span>
          </div>
          {isLoggedIn && crossPositionsForRisk.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>Equity:</span>
                <span className="shrink-0 whitespace-nowrap text-gray-300">
                  {formatUsdt(accountMetrics.equity, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>미실현 PnL:</span>
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap",
                    accountMetrics.unrealizedPnl >= 0
                      ? "text-green-400"
                      : "text-red-400",
                  )}
                >
                  {formatDisplayNumber(accountMetrics.unrealizedPnl, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    signed: true,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>증거금 비율:</span>
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap",
                    accountMetrics.marginRatio >= 80
                      ? "text-red-400"
                      : accountMetrics.marginRatio >= 50
                        ? "text-yellow-400"
                        : "text-gray-300",
                  )}
                >
                  {formatDisplayNumber(accountMetrics.marginRatio, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  %
                </span>
              </div>
            </>
          )}
        </div>

        <div>
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-gray-900 p-2.5",
              priceDeviationWarning
                ? "border-yellow-500/60"
                : "border-gray-800",
            )}
          >
            <span className="w-14 shrink-0 whitespace-nowrap text-xs text-gray-500">
              가격
            </span>
            <input
              type="text"
              className="min-w-0 flex-1 bg-transparent text-right text-sm text-white outline-none"
              value={
                orderType === "market"
                  ? effectivePrice > 0
                    ? formatTradePrice(effectivePrice)
                    : "-"
                  : priceInput
              }
              onChange={(e) => setPriceInput(e.target.value)}
              readOnly={orderType === "market"}
              disabled={orderType === "market" || !isLoggedIn || orderLoading}
              placeholder={orderType === "market" ? "-" : "0.00"}
            />
            <span className="ml-1 shrink-0 whitespace-nowrap text-xs text-gray-500">
              USDT
            </span>
          </div>
          {priceDeviationWarning && priceDeviationPercent != null && (
            <p className="mt-1 text-[10px] text-yellow-400">
              ⚠ 시장가({currentPrice ? formatTradePrice(currentPrice) : "-"} USDT) 대비{" "}
              {formatDisplayNumber(priceDeviationPercent, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                signed: true,
              })}
              % 차이가 있습니다. 가격을 다시 확인해주세요.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-2.5 focus-within:border-yellow-500/50">
          <span className="w-14 shrink-0 whitespace-nowrap text-xs text-gray-500">
            수량
          </span>
          <input
            type="text"
            className="min-w-0 flex-1 bg-transparent text-right text-sm text-white outline-none"
            value={qty}
            onChange={(e) => handleQtyChange(e.target.value)}
            disabled={!isLoggedIn || orderLoading}
            placeholder="0.0000"
          />
          <span className="ml-1 shrink-0 whitespace-nowrap text-xs text-gray-500">
            {symbol.replace("USDT", "")}
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-2.5 focus-within:border-yellow-500/50">
          <span className="w-14 shrink-0 whitespace-nowrap text-xs text-gray-500">
            증거금
          </span>
          <input
            type="text"
            className="min-w-0 flex-1 bg-transparent text-right text-sm text-white outline-none"
            value={marginInput}
            onChange={(e) => handleMarginChange(e.target.value)}
            disabled={!isLoggedIn || orderLoading}
            placeholder="0.00"
          />
          <span className="ml-1 shrink-0 whitespace-nowrap text-xs text-gray-500">
            USDT
          </span>
        </div>

        <div className="flex gap-1.5">
          {QTY_PERCENTS.map((percent) => (
            <button
              key={percent}
              onClick={() => setQtyPercent(percent)}
              disabled={!isLoggedIn || orderLoading}
              className="flex-1 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors disabled:opacity-50"
            >
              {percent}%
            </button>
          ))}
          <button
            onClick={() => setQtyPercent(100)}
            disabled={!isLoggedIn || orderLoading}
            className="flex-1 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-yellow-500 hover:text-yellow-400 rounded transition-colors font-medium disabled:opacity-50"
          >
            MAX
          </button>
        </div>

        <div className="mt-1">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>레버리지:</span>
            <span className="text-yellow-500 font-medium">{leverage}x</span>
          </div>
          <input
            type="range"
            min="1"
            max="125"
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-yellow-500 cursor-pointer"
            disabled={!isLoggedIn || orderLoading}
          />
          <div className="flex gap-1 mt-2">
            {LEV_PRESETS.map((value) => (
              <button
                key={value}
                onClick={() => setLeverage(value)}
                disabled={orderLoading}
                className={cn(
                  "flex-1 py-1 text-[10px] rounded transition-colors disabled:opacity-50",
                  leverage === value
                    ? "bg-yellow-500/20 text-yellow-500"
                    : "bg-gray-800 text-gray-500 hover:text-white",
                )}
              >
                {value}x
              </button>
            ))}
            <button
              onClick={() => setLeverage(125)}
              disabled={orderLoading}
              className={cn(
                "flex-1 py-1 text-[10px] rounded transition-colors font-medium disabled:opacity-50",
                leverage === 125
                  ? "bg-yellow-500/20 text-yellow-500"
                  : "bg-gray-800 text-gray-500 hover:text-white",
              )}
            >
              MAX
            </button>
          </div>
        </div>

        <div className="mt-1 space-y-1 text-xs text-gray-500">
          <div className="flex items-center justify-between gap-3">
            <span>
              수수료 (
              {formatDisplayNumber(feeRate * 100, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}
              %)
            </span>
            <span className="shrink-0 whitespace-nowrap">
              {formatUsdt(fee, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>주문비용</span>
            <span className="shrink-0 whitespace-nowrap">
              {formatUsdt(totalCost > 0 ? totalCost : 0, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>최대</span>
            <span className="shrink-0 whitespace-nowrap">
              {isLoggedIn
                ? formatTradeQuantity(maxQty)
                : formatTradeQuantity(0)}{" "}
              {symbol.replace("USDT", "")}
            </span>
          </div>
        </div>

        <div className="mt-auto pb-3">
          {isLoggedIn ? (
            <ActionButton
              onClick={handleOrder}
              disabled={
                orderLoading ||
                qtyNum <= 0 ||
                effectivePrice <= 0 ||
                margin <= 0 ||
                totalCost > userBalance
              }
              className={cn(
                "w-full whitespace-nowrap rounded py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                side === "매수"
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-red-500 hover:bg-red-600 text-white",
              )}
            >
              {orderType === "limit" ? "지정가 주문" : "주문하기"}
            </ActionButton>
          ) : (
            <button
              onClick={() => (window.location.href = "/login")}
              className="w-full whitespace-nowrap rounded bg-yellow-500 py-3 text-sm font-bold text-black transition-colors hover:bg-yellow-600"
            >
              로그인 후 거래 가능
            </button>
          )}
        </div>
      </div>

      {showConfirm && (
        <UserModal
          isOpen={showConfirm}
          onClose={() => !orderLoading && setShowConfirm(false)}
          title={`${symbol} ${side === "매수" ? "매수(롱)" : "매도(숏)"} 주문 확인`}
          description="주문 유형, 증거금, 수수료와 예상 청산가를 확인한 뒤 주문을 확정합니다."
          size="sm"
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => !orderLoading && setShowConfirm(false)}
                className="flex-1 rounded-full border border-white/8 bg-white/3 py-2.5 text-sm text-white transition-colors hover:bg-white/5"
                disabled={orderLoading}
              >
                취소
              </button>
              <ActionButton
                onClick={confirmOrder}
                disabled={orderLoading}
                className={cn(
                  "flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
                  side === "매수"
                    ? "bg-green-500 text-white hover:bg-green-400"
                    : "bg-red-500 text-white hover:bg-red-400",
                )}
              >
                {orderLoading ? "처리 중..." : "주문 확인"}
              </ActionButton>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">주문유형</div>
                <div className="text-white font-medium">
                  {orderType === "limit" ? "지정가" : "시장가"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">마진모드</div>
                <div className="text-white font-medium">
                  {marginMode === "isolated" ? "격리" : "교차"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">진입가격</div>
                <div className="text-white font-medium">
                  {formatTradePrice(effectivePrice)} USDT
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">수량</div>
                <div className="text-white font-medium">
                  {formatTradeQuantity(qtyNum)} {symbol.replace("USDT", "")}
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">레버리지</div>
                <div className="text-yellow-500 font-medium">{leverage}x</div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <div className="text-gray-500">실제거래액</div>
                <div className="text-white font-medium">
                  {formatUsdt(positionValue, {
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-white/8 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">진입증거금</span>
                <span className="text-white">
                  {formatUsdt(margin, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">
                  수수료 (
                  {formatDisplayNumber(feeRate * 100, {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  })}
                  %)
                </span>
                <span className="text-white">
                  {formatUsdt(fee, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-white">
                  {orderType === "limit" ? "총 예약금액" : "총 필요금액"}
                </span>
                <span className="text-yellow-500">
                  {formatUsdt(totalCost, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">
                  {marginMode === "isolated"
                    ? "격리모드 추정 청산가"
                    : "교차모드 추정 청산가"}
                </span>
                <span className="text-yellow-500">
                  {formatTradePrice(liqPrice)} USDT
                </span>
              </div>
            </div>
          </div>
        </UserModal>
      )}
    </div>
  );
}
