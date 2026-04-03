"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";

const COIN_ICONS: Record<string, string> = {
  BTCUSDT: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  ETHUSDT: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  BNBUSDT:
    "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  SOLUSDT: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
};

const FAVORITES_STORAGE_KEY = "trade.favoriteMarkets";

type LiveMarket = {
  symbol: string;
  name: string;
  lastPrice: number;
  priceChangePercent: number;
  volume24h: number;
  fundingRate: number;
};

type BinanceExchangeInfo = {
  symbols?: Array<{
    symbol: string;
    status: string;
    contractType: string;
    quoteAsset: string;
    baseAsset: string;
  }>;
};

type Binance24hTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type BinancePremiumIndex = {
  symbol: string;
  lastFundingRate: string;
};

interface MarketListPanelProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

function formatPrice(price: number) {
  if (price >= 1000) {
    return formatDisplayNumber(price, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (price >= 1) {
    return formatDisplayNumber(price, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  return formatDisplayNumber(price, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

export function MarketListPanel({
  currentSymbol,
  onSelectSymbol,
}: MarketListPanelProps) {
  const [activeTab, setActiveTab] = useState<"전체" | "즐겨찾기">("전체");
  const [search, setSearch] = useState("");
  const [markets, setMarkets] = useState<LiveMarket[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFavorites(
          parsed.filter((value): value is string => typeof value === "string"),
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(favorites),
    );
  }, [favorites]);

  useEffect(() => {
    let cancelled = false;

    const loadMarkets = async () => {
      try {
        if (!cancelled) {
          setError("");
        }

        const [exchangeInfoRes, tickerRes, premiumRes] = await Promise.all([
          fetch("https://fapi.binance.com/fapi/v1/exchangeInfo", {
            cache: "no-store",
          }),
          fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", {
            cache: "no-store",
          }),
          fetch("https://fapi.binance.com/fapi/v1/premiumIndex", {
            cache: "no-store",
          }),
        ]);

        if (!exchangeInfoRes.ok || !tickerRes.ok || !premiumRes.ok) {
          throw new Error("마켓 데이터를 불러오지 못했습니다.");
        }

        const exchangeInfo =
          (await exchangeInfoRes.json()) as BinanceExchangeInfo;
        const tickers = (await tickerRes.json()) as Binance24hTicker[];
        const premiumIndexes =
          (await premiumRes.json()) as BinancePremiumIndex[];

        const allowedSymbols = new Map(
          (exchangeInfo.symbols ?? [])
            .filter(
              (item) =>
                item.quoteAsset === "USDT" &&
                item.contractType === "PERPETUAL" &&
                item.status === "TRADING",
            )
            .map((item) => [item.symbol, item.baseAsset]),
        );

        const fundingRateMap = new Map(
          premiumIndexes.map((item) => [
            item.symbol,
            Number(item.lastFundingRate) || 0,
          ]),
        );

        const nextMarkets = tickers
          .filter((item) => allowedSymbols.has(item.symbol))
          .map((item) => ({
            symbol: item.symbol,
            name:
              allowedSymbols.get(item.symbol) ??
              item.symbol.replace("USDT", ""),
            lastPrice: Number(item.lastPrice) || 0,
            priceChangePercent: Number(item.priceChangePercent) || 0,
            volume24h: Number(item.quoteVolume) || 0,
            fundingRate: fundingRateMap.get(item.symbol) ?? 0,
          }))
          .sort((a, b) => b.volume24h - a.volume24h)
          .slice(0, 150);

        if (!cancelled) {
          setMarkets(nextMarkets);
          setLoading(false);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "마켓 데이터를 불러오지 못했습니다.",
          );
          setLoading(false);
        }
      }
    };

    void loadMarkets();

    const interval = window.setInterval(() => {
      void loadMarkets();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const filteredMarkets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source =
      activeTab === "즐겨찾기"
        ? markets.filter((market) => favorites.includes(market.symbol))
        : markets;

    if (!query) return source;

    return source.filter(
      (market) =>
        market.symbol.toLowerCase().includes(query) ||
        market.name.toLowerCase().includes(query),
    );
  }, [activeTab, favorites, markets, search]);

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) =>
      prev.includes(symbol)
        ? prev.filter((item) => item !== symbol)
        : [symbol, ...prev],
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#131722]">
      <div className="p-3 border-b border-gray-700">
        <div className="relative mb-3">
          <Search
            className="absolute left-2.5 top-2.5 text-gray-400"
            size={14}
          />
          <input
            type="text"
            placeholder="마켓 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0d111c] border border-gray-600 rounded pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/60"
          />
        </div>
        <div className="flex space-x-4 text-sm">
          <button
            className={cn(
              "pb-1.5 font-medium border-b-2 transition-colors",
              activeTab === "즐겨찾기"
                ? "border-yellow-500 text-yellow-400"
                : "border-transparent text-gray-400 hover:text-gray-200",
            )}
            onClick={() => setActiveTab("즐겨찾기")}
          >
            <Star size={13} className="inline mr-1" />
            즐겨찾기
          </button>
          <button
            className={cn(
              "pb-1.5 font-medium border-b-2 transition-colors",
              activeTab === "전체"
                ? "border-yellow-500 text-yellow-400"
                : "border-transparent text-gray-400 hover:text-gray-200",
            )}
            onClick={() => setActiveTab("전체")}
          >
            USDT
          </button>
        </div>
      </div>

      <div className="flex justify-between px-3 py-2 text-xs font-medium text-gray-400 border-b border-gray-700 bg-[#0d111c]">
        <span>심볼</span>
        <div className="flex gap-4">
          <span>가격</span>
          <span>24시간 변동</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {loading && (
          <div className="text-center text-gray-500 text-sm pt-8">
            마켓 데이터를 불러오는 중입니다.
          </div>
        )}

        {!loading && error && (
          <div className="text-center text-red-400 text-sm pt-8 px-4">
            {error}
          </div>
        )}

        {!loading && !error && filteredMarkets.length === 0 && (
          <div className="text-center text-gray-500 text-sm pt-8">
            마켓이 없습니다.
          </div>
        )}

        {!loading &&
          !error &&
          filteredMarkets.map((market) => {
            const isFavorite = favorites.includes(market.symbol);
            const isActive = market.symbol === currentSymbol;

            return (
              <div
                key={market.symbol}
                onClick={() => onSelectSymbol(market.symbol)}
                className={cn(
                  "w-full flex justify-between items-center px-3 py-3 border-b border-gray-800/60 group transition-colors text-left",
                  isActive ? "bg-yellow-500/10" : "hover:bg-white/5",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(market.symbol);
                    }}
                    className="shrink-0"
                  >
                    <Star
                      size={12}
                      className={cn(
                        "transition-colors",
                        isFavorite
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-600 group-hover:text-gray-400",
                      )}
                    />
                  </button>
                  {COIN_ICONS[market.symbol] && (
                    <Image
                      src={COIN_ICONS[market.symbol]}
                      alt={market.symbol}
                      width={24}
                      height={24}
                      className="shrink-0 rounded-full"
                      unoptimized
                    />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white text-sm leading-tight truncate">
                      {market.symbol}
                    </span>
                    <span className="text-gray-500 text-[11px] truncate">
                      {market.name} 영구선물
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      market.priceChangePercent >= 0
                        ? "text-green-400"
                        : "text-red-400",
                    )}
                  >
                    {formatPrice(market.lastPrice)}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-medium",
                      market.priceChangePercent >= 0
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400",
                    )}
                  >
                    {formatDisplayNumber(market.priceChangePercent, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                      signed: true,
                    })}
                    %
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
