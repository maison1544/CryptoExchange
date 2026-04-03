import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
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
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminLoadingSpinner,
  AdminErrorState,
  AdminEmptyState,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import { adminPointTypeConfig } from "@/lib/types/entities";
import { formatDateTime } from "@/lib/utils/formatDate";
import { toDisplayIp } from "@/lib/utils/ip";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

// TODO: DB 활동 로그 테이블 생성 시 연동 예정
const supabase = createClient();
const PAGE_SIZE = 20;

type LoginLogRow = {
  id?: number | string;
  user_id?: string | null;
  login_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  success?: boolean | null;
};

type DepositLogRow = {
  id: number;
  user_id: string | null;
  created_at: string;
  amount: number | string | null;
  status: string | null;
  processed_at?: string | null;
  reject_reason?: string | null;
  depositor_name?: string | null;
};

type WithdrawalLogRow = {
  id: number;
  user_id: string | null;
  created_at: string;
  amount: number | string | null;
  status: string | null;
  processed_at?: string | null;
  reject_reason?: string | null;
  bank?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
};

type TradeLogRow = {
  id: number;
  user_id: string | null;
  symbol?: string | null;
  direction?: string | null;
  size?: number | string | null;
  fee?: number | string | null;
  status?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  pnl?: number | string | null;
};

type StakingLogRow = {
  id: number;
  user_id: string | null;
  amount?: number | string | null;
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  ends_at?: string | null;
};

type MemberActivityRow = {
  id: string;
  rawDate: string;
  date: string;
  email: string;
  name: string;
  ip: string;
  actionKey: "login" | "deposit" | "withdrawal" | "trade" | "staking" | "asset";
  action: string;
  detail: string;
  searchText: string;
};

function getDateOnly(value: string) {
  return value.slice(0, 10);
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "대기";
    case "approved":
      return "승인";
    case "rejected":
      return "거절";
    case "open":
      return "오픈";
    case "closed":
      return "종료";
    case "liquidated":
      return "청산";
    case "active":
      return "진행중";
    case "completed":
      return "정산";
    case "cancelled":
      return "취소";
    default:
      return status || "-";
  }
}

