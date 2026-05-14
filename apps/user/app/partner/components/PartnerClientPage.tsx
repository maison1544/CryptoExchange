"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowUpFromLine, Search } from "lucide-react";
import {
  MemberDetailModal,
  prefetchMemberDetail,
} from "@/components/admin/ui/MemberDetailModal";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
} from "@/components/admin/ui/AdminForms";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import { AdminSummaryCard } from "@/components/admin/ui/AdminSummaryCard";
import {
  AdminTable,
  AdminTableCell,
  AdminTableRow,
} from "@/components/admin/ui/AdminTable";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useInterval } from "@/hooks/useInterval";
import { createClient } from "@/lib/supabase/client";
import {
  fetchPartnerCommissions,
  fetchPartnerMembers,
  fetchPartnerSummary,
  fetchPartnerWithdrawals,
  requestPartnerWithdrawal,
  type PartnerCommissionRow,
  type PartnerMemberRow,
  type PartnerSummary,
  type PartnerWithdrawalRow,
} from "@/lib/api/partner";
import { getCommissionFilterLabel } from "@/lib/utils/commission";
import { formatUsdt } from "@/lib/utils/numberFormat";
import { normalizeTotalPages } from "@/lib/utils/pagination";

const supabase = createClient();
const PAGE_SIZE = 10;
const POLLING_INTERVAL = 30_000;
const TABS = [
  { id: "dashboard", label: "대시보드" },
  { id: "members", label: "귀속 회원" },
  { id: "commissions", label: "커미션 내역" },
  { id: "withdraw", label: "출금" },
] as const;
const COMMISSION_TYPE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "loss", label: getCommissionFilterLabel("loss") },
  { value: "rolling", label: getCommissionFilterLabel("rolling") },
  { value: "trade_fee", label: getCommissionFilterLabel("trade_fee") },
  { value: "staking", label: getCommissionFilterLabel("staking") },
  { value: "deposit", label: getCommissionFilterLabel("deposit") },
] as const;
const WITHDRAWAL_STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "pending", label: "처리중" },
  { value: "approved", label: "완료" },
  { value: "rejected", label: "거절" },
] as const;

const EMPTY_BREAKDOWN = {
  trade_fee: 0,
  rolling: 0,
  loss: 0,
  staking: 0,
  deposit: 0,
} as const;

const EMPTY_SUMMARY: PartnerSummary = {
  id: "",
  name: "",
  grade: "총판",
  referralCode: "-",
  availableCommissionBalance: 0,
  totalCommissionEarned: 0,
  lossCommission: 0,
  rollingCommission: 0,
  feeCommission: 0,
  memberCount: 0,
  pendingWithdrawalAmount: 0,
  pendingWithdrawalCount: 0,
  bankName: "",
  bankAccount: "",
  bankAccountHolder: "",
  commissionBreakdown: { ...EMPTY_BREAKDOWN },
  monthCommissionBreakdown: { ...EMPTY_BREAKDOWN },
};

function commissionToneClass(typeLabel: string) {
  switch (typeLabel) {
    case "죽장":
      return "border border-red-500/20 bg-red-500/10 text-red-300";
    case "롤링":
      return "border border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
    case "수수료":
      return "border border-sky-500/20 bg-sky-500/10 text-sky-300";
    case "스테이킹":
      return "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "입금":
      return "border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300";
    default:
      return "border border-white/10 bg-white/5 text-gray-200";
  }
}

