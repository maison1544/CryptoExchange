"use client";

import { useState } from "react";
import { useDepositWithdrawal } from "@/contexts/DepositWithdrawalContext";
import { useNotification } from "@/contexts/NotificationContext";
import { TrendingDown, Wallet, Clock } from "lucide-react";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return { label: "승인완료", cls: "bg-green-500/20 text-green-400" };
    case "pending":
      return { label: "대기중", cls: "bg-yellow-500/20 text-yellow-400" };
    case "rejected":
      return { label: "거절됨", cls: "bg-red-500/20 text-red-400" };
    default:
      return { label: status, cls: "bg-gray-500/20 text-gray-400" };
  }
}

export default function WithdrawPage() {
  const {
    withdrawals,
    userPoints,
    availablePoints,
    bankProfile,
    withdrawalSettings,
    addWithdrawal,
  } = useDepositWithdrawal();
  const { addToast } = useNotification();

  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawAmountText, setWithdrawAmountText] = useState("");

  const currentBalance = userPoints;
  const currentAvailableBalance = availablePoints;
  const minimumWithdraw = withdrawalSettings.minWithdraw;
  const withdrawFee = withdrawalSettings.withdrawFee;
  const singleMaxWithdraw = withdrawalSettings.singleMaxWithdraw;
  const totalDeduction = withdrawAmount + withdrawFee;
  const exceedsSingleLimit =
    singleMaxWithdraw > 0 && withdrawAmount > singleMaxWithdraw;
  const exceedsAvailableBalance = totalDeduction > currentAvailableBalance;

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    const numeric = cleaned ? Number(cleaned) : 0;
    setWithdrawAmount(numeric);
    setWithdrawAmountText(
      numeric ? formatDisplayNumber(numeric, { maximumFractionDigits: 0 }) : "",
    );
  };

  const handleSubmit = () => {
    if (withdrawAmount < minimumWithdraw) {
      addToast({
        title: "출금 신청 불가",
        message: `출금은 최소 ${formatUsdt(minimumWithdraw)}부터 가능합니다.`,
        type: "warning",
      });
      return;
    }

    if (exceedsSingleLimit) {
      addToast({
        title: "출금 신청 불가",
        message: `1회 최대 출금 한도는 ${formatUsdt(singleMaxWithdraw)}입니다.`,
        type: "warning",
      });
      return;
    }

    if (exceedsAvailableBalance) {
      addToast({
        title: "출금 신청 불가",
        message: "수수료 포함 실차감액이 가용 잔액을 초과합니다.",
        type: "warning",
      });
      return;
    }

    if (
      !bankProfile.bank ||
      !bankProfile.accountNumber ||
      !bankProfile.accountHolder
    ) {
      addToast({
        title: "출금 계좌 정보 없음",
        message: "프로필에서 출금 계좌 정보를 먼저 등록해주세요.",
        type: "warning",
      });
      return;
    }

    if (
      confirm(
        `출금 신청액: ${formatUsdt(withdrawAmount)}\n출금 수수료: ${formatUsdt(withdrawFee)}\n실차감액: ${formatUsdt(totalDeduction)}\n\n계좌: ${bankProfile.bank} ${bankProfile.accountNumber}\n예금주: ${bankProfile.accountHolder}`,
      )
    ) {
      void (async () => {
        const result = await addWithdrawal({
          amount: withdrawAmount,
          bank: bankProfile.bank,
          accountNumber: bankProfile.accountNumber,
          accountHolder: bankProfile.accountHolder,
        });

        if (!result.success) {
          addToast({
            title: "출금 신청 실패",
            message: result.error || "출금 신청 처리 중 오류가 발생했습니다.",
            type: "error",
          });
          return;
        }

        setWithdrawAmount(0);
        setWithdrawAmountText("");
        addToast({
          title: "출금 신청 완료",
          message: `실차감액 ${formatUsdt(Number(result.deductedAmount ?? totalDeduction))}로 신청되었습니다.`,
          type: "success",
        });
      })();
    }
  };

  const pendingCount = withdrawals.filter((w) => w.status === "pending").length;
  const pendingAmount = withdrawals
    .filter((w) => w.status === "pending")
    .reduce((sum, withdrawal) => sum + withdrawal.amount + withdrawal.fee, 0);
  const approvedAmount = withdrawals
    .filter((w) => w.status === "approved")
    .reduce((sum, withdrawal) => sum + withdrawal.amount + withdrawal.fee, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">출금 신청</h1>
        <p className="text-gray-400 text-sm">USDT 출금 관리</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "보유 잔액",
            value: formatUsdt(currentBalance),
            color: "text-yellow-400",
            icon: Wallet,
            bg: "bg-yellow-500/10",
          },
          {
            label: "출금 대기",
            value: `${pendingCount}건 / ${formatUsdt(pendingAmount)}`,
            color: "text-red-400",
            icon: Clock,
            bg: "bg-red-500/10",
          },
          {
            label: "총 출금 완료",
            value: formatUsdt(approvedAmount),
            color: "text-green-400",
            icon: TrendingDown,
            bg: "bg-green-500/10",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-[#111827] border border-gray-800 rounded-lg p-4 flex items-center gap-4"
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg}`}
            >
              <stat.icon size={20} className={stat.color} />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-0.5">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">출금 신청</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-400 w-32 shrink-0">
              출금 계좌 정보
            </label>
            <span className="text-gray-300">
              {bankProfile.bank &&
              bankProfile.accountNumber &&
              bankProfile.accountHolder
                ? `${bankProfile.bank} ${bankProfile.accountNumber} (${bankProfile.accountHolder})`
                : "등록된 출금 계좌 정보가 없습니다."}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-400 w-32 shrink-0">
              출금 금액
            </label>
            <div className="relative w-56">
              <input
                type="text"
                value={withdrawAmountText}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-center text-sm text-white focus:outline-none focus:border-yellow-500 pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                USDT
              </span>
            </div>
            <span className="text-xs text-gray-500">
              최소 {formatUsdt(minimumWithdraw)} / 가용{" "}
              {formatUsdt(currentAvailableBalance)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-32 shrink-0" />
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded border border-gray-800 bg-[#0d1117] px-3 py-2">
                <div className="text-gray-500 mb-1">출금 수수료</div>
                <div className="font-semibold text-white">
                  {formatUsdt(withdrawFee)}
                </div>
              </div>
              <div className="rounded border border-gray-800 bg-[#0d1117] px-3 py-2">
                <div className="text-gray-500 mb-1">실차감액</div>
                <div className="font-semibold text-yellow-500">
                  {formatUsdt(totalDeduction)}
                </div>
              </div>
              <div className="rounded border border-gray-800 bg-[#0d1117] px-3 py-2">
                <div className="text-gray-500 mb-1">1회 최대 한도</div>
                <div className="font-semibold text-white">
                  {singleMaxWithdraw > 0
                    ? formatUsdt(singleMaxWithdraw)
                    : "제한 없음"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-32 shrink-0" />
            <div className="flex gap-2">
              {[10000, 30000, 50000, 100000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setWithdrawAmount(amt);
                    setWithdrawAmountText(
                      formatDisplayNumber(amt, { maximumFractionDigits: 0 }),
                    );
                  }}
                  className={`px-3 py-1.5 rounded text-xs transition-colors border ${
                    withdrawAmount === amt
                      ? "bg-yellow-500/10 border-yellow-500 text-yellow-500"
                      : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-400"
                  }`}
                >
                  {formatDisplayNumber(amt / 10000, {
                    maximumFractionDigits: 0,
                  })}
                  만
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={
              withdrawAmount < minimumWithdraw ||
              exceedsSingleLimit ||
              exceedsAvailableBalance ||
              !bankProfile.bank ||
              !bankProfile.accountNumber ||
              !bankProfile.accountHolder
            }
            className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold rounded text-sm transition-colors"
          >
            출금 신청
          </button>
        </div>
      </div>

      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">
            출금 내역{" "}
            <span className="text-sm font-normal text-gray-500">
              (전체 {withdrawals.length}건)
            </span>
          </h2>
        </div>
        {withdrawals.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            출금 내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {withdrawals.map((item) => {
              const badge = statusBadge(item.status);
              return (
                <div
                  key={item.id}
                  className="p-4 hover:bg-gray-800/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {item.date}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">
                        {item.bank} {item.accountNumber} ({item.accountHolder})
                      </div>
                      {item.status === "rejected" && item.rejectReason && (
                        <div className="text-xs text-red-400">
                          거절 사유: {item.rejectReason}
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <span className="text-red-400 font-bold text-lg">
                        {formatUsdt(-(item.amount + item.fee))}
                      </span>
                      {item.fee > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          신청액 {formatUsdt(item.amount)} + 수수료{" "}
                          {formatUsdt(item.fee)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
