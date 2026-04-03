"use client";

import { useState } from "react";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

const marginTiers = [
  {
    tier: 1,
    maxLeverage: 125,
    minSize: 0,
    maxSize: 300000,
    maintenanceRate: 0.4,
    maintenanceMargin: 0,
  },
  {
    tier: 2,
    maxLeverage: 100,
    minSize: 300000,
    maxSize: 800000,
    maintenanceRate: 0.5,
    maintenanceMargin: 300,
  },
  {
    tier: 3,
    maxLeverage: 75,
    minSize: 800000,
    maxSize: 3000000,
    maintenanceRate: 0.65,
    maintenanceMargin: 1500,
  },
  {
    tier: 4,
    maxLeverage: 50,
    minSize: 3000000,
    maxSize: 12000000,
    maintenanceRate: 1.0,
    maintenanceMargin: 12000,
  },
  {
    tier: 5,
    maxLeverage: 25,
    minSize: 12000000,
    maxSize: 70000000,
    maintenanceRate: 2.0,
    maintenanceMargin: 132000,
  },
  {
    tier: 6,
    maxLeverage: 20,
    minSize: 70000000,
    maxSize: 100000000,
    maintenanceRate: 2.5,
    maintenanceMargin: 482000,
  },
  {
    tier: 7,
    maxLeverage: 10,
    minSize: 100000000,
    maxSize: 230000000,
    maintenanceRate: 5.0,
    maintenanceMargin: 2982000,
  },
  {
    tier: 8,
    maxLeverage: 5,
    minSize: 230000000,
    maxSize: 480000000,
    maintenanceRate: 10.0,
    maintenanceMargin: 14482000,
  },
  {
    tier: 9,
    maxLeverage: 4,
    minSize: 480000000,
    maxSize: 600000000,
    maintenanceRate: 12.5,
    maintenanceMargin: 26482000,
  },
  {
    tier: 10,
    maxLeverage: 3,
    minSize: 600000000,
    maxSize: 800000000,
    maintenanceRate: 15.0,
    maintenanceMargin: 41482000,
  },
  {
    tier: 11,
    maxLeverage: 2,
    minSize: 800000000,
    maxSize: 1200000000,
    maintenanceRate: 25.0,
    maintenanceMargin: 121482000,
  },
  {
    tier: 12,
    maxLeverage: 1,
    minSize: 1200000000,
    maxSize: 1800000000,
    maintenanceRate: 50.0,
    maintenanceMargin: 421482000,
  },
];

const popularSymbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
];

export default function MarginInfoPage() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [search, setSearch] = useState("BTCUSDT");

  const displaySymbol = symbol.replace("USDT", "/USDT");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          레버리지 및 증거금 정보
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          레버리지는 포지션 크기에 따라 자동으로 조정됩니다. 포지션 크기가
          클수록 최대 레버리지는 낮아지며, 유지증거금율은 높아집니다.
        </p>

        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">심볼 검색</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder="심볼 검색 (예: BTC, ETH)"
            className="w-full max-w-md bg-[#1a1d26] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {popularSymbols
            .filter((s) => s.includes(search) || search === "")
            .map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSymbol(s);
                  setSearch(s);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  symbol === s
                    ? "bg-yellow-500 text-black"
                    : "bg-[#1a1d26] text-gray-400 hover:text-white border border-gray-700"
                }`}
              >
                {s.replace("USDT", "/USDT")}
              </button>
            ))}
        </div>

        <div className="text-sm text-gray-400 mb-6">
          선택된 심볼:{" "}
          <span className="text-yellow-500 font-medium">{displaySymbol}</span>
        </div>

        <div className="space-y-3">
          {marginTiers.map((t) => (
            <div
              key={t.tier}
              className="bg-[#1a1d26] border border-gray-800 rounded-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-[#111827]">
                <span className="text-sm text-gray-300 font-medium">
                  티어 {t.tier}
                </span>
                <span className="text-yellow-500 font-bold text-sm">
                  {t.maxLeverage}x
                </span>
              </div>
              <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">
                    포지션 크기 (USDT)
                  </div>
                  <div className="text-sm text-white">
                    {formatDisplayNumber(t.minSize, {
                      maximumFractionDigits: 0,
                    })}{" "}
                    -{" "}
                    {formatDisplayNumber(t.maxSize, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">
                    유지증거금률
                  </div>
                  <div className="text-sm text-white">
                    {formatDisplayNumber(t.maintenanceRate, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    %
                  </div>
                </div>
              </div>
              <div className="px-4 py-2 border-t border-gray-800/50">
                <div className="text-[10px] text-gray-500">유지증거금</div>
                <div className="text-sm text-white font-medium">
                  {formatUsdt(t.maintenanceMargin, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
