import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
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
import { AdminConnectionInfoFields } from "@/components/admin/ui/AdminConnectionInfoFields";
import {
  AdminLoadingSpinner,
  AdminErrorState,
  AdminEmptyState,
} from "@/components/admin/ui/AdminLoadingSpinner";
import {
  AdminForceCloseModal,
  type ForceClosePosition,
} from "@/components/admin/ui/AdminForceCloseModal";
import {
  AdminTradeDetailModal,
  type AdminTradeDetail,
} from "@/components/admin/ui/AdminTradeDetailModal";
import { Search, AlertTriangle, Plus, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateUserPassword } from "@/lib/api/admin";
import type { DbUserProfile } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatDate";
import { toDisplayIp } from "@/lib/utils/ip";
import { formatKrw, formatUsdt } from "@/lib/utils/numberFormat";
import { computePositionUnrealizedPnl } from "@/lib/utils/futuresRisk";
import {
  isSameMarkPriceMap,
  loadAdminMarkPriceMap,
} from "@/lib/utils/adminMarkPrice";
import {
  getEarliestSuccessfulLoginLog,
  getLatestSuccessfulLoginLog,
  getLoginBrowser,
  getLoginDevice,
  isSuccessfulLoginLog,
  pickFirstMeaningful,
} from "@/lib/utils/loginMetadata";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";

const supabase = createClient();

type MemberRow = {
  id: number;
  visibleId: string;
  email: string;
  name: string;
  phone: string;
  lastLoginIP: string;
  registrationIP: string;
  joinDate: string;
  lastLoginDate: string;
  isOnline: boolean;
  lastActivity: string;
  status: string;
  balance: number;
  availableBalance: number;
  balance_krw: number;
  totalDeposit: number;
  totalDeposit_krw: number;
  totalWithdraw: number;
  totalWithdraw_krw: number;
  totalInvest: number;
  totalInvest_krw: number;
  totalProfit: number;
  totalProfit_krw: number;
  totalTrades: number;
  futuresBalance: number;
  partnerId: string;
  joinCode: string;
  memo: string;
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
  stakingBalance: number;
  stakingCount: number;
  createdAt: string;
  lastActivityAt: string;
};

type MemberTypeFilter = "all" | "normal" | "stop" | "withdrawal";
type MemberSortField =
  | "join_date"
  | "id"
  | "name"
  | "balance"
  | "partner_id"
  | "total_deposit"
  | "total_withdraw"
  | "total_invest"
  | "profit"
  | "last_active";
type MemberSearchField =
  | ""
  | "user_id"
  | "user_name"
  | "join_code"
  | "partner_id";

const memberTableColumns = {
  select: "w-[4%] min-w-[40px] text-center",
  identity: "w-[24%] min-w-[180px] text-center",
  balance: "w-[12%] min-w-[100px] text-center",
  futures: "w-[12%] min-w-[100px] text-center",
  staking: "w-[12%] min-w-[100px] text-center",
  activity: "w-[12%] min-w-[120px] text-center",
  joinCode: "w-[8%] min-w-[80px] text-center",
  deposit: "w-[8%] min-w-[90px] text-center",
  withdraw: "w-[8%] min-w-[90px] text-center",
} as const;

const memberTableHeaderColumnClasses = [
  memberTableColumns.select,
  memberTableColumns.identity,
  memberTableColumns.balance,
  memberTableColumns.futures,
  memberTableColumns.staking,
  memberTableColumns.activity,
  memberTableColumns.joinCode,
  memberTableColumns.deposit,
  memberTableColumns.withdraw,
];

async function loadMembers(): Promise<MemberRow[]> {
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (!profiles) return [];

  const { data: agents } = await supabase.from("agents").select("id, username");
  const agentUsernameById: Record<string, string> = {};
  (agents || []).forEach((agent: any) => {
    if (agent?.id) {
      agentUsernameById[agent.id] = agent.username || "-";
    }
  });

  // 집계: 입금
  const { data: depAgg } = await supabase
    .from("deposits")
    .select("user_id, amount, status");
  const depMap: Record<string, number> = {};
  (depAgg || []).forEach((d: any) => {
    if (d.status === "approved")
      depMap[d.user_id] = (depMap[d.user_id] || 0) + Number(d.amount);
  });

  // 집계: 출금
  const { data: wdAgg } = await supabase
    .from("withdrawals")
    .select("user_id, amount, status");
  const wdMap: Record<string, number> = {};
  (wdAgg || []).forEach((w: any) => {
    if (w.status === "approved")
      wdMap[w.user_id] = (wdMap[w.user_id] || 0) + Number(w.amount);
  });

  // 집계: 거래수
  const { data: trades } = await supabase
    .from("futures_positions")
    .select("user_id, margin, pnl, status");
  const tradeMap: Record<string, number> = {};
  const futuresBalanceMap: Record<string, number> = {};
  const totalInvestMap: Record<string, number> = {};
  const profitMap: Record<string, number> = {};
  (trades || []).forEach((t: any) => {
    tradeMap[t.user_id] = (tradeMap[t.user_id] || 0) + 1;
    totalInvestMap[t.user_id] =
      (totalInvestMap[t.user_id] || 0) + Number(t.margin || 0);
    if (t.status === "open") {
      futuresBalanceMap[t.user_id] =
        (futuresBalanceMap[t.user_id] || 0) + Number(t.margin || 0);
    } else {
      profitMap[t.user_id] = (profitMap[t.user_id] || 0) + Number(t.pnl || 0);
    }
  });

  // 집계: 스테이킹
  const { data: stakings } = await supabase
    .from("staking_positions")
    .select("user_id, amount, status");
  const stakingCountMap: Record<string, number> = {};
  const stakingBalMap: Record<string, number> = {};
  (stakings || []).forEach((s: any) => {
    if (s.status === "active") {
      stakingCountMap[s.user_id] = (stakingCountMap[s.user_id] || 0) + 1;
      stakingBalMap[s.user_id] =
        (stakingBalMap[s.user_id] || 0) + Number(s.amount);
    }
  });

  return profiles.map((p, idx) => ({
    id: idx + 1,
    visibleId: p.id,
    email: p.email,
    name: p.name,
    phone: p.phone,
    lastLoginIP: p.last_login_ip || "-",
    registrationIP: p.join_ip || "-",
    joinDate: formatDateTime(p.created_at),
    lastLoginDate: formatDateTime(p.last_login_at),
    isOnline: Boolean(p.is_online),
    lastActivity: formatDateTime(p.last_activity),
    status:
      p.status === "active"
        ? "정상"
        : p.status === "suspended"
          ? "정지"
          : p.status === "banned"
            ? "탈퇴"
            : "대기",
    balance: Number(p.wallet_balance),
    availableBalance: Number(p.available_balance || p.wallet_balance),
    balance_krw: Math.round(Number(p.wallet_balance) * 1415),
    totalDeposit: depMap[p.id] || 0,
    totalDeposit_krw: Math.round((depMap[p.id] || 0) * 1415),
    totalWithdraw: wdMap[p.id] || 0,
    totalWithdraw_krw: Math.round((wdMap[p.id] || 0) * 1415),
    totalInvest: totalInvestMap[p.id] || 0,
    totalInvest_krw: Math.round((totalInvestMap[p.id] || 0) * 1415),
    totalProfit: profitMap[p.id] || 0,
    totalProfit_krw: Math.round((profitMap[p.id] || 0) * 1415),
    totalTrades: tradeMap[p.id] || 0,
    futuresBalance: futuresBalanceMap[p.id] || 0,
    partnerId: agentUsernameById[p.agent_id || ""] || "-",
    joinCode: p.referral_code_used || "DIRECT",
    memo: p.admin_memo || "",
    bankName: p.bank_name || "",
    bankAccount: p.bank_account || "",
    bankAccountHolder: p.bank_account_holder || "",
    stakingBalance: stakingBalMap[p.id] || 0,
    stakingCount: stakingCountMap[p.id] || 0,
    createdAt: p.created_at || "",
    lastActivityAt: p.last_activity || p.last_login_at || p.created_at || "",
  }));
}

