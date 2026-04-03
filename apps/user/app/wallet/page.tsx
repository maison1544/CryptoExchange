"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { UserModal } from "@/components/ui/UserModal";
import {
  UserMetricCard,
  UserPageHeader,
  UserPanel,
  UserSegmentedTabs,
} from "@/components/ui/UserSurface";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useDepositWithdrawal } from "@/contexts/DepositWithdrawalContext";
import { useNotification } from "@/contexts/NotificationContext";
import {
  formatDisplayNumber,
  formatKrw,
  formatUsdt,
} from "@/lib/utils/numberFormat";
import { convertKrwToUsdt } from "@/lib/utils/siteSettings";

// ── 상태 텍스트 / 색상 ──────────────────────────────────────────────────
function statusLabel(status: string, type: "deposit" | "withdrawal") {
  if (type === "deposit") {
    switch (status) {
      case "approved":
        return "완료";
      case "pending":
        return "처리중";
      case "rejected":
        return "실패";
      default:
        return status;
    }
  }
  switch (status) {
    case "approved":
      return "완료";
    case "pending":
      return "처리중";
    case "rejected":
      return "거부";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "approved":
      return "bg-green-500/20 text-green-500";
    case "pending":
      return "bg-yellow-500/20 text-yellow-500";
    case "rejected":
      return "bg-red-500/20 text-red-500";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
}

function formatInteger(value: number) {
  return formatDisplayNumber(value, {
    maximumFractionDigits: 0,
  });
}

function formatWalletBalance(value: number) {
  return formatKrw(value);
}

function formatEstimatedUsdtFromKrw(value: number, usdtKrwRate: number) {
  return formatUsdt(convertKrwToUsdt(value, usdtKrwRate), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── 확인 모달 ────────────────────────────────────────────────────────────
function ConfirmModal({
  title,
  description,
  rows,
  accountInfo,
  notice,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  rows: Array<{
    label: string;
    value: string;
    highlight?: boolean;
  }>;
  accountInfo?: {
    bank: string;
    accountNumber: string;
    accountHolder: string;
  };
  notice?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <UserModal
      isOpen={true}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <div className="flex gap-3">
          <button
            onClick={() => void onConfirm()}
            className="flex-1 rounded-full bg-yellow-500 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-yellow-400"
          >
            확인
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-white/8 bg-white/3 py-2.5 text-sm text-white transition-colors hover:bg-white/5"
          >
            취소
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-white/6 bg-white/3 divide-y divide-white/6">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-sm text-gray-400">{row.label}</span>
              <span
                className={cn(
                  "text-sm text-right font-medium text-white",
                  row.highlight && "text-yellow-500",
                )}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
        {accountInfo && (
          <div className="overflow-hidden rounded-2xl border border-white/6 bg-white/3 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-400">은행</span>
              <span className="font-medium text-white">{accountInfo.bank}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-400">계좌번호</span>
              <span className="font-medium text-white">
                {accountInfo.accountNumber}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-400">예금주</span>
              <span className="font-medium text-white">
                {accountInfo.accountHolder}
              </span>
            </div>
          </div>
        )}
        {notice && <p className="text-xs leading-6 text-gray-500">{notice}</p>}
      </div>
    </UserModal>
  );
}

export default function WalletPage() {
  const {
    deposits,
    withdrawals,
    userPoints,
    availablePoints,
    bankProfile,
    usdtKrwRate,
    withdrawalSettings,
    addDeposit,
    addWithdrawal,
  } = useDepositWithdrawal();
  const { isLoggedIn } = useAuth();
  const { addToast } = useNotification();

  const [activeTab, setActiveTab] = useState<"입금" | "출금">("입금");

  // 입금 입력 상태
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositAmountText, setDepositAmountText] = useState("");
  const [depositorName, setDepositorName] = useState("");

  // 출금 입력 상태
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawAmountText, setWithdrawAmountText] = useState("");

  // 확인 모달
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description?: string;
    rows: Array<{
      label: string;
      value: string;
      highlight?: boolean;
    }>;
    accountInfo?: {
      bank: string;
      accountNumber: string;
      accountHolder: string;
    };
    notice?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const currentPoints = userPoints;
  const availableBalance = availablePoints;
  const withdrawFee = withdrawalSettings.withdrawFee;
  const minimumWithdraw = withdrawalSettings.minWithdraw;
  const singleMaxWithdraw = withdrawalSettings.singleMaxWithdraw;
  const totalDeduction = withdrawAmount + withdrawFee;
  const exceedsSingleLimit =
    singleMaxWithdraw > 0 && withdrawAmount > singleMaxWithdraw;
  const exceedsAvailableBalance = totalDeduction > availableBalance;

  // ── 금액 입력 핸들러 ──────────────────────────────────────────────────
  const handleAmountChange = (
    value: string,
    setNum: (n: number) => void,
    setText: (s: string) => void,
  ) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    const numeric = cleaned ? Number(cleaned) : 0;
    setNum(numeric);
    setText(numeric ? formatInteger(numeric) : "");
  };

  // ── 입금 신청 ─────────────────────────────────────────────────────────
  const handleCreateDeposit = () => {
    if (depositAmount < 10000) {
      addToast({
        title: "입금 신청 불가",
        message: "입금은 최소 10,000원부터 가능합니다.",
        type: "warning",
      });
      return;
    }
    setConfirmModal({
      title: "입금 신청 확인",
      description: "아래 내용으로 입금 신청을 진행합니다.",
      rows: [
        {
          label: "입금 금액",
          value: formatKrw(depositAmount),
          highlight: true,
        },
        {
          label: "환산 USDT",
          value: formatEstimatedUsdtFromKrw(depositAmount, usdtKrwRate),
        },
        {
          label: "입금자명",
          value: depositorName || "미입력",
        },
      ],
      notice:
        "입금 신청 후 안내된 계좌로 동일 금액을 입금해주세요. 관리자 확인 후 잔액이 지급됩니다.",
      onConfirm: async () => {
        const result = await addDeposit({
          amount: depositAmount,
          depositorName: depositorName || "미입력",
        });

        if (!result.success) {
          addToast({
            title: "입금 신청 실패",
            message: result.error || "입금 신청 처리 중 오류가 발생했습니다.",
            type: "error",
          });
          return;
        }

        setDepositAmount(0);
        setDepositAmountText("");
        setDepositorName("");
        setConfirmModal(null);
        addToast({
          title: "입금 신청 완료",
          message: "관리자 승인 후 잔액이 지급됩니다.",
          type: "success",
        });
      },
    });
  };

  // ── 출금 신청 ─────────────────────────────────────────────────────────
  const handleCreateWithdrawal = () => {
    if (withdrawAmount < minimumWithdraw) {
      addToast({
        title: "출금 신청 불가",
        message: `출금은 최소 ${formatKrw(minimumWithdraw)}부터 가능합니다.`,
        type: "warning",
      });
      return;
    }
    if (exceedsSingleLimit) {
      addToast({
        title: "출금 신청 불가",
        message: `1회 최대 출금 한도는 ${formatKrw(singleMaxWithdraw)}입니다.`,
        type: "error",
      });
      return;
    }
    if (exceedsAvailableBalance) {
      addToast({
        title: "출금 신청 불가",
        message: "가용 잔액이 부족합니다.",
        type: "error",
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
    setConfirmModal({
      title: "출금 신청 확인",
      description: "아래 내용으로 출금 신청을 진행합니다.",
      rows: [
        {
          label: "출금 신청액",
          value: `${formatKrw(withdrawAmount)} / ${formatEstimatedUsdtFromKrw(withdrawAmount, usdtKrwRate)}`,
        },
        {
          label: "출금 수수료",
          value: `${formatKrw(withdrawFee)} / ${formatEstimatedUsdtFromKrw(withdrawFee, usdtKrwRate)}`,
        },
        {
          label: "실차감액",
          value: `${formatKrw(totalDeduction)} / ${formatEstimatedUsdtFromKrw(totalDeduction, usdtKrwRate)}`,
          highlight: true,
        },
      ],
      accountInfo: {
        bank: bankProfile.bank,
        accountNumber: bankProfile.accountNumber,
        accountHolder: bankProfile.accountHolder,
      },
      notice:
        "회원가입 시 등록한 계좌로 출금됩니다. 관리자 승인 후 순차 처리됩니다.",
      onConfirm: async () => {
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
        setConfirmModal(null);
        addToast({
          title: "출금 신청 완료",
          message: `관리자 승인 후 처리됩니다. 실차감액 ${formatKrw(Number(result.deductedAmount ?? totalDeduction))} (${formatEstimatedUsdtFromKrw(Number(result.deductedAmount ?? totalDeduction), usdtKrwRate)})`,
          type: "success",
        });
      },
    });
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-y-auto bg-background p-6 lg:p-8 text-sm">
        <div className="mx-auto w-full max-w-5xl space-y-6 pb-10">
          <UserPageHeader
            eyebrow="Wallet operations"
            title="입금과 출금을 한 화면에서 처리합니다."
            description="잔액, 환산 USDT, 수수료와 실차감액을 같은 기준으로 보여줘 실수를 줄입니다."
          />

          <div className="grid gap-3 md:grid-cols-2">
            <UserMetricCard
              label="보유 잔액"
              tone="warning"
              value={formatWalletBalance(currentPoints)}
              subvalue={`≈ ${formatEstimatedUsdtFromKrw(currentPoints, usdtKrwRate)}`}
            />
            <UserMetricCard
              label="출금 가능 금액"
              tone="default"
              value={formatWalletBalance(availableBalance)}
              subvalue={`≈ ${formatEstimatedUsdtFromKrw(availableBalance, usdtKrwRate)}`}
            />
          </div>

          <UserPanel className="relative" contentClassName="space-y-6 p-0">
            {!isLoggedIn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0e11]/80 backdrop-blur-sm z-20">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <Lock size={24} className="text-gray-500" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  로그인이 필요합니다
                </h2>
                <p className="text-gray-400 mb-6 text-center max-w-sm">
                  입출금 서비스를 이용하려면 먼저 로그인하세요.
                </p>
                <button
                  onClick={() => (window.location.href = "/login")}
                  className="px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-colors"
                >
                  로그인
                </button>
              </div>
            )}

            <div className="border-b hairline-divider px-5 py-4">
              <UserSegmentedTabs
                active={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    id: "입금",
                    label: (
                      <span className="flex items-center gap-2">
                        <ArrowDownToLine size={15} /> 입금
                      </span>
                    ),
                  },
                  {
                    id: "출금",
                    label: (
                      <span className="flex items-center gap-2">
                        <ArrowUpFromLine size={15} /> 출금
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            <div className="px-5 py-5 md:px-6 md:py-6">
              {/* ── 입금 탭 ────────────────────────────────────────── */}
              {activeTab === "입금" && (
                <div className="space-y-6">
                  {/* 입금 폼 */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-400 mb-1.5">
                        입금 금액 (최소 10,000원)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={depositAmountText}
                          onChange={(e) =>
                            handleAmountChange(
                              e.target.value,
                              setDepositAmount,
                              setDepositAmountText,
                            )
                          }
                          placeholder="0"
                          className="w-full rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-right text-white focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                          원
                        </span>
                      </div>
                      {depositAmount > 0 && (
                        <p className="text-xs text-gray-500 mt-1 text-right">
                          ≈{" "}
                          {formatEstimatedUsdtFromKrw(
                            depositAmount,
                            usdtKrwRate,
                          )}
                        </p>
                      )}
                      {depositAmount > 0 && depositAmount < 10000 && (
                        <p className="text-xs text-red-400 mt-1">
                          최소 10,000원부터 입금 가능합니다.
                        </p>
                      )}
                    </div>

                    {/* 빠른 금액 선택 */}
                    <div className="grid grid-cols-4 gap-2">
                      {[10000, 30000, 50000, 100000].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => {
                            setDepositAmount(amt);
                            setDepositAmountText(formatInteger(amt));
                          }}
                          className={cn(
                            "rounded-xl border py-2.5 text-xs transition-colors",
                            depositAmount === amt
                              ? "bg-yellow-500/10 border-yellow-500 text-yellow-500"
                              : "border-white/8 bg-white/3 text-gray-300 hover:bg-white/5 hover:text-white",
                          )}
                        >
                          {formatInteger(amt / 10000)}만원
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-gray-400 mb-1.5">
                        입금자명
                      </label>
                      <input
                        type="text"
                        value={depositorName}
                        onChange={(e) => setDepositorName(e.target.value)}
                        placeholder="실제 입금자명을 입력하세요"
                        className="w-full rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-white focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none"
                      />
                    </div>

                    <div className="rounded-2xl border border-yellow-500/16 bg-yellow-500/6 p-4 text-xs text-yellow-500/90 space-y-1">
                      <p>💡 입금 신청 후 아래 계좌로 입금해주세요.</p>
                      <p className="text-white font-medium">
                        KB국민은행 000-0000-0000 (주)넥서스
                      </p>
                      <p>
                        입금자명이 일치해야 빠른 처리가 가능합니다. 관리자 확인
                        후 잔액이 지급됩니다.
                      </p>
                    </div>

                    <button
                      onClick={handleCreateDeposit}
                      disabled={depositAmount < 10000}
                      className="w-full rounded-full bg-yellow-500 py-3.5 font-semibold text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      입금 신청하기
                    </button>
                  </div>

                  {/* 입금 내역 */}
                  <div>
                    <h3 className="text-base font-bold text-white mb-3">
                      입금 내역
                    </h3>
                    <div className="overflow-hidden rounded-2xl border border-white/6">
                      <table className="w-full text-sm text-left">
                        <thead className="text-gray-400 bg-gray-800/50 text-xs">
                          <tr>
                            <th className="px-4 py-3 font-medium">일시</th>
                            <th className="px-4 py-3 font-medium text-right">
                              금액
                            </th>
                            <th className="px-4 py-3 font-medium text-center w-24">
                              상태
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                          {deposits.length === 0 ? (
                            <tr>
                              <td
                                colSpan={3}
                                className="px-4 py-8 text-center text-gray-500"
                              >
                                입금 내역이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            deposits.map((item) => (
                              <tr
                                key={item.id}
                                className="transition-colors hover:bg-white/3"
                              >
                                <td className="px-4 py-3 text-gray-300 text-xs">
                                  {item.date}
                                </td>
                                <td className="px-4 py-3 font-medium text-green-400 text-right">
                                  {formatKrw(item.amount)}
                                  <p className="text-[11px] text-gray-500 mt-1">
                                    {formatEstimatedUsdtFromKrw(
                                      item.amount,
                                      usdtKrwRate,
                                    )}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`px-2 py-1 rounded text-xs ${statusColor(item.status)}`}
                                  >
                                    {statusLabel(item.status, "deposit")}
                                  </span>
                                  {item.status === "rejected" &&
                                    item.rejectReason && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        {item.rejectReason}
                                      </p>
                                    )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 출금 탭 ────────────────────────────────────────── */}
              {activeTab === "출금" && (
                <div className="space-y-6">
                  {/* 출금 폼 */}
                  <div className="space-y-4">
                    <div>
                      <label className="flex text-gray-400 mb-1.5 justify-between">
                        <span>
                          출금 금액 (최소 {formatKrw(minimumWithdraw)})
                        </span>
                        <span className="text-yellow-500">
                          사용 가능: {formatWalletBalance(availableBalance)} /{" "}
                          {formatEstimatedUsdtFromKrw(
                            availableBalance,
                            usdtKrwRate,
                          )}
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={withdrawAmountText}
                          onChange={(e) =>
                            handleAmountChange(
                              e.target.value,
                              setWithdrawAmount,
                              setWithdrawAmountText,
                            )
                          }
                          placeholder="0"
                          className="w-full rounded-2xl border border-white/8 bg-white/3 px-4 py-3 pr-8 text-right text-white focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                          원
                        </span>
                      </div>
                      {withdrawAmount > 0 && (
                        <p className="text-xs text-gray-500 mt-1 text-right">
                          ≈{" "}
                          {formatEstimatedUsdtFromKrw(
                            withdrawAmount,
                            usdtKrwRate,
                          )}
                        </p>
                      )}
                      {withdrawAmount > 0 &&
                        withdrawAmount < minimumWithdraw && (
                          <p className="text-xs text-red-400 mt-1">
                            최소 {formatKrw(minimumWithdraw)}
                            부터 출금 가능합니다.
                          </p>
                        )}
                      {exceedsSingleLimit && (
                        <p className="text-xs text-red-400 mt-1">
                          1회 최대 출금 한도는 {formatKrw(singleMaxWithdraw)}
                          입니다.
                        </p>
                      )}
                      {exceedsAvailableBalance && (
                        <p className="text-xs text-red-400 mt-1">
                          수수료 포함 실차감액이 가용 잔액을 초과합니다.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="rounded-lg border border-gray-800 bg-[#0d1117] px-4 py-3">
                        <p className="text-gray-500 mb-1">출금 수수료</p>
                        <p className="font-semibold text-white">
                          {formatKrw(withdrawFee)}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {formatEstimatedUsdtFromKrw(withdrawFee, usdtKrwRate)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-800 bg-[#0d1117] px-4 py-3">
                        <p className="text-gray-500 mb-1">실차감액</p>
                        <p className="font-semibold text-yellow-500">
                          {formatKrw(totalDeduction)}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {formatEstimatedUsdtFromKrw(
                            totalDeduction,
                            usdtKrwRate,
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-800 bg-[#0d1117] px-4 py-3">
                        <p className="text-gray-500 mb-1">1회 최대 한도</p>
                        <p className="font-semibold text-white">
                          {singleMaxWithdraw > 0
                            ? formatKrw(singleMaxWithdraw)
                            : "제한 없음"}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {singleMaxWithdraw > 0
                            ? formatEstimatedUsdtFromKrw(
                                singleMaxWithdraw,
                                usdtKrwRate,
                              )
                            : "-"}
                        </p>
                      </div>
                    </div>

                    {/* 빠른 금액 선택 */}
                    <div className="grid grid-cols-4 gap-2">
                      {[10000, 30000, 50000, 100000].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => {
                            setWithdrawAmount(amt);
                            setWithdrawAmountText(formatInteger(amt));
                          }}
                          className={cn(
                            "rounded-xl border py-2.5 text-xs transition-colors",
                            withdrawAmount === amt
                              ? "bg-yellow-500/10 border-yellow-500 text-yellow-500"
                              : "border-white/8 bg-white/3 text-gray-300 hover:bg-white/5 hover:text-white",
                          )}
                        >
                          {formatInteger(amt / 10000)}만
                        </button>
                      ))}
                    </div>

                    {/* 계좌 정보 */}
                    <div className="rounded-2xl border border-white/6 bg-white/3 p-4 space-y-3">
                      <h4 className="text-xs text-gray-400 font-medium mb-2">
                        출금 계좌 정보
                      </h4>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">은행</span>
                        <span className="text-white">{bankProfile.bank}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">계좌번호</span>
                        <span className="text-white">
                          {bankProfile.accountNumber}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">예금주</span>
                        <span className="text-white">
                          {bankProfile.accountHolder}
                        </span>
                      </div>
                      <p className="text-xs text-yellow-500/70 mt-2 text-center pt-2 border-t border-gray-800">
                        * 회원가입 시 등록한 계좌로 출금됩니다.
                      </p>
                    </div>

                    <button
                      onClick={handleCreateWithdrawal}
                      disabled={
                        withdrawAmount < minimumWithdraw ||
                        exceedsSingleLimit ||
                        exceedsAvailableBalance ||
                        !bankProfile.bank ||
                        !bankProfile.accountNumber ||
                        !bankProfile.accountHolder
                      }
                      className="w-full py-3.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      출금 신청하기
                    </button>
                  </div>

                  {/* 출금 내역 */}
                  <div>
                    <h3 className="text-base font-bold text-white mb-3">
                      출금 내역
                    </h3>
                    <div className="border border-gray-800 rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="text-gray-400 bg-gray-800/50 text-xs">
                          <tr>
                            <th className="px-4 py-3 font-medium">일시</th>
                            <th className="px-4 py-3 font-medium text-right">
                              금액
                            </th>
                            <th className="px-4 py-3 font-medium text-center w-24">
                              상태
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                          {withdrawals.length === 0 ? (
                            <tr>
                              <td
                                colSpan={3}
                                className="px-4 py-8 text-center text-gray-500"
                              >
                                출금 내역이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            withdrawals.map((item) => (
                              <tr
                                key={item.id}
                                className="hover:bg-gray-800/20 transition-colors"
                              >
                                <td className="px-4 py-3 text-gray-300 text-xs">
                                  {item.date}
                                </td>
                                <td className="px-4 py-3 font-medium text-red-400 text-right">
                                  {formatKrw(-(item.amount + item.fee))}
                                  <p className="text-[11px] text-gray-500 mt-1">
                                    {formatEstimatedUsdtFromKrw(
                                      item.amount + item.fee,
                                      usdtKrwRate,
                                    )}
                                  </p>
                                  {item.fee > 0 && (
                                    <p className="text-[11px] text-gray-500 mt-1">
                                      신청액 {formatKrw(item.amount)} + 수수료{" "}
                                      {formatKrw(item.fee)}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`px-2 py-1 rounded text-xs ${statusColor(item.status)}`}
                                  >
                                    {statusLabel(item.status, "withdrawal")}
                                  </span>
                                  {item.status === "rejected" &&
                                    item.rejectReason && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        {item.rejectReason}
                                      </p>
                                    )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </UserPanel>
        </div>
      </div>

      {/* 확인 모달 */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          description={confirmModal.description}
          rows={confirmModal.rows}
          accountInfo={confirmModal.accountInfo}
          notice={confirmModal.notice}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </AppLayout>
  );
}
