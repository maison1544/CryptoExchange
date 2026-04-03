import React, { useState, useEffect, useCallback } from "react";
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
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { AdminApprovalActionButtons } from "@/components/admin/ui/AdminApprovalActionButtons";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { processWithdrawal } from "@/lib/api/admin";
import {
  getPaginationBounds,
  normalizeTotalPages,
} from "@/lib/utils/pagination";
import { formatDateTime } from "@/lib/utils/formatDate";
import { formatUsdt } from "@/lib/utils/numberFormat";

const supabase = createClient();
const PAGE_SIZE = 10;

type WithdrawRow = {
  id: number;
  date: string;
  partnerName: string;
  agentId: string;
  amount: number;
  bank: string;
  accountNumber: string;
  accountHolder: string;
  status: string;
  rejectReason: string | null;
};

type AgentLookupRow = {
  id: string;
  name: string | null;
};

type WithdrawalQueryRow = {
  id: number;
  agent_id: string | null;
  amount: number | string | null;
  bank: string | null;
  account_number: string | null;
  account_holder: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
};

export function PartnerWithdrawTab() {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const [rows, setRows] = useState<WithdrawRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rejectModal, setRejectModal] = useState<{ id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const totalPages = normalizeTotalPages(totalCount, PAGE_SIZE);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      await supabase.auth.getSession();
      const trimmedSearch = search.trim();
      let query = supabase
        .from("withdrawals")
        .select(
          "id, agent_id, amount, bank, account_number, account_holder, status, reject_reason, created_at",
          { count: "exact" },
        )
        .eq("withdrawal_type", "agent")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (startDate) {
        query = query.gte("created_at", `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte("created_at", `${endDate}T23:59:59`);
      }
      if (trimmedSearch) {
        const { data: matchedAgents, error: matchedAgentsError } =
          await supabase
            .from("agents")
            .select("id")
            .ilike("name", `%${trimmedSearch}%`);

        if (matchedAgentsError) {
          throw matchedAgentsError;
        }

        const agentIds = (
          (matchedAgents as Pick<AgentLookupRow, "id">[] | null) ?? []
        )
          .map((agent) => agent.id)
          .filter(Boolean);

        if (agentIds.length > 0) {
          query = query.or(
            `account_number.ilike.%${trimmedSearch}%,agent_id.in.(${agentIds.join(",")})`,
          );
        } else {
          query = query.ilike("account_number", `%${trimmedSearch}%`);
        }
      }

      const { from, to } = getPaginationBounds(currentPage, PAGE_SIZE);
      const { data, count, error } = await query.range(from, to);

      if (error) {
        throw error;
      }

      if (!data) {
        setRows([]);
        setTotalCount(count ?? 0);
        return;
      }

      const typedData = (data as WithdrawalQueryRow[] | null) ?? [];
      const agentIds = [
        ...new Set(typedData.map((item) => item.agent_id).filter(Boolean)),
      ];
      const { data: agents, error: agentsError } =
        agentIds.length > 0
          ? await supabase.from("agents").select("id, name").in("id", agentIds)
          : { data: [], error: null };

      if (agentsError) {
        throw agentsError;
      }

      const agMap: Record<string, string> = {};
      ((agents as AgentLookupRow[] | null) || []).forEach((a) => {
        agMap[a.id] = a.name || "-";
      });

      setRows(
        typedData.map((w) => {
          const agentId = w.agent_id || "-";

          return {
            id: w.id,
            date: formatDateTime(w.created_at),
            partnerName: agMap[agentId] || agentId,
            agentId,
            amount: Number(w.amount),
            bank: w.bank || "-",
            accountNumber: w.account_number || "-",
            accountHolder: w.account_holder || "-",
            status: w.status,
            rejectReason: w.reject_reason,
          };
        }),
      );
      setTotalCount(count ?? 0);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "파트너 출금 신청 내역을 불러오지 못했습니다.";
      setLoadError(message);
      setRows([]);
      setTotalCount(0);
      addToast({
        title: "파트너 출금 신청 로드 실패",
        message,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast, currentPage, endDate, search, startDate, statusFilter]);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    void load();
  }, [isInitialized, load, role]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [endDate, search, startDate, statusFilter]);

  const approve = async (id: number) => {
    setProcessingId(id);
    const { data, error } = await processWithdrawal(id, "approve");
    setProcessingId(null);
    if (error || data?.success === false) {
      addToast({
        title: "출금 승인 실패",
        message:
          error?.message || data?.error || "출금 승인 처리에 실패했습니다.",
        type: "error",
      });
      return;
    }
    addToast({
      title: "출금 승인 완료",
      message: data?.message || "파트너 출금이 승인되었습니다.",
      type: "success",
    });
    await load();
  };

  const reject = async (id: number, reason: string) => {
    setProcessingId(id);
    const { data, error } = await processWithdrawal(id, "reject", reason);
    setProcessingId(null);
    if (error || data?.success === false) {
      addToast({
        title: "출금 거절 실패",
        message:
          error?.message || data?.error || "출금 거절 처리에 실패했습니다.",
        type: "error",
      });
      return;
    }
    setRejectModal(null);
    setRejectReason("");
    addToast({
      title: "출금 거절 완료",
      message: data?.message || "파트너 출금이 거절되었습니다.",
      type: "success",
    });
    await load();
  };

  const statusLabel = (s: string) =>
    ({ pending: "대기중", approved: "완료", rejected: "거절" })[s] ?? s;
  const statusCls = (s: string) =>
    ({
      pending: "bg-yellow-500/20 text-yellow-500",
      approved: "bg-green-500/20 text-green-500",
      rejected: "bg-red-500/20 text-red-400",
    })[s] ?? "";

  return (
    <div className="space-y-6">
      <AdminSearchFilterCard
        fields={[
          {
            key: "date",
            label: "날짜",
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
            key: "status",
            label: "상태",
            control: (
              <AdminSelect
                value={statusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setStatusFilter(e.target.value)
                }
                className="w-full"
              >
                <option value="all">전체</option>
                <option value="pending">대기중</option>
                <option value="approved">완료</option>
                <option value="rejected">거절</option>
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
              placeholder="파트너명 또는 계좌번호 검색"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearch(e.target.value)
              }
            />
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                setCurrentPage(1);
                void load();
              }}
            >
              <Search className="w-4 h-4" /> 조회
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`파트너 출금 신청 (${totalCount}건)`}>
        {isLoading ? (
          <AdminLoadingSpinner message="파트너 출금 신청 내역을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState message={loadError} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <AdminEmptyState message="출금 신청 내역이 없습니다." />
        ) : (
          <>
            <AdminTable
              headers={[
                "신청일시",
                "파트너명",
                "출금액(USDT)",
                "은행",
                "계좌번호",
                "예금주",
                "상태",
                "관리",
              ]}
            >
              {rows.map((item) => (
                <AdminTableRow key={item.id}>
                  <AdminTableCell className="whitespace-nowrap text-xs text-gray-400">
                    {item.date}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-white font-medium">
                    {item.partnerName}
                  </AdminTableCell>
                  <AdminTableCell className="text-center text-xs font-bold text-white whitespace-nowrap">
                    {formatUsdt(item.amount)}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {item.bank}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300 font-mono">
                    {item.accountNumber}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-gray-300">
                    {item.accountHolder}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusCls(item.status)}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                    {item.rejectReason && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {item.rejectReason}
                      </p>
                    )}
                  </AdminTableCell>
                  <AdminTableCell>
                    {item.status === "pending" ? (
                      <AdminApprovalActionButtons
                        onApprove={() => void approve(item.id)}
                        onReject={() => {
                          setRejectModal({ id: item.id });
                          setRejectReason("");
                        }}
                        disabled={processingId === item.id}
                      />
                    ) : (
                      <span className="text-xs text-gray-500">-</span>
                    )}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
            <AdminPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              className="px-4 pb-4"
            />
          </>
        )}
      </AdminCard>

      <AdminModal
        isOpen={!!rejectModal}
        onClose={() => setRejectModal(null)}
        title="출금 거절 사유"
      >
        {rejectModal && (
          <div className="space-y-4">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="거절 사유를 입력하세요"
              className="w-full h-24 bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-2 justify-end">
              <AdminButton
                variant="secondary"
                onClick={() => setRejectModal(null)}
              >
                취소
              </AdminButton>
              <AdminButton
                variant="danger"
                onClick={() => void reject(rejectModal.id, rejectReason)}
                disabled={
                  processingId === rejectModal.id || !rejectReason.trim()
                }
              >
                {processingId === rejectModal.id ? "처리 중..." : "거절 확인"}
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
