"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { OrderBookEntry } from "@/types";

function generatePlaceholderAsks(): OrderBookEntry[] {
  return Array.from({ length: 15 }, (_, i) => ({
    price: 94250.5 + i * 10,
    amount: Number((0.5 + i * 0.1).toFixed(3)),
    total: 0,
  }))
    .reverse()
    .reduce((acc, curr, i) => {
      curr.total = i === 0 ? curr.amount : acc[i - 1].total + curr.amount;
      acc.push(curr);
      return acc;
    }, [] as OrderBookEntry[]);
}

function generatePlaceholderBids(): OrderBookEntry[] {
  return Array.from({ length: 15 }, (_, i) => ({
    price: 94240.0 - i * 10,
    amount: Number((0.5 + i * 0.1).toFixed(3)),
    total: 0,
  })).reduce((acc, curr, i) => {
    curr.total = i === 0 ? curr.amount : acc[i - 1].total + curr.amount;
    acc.push(curr);
    return acc;
  }, [] as OrderBookEntry[]);
}

export function OrderBookPlaceholder() {
  const [activeTab, setActiveTab] = useState<"오더북" | "최근거래">("오더북");
  const placeholderAsks = useMemo(() => generatePlaceholderAsks(), []);
  const placeholderBids = useMemo(() => generatePlaceholderBids(), []);

  return (
    <div className="flex flex-col h-full bg-[#0b0e11] border-l border-gray-800">
      {/* Tabs */}
      <div className="flex px-4 pt-2 border-b border-gray-800 space-x-6">
        <button
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "오더북"
              ? "border-yellow-500 text-white"
              : "border-transparent text-gray-500 hover:text-gray-300",
          )}
          onClick={() => setActiveTab("오더북")}
        >
          오더북
        </button>
        <button
          className={cn(
            "pb-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "최근거래"
              ? "border-yellow-500 text-white"
              : "border-transparent text-gray-500 hover:text-gray-300",
          )}
          onClick={() => setActiveTab("최근거래")}
        >
          최근 거래
        </button>
      </div>

      {activeTab === "오더북" ? (
        <div className="flex-1 flex flex-col p-2 overflow-y-auto text-xs font-mono">
          <div className="flex justify-between text-gray-500 mb-2 px-2">
            <span>가격(USDT)</span>
            <span>수량(BTC)</span>
            <span>누적(BTC)</span>
          </div>

          {/* Asks (Sell Orders) */}
          <div className="flex flex-col justify-end mb-1">
            {placeholderAsks
              .slice(-12)
              .map((ask: OrderBookEntry, i: number) => {
                const depthPercentage = Math.min((ask.total / 10) * 100, 100);
                return (
                  <div
                    key={`ask-${i}`}
                    className="flex justify-between py-0.5 px-2 relative group hover:bg-gray-800/50 cursor-pointer"
                  >
                    <div
                      className="absolute top-0 right-0 h-full bg-red-500/10 pointer-events-none"
                      style={{ width: `${depthPercentage}%` }}
                    />
                    <span className="text-red-500 z-10">
                      {ask.price.toFixed(1)}
                    </span>
                    <span className="text-gray-300 z-10">
                      {ask.amount.toFixed(3)}
                    </span>
                    <span className="text-gray-500 z-10">
                      {ask.total.toFixed(3)}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Current Price */}
          <div className="py-2 px-2 border-y border-gray-800 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-green-500">
                94,250.5
              </span>
              <span className="text-gray-500 line-through text-xs">
                $94,260.0
              </span>
            </div>
            <span className="text-gray-500">시세: 94,251.0</span>
          </div>

          {/* Bids (Buy Orders) */}
          <div className="flex flex-col mt-1">
            {placeholderBids
              .slice(0, 12)
              .map((bid: OrderBookEntry, i: number) => {
                const depthPercentage = Math.min((bid.total / 10) * 100, 100);
                return (
                  <div
                    key={`bid-${i}`}
                    className="flex justify-between py-0.5 px-2 relative group hover:bg-gray-800/50 cursor-pointer"
                  >
                    <div
                      className="absolute top-0 right-0 h-full bg-green-500/10 pointer-events-none"
                      style={{ width: `${depthPercentage}%` }}
                    />
                    <span className="text-green-500 z-10">
                      {bid.price.toFixed(1)}
                    </span>
                    <span className="text-gray-300 z-10">
                      {bid.amount.toFixed(3)}
                    </span>
                    <span className="text-gray-500 z-10">
                      {bid.total.toFixed(3)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-2 overflow-y-auto text-xs font-mono">
          <div className="flex justify-between text-gray-500 mb-2 px-2">
            <span>가격(USDT)</span>
            <span>수량(BTC)</span>
            <span>시간</span>
          </div>
          <div className="text-center text-gray-500 pt-10">
            최근 거래 데이터 없음
          </div>
        </div>
      )}
    </div>
  );
}
