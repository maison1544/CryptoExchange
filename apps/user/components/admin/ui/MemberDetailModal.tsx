"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { AlertTriangle, Plus, Minus } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import {
  getEarliestSuccessfulLoginLog,
  getLatestSuccessfulLoginLog,
  getLoginBrowser,
  getLoginDevice,
  isSuccessfulLoginLog,
  pickFirstMeaningful,
} from "@/lib/utils/loginMetadata";
import { formatDate, formatDateTime } from "@/lib/utils/formatDate";
import { toDisplayIp } from "@/lib/utils/ip";
import { formatUsdt } from "@/lib/utils/numberFormat";
import {
  isSameMarkPriceMap,
  loadAdminMarkPriceMap,
} from "@/lib/utils/adminMarkPrice";
import { computePositionUnrealizedPnl } from "@/lib/utils/futuresRisk";

interface MemberDetailModalProps {
  member: any;
  isOpen: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

const supabase = createClient();
type MemberDetailPayload = {
  profile: any | null;
  deposits: any[];
  withdrawals: any[];
  positions: any[];
  stakings: any[];
  loginLogs: any[];
};
type MemberDetailCacheEntry = {
  payload: MemberDetailPayload;
  updatedAt: number;
};

const memberDetailCache = new Map<string, MemberDetailCacheEntry>();
const memberDetailRequests = new Map<string, Promise<MemberDetailPayload>>();
const MEMBER_DETAIL_STALE_TIME = 30_000;

let cachedAccessToken: string | null = null;
let cachedAccessTokenAt = 0;
const ACCESS_TOKEN_TTL = 60_000;

async function getAccessToken() {
  if (
    cachedAccessToken &&
    Date.now() - cachedAccessTokenAt < ACCESS_TOKEN_TTL
  ) {
    return cachedAccessToken;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  cachedAccessToken = session?.access_token || null;
  cachedAccessTokenAt = Date.now();
  return cachedAccessToken;
}

function applyMemberDetailPayload(
  payload: MemberDetailPayload,
  apply: (payload: MemberDetailPayload) => void,
) {
  apply(payload);
}

function getCachedMemberDetail(memberId: string) {
  return memberDetailCache.get(memberId) || null;
}

async function fetchMemberDetail(memberId: string) {
  const existingRequest = memberDetailRequests.get(memberId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      throw new Error("Missing auth token");
    }

    const response = await fetch(`/api/member-detail/${memberId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error || "회원 상세 정보를 불러오지 못했습니다.",
      );
    }

    const nextPayload: MemberDetailPayload = {
      profile: payload?.profile || null,
      deposits: payload?.deposits || [],
      withdrawals: payload?.withdrawals || [],
      positions: payload?.positions || [],
      stakings: payload?.stakings || [],
      loginLogs: payload?.loginLogs || [],
    };

    memberDetailCache.set(memberId, {
      payload: nextPayload,
      updatedAt: Date.now(),
    });

    return nextPayload;
  })();

  memberDetailRequests.set(memberId, request);

  try {
    return await request;
  } finally {
    memberDetailRequests.delete(memberId);
  }
}

export function prefetchMemberDetail(memberId: string | null | undefined) {
  if (!memberId) return;

  const cacheKey = String(memberId);
  const cached = getCachedMemberDetail(cacheKey);
  if (cached && Date.now() - cached.updatedAt < MEMBER_DETAIL_STALE_TIME) {
    return;
  }

  void fetchMemberDetail(cacheKey).catch(() => null);
}

export function MemberDetailModal({
  member,
  isOpen,
  onClose,
  readOnly = false,
}: MemberDetailModalProps) {
  const { addToast } = useNotification();
  const [activeTab, setActiveTab] = useState("info");
  const [stakingDropdown, setStakingDropdown] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [settleTarget, setSettleTarget] = useState<any | null>(null);
  const [settleRate, setSettleRate] = useState("");
  const [balanceAdjust, setBalanceAdjust] = useState<{
    type: "add" | "subtract";
  } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustMemo, setAdjustMemo] = useState("");
  const [memberProfile, setMemberProfile] = useState<any | null>(null);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [memberDeposits, setMemberDeposits] = useState<any[]>([]);
  const [memberWithdrawals, setMemberWithdrawals] = useState<any[]>([]);
  const [memberPositions, setMemberPositions] = useState<any[]>([]);
  const [memberStakings, setMemberStakings] = useState<any[]>([]);
  const [memberLoginLogs, setMemberLoginLogs] = useState<any[]>([]);
  const [markPriceBySymbol, setMarkPriceBySymbol] = useState<
    Record<string, number>
  >({});
  const sourceMember = member || {};
  const memberId = sourceMember.visibleId || sourceMember.id;
  const memberEmail = sourceMember.email || "";
  const memberName = sourceMember.name || "-";

  useEffect(() => {
    if (!isOpen || !memberId) return;

    let cancelled = false;
    const cacheKey = String(memberId);
    const cached = getCachedMemberDetail(cacheKey);
    const hasFreshCache =
      cached !== null &&
      Date.now() - cached.updatedAt < MEMBER_DETAIL_STALE_TIME;

    setIsDetailLoading(!cached);

    if (cached) {
      applyMemberDetailPayload(cached.payload, (payload) => {
        setMemberProfile(payload.profile);
        setMemberDeposits(payload.deposits);
        setMemberWithdrawals(payload.withdrawals);
        setMemberPositions(payload.positions);
        setMemberStakings(payload.stakings);
        setMemberLoginLogs(payload.loginLogs);
      });
      setDetailLoaded(true);
    } else {
      setDetailLoaded(false);
      setMemberProfile(null);
      setMemberDeposits([]);
      setMemberWithdrawals([]);
      setMemberPositions([]);
      setMemberStakings([]);
      setMemberLoginLogs([]);
    }

    if (hasFreshCache) {
      setIsDetailLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void fetchMemberDetail(cacheKey)
      .then((payload) => {
        if (cancelled) return;

        applyMemberDetailPayload(payload, (nextPayload) => {
          setMemberProfile(nextPayload.profile);
          setMemberDeposits(nextPayload.deposits);
          setMemberWithdrawals(nextPayload.withdrawals);
          setMemberPositions(nextPayload.positions);
          setMemberStakings(nextPayload.stakings);
          setMemberLoginLogs(nextPayload.loginLogs);
        });
        setDetailLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;

        addToast({
          title: "회원 상세 정보 조회 실패",
          message:
            error instanceof Error
              ? error.message
              : "회원 상세 정보를 불러오지 못했습니다.",
          type: "error",
        });
        setDetailLoaded(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [addToast, isOpen, memberId]);

  const effectiveProfile = memberProfile || sourceMember;
  const sourcePositions = Array.isArray(sourceMember.futuresPositions)
    ? sourceMember.futuresPositions
    : [];
  const sourceStakings = Array.isArray(sourceMember.stakingPositions)
    ? sourceMember.stakingPositions
    : [];
  const sourceDeposits = Array.isArray(sourceMember.deposits)
    ? sourceMember.deposits
    : [];
  const sourceWithdrawals = Array.isArray(sourceMember.withdrawals)
    ? sourceMember.withdrawals
    : [];
  const sourceLoginLogs = Array.isArray(sourceMember.loginHistory)
    ? sourceMember.loginHistory
    : [];
  const hasServerProfile = detailLoaded && memberProfile !== null;
  const effectivePositions =
    hasServerProfile || memberPositions.length > 0
      ? memberPositions
      : sourcePositions;
  const effectiveStakings =
    hasServerProfile || memberStakings.length > 0
      ? memberStakings
      : sourceStakings;
  const effectiveDeposits =
    hasServerProfile || memberDeposits.length > 0
      ? memberDeposits
      : sourceDeposits;
  const effectiveWithdrawals =
    hasServerProfile || memberWithdrawals.length > 0
      ? memberWithdrawals
      : sourceWithdrawals;
  const effectiveLoginLogs =
    hasServerProfile || memberLoginLogs.length > 0
      ? memberLoginLogs
      : sourceLoginLogs;
  const latestSuccessfulLoginLog = useMemo(
    () => getLatestSuccessfulLoginLog(effectiveLoginLogs),
    [effectiveLoginLogs],
  );
  const earliestSuccessfulLoginLog = useMemo(
    () => getEarliestSuccessfulLoginLog(effectiveLoginLogs),
    [effectiveLoginLogs],
  );
  const getFuturesDirection = (position: any) => {
    const raw = position.direction || position.side || "";
    return String(raw).toLowerCase() === "short" ? "short" : "long";
  };
  const getLivePositionPnl = useMemo(
    () => (position: any) => {
      const symbol = String(position.symbol || "")
        .trim()
        .toUpperCase();
      const markPrice = markPriceBySymbol[symbol];
      const entryPrice = Number(
        position.entry_price || position.entryPrice || 0,
      );
      const size = Math.abs(Number(position.size || 0));
      const direction = getFuturesDirection(position);

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
  const openFuturesPositions = useMemo(
    () =>
      effectivePositions.filter((position: any) => position.status === "open"),
    [effectivePositions],
  );
  const closedFuturesPositions = useMemo(
    () =>
      effectivePositions.filter((position: any) => position.status !== "open"),
    [effectivePositions],
  );
  const generalBalance = Number(effectiveProfile.wallet_balance || 0);
  const availableBalance = Number(
    effectiveProfile.availableBalance ??
      effectiveProfile.available_balance ??
      effectiveProfile.wallet_balance ??
      0,
  );
  const balanceHistoryRows = useMemo(
    () =>
      [
        ...effectiveDeposits.map((row: any) => ({
          ...row,
          historyType: "입금",
        })),
        ...effectiveWithdrawals.map((row: any) => ({
          ...row,
          historyType: "출금",
        })),
      ].sort((a: any, b: any) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      ),
    [effectiveDeposits, effectiveWithdrawals],
  );
  const displayStatus =
    effectiveProfile.status === "active"
      ? "정상"
      : effectiveProfile.status === "pending_approval"
        ? "대기"
        : effectiveProfile.status === "suspended"
          ? "정지"
          : effectiveProfile.status === "banned"
            ? "탈퇴"
            : pickFirstMeaningful(
                effectiveProfile.status,
                sourceMember.status,
              ) || "-";
  const joinDateValue =
    pickFirstMeaningful(
      effectiveProfile.joinDate,
      effectiveProfile.created_at,
      sourceMember.joinDate,
    ) || "-";
  const lastLoginDateValue =
    pickFirstMeaningful(
      effectiveProfile.lastLoginDate,
      effectiveProfile.last_login_at,
      latestSuccessfulLoginLog?.login_at,
      sourceMember.lastLoginDate,
      sourceMember.last_login_at,
    ) || "-";
  const joinCodeValue =
    pickFirstMeaningful(
      effectiveProfile.joinCode,
      effectiveProfile.referral_code_used,
      sourceMember.joinCode,
    ) || "-";
  const bankNameValue =
    pickFirstMeaningful(
      effectiveProfile.bankName,
      effectiveProfile.bank_name,
    ) || "-";
  const bankAccountValue =
    pickFirstMeaningful(
      effectiveProfile.bankAccount,
      effectiveProfile.bank_account,
    ) || "-";
  const bankAccountHolderValue =
    pickFirstMeaningful(
      effectiveProfile.bankAccountHolder,
      effectiveProfile.bank_account_holder,
      effectiveProfile.name,
      sourceMember.name,
    ) || "-";
  const joinIpValue =
    pickFirstMeaningful(
      effectiveProfile.joinIp,
      effectiveProfile.join_ip,
      sourceMember.registrationIP,
      sourceMember.joinIp,
      earliestSuccessfulLoginLog?.ip_address,
    ) || "-";
  const lastIpValue =
    pickFirstMeaningful(
      effectiveProfile.lastIp,
      effectiveProfile.last_login_ip,
      sourceMember.lastLoginIP,
      sourceMember.lastIp,
      latestSuccessfulLoginLog?.ip_address,
    ) || "-";
  const lastActivityValue =
    pickFirstMeaningful(
      effectiveProfile.lastActivity,
      effectiveProfile.last_activity,
      latestSuccessfulLoginLog?.login_at,
      sourceMember.lastActivity,
    ) || "-";
  const isOnlineValue =
    typeof effectiveProfile.is_online === "boolean"
      ? effectiveProfile.is_online
      : typeof sourceMember.is_online === "boolean"
        ? sourceMember.is_online
        : typeof sourceMember.isOnline === "boolean"
          ? sourceMember.isOnline
          : false;
  const activeStakings = effectiveStakings.filter(
    (staking: any) =>
      staking.status === "active" || staking.status === "진행중",
  );
  const inactiveStakings = effectiveStakings.filter(
    (staking: any) =>
      staking.status !== "active" && staking.status !== "진행중",
  );
  const activeStakingBalance = activeStakings.reduce(
    (sum: number, staking: any) => sum + Number(staking.amount || 0),
    0,
  );
  const approvedDepositTotal = effectiveDeposits.reduce(
    (sum: number, row: any) => {
      if (row.status === "approved") {
        return sum + Number(row.amount || 0);
      }
      return sum;
    },
    0,
  );
  const approvedWithdrawTotal = effectiveWithdrawals.reduce(
    (sum: number, row: any) => {
      if (row.status === "approved") {
        return sum + Number(row.amount || 0);
      }
      return sum;
    },
    0,
  );
  const futuresBalance = hasServerProfile
    ? openFuturesPositions.reduce(
        (sum: number, position: any) => sum + Number(position.margin || 0),
        0,
      )
    : Number(sourceMember.futuresBalance || 0);
  const stakingBalance = hasServerProfile
    ? activeStakingBalance
    : Number(sourceMember.stakingBalance || 0);
  const totalTradesValue = hasServerProfile
    ? effectivePositions.length
    : Number(sourceMember.totalTrades || 0);
  const totalDepositValue = hasServerProfile
    ? approvedDepositTotal
    : Number(sourceMember.totalDeposit || 0);
  const totalWithdrawValue = hasServerProfile
    ? approvedWithdrawTotal
    : Number(sourceMember.totalWithdraw || 0);
  const totalInvestValue = hasServerProfile
    ? effectivePositions.reduce(
        (sum: number, position: any) => sum + Number(position.margin || 0),
        0,
      )
    : Number(sourceMember.totalInvest || 0);
  const totalProfitValue = hasServerProfile
    ? effectivePositions.reduce((sum: number, position: any) => {
        if (position.status === "open") {
          return sum;
        }

        return sum + Number(position.pnl || 0);
      }, 0)
    : Number(sourceMember.totalProfit || 0);
  const openFuturesPnl = useMemo(
    () =>
      openFuturesPositions.reduce(
        (sum: number, position: any) => sum + getLivePositionPnl(position),
        0,
      ),
    [getLivePositionPnl, openFuturesPositions],
  );

  useEffect(() => {
    if (!isOpen || openFuturesPositions.length === 0) {
      setMarkPriceBySymbol((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      return;
    }

    const symbols = Array.from(
      new Set<string>(
        openFuturesPositions
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
  }, [isOpen, openFuturesPositions]);

  if (!member) return null;

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={() => {
        setActiveTab("info");
        onClose();
      }}
      title={`회원정보 ${readOnly ? "조회" : "수정"} - ${memberEmail}`}
    >
      <div className="space-y-4">
        {isDetailLoading && (
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-300">
            최신 회원 정보를 불러오는 중입니다.
          </div>
        )}
        <AdminTabs
          tabs={[
            { id: "info", label: "개인정보" },
            { id: "futures", label: "선물거래 내역" },
            { id: "staking", label: "스테이킹 내역" },
            { id: "deposit_withdraw", label: "입출금 내역" },
            { id: "login_history", label: "로그인 내역" },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === "info" && (
          <div className="space-y-6">
            {/* 3-Wallet Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-[#0d1117] border border-emerald-500/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] text-gray-400">일반 잔고</div>
                  {!readOnly && (
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
                  )}
                </div>
                <div className="text-sm font-bold text-emerald-400">
                  {formatUsdt(generalBalance)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  사용가능: {formatUsdt(availableBalance)}
                </div>
              </div>
              <div className="bg-[#0d1117] border border-yellow-500/20 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 mb-1">선물 잔고</div>
                <div className="text-sm font-bold text-yellow-400">
                  {formatUsdt(futuresBalance)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1 space-y-0.5">
                  <div>진행중 포지션: {openFuturesPositions.length}건</div>
                  <div>사용중 증거금: {formatUsdt(futuresBalance)}</div>
                  <div>
                    미실현 손익:{" "}
                    {formatUsdt(openFuturesPnl, {
                      signed: true,
                    })}
                  </div>
                </div>
              </div>
              <div className="bg-[#0d1117] border border-blue-500/20 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 mb-1">
                  스테이킹 잔고
                </div>
                <div className="text-sm font-bold text-blue-400">
                  {formatUsdt(stakingBalance)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  예치잠금: {formatUsdt(stakingBalance)}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-[#0d1117] rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-400">가입일:</span>
                  <span className="ml-2 text-white font-medium">
                    {formatDate(joinDateValue)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">최근 로그인:</span>
                  <span className="ml-2 text-white font-medium">
                    {formatDateTime(lastLoginDateValue)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">총 거래수:</span>
                  <span className="ml-2 text-white font-medium">
                    {totalTradesValue}건
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">총 입금:</span>
                  <span className="ml-2 text-emerald-400 font-medium">
                    {formatUsdt(totalDepositValue)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">총 출금:</span>
                  <span className="ml-2 text-red-400 font-medium">
                    {formatUsdt(totalWithdrawValue)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">총투입금:</span>
                  <span className="ml-2 text-yellow-400 font-medium">
                    {formatUsdt(totalInvestValue)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">수익금:</span>
                  <span
                    className={`ml-2 font-medium ${totalProfitValue >= 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {formatUsdt(totalProfitValue, { signed: true })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">회원 상태:</span>
                  <span
                    className={`ml-2 font-medium ${displayStatus === "정상" ? "text-emerald-400" : displayStatus === "정지" ? "text-gray-400" : displayStatus === "대기" ? "text-yellow-400" : "text-red-400"}`}
                  >
                    {displayStatus}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">접속 상태:</span>
                  <span
                    className={`ml-2 font-medium ${isOnlineValue ? "text-emerald-400" : "text-gray-400"}`}
                  >
                    {isOnlineValue ? "온라인" : "오프라인"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">최근 활동:</span>
                  <span className="ml-2 text-white font-medium">
                    {formatDateTime(lastActivityValue)}
                  </span>
                </div>
              </div>
            </div>

            {/* 기본 정보 */}
            <div>
              <h4 className="text-sm font-medium text-white mb-3">기본 정보</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    전화번호
                  </label>
                  <AdminInput
                    defaultValue={
                      effectiveProfile.phone || sourceMember.phone || ""
                    }
                    className="w-full"
                    readOnly={readOnly}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    가입코드
                  </label>
                  <AdminInput
                    defaultValue={joinCodeValue}
                    className="w-full"
                    readOnly={readOnly}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    회원상태
                  </label>
                  {readOnly ? (
                    <AdminInput
                      defaultValue={displayStatus}
                      className="w-full"
                      readOnly
                    />
                  ) : (
                    <AdminSelect
                      className="w-full"
                      defaultValue={displayStatus}
                    >
                      <option value="정상">정상</option>
                      <option value="대기">대기</option>
                      <option value="정지">정지</option>
                      <option value="탈퇴">탈퇴</option>
                    </AdminSelect>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    은행
                  </label>
                  <AdminInput
                    defaultValue={bankNameValue}
                    className="w-full"
                    readOnly={readOnly}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    계좌번호
                  </label>
                  <AdminInput
                    defaultValue={bankAccountValue}
                    className="w-full"
                    readOnly={readOnly}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">
                    예금주
                  </label>
                  <AdminInput
                    defaultValue={bankAccountHolderValue}
                    className="w-full"
                    readOnly={readOnly}
                  />
                </div>
              </div>
              <AdminConnectionInfoFields
                joinIp={joinIpValue}
                lastLoginIp={lastIpValue}
                className="mt-4"
              />
            </div>

            {!readOnly && (
              <div className="border-t border-gray-800 pt-4 flex justify-center gap-2">
                <AdminButton variant="secondary" onClick={onClose}>
                  취소
                </AdminButton>
                <AdminButton
                  onClick={() => {
                    addToast({
                      title: "회원 정보 저장 완료",
                      message: "회원 정보가 성공적으로 수정되었습니다.",
                      type: "success",
                    });
                    onClose();
                  }}
                >
                  저장
                </AdminButton>
              </div>
            )}
          </div>
        )}

        {activeTab === "futures" && (
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-yellow-500">
              진행중 포지션 ({openFuturesPositions.length}건)
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
              {openFuturesPositions.map((position: any) => {
                const direction = getFuturesDirection(position);
                const livePnl = getLivePositionPnl(position);
                return (
                  <AdminTableRow key={position.id}>
                    <AdminTableCell className="text-xs">
                      {formatDateTime(position.opened_at)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs font-medium">
                      {position.symbol || "-"}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span
                        className={`text-xs ${direction === "long" ? "text-green-500" : "text-red-500"}`}
                      >
                        {direction === "long" ? "Long" : "Short"}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell className="text-yellow-500 text-xs">
                      {position.leverage || "-"}x
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {formatUsdt(position.margin)}
                    </AdminTableCell>
                    <AdminTableCell
                      className={`text-xs ${livePnl >= 0 ? "text-green-500" : "text-red-500"}`}
                    >
                      {formatUsdt(livePnl, {
                        signed: true,
                      })}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        진행중
                      </span>
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
              {openFuturesPositions.length === 0 && (
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
              종료된 포지션 ({closedFuturesPositions.length}건)
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
              {closedFuturesPositions.map((position: any) => {
                const direction = getFuturesDirection(position);
                return (
                  <AdminTableRow key={position.id}>
                    <AdminTableCell className="text-xs">
                      {formatDateTime(position.opened_at)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {position.symbol || "-"}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span
                        className={`text-xs ${direction === "long" ? "text-green-500" : "text-red-500"}`}
                      >
                        {direction === "long" ? "Long" : "Short"}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {position.leverage || "-"}x
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {formatUsdt(position.margin)}
                    </AdminTableCell>
                    <AdminTableCell
                      className={`text-xs ${Number(position.pnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                    >
                      {formatUsdt(position.pnl, {
                        signed: true,
                      })}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${position.status === "liquidated" ? "bg-red-500/10 text-red-400" : "bg-gray-500/10 text-gray-300"}`}
                      >
                        {position.status === "liquidated" ? "청산" : "종료"}
                      </span>
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
              {closedFuturesPositions.length === 0 && (
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
          </div>
        )}

        {activeTab === "staking" && (
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-yellow-500">
              진행중 스테이킹 ({activeStakings.length}건)
            </h4>
            <AdminTable
              bodyClassName="[&_td]:text-center"
              headerCellClassName="text-center"
              headers={[
                "상품",
                "금액",
                "시작일",
                "만료일",
                "잔여일",
                "수익률",
                "상태",
                "관리",
              ]}
            >
              {activeStakings.map((staking: any) => {
                const productName =
                  staking.product ||
                  staking.staking_products?.name ||
                  "USDT 예치";
                const endAt =
                  staking.endDate || staking.ends_at || staking.completed_at;
                const daysLeft =
                  staking.daysLeft ??
                  Math.max(
                    0,
                    Math.ceil(
                      (new Date(
                        staking.ends_at || endAt || Date.now(),
                      ).getTime() -
                        Date.now()) /
                        86400000,
                    ),
                  );
                const apyValue =
                  staking.apy ||
                  `${staking.staking_products?.apy ?? staking.staking_products?.annual_rate ?? 0}%`;
                return (
                  <AdminTableRow key={staking.id}>
                    <AdminTableCell className="text-xs text-white font-medium">
                      {productName}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {formatUsdt(staking.amount)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-gray-400">
                      {formatDate(staking.startDate || staking.started_at)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-gray-400">
                      {formatDate(endAt)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {daysLeft > 0 ? `${daysLeft}일` : "-"}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-green-400">
                      {apyValue}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">
                        진행중
                      </span>
                    </AdminTableCell>
                    <AdminTableCell>
                      {!readOnly && (
                        <div className="relative">
                          <button
                            onClick={() =>
                              setStakingDropdown(
                                stakingDropdown === staking.id
                                  ? null
                                  : staking.id,
                              )
                            }
                            className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded"
                          >
                            관리 ▾
                          </button>
                          {stakingDropdown === staking.id && (
                            <div className="absolute right-0 top-full mt-1 z-50 bg-[#1a1d26] border border-gray-700 rounded-lg shadow-xl py-1 min-w-25">
                              <button
                                onClick={() => {
                                  setSettleRate("");
                                  setSettleTarget({
                                    ...staking,
                                    product: productName,
                                    startDate: formatDate(
                                      staking.startDate || staking.started_at,
                                    ),
                                    endDate: formatDate(endAt),
                                    daysLeft,
                                  });
                                  setStakingDropdown(null);
                                }}
                                className="w-full text-left px-3 py-1.5 text-[10px] text-yellow-400 hover:bg-yellow-500/10"
                              >
                                결과처리
                              </button>
                              <button
                                onClick={() => {
                                  setCancelTarget({
                                    ...staking,
                                    product: productName,
                                    startDate: formatDate(
                                      staking.startDate || staking.started_at,
                                    ),
                                    endDate: formatDate(endAt),
                                    daysLeft,
                                  });
                                  setStakingDropdown(null);
                                }}
                                className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10"
                              >
                                강제취소
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
              {activeStakings.length === 0 && (
                <AdminTableRow>
                  <AdminTableCell
                    colSpan={8}
                    className="text-center text-gray-500 text-xs py-4"
                  >
                    진행중인 스테이킹이 없습니다.
                  </AdminTableCell>
                </AdminTableRow>
              )}
            </AdminTable>
            <h4 className="text-xs font-medium text-gray-400 mt-4">
              종료/취소된 스테이킹 ({inactiveStakings.length}건)
            </h4>
            <AdminTable
              bodyClassName="[&_td]:text-center"
              headerCellClassName="text-center"
              headers={["상품", "금액", "시작일", "종료일", "수익", "상태"]}
            >
              {inactiveStakings.map((staking: any) => {
                const productName =
                  staking.product ||
                  staking.staking_products?.name ||
                  "USDT 예치";
                const statusLabel =
                  staking.status === "completed" ? "만기완료" : "취소";
                const statusColor =
                  staking.status === "completed"
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400";
                return (
                  <AdminTableRow key={staking.id}>
                    <AdminTableCell className="text-xs">
                      {productName}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {formatUsdt(staking.amount)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {formatDate(staking.startDate || staking.started_at)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {formatDate(
                        staking.completed_at ||
                          staking.endDate ||
                          staking.ends_at,
                      )}
                    </AdminTableCell>
                    <AdminTableCell className="text-green-400 text-xs">
                      {formatUsdt(staking.total_earned, {
                        signed: true,
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
              {inactiveStakings.length === 0 && (
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
          </div>
        )}

        {activeTab === "deposit_withdraw" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-emerald-500/20 bg-[#0d1117] p-3 text-center">
                <div className="text-[10px] text-gray-500">총 입금</div>
                <div className="mt-1 text-sm font-semibold text-emerald-400">
                  {formatUsdt(totalDepositValue)}
                </div>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-[#0d1117] p-3 text-center">
                <div className="text-[10px] text-gray-500">총 출금</div>
                <div className="mt-1 text-sm font-semibold text-red-400">
                  {formatUsdt(totalWithdrawValue)}
                </div>
              </div>
              <div className="rounded-lg border border-yellow-500/20 bg-[#0d1117] p-3 text-center">
                <div className="text-[10px] text-gray-500">총투입금</div>
                <div className="mt-1 text-sm font-semibold text-yellow-400">
                  {formatUsdt(totalInvestValue)}
                </div>
              </div>
              <div className="rounded-lg border border-cyan-500/20 bg-[#0d1117] p-3 text-center">
                <div className="text-[10px] text-gray-500">수익금</div>
                <div
                  className={`mt-1 text-sm font-semibold ${totalProfitValue >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {formatUsdt(totalProfitValue, { signed: true })}
                </div>
              </div>
            </div>
            <AdminTable
              bodyClassName="[&_td]:text-center"
              headerCellClassName="text-center"
              headers={["시간", "구분", "금액", "은행/계좌", "상태", "사유"]}
            >
              {balanceHistoryRows.map((item: any) => {
                const isDeposit = item.historyType === "입금";
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
                  <AdminTableRow key={`${item.historyType}-${item.id}`}>
                    <AdminTableCell className="text-xs">
                      {formatDateTime(item.created_at)}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span
                        className={`font-medium text-xs ${isDeposit ? "text-green-400" : "text-red-400"}`}
                      >
                        {item.historyType}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {formatUsdt(item.amount)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-gray-400">
                      {item.bank || item.bank_name || "-"}{" "}
                      {item.account_number || item.bank_account || ""}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span className={`text-xs ${statusColor}`}>
                        {statusMap[item.status] || item.status || "-"}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-gray-500">
                      {item.reject_reason || item.depositor_name || "-"}
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
              {balanceHistoryRows.length === 0 && (
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
          </div>
        )}

        {activeTab === "login_history" && (
          <div className="space-y-4">
            <AdminTable
              bodyClassName="[&_td]:text-center"
              headerCellClassName="text-center"
              headers={["로그인 시간", "IP 주소", "기기/브라우저", "결과"]}
            >
              {effectiveLoginLogs.map((log: any) => {
                const userAgent = log.user_agent || "-";
                return (
                  <AdminTableRow key={log.id}>
                    <AdminTableCell className="text-xs">
                      {formatDateTime(log.login_at)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {toDisplayIp(log.ip_address)}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {getLoginDevice(userAgent)} / {getLoginBrowser(userAgent)}
                    </AdminTableCell>
                    <AdminTableCell>
                      {isSuccessfulLoginLog(log) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-emerald-500 text-xs">성공</span>
                          {latestSuccessfulLoginLog?.id === log.id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                              최신 성공
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-red-400 text-xs">
                          실패 ({log.failure_reason || "인증 오류"})
                        </span>
                      )}
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
              {effectiveLoginLogs.length === 0 && (
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
          </div>
        )}
      </div>

      {/* Task 1: 강제취소 확인 모달 */}
      {cancelTarget && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
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
              <div className="bg-[#0d1117] rounded-lg p-3 space-y-2 text-xs">
                {[
                  ["회원", memberName],
                  ["상품", cancelTarget.product],
                  ["금액", formatUsdt(cancelTarget.amount)],
                  [
                    "기간",
                    `${cancelTarget.startDate} ~ ${cancelTarget.endDate}`,
                  ],
                  ["잔여일", `${cancelTarget.daysLeft}일`],
                ].map(([l, v]) => (
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
                  className="w-full px-3 py-2 bg-[#0d1117] border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-yellow-500 resize-none"
                  placeholder="강제취소 사유를 입력하세요"
                />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setCancelTarget(null)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={() => {
                  addToast({
                    title: "스테이킹 강제취소 완료",
                    message: `${memberName}님의 ${cancelTarget.product} 스테이킹이 강제취소 처리되었습니다.`,
                    type: "success",
                  });
                  setCancelTarget(null);
                }}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm"
              >
                강제취소 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task 1: 결과처리 모달 */}
      {settleTarget && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-bold text-white">
                개별 결과처리 — {memberName}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[#0d1117] rounded-lg p-3 space-y-2 text-xs">
                {[
                  ["상품", settleTarget.product],
                  ["금액", formatUsdt(settleTarget.amount)],
                  [
                    "기간",
                    `${settleTarget.startDate} ~ ${settleTarget.endDate}`,
                  ],
                ].map(([l, v]) => (
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
                  value={settleRate}
                  onChange={(e) => setSettleRate(e.target.value)}
                  placeholder="예: -3.5 또는 8.2"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              {settleRate && (
                <div className="bg-gray-800/50 rounded-lg p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">예상 지급액</span>
                    <span
                      className={
                        Number(settleRate) < 0
                          ? "text-red-400 font-bold"
                          : "text-green-400 font-bold"
                      }
                    >
                      {formatUsdt(
                        settleTarget.amount * (1 + Number(settleRate) / 100),
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setSettleTarget(null)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={() => {
                  addToast({
                    title: "스테이킹 결과처리 완료",
                    message: `${memberName}님의 ${settleTarget.product} 결과처리 완료: ${settleRate}%`,
                    type: "success",
                  });
                  setSettleTarget(null);
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
      {balanceAdjust && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-bold text-white">
                일반잔고 {balanceAdjust.type === "add" ? "증가" : "차감"} —{" "}
                {memberName}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[#0d1117] rounded-lg p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">현재 일반잔고</span>
                  <span className="text-emerald-400 font-bold">
                    {formatUsdt(generalBalance)}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {balanceAdjust.type === "add" ? "증가" : "차감"} 금액 (USDT)
                </label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="금액 입력"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
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
                <div className="bg-[#0d1117] rounded-lg p-3 text-xs">
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
                        generalBalance +
                          (balanceAdjust.type === "add" ? 1 : -1) *
                            Number(adjustAmount),
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
                onClick={() => {
                  addToast({
                    title: `일반잔고 ${balanceAdjust.type === "add" ? "증가" : "차감"} 완료`,
                    message: `${memberName}님 일반잔고 ${balanceAdjust.type === "add" ? "+" : "-"}${adjustAmount} USDT ${balanceAdjust.type === "add" ? "증가" : "차감"} 완료`,
                    type: "success",
                  });
                  setBalanceAdjust(null);
                }}
                className={`px-6 py-2 ${balanceAdjust.type === "add" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"} text-white font-bold rounded-lg text-sm`}
              >
                {balanceAdjust.type === "add" ? "증가 확인" : "차감 확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminModal>
  );
}
