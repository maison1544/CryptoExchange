import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import { AdminSummaryCard } from "@/components/admin/ui/AdminSummaryCard";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { AdminActionDropdown } from "@/components/admin/ui/AdminActionDropdown";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import {
  AdminInput,
  AdminSelect,
  AdminButton,
} from "@/components/admin/ui/AdminForms";
import { Search, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { manageStakingAction } from "@/lib/api/admin";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

const supabase = createClient();

type StakingRow = {
  id: number;
  startDate: string;
  endDate: string;
  memberId: string;
  name: string;
  partner: string;
  symbol: string;
  productName: string;
  amount: number;
  period: number;
  apy: string;
  expectedReward: number;
  currentReward: number;
  status: string;
  daysLeft: number;
};

type StakingProductMeta = {
  name: string | null;
  coin?: string | null;
  symbol: string | null;
  duration_days: number | null;
  apy: number | string | null;
  annual_rate?: number | string | null;
};

type StakingPositionRow = {
  id: number;
  user_id: string;
  started_at: string;
  ends_at: string;
  amount: number | string | null;
  daily_reward: number | string | null;
  total_earned: number | string | null;
  status: string;
  settlement_rate_override?: number | string | null;
  staking_products: StakingProductMeta | null;
};

function mapStakingRows(
  positions: StakingPositionRow[] | null,
  users: UserDisplayProfile[] | null,
) {
  const { emailById, nameById } = createUserDisplayMaps(users);
  const stakingPositions = positions ?? [];
  const now = new Date();

  return stakingPositions.map((position) => {
    const product = position.staking_products;
    const endDate = new Date(position.ends_at);
    const daysLeft = Math.max(
      0,
      Math.ceil((endDate.getTime() - now.getTime()) / 86400000),
    );
    const statusMap: Record<string, string> = {
      active: "진행중",
      completed: "완료",
      cancelled: "강제취소",
    };

    return {
      id: position.id,
      startDate: new Date(position.started_at).toISOString().split("T")[0],
      endDate: new Date(position.ends_at).toISOString().split("T")[0],
      memberId: emailById[position.user_id] || "-",
      name: nameById[position.user_id] || "-",
      partner: "-",
      symbol: product?.coin || product?.symbol || "USDT",
      productName: product?.name || "-",
      amount: Number(position.amount),
      period: product?.duration_days || 30,
      apy: `${product?.apy ?? product?.annual_rate ?? 0}%`,
      expectedReward:
        Number(position.daily_reward) * (product?.duration_days || 30),
      currentReward: Number(position.total_earned),
      status: statusMap[position.status] || position.status,
      daysLeft,
    } satisfies StakingRow;
  });
}

export function StakingListTab() {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const [mockStakingList, setStakingList] = useState<StakingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchField, setSearchField] = useState("memberId");
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<
    (typeof mockStakingList)[0] | null
  >(null);
  const [settleTarget, setSettleTarget] = useState<
    (typeof mockStakingList)[0] | null
  >(null);
  const [settleRate, setSettleRate] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const loadData = useCallback(async () => {
    if (!isInitialized || role !== "admin") {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const { data: positions, error: positionsError } = await supabase
        .from("staking_positions")
        .select("*, staking_products(*)")
        .order("started_at", { ascending: false });

      if (positionsError) {
        throw positionsError;
      }

      const { data: users, error: usersError } = await supabase
        .from("user_profiles")
        .select("id, name, email");

      if (usersError) {
        throw usersError;
      }

      setStakingList(
        mapStakingRows(
          (positions as StakingPositionRow[] | null) ?? [],
          (users as UserDisplayProfile[] | null) ?? [],
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "스테이킹 데이터를 불러오지 못했습니다.";
      setLoadError(message);
      setStakingList([]);
      addToast({
        title: "스테이킹 데이터 로드 실패",
        message,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast, isInitialized, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadData]);

  const filteredStakingList = useMemo(() => {
    return mockStakingList.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!searchQuery.trim()) {
        return true;
      }

      const keyword = searchQuery.trim().toLowerCase();
      const targetValue =
        searchField === "name"
          ? item.name
          : searchField === "partner"
            ? item.partner
            : item.memberId;

      return targetValue.toLowerCase().includes(keyword);
    });
  }, [mockStakingList, searchField, searchQuery, statusFilter]);

  const handleSettle = async () => {
    if (!settleTarget || isProcessing) return;

    setIsProcessing(true);

    try {
      const result = await manageStakingAction({
        action: "settle-position",
        stakingId: settleTarget.id,
        rate: settleRate === "" ? null : Number(settleRate),
      });

      if (!result?.success) {
        addToast({
          title: "결과처리 실패",
          message: result?.error || "스테이킹 결과처리에 실패했습니다.",
          type: "error",
        });
        return;
      }

      addToast({
        title: "스테이킹 결과처리 완료",
        message: `${settleTarget.name}님의 ${settleTarget.symbol} 스테이킹 결과처리가 완료되었습니다.`,
        type: "success",
      });
      setSettleTarget(null);
      setSettleRate("");
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || isProcessing) return;

    setIsProcessing(true);

    try {
      const result = await manageStakingAction({
        action: "cancel-position",
        stakingId: cancelTarget.id,
        reason: cancelReason || "관리자 취소",
      });

      if (!result?.success) {
        addToast({
          title: "강제취소 실패",
          message: result?.error || "스테이킹 강제취소에 실패했습니다.",
          type: "error",
        });
        return;
      }

      addToast({
        title: "스테이킹 강제취소 완료",
        message: `${cancelTarget.name}님의 ${cancelTarget.symbol} 스테이킹이 강제취소 처리되었습니다.`,
        type: "success",
      });
      setCancelTarget(null);
      setCancelReason("");
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AdminSummaryCard
          label="진행중"
          value={`${mockStakingList.filter((s) => s.status === "진행중").length}건`}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="완료"
          value={`${mockStakingList.filter((s) => s.status === "완료").length}건`}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="강제취소"
          value={`${mockStakingList.filter((s) => s.status === "강제취소").length}건`}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="총 스테이킹 건수"
          value={`${mockStakingList.length}건`}
        />
      </div>

      <AdminSearchFilterCard
        fields={[
          {
            key: "status",
            label: "상태",
            control: (
              <AdminSelect
                className="w-full"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="진행중">진행중</option>
                <option value="완료">완료</option>
                <option value="강제취소">강제취소</option>
              </AdminSelect>
            ),
          },
          {
            key: "searchField",
            label: "검색 항목",
            control: (
              <AdminSelect
                className="w-full"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
              >
                <option value="memberId">이메일</option>
                <option value="name">이름</option>
                <option value="partner">파트너명</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-4"
        searchLabel="검색어"
        searchControls={
          <div
            className="grid min-w-0 items-end gap-2"
            style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
          >
            <AdminInput
              className="min-w-0 w-full"
              placeholder="검색어 입력"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <AdminButton className="shrink-0 whitespace-nowrap">
              <Search className="w-4 h-4" />
              조회
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`스테이킹 현황 (${filteredStakingList.length}건)`}>
        {isLoading ? (
          <AdminLoadingSpinner message="스테이킹 현황을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError}
            onRetry={() => void loadData()}
          />
        ) : filteredStakingList.length === 0 ? (
          <AdminEmptyState message="조건에 맞는 스테이킹 내역이 없습니다." />
        ) : (
          <AdminTable
            headers={[
              "시작일",
              "만료일",
              "이메일",
              "이름",
              "파트너",
              "코인",
              "상품명",
              "스테이킹액",
              "만기일수",
              "수익률",
              "예상수익",
              "현재수익",
              "잔여일",
              "상태",
              "관리",
            ]}
          >
            {filteredStakingList.map((item) => (
              <AdminTableRow key={item.id}>
                <AdminTableCell className="text-xs whitespace-nowrap">
                  {item.startDate}
                </AdminTableCell>
                <AdminTableCell className="text-xs whitespace-nowrap">
                  {item.endDate}
                </AdminTableCell>
                <AdminTableCell className="text-xs">
                  {item.memberId}
                </AdminTableCell>
                <AdminTableCell className="text-xs">{item.name}</AdminTableCell>
                <AdminTableCell className="text-xs">
                  {item.partner}
                </AdminTableCell>
                <AdminTableCell className="font-medium text-yellow-500 text-xs">
                  {item.symbol}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-white">
                  {item.productName}
                </AdminTableCell>
                <AdminTableCell className="text-center text-xs">
                  {formatDisplayNumber(item.amount, {
                    maximumFractionDigits: 4,
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-center text-xs">
                  {item.period}일
                </AdminTableCell>
                <AdminTableCell className="text-center text-green-400 text-xs">
                  {item.apy}
                </AdminTableCell>
                <AdminTableCell className="text-center text-xs">
                  {formatDisplayNumber(item.expectedReward, {
                    maximumFractionDigits: 4,
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-center text-yellow-400 text-xs">
                  {formatDisplayNumber(item.currentReward, {
                    maximumFractionDigits: 4,
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-center text-xs">
                  {item.daysLeft > 0 ? `${item.daysLeft}일` : "-"}
                </AdminTableCell>
                <AdminTableCell>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      item.status === "진행중"
                        ? "bg-blue-500/20 text-blue-500"
                        : item.status === "완료"
                          ? "bg-green-500/20 text-green-500"
                          : "bg-red-500/20 text-red-500"
                    }`}
                  >
                    {item.status}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  {item.status === "진행중" && (
                    <AdminActionDropdown
                      disabled={isProcessing}
                      label="관리"
                      options={[
                        {
                          label: "즉시 결과처리",
                          onSelect: () => {
                            setSettleRate("");
                            setSettleTarget(item);
                          },
                          tone: "success",
                        },
                        {
                          label: "강제취소",
                          onSelect: () => setCancelTarget(item),
                          tone: "danger",
                        },
                      ]}
                    />
                  )}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {/* 강제취소 확인 모달 */}
      <AdminModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="스테이킹 강제취소"
      >
        {cancelTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle className="text-red-500 shrink-0" size={20} />
              <p className="text-sm text-red-400">
                강제취소 시 현재까지 누적된 수익은 지급되지 않으며, 원금만
                반환됩니다.
              </p>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">회원</span>
                <span className="text-white">
                  {cancelTarget.name} ({cancelTarget.memberId})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">코인</span>
                <span className="text-yellow-500 font-medium">
                  {cancelTarget.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">스테이킹 금액</span>
                <span className="text-white">
                  {formatDisplayNumber(cancelTarget.amount, {
                    maximumFractionDigits: 4,
                  })}{" "}
                  {cancelTarget.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">기간</span>
                <span className="text-white">
                  {cancelTarget.startDate} ~ {cancelTarget.endDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">현재 수익</span>
                <span className="text-yellow-400">
                  {formatDisplayNumber(cancelTarget.currentReward, {
                    maximumFractionDigits: 4,
                  })}{" "}
                  {cancelTarget.symbol} (미지급)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">잔여일</span>
                <span className="text-white">{cancelTarget.daysLeft}일</span>
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-xs text-gray-300 mb-1">
                취소 사유
              </label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 bg-[#0d1117] border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors resize-none"
                placeholder="강제취소 사유를 입력하세요"
              />
            </div>
            <div className="border-t border-gray-800 pt-4 flex justify-center gap-2">
              <AdminButton
                variant="secondary"
                onClick={() => setCancelTarget(null)}
                disabled={isProcessing}
              >
                취소
              </AdminButton>
              <AdminButton
                variant="danger"
                onClick={handleCancel}
                disabled={isProcessing}
              >
                강제취소 확인
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>
      {/* 개별 계약 결과처리 모달 */}
      <AdminModal
        isOpen={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        title={`만기 결과처리 — ${settleTarget?.name || ""}`}
      >
        {settleTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 text-xs leading-relaxed text-orange-200">
              스테이킹 현황의 결과처리는 선택한 계약을 즉시 완료 처리하고 원금과
              산정 수익을 바로 스테이킹 잔고로 지급합니다. 상품 관리의 상품
              결과처리는 만기 자동지급 때 사용할 기본 예약값을 저장하는 기능입니다.
            </div>
            <div className="bg-[#0d1117] rounded-lg p-4 space-y-2 text-sm">
              {[
                ["회원", `${settleTarget.name} (${settleTarget.memberId})`],
                ["코인", settleTarget.symbol],
                [
                  "스테이킹액",
                  `${formatDisplayNumber(settleTarget.amount, {
                    maximumFractionDigits: 4,
                  })} ${settleTarget.symbol}`,
                ],
                [
                  "기간",
                  `${settleTarget.startDate} ~ ${settleTarget.endDate} (${settleTarget.period}일)`,
                ],
                [
                  "잔여일",
                  settleTarget.daysLeft > 0
                    ? `${settleTarget.daysLeft}일`
                    : "만기 도래",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white">{value}</span>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                최종 적용 이율 (%){" "}
                <span className="text-orange-400 ml-1">마이너스 입력 가능</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={settleRate}
                onChange={(e) => setSettleRate(e.target.value)}
                placeholder="예: -3.5 또는 8.2"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            {settleRate && (
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">예상 지급액</span>
                  <span
                    className={
                      Number(settleRate) < 0
                        ? "text-red-400 font-bold"
                        : "text-green-400 font-bold"
                    }
                  >
                    {settleTarget.symbol === "USDT"
                      ? formatUsdt(
                          settleTarget.amount * (1 + Number(settleRate) / 100),
                          {
                            maximumFractionDigits: 4,
                          },
                        )
                      : `${formatDisplayNumber(
                          settleTarget.amount * (1 + Number(settleRate) / 100),
                          {
                            maximumFractionDigits: 4,
                          },
                        )} ${settleTarget.symbol}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">손익</span>
                  <span
                    className={
                      Number(settleRate) < 0 ? "text-red-400" : "text-green-400"
                    }
                  >
                    {settleTarget.symbol === "USDT"
                      ? formatUsdt(
                          (settleTarget.amount * Number(settleRate)) / 100,
                          {
                            maximumFractionDigits: 4,
                            signed: true,
                          },
                        )
                      : `${formatDisplayNumber(
                          (settleTarget.amount * Number(settleRate)) / 100,
                          {
                            maximumFractionDigits: 4,
                            signed: true,
                          },
                        )} ${settleTarget.symbol}`}
                  </span>
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-center border-t border-gray-800 pt-4">
              <AdminButton
                variant="secondary"
                onClick={() => setSettleTarget(null)}
                disabled={isProcessing}
              >
                취소
              </AdminButton>
              <AdminButton onClick={handleSettle} disabled={isProcessing}>
                결과 확정
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
