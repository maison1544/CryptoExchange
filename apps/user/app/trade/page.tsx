"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PanelLeftClose } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MarketListPanel } from "@/components/trading/MarketListPanel";
import { BinanceKlineChart } from "@/components/trading/BinanceKlineChart";
import { OrderBook } from "@/components/trading/OrderBook";
import { OrderPanel } from "@/components/trading/OrderPanel";
import { PositionTabs } from "@/components/trading/PositionTabs";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import type { Position } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const supabase = createClient();

export default function TradePage() {
  const { user } = useAuth();
  const [showMarketList, setShowMarketList] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState("BTCUSDT");
  const prevPriceRef = useRef<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedOrderPrice, setSelectedOrderPrice] = useState<number | null>(
    null,
  );
  const [orderPriceTick, setOrderPriceTick] = useState(0);

  const handleSelectOrderPrice = useCallback((price: number) => {
    setSelectedOrderPrice(price);
    setOrderPriceTick((n) => n + 1);
  }, []);

  // Reset selected price whenever the symbol changes so a previous symbol's
  // price doesn't leak into the new market's order panel.
  useEffect(() => {
    setSelectedOrderPrice(null);
  }, [currentSymbol]);

  const loadPositions = useCallback(async () => {
    if (!user) {
      setPositions([]);
      return;
    }

    const { data } = await supabase
      .from("futures_positions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    if (!data) {
      return;
    }

    setPositions(
      data.map((p: any) => ({
        id: String(p.id),
        symbol: p.symbol,
        type: p.direction === "long" ? "롱" : "숏",
        marginMode: p.margin_mode === "isolated" ? "isolated" : "cross",
        size: Number(p.size),
        entryPrice: Number(p.entry_price),
        markPrice: Number(p.entry_price),
        liqPrice: Number(p.liquidation_price),
        marginRatio: 0,
        margin: Number(p.margin),
        fee: Number(p.fee ?? 0),
        pnl: 0,
        pnlPercent: 0,
        leverage: Number(p.leverage),
      })),
    );
  }, [user]);

  useEffect(() => {
    void loadPositions();

    if (!user) {
      return;
    }

    const interval = setInterval(() => {
      void loadPositions();
    }, 3000);

    return () => clearInterval(interval);
  }, [loadPositions, user]);

  const { ticker, orderBook, recentTrades, markPrice, isConnected } =
    useBinanceWebSocket({ symbol: currentSymbol });

  const currentPrice = ticker?.price ?? null;
  const currentMarkPrice = markPrice?.markPrice ?? currentPrice;

  useEffect(() => {
    if (currentPrice !== null && currentPrice !== prevPriceRef.current) {
      prevPriceRef.current = currentPrice;
    }
  }, [currentPrice]);

  const handleAddPosition = useCallback((pos: Position) => {
    setPositions((prev) => [pos, ...prev]);
  }, []);

  const handleRemovePosition = useCallback((posId: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== posId));
  }, []);

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0b0e11] relative">
        {/* Top Section */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Middle: Chart */}
          <div className="flex-1 min-w-[400px] border-b lg:border-b-0 lg:border-r border-gray-800 flex flex-col relative">
            <BinanceKlineChart
              ticker={ticker}
              markPrice={markPrice}
              symbol={currentSymbol}
              onToggleMarketList={() => setShowMarketList((v) => !v)}
              showMarketList={showMarketList}
            />
          </div>

          {/* Right: Order Book & Order Panel */}
          <div className="w-full lg:w-[600px] shrink-0 flex flex-col lg:flex-row h-full overflow-hidden">
            <div className="w-full lg:w-[300px] border-b lg:border-b-0 lg:border-r border-gray-800 h-full overflow-hidden">
              <OrderBook
                orderBook={orderBook}
                recentTrades={recentTrades}
                currentPrice={currentPrice}
                prevPrice={prevPriceRef.current}
                isConnected={isConnected}
                onSelectPrice={handleSelectOrderPrice}
              />
            </div>
            <div className="w-full lg:w-[300px] h-full overflow-hidden">
              {user ? (
                <OrderPanel
                  currentPrice={currentPrice}
                  orderPrice={selectedOrderPrice}
                  orderPriceTick={orderPriceTick}
                  symbol={currentSymbol}
                  ticker={ticker}
                  onAddPosition={handleAddPosition}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
                  <p className="text-gray-400 text-sm">
                    주문하려면 로그인이 필요합니다
                  </p>
                  <Link
                    href="/login"
                    className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors"
                  >
                    로그인
                  </Link>
                  <Link
                    href="/signup"
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    계정이 없으신가요? 회원가입
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: Positions - only shown when logged in */}
        {user && (
          <div className="min-h-[256px] shrink-0 border-t border-gray-800">
            <PositionTabs
              positions={positions}
              currentPrice={currentPrice}
              currentMarkPrice={currentMarkPrice}
              currentSymbol={currentSymbol}
              onRemovePosition={handleRemovePosition}
            />
          </div>
        )}

        {/* Market List Overlay */}
        {showMarketList && (
          <div className="absolute left-0 top-0 bottom-0 z-30 w-[300px] flex flex-col bg-[#131722] border-r border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0 bg-[#1a1f2e]">
              <span className="text-sm font-semibold text-white">마켓</span>
              <button
                onClick={() => setShowMarketList(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700"
                title="마켓 목록 숨기기"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MarketListPanel
                currentSymbol={currentSymbol}
                onSelectSymbol={(symbol) => {
                  setCurrentSymbol(symbol);
                  setShowMarketList(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