function withdrawalStatusClass(status: string) {
  switch (status) {
    case "완료":
      return "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "거절":
      return "border border-red-500/20 bg-red-500/10 text-red-300";
    default:
      return "border border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PartnerClientPage() {
  const router = useRouter();
  const { user, role, isInitialized } = useAuth();
  const { addToast } = useNotification();
  const accessToastShownRef = useRef(false);
  const [activeTab, setActiveTab] =
    useState<(typeof TABS)[number]["id"]>("dashboard");
  const [summary, setSummary] = useState<PartnerSummary>(EMPTY_SUMMARY);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<PartnerMemberRow | null>(
    null,
  );

  const [memberRows, setMemberRows] = useState<PartnerMemberRow[]>([]);
  const [memberTotalCount, setMemberTotalCount] = useState(0);
  const [memberPage, setMemberPage] = useState(1);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const [commissionRows, setCommissionRows] = useState<PartnerCommissionRow[]>(
    [],
  );
  const [commissionTotalCount, setCommissionTotalCount] = useState(0);
  const [commissionPage, setCommissionPage] = useState(1);
  const [commissionSearch, setCommissionSearch] = useState("");
  const [commissionType, setCommissionType] = useState("all");
  const [commissionStartDate, setCommissionStartDate] = useState("");
  const [commissionEndDate, setCommissionEndDate] = useState("");
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionError, setCommissionError] = useState<string | null>(null);

  const [withdrawRows, setWithdrawRows] = useState<PartnerWithdrawalRow[]>([]);
  const [withdrawTotalCount, setWithdrawTotalCount] = useState(0);
  const [withdrawPage, setWithdrawPage] = useState(1);
  const [withdrawSearch, setWithdrawSearch] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("all");
  const [withdrawStartDate, setWithdrawStartDate] = useState("");
  const [withdrawEndDate, setWithdrawEndDate] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

  const debouncedMemberSearch = useDebouncedValue(memberSearch, 250);
  const debouncedCommissionSearch = useDebouncedValue(commissionSearch, 250);
  const debouncedWithdrawSearch = useDebouncedValue(withdrawSearch, 250);

  const memberTotalPages = normalizeTotalPages(memberTotalCount, PAGE_SIZE);
  const commissionTotalPages = normalizeTotalPages(
    commissionTotalCount,
    PAGE_SIZE,
  );
  const withdrawTotalPages = normalizeTotalPages(withdrawTotalCount, PAGE_SIZE);
  const withdrawAmountNumber = Number(withdrawAmount);
  const hasBankAccount = Boolean(
    summary.bankAccount && summary.bankAccountHolder,
  );
  const canSubmitWithdrawal =
    hasBankAccount &&
    Number.isFinite(withdrawAmountNumber) &&
    withdrawAmountNumber >= 1 &&
    withdrawAmountNumber <= summary.availableCommissionBalance &&
    !isSubmittingWithdraw;

  const handleAccessFailure = useCallback(
    (message: string) => {
      if (accessToastShownRef.current) {
        return;
      }

      accessToastShownRef.current = true;
      addToast({
        title: "파트너 권한 확인 필요",
        message,
        type: "warning",
      });
      router.replace("/partner/login");
    },
    [addToast, router],
  );

  const syncSummary = useCallback((nextSummary: PartnerSummary) => {
    setSummary(nextSummary);
  }, []);

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const response = await fetchPartnerSummary();
      syncSummary(response.summary);
    } catch (error) {
      const message = getErrorMessage(
        error,
        "파트너 요약 정보를 불러오지 못했습니다.",
      );
      setSummaryError(message);
      if (
        message.includes("Agent privileges required") ||
        message.includes("Missing auth token") ||
        message.includes("Invalid auth token") ||
        message.includes("Inactive partner account") ||
        message.includes("No session")
      ) {
        handleAccessFailure(message);
      }
    } finally {
      setIsSummaryLoading(false);
    }
  }, [handleAccessFailure, syncSummary]);

  const loadMembers = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setMemberLoading(true);
        setMemberError(null);
      }

      try {
        const response = await fetchPartnerMembers({
          page: memberPage,
          pageSize: PAGE_SIZE,
          search: debouncedMemberSearch.trim(),
        });
        syncSummary(response.summary);
        setMemberRows(response.members.rows);
        setMemberTotalCount(response.members.totalCount);
        if (silent) {
          setMemberError(null);
        }
      } catch (error) {
        if (!silent) {
          setMemberError(
            getErrorMessage(error, "귀속 회원 목록을 불러오지 못했습니다."),
          );
          setMemberRows([]);
          setMemberTotalCount(0);
        }
      } finally {
        if (!silent) {
          setMemberLoading(false);
        }
      }
    },
    [debouncedMemberSearch, memberPage, syncSummary],
  );

  const loadCommissions = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setCommissionLoading(true);
        setCommissionError(null);
      }

      try {
        const response = await fetchPartnerCommissions({
          page: commissionPage,
          pageSize: PAGE_SIZE,
          sourceType: commissionType,
          startDate: commissionStartDate,
          endDate: commissionEndDate,
          search: debouncedCommissionSearch.trim(),
        });
        syncSummary(response.summary);
        // 조용한 교체: 기존 행을 유지한 채로 새 배열로 setState. React가
        // diff하여 실제로 값이 변경된 행만 재렌더링하므로 깜빡임이 없습니다.
        setCommissionRows(response.commissions.rows);
        setCommissionTotalCount(response.commissions.totalCount);
        if (silent) {
          setCommissionError(null);
        }
      } catch (error) {
        if (!silent) {
          setCommissionError(
            getErrorMessage(error, "커미션 내역을 불러오지 못했습니다."),
          );
          setCommissionRows([]);
          setCommissionTotalCount(0);
        }
      } finally {
        if (!silent) {
          setCommissionLoading(false);
        }
      }
    },
    [
      commissionEndDate,
      commissionPage,
      commissionStartDate,
      commissionType,
      debouncedCommissionSearch,
      syncSummary,
    ],
  );

  const loadWithdrawals = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setWithdrawLoading(true);
        setWithdrawError(null);
      }

      try {
        const response = await fetchPartnerWithdrawals({
          page: withdrawPage,
          pageSize: PAGE_SIZE,
          status: withdrawStatus,
          startDate: withdrawStartDate,
          endDate: withdrawEndDate,
          search: debouncedWithdrawSearch.trim(),
        });
        syncSummary(response.summary);
        setWithdrawRows(response.withdrawals.rows);
        setWithdrawTotalCount(response.withdrawals.totalCount);
        if (silent) {
          setWithdrawError(null);
        }
      } catch (error) {
        if (!silent) {
          setWithdrawError(
            getErrorMessage(error, "출금 내역을 불러오지 못했습니다."),
          );
          setWithdrawRows([]);
          setWithdrawTotalCount(0);
        }
      } finally {
        if (!silent) {
          setWithdrawLoading(false);
        }
      }
    },
    [
      debouncedWithdrawSearch,
      syncSummary,
      withdrawEndDate,
      withdrawPage,
      withdrawStartDate,
      withdrawStatus,
    ],
  );

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    if (!user) {
      router.replace("/partner/login");
      return;
    }

    if (!role) {
      return;
    }

    if (role !== "agent") {
      handleAccessFailure("에이전트 계정으로 로그인해야 합니다.");
      return;
    }

    void loadSummary();
  }, [handleAccessFailure, isInitialized, loadSummary, role, router, user]);

  useEffect(() => {
    if (role !== "agent" || activeTab !== "members") {
      return;
    }

    void loadMembers();
  }, [activeTab, loadMembers, role]);

  useEffect(() => {
    if (role !== "agent" || activeTab !== "commissions") {
      return;
    }

    void loadCommissions();
  }, [activeTab, loadCommissions, role]);

  useEffect(() => {
    if (role !== "agent" || activeTab !== "withdraw") {
      return;
    }

    void loadWithdrawals();
  }, [activeTab, loadWithdrawals, role]);

  useEffect(() => {
    setMemberPage(1);
  }, [debouncedMemberSearch]);

  useEffect(() => {
    setCommissionPage(1);
  }, [
    commissionEndDate,
    commissionStartDate,
    commissionType,
    debouncedCommissionSearch,
  ]);

  useEffect(() => {
    setWithdrawPage(1);
  }, [
    debouncedWithdrawSearch,
    withdrawEndDate,
    withdrawStartDate,
    withdrawStatus,
  ]);

  useEffect(() => {
    if (activeTab !== "members" || memberRows.length === 0) {
      return;
    }

    memberRows.slice(0, 6).forEach((member) => prefetchMemberDetail(member.id));
  }, [activeTab, memberRows]);

  // Periodic polling: refresh active tab data every 30s in silent mode so the
  // visible rows are replaced in place instead of being swapped for a spinner.
  const pollActiveTab = useCallback(() => {
    if (role !== "agent") return;
    void loadSummary();
    if (activeTab === "members") void loadMembers({ silent: true });
    else if (activeTab === "commissions")
      void loadCommissions({ silent: true });
    else if (activeTab === "withdraw") void loadWithdrawals({ silent: true });
  }, [
    activeTab,
    loadCommissions,
    loadMembers,
    loadSummary,
    loadWithdrawals,
    role,
  ]);

  useInterval(pollActiveTab, role === "agent" ? POLLING_INTERVAL : null);

  // Supabase realtime: listen for withdrawal status changes and new commissions.
  // Background updates run silently so newly inserted rows appear in place
  // without flipping the table back to a loading spinner.
  useEffect(() => {
    if (role !== "agent" || !user) return;

    const channel = supabase
      .channel("partner-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "withdrawals",
          filter: `agent_id=eq.${user.id}`,
        },
        () => {
          void loadSummary();
          if (activeTab === "withdraw") void loadWithdrawals({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_commissions",
          filter: `agent_id=eq.${user.id}`,
        },
        () => {
          void loadSummary();
          if (activeTab === "commissions")
            void loadCommissions({ silent: true });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeTab, loadCommissions, loadSummary, loadWithdrawals, role, user]);

  const headerActions = useMemo(
    () => (
      <>
        <div className="rounded-full border border-white/8 bg-white/4 px-3.5 py-2 text-xs text-gray-300">
          파트너{" "}
          <span className="ml-1 font-medium text-white">
            {summary.name || "-"}
          </span>
        </div>
        <div className="rounded-full border border-white/8 bg-white/4 px-3.5 py-2 text-xs text-gray-300">
          코드{" "}
          <span className="ml-1 font-medium text-yellow-400">
            {summary.referralCode}
          </span>
        </div>
        <div className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3.5 py-2 text-xs font-medium text-yellow-300">
          {summary.grade}
        </div>
      </>
    ),
    [summary.grade, summary.name, summary.referralCode],
  );

  if (!isInitialized || (isSummaryLoading && !summary.name && !summaryError)) {
    return (
      <div className="px-6 py-10 text-white">
        <div className="mx-auto max-w-7xl">
          <AdminLoadingSpinner message="파트너 데이터를 준비하는 중입니다." />
        </div>
      </div>
    );
  }

  return (
    <div className="text-white">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <AdminPageHeader
          title="파트너 센터"
          description="파트너 실적, 귀속 회원, 커미션 흐름, 출금 신청 상태를 하나의 운영 패턴으로 관리합니다."
        >
          {headerActions}
        </AdminPageHeader>

        <AdminTabs
          tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
          activeTab={activeTab}
          onChange={(value) =>
            setActiveTab(value as (typeof TABS)[number]["id"])
          }
        />

        {summaryError ? (
          <AdminErrorState message={summaryError} onRetry={loadSummary} />
        ) : null}

        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <AdminSummaryCard
                label="출금 가능 커미션"
                value={formatUsdt(summary.availableCommissionBalance)}
                valueClassName="text-2xl font-bold text-yellow-400"
                meta={
                  summary.pendingWithdrawalCount > 0
                    ? `보류 중 ${summary.pendingWithdrawalCount}건 · ${formatUsdt(summary.pendingWithdrawalAmount)}`
                    : "대기 중인 출금 신청이 없습니다."
                }
              />
              <AdminSummaryCard
                label="누적 커미션"
                value={formatUsdt(summary.totalCommissionEarned)}
                valueClassName="text-2xl font-bold text-emerald-400"
                meta="승인된 정산 누적 기준"
              />
              <AdminSummaryCard
                label="귀속 회원"
                value={`${summary.memberCount}명`}
                valueClassName="text-2xl font-bold text-sky-300"
                meta={`추천코드 ${summary.referralCode}`}
              />
              <AdminSummaryCard
                label="정산 대기"
                value={`${summary.pendingWithdrawalCount}건`}
                valueClassName="text-2xl font-bold text-white"
                meta={formatUsdt(summary.pendingWithdrawalAmount)}
              />
            </div>

            <AdminCard title="커미션 비율 현황">
              <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
                <AdminSummaryCard
                  className="bg-black! border-gray-700!"
                  label="죽장 커미션"
                  value={`${summary.lossCommission}%`}
                  valueClassName="text-2xl font-bold text-white"
                  meta="회원 손실 기준"
                />
                <AdminSummaryCard
                  className="bg-black! border-gray-700!"
                  label="롤링 커미션"
                  value={`${summary.rollingCommission}%`}
                  valueClassName="text-2xl font-bold text-white"
                  meta="거래 담보금 기준"
                />
                <AdminSummaryCard
                  className="bg-black! border-gray-700!"
                  label="수수료 커미션"
                  value={`${summary.feeCommission}%`}
                  valueClassName="text-2xl font-bold text-white"
                  meta="거래 수수료 기준"
                />
              </div>
            </AdminCard>

            <AdminCard title="커미션 종류별 누적 정산">
              <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
                <AdminSummaryCard
                  className="border-red-500/20! bg-red-500/5!"
                  label="죽장 커미션"
                  value={formatUsdt(summary.commissionBreakdown.loss)}
                  valueClassName="text-2xl font-bold text-red-300"
                  meta={`이번 달 ${formatUsdt(summary.monthCommissionBreakdown.loss)}`}
                />
                <AdminSummaryCard
                  className="border-yellow-500/20! bg-yellow-500/5!"
                  label="롤링 커미션"
                  value={formatUsdt(summary.commissionBreakdown.rolling)}
                  valueClassName="text-2xl font-bold text-yellow-300"
                  meta={`이번 달 ${formatUsdt(summary.monthCommissionBreakdown.rolling)}`}
                />
                <AdminSummaryCard
                  className="border-sky-500/20! bg-sky-500/5!"
                  label="수수료 커미션"
                  value={formatUsdt(summary.commissionBreakdown.trade_fee)}
                  valueClassName="text-2xl font-bold text-sky-300"
                  meta={`이번 달 ${formatUsdt(summary.monthCommissionBreakdown.trade_fee)}`}
                />
              </div>
            </AdminCard>

            <AdminCard title="출금 계좌 정보">
              <div className="space-y-4 p-5">
                {hasBankAccount ? (
                  <div className="space-y-3 rounded-2xl border border-white/8 bg-white/3 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">은행</span>
                      <span className="font-medium text-white">
                        {summary.bankName || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">계좌번호</span>
                      <span className="font-medium text-white">
                        {summary.bankAccount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">예금주</span>
                      <span className="font-medium text-white">
                        {summary.bankAccountHolder}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
                    출금 계좌 정보가 없습니다. 관리자에게 계좌 등록을
                    요청해주세요.
                  </div>
                )}

                <AdminButton
                  size="sm"
                  className="w-full"
                  onClick={() => setActiveTab("withdraw")}
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  출금 신청으로 이동
                </AdminButton>
              </div>
            </AdminCard>
          </div>
        )}

        {activeTab === "members" && (
          <div className="space-y-4">
            <AdminSearchFilterCard
              searchControls={
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <AdminInput
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="회원명, 이메일, 전화번호, 추천코드 검색"
                      className="pl-9"
                    />
                  </div>
                  <div className="text-xs text-gray-400">
                    현재 {memberTotalCount}명의 귀속 회원이 연결되어 있습니다.
                  </div>
                </div>
              }
            />

            <AdminCard
              title="귀속 회원 목록"
              action={
                <span className="text-sm text-gray-400">
                  조회 {memberRows.length}명
                </span>
              }
            >
              <AdminTable
                containerClassName="w-full"
                tableClassName="w-full table-fixed text-xs"
                headerCellClassName="px-3 py-3 text-[11px] whitespace-nowrap"
                columnClassNames={[
                  "w-[22%] min-w-45 text-center",
                  "w-[10%] min-w-25 text-center",
                  "w-[10%] min-w-25 text-center",
                  "w-[10%] min-w-25 text-center",
                  "w-[12%] min-w-30 text-center",
                  "w-[8%] min-w-20 text-center",
                  "w-[9%] min-w-25 text-center",
                  "w-[9%] min-w-25 text-center",
                  "w-[7%] min-w-17.5 text-center",
                ]}
                headers={[
                  "아이디",
                  "일반잔고",
                  "선물잔고",
                  "스테이킹",
                  "가입일/최근활동",
                  "가입코드",
                  "총입금",
                  "총출금",
                  "상세",
                ]}
              >
                {memberLoading ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={9}>
                      <AdminLoadingSpinner message="귀속 회원을 불러오는 중입니다." />
                    </AdminTableCell>
                  </AdminTableRow>
                ) : memberError ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={9}>
                      <AdminErrorState
                        message={memberError}
                        onRetry={() => loadMembers()}
                      />
                    </AdminTableCell>
                  </AdminTableRow>
                ) : memberRows.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={9}>
                      <AdminEmptyState message="조건에 맞는 귀속 회원이 없습니다." />
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  memberRows.map((member) => (
                    <AdminTableRow key={member.id}>
                      <AdminTableCell
                        className="w-[22%] min-w-45 px-3 py-3 align-middle whitespace-nowrap cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => setSelectedMember(member)}
                      >
                        <div
                          className="flex flex-col gap-1"
                          onMouseEnter={() => prefetchMemberDetail(member.id)}
                        >
                          <div className="truncate font-medium text-gray-200">
                            {member.email}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">
                            {member.name}
                            {member.phone !== "-" ? ` · ${member.phone}` : ""}
                          </div>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="w-[10%] min-w-25 px-3 py-3 align-middle whitespace-nowrap">
                        <div className="font-medium text-emerald-400 tabular-nums text-center">
                          {formatUsdt(member.balance, {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="w-[10%] min-w-25 px-3 py-3 align-middle whitespace-nowrap">
                        <div className="font-medium text-yellow-400 tabular-nums text-center">
                          {formatUsdt(member.futuresBalance, {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="w-[10%] min-w-25 px-3 py-3 align-middle whitespace-nowrap">
                        <div className="font-medium text-blue-400 tabular-nums text-center">
                          {formatUsdt(member.stakingBalance, {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="w-[12%] min-w-30 px-3 py-3 align-middle whitespace-nowrap">
                        <div className="text-gray-300 tabular-nums text-center">
                          {member.joinDate}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="w-[8%] min-w-20 px-3 py-3 align-middle whitespace-nowrap font-mono text-[11px] text-gray-300 text-center">
                        {member.joinCode}
                      </AdminTableCell>
                      <AdminTableCell className="w-[9%] min-w-25 px-3 py-3 align-middle whitespace-nowrap">
                        <div className="font-medium tabular-nums text-center">
                          {formatUsdt(member.totalDeposit, {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="w-[9%] min-w-25 px-3 py-3 align-middle whitespace-nowrap">
                        <div className="font-medium tabular-nums text-center">
                          {formatUsdt(member.totalWithdraw, {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="w-[7%] min-w-17.5 px-3 py-3 align-middle whitespace-nowrap text-center">
                        <AdminButton
                          variant="secondary"
                          size="sm"
                          onMouseEnter={() => prefetchMemberDetail(member.id)}
                          onClick={() => setSelectedMember(member)}
                        >
                          상세
                        </AdminButton>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTable>
              <AdminPagination
                currentPage={memberPage}
                totalPages={memberTotalPages}
                totalCount={memberTotalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setMemberPage}
                className="px-4 pb-4"
              />
            </AdminCard>
          </div>
        )}

        {activeTab === "commissions" && (
          <div className="space-y-4">
            <AdminSearchFilterCard
              fields={[
                {
                  key: "type",
                  label: "유형",
                  control: (
                    <AdminSelect
                      value={commissionType}
                      onChange={(event) =>
                        setCommissionType(event.target.value)
                      }
                    >
                      {COMMISSION_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </AdminSelect>
                  ),
                },
                {
                  key: "date",
                  label: "기간",
                  className: "md:col-span-2",
                  control: (
                    <AdminDateRangePicker
                      startDate={commissionStartDate}
                      endDate={commissionEndDate}
                      onStartDateChange={setCommissionStartDate}
                      onEndDateChange={setCommissionEndDate}
                    />
                  ),
                },
              ]}
              searchControls={
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <AdminInput
                      value={commissionSearch}
                      onChange={(event) =>
                        setCommissionSearch(event.target.value)
                      }
                      placeholder="회원명 또는 커미션 유형 검색"
                      className="pl-9"
                    />
                  </div>
                  {(commissionType !== "all" ||
                    commissionStartDate ||
                    commissionEndDate ||
                    commissionSearch) && (
                    <AdminButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCommissionType("all");
                        setCommissionStartDate("");
                        setCommissionEndDate("");
                        setCommissionSearch("");
                      }}
                    >
                      초기화
                    </AdminButton>
                  )}
                </div>
              }
            />

            <AdminCard title={`커미션 내역 (${commissionTotalCount}건)`}>
              <AdminTable
                containerClassName="w-full"
                tableClassName="w-full table-fixed text-xs"
                headerCellClassName="px-3 py-3 text-[11px] whitespace-nowrap"
                columnClassNames={[
                  "w-[6%] min-w-[50px] text-center",
                  "w-[18%] min-w-[140px] text-center",
                  "w-[18%] min-w-[140px] text-center",
                  "w-[14%] min-w-[100px] text-center",
                  "w-[14%] min-w-[100px] text-center",
                  "w-[14%] min-w-[100px] text-center",
                  "w-[10%] min-w-[80px] text-center",
                ]}
                headers={[
                  "번호",
                  "발생일시",
                  "회원",
                  "구분",
                  "내용",
                  "커미션 금액",
                  "상태",
                ]}
              >
                {commissionLoading ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={7}>
                      <AdminLoadingSpinner message="커미션 내역을 불러오는 중입니다." />
                    </AdminTableCell>
                  </AdminTableRow>
                ) : commissionError ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={7}>
                      <AdminErrorState
                        message={commissionError}
                        onRetry={() => loadCommissions()}
                      />
                    </AdminTableCell>
                  </AdminTableRow>
                ) : commissionRows.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={7}>
                      <AdminEmptyState message="조건에 맞는 커미션 내역이 없습니다." />
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  commissionRows.map((row) => (
                    <AdminTableRow key={row.id}>
                      <AdminTableCell className="px-3 py-3 align-middle whitespace-nowrap text-center text-gray-400">
                        {row.id}
                      </AdminTableCell>
                      <AdminTableCell className="px-3 py-3 align-middle whitespace-nowrap text-center text-gray-300">
                        {row.date}
                      </AdminTableCell>
                      <AdminTableCell className="px-3 py-3 align-middle whitespace-nowrap text-center text-gray-200">
                        {row.memberEmail}
                      </AdminTableCell>
                      <AdminTableCell className="px-3 py-3 align-middle whitespace-nowrap text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${commissionToneClass(
                            row.typeLabel,
                          )}`}
                        >
                          {row.typeLabel}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell className="px-3 py-3 align-middle whitespace-normal text-center text-gray-300">
                        {row.description}
                      </AdminTableCell>
                      <AdminTableCell
                        className={`px-3 py-3 align-middle whitespace-nowrap text-center font-medium tabular-nums ${
                          row.amount < 0 ? "text-red-400" : "text-green-400"
                        }`}
                      >
                        {formatUsdt(row.amount, { signed: true })}
                      </AdminTableCell>
                      <AdminTableCell className="px-3 py-3 align-middle whitespace-nowrap text-center">
                        <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-500">
                          지급완료
                        </span>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTable>
              <AdminPagination
                currentPage={commissionPage}
                totalPages={commissionTotalPages}
                totalCount={commissionTotalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setCommissionPage}
                className="px-4 pb-4"
              />
            </AdminCard>
          </div>
        )}

        {activeTab === "withdraw" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
            <AdminCard title="커미션 출금 신청">
              <div className="space-y-4 p-5">
                <AdminSummaryCard
                  label="출금 가능 잔액"
                  value={formatUsdt(summary.availableCommissionBalance)}
                  valueClassName="text-2xl font-bold text-yellow-400"
                  meta={
                    summary.pendingWithdrawalCount > 0
                      ? `대기 ${summary.pendingWithdrawalCount}건`
                      : "즉시 신청 가능합니다."
                  }
                />

                {hasBankAccount ? (
                  <div className="space-y-3 rounded-2xl border border-white/8 bg-white/3 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">은행</span>
                      <span className="font-medium text-white">
                        {summary.bankName || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">계좌번호</span>
                      <span className="font-medium text-white">
                        {summary.bankAccount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">예금주</span>
                      <span className="font-medium text-white">
                        {summary.bankAccountHolder}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
                    출금 계좌 정보가 없습니다. 관리자에게 계좌 등록을
                    요청해주세요.
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs text-gray-400">
                    출금 금액 (USDT)
                  </label>
                  <AdminInput
                    type="number"
                    min={1}
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(event.target.value)}
                    placeholder="0"
                  />
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>최소 출금 1 USDT</span>
                    <button
                      type="button"
                      className="text-yellow-400 transition-colors hover:text-yellow-300"
                      onClick={() =>
                        setWithdrawAmount(
                          String(
                            Math.floor(summary.availableCommissionBalance),
                          ),
                        )
                      }
                    >
                      전액 입력
                    </button>
                  </div>
                </div>

                <AdminButton
                  className="w-full"
                  disabled={!canSubmitWithdrawal}
                  onClick={async () => {
                    if (!canSubmitWithdrawal) {
                      return;
                    }

                    setIsSubmittingWithdraw(true);
                    try {
                      const response =
                        await requestPartnerWithdrawal(withdrawAmountNumber);
                      syncSummary(response.summary);
                      setWithdrawAmount("");
                      addToast({
                        title: "출금 신청 완료",
                        message: response.message,
                        type: "success",
                      });
                      await loadWithdrawals();
                    } catch (error) {
                      addToast({
                        title: "출금 신청 실패",
                        message: getErrorMessage(
                          error,
                          "출금 신청을 처리하지 못했습니다.",
                        ),
                        type: "error",
                      });
                    } finally {
                      setIsSubmittingWithdraw(false);
                    }
                  }}
                >
                  <ArrowUpFromLine className="h-4 w-4" />
                  {isSubmittingWithdraw ? "처리 중..." : "출금 신청하기"}
                </AdminButton>
              </div>
            </AdminCard>

            <div className="space-y-4">
              <AdminSearchFilterCard
                fields={[
                  {
                    key: "status",
                    label: "상태",
                    control: (
                      <AdminSelect
                        value={withdrawStatus}
                        onChange={(event) =>
                          setWithdrawStatus(event.target.value)
                        }
                      >
                        {WITHDRAWAL_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </AdminSelect>
                    ),
                  },
                  {
                    key: "date",
                    label: "기간",
                    className: "md:col-span-2",
                    control: (
                      <AdminDateRangePicker
                        startDate={withdrawStartDate}
                        endDate={withdrawEndDate}
                        onStartDateChange={setWithdrawStartDate}
                        onEndDateChange={setWithdrawEndDate}
                      />
                    ),
                  },
                ]}
                searchControls={
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <AdminInput
                        value={withdrawSearch}
                        onChange={(event) =>
                          setWithdrawSearch(event.target.value)
                        }
                        placeholder="은행, 계좌번호, 예금주, 금액 검색"
                        className="pl-9"
                      />
                    </div>
                    {(withdrawStatus !== "all" ||
                      withdrawStartDate ||
                      withdrawEndDate ||
                      withdrawSearch) && (
                      <AdminButton
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setWithdrawStatus("all");
                          setWithdrawStartDate("");
                          setWithdrawEndDate("");
                          setWithdrawSearch("");
                        }}
                      >
                        초기화
                      </AdminButton>
                    )}
                  </div>
                }
              />

              <AdminCard title="출금 내역">
                {withdrawLoading ? (
                  <AdminLoadingSpinner message="출금 내역을 불러오는 중입니다." />
                ) : withdrawError ? (
                  <AdminErrorState
                    message={withdrawError}
                    onRetry={() => loadWithdrawals()}
                  />
                ) : withdrawRows.length === 0 ? (
                  <AdminEmptyState message="조건에 맞는 출금 내역이 없습니다." />
                ) : (
                  <div className="space-y-4 p-5">
                    <AdminTable
                      headers={[
                        "일시",
                        "금액",
                        "은행",
                        "계좌번호",
                        "예금주",
                        "상태",
                      ]}
                      containerClassName="rounded-xl border border-gray-800"
                    >
                      {withdrawRows.map((row) => (
                        <AdminTableRow key={row.id}>
                          <AdminTableCell className="text-xs text-gray-400">
                            {row.date}
                          </AdminTableCell>
                          <AdminTableCell className="font-semibold text-white">
                            {formatUsdt(row.amount)}
                          </AdminTableCell>
                          <AdminTableCell>{row.bank}</AdminTableCell>
                          <AdminTableCell className="text-xs text-gray-400">
                            {row.accountNumber}
                          </AdminTableCell>
                          <AdminTableCell>{row.accountHolder}</AdminTableCell>
                          <AdminTableCell>
                            <div className="space-y-1">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${withdrawalStatusClass(
                                  row.status,
                                )}`}
                              >
                                {row.status}
                              </span>
                              {row.rejectReason ? (
                                <div className="text-[11px] text-gray-500 whitespace-normal">
                                  {row.rejectReason}
                                </div>
                              ) : null}
                            </div>
                          </AdminTableCell>
                        </AdminTableRow>
                      ))}
                    </AdminTable>

                    <AdminPagination
                      currentPage={withdrawPage}
                      totalPages={withdrawTotalPages}
                      totalCount={withdrawTotalCount}
                      pageSize={PAGE_SIZE}
                      onPageChange={setWithdrawPage}
                    />
                  </div>
                )}
              </AdminCard>
            </div>
          </div>
        )}
      </div>

      <MemberDetailModal
        member={selectedMember}
        isOpen={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        readOnly={true}
      />
    </div>
  );
}