export function MemberLogsTab() {
  const { isInitialized, role } = useAuth();
  const [logs, setLogs] = useState<MemberActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchField, setSearchField] = useState("email");
  const [searchTerm, setSearchTerm] = useState("");

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await supabase.auth.getSession();
      const [
        { data: loginLogs },
        { data: deposits },
        { data: withdrawals },
        { data: positions },
        { data: stakings },
      ] = await Promise.all([
        supabase
          .from("login_logs")
          .select("*")
          .order("login_at", { ascending: false }),
        supabase
          .from("deposits")
          .select(
            "id, user_id, created_at, amount, status, processed_at, reject_reason, depositor_name",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("withdrawals")
          .select(
            "id, user_id, created_at, amount, status, processed_at, reject_reason, bank, account_number, account_holder",
          )
          .eq("withdrawal_type", "user")
          .order("created_at", { ascending: false }),
        supabase
          .from("futures_positions")
          .select(
            "id, user_id, symbol, direction, size, fee, status, opened_at, closed_at, pnl",
          )
          .order("opened_at", { ascending: false }),
        supabase
          .from("staking_positions")
          .select(
            "id, user_id, amount, status, started_at, completed_at, ends_at",
          )
          .order("started_at", { ascending: false }),
      ]);

      const userIds = Array.from(
        new Set(
          [
            ...((loginLogs as LoginLogRow[] | null) ?? []).map(
              (item) => item.user_id,
            ),
            ...((deposits as DepositLogRow[] | null) ?? []).map(
              (item) => item.user_id,
            ),
            ...((withdrawals as WithdrawalLogRow[] | null) ?? []).map(
              (item) => item.user_id,
            ),
            ...((positions as TradeLogRow[] | null) ?? []).map(
              (item) => item.user_id,
            ),
            ...((stakings as StakingLogRow[] | null) ?? []).map(
              (item) => item.user_id,
            ),
          ].filter(Boolean),
        ),
      ) as string[];

      const { data: users } =
        userIds.length > 0
          ? await supabase
              .from("user_profiles")
              .select("id, email, name")
              .in("id", userIds)
          : { data: [] };

      const { emailById, nameById } = createUserDisplayMaps(
        (users as UserDisplayProfile[] | null) ?? [],
      );

      const loginActivityRows: MemberActivityRow[] = (
        (loginLogs as LoginLogRow[] | null) ?? []
      ).map((item, index) => {
        const userId = item.user_id || "";
        const success = item.success !== false;
        const rawDate = item.login_at || "";
        const detail = success
          ? `로그인 성공 / ${item.user_agent || "-"}`
          : `로그인 실패 / ${item.user_agent || "-"}`;
        return {
          id: `login-${item.id ?? `${userId}-${index}`}`,
          rawDate,
          date: formatDateTime(rawDate),
          email: emailById[userId] || "-",
          name: nameById[userId] || "-",
          ip: toDisplayIp(item.ip_address),
          actionKey: "login",
          action: success ? "로그인" : "로그인 실패",
          detail,
          searchText: [
            emailById[userId] || "",
            nameById[userId] || "",
            toDisplayIp(item.ip_address),
            detail,
            success ? "로그인" : "로그인 실패",
          ]
            .join(" ")
            .toLowerCase(),
        };
      });

      const depositActivityRows: MemberActivityRow[] = (
        (deposits as DepositLogRow[] | null) ?? []
      ).map((item) => {
        const userId = item.user_id || "";
        const action =
          item.status === "approved"
            ? "입금 승인"
            : item.status === "rejected"
              ? "입금 거절"
              : "입금 신청";
        const detail = `입금자 ${item.depositor_name || "-"} / ${formatUsdt(item.amount || 0)} / 상태 ${statusLabel(item.status)}${item.reject_reason ? ` / 사유 ${item.reject_reason}` : ""}`;
        return {
          id: `deposit-${item.id}`,
          rawDate: item.created_at,
          date: formatDateTime(item.created_at),
          email: emailById[userId] || "-",
          name: nameById[userId] || "-",
          ip: "-",
          actionKey: "deposit",
          action,
          detail,
          searchText: [
            emailById[userId] || "",
            nameById[userId] || "",
            detail,
            action,
          ]
            .join(" ")
            .toLowerCase(),
        };
      });

      const withdrawalActivityRows: MemberActivityRow[] = (
        (withdrawals as WithdrawalLogRow[] | null) ?? []
      ).map((item) => {
        const userId = item.user_id || "";
        const action =
          item.status === "approved"
            ? "출금 승인"
            : item.status === "rejected"
              ? "출금 거절"
              : "출금 신청";
        const detail = `${item.bank || "-"} / ${item.account_number || "-"} / ${item.account_holder || "-"} / ${formatUsdt(item.amount || 0)} / 상태 ${statusLabel(item.status)}${item.reject_reason ? ` / 사유 ${item.reject_reason}` : ""}`;
        return {
          id: `withdrawal-${item.id}`,
          rawDate: item.created_at,
          date: formatDateTime(item.created_at),
          email: emailById[userId] || "-",
          name: nameById[userId] || "-",
          ip: "-",
          actionKey: "withdrawal",
          action,
          detail,
          searchText: [
            emailById[userId] || "",
            nameById[userId] || "",
            detail,
            action,
          ]
            .join(" ")
            .toLowerCase(),
        };
      });

      const tradeActivityRows: MemberActivityRow[] = (
        (positions as TradeLogRow[] | null) ?? []
      ).map((item) => {
        const userId = item.user_id || "";
        const action =
          item.status === "open"
            ? "포지션 오픈"
            : item.status === "liquidated"
              ? "포지션 청산"
              : "포지션 종료";
        const rawDate = item.closed_at || item.opened_at || "";
        const detail = `${item.symbol || "-"} / ${item.direction || "-"} / 수량 ${formatDisplayNumber(item.size || 0, { maximumFractionDigits: 4 })} / 상태 ${statusLabel(item.status)} / 손익 ${formatUsdt(item.pnl || 0, { signed: true })}`;
        return {
          id: `trade-${item.id}`,
          rawDate,
          date: formatDateTime(rawDate),
          email: emailById[userId] || "-",
          name: nameById[userId] || "-",
          ip: "-",
          actionKey: "trade",
          action,
          detail,
          searchText: [
            emailById[userId] || "",
            nameById[userId] || "",
            detail,
            action,
          ]
            .join(" ")
            .toLowerCase(),
        };
      });

      const assetDepositRows: MemberActivityRow[] = (
        (deposits as DepositLogRow[] | null) ?? []
      )
        .filter((item) => item.status === "approved")
        .map((item) => {
          const userId = item.user_id || "";
          const amount = Number(item.amount || 0);
          const assetLabel = adminPointTypeConfig.admin_add.label;
          const rawDate = item.created_at;
          const detail = `${assetLabel} / ${formatUsdt(amount, { signed: true })} / 입금 승인 (${item.depositor_name || "-"})`;
          return {
            id: `asset-deposit-${item.id}`,
            rawDate,
            date: formatDateTime(rawDate),
            email: emailById[userId] || "-",
            name: nameById[userId] || "-",
            ip: "-",
            actionKey: "asset",
            action: "자산 변동",
            detail,
            searchText: [
              emailById[userId] || "",
              nameById[userId] || "",
              detail,
              assetLabel,
              "자산 변동",
            ]
              .join(" ")
              .toLowerCase(),
          };
        });

      const assetWithdrawalRows: MemberActivityRow[] = (
        (withdrawals as WithdrawalLogRow[] | null) ?? []
      )
        .filter((item) => item.status === "approved")
        .map((item) => {
          const userId = item.user_id || "";
          const amount = -Number(item.amount || 0);
          const assetLabel = adminPointTypeConfig.admin_deduct.label;
          const rawDate = item.created_at;
          const detail = `${assetLabel} / ${formatUsdt(amount, { signed: true })} / 출금 완료 (${item.bank || "-"} / ${item.account_number || "-"})`;
          return {
            id: `asset-withdrawal-${item.id}`,
            rawDate,
            date: formatDateTime(rawDate),
            email: emailById[userId] || "-",
            name: nameById[userId] || "-",
            ip: "-",
            actionKey: "asset",
            action: "자산 변동",
            detail,
            searchText: [
              emailById[userId] || "",
              nameById[userId] || "",
              detail,
              assetLabel,
              "자산 변동",
            ]
              .join(" ")
              .toLowerCase(),
          };
        });

      const assetTradeRows: MemberActivityRow[] = (
        (positions as TradeLogRow[] | null) ?? []
      )
        .filter(
          (item) => item.status === "closed" || item.status === "liquidated",
        )
        .map((item) => {
          const userId = item.user_id || "";
          const pnl = Number(item.pnl || 0);
          const fee = Number(item.fee || 0);
          const netAmount = pnl - fee;
          const assetLabel =
            netAmount >= 0
              ? adminPointTypeConfig.earn.label
              : adminPointTypeConfig.spend.label;
          const rawDate = item.closed_at || item.opened_at || "";
          const detail = `${assetLabel} / ${formatUsdt(netAmount, { signed: true })} / ${item.symbol || "-"} ${item.direction || "-"} 정산 / 손익 ${formatUsdt(pnl, { signed: true })} / 수수료 ${formatUsdt(fee)}`;
          return {
            id: `asset-trade-${item.id}`,
            rawDate,
            date: formatDateTime(rawDate),
            email: emailById[userId] || "-",
            name: nameById[userId] || "-",
            ip: "-",
            actionKey: "asset",
            action: "자산 변동",
            detail,
            searchText: [
              emailById[userId] || "",
              nameById[userId] || "",
              detail,
              assetLabel,
              "자산 변동",
            ]
              .join(" ")
              .toLowerCase(),
          };
        });

      const assetActivityRows: MemberActivityRow[] = [
        ...assetDepositRows,
        ...assetWithdrawalRows,
        ...assetTradeRows,
      ];

      const stakingActivityRows: MemberActivityRow[] = (
        (stakings as StakingLogRow[] | null) ?? []
      ).map((item) => {
        const userId = item.user_id || "";
        const action =
          item.status === "completed"
            ? "스테이킹 정산"
            : item.status === "cancelled"
              ? "스테이킹 취소"
              : "스테이킹 시작";
        const rawDate = item.completed_at || item.started_at || "";
        const detail = `${formatUsdt(item.amount || 0)} / 상태 ${statusLabel(item.status)} / 만료 ${formatDateTime(item.ends_at)}`;
        return {
          id: `staking-${item.id}`,
          rawDate,
          date: formatDateTime(rawDate),
          email: emailById[userId] || "-",
          name: nameById[userId] || "-",
          ip: "-",
          actionKey: "staking",
          action,
          detail,
          searchText: [
            emailById[userId] || "",
            nameById[userId] || "",
            detail,
            action,
          ]
            .join(" ")
            .toLowerCase(),
        };
      });

      setLogs(
        [
          ...loginActivityRows,
          ...depositActivityRows,
          ...withdrawalActivityRows,
          ...tradeActivityRows,
          ...assetActivityRows,
          ...stakingActivityRows,
        ]
          .filter((item) => Boolean(item.rawDate))
          .sort((a, b) => b.rawDate.localeCompare(a.rawDate)),
      );
    } catch {
      setLoadError("활동 로그를 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    void loadLogs();
  }, [isInitialized, loadLogs, role]);

  const filteredLogs = useMemo(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== "all" && log.actionKey !== actionFilter) {
        return false;
      }
      const dateOnly = getDateOnly(log.rawDate);
      if (startDate && dateOnly < startDate) {
        return false;
      }
      if (endDate && dateOnly > endDate) {
        return false;
      }
      if (!trimmedSearch) {
        return true;
      }
      if (searchField === "email") {
        return log.email.toLowerCase().includes(trimmedSearch);
      }
      if (searchField === "name") {
        return log.name.toLowerCase().includes(trimmedSearch);
      }
      if (searchField === "ip") {
        return log.ip.toLowerCase().includes(trimmedSearch);
      }
      return log.searchText.includes(trimmedSearch);
    });
  }, [actionFilter, endDate, logs, searchField, searchTerm, startDate]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));

  const pagedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, endDate, searchField, searchTerm, startDate]);

  return (
    <div className="space-y-6">
      <AdminSearchFilterCard
        fields={[
          {
            key: "date",
            label: "날짜",
            className: "col-span-2",
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
            key: "action",
            label: "액션",
            control: (
              <AdminSelect
                className="w-full"
                value={actionFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setActionFilter(e.target.value)
                }
              >
                <option value="all">전체</option>
                <option value="login">로그인</option>
                <option value="deposit">입출금-입금</option>
                <option value="withdrawal">입출금-출금</option>
                <option value="trade">거래</option>
                <option value="asset">자산 변동</option>
                <option value="staking">스테이킹</option>
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
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSearchField(e.target.value)
                }
              >
                <option value="email">이메일</option>
                <option value="name">이름</option>
                <option value="ip">IP</option>
                <option value="detail">상세</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-4"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              className="min-w-0 flex-1"
              placeholder="검색어 입력"
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchTerm(e.target.value)
              }
            />
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => setCurrentPage(1)}
            >
              <Search className="w-4 h-4" />
              검색
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`로그내역 (${filteredLogs.length}건)`}>
        <AdminTable
          headerCellClassName="text-center"
          headers={["번호", "일시", "아이디", "IP", "액션", "상세"]}
        >
          {isLoading ? (
            <AdminTableRow>
              <AdminTableCell colSpan={6}>
                <AdminLoadingSpinner message="활동 로그를 불러오는 중..." />
              </AdminTableCell>
            </AdminTableRow>
          ) : loadError ? (
            <AdminTableRow>
              <AdminTableCell colSpan={6}>
                <AdminErrorState
                  message={loadError}
                  onRetry={() => void loadLogs()}
                />
              </AdminTableCell>
            </AdminTableRow>
          ) : pagedLogs.length === 0 ? (
            <AdminTableRow>
              <AdminTableCell colSpan={6}>
                <AdminEmptyState message="활동 로그가 없습니다." />
              </AdminTableCell>
            </AdminTableRow>
          ) : (
            pagedLogs.map((log, index) => (
              <AdminTableRow key={log.id}>
                <AdminTableCell className="text-center">
                  {filteredLogs.length -
                    ((currentPage - 1) * PAGE_SIZE + index)}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {log.date}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <div className="flex flex-col gap-1">
                    <div className="truncate font-medium text-gray-200">
                      {log.email}
                    </div>
                    <div className="truncate text-[11px] text-gray-400">
                      {log.name}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {log.ip}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">
                    {log.action}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-center text-gray-400 whitespace-normal wrap-break-word max-w-100">
                  {log.detail}
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTable>
        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={filteredLogs.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          className="px-4 pb-4"
        />
      </AdminCard>
    </div>
  );
}
