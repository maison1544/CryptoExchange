import React, { useState, useEffect, useCallback } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSummaryCard } from "@/components/admin/ui/AdminSummaryCard";
import { AdminModal } from "@/components/admin/ui/AdminModal";
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
import {
  AdminLoadingSpinner,
  AdminErrorState,
  AdminEmptyState,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils/formatDate";
import { toDisplayIp } from "@/lib/utils/ip";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";

const supabase = createClient();

interface PendingMember {
  id: string;
  email: string;
  name: string;
  phone: string;
  joinCode: string;
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
  appliedAt: string;
  joinIp: string;
  status: "pending" | "approved" | "rejected";
}

type PendingMemberProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  referral_code_used: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_holder: string | null;
  created_at: string;
  join_ip: string | null;
  status: string | null;
};

type ApprovalSearchField = "email" | "name" | "phone" | "joinCode" | "joinIp";

export function MemberApprovalTab() {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");
  const [searchField, setSearchField] = useState<ApprovalSearchField>("email");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState<{
    field: ApprovalSearchField;
    term: string;
  }>({ field: "email", term: "" });
  const [detailTarget, setDetailTarget] = useState<PendingMember | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingMember | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    action: "approve" | "reject";
    member: PendingMember;
  } | null>(null);

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await supabase.auth.getSession();
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .in("status", ["pending_approval", "active", "suspended", "banned"])
        .order("created_at", { ascending: false });
      if (data) {
        setMembers(
          (data as PendingMemberProfileRow[]).map((p) => ({
            id: p.id,
            email: p.email || "-",
            name: p.name || "-",
            phone: p.phone || "-",
            joinCode: p.referral_code_used || "-",
            bankName: p.bank_name || "-",
            bankAccount: p.bank_account || "-",
            bankAccountHolder: p.bank_account_holder || "-",
            appliedAt: formatDateTime(p.created_at),
            joinIp: p.join_ip || "-",
            status:
              p.status === "pending_approval"
                ? "pending"
                : p.status === "active"
                  ? "approved"
                  : "rejected",
          })),
        );
      }
    } catch {
      setLoadError("가입 신청 목록을 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    fetchMembers();
  }, [fetchMembers, isInitialized, role]);

  const filtered = members.filter((m) => {
    if (filter !== "all" && m.status !== filter) {
      return false;
    }

    const normalizedTerm = appliedSearch.term.trim().toLowerCase();
    if (!normalizedTerm) {
      return true;
    }

    const searchValues: Record<ApprovalSearchField, string> = {
      email: m.email.toLowerCase(),
      name: m.name.toLowerCase(),
      phone: String(m.phone || "").toLowerCase(),
      joinCode: String(m.joinCode || "").toLowerCase(),
      joinIp: toDisplayIp(m.joinIp).toLowerCase(),
    };

    return searchValues[appliedSearch.field].includes(normalizedTerm);
  });

  const pendingCount = members.filter((m) => m.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <AdminSummaryCard
          label="대기중"
          value={`${pendingCount}건`}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="승인"
          value={`${members.filter((m) => m.status === "approved").length}건`}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="거절"
          value={`${members.filter((m) => m.status === "rejected").length}건`}
          valueClassName="text-lg font-bold text-white"
        />
      </div>

      <AdminCard>
        <div className="p-4 space-y-3 bg-surface">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">상태</label>
              <AdminSelect
                className="w-full"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="pending">대기중</option>
                <option value="approved">승인</option>
                <option value="rejected">거절</option>
              </AdminSelect>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                검색구분
              </label>
              <AdminSelect
                className="w-full"
                value={searchField}
                onChange={(e) =>
                  setSearchField(e.target.value as ApprovalSearchField)
                }
              >
                <option value="email">이메일</option>
                <option value="name">이름</option>
                <option value="phone">전화번호</option>
                <option value="joinCode">가입코드</option>
                <option value="joinIp">가입IP</option>
              </AdminSelect>
            </div>
          </div>
          <div className="flex gap-2">
            <AdminInput
              className="flex-1 min-w-0"
              placeholder="검색어 입력"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <AdminButton
              className="whitespace-nowrap shrink-0"
              onClick={() =>
                setAppliedSearch({
                  field: searchField,
                  term: searchInput,
                })
              }
            >
              <Search className="w-4 h-4" />
              검색
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={`가입 신청 목록 (${filtered.length}건)`}>
        <AdminTable
          bodyClassName="[&_td]:text-center"
          headerCellClassName="text-center"
          headers={[
            "신청일시",
            "이메일",
            "이름",
            "전화번호",
            "가입코드",
            "가입IP",
            "은행정보",
            "상태",
            "관리",
          ]}
        >
          {isLoading ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminLoadingSpinner message="가입 신청 목록을 불러오는 중..." />
              </AdminTableCell>
            </AdminTableRow>
          ) : loadError ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminErrorState message={loadError} onRetry={fetchMembers} />
              </AdminTableCell>
            </AdminTableRow>
          ) : filtered.length === 0 ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminEmptyState message="해당 조건의 가입 신청이 없습니다." />
              </AdminTableCell>
            </AdminTableRow>
          ) : (
            filtered.map((m) => (
              <AdminTableRow key={m.id}>
                <AdminTableCell className="text-xs text-center text-gray-400 whitespace-nowrap">
                  {m.appliedAt}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-white">
                  {m.email}
                </AdminTableCell>
                <AdminTableCell
                  className="text-xs text-center text-yellow-500 font-medium cursor-pointer hover:underline"
                  onClick={() => setDetailTarget(m)}
                >
                  {m.name}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-gray-300">
                  {m.phone}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-gray-400">
                  {m.joinCode || "-"}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-gray-400">
                  {toDisplayIp(m.joinIp)}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-center text-gray-300">
                  <div>
                    {m.bankName} {m.bankAccount}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {m.bankAccountHolder}
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      m.status === "pending"
                        ? "bg-yellow-500/20 text-yellow-500"
                        : m.status === "approved"
                          ? "bg-green-500/20 text-green-500"
                          : "bg-red-500/20 text-red-500"
                    }`}
                  >
                    {m.status === "pending"
                      ? "대기중"
                      : m.status === "approved"
                        ? "승인"
                        : "거절"}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {m.status === "pending" && (
                    <AdminApprovalActionButtons
                      onApprove={() =>
                        setConfirmAction({ action: "approve", member: m })
                      }
                      onReject={() =>
                        setConfirmAction({ action: "reject", member: m })
                      }
                    />
                  )}
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTable>
      </AdminCard>

      {/* 상세보기 모달 */}
      <AdminModal
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title="가입 신청 상세"
      >
        {detailTarget && (
          <div className="space-y-4">
            <div className="bg-surface rounded-lg p-4 space-y-3 text-sm">
              {[
                ["이메일", detailTarget.email],
                ["이름", detailTarget.name],
                ["전화번호", detailTarget.phone],
                ["가입코드", detailTarget.joinCode || "-"],
                ["은행", detailTarget.bankName],
                ["계좌번호", detailTarget.bankAccount],
                ["예금주", detailTarget.bankAccountHolder],
                ["가입 IP", toDisplayIp(detailTarget.joinIp)],
                ["신청일시", detailTarget.appliedAt],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white">{value}</span>
                </div>
              ))}
            </div>
            {detailTarget.status === "pending" && (
              <div className="border-t border-gray-800 pt-4 flex justify-end">
                <AdminApprovalActionButtons
                  onApprove={() => {
                    setDetailTarget(null);
                    setConfirmAction({
                      action: "approve",
                      member: detailTarget,
                    });
                  }}
                  onReject={() => {
                    setDetailTarget(null);
                    setConfirmAction({
                      action: "reject",
                      member: detailTarget,
                    });
                  }}
                />
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* 승인/거절 확인 모달 */}
      <AdminModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.action === "approve"
            ? "회원 가입 승인"
            : "회원 가입 거절"
        }
      >
        {confirmAction && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-surface rounded-lg">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center text-white font-bold">
                {confirmAction.member.name[0]}
              </div>
              <div>
                <p className="text-white font-medium">
                  {confirmAction.member.name}
                </p>
                <p className="text-gray-400 text-sm">
                  {confirmAction.member.email}
                </p>
              </div>
            </div>
            <div className="bg-surface border border-gray-700 rounded-lg p-4">
              {confirmAction.action === "approve" ? (
                <>
                  <p className="text-white text-center mb-2">
                    이 회원의 가입을{" "}
                    <span className="text-green-500 font-bold">승인</span>
                    하시겠습니까?
                  </p>
                  <p className="text-gray-400 text-sm text-center">
                    승인 시 회원은 모든 서비스를 이용할 수 있습니다.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white text-center mb-2">
                    이 회원의 가입을{" "}
                    <span className="text-red-500 font-bold">거절</span>
                    하시겠습니까?
                  </p>
                  <p className="text-gray-400 text-sm text-center">
                    거절된 회원은 서비스를 이용할 수 없습니다.
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
                onClick={async () => {
                  const newStatus =
                    confirmAction.action === "approve" ? "active" : "suspended";
                  await supabase.auth.getSession();
                  await supabase
                    .from("user_profiles")
                    .update({ status: newStatus })
                    .eq("id", confirmAction.member.id);
                  setConfirmAction(null);
                  fetchMembers();
                }}
              >
                {confirmAction.action === "approve" ? "승인하기" : "거절하기"}
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>

      {/* 거절 사유 모달 */}
      <AdminModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="가입 거절"
      >
        {rejectTarget && (
          <div className="space-y-4">
            <div className="bg-surface rounded-lg p-4 text-sm">
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">이름</span>
                <span className="text-white">{rejectTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">이메일</span>
                <span className="text-white">{rejectTarget.email}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1">
                거절 사유
              </label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors resize-none"
                placeholder="거절 사유를 입력하세요"
              />
            </div>
            <div className="border-t border-gray-800 pt-4 flex justify-end gap-2">
              <AdminButton
                variant="secondary"
                onClick={() => setRejectTarget(null)}
              >
                취소
              </AdminButton>
              <AdminButton
                variant="danger"
                onClick={() => {
                  addToast({
                    title: "가입 거절 완료",
                    message: `${rejectTarget.name}님의 가입이 거절되었습니다.`,
                    type: "success",
                  });
                  setRejectTarget(null);
                }}
              >
                거절 확인
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
