"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";

const categories = [
  { id: "trade", label: "거래" },
  { id: "position", label: "포지션" },
  { id: "order", label: "주문" },
  { id: "asset", label: "자산/입출금" },
  { id: "staking", label: "스테이킹" },
] as const;

type Category = (typeof categories)[number]["id"];

interface Term {
  term: string;
  category: Category;
  description: string;
}

const terms: Term[] = [
  // 거래
  {
    term: "페어 (Pair)",
    category: "trade",
    description:
      "거래 대상이 되는 두 자산의 조합입니다. 예: BTC/USDT는 비트코인을 USDT로 거래하는 것을 의미합니다.",
  },
  {
    term: "롱 (Long)",
    category: "trade",
    description:
      "가격 상승에 베팅하는 매수 포지션입니다. 가격이 오르면 수익, 내리면 손실이 발생합니다.",
  },
  {
    term: "숏 (Short)",
    category: "trade",
    description:
      "가격 하락에 베팅하는 매도 포지션입니다. 가격이 내리면 수익, 오르면 손실이 발생합니다.",
  },
  {
    term: "레버리지 (Leverage)",
    category: "trade",
    description:
      "투자 원금 대비 실제 거래 규모를 확대하는 배수입니다. 10x 레버리지는 원금의 10배 규모로 거래합니다. 수익과 손실 모두 확대됩니다.",
  },
  {
    term: "시장가 (Market Order)",
    category: "trade",
    description:
      "현재 시장 가격으로 즉시 체결되는 주문입니다. 빠른 체결이 보장되지만 정확한 가격은 보장되지 않습니다.",
  },
  {
    term: "지정가 (Limit Order)",
    category: "trade",
    description:
      "지정한 가격에 도달했을 때만 체결되는 주문입니다. 원하는 가격에 거래할 수 있지만 체결이 보장되지 않습니다.",
  },
  {
    term: "수수료 (Fee)",
    category: "trade",
    description:
      "거래 시 발생하는 비용입니다. 본 플랫폼의 기본 수수료율은 0.035%이며, 실제거래액 기준으로 계산됩니다.",
  },
  {
    term: "펀딩비 (Funding Rate)",
    category: "trade",
    description:
      "선물 가격과 현물 가격의 괴리를 조정하기 위해 8시간마다 롱/숏 포지션 보유자 간에 교환되는 수수료입니다.",
  },

  // 포지션
  {
    term: "교차 마진 (Cross Margin)",
    category: "position",
    description:
      "계좌의 전체 잔액을 증거금으로 사용하는 방식입니다. 청산 가격이 더 멀어지지만, 손실 시 전체 잔액이 위험에 노출됩니다.",
  },
  {
    term: "격리 마진 (Isolated Margin)",
    category: "position",
    description:
      "해당 포지션에 할당된 증거금만 사용하는 방식입니다. 최대 손실이 할당된 증거금으로 제한됩니다.",
  },
  {
    term: "진입가 (Entry Price)",
    category: "position",
    description: "포지션을 개시한 가격입니다. 손익 계산의 기준이 됩니다.",
  },
  {
    term: "현재가 (Current Price)",
    category: "position",
    description: "현재 시장에서 거래되고 있는 실시간 가격입니다.",
  },
  {
    term: "청산가 (Liquidation Price)",
    category: "position",
    description:
      "증거금이 소진되어 포지션이 강제로 종료되는 가격입니다. 이 가격에 도달하면 자동으로 포지션이 청산됩니다.",
  },
  {
    term: "증거금 (Margin)",
    category: "position",
    description:
      "포지션을 유지하기 위해 담보로 잡히는 자금입니다. 진입증거금은 포지션 개시 시 필요한 금액, 유지증거금은 포지션 유지에 필요한 최소 금액입니다.",
  },
  {
    term: "미실현 손익 (Unrealized PnL)",
    category: "position",
    description:
      "아직 청산하지 않은 포지션의 현재 손익입니다. 현재가와 진입가의 차이에 수량을 곱하여 계산합니다.",
  },
  {
    term: "ROE (Return on Equity)",
    category: "position",
    description:
      "증거금 대비 수익률입니다. (미실현 손익 / 증거금) x 100으로 계산합니다.",
  },
  {
    term: "손절 (Stop Loss)",
    category: "position",
    description:
      "지정한 손실 비율에 도달하면 자동으로 포지션을 청산하는 기능입니다. 추가 손실을 방지합니다.",
  },
  {
    term: "익절 (Take Profit)",
    category: "position",
    description:
      "지정한 수익 비율에 도달하면 자동으로 포지션을 청산하는 기능입니다. 수익을 확보합니다.",
  },

  // 주문
  {
    term: "주문비용",
    category: "order",
    description:
      "주문 체결 시 필요한 증거금입니다. (실제거래액 / 레버리지)로 계산됩니다.",
  },
  {
    term: "실제거래액",
    category: "order",
    description:
      "레버리지가 적용된 실제 거래 규모입니다. (가격 x 수량)으로 계산됩니다.",
  },
  {
    term: "진입가능",
    category: "order",
    description: "현재 주문에 사용할 수 있는 USDT 잔액입니다.",
  },
  {
    term: "최대 수량",
    category: "order",
    description:
      "현재 잔액과 레버리지로 진입 가능한 최대 수량입니다. (잔액 x 레버리지 / 가격)으로 계산됩니다.",
  },
  {
    term: "미체결 주문",
    category: "order",
    description:
      "아직 체결되지 않은 지정가 주문입니다. 시장 가격이 지정한 가격에 도달하면 체결됩니다.",
  },

  // 자산/입출금
  {
    term: "전체 잔액",
    category: "asset",
    description:
      "계좌에 보유한 총 USDT 금액입니다. 사용 가능 잔액 + 증거금 + 스테이킹 잠금 금액의 합계입니다.",
  },
  {
    term: "사용 가능 잔액",
    category: "asset",
    description:
      "현재 거래, 출금, 스테이킹 등에 즉시 사용할 수 있는 USDT 금액입니다.",
  },
  {
    term: "증거금 사용",
    category: "asset",
    description:
      "현재 진행 중인 선물 포지션의 증거금으로 잠겨있는 USDT 금액입니다.",
  },
  {
    term: "원화 입금 (KRW)",
    category: "asset",
    description:
      "한국 원화를 입금하여 USDT로 전환하는 과정입니다. 관리자 승인 후 USDT로 변환됩니다.",
  },
  {
    term: "출금 (USDT to KRW)",
    category: "asset",
    description:
      "USDT 잔액을 한국 원화로 전환하여 등록된 은행 계좌로 출금하는 과정입니다.",
  },

  // 스테이킹
  {
    term: "스테이킹 (Staking)",
    category: "staking",
    description:
      "보유한 USDT를 일정 기간 예치하여 이자 수익을 얻는 상품입니다.",
  },
  {
    term: "APY (연간 수익률)",
    category: "staking",
    description:
      "스테이킹 상품의 연간 예상 수익률입니다. 복리 기준으로 계산됩니다.",
  },
  {
    term: "락업 기간",
    category: "staking",
    description:
      "스테이킹 후 자금을 인출할 수 없는 기간입니다. 기간이 길수록 일반적으로 높은 수익률을 제공합니다.",
  },
  {
    term: "조기해지",
    category: "staking",
    description:
      "락업 기간이 끝나기 전에 스테이킹을 해제하는 것입니다. 조기해지 시 수수료가 부과될 수 있습니다.",
  },
];

export default function QAPage() {
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = terms.filter((t) => {
    const matchCategory =
      activeCategory === "all" || t.category === activeCategory;
    const matchSearch =
      search === "" ||
      t.term.toLowerCase().includes(search.toLowerCase()) ||
      t.description.includes(search);
    return matchCategory && matchSearch;
  });

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-background p-6 lg:p-8 text-sm">
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">용어 설명</h1>
            <p className="text-gray-500 text-sm">
              거래에서 사용되는 모든 용어와 정보 필드를 설명합니다.
            </p>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="용어 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-700 text-sm"
          />

          {/* Category Tabs */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeCategory === "all"
                  ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30"
                  : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white",
              )}
            >
              전체
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  activeCategory === cat.id
                    ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30"
                    : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Terms List */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                검색 결과가 없습니다.
              </div>
            ) : (
              filtered.map((t, i) => (
                <div
                  key={i}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-white font-medium">{t.term}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">
                      {categories.find((c) => c.id === t.category)?.label}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    {t.description}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="text-center text-gray-600 text-xs pt-4">
            총 {formatDisplayNumber(filtered.length)}개 용어
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
