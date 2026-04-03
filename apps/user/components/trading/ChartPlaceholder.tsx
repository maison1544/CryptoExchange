"use client";

import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";
import type { BinanceTickerData, BinanceMarkPriceData } from "@/types";

interface ChartPlaceholderProps {
  ticker: BinanceTickerData | null;
  markPrice: BinanceMarkPriceData | null;
  symbol: string;
  onToggleMarketList: () => void;
  showMarketList: boolean;
}

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null) return "-";
  return formatDisplayNumber(n, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtVol(n: number | undefined | null): string {
  if (n == null) return "-";
  if (n >= 1e9) {
    return `${formatDisplayNumber(n / 1e9, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}B`;
  }

  if (n >= 1e6) {
    return `${formatDisplayNumber(n / 1e6, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}M`;
  }

  if (n >= 1e3) {
    return `${formatDisplayNumber(n / 1e3, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}K`;
  }

  return formatDisplayNumber(n, {
    maximumFractionDigits: 0,
  });
}

export function ChartPlaceholder({
  ticker,
  markPrice,
  symbol,
  onToggleMarketList,
  showMarketList,
}: ChartPlaceholderProps) {
  const price = ticker?.price;
  const changePercent = ticker?.priceChangePercent;
  const isUp = (changePercent ?? 0) >= 0;

  return (
    <div className="flex-1 bg-[#0b0e11] flex flex-col relative border-r border-gray-800">
      {/* Chart Header */}
      <div className="border-b border-gray-800 flex items-center px-3 py-2 gap-3 overflow-x-auto scrollbar-hide">
        {/* Symbol + Market List Toggle */}
        <button
          onClick={onToggleMarketList}
          className="flex items-center gap-1.5 hover:bg-gray-800 rounded px-2 py-1 transition-colors shrink-0"
          title={showMarketList ? "마켓 목록 숨기기" : "마켓 목록 표시"}
        >
          <PanelLeft size={14} className="text-gray-400" />
          <span className="text-base font-bold text-white">
            {symbol.replace("USDT", "/USDT")}
          </span>
        </button>

        {/* Price */}
        <span
          className={cn(
            "text-lg font-bold shrink-0",
            isUp ? "text-green-400" : "text-red-400",
          )}
        >
          {price ? fmt(price) : "-"}
        </span>

        <div className="w-px h-6 bg-gray-800 shrink-0" />

        {/* 24h Stats */}
        <div className="flex items-center gap-4 text-xs shrink-0">
          <div className="flex flex-col">
            <span className="text-gray-500">24시간 변동</span>
            <span className={cn(isUp ? "text-green-400" : "text-red-400")}>
              {changePercent != null
                ? `${formatDisplayNumber(changePercent, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    signed: true,
                  })}%`
                : "-"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500">24시간 고가</span>
            <span className="text-gray-200">{fmt(ticker?.highPrice)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500">24시간 저가</span>
            <span className="text-gray-200">{fmt(ticker?.lowPrice)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500">24시간 거래량</span>
            <span className="text-gray-200">{fmtVol(ticker?.quoteVolume)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500">펀딩비</span>
            <span
              className={cn(
                "text-xs",
                (markPrice?.fundingRate ?? 0) >= 0
                  ? "text-green-400"
                  : "text-red-400",
              )}
            >
              {markPrice?.fundingRate != null
                ? `${formatDisplayNumber(markPrice.fundingRate * 100, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                    signed: true,
                  })}%`
                : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="h-10 border-b border-gray-800 flex items-center px-4 space-x-4 text-xs text-gray-400">
        <span>시간대</span>
        <button className="hover:text-white">1m</button>
        <button className="hover:text-white text-yellow-500 font-medium">
          15m
        </button>
        <button className="hover:text-white">1H</button>
        <button className="hover:text-white">4H</button>
        <button className="hover:text-white">1D</button>
        <div className="w-px h-4 bg-gray-800 mx-2" />
        <button className="hover:text-white">지표</button>
        <button className="hover:text-white">설정</button>
      </div>

      {/* Chart Area */}
      <div className="flex-1 flex items-center justify-center relative bg-[#0b0e11] overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="text-gray-600 flex flex-col items-center gap-4 z-10 p-6 rounded-lg bg-gray-900/50 border border-gray-800/50 backdrop-blur-sm">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center">
            <span className="text-2xl text-gray-500">📈</span>
          </div>
          <p className="text-sm font-medium">차트 영역</p>
          <p className="text-xs text-gray-500 text-center max-w-[250px]">
            실제 차트 라이브러리는 데이터 연동 단계에서 구현될 예정입니다.
          </p>
        </div>

        {/* Y Axis Mock */}
        <div className="absolute right-0 top-0 bottom-0 w-16 border-l border-gray-800 bg-[#0b0e11] flex flex-col justify-between py-4 text-[10px] text-gray-500 items-end pr-2">
          {price ? (
            <>
              <span>{fmt(price * 1.01)}</span>
              <span>{fmt(price * 1.005)}</span>
              <span
                className={cn(
                  "font-medium px-1 rounded",
                  isUp
                    ? "text-green-500 bg-green-500/10"
                    : "text-red-500 bg-red-500/10",
                )}
              >
                {fmt(price)}
              </span>
              <span>{fmt(price * 0.995)}</span>
              <span>{fmt(price * 0.99)}</span>
              <span>{fmt(price * 0.985)}</span>
            </>
          ) : (
            <>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
