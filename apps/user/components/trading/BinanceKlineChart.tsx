"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { init, dispose } from "klinecharts";
import type { Chart } from "klinecharts";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";
import { useBinanceKline } from "@/hooks/useBinanceKline";
import type { KlineInterval } from "@/hooks/useBinanceKline";
import type { BinanceTickerData, BinanceMarkPriceData } from "@/types";

interface BinanceKlineChartProps {
  ticker: BinanceTickerData | null;
  markPrice: BinanceMarkPriceData | null;
  symbol: string;
  onToggleMarketList: () => void;
  showMarketList: boolean;
}

const INTERVALS: { label: string; value: KlineInterval }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];

const DARK_THEME = {
  grid: {
    show: true,
    horizontal: {
      show: true,
      size: 1,
      color: "rgba(255,255,255,0.04)",
      style: "dashed" as const,
    },
    vertical: {
      show: true,
      size: 1,
      color: "rgba(255,255,255,0.04)",
      style: "dashed" as const,
    },
  },
  candle: {
    type: "candle_solid" as const,
    bar: {
      upColor: "#0ecb81",
      downColor: "#f6465d",
      noChangeColor: "#888888",
      upBorderColor: "#0ecb81",
      downBorderColor: "#f6465d",
      noChangeBorderColor: "#888888",
      upWickColor: "#0ecb81",
      downWickColor: "#f6465d",
      noChangeWickColor: "#888888",
    },
    priceMark: {
      show: true,
      high: {
        show: true,
        color: "#848e9c",
        textSize: 10,
        textFamily: "inherit",
        textWeight: "normal",
      },
      low: {
        show: true,
        color: "#848e9c",
        textSize: 10,
        textFamily: "inherit",
        textWeight: "normal",
      },
      last: {
        show: true,
        upColor: "#0ecb81",
        downColor: "#f6465d",
        noChangeColor: "#888888",
        line: {
          show: true,
          style: "dashed" as const,
          size: 1,
        },
        text: {
          show: true,
          size: 11,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 2,
          paddingBottom: 2,
          color: "#ffffff",
          family: "inherit",
          weight: "normal",
          borderRadius: 2,
        },
      },
    },
    tooltip: {
      showRule: "follow_cross" as const,
      showType: "rect" as const,
      text: {
        size: 11,
        family: "inherit",
        weight: "normal",
        color: "#848e9c",
        marginLeft: 8,
        marginTop: 4,
        marginRight: 8,
        marginBottom: 4,
      },
    },
  },
  indicator: {
    bars: [
      {
        upColor: "rgba(14,203,129,0.4)",
        downColor: "rgba(246,70,93,0.4)",
        noChangeColor: "rgba(136,136,136,0.4)",
      },
    ],
    lines: [
      { color: "#f5c878", size: 1 },
      { color: "#56b0f0", size: 1 },
      { color: "#d47deb", size: 1 },
      { color: "#32c784", size: 1 },
      { color: "#e2834b", size: 1 },
    ],
    tooltip: {
      showRule: "follow_cross" as const,
      showType: "rect" as const,
      text: {
        size: 11,
        family: "inherit",
        weight: "normal",
        color: "#848e9c",
        marginLeft: 8,
        marginTop: 4,
        marginRight: 8,
        marginBottom: 4,
      },
    },
  },
  xAxis: {
    show: true,
    size: "auto" as const,
    axisLine: { show: false, color: "#1e2329", size: 1 },
    tickLine: { show: false, size: 1, color: "#1e2329" },
    tickText: {
      show: true,
      color: "#5e6673",
      size: 10,
      family: "inherit",
      weight: "normal",
    },
  },
  yAxis: {
    show: true,
    size: "auto" as const,
    position: "right" as const,
    type: "normal" as const,
    inside: false,
    reverse: false,
    axisLine: { show: false, color: "#1e2329", size: 1 },
    tickLine: { show: false, size: 1, color: "#1e2329" },
    tickText: {
      show: true,
      color: "#5e6673",
      size: 10,
      family: "inherit",
      weight: "normal",
    },
  },
  separator: {
    size: 1,
    color: "#1e2329",
    fill: true,
    activeBackgroundColor: "rgba(33,150,243,0.15)",
  },
  crosshair: {
    show: true,
    horizontal: {
      show: true,
      line: {
        show: true,
        style: "dashed" as const,
        size: 1,
        color: "#3a4050",
      },
      text: {
        show: true,
        style: "fill" as const,
        color: "#e1e4e8",
        size: 11,
        family: "inherit",
        weight: "normal",
        borderSize: 1,
        borderColor: "#3a4050",
        borderRadius: 2,
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2,
        backgroundColor: "#1e2329",
      },
    },
    vertical: {
      show: true,
      line: {
        show: true,
        style: "dashed" as const,
        size: 1,
        color: "#3a4050",
      },
      text: {
        show: true,
        style: "fill" as const,
        color: "#e1e4e8",
        size: 11,
        family: "inherit",
        weight: "normal",
        borderSize: 1,
        borderColor: "#3a4050",
        borderRadius: 2,
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2,
        backgroundColor: "#1e2329",
      },
    },
  },
};

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null) return "-";
  return formatDisplayNumber(n, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtVol(n: number | undefined | null): string {
  if (n == null) return "-";
  if (n >= 1e9)
    return `${formatDisplayNumber(n / 1e9, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
  if (n >= 1e6)
    return `${formatDisplayNumber(n / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (n >= 1e3)
    return `${formatDisplayNumber(n / 1e3, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  return formatDisplayNumber(n, { maximumFractionDigits: 0 });
}

export function BinanceKlineChart({
  ticker,
  markPrice,
  symbol,
  onToggleMarketList,
  showMarketList,
}: BinanceKlineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const prevBarsLenRef = useRef(0);
  const [activeInterval, setActiveInterval] = useState<KlineInterval>("15m");

  const { historicalBars, latestBar, isLoading } = useBinanceKline({
    symbol,
    interval: activeInterval,
  });

  const price = ticker?.price;
  const changePercent = ticker?.priceChangePercent;
  const isUp = (changePercent ?? 0) >= 0;

  // Initialize chart
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = init(container, {
      styles: DARK_THEME as Record<string, unknown>,
    });

    if (chart) {
      chart.createIndicator("VOL", false, { id: "candle_pane" });
      chartRef.current = chart;
    }

    return () => {
      if (container) {
        dispose(container);
      }
      chartRef.current = null;
    };
  }, []);

  // Apply historical data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || historicalBars.length === 0) return;

    chart.applyNewData(historicalBars);
    prevBarsLenRef.current = historicalBars.length;
  }, [historicalBars]);

  // Update with latest bar from WS
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !latestBar || historicalBars.length === 0) return;

    chart.updateData(latestBar);
  }, [latestBar, historicalBars.length]);

  // Resize observer
  useEffect(() => {
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const handleIntervalChange = useCallback((interval: KlineInterval) => {
    setActiveInterval(interval);
  }, []);

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

      {/* Interval Toolbar */}
      <div className="h-10 border-b border-gray-800 flex items-center px-4 space-x-1 text-xs text-gray-400">
        <span className="mr-2 text-gray-500">시간대</span>
        {INTERVALS.map((iv) => (
          <button
            key={iv.value}
            onClick={() => handleIntervalChange(iv.value)}
            className={cn(
              "px-2.5 py-1 rounded transition-colors",
              activeInterval === iv.value
                ? "text-yellow-500 font-medium bg-yellow-500/10"
                : "hover:text-white",
            )}
          >
            {iv.label}
          </button>
        ))}
      </div>

      {/* Chart Area */}
      <div className="flex-1 relative bg-[#0b0e11] overflow-hidden">
        {isLoading && historicalBars.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0e11]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500">차트 로딩 중...</span>
            </div>
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="absolute inset-0"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
