import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSummaryCard } from "@/components/admin/ui/AdminSummaryCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import {
  AdminLoadingSpinner,
  AdminErrorState,
  AdminEmptyState,
} from "@/components/admin/ui/AdminLoadingSpinner";
import {
  AdminInput,
  AdminButton,
  AdminSelect,
} from "@/components/admin/ui/AdminForms";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { DbAgentCommission } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatDate";
import { formatUsdt } from "@/lib/utils/numberFormat";

const supabase = createClient();
const PAGE_SIZE = 10;

type WithdrawalActivityRow = {
  id: number;
  agent_id: string | null;
  amount: number | string | null;
  bank: string | null;
  account_number: string | null;
  account_holder: string | null;
  status: string | null;
  reject_reason: string | null;
  created_at: string;
};

type CommissionActivityRow = DbAgentCommission & {
  user_profiles?: {
    name?: string | null;
  } | null;
};

type ActivityRow = {
  id: string;
  rawDate: string;
  date: string;
  partnerName: string;
  activityType: "withdrawal" | "commission";
  typeLabel: string;
  detail: string;
  amount: number;
  status: string;
  rejectReason: string | null;
  searchText: string;
};

function getDateOnly(value: string) {
  return value.slice(0, 10);
}

function commissionTypeLabel(sourceType: DbAgentCommission["source_type"]) {
  switch (sourceType) {
    case "trade_fee":
      return "거래 수수료";
    case "staking":
      return "스테이킹";
    case "deposit":
      return "입금";
    default:
      return sourceType || "커미션";
  }
}

function statusLabel(s: string | null | undefined) {
  switch (s) {
    case "earned":
      return "지급";
    case "pending":
      return "처리중";
    case "approved":
      return "완료";
    case "rejected":
      return "거절";
    default:
      return s || "-";
  }
}

function statusColor(s: string | null | undefined) {
  switch (s) {
    case "earned":
    case "approved":
      return "bg-green-500/20 text-green-500";
    case "rejected":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-yellow-500/20 text-yellow-400";
  }
}

