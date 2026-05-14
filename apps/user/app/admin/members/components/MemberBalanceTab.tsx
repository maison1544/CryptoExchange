import React, { useState, useEffect, useCallback } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import {
  AdminInput,
  AdminSelect,
  AdminButton,
} from "@/components/admin/ui/AdminForms";
import { AdminApprovalActionButtons } from "@/components/admin/ui/AdminApprovalActionButtons";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminLoadingSpinner,
  AdminErrorState,
  AdminEmptyState,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { processAdminWalletRequest } from "@/lib/api/adminDashboard";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import {
  getPaginationBounds,
  normalizeTotalPages,
} from "@/lib/utils/pagination";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { formatDateTime } from "@/lib/utils/formatDate";
import { formatUsdt } from "@/lib/utils/numberFormat";

const supabase = createClient();
const PAGE_SIZE = 10;

interface BalanceLog {
  id: number;
  date: string;
  email: string;
  name: string;
  type: "입금" | "출금";
  amount: number;
  balance: number;
  status: "완료" | "대기" | "거절";
  approvedBy: string;
  processedAt: string;
  memo: string;
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
  _table: "deposits" | "withdrawals";
  isAgent?: boolean;
}

type UserBalanceProfile = UserDisplayProfile & {
  wallet_balance: number | string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_holder: string | null;
};

type DepositHistoryRow = {
  id: number;
  user_id: string;
  created_at: string;
  amount: number | string | null;
  status: string | null;
  processed_at: string | null;
  reject_reason: string | null;
  depositor_name: string | null;
};

type WithdrawalHistoryRow = {
  id: number;
  user_id: string | null;
  agent_id: string | null;
  withdrawal_type: string | null;
  created_at: string;
  amount: number | string | null;
  status: string | null;
  processed_at: string | null;
  reject_reason: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_holder: string | null;
};

type AgentDisplayInfo = {
  id: string;
  name: string | null;
  username: string | null;
};

