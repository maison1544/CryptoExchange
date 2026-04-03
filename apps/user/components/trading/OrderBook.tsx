"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";
import type { BinanceOrderBookData, BinanceTradeData } from "@/types";

interface OrderBookProps {
  orderBook: BinanceOrderBookData | null;
  recentTrades: BinanceTradeData[];
  currentPrice: number | null;
  prevPrice: number | null;
  isConnected: boolean;
}

const DISPLAY_ROWS = 12;

function formatPrice(price: number): string {
  if (price >= 1000) {
    return formatDisplayNumber(price, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (price >= 1) {
    return formatDisplayNumber(price, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  return formatDisplayNumber(price, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

function formatQty(qty: number): string {
  if (qty >= 1000) {
    return formatDisplayNumber(qty, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return formatDisplayNumber(qty, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function OrderBook({
  orderBook,
  recentTrades,
  currentPrice,
  prevPrice,
  isConnected,
}: OrderBookProps) {
  const [activeTab, setActiveTab] = useState<"호가" | "최근거래">("호가");

  const asks = orderBook?.asks
    ? orderBook.asks
        .slice(0, DISPLAY_ROWS)
        .map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }))
        .reverse()
    : [];

  const bids = orderBook?.bids
    ? orderBook.bids
        .slice(0, DISPLAY_ROWS)
        .map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }))
    : [];

  const maxAskQty = Math.max(...asks.map((a) => a.qty), 0.001);
  const maxBidQty = Math.max(...bids.map((b) => b.qty), 0.001);

  const priceDirection =
    currentPrice && prevPrice
      ? currentPrice >= prevPrice
        ? "up"
        : "down"
      : null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Tabs */}
      <div className="flex px-3 pt-2 border-b border-gray-800 space-x-5">
        {(["호가", "최근거래"] as const).map((tab) => (
          <button
            key={tab}
            className={cn(
              "pb-2 text-xs font-medium border-b-2 transition-colors",
              activeTab === tab
                ? "border-yellow-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300",
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        {!isConnected && (
          <span className="ml-auto text-[10px] text-red-400 self-center pb-2">
            연결 끊김
          </span>
        )}
      </div>

      {activeTab === "호가" ? (
        <div className="flex-1 flex flex-col overflow-hidden text-xs">
          {/* Header */}
          <div className="flex justify-between text-gray-500 px-3 py-1.5 border-b border-gray-800/50">
            <span className="w-[38%]">가격(USDT)</span>
            <span className="w-[30%] text-right">수량</span>
            <span className="w-[32%] text-right">총액</span>
          </div>

          {/* Asks (Sell) */}
          <div className="flex-1 flex flex-col justify-end overflow-hidden px-1">
            {asks.map((ask, i) => {
              const total = ask.price * ask.qty;
              const depthPct = (ask.qty / maxAskQty) * 100;
              return (
                <div
                  key={`ask-${i}`}
                  className="flex justify-between py-0.75 px-2 relative hover:bg-gray-800/40"
                >
                  <div
                    className="absolute top-0 right-0 h-full bg-red-500/10 pointer-events-none transition-[width] duration-150"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="text-red-400 z-10 w-[38%]">
                    {formatPrice(ask.price)}
                  </span>
                  <span className="text-gray-300 z-10 w-[30%] text-right">
                    {formatQty(ask.qty)}
                  </span>
                  <span className="text-gray-500 z-10 w-[32%] text-right">
                    {formatQty(total)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Current Price */}
          <div className="py-2 px-3 border-y border-gray-800 flex items-center gap-2">
            {currentPrice ? (
              <>
                <span
                  className={cn(
                    "text-lg font-bold",
                    priceDirection === "up"
                      ? "text-green-400"
                      : priceDirection === "down"
                        ? "text-red-400"
                        : "text-white",
                  )}
                >
                  {formatPrice(currentPrice)}
                </span>
                <span className="text-[10px] text-gray-500">
                  ≈ ${formatPrice(currentPrice)}
                </span>
              </>
            ) : (
              <span className="text-gray-500 text-sm">로딩 중...</span>
            )}
          </div>

          {/* Bids (Buy) */}
          <div className="flex-1 flex flex-col overflow-hidden px-1">
            {bids.map((bid, i) => {
              const total = bid.price * bid.qty;
              const depthPct = (bid.qty / maxBidQty) * 100;
              return (
                <div
                  key={`bid-${i}`}
                  className="flex justify-between py-0.75 px-2 relative hover:bg-gray-800/40"
                >
                  <div
                    className="absolute top-0 right-0 h-full bg-green-500/10 pointer-events-none transition-[width] duration-150"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="text-green-400 z-10 w-[38%]">
                    {formatPrice(bid.price)}
                  </span>
                  <span className="text-gray-300 z-10 w-[30%] text-right">
                    {formatQty(bid.qty)}
                  </span>
                  <span className="text-gray-500 z-10 w-[32%] text-right">
                    {formatQty(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Recent Trades Tab */
        <div className="flex-1 flex flex-col overflow-hidden text-xs">
          <div className="flex justify-between text-gray-500 px-3 py-1.5 border-b border-gray-800/50">
            <span className="w-[38%]">가격(USDT)</span>
            <span className="w-[30%] text-right">수량</span>
            <span className="w-[32%] text-right">시간</span>
          </div>
          <div className="flex-1 overflow-y-auto px-1">
            {recentTrades.length === 0 ? (
              <div className="text-center text-gray-500 pt-10">
                최근 거래 데이터 로딩 중...
              </div>
            ) : (
              recentTrades.map((trade, i) => (
                <div
                  key={`trade-${trade.tradeId}-${i}`}
                  className="flex justify-between py-0.75 px-2 hover:bg-gray-800/40"
                >
                  <span
                    className={cn(
                      "w-[38%]",
                      trade.isBuyerMaker ? "text-red-400" : "text-green-400",
                    )}
                  >
                    {formatPrice(trade.price)}
                  </span>
                  <span className="text-gray-300 w-[30%] text-right">
                    {formatQty(trade.qty)}
                  </span>
                  <span className="text-gray-500 w-[32%] text-right">
                    {formatTime(trade.time)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