export function PartnerLogTab() {
  const { isInitialized, role } = useAuth();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const statusOptions = useMemo(() => {
    const common = [{ value: "all", label: "전체" }];

    if (activityTypeFilter === "withdrawal") {
      return [
        ...common,
        { value: "pending", label: "처리중" },
        { value: "approved", label: "완료" },
        { value: "rejected", label: "거절" },
      ];
    }

    if (activityTypeFilter === "commission") {
      return [...common, { value: "earned", label: "지급" }];
    }

    return [
      ...common,
      { value: "pending", label: "처리중" },
      { value: "approved", label: "완료" },
      { value: "rejected", label: "거절" },
      { value: "earned", label: "지급" },
    ];
  }, [activityTypeFilter]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      await supabase.auth.getSession();
      const [withdrawalResult, commissionResult] = await Promise.all([
        supabase
          .from("withdrawals")
          .select(
            "id, agent_id, amount, bank, account_number, account_holder, status, reject_reason, created_at",
          )
          .eq("withdrawal_type", "agent")
          .order("created_at", { ascending: false }),
        supabase
          .from("agent_commissions")
          .select(
            "id, agent_id, user_id, source_type, source_id, amount, created_at, user_profiles(name)",
          )
          .order("created_at", { ascending: false }),
      ]);

      if (withdrawalResult.error) {
        throw withdrawalResult.error;
      }

      if (commissionResult.error) {
        throw commissionResult.error;
      }

      const withdrawals = withdrawalResult.data;
      const commissions = commissionResult.data;

      const agentIds = Array.from(
        new Set(
          [
            ...((withdrawals as WithdrawalActivityRow[] | null) ?? []).map(
              (item) => item.agent_id,
            ),
            ...((commissions as CommissionActivityRow[] | null) ?? []).map(
              (item) => item.agent_id,
            ),
          ].filter(Boolean),
        ),
      ) as string[];

      const { data: agents, error: agentsError } =
        agentIds.length > 0
          ? await supabase.from("agents").select("id, name").in("id", agentIds)
          : { data: [], error: null };

      if (agentsError) {
        throw agentsError;
      }

      const agentNameMap: Record<string, string> = {};
      (agents || []).forEach((agent: { id: string; name: string | null }) => {
        agentNameMap[agent.id] = agent.name || "-";
      });

      const withdrawalActivities: ActivityRow[] = (
        (withdrawals as WithdrawalActivityRow[] | null) ?? []
      ).map((item) => ({
        id: `withdrawal-${item.id}`,
        rawDate: item.created_at,
        date: formatDateTime(item.created_at),
        partnerName: agentNameMap[item.agent_id || ""] || item.agent_id || "-",
        activityType: "withdrawal",
        typeLabel: "출금",
        detail: `${item.bank || "-"} / ${item.account_number || "-"} / ${item.account_holder || "-"}`,
        amount: Number(item.amount || 0),
        status: item.status || "pending",
        rejectReason: item.reject_reason,
        searchText: [
          agentNameMap[item.agent_id || ""] || item.agent_id || "",
          item.bank || "",
          item.account_number || "",
          item.account_holder || "",
          statusLabel(item.status),
          "출금",
        ]
          .join(" ")
          .toLowerCase(),
      }));

      const commissionActivities: ActivityRow[] = (
        (commissions as CommissionActivityRow[] | null) ?? []
      ).map((item) => {
        const sourceLabel = commissionTypeLabel(item.source_type);
        const memberName = item.user_profiles?.name || "-";
        return {
          id: `commission-${item.id}`,
          rawDate: item.created_at,
          date: formatDateTime(item.created_at),
          partnerName:
            agentNameMap[item.agent_id || ""] || item.agent_id || "-",
          activityType: "commission",
          typeLabel: "커미션",
          detail: `${sourceLabel} · 회원 ${memberName}`,
          amount: Number(item.amount || 0),
          status: "earned",
          rejectReason: null,
          searchText: [
            agentNameMap[item.agent_id || ""] || item.agent_id || "",
            memberName,
            sourceLabel,
            "커미션",
            statusLabel("earned"),
          ]
            .join(" ")
            .toLowerCase(),
        };
      });

      setActivities(
        [...withdrawalActivities, ...commissionActivities].sort((a, b) =>
          b.rawDate.localeCompare(a.rawDate),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "파트너 활동 로그를 불러오지 못했습니다.";
      setLoadError(message);
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    void load();
  }, [isInitialized, load, role]);

  useEffect(() => {
    if (statusOptions.some((option) => option.value === statusFilter)) {
      return;
    }

    setStatusFilter("all");
  }, [statusFilter, statusOptions]);

  const filteredActivities = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();
    return activities.filter((item) => {
      if (
        activityTypeFilter !== "all" &&
        item.activityType !== activityTypeFilter
      ) {
        return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      const dateOnly = getDateOnly(item.rawDate);
      if (startDate && dateOnly < startDate) {
        return false;
      }
      if (endDate && dateOnly > endDate) {
        return false;
      }
      if (trimmedSearch && !item.searchText.includes(trimmedSearch)) {
        return false;
      }
      return true;
    });
  }, [
    activities,
    activityTypeFilter,
    endDate,
    search,
    startDate,
    statusFilter,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredActivities.length / PAGE_SIZE),
  );

  const pagedActivities = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredActivities.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredActivities]);

  const totalCommissionAmount = filteredActivities
    .filter((item) => item.activityType === "commission")
    .reduce((sum, item) => sum + item.amount, 0);
  const totalWithdrawalAmount = filteredActivities
    .filter((item) => item.activityType === "withdrawal")
    .reduce((sum, item) => sum + item.amount, 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [activityTypeFilter, endDate, search, startDate, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AdminSummaryCard
          label="총 활동 건수"
          value={`${filteredActivities.length}건`}
        />
        <AdminSummaryCard
          label="커미션 합계"
          value={formatUsdt(totalCommissionAmount)}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="출금 합계"
          value={formatUsdt(totalWithdrawalAmount)}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="완료 출금 건수"
          value={`${filteredActivities.filter((item) => item.status === "approved").length}건`}
          valueClassName="text-lg font-bold text-white"
        />
      </div>

      <AdminSearchFilterCard
        fields={[
          {
            key: "date",
            label: "기간",
            className: "md:col-span-2",
            control: (
              <AdminDateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            ),
          },
          {
            key: "activityType",
            label: "유형",
            control: (
              <AdminSelect
                className="w-full"
                value={activityTypeFilter}
                onChange={(e) => setActivityTypeFilter(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="withdrawal">출금</option>
                <option value="commission">커미션</option>
              </AdminSelect>
            ),
          },
          {
            key: "status",
            label: "상태",
            control: (
              <AdminSelect
                className="w-full"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="md:grid-cols-4"
        searchLabel="검색어"
        searchControls={
          <div
            className="grid min-w-0 items-end gap-2"
            style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
          >
            <AdminInput
              className="min-w-0 w-full"
              placeholder="파트너명, 회원명, 계좌번호, 활동내용 검색"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearch(e.target.value)
              }
            />
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                setCurrentPage(1);
                setSearch((prev) => prev.trim());
                void load();
              }}
            >
              <Search className="w-4 h-4" />
              조회
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`활동 로그 (${filteredActivities.length}건)`}>
        {isLoading ? (
          <AdminLoadingSpinner message="파트너 활동 로그를 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState message={loadError} onRetry={() => void load()} />
        ) : filteredActivities.length === 0 ? (
          <AdminEmptyState message="조건에 맞는 활동 로그가 없습니다." />
        ) : (
          <>
            <AdminTable
              headers={[
                "일시",
                "파트너명",
                "유형",
                "상세",
                "금액(USDT)",
                "상태",
              ]}
            >
              {pagedActivities.map((item) => (
                <AdminTableRow key={item.id}>
                  <AdminTableCell className="text-xs text-gray-400 whitespace-nowrap">
                    {item.date}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-white font-medium">
                    {item.partnerName}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${item.activityType === "commission" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}
                    >
                      {item.typeLabel}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    <div>{item.detail}</div>
                    {item.rejectReason ? (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {item.rejectReason}
                      </p>
                    ) : null}
                  </AdminTableCell>
                  <AdminTableCell
                    className={`text-center font-medium text-xs whitespace-nowrap ${item.activityType === "commission" ? "text-green-400" : "text-white"}`}
                  >
                    {formatUsdt(item.amount, {
                      signed: item.activityType === "commission",
                    })}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColor(item.status)}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
            <AdminPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={filteredActivities.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              className="px-4 pb-4"
            />
          </>
        )}
      </AdminCard>
    </div>
  );
}