export function MemberBalanceTab() {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const [balanceLogs, setBalanceLogs] = useState<BalanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingBalanceLogs, setPendingBalanceLogs] = useState<BalanceLog[]>(
    [],
  );
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchField, setSearchField] = useState<"email" | "name" | "memo">(
    "email",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    action: "approve" | "reject";
    log: BalanceLog;
  } | null>(null);
  const [detailTarget, setDetailTarget] = useState<BalanceLog | null>(null);
  const totalPages = normalizeTotalPages(totalCount, PAGE_SIZE);

  const applyBalanceLogs = useCallback(
    (payload: {
      pendingLogs: BalanceLog[];
      historyLogs: BalanceLog[];
      totalCount: number;
    }) => {
      setPendingBalanceLogs(payload.pendingLogs);
      setBalanceLogs(payload.historyLogs);
      setTotalCount(payload.totalCount);
      const nextTotalPages = normalizeTotalPages(payload.totalCount, PAGE_SIZE);
      setCurrentPage((current) =>
        current > nextTotalPages ? nextTotalPages : current,
      );
    },
    [],
  );

  const fetchBalanceLogs = useCallback(async () => {
    const trimmedSearch = searchTerm.trim();
    let matchedUserIds: string[] | null = null;

    if ((searchField === "email" || searchField === "name") && trimmedSearch) {
      const profileColumn = searchField === "email" ? "email" : "name";
      const { data: matchedUsers } = await supabase
        .from("user_profiles")
        .select("id")
        .ilike(profileColumn, `%${trimmedSearch}%`);
      matchedUserIds = ((matchedUsers as { id: string }[] | null) ?? [])
        .map((item) => item.id)
        .filter(Boolean);

      if (matchedUserIds.length === 0) {
        return {
          pendingLogs: [] as BalanceLog[],
          historyLogs: [] as BalanceLog[],
          totalCount: 0,
        };
      }
    }

    const historyPageSize = currentPage * PAGE_SIZE;
    const { from, to } = getPaginationBounds(currentPage, PAGE_SIZE);

    let depositHistoryQuery = supabase
      .from("deposits")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    let withdrawalHistoryQuery = supabase
      .from("withdrawals")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    let depositPendingQuery = supabase
      .from("deposits")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    let withdrawalPendingQuery = supabase
      .from("withdrawals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (startDate) {
      depositHistoryQuery = depositHistoryQuery.gte(
        "created_at",
        `${startDate}T00:00:00`,
      );
      withdrawalHistoryQuery = withdrawalHistoryQuery.gte(
        "created_at",
        `${startDate}T00:00:00`,
      );
      depositPendingQuery = depositPendingQuery.gte(
        "created_at",
        `${startDate}T00:00:00`,
      );
      withdrawalPendingQuery = withdrawalPendingQuery.gte(
        "created_at",
        `${startDate}T00:00:00`,
      );
    }
    if (endDate) {
      depositHistoryQuery = depositHistoryQuery.lte(
        "created_at",
        `${endDate}T23:59:59`,
      );
      withdrawalHistoryQuery = withdrawalHistoryQuery.lte(
        "created_at",
        `${endDate}T23:59:59`,
      );
      depositPendingQuery = depositPendingQuery.lte(
        "created_at",
        `${endDate}T23:59:59`,
      );
      withdrawalPendingQuery = withdrawalPendingQuery.lte(
        "created_at",
        `${endDate}T23:59:59`,
      );
    }
    if (matchedUserIds && matchedUserIds.length > 0) {
      depositHistoryQuery = depositHistoryQuery.in("user_id", matchedUserIds);
      withdrawalHistoryQuery = withdrawalHistoryQuery.in(
        "user_id",
        matchedUserIds,
      );
      depositPendingQuery = depositPendingQuery.in("user_id", matchedUserIds);
      withdrawalPendingQuery = withdrawalPendingQuery.in(
        "user_id",
        matchedUserIds,
      );
    }
    if (trimmedSearch && searchField === "memo") {
      depositHistoryQuery = depositHistoryQuery.ilike(
        "reject_reason",
        `%${trimmedSearch}%`,
      );
      withdrawalHistoryQuery = withdrawalHistoryQuery.ilike(
        "reject_reason",
        `%${trimmedSearch}%`,
      );
      depositPendingQuery = depositPendingQuery.ilike(
        "reject_reason",
        `%${trimmedSearch}%`,
      );
      withdrawalPendingQuery = withdrawalPendingQuery.ilike(
        "reject_reason",
        `%${trimmedSearch}%`,
      );
    }

    if (statusFilter === "completed") {
      depositHistoryQuery = depositHistoryQuery.eq("status", "approved");
      withdrawalHistoryQuery = withdrawalHistoryQuery.eq("status", "approved");
    } else if (statusFilter === "rejected") {
      depositHistoryQuery = depositHistoryQuery.eq("status", "rejected");
      withdrawalHistoryQuery = withdrawalHistoryQuery.eq("status", "rejected");
    } else if (statusFilter === "pending") {
      depositHistoryQuery = depositHistoryQuery.eq("status", "pending");
      withdrawalHistoryQuery = withdrawalHistoryQuery.eq("status", "pending");
    } else {
      depositHistoryQuery = depositHistoryQuery.neq("status", "pending");
      withdrawalHistoryQuery = withdrawalHistoryQuery.neq("status", "pending");
    }

    const includeDeposits = typeFilter === "all" || typeFilter === "deposit";
    const includeWithdrawals =
      typeFilter === "all" || typeFilter === "withdraw";

    const [
      depositHistoryRes,
      withdrawalHistoryRes,
      depositPendingRes,
      withdrawalPendingRes,
    ] = await Promise.all([
      includeDeposits && statusFilter !== "pending"
        ? depositHistoryQuery.range(0, historyPageSize - 1)
        : Promise.resolve({ data: [], count: 0 }),
      includeWithdrawals && statusFilter !== "pending"
        ? withdrawalHistoryQuery.range(0, historyPageSize - 1)
        : Promise.resolve({ data: [], count: 0 }),
      includeDeposits &&
      statusFilter !== "completed" &&
      statusFilter !== "rejected"
        ? depositPendingQuery
        : Promise.resolve({ data: [] }),
      includeWithdrawals &&
      statusFilter !== "completed" &&
      statusFilter !== "rejected"
        ? withdrawalPendingQuery
        : Promise.resolve({ data: [] }),
    ]);

    const depositHistoryRows =
      (depositHistoryRes.data as DepositHistoryRow[] | null) ?? [];
    const withdrawalHistoryRows =
      (withdrawalHistoryRes.data as WithdrawalHistoryRow[] | null) ?? [];
    const depositPendingRows =
      (depositPendingRes.data as DepositHistoryRow[] | null) ?? [];
    const withdrawalPendingRows =
      (withdrawalPendingRes.data as WithdrawalHistoryRow[] | null) ?? [];

    const allWithdrawalRows = [
      ...withdrawalHistoryRows,
      ...withdrawalPendingRows,
    ];

    const profileIds = [
      ...new Set(
        [
          ...depositHistoryRows.map((item) => item.user_id),
          ...allWithdrawalRows.map((item) => item.user_id),
          ...depositPendingRows.map((item) => item.user_id),
        ].filter(Boolean),
      ),
    ] as string[];

    const agentIds = [
      ...new Set(
        allWithdrawalRows
          .filter((item) => item.withdrawal_type === "agent" && item.agent_id)
          .map((item) => item.agent_id as string),
      ),
    ];

    const [profilesRes, agentsRes] = await Promise.all([
      profileIds.length > 0
        ? supabase
            .from("user_profiles")
            .select(
              "id, name, email, wallet_balance, bank_name, bank_account, bank_account_holder",
            )
            .in("id", profileIds)
        : Promise.resolve({ data: [] }),
      agentIds.length > 0
        ? supabase
            .from("agents")
            .select("id, name, username")
            .in("id", agentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profiles = (profilesRes.data as UserBalanceProfile[] | null) ?? [];
    const userById: Record<string, UserBalanceProfile> = {};
    profiles.forEach((user) => {
      userById[user.id] = user;
    });
    const { emailById, nameById } = createUserDisplayMaps(profiles);

    const agentById: Record<string, AgentDisplayInfo> = {};
    ((agentsRes.data as AgentDisplayInfo[] | null) ?? []).forEach((agent) => {
      agentById[agent.id] = agent;
    });

    const statusMap: Record<string, "완료" | "대기" | "거절"> = {
      approved: "완료",
      pending: "대기",
      rejected: "거절",
    };

    const mapDepositRow = (d: DepositHistoryRow): BalanceLog => {
      const userId = typeof d.user_id === "string" ? d.user_id : "";
      const user = userById[userId];
      const statusKey = typeof d.status === "string" ? d.status : "pending";
      return {
        id: d.id,
        date: formatDateTime(d.created_at),
        email: emailById[userId] || "-",
        name: nameById[userId] || "-",
        type: "입금",
        amount: Number(d.amount),
        balance: Number(user?.wallet_balance || 0),
        status: statusMap[statusKey] || "대기",
        approvedBy: statusKey === "approved" ? "admin" : "-",
        processedAt: formatDateTime(d.processed_at),
        memo: d.reject_reason || "",
        bankName: d.depositor_name || "-",
        bankAccount: user?.bank_account || "-",
        bankAccountHolder: user?.bank_account_holder || "-",
        _table: "deposits",
      };
    };

    const mapWithdrawalRow = (w: WithdrawalHistoryRow): BalanceLog => {
      const isAgent = w.withdrawal_type === "agent" && !!w.agent_id;
      const userId = typeof w.user_id === "string" ? w.user_id : "";
      const user = userById[userId];
      const agent = isAgent && w.agent_id ? agentById[w.agent_id] : null;
      const statusKey = typeof w.status === "string" ? w.status : "pending";

      const displayEmail = isAgent
        ? agent?.username || "파트너"
        : emailById[userId] || "-";
      const displayName = isAgent
        ? `[파트너] ${agent?.name || "-"}`
        : nameById[userId] || "-";

      return {
        id: w.id,
        date: formatDateTime(w.created_at),
        email: displayEmail,
        name: displayName,
        type: "출금",
        amount: Number(w.amount),
        balance: isAgent ? 0 : Number(user?.wallet_balance || 0),
        status: statusMap[statusKey] || "대기",
        approvedBy: statusKey === "approved" ? "admin" : "-",
        processedAt: formatDateTime(w.processed_at),
        memo: w.reject_reason || "",
        bankName: w.bank_name || "-",
        bankAccount: w.bank_account || "-",
        bankAccountHolder: w.bank_account_holder || "-",
        _table: "withdrawals",
        isAgent,
      };
    };

    const pendingLogs = [
      ...depositPendingRows.map(mapDepositRow),
      ...withdrawalPendingRows.map(mapWithdrawalRow),
    ].sort((a, b) => b.date.localeCompare(a.date));

    const mergedHistoryLogs = [
      ...depositHistoryRows.map(mapDepositRow),
      ...withdrawalHistoryRows.map(mapWithdrawalRow),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(from, to + 1);

    return {
      pendingLogs,
      historyLogs: mergedHistoryLogs,
      totalCount:
        Number(depositHistoryRes.count ?? 0) +
        Number(withdrawalHistoryRes.count ?? 0),
    };
  }, [
    currentPage,
    endDate,
    searchField,
    searchTerm,
    startDate,
    statusFilter,
    typeFilter,
  ]);

  const reloadBalanceLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      applyBalanceLogs(await fetchBalanceLogs());
    } catch {
      setLoadError("입출금 내역을 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [applyBalanceLogs, fetchBalanceLogs]);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    void reloadBalanceLogs();
  }, [isInitialized, reloadBalanceLogs, role]);

  const handleAction = async (
    action: "approve" | "reject",
    log: BalanceLog,
  ) => {
    try {
      await processAdminWalletRequest({
        kind: log._table === "deposits" ? "deposit" : "withdrawal",
        requestId: log.id,
        action,
        reason: action === "reject" ? "관리자 거절" : null,
      });
      addToast({
        title: `요청 ${action === "approve" ? "승인" : "거절"} 완료`,
        message: `${log.name}님의 ${log.type} 요청이 ${action === "approve" ? "승인" : "거절"}되었습니다.`,
        type: "success",
      });
      await reloadBalanceLogs();
    } catch (error) {
      addToast({
        title: "처리 실패",
        message: error instanceof Error ? error.message : "처리에 실패했습니다.",
        type: "error",
      });
    }
    setConfirmAction(null);
  };

  const historyBalanceLogs = balanceLogs;

  return (
    <div className="space-y-6">
      <AdminSearchFilterCard
        fields={[
          {
            key: "date",
            label: "날짜",
            control: (
              <AdminDateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={(value) => {
                  setCurrentPage(1);
                  setStartDate(value);
                }}
                onEndDateChange={(value) => {
                  setCurrentPage(1);
                  setEndDate(value);
                }}
              />
            ),
            className: "col-span-2",
          },
          {
            key: "type",
            label: "구분",
            control: (
              <AdminSelect
                className="w-full"
                value={typeFilter}
                onChange={(e) => {
                  setCurrentPage(1);
                  setTypeFilter(e.target.value);
                }}
              >
                <option value="all">전체</option>
                <option value="deposit">입금</option>
                <option value="withdraw">출금</option>
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
                onChange={(e) => {
                  setCurrentPage(1);
                  setStatusFilter(e.target.value);
                }}
              >
                <option value="all">전체</option>
                <option value="completed">완료</option>
                <option value="pending">대기</option>
                <option value="rejected">거절</option>
              </AdminSelect>
            ),
          },
          {
            key: "searchField",
            label: "검색구분",
            control: (
              <AdminSelect
                className="w-full"
                value={searchField}
                onChange={(e) => {
                  setCurrentPage(1);
                  setSearchField(e.target.value as "email" | "name" | "memo");
                }}
              >
                <option value="email">이메일</option>
                <option value="name">이름</option>
                <option value="memo">메모</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-5"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              className="min-w-0 flex-1"
              placeholder="검색어 입력"
              value={searchTerm}
              onChange={(e) => {
                setCurrentPage(1);
                setSearchTerm(e.target.value);
              }}
            />
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => void reloadBalanceLogs()}
            >
              <Search className="w-4 h-4" />
              조회
            </AdminButton>
          </div>
        }
      />

      {/* 대기 중인 신청건 */}
      {pendingBalanceLogs.length > 0 && (
        <AdminCard title={`입출금 신청 대기 (${pendingBalanceLogs.length}건)`}>
          <AdminTable
            headerCellClassName="text-center"
            headers={[
              "일시",
              "이메일",
              "이름",
              "구분",
              "금액",
              "은행정보",
              "관리",
            ]}
          >
            {pendingBalanceLogs.map((log) => (
              <AdminTableRow key={`pending-${log._table}-${log.id}`}>
                <AdminTableCell className="text-xs text-center whitespace-nowrap">
                  {log.date}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center">
                  {log.email}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-white">
                  {log.name}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <span
                    className={
                      log.type === "입금"
                        ? "text-green-500 text-xs"
                        : "text-red-500 text-xs"
                    }
                  >
                    {log.type}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-center font-medium text-xs tabular-nums">
                  {formatUsdt(log.type === "입금" ? log.amount : -log.amount, {
                    signed: log.type === "입금",
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-gray-300">
                  <div>{log.bankName}</div>
                  <div className="text-[10px] text-gray-500">
                    {log.bankAccount} / {log.bankAccountHolder}
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <AdminApprovalActionButtons
                    onApprove={() =>
                      setConfirmAction({ action: "approve", log })
                    }
                    onReject={() => setConfirmAction({ action: "reject", log })}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTable>
        </AdminCard>
      )}

      <AdminCard title={`입출금 내역 (${totalCount}건)`}>
        <AdminTable
          headerCellClassName="text-center"
          headers={[
            "일시",
            "이메일",
            "이름",
            "구분",
            "금액",
            "잔액",
            "은행정보",
            "상태",
            "승인자",
          ]}
        >
          {isLoading ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminLoadingSpinner message="입출금 내역을 불러오는 중..." />
              </AdminTableCell>
            </AdminTableRow>
          ) : loadError ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminErrorState
                  message={loadError}
                  onRetry={() => void reloadBalanceLogs()}
                />
              </AdminTableCell>
            </AdminTableRow>
          ) : historyBalanceLogs.length === 0 ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminEmptyState message="입출금 내역이 없습니다." />
              </AdminTableCell>
            </AdminTableRow>
          ) : (
            historyBalanceLogs.map((log) => (
              <AdminTableRow key={`history-${log._table}-${log.id}`}>
                <AdminTableCell className="text-xs text-center whitespace-nowrap">
                  {log.date}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center">
                  {log.email}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-white">
                  {log.name}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <span
                    className={
                      log.type === "입금" ? "text-green-500" : "text-red-500"
                    }
                  >
                    {log.type}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-center font-medium text-xs tabular-nums">
                  {formatUsdt(log.type === "입금" ? log.amount : -log.amount, {
                    signed: log.type === "입금",
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-center text-xs tabular-nums">
                  {formatUsdt(log.balance)}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-gray-300">
                  <div>{log.bankName}</div>
                  <div className="text-[10px] text-gray-500">
                    {log.bankAccount} / {log.bankAccountHolder}
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <span
                    className={`px-2 py-1 rounded text-xs ${log.status === "완료" ? "bg-green-500/20 text-green-500" : log.status === "대기" ? "bg-yellow-500/20 text-yellow-500" : "bg-red-500/20 text-red-500"}`}
                  >
                    {log.status}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-gray-400">
                  {log.approvedBy}
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTable>
        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          className="px-4 pb-4"
        />
      </AdminCard>

      {/* 승인/거절 확인 모달 */}
      <AdminModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.action === "approve" ? "입출금 승인" : "입출금 거절"
        }
      >
        {confirmAction && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-surface rounded-lg">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center text-white font-bold">
                {confirmAction.log.name[0]}
              </div>
              <div>
                <p className="text-white font-medium">
                  {confirmAction.log.name}
                </p>
                <p className="text-gray-400 text-sm">
                  {confirmAction.log.email}
                </p>
              </div>
            </div>
            <div className="bg-surface rounded-lg p-4 space-y-2 text-sm">
              {[
                ["구분", confirmAction.log.type],
                [
                  "금액",
                  `${confirmAction.log.type === "입금" ? "+" : "-"}${formatUsdt(confirmAction.log.amount)}`,
                ],
                ["은행", confirmAction.log.bankName],
                ["계좌번호", confirmAction.log.bankAccount],
                ["예금주", confirmAction.log.bankAccountHolder],
                ["신청일시", confirmAction.log.date],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-surface border border-gray-700 rounded-lg p-4">
              {confirmAction.action === "approve" ? (
                <>
                  <p className="text-white text-center mb-2">
                    이 {confirmAction.log.type} 요청을{" "}
                    <span className="text-green-500 font-bold">승인</span>
                    하시겠습니까?
                  </p>
                  <p className="text-gray-400 text-sm text-center">
                    승인 시 회원의 잔액이 변동됩니다.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white text-center mb-2">
                    이 {confirmAction.log.type} 요청을{" "}
                    <span className="text-red-500 font-bold">거절</span>
                    하시겠습니까?
                  </p>
                  <p className="text-gray-400 text-sm text-center">
                    거절 시 해당 요청은 취소됩니다.
                  </p>
                </>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <AdminButton
                variant="secondary"
                onClick={() => setConfirmAction(null)}
              >
                취소
              </AdminButton>
              <AdminButton
                variant={
                  confirmAction.action === "approve" ? "primary" : "danger"
                }
                onClick={() =>
                  handleAction(confirmAction.action, confirmAction.log)
                }
              >
                {confirmAction.action === "approve" ? "승인하기" : "거절하기"}
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>

      {/* 상세보기 모달 */}
      <AdminModal
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title="입출금 상세"
      >
        {detailTarget && (
          <div className="space-y-4">
            <div className="bg-surface rounded-lg p-4 space-y-3 text-sm">
              {[
                ["신청일시", detailTarget.date],
                ["이메일", detailTarget.email],
                ["이름", detailTarget.name],
                ["구분", detailTarget.type],
                [
                  "금액",
                  `${detailTarget.type === "입금" ? "+" : "-"}${formatUsdt(detailTarget.amount)}`,
                ],
                ["잔액", formatUsdt(detailTarget.balance)],
                ["은행", detailTarget.bankName],
                ["계좌번호", detailTarget.bankAccount],
                ["예금주", detailTarget.bankAccountHolder],
                ["상태", detailTarget.status],
                ["승인자", detailTarget.approvedBy],
                ["처리일시", detailTarget.processedAt],
                ["메모", detailTarget.memo],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white">{String(value)}</span>
                </div>
              ))}
            </div>
            {detailTarget.status === "대기" && (
              <div className="border-t border-gray-800 pt-4 flex justify-end">
                <AdminApprovalActionButtons
                  onApprove={() => {
                    setDetailTarget(null);
                    setConfirmAction({ action: "approve", log: detailTarget });
                  }}
                  onReject={() => {
                    setDetailTarget(null);
                    setConfirmAction({ action: "reject", log: detailTarget });
                  }}
                />
              </div>
            )}
          </div>
        )}
      </AdminModal>
    </div>
  );
}
