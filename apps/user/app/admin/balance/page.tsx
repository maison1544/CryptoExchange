"use client";

import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, Clock } from "lucide-react";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminRequestsTab } from "./components/AdminRequestsTab";
import { AdminCardsTab } from "./components/AdminCardsTab";
import { useDepositWithdrawal } from "@/contexts/DepositWithdrawalContext";
import { formatUsdt } from "@/lib/utils/numberFormat";

export default function AdminPointsPage() {
  const { deposits, withdrawals } = useDepositWithdrawal();
  const [activeTab, setActiveTab] = useState("requests");

  const stats = useMemo(() => {
    const pendingDeposits = deposits.filter((d) => d.status === "pending");
    const pendingWithdrawals = withdrawals.filter(
      (w) => w.status === "pending",
    );
    const depositCount = pendingDeposits.length;
    const withdrawalCount = pendingWithdrawals.length;
    const depositAmount = pendingDeposits.reduce((s, d) => s + d.amount, 0);
    const withdrawalAmount = pendingWithdrawals.reduce(
      (s, w) => s + w.amount,
      0,
    );
    return {
      depositCount,
      withdrawalCount,
      totalCount: depositCount + withdrawalCount,
      totalAmount: depositAmount + withdrawalAmount,
    };
  }, [deposits, withdrawals]);

  const statCards = [
    {
      label: "입금 대기",
      value: `${stats.depositCount}건`,
      icon: TrendingUp,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "출금 대기",
      value: `${stats.withdrawalCount}건`,
      icon: TrendingDown,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "처리대기 금액",
      value: formatUsdt(stats.totalAmount),
      icon: DollarSign,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
    },
    {
      label: "총 대기",
      value: `${stats.totalCount}건`,
      icon: Clock,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">입출금 관리</h1>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg flex items-center gap-4"
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.bg}`}
            >
              <s.icon size={20} className={s.color} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <AdminTabs
        tabs={[
          { id: "requests", label: "입출금 신청 관리" },
          { id: "cards", label: "충전카드 관리" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <div className="mt-6">
        {activeTab === "requests" && <AdminRequestsTab />}
        {activeTab === "cards" && <AdminCardsTab />}
      </div>
    </div>
  );
}