export function MemberListTab() {
  const { isInitialized, role, user } = useAuth();
  const { addToast } = useNotification();
  const [mockMembers, setMockMembers] = useState<MemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [selectedTradeDetail, setSelectedTradeDetail] =
    useState<AdminTradeDetail | null>(null);
  const [activeModalTab, setActiveModalTab] = useState("info");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [markPriceBySymbol, setMarkPriceBySymbol] = useState<
    Record<string, number>
  >({});
  const [partnerCodes, setPartnerCodes] = useState<
    { code: string; name: string }[]
  >([]);
  const [memberTypeFilter, setMemberTypeFilter] =
    useState<MemberTypeFilter>("all");
  const [sortBy, setSortBy] = useState<MemberSortField>("join_date");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [searchField, setSearchField] = useState<MemberSearchField>("");
  const [searchTermInput, setSearchTermInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<{
    memberType: MemberTypeFilter;
    sortBy: MemberSortField;
    sortOrder: "desc" | "asc";
    searchField: MemberSearchField;
    searchTerm: string;
  }>({
    memberType: "all",
    sortBy: "join_date",
    sortOrder: "desc",
    searchField: "",
    searchTerm: "",
  });
  // 모달 내 DB 데이터
  const [memberDeposits, setMemberDeposits] = useState<any[]>([]);
  const [memberWithdrawals, setMemberWithdrawals] = useState<any[]>([]);
  const [memberPositions, setMemberPositions] = useState<any[]>([]);
  const [memberStakings, setMemberStakings] = useState<any[]>([]);
  const [memberLoginLogs, setMemberLoginLogs] = useState<any[]>([]);
  const [memberDetailLoaded, setMemberDetailLoaded] = useState(false);

  const refreshMembers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await supabase.auth.getSession();
      const data = await loadMembers();
      setMockMembers(data);
    } catch (err) {
      setLoadError("회원 목록을 불러오는 데 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    refreshMembers();
    const loadPartnerCodes = async () => {
      await supabase.auth.getSession();
      const { data } = await supabase
        .from("agents")
        .select("referral_code, name");
      if (data) {
        setPartnerCodes(
          data.map((a: any) => ({ code: a.referral_code, name: a.name })),
        );
      }
    };
    loadPartnerCodes();
  }, [isInitialized, role, refreshMembers]);

  // 회원 선택 시 해당 회원의 상세 데이터 로드
  const openMemberDetail = useCallback(async (member: MemberRow) => {
    await supabase.auth.getSession();
    setSelectedMember(member);
    setSelectedTradeDetail(null);
    setActiveModalTab("info");
    setMemberDetailLoaded(false);
    setMemberDeposits([]);
    setMemberWithdrawals([]);
    setMemberPositions([]);
    setMemberStakings([]);
    setMemberLoginLogs([]);
    const uid = member.visibleId;
    const [profile, deps, wds, pos, stk, logs] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", uid).maybeSingle(),
      supabase
        .from("deposits")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      supabase
        .from("futures_positions")
        .select("*")
        .eq("user_id", uid)
        .order("opened_at", { ascending: false }),
      supabase
        .from("staking_positions")
        .select("*, staking_products(*)")
        .eq("user_id", uid)
        .order("started_at", { ascending: false }),
      supabase
        .from("login_logs")
        .select("*")
        .eq("user_id", uid)
        .order("login_at", { ascending: false })
        .limit(50),
    ]);
    if (profile.data) {
      setSelectedMember((prev) =>
        prev
          ? {
              ...prev,
              email: profile.data.email || prev.email,
              name: profile.data.name || prev.name,
              phone: profile.data.phone || prev.phone,
              lastLoginIP: profile.data.last_login_ip || "-",
              registrationIP: profile.data.join_ip || "-",
              joinDate: formatDateTime(profile.data.created_at),
              lastLoginDate: formatDateTime(profile.data.last_login_at),
              isOnline: Boolean(profile.data.is_online),
              lastActivity: formatDateTime(profile.data.last_activity),
              createdAt: profile.data.created_at || prev.createdAt,
              lastActivityAt:
                profile.data.last_activity ||
                profile.data.last_login_at ||
                profile.data.created_at ||
                prev.lastActivityAt,
              joinCode: profile.data.referral_code_used || "DIRECT",
              memo: profile.data.admin_memo || "",
              bankName: profile.data.bank_name || "",
              bankAccount: profile.data.bank_account || "",
              bankAccountHolder: profile.data.bank_account_holder || "",
              status:
                profile.data.status === "active"
                  ? "정상"
                  : profile.data.status === "pending_approval"
                    ? "대기"
                    : profile.data.status === "suspended"
                      ? "정지"
                      : "탈퇴",
            }
          : prev,
      );
    }
    setMemberDeposits(deps.data || []);
    setMemberWithdrawals(wds.data || []);
    setMemberPositions(pos.data || []);
    setMemberStakings(stk.data || []);
    setMemberLoginLogs(logs.data || []);
    setMemberDetailLoaded(true);
  }, []);
  const [forceCloseTarget, setForceCloseTarget] =
    useState<ForceClosePosition | null>(null);
  const [stakingDropdown, setStakingDropdown] = useState<number | null>(null);
  const [stakingCancelTarget, setStakingCancelTarget] = useState<any>(null);
  const [stakingSettleTarget, setStakingSettleTarget] = useState<any>(null);
  const [stakingSettleRate, setStakingSettleRate] = useState("");
  const [editJoinCode, setEditJoinCode] = useState("DIRECT");
  const [editStatus, setEditStatus] = useState("정상");
  const [balanceAdjust, setBalanceAdjust] = useState<{
    type: "add" | "subtract";
  } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustMemo, setAdjustMemo] = useState("");
  useEffect(() => {
    if (selectedMember) {
      setEditJoinCode(selectedMember.joinCode || "DIRECT");
      setEditStatus(selectedMember.status || "정상");
    }
  }, [selectedMember]);

  const handleCloseModal = () => {
    setSelectedMember(null);
    setSelectedTradeDetail(null);
    setActiveModalTab("info");
    setMemberDetailLoaded(false);
    setMemberDeposits([]);
    setMemberWithdrawals([]);
    setMemberPositions([]);
    setMemberStakings([]);
    setMemberLoginLogs([]);
  };

  const openPositions = useMemo(
    () => memberPositions.filter((p: any) => p.status === "open"),
    [memberPositions],
  );
  const closedPositions = useMemo(
    () => memberPositions.filter((p: any) => p.status !== "open"),
    [memberPositions],
  );
  const openFuturesBalance = useMemo(
    () =>
      openPositions.reduce(
        (sum: number, position: any) => sum + Number(position.margin || 0),
        0,
      ),
    [openPositions],
  );
  const getLivePositionPnl = useCallback(
    (position: any) => {
      const symbol = String(position.symbol || "")
        .trim()
        .toUpperCase();
      const markPrice = markPriceBySymbol[symbol];
      const entryPrice = Number(
        position.entry_price || position.entryPrice || 0,
      );
      const size = Math.abs(Number(position.size || 0));
      const direction =
        String(position.direction || "").toLowerCase() === "short"
          ? "short"
          : "long";

      if (
        Number.isFinite(markPrice) &&
        markPrice > 0 &&
        entryPrice > 0 &&
        size > 0
      ) {
        return computePositionUnrealizedPnl(
          direction,
          entryPrice,
          markPrice,
          size,
        );
      }

      return Number(position.pnl || 0);
    },
    [markPriceBySymbol],
  );
  const openFuturesPnl = useMemo(
    () =>
      openPositions.reduce(
        (sum: number, position: any) => sum + getLivePositionPnl(position),
        0,
      ),
    [getLivePositionPnl, openPositions],
  );
  const activeStakingCount = useMemo(
    () =>
      memberStakings.filter(
        (staking: any) =>
          staking.status === "active" || staking.status === "진행중",
      ).length,
    [memberStakings],
  );
  const activeStakingBalance = useMemo(
    () =>
      memberStakings.reduce((sum: number, staking: any) => {
        if (staking.status === "active" || staking.status === "진행중") {
          return sum + Number(staking.amount || 0);
        }
        return sum;
      }, 0),
    [memberStakings],
  );
  const approvedDepositTotal = useMemo(
    () =>
      memberDeposits.reduce((sum: number, deposit: any) => {
        if (deposit.status === "approved") {
          return sum + Number(deposit.amount || 0);
        }
        return sum;
      }, 0),
    [memberDeposits],
  );
  const approvedWithdrawTotal = useMemo(
    () =>
      memberWithdrawals.reduce((sum: number, withdrawal: any) => {
        if (withdrawal.status === "approved") {
          return sum + Number(withdrawal.amount || 0);
        }
        return sum;
      }, 0),
    [memberWithdrawals],
  );
  const latestSuccessfulLoginLog = useMemo(
    () => getLatestSuccessfulLoginLog(memberLoginLogs),
    [memberLoginLogs],
  );
  const earliestSuccessfulLoginLog = useMemo(
    () => getEarliestSuccessfulLoginLog(memberLoginLogs),
    [memberLoginLogs],
  );
  const displayLastLoginDate = latestSuccessfulLoginLog?.login_at
    ? formatDateTime(latestSuccessfulLoginLog.login_at)
    : selectedMember?.lastLoginDate || "-";
  const displayJoinIp =
    pickFirstMeaningful(
      selectedMember?.registrationIP,
      earliestSuccessfulLoginLog?.ip_address,
    ) || "-";
  const displayLastLoginIp =
    pickFirstMeaningful(
      selectedMember?.lastLoginIP,
      latestSuccessfulLoginLog?.ip_address,
    ) || "-";
  const displayLastActivity =
    pickFirstMeaningful(selectedMember?.lastActivity, displayLastLoginDate) ||
    "-";

  const displayTotalTrades =
    memberDetailLoaded && selectedMember
      ? memberPositions.length
      : Number(selectedMember?.totalTrades || 0);
  const displayTotalDeposit =
    memberDetailLoaded && selectedMember
      ? approvedDepositTotal
      : Number(selectedMember?.totalDeposit || 0);
  const displayTotalWithdraw =
    memberDetailLoaded && selectedMember
      ? approvedWithdrawTotal
      : Number(selectedMember?.totalWithdraw || 0);
  const displayTotalInvest =
    memberDetailLoaded && selectedMember
      ? memberPositions.reduce(
          (sum: number, position: any) => sum + Number(position.margin || 0),
          0,
        )
      : Number(selectedMember?.totalInvest || 0);
  const displayTotalProfit =
    memberDetailLoaded && selectedMember
      ? memberPositions.reduce((sum: number, position: any) => {
          if (position.status === "open") {
            return sum;
          }
          return sum + Number(position.pnl || 0);
        }, 0)
      : Number(selectedMember?.totalProfit || 0);
  const displayFuturesBalance =
    memberDetailLoaded && selectedMember
      ? openFuturesBalance
      : Number(selectedMember?.futuresBalance || 0);
  const displayStakingBalance =
    memberDetailLoaded && selectedMember
      ? activeStakingBalance
      : Number(selectedMember?.stakingBalance || 0);
  const displayStakingCount =
    memberDetailLoaded && selectedMember
      ? activeStakingCount
      : Number(selectedMember?.stakingCount || 0);

  const effectiveSelectedTradeDetail = useMemo(() => {
    if (!selectedTradeDetail || selectedTradeDetail.status !== "진행중") {
      return selectedTradeDetail;
    }

    const markPrice =
      markPriceBySymbol[String(selectedTradeDetail.symbol || "").toUpperCase()];
    if (
      !Number.isFinite(markPrice) ||
      markPrice <= 0 ||
      selectedTradeDetail.entryPrice <= 0 ||
      selectedTradeDetail.size <= 0
    ) {
      return selectedTradeDetail;
    }

    return {
      ...selectedTradeDetail,
      pnl: computePositionUnrealizedPnl(
        selectedTradeDetail.type === "숏" ? "short" : "long",
        selectedTradeDetail.entryPrice,
        markPrice,
        selectedTradeDetail.size,
      ),
    };
  }, [markPriceBySymbol, selectedTradeDetail]);

  useEffect(() => {
    if (!selectedMember || openPositions.length === 0) {
      setMarkPriceBySymbol((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      return;
    }

    const symbols = Array.from(
      new Set<string>(
        openPositions
          .map((position: any) =>
            String(position.symbol || "")
              .trim()
              .toUpperCase(),
          )
          .filter((symbol: string) => symbol.length > 0),
      ),
    );

    if (symbols.length === 0) {
      setMarkPriceBySymbol((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      return;
    }

    let cancelled = false;

    const fetchMarkPrices = async () => {
      const nextMap = await loadAdminMarkPriceMap({
        supabase,
        symbols,
      });

      if (cancelled) {
        return;
      }

      setMarkPriceBySymbol((current) =>
        isSameMarkPriceMap(current, nextMap) ? current : nextMap,
      );
    };

    void fetchMarkPrices();
    const timer = window.setInterval(() => {
      void fetchMarkPrices();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [openPositions, selectedMember]);

  const filteredMembers = useMemo(() => {
    const normalizedTerm = appliedFilters.searchTerm.trim().toLowerCase();
    const rows = mockMembers.filter((member) => {
      if (appliedFilters.memberType === "normal" && member.status !== "정상") {
        return false;
      }
      if (appliedFilters.memberType === "stop" && member.status !== "정지") {
        return false;
      }
      if (
        appliedFilters.memberType === "withdrawal" &&
        member.status !== "탈퇴"
      ) {
        return false;
      }

      if (!normalizedTerm) {
        return true;
      }

      const searchableValues: Record<MemberSearchField, string> = {
        "": `${member.email} ${member.name} ${member.joinCode}`.toLowerCase(),
        user_id: member.email.toLowerCase(),
        user_name: member.name.toLowerCase(),
        join_code: member.joinCode.toLowerCase(),
        partner_id: member.partnerId.toLowerCase(),
      };

      return searchableValues[appliedFilters.searchField].includes(
        normalizedTerm,
      );
    });

    const sortedRows = [...rows].sort((a, b) => {
      const direction = appliedFilters.sortOrder === "asc" ? 1 : -1;
      const getNumericValue = (member: MemberRow) => {
        switch (appliedFilters.sortBy) {
          case "balance":
            return member.balance;
          case "total_deposit":
            return member.totalDeposit;
          case "total_withdraw":
            return member.totalWithdraw;
          case "total_invest":
            return member.totalInvest;
          case "profit":
            return member.totalProfit;
          case "join_date":
            return new Date(member.createdAt).getTime();
          case "last_active":
            return new Date(member.lastActivityAt).getTime();
          default:
            return Number.NaN;
        }
      };

      const numericA = getNumericValue(a);
      const numericB = getNumericValue(b);
      if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
        return (numericA - numericB) * direction;
      }

      const getTextValue = (member: MemberRow) => {
        switch (appliedFilters.sortBy) {
          case "id":
            return member.email;
          case "name":
            return member.name;
          case "partner_id":
            return member.partnerId;
          default:
            return member.email;
        }
      };

      return getTextValue(a).localeCompare(getTextValue(b), "ko") * direction;
    });

    return sortedRows;
  }, [appliedFilters, mockMembers]);

  const isAllSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((member) => selectedMembers.includes(member.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMembers((prev) =>
        prev.filter(
          (id) => !filteredMembers.some((member) => member.id === id),
        ),
      );
    } else {
      setSelectedMembers((prev) => [
        ...new Set([...prev, ...filteredMembers.map((member) => member.id)]),
      ]);
    }
  };

  const toggleSelectMember = (id: number) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6">
      <AdminCard>
        <div className="p-4 space-y-3 bg-surface">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                회원구분
              </label>
              <AdminSelect
                className="w-full"
                value={memberTypeFilter}
                onChange={(e) =>
                  setMemberTypeFilter(e.target.value as MemberTypeFilter)
                }
              >
                <option value="all">전체</option>
                <option value="normal">일반</option>
                <option value="stop">정지</option>
                <option value="withdrawal">탈퇴</option>
              </AdminSelect>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                정렬기준
              </label>
              <AdminSelect
                className="w-full"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as MemberSortField)}
              >
                <option value="join_date">가입일</option>
                <option value="id">아이디</option>
                <option value="name">회원명</option>
                <option value="balance">잔고액</option>
                <option value="partner_id">파트너아이디</option>
                <option value="total_deposit">총입금</option>
                <option value="total_withdraw">총출금</option>
                <option value="total_invest">총투입금</option>
                <option value="profit">수익금</option>
                <option value="last_active">최근활동</option>
              </AdminSelect>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                정렬순서
              </label>
              <AdminSelect
                className="w-full"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
              >
                <option value="desc">내림차순</option>
                <option value="asc">오름차순</option>
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
                  setSearchField(e.target.value as MemberSearchField)
                }
              >
                <option value="">전체</option>
                <option value="user_id">이메일</option>
                <option value="user_name">회원명</option>
                <option value="join_code">가입코드</option>
                <option value="partner_id">파트너아이디</option>
              </AdminSelect>
            </div>
          </div>
          <div className="flex gap-2">
            <AdminInput
              className="flex-1 min-w-0"
              placeholder="검색어 입력"
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
            />
            <AdminButton
              className="whitespace-nowrap shrink-0"
              onClick={() =>
                setAppliedFilters({
                  memberType: memberTypeFilter,
                  sortBy,
                  sortOrder,
                  searchField,
                  searchTerm: searchTermInput,
                })
              }
            >
              <Search className="w-4 h-4" />
              검색
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard
        title={`회원 목록`}
        action={
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              조회 {filteredMembers.length}명
            </span>
            {selectedMembers.length > 0 && (
              <span className="text-xs text-gray-500">
                선택 {selectedMembers.length}명
              </span>
            )}
          </div>
        }
      >
        <AdminTable
          containerClassName="w-full"
          tableClassName="w-full table-fixed text-xs"
          headerCellClassName="px-3 py-3 text-[11px] whitespace-nowrap"
          columnClassNames={memberTableHeaderColumnClasses}
          headers={[
            <input
              key="check"
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-yellow-500"
            />,
            "아이디",
            "일반잔고",
            "선물잔고",
            "스테이킹",
            "가입일/최근활동",
            "가입코드",
            "총입금",
            "총출금",
          ]}
        >
          {isLoading ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminLoadingSpinner message="회원 목록을 불러오는 중..." />
              </AdminTableCell>
            </AdminTableRow>
          ) : loadError ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminErrorState message={loadError} onRetry={refreshMembers} />
              </AdminTableCell>
            </AdminTableRow>
          ) : filteredMembers.length === 0 ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminEmptyState message="등록된 회원이 없습니다." />
              </AdminTableCell>
            </AdminTableRow>
          ) : (
            filteredMembers.map((member) => (
              <AdminTableRow key={member.id}>
                <AdminTableCell
                  className={`${memberTableColumns.select} px-3 py-3 align-middle whitespace-nowrap`}
                >
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(member.id)}
                    onChange={() => toggleSelectMember(member.id)}
                    className="w-4 h-4 accent-yellow-500"
                  />
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.identity} px-3 py-3 align-middle whitespace-nowrap cursor-pointer hover:bg-white/5 transition-colors`}
                  onClick={() => openMemberDetail(member)}
                >
                  <div className="flex flex-col gap-1">
                    <div className="truncate font-medium text-gray-200">
                      {member.email}
                    </div>
                    <div className="truncate text-[11px] text-gray-400">
                      {member.name}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.balance} px-3 py-3 align-middle whitespace-nowrap`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="font-medium text-emerald-400 tabular-nums">
                      {formatUsdt(member.balance, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {formatKrw(member.balance_krw)}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.futures} px-3 py-3 align-middle whitespace-nowrap`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="font-medium text-yellow-400 tabular-nums">
                      {formatUsdt(member.futuresBalance, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {formatKrw(Math.round(member.futuresBalance * 1415))}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.staking} px-3 py-3 align-middle whitespace-nowrap`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="font-medium text-blue-400 tabular-nums">
                      {formatUsdt(member.stakingBalance, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {formatKrw(Math.round(member.stakingBalance * 1415))}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.activity} px-3 py-3 align-middle whitespace-nowrap`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="text-gray-300 tabular-nums">
                      {member.joinDate}
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {member.lastLoginDate}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.joinCode} px-3 py-3 align-middle whitespace-nowrap font-mono text-[11px] text-gray-300`}
                >
                  {member.joinCode}
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.deposit} px-3 py-3 align-middle whitespace-nowrap`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="font-medium tabular-nums">
                      {formatUsdt(member.totalDeposit)}
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {formatKrw(member.totalDeposit_krw)}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell
                  className={`${memberTableColumns.withdraw} px-3 py-3 align-middle whitespace-nowrap`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="font-medium tabular-nums">
                      {formatUsdt(member.totalWithdraw)}
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {formatKrw(member.totalWithdraw_krw)}
                    </div>
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTable>
      </AdminCard>

      <AdminModal
        isOpen={!!selectedMember}
        onClose={handleCloseModal}
        title={`회원정보 수정 - ${selectedMember?.email || ""}`}
      >
        {selectedMember && (
          <div className="space-y-4">
            <AdminTabs
              tabs={[
                { id: "info", label: "개인정보" },
                { id: "futures", label: "선물거래 내역" },
                { id: "staking", label: "스테이킹 내역" },
                { id: "deposit_withdraw", label: "입출금 내역" },
                { id: "login_history", label: "로그인 내역" },
              ]}
              activeTab={activeModalTab}
              onChange={setActiveModalTab}
            />

            {!memberDetailLoaded && activeModalTab !== "info" && (
              <AdminLoadingSpinner message="상세 데이터를 불러오는 중..." />
            )}

            {activeModalTab === "info" && (
              <div className="space-y-5">
                {/* 3-Wallet Cards — 균일한 높이 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-surface border border-emerald-500/20 rounded-lg p-3 flex flex-col justify-between min-h-30">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] text-gray-400">일반 잔고</div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setBalanceAdjust({ type: "add" });
                            setAdjustAmount("");
                            setAdjustMemo("");
                          }}
                          className="w-5 h-5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded flex items-center justify-center"
                          title="잔고 증가"
                        >
                          <Plus size={10} />
                        </button>
                        <button
                          onClick={() => {
                            setBalanceAdjust({ type: "subtract" });
                            setAdjustAmount("");
                            setAdjustMemo("");
                          }}
                          className="w-5 h-5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded flex items-center justify-center"
                          title="잔고 차감"
                        >
                          <Minus size={10} />
                        </button>
                      </div>
                    </div>
                    <div className="text-base font-bold text-emerald-400 tabular-nums">
                      {formatUsdt(selectedMember.balance, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-auto pt-1">
                      사용가능:{" "}
                      {formatUsdt(selectedMember.availableBalance, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="bg-surface border border-yellow-500/20 rounded-lg p-3 flex flex-col justify-between min-h-30">
                    <div className="text-[11px] text-gray-400 mb-1">
                      선물 잔고
                    </div>
                    <div className="text-base font-bold text-yellow-400 tabular-nums">
                      {formatUsdt(displayFuturesBalance, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-auto pt-1 space-y-0.5">
                      <div>
                        포지션 {openPositions.length}건 · 증거금{" "}
                        {formatUsdt(displayFuturesBalance, {
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div>
                        미실현 손익:{" "}
                        {formatUsdt(openFuturesPnl, {
                          maximumFractionDigits: 2,
                          signed: true,
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="bg-surface border border-blue-500/20 rounded-lg p-3 flex flex-col justify-between min-h-30">
                    <div className="text-[11px] text-gray-400 mb-1">
                      스테이킹 잔고
                    </div>
                    <div className="text-base font-bold text-blue-400 tabular-nums">
                      {formatUsdt(displayStakingBalance, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-auto pt-1">
                      예치잠금:{" "}
                      {formatUsdt(displayStakingBalance, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>

                {/* Summary Info — 3열 key:value 그리드 */}
                <div className="bg-surface rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">가입일</span>
                      <span className="font-medium text-white">
                        {selectedMember.joinDate}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">최근 로그인</span>
                      <span className="font-medium text-white">
                        {displayLastLoginDate}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">회원 상태</span>
                      <span
                        className={`font-medium ${selectedMember.status === "정상" ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {selectedMember.status}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">총 거래수</span>
                      <span className="font-medium text-white">
                        {displayTotalTrades}건
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">총 입금</span>
                      <span className="font-medium text-emerald-400">
                        {formatUsdt(displayTotalDeposit)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">총 출금</span>
                      <span className="font-medium text-red-400">
                        {formatUsdt(displayTotalWithdraw)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">총 투입금</span>
                      <span className="font-medium text-yellow-400">
                        {formatUsdt(displayTotalInvest)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-gray-500">수익금</span>
                      <span
                        className={`font-medium ${displayTotalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {formatUsdt(displayTotalProfit, { signed: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 기본 정보 */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">
                    기본 정보
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        전화번호
                      </label>
                      <AdminInput
                        defaultValue={selectedMember.phone}
                        className="w-full"
                        id="edit-phone"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        가입코드
                      </label>
                      <AdminSelect
                        className="w-full"
                        value={editJoinCode}
                        onChange={(e) => setEditJoinCode(e.target.value)}
                      >
                        <option value="DIRECT">직접가입 (DIRECT)</option>
                        {partnerCodes.map((pc) => (
                          <option key={pc.code} value={pc.code}>
                            {pc.code} ({pc.name})
                          </option>
                        ))}
                      </AdminSelect>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        회원상태
                      </label>
                      <AdminSelect
                        className="w-full"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                      >
                        <option value="정상">정상</option>
                        <option value="정지">정지</option>
                      </AdminSelect>
                    </div>
                  </div>
                  {/* 은행 정보 */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        은행
                      </label>
                      <AdminInput
                        defaultValue={selectedMember.bankName}
                        className="w-full"
                        id="edit-bankName"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        계좌번호
                      </label>
                      <AdminInput
                        defaultValue={selectedMember.bankAccount}
                        className="w-full"
                        id="edit-bankAccount"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        예금주
                      </label>
                      <AdminInput
                        defaultValue={selectedMember.bankAccountHolder}
                        className="w-full"
                        id="edit-bankAccountHolder"
                      />
                    </div>
                  </div>

                  {/* IP 정보 */}
                  <AdminConnectionInfoFields
                    joinIp={displayJoinIp}
                    lastLoginIp={displayLastLoginIp}
                    className="mt-4"
                  />

                  {/* 진행중 포지션/스테이킹 요약 */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-surface border border-gray-800 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">
                        진행중 선물 포지션
                      </div>
                      <div className="text-sm text-white font-bold">
                        {openPositions.length}건
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {openPositions.length > 0
                          ? `${openPositions.length}건 진행중`
                          : "진행중인 포지션 없음"}
                      </div>
                    </div>
                    <div className="bg-surface border border-gray-800 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">
                        진행중 스테이킹
                      </div>
                      <div className="text-sm text-white font-bold">
                        {displayStakingCount}건
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {displayStakingCount > 0
                          ? `${displayStakingCount}건 진행중`
                          : "진행중인 스테이킹 없음"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs text-gray-300 mb-1">
                      메모
                    </label>
                    <textarea
                      defaultValue={selectedMember.memo}
                      rows={3}
                      className="w-full px-3 py-2 bg-surface border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors resize-none"
                      placeholder="관리자 메모"
                    />
                  </div>
                </div>

                {/* 비밀번호 변경 */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">
                    비밀번호 변경
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        새 비밀번호
                      </label>
                      <AdminInput
                        type="password"
                        className="w-full"
                        placeholder="변경시에만 입력"
                        id="edit-password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        비밀번호 확인
                      </label>
                      <AdminInput
                        type="password"
                        className="w-full"
                        placeholder="변경시에만 입력"
                        id="edit-password-confirm"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="border-t border-gray-800 pt-4 flex justify-end gap-2">
                  <AdminButton variant="secondary" onClick={handleCloseModal}>
                    취소
                  </AdminButton>
                  <AdminButton
                    onClick={async () => {
                      const statusMap: Record<string, string> = {
                        정상: "active",
                        정지: "suspended",
                      };
                      const phone =
                        (
                          document.getElementById(
                            "edit-phone",
                          ) as HTMLInputElement
                        )?.value || "";
                      const joinCode = editJoinCode;
                      const status = editStatus;
                      const bankName =
                        (
                          document.getElementById(
                            "edit-bankName",
                          ) as HTMLInputElement
                        )?.value || "";
                      const bankAccount =
                        (
                          document.getElementById(
                            "edit-bankAccount",
                          ) as HTMLInputElement
                        )?.value || "";
                      const bankAccountHolder =
                        (
                          document.getElementById(
                            "edit-bankAccountHolder",
                          ) as HTMLInputElement
                        )?.value || "";
                      const memo =
                        (
                          document.querySelector(
                            "textarea[placeholder='관리자 메모']",
                          ) as HTMLTextAreaElement
                        )?.value || "";
                      const newPassword =
                        (
                          document.getElementById(
                            "edit-password",
                          ) as HTMLInputElement
                        )?.value || "";
                      const confirmPassword =
                        (
                          document.getElementById(
                            "edit-password-confirm",
                          ) as HTMLInputElement
                        )?.value || "";
                      if (newPassword || confirmPassword) {
                        if (newPassword !== confirmPassword) {
                          addToast({
                            title: "비밀번호 확인 불일치",
                            message: "비밀번호 확인이 일치하지 않습니다.",
                            type: "warning",
                          });
                          return;
                        }
                        const passwordResult = await updateUserPassword(
                          selectedMember.visibleId,
                          newPassword,
                        );
                        if (passwordResult?.error) {
                          addToast({
                            title: "비밀번호 변경 실패",
                            message: String(passwordResult.error),
                            type: "error",
                          });
                          return;
                        }
                      }
                      const { error } = await supabase
                        .from("user_profiles")
                        .update({
                          phone,
                          referral_code_used:
                            joinCode === "DIRECT" ? null : joinCode,
                          status: statusMap[status] || "active",
                          bank_name: bankName,
                          bank_account: bankAccount,
                          bank_account_holder: bankAccountHolder,
                          admin_memo: memo,
                        })
                        .eq("id", selectedMember.visibleId);
                      if (error) {
                        addToast({
                          title: "회원 정보 저장 실패",
                          message: error.message,
                          type: "error",
                        });
                        return;
                      }
                      addToast({
                        title: "회원 정보 저장 완료",
                        message: "회원 정보가 성공적으로 수정되었습니다.",
                        type: "success",
                      });
                      handleCloseModal();
                      await refreshMembers();
                    }}
                  >
                    저장
                  </AdminButton>
                </div>
              </div>
            )}

            {activeModalTab === "futures" && (
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-yellow-500">
                  진행중 포지션 ({openPositions.length}건)
                </h4>
                <AdminTable
                  bodyClassName="[&_td]:text-center"
                  headerCellClassName="text-center"
                  headers={[
                    "시간",
                    "심볼",
                    "포지션",
                    "레버리지",
                    "증거금",
                    "손익",
                    "상태",
                  ]}
                >
                  {openPositions.map((p: any) => {
                    const livePnl = getLivePositionPnl(p);

                    return (
                      <AdminTableRow
                        key={p.id}
                        className="cursor-pointer hover:bg-white/5"
                        onClick={() =>
                          setSelectedTradeDetail({
                            id: String(p.id),
                            date: formatDateTime(p.opened_at),
                            email: selectedMember?.email || "-",
                            symbol: p.symbol,
                            type: p.direction === "long" ? "롱" : "숏",
                            userId: p.user_id,
                            openedAt: p.opened_at,
                            marginMode:
                              p.margin_mode === "isolated"
                                ? "isolated"
                                : "cross",
                            margin: Number(p.margin),
                            leverage: `${p.leverage}x`,
                            entryPrice: Number(p.entry_price) || 0,
                            size: Number(p.size) || 0,
                            pnl: livePnl,
                            fee: Number(p.fee) || 0,
                            status: "진행중",
                          })
                        }
                      >
                        <AdminTableCell className="text-center text-xs">
                          {formatDateTime(p.opened_at)}
                        </AdminTableCell>
                        <AdminTableCell className="text-center text-xs font-medium">
                          {p.symbol}
                        </AdminTableCell>
                        <AdminTableCell className="text-center">
                          <span
                            className={`text-xs ${p.direction === "long" ? "text-green-500" : "text-red-500"}`}
                          >
                            {p.direction === "long" ? "Long" : "Short"}
                          </span>
                        </AdminTableCell>
                        <AdminTableCell className="text-center text-xs text-yellow-500">
                          {p.leverage}x
                        </AdminTableCell>
                        <AdminTableCell className="text-center text-xs">
                          {formatUsdt(Number(p.margin))}
                        </AdminTableCell>
                        <AdminTableCell
                          className={`text-center text-xs ${livePnl >= 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          {formatUsdt(livePnl, {
                            signed: true,
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2,
                          })}
                        </AdminTableCell>
                        <AdminTableCell className="text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                            진행중
                          </span>
                        </AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                  {openPositions.length === 0 && (
                    <AdminTableRow>
                      <AdminTableCell
                        colSpan={7}
                        className="text-center text-gray-500 text-xs py-4"
                      >
                        진행중인 포지션이 없습니다.
                      </AdminTableCell>
                    </AdminTableRow>
                  )}
                </AdminTable>
                <h4 className="text-xs font-medium text-gray-400 mt-4">
                  종료된 포지션 ({closedPositions.length}건)
                </h4>
                <AdminTable
                  bodyClassName="[&_td]:text-center"
                  headerCellClassName="text-center"
                  headers={[
                    "시간",
                    "심볼",
                    "포지션",
                    "레버리지",
                    "증거금",
                    "손익",
                    "상태",
                  ]}
                >
                  {closedPositions.map((p: any) => (
                    <AdminTableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-white/5"
                      onClick={() =>
                        setSelectedTradeDetail({
                          id: String(p.id),
                          date: formatDateTime(p.opened_at),
                          email: selectedMember?.email || "-",
                          symbol: p.symbol,
                          type: p.direction === "long" ? "롱" : "숏",
                          userId: p.user_id,
                          openedAt: p.opened_at,
                          marginMode:
                            p.margin_mode === "isolated" ? "isolated" : "cross",
                          margin: Number(p.margin),
                          leverage: `${p.leverage}x`,
                          entryPrice: Number(p.entry_price) || 0,
                          size: Number(p.size) || 0,
                          pnl: Number(p.pnl) || 0,
                          fee: Number(p.fee) || 0,
                          status:
                            p.status === "liquidated" ? "강제청산" : "종료",
                        })
                      }
                    >
                      <AdminTableCell className="text-center text-xs">
                        {formatDateTime(p.opened_at)}
                      </AdminTableCell>
                      <AdminTableCell className="text-center text-xs">
                        {p.symbol}
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <span
                          className={`text-xs ${p.direction === "long" ? "text-green-500" : "text-red-500"}`}
                        >
                          {p.direction === "long" ? "Long" : "Short"}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell className="text-center text-xs">
                        {p.leverage}x
                      </AdminTableCell>
                      <AdminTableCell className="text-center text-xs">
                        {formatUsdt(Number(p.margin))}
                      </AdminTableCell>
                      <AdminTableCell
                        className={`text-center text-xs ${Number(p.pnl) >= 0 ? "text-green-500" : "text-red-500"}`}
                      >
                        {formatUsdt(Number(p.pnl), {
                          signed: true,
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2,
                        })}
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded ${p.status === "liquidated" ? "bg-red-500/10 text-red-400" : "bg-gray-500/10 text-gray-300"}`}
                        >
                          {p.status === "liquidated" ? "청산" : "종료"}
                        </span>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                  {closedPositions.length === 0 && (
                    <AdminTableRow>
                      <AdminTableCell
                        colSpan={7}
                        className="text-center text-gray-500 text-xs py-4"
                      >
                        종료된 포지션이 없습니다.
                      </AdminTableCell>
                    </AdminTableRow>
                  )}
                </AdminTable>
                <div className="flex justify-end pt-2">
                  <AdminButton variant="secondary" onClick={handleCloseModal}>
                    닫기
                  </AdminButton>
                </div>
              </div>
            )}

            {activeModalTab === "staking" && (
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-yellow-500">
                  진행중 스테이킹 (
                  {
                    memberStakings.filter((s: any) => s.status === "active")
                      .length
                  }
                  건)
                </h4>
                <AdminTable
                  bodyClassName="[&_td]:text-center"
                  headerCellClassName="text-center"
                  headers={[
                    "상품명",
                    "금액",
                    "시작일",
                    "종료일",
                    "수익",
                    "잔여일",
                    "상태",
                  ]}
                >
                  {memberStakings
                    .filter((s: any) => s.status === "active")
                    .map((s: any) => {
                      const prod = s.staking_products || {};
                      const daysLeft = Math.max(
                        0,
                        Math.ceil(
                          (new Date(s.ends_at).getTime() - Date.now()) /
                            86400000,
                        ),
                      );
                      return (
                        <AdminTableRow key={s.id}>
                          <AdminTableCell className="text-xs">
                            {prod.name || "USDT 예치"}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {formatUsdt(Number(s.amount))}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {new Date(s.started_at).toISOString().split("T")[0]}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {new Date(s.ends_at).toISOString().split("T")[0]}
                          </AdminTableCell>
                          <AdminTableCell className="text-yellow-500 text-xs">
                            {formatUsdt(Number(s.total_earned), {
                              signed: true,
                              maximumFractionDigits: 4,
                              minimumFractionDigits: 4,
                            })}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {daysLeft}일
                          </AdminTableCell>
                          <AdminTableCell>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                              진행중
                            </span>
                          </AdminTableCell>
                        </AdminTableRow>
                      );
                    })}
                  {memberStakings.filter((s: any) => s.status === "active")
                    .length === 0 && (
                    <AdminTableRow>
                      <AdminTableCell
                        colSpan={7}
                        className="text-center text-gray-500 text-xs py-4"
                      >
                        진행중인 스테이킹이 없습니다.
                      </AdminTableCell>
                    </AdminTableRow>
                  )}
                </AdminTable>
                <h4 className="text-xs font-medium text-gray-400 mt-4">
                  종료/취소된 스테이킹 (
                  {
                    memberStakings.filter((s: any) => s.status !== "active")
                      .length
                  }
                  건)
                </h4>
                <AdminTable
                  bodyClassName="[&_td]:text-center"
                  headerCellClassName="text-center"
                  headers={[
                    "상품명",
                    "금액",
                    "시작일",
                    "종료일",
                    "수익",
                    "상태",
                  ]}
                >
                  {memberStakings
                    .filter((s: any) => s.status !== "active")
                    .map((s: any) => {
                      const prod = s.staking_products || {};
                      const statusLabel =
                        s.status === "completed" ? "만기완료" : "취소";
                      const statusColor =
                        s.status === "completed"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400";
                      return (
                        <AdminTableRow key={s.id}>
                          <AdminTableCell className="text-xs">
                            {prod.name || "USDT 예치"}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {formatUsdt(Number(s.amount))}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {new Date(s.started_at).toISOString().split("T")[0]}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {s.completed_at
                              ? new Date(s.completed_at)
                                  .toISOString()
                                  .split("T")[0]
                              : "-"}
                          </AdminTableCell>
                          <AdminTableCell className="text-green-400 text-xs">
                            {formatUsdt(Number(s.total_earned), {
                              signed: true,
                              maximumFractionDigits: 4,
                              minimumFractionDigits: 4,
                            })}
                          </AdminTableCell>
                          <AdminTableCell>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded ${statusColor}`}
                            >
                              {statusLabel}
                            </span>
                          </AdminTableCell>
                        </AdminTableRow>
                      );
                    })}
                  {memberStakings.filter((s: any) => s.status !== "active")
                    .length === 0 && (
                    <AdminTableRow>
                      <AdminTableCell
                        colSpan={6}
                        className="text-center text-gray-500 text-xs py-4"
                      >
                        종료된 스테이킹이 없습니다.
                      </AdminTableCell>
                    </AdminTableRow>
                  )}
                </AdminTable>
                <div className="flex justify-end pt-2">
                  <AdminButton variant="secondary" onClick={handleCloseModal}>
                    닫기
                  </AdminButton>
                </div>
              </div>
            )}

            {activeModalTab === "deposit_withdraw" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-emerald-500/20 bg-[#0d1117] p-3 text-center">
                    <div className="text-[10px] text-gray-500">총 입금</div>
                    <div className="mt-1 text-sm font-semibold text-emerald-400">
                      {formatUsdt(displayTotalDeposit)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-red-500/20 bg-[#0d1117] p-3 text-center">
                    <div className="text-[10px] text-gray-500">총 출금</div>
                    <div className="mt-1 text-sm font-semibold text-red-400">
                      {formatUsdt(displayTotalWithdraw)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-yellow-500/20 bg-[#0d1117] p-3 text-center">
                    <div className="text-[10px] text-gray-500">총투입금</div>
                    <div className="mt-1 text-sm font-semibold text-yellow-400">
                      {formatUsdt(displayTotalInvest)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-500/20 bg-[#0d1117] p-3 text-center">
                    <div className="text-[10px] text-gray-500">수익금</div>
                    <div
                      className={`mt-1 text-sm font-semibold ${displayTotalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {formatUsdt(displayTotalProfit, { signed: true })}
                    </div>
                  </div>
                </div>
                <AdminTable
                  bodyClassName="[&_td]:text-center"
                  headerCellClassName="text-center"
                  headers={[
                    "시간",
                    "구분",
                    "금액",
                    "은행/계좌",
                    "상태",
                    "사유",
                  ]}
                >
                  {[
                    ...memberDeposits.map((d: any) => ({
                      ...d,
                      _type: "deposit",
                    })),
                    ...memberWithdrawals.map((w: any) => ({
                      ...w,
                      _type: "withdrawal",
                    })),
                  ]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                    )
                    .map((item: any) => {
                      const isDeposit = item._type === "deposit";
                      const statusMap: Record<string, string> = {
                        pending: "대기중",
                        approved: "완료",
                        rejected: "거절",
                      };
                      const statusColor =
                        item.status === "approved"
                          ? "text-emerald-500"
                          : item.status === "rejected"
                            ? "text-red-400"
                            : "text-yellow-400";
                      return (
                        <AdminTableRow key={`${item._type}-${item.id}`}>
                          <AdminTableCell className="text-xs">
                            {formatDateTime(item.created_at)}
                          </AdminTableCell>
                          <AdminTableCell>
                            <span
                              className={`font-medium text-xs ${isDeposit ? "text-green-400" : "text-red-400"}`}
                            >
                              {isDeposit ? "입금" : "출금"}
                            </span>
                          </AdminTableCell>
                          <AdminTableCell className="text-xs">
                            {formatUsdt(Number(item.amount))}
                          </AdminTableCell>
                          <AdminTableCell className="text-xs text-gray-400">
                            {item.bank || item.bank_name || "-"}{" "}
                            {item.account_number || ""}
                          </AdminTableCell>
                          <AdminTableCell>
                            <span className={`text-xs ${statusColor}`}>
                              {statusMap[item.status] || item.status}
                            </span>
                          </AdminTableCell>
                          <AdminTableCell className="text-xs text-gray-500">
                            {item.reject_reason || item.depositor_name || "-"}
                          </AdminTableCell>
                        </AdminTableRow>
                      );
                    })}
                  {memberDeposits.length === 0 &&
                    memberWithdrawals.length === 0 && (
                      <AdminTableRow>
                        <AdminTableCell
                          colSpan={6}
                          className="text-center text-gray-500 text-xs py-4"
                        >
                          입출금 내역이 없습니다.
                        </AdminTableCell>
                      </AdminTableRow>
                    )}
                </AdminTable>
                <div className="flex justify-end pt-2">
                  <AdminButton variant="secondary" onClick={handleCloseModal}>
                    닫기
                  </AdminButton>
                </div>
              </div>
            )}

            {activeModalTab === "login_history" && (
              <div className="space-y-4">
                <AdminTable
                  bodyClassName="[&_td]:text-center"
                  headerCellClassName="text-center"
                  headers={["로그인 시간", "IP 주소", "기기/브라우저", "결과"]}
                >
                  {memberLoginLogs.map((log: any) => {
                    const ua = log.user_agent || "-";
                    return (
                      <AdminTableRow key={log.id}>
                        <AdminTableCell className="text-xs">
                          {formatDateTime(log.login_at)}
                        </AdminTableCell>
                        <AdminTableCell className="text-xs">
                          {toDisplayIp(log.ip_address)}
                        </AdminTableCell>
                        <AdminTableCell className="text-xs">
                          {getLoginDevice(ua)} / {getLoginBrowser(ua)}
                        </AdminTableCell>
                        <AdminTableCell className="text-center">
                          {isSuccessfulLoginLog(log) ? (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <span className="text-emerald-500 text-xs">
                                성공
                              </span>
                              {latestSuccessfulLoginLog?.id === log.id && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                                  최신 성공
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-rose-500 text-xs">
                              실패 ({log.failure_reason || "인증 오류"})
                            </span>
                          )}
                        </AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                  {memberLoginLogs.length === 0 && (
                    <AdminTableRow>
                      <AdminTableCell
                        colSpan={4}
                        className="text-center text-gray-500 text-xs py-4"
                      >
                        로그인 내역이 없습니다.
                      </AdminTableCell>
                    </AdminTableRow>
                  )}
                </AdminTable>
                <div className="flex justify-end pt-2">
                  <AdminButton variant="secondary" onClick={handleCloseModal}>
                    닫기
                  </AdminButton>
                </div>
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* Task 1: 스테이킹 강제취소 확인 모달 */}
      {stakingCancelTarget && selectedMember && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-elevated border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-bold text-white">
                스테이킹 강제취소
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertTriangle className="text-red-500 shrink-0" size={20} />
                <p className="text-xs text-red-400">
                  강제취소 시 현재까지 누적된 수익은 지급되지 않으며, 원금만
                  반환됩니다.
                </p>
              </div>
              <div className="bg-surface rounded-lg p-3 space-y-2 text-xs">
                {[
                  ["회원", selectedMember.name],
                  ["상품", stakingCancelTarget.product],
                  ["금액", stakingCancelTarget.amount],
                  [
                    "기간",
                    `${stakingCancelTarget.startDate} ~ ${stakingCancelTarget.endDate}`,
                  ],
                  ["현재수익", stakingCancelTarget.reward],
                  [
                    "잔여일",
                    stakingCancelTarget.daysLeft > 0
                      ? `${stakingCancelTarget.daysLeft}일`
                      : "자유",
                  ],
                ].map(([l, v]: any) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-gray-400">{l}</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">
                  취소 사유
                </label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 bg-surface border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-yellow-500 resize-none"
                  placeholder="강제취소 사유를 입력하세요"
                />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setStakingCancelTarget(null)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={() => {
                  addToast({
                    title: "스테이킹 강제취소 완료",
                    message: `${selectedMember.name}님의 ${stakingCancelTarget.product} 스테이킹이 강제취소 처리되었습니다.`,
                    type: "success",
                  });
                  setStakingCancelTarget(null);
                }}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm"
              >
                강제취소 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task 1: 스테이킹 결과처리 모달 */}
      {stakingSettleTarget && selectedMember && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-elevated border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-bold text-white">
                개별 결과처리 — {selectedMember.name}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-surface rounded-lg p-3 space-y-2 text-xs">
                {[
                  ["상품", stakingSettleTarget.product],
                  ["금액", stakingSettleTarget.amount],
                  [
                    "기간",
                    `${stakingSettleTarget.startDate} ~ ${stakingSettleTarget.endDate}`,
                  ],
                ].map(([l, v]: any) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-gray-400">{l}</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  적용 이율 (%){" "}
                  <span className="text-orange-400 ml-1">
                    마이너스 입력 가능
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={stakingSettleRate}
                  onChange={(e) => setStakingSettleRate(e.target.value)}
                  placeholder="예: -3.5 또는 8.2"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setStakingSettleTarget(null)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={() => {
                  addToast({
                    title: "스테이킹 결과처리 완료",
                    message: `${selectedMember.name}님의 ${stakingSettleTarget.product} 결과처리 완료: ${stakingSettleRate}%`,
                    type: "success",
                  });
                  setStakingSettleTarget(null);
                }}
                className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm"
              >
                결과 확정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task 2: 일반잔고 증감 모달 */}
      {balanceAdjust && selectedMember && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-elevated border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-bold text-white">
                일반잔고 {balanceAdjust.type === "add" ? "증가" : "차감"} —{" "}
                {selectedMember.name}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-surface rounded-lg p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">현재 일반잔고</span>
                  <span className="text-emerald-400 font-bold">
                    {formatUsdt(selectedMember.balance, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {balanceAdjust.type === "add" ? "증가" : "차감"} 금액 (USDT)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || Number(val) >= 0) setAdjustAmount(val);
                  }}
                  placeholder="금액 입력"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
                {adjustAmount && Number(adjustAmount) <= 0 && (
                  <p className="text-red-400 text-[11px] mt-1">
                    0보다 큰 금액을 입력해주세요.
                  </p>
                )}
                {balanceAdjust.type === "subtract" &&
                  Number(adjustAmount) > selectedMember.balance && (
                    <p className="text-red-400 text-[11px] mt-1">
                      현재 잔고보다 큰 금액은 차감할 수 없습니다.
                    </p>
                  )}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">사유</label>
                <input
                  value={adjustMemo}
                  onChange={(e) => setAdjustMemo(e.target.value)}
                  placeholder="잔고 변경 사유 입력"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              {adjustAmount && (
                <div className="bg-surface rounded-lg p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">변경 후 잔고</span>
                    <span
                      className={
                        balanceAdjust.type === "add"
                          ? "text-emerald-400 font-bold"
                          : "text-red-400 font-bold"
                      }
                    >
                      {formatUsdt(
                        selectedMember.balance +
                          (balanceAdjust.type === "add" ? 1 : -1) *
                            Number(adjustAmount),
                        {
                          maximumFractionDigits: 2,
                        },
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setBalanceAdjust(null)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                disabled={
                  !adjustAmount ||
                  Number(adjustAmount) <= 0 ||
                  (balanceAdjust.type === "subtract" &&
                    Number(adjustAmount) > selectedMember.balance)
                }
                onClick={async () => {
                  const amt = Number(adjustAmount);
                  if (!amt || amt <= 0) return;
                  if (
                    balanceAdjust.type === "subtract" &&
                    amt > selectedMember.balance
                  )
                    return;
                  const finalAmt = balanceAdjust.type === "add" ? amt : -amt;
                  try {
                    await adjustAdminMemberBalance(
                      selectedMember.visibleId,
                      finalAmt,
                      adjustMemo || "admin_adjustment",
                    );
                    setBalanceAdjust(null);
                    await refreshMembers();
                  } catch (err) {
                    addToast({
                      title: "잔액 조정 실패",
                      message:
                        err instanceof Error
                          ? err.message
                          : "잔액 조정에 실패했습니다.",
                      type: "error",
                    });
                  }
                }}
                className={`px-6 py-2 ${balanceAdjust.type === "add" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"} text-white font-bold rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {balanceAdjust.type === "add" ? "증가 확인" : "차감 확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminTradeDetailModal
        trade={effectiveSelectedTradeDetail}
        onClose={() => setSelectedTradeDetail(null)}
        onForceClose={(trade) => {
          setForceCloseTarget({
            id: String(trade.id),
            symbol: trade.symbol,
            direction: trade.type === "롱" ? "long" : "short",
            marginMode: trade.marginMode,
            leverage: trade.leverage,
            margin: trade.margin,
            entryPrice: trade.entryPrice,
            size: trade.size,
            pnl: trade.pnl,
            fee: trade.fee,
            status: "open",
            email: trade.email,
            date: trade.date,
            userId: trade.userId,
            openedAt: trade.openedAt,
          });
          setSelectedTradeDetail(null);
        }}
      />

      <AdminForceCloseModal
        position={forceCloseTarget}
        onClose={() => setForceCloseTarget(null)}
        onSuccess={async () => {
          if (selectedMember) {
            await openMemberDetail(selectedMember);
          }
          await refreshMembers();
        }}
      />
    </div>
  );
}
