"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  DollarSign,
  Users,
  TrendingUp,
  ArrowLeft,
  Search,
  Calendar,
  ArrowUpFromLine,
} from "lucide-react";
import {
  MemberDetailModal,
  prefetchMemberDetail,
} from "@/components/admin/ui/MemberDetailModal";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import { PartnerMemberList } from "@/components/admin/ui/PartnerMemberList";
import {
  UserMetricCard,
  UserPageHeader,
  UserPanel,
  UserSegmentedTabs,
} from "@/components/ui/UserSurface";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils/formatDate";
import { formatUsdt } from "@/lib/utils/numberFormat";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  getCommissionFilterLabel,
  getCommissionSourceLabel,
} from "@/lib/utils/commission";
import type {
  DbAgent,
  DbAgentCommission,
  DbUserProfile,
} from "@/lib/types/database";
import { PartnerClientPage } from "./components/PartnerClientPage";

const supabase = createClient();
type AgentWithdrawalAmountRow = {
  amount: number | string | null;
  fee: number | string | null;
  status: string | null;
};
type PartnerMemberRow = {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: string;
  balance: number;
  totalDeposit: number;
  totalWithdraw: number;
  joinDate: string;
  joinCode: string;
};
type CommissionHistoryItem = {
  id: number;
  date: string;
  member: string;
  type: string;
  description: string;
  amount: number;
};
type AgentWithdrawalRow = {
  id: number;
  created_at: string;
  amount: number | string | null;
  bank: string | null;
  account_number: string | null;
  account_holder: string | null;
  status: string | null;
  reject_reason: string | null;
};
type AgentCommissionWithProfile = DbAgentCommission & {
  user_profiles?: {
    name?: string | null;
  } | null;
};

const TABS = [
  { id: "dashboard", label: "대시보드" },
  { id: "members", label: "귀속 회원" },
  { id: "commissions", label: "커미션 내역" },
  { id: "withdraw", label: "출금" },
];

function statusLabel(s: string | null | undefined) {
  switch (s) {
    case "pending":
      return "처리중";
    case "approved":
      return "완료";
    case "rejected":
      return "거절";
    default:
      return s;
  }
}
function statusColor(s: string | null | undefined) {
  switch (s) {
    case "approved":
      return "bg-green-500/20 text-green-500";
    case "rejected":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-yellow-500/20 text-yellow-400";
  }
}

function getDateOnly(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function PartnerPage() {
  return <PartnerClientPage />;
}

function LegacyPartnerPage() {
  const { user } = useAuth();
  const { addToast } = useNotification();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedMember, setSelectedMember] = useState<PartnerMemberRow | null>(
    null,
  );
  const [commissionFilter, setCommissionFilter] = useState("all");
  const [commStartDate, setCommStartDate] = useState("");
  const [commEndDate, setCommEndDate] = useState("");
  const [partnerInfo, setPartnerInfo] = useState({
    id: "",
    name: "",
    grade: "총판",
    referralCode: "",
    balance: 0,
    totalCommissionEarned: 0,
    lossCommission: 0,
    rollingCommission: 0,
    feeCommission: 0,
    memberCount: 0,
  });
  const [partnerMembers, setPartnerMembers] = useState<PartnerMemberRow[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [mockCommissionHistory, setCommissionHistory] = useState<
    CommissionHistoryItem[]
  >([]);
  const [agentWithdrawals, setAgentWithdrawals] = useState<
    AgentWithdrawalRow[]
  >([]);
  const [bankInfo, setBankInfo] = useState({
    bank_name: "",
    bank_account: "",
    bank_account_holder: "",
  });
  const [withdrawStatusFilter, setWithdrawStatusFilter] = useState("all");
  const [withdrawSearch, setWithdrawSearch] = useState("");
  const [withdrawStartDate, setWithdrawStartDate] = useState("");
  const [withdrawEndDate, setWithdrawEndDate] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [commissionBalance, setCommissionBalance] = useState(0);

  const debouncedMemberSearch = useDebouncedValue(memberSearch, 250);
  const debouncedWithdrawSearch = useDebouncedValue(withdrawSearch, 250);

  const loadWithdrawals = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("agent_id", user.id)
      .eq("withdrawal_type", "agent")
      .order("created_at", { ascending: false });
    if (data) setAgentWithdrawals((data as AgentWithdrawalRow[]) || []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      await supabase.auth.getSession();
      const { data: agent } = await supabase
        .from("agents")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (!agent) return;
      const ag = agent as DbAgent;
      const { data: members } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("agent_id", user.id);
      const { data: comms } = await supabase
        .from("agent_commissions")
        .select("*, user_profiles(name)")
        .eq("agent_id", user.id)
        .order("created_at", { ascending: false });
      const totalComm = ((comms as DbAgentCommission[]) ?? []).reduce(
        (s, c) => s + Number(c.amount),
        0,
      );
      // Calculate commission balance = total earned - total withdrawn
      const { data: wds } = await supabase
        .from("withdrawals")
        .select("amount, fee, status")
        .eq("agent_id", user.id)
        .eq("withdrawal_type", "agent");
      const withdrawn = ((wds as AgentWithdrawalAmountRow[] | null) ?? [])
        .filter((w) => w.status === "approved")
        .reduce(
          (s: number, w) => s + Number(w.amount || 0) + Number(w.fee || 0),
          0,
        );
      const balance = Math.max(
        0,
        totalComm - withdrawn + Number(ag.commission_balance || 0),
      );
      setCommissionBalance(balance);
      setBankInfo({
        bank_name: ag.bank_name || "",
        bank_account: ag.bank_account || "",
        bank_account_holder: ag.bank_account_holder || "",
      });
      await loadWithdrawals();
      setPartnerInfo({
        id: ag.username,
        name: ag.name,
        grade: "총판",
        referralCode: ag.referral_code,
        balance,
        totalCommissionEarned: totalComm,
        lossCommission: Number(ag.loss_commission_rate) || 15,
        rollingCommission: Number(ag.commission_rate) * 100,
        feeCommission: Number(ag.fee_commission_rate) || 30,
        memberCount: members?.length ?? 0,
      });
      setPartnerMembers(
        ((members as DbUserProfile[]) ?? []).map(
          (m): PartnerMemberRow => ({
            id: m.id,
            email: m.email,
            name: m.name,
            phone: m.phone,
            status: m.status === "active" ? "정상" : "정지",
            balance: Number(m.wallet_balance) || 0,
            totalDeposit: 0,
            totalWithdraw: 0,
            joinDate: new Date(m.created_at).toISOString().split("T")[0],
            joinCode: m.referral_code_used || "-",
          }),
        ),
      );
      setCommissionHistory(
        ((comms as AgentCommissionWithProfile[] | null) ?? []).map((c) => ({
          id: c.id,
          date: formatDateTime(c.created_at),
          member: c.user_profiles?.name || "-",
          type: getCommissionFilterLabel(c.source_type),
          description: getCommissionSourceLabel(c.source_type),
          amount: Number(c.amount),
        })),
      );
    };
    void load();
  }, [user, loadWithdrawals]);

  const filteredCommissions = mockCommissionHistory.filter((c) => {
    if (commissionFilter !== "all" && c.type !== commissionFilter) return false;
    if (commStartDate && c.date.split(" ")[0] < commStartDate) return false;
    if (commEndDate && c.date.split(" ")[0] > commEndDate) return false;
    return true;
  });
  const commissionFilters = useMemo(
    () => [
      "all",
      ...Array.from(new Set(mockCommissionHistory.map((c) => c.type))),
    ],
    [mockCommissionHistory],
  );
  const filteredWithdrawals = useMemo(() => {
    return agentWithdrawals.filter((row) => {
      const createdDate = getDateOnly(row.created_at);
      if (
        withdrawStatusFilter !== "all" &&
        row.status !== withdrawStatusFilter
      ) {
        return false;
      }
      if (withdrawStartDate && createdDate && createdDate < withdrawStartDate) {
        return false;
      }
      if (withdrawEndDate && createdDate && createdDate > withdrawEndDate) {
        return false;
      }
      if (!debouncedWithdrawSearch.trim()) {
        return true;
      }
      const search = debouncedWithdrawSearch.trim().toLowerCase();
      return [
        row.bank,
        row.account_number,
        row.account_holder,
        statusLabel(row.status),
        String(row.amount ?? ""),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search),
      );
    });
  }, [
    agentWithdrawals,
    debouncedWithdrawSearch,
    withdrawEndDate,
    withdrawStartDate,
    withdrawStatusFilter,
  ]);
  const filteredPartnerMembers = useMemo(() => {
    const search = debouncedMemberSearch.trim().toLowerCase();
    if (!search) {
      return partnerMembers;
    }
    return partnerMembers.filter((member) =>
      [member.name, member.email, member.phone, member.joinCode].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search),
      ),
    );
  }, [debouncedMemberSearch, partnerMembers]);

  useEffect(() => {
    if (activeTab !== "members" || filteredPartnerMembers.length === 0) {
      return;
    }

    filteredPartnerMembers
      .slice(0, 6)
      .forEach((member) => prefetchMemberDetail(member.id));
  }, [activeTab, filteredPartnerMembers]);

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <UserPageHeader
          eyebrow="Partner panel"
          title="파트너 실적, 회원, 커미션 흐름을 한 화면에서 관리합니다."
          description="추천 코드, 등급, 귀속 회원과 출금 상태를 같은 톤으로 정리해 빠르게 판단할 수 있게 구성했습니다."
          actions={
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Link
                href="/"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/8 bg-white/3 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <ArrowLeft size={16} />
                메인으로
              </Link>
              <div className="shrink-0 rounded-full border border-white/8 bg-white/3 px-4 py-2 text-sm text-gray-300">
                파트너{" "}
                <span className="ml-1 font-medium text-white">
                  {partnerInfo.name}
                </span>
              </div>
              <div className="shrink-0 rounded-full border border-white/8 bg-white/3 px-4 py-2 text-sm text-gray-300">
                코드{" "}
                <span className="ml-1 font-medium text-yellow-400">
                  {partnerInfo.referralCode}
                </span>
              </div>
              <div
                className={`shrink-0 rounded-full border px-4 py-2 text-sm ${partnerInfo.grade === "총판" ? "border-blue-500/20 bg-blue-500/10 text-blue-300" : "border-purple-500/20 bg-purple-500/10 text-purple-300"}`}
              >
                {partnerInfo.grade}
              </div>
            </div>
          }
        />

        <UserSegmentedTabs
          items={TABS}
          active={activeTab}
          onChange={setActiveTab}
        />

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
              <UserMetricCard
                label="현재 잔고"
                value={formatUsdt(partnerInfo.balance)}
                icon={<DollarSign size={14} />}
                tone="warning"
              />
              <UserMetricCard
                label="누적 커미션"
                value={formatUsdt(partnerInfo.totalCommissionEarned)}
                icon={<TrendingUp size={14} />}
                tone="success"
              />
              <UserMetricCard
                label="귀속 회원"
                value={`${partnerMembers.length}명`}
                icon={<Users size={14} />}
                tone="accent"
              />
              <UserMetricCard
                label="추천코드"
                value={partnerInfo.referralCode}
                icon={<Calendar size={14} />}
                tone="default"
              />
            </div>

            <UserPanel
              title="커미션 설정 현황"
              description="죽장, 롤링, 수수료 커미션 비율을 한 번에 비교합니다."
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <div className="text-xs text-red-400 font-medium mb-1">
                    죽장 커미션
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {partnerInfo.lossCommission}%
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    회원 손실금의 일부
                  </div>
                </div>
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                  <div className="text-xs text-yellow-400 font-medium mb-1">
                    롤링 커미션
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {partnerInfo.rollingCommission}%
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    거래 담보금의 %
                  </div>
                </div>
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                  <div className="text-xs text-blue-400 font-medium mb-1">
                    수수료 커미션
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {partnerInfo.feeCommission}%
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    거래 수수료의 %
                  </div>
                </div>
              </div>
            </UserPanel>

            <UserPanel
              title="최근 커미션 내역"
              description="최근 발생한 수익 정산 3건을 빠르게 확인합니다."
              action={
                <button
                  onClick={() => setActiveTab("commissions")}
                  className="text-xs text-purple-400 transition-colors hover:text-purple-300"
                >
                  전체보기 →
                </button>
              }
              contentClassName="px-0 py-0"
            >
              <div className="divide-y divide-gray-800/50">
                {mockCommissionHistory.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${c.type === "죽장" ? "bg-red-500/20 text-red-400" : c.type === "롤링" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}`}
                        >
                          {c.type}
                        </span>
                        <span className="text-xs text-white">
                          {c.description}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {c.date} · {c.member}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-green-400">
                      {formatUsdt(c.amount, { signed: true })}
                    </div>
                  </div>
                ))}
              </div>
            </UserPanel>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === "members" && (
          <div className="space-y-4">
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 flex items-center justify-between">
              <div className="text-sm text-white">
                <span className="text-gray-400 mr-2">총 귀속회원:</span>
                <span className="text-cyan-400 font-bold">
                  {filteredPartnerMembers.length}명
                </span>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    size={14}
                  />
                  <input
                    placeholder="회원 검색"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500 w-64"
                  />
                </div>
              </div>
            </div>

            {filteredPartnerMembers.length > 0 ? (
              <PartnerMemberList
                members={filteredPartnerMembers}
                emptyTitle="귀속 회원이 없습니다"
                emptyDescription={`파트너 코드 "${partnerInfo.referralCode}"로 가입한 회원이 여기에 표시됩니다.`}
                onSelectMember={setSelectedMember}
                onPrefetchMember={(member) => prefetchMemberDetail(member.id)}
              />
            ) : (
              <div className="bg-[#111827] border border-gray-800 rounded-lg p-12 text-center">
                <Users className="mx-auto mb-3 text-gray-600" size={40} />
                <p className="text-gray-400 text-sm">귀속 회원이 없습니다</p>
                <p className="text-gray-600 text-xs mt-1">
                  파트너 코드 &quot;{partnerInfo.referralCode}&quot;로 가입한
                  회원이 여기에 표시됩니다.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Commissions Tab */}
        {activeTab === "commissions" && (
          <div className="space-y-4">
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {commissionFilters.map((f) => (
                    <button
                      key={f}
                      onClick={() => setCommissionFilter(f)}
                      className={`px-3 py-1.5 rounded text-xs transition-colors ${commissionFilter === f ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                    >
                      {f === "all" ? "전체" : f}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-white">
                  <span className="text-gray-400 mr-2">총 커미션:</span>
                  <span className="text-green-400 font-bold">
                    {formatUsdt(
                      filteredCommissions.reduce((s, c) => s + c.amount, 0),
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AdminDateRangePicker
                  startDate={commStartDate}
                  endDate={commEndDate}
                  onStartDateChange={setCommStartDate}
                  onEndDateChange={setCommEndDate}
                />
                {(commStartDate || commEndDate) && (
                  <button
                    onClick={() => {
                      setCommStartDate("");
                      setCommEndDate("");
                    }}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors whitespace-nowrap"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr>
                    {["일시", "회원", "유형", "내용", "금액"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs text-gray-400 font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredCommissions.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {c.date}
                      </td>
                      <td className="px-4 py-3 text-xs text-white">
                        {c.member}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${c.type === "죽장" ? "bg-red-500/20 text-red-400" : c.type === "롤링" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}`}
                        >
                          {c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300">
                        {c.description}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-400">
                        {formatUsdt(c.amount, { signed: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Withdraw Request Tab */}
        {activeTab === "withdraw" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
              <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <ArrowUpFromLine size={16} className="text-purple-400" />
                  커미션 출금 신청
                </h3>
                <div className="bg-[#0a0d10] border border-gray-700 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">
                      출금 가능 커미션 잔액
                    </span>
                    <span className="text-lg font-bold text-yellow-400">
                      {formatUsdt(commissionBalance)}
                    </span>
                  </div>
                </div>
                {bankInfo.bank_account ? (
                  <div className="bg-[#0a0d10] border border-gray-700 rounded-lg p-4 mb-4 space-y-2 text-xs">
                    <div className="text-gray-400 font-medium mb-1">
                      출금 계좌
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">은행</span>
                      <span className="text-white">
                        {bankInfo.bank_name || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">계좌번호</span>
                      <span className="text-white">
                        {bankInfo.bank_account}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">예금주</span>
                      <span className="text-white">
                        {bankInfo.bank_account_holder || "-"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 mb-4 text-xs text-yellow-500">
                    출금 계좌 정보가 없습니다. 관리자에게 계좌 등록을
                    요청해주세요.
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-2">
                    출금 금액 (USDT)
                  </label>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                  <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                    <span>최소 출금: 1 USDT</span>
                    <button
                      className="text-purple-400 hover:text-purple-300"
                      onClick={() =>
                        setWithdrawAmount(String(Math.floor(commissionBalance)))
                      }
                    >
                      전액 출금
                    </button>
                  </div>
                </div>
                <button
                  disabled={
                    isSubmittingWithdraw ||
                    !bankInfo.bank_account ||
                    Number(withdrawAmount) <= 0 ||
                    Number(withdrawAmount) > commissionBalance
                  }
                  onClick={async () => {
                    if (!user || !bankInfo.bank_account) return;
                    const amt = Number(withdrawAmount);
                    if (amt <= 0 || amt > commissionBalance) {
                      addToast({
                        title: "출금 신청 불가",
                        message: "출금 금액을 확인해주세요.",
                        type: "warning",
                      });
                      return;
                    }
                    setIsSubmittingWithdraw(true);
                    const { error } = await supabase
                      .from("withdrawals")
                      .insert({
                        user_id: null,
                        agent_id: user.id,
                        withdrawal_type: "agent",
                        amount: amt,
                        bank: bankInfo.bank_name,
                        account_number: bankInfo.bank_account,
                        account_holder: bankInfo.bank_account_holder,
                        status: "pending",
                      });
                    setIsSubmittingWithdraw(false);
                    if (error) {
                      addToast({
                        title: "출금 신청 실패",
                        message: "출금 신청 중 오류: " + error.message,
                        type: "error",
                      });
                      return;
                    }
                    setWithdrawAmount("");
                    await loadWithdrawals();
                    addToast({
                      title: "출금 신청 완료",
                      message: "관리자 승인 후 처리됩니다.",
                      type: "success",
                    });
                  }}
                  className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-lg text-sm transition-colors"
                >
                  {isSubmittingWithdraw ? "처리 중..." : "출금 신청하기"}
                </button>
              </div>

              {/* Withdraw History Tab */}
              <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">
                      출금 내역 ({filteredWithdrawals.length}건)
                    </span>
                    <button
                      onClick={loadWithdrawals}
                      className="text-xs text-purple-400 hover:text-purple-300 whitespace-nowrap"
                    >
                      새로고침
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        ["all", "전체"],
                        ["pending", "처리중"],
                        ["approved", "완료"],
                        ["rejected", "거절"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setWithdrawStatusFilter(value)}
                          className={`px-3 py-1.5 rounded text-xs transition-colors ${withdrawStatusFilter === value ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="relative flex-1">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                          size={14}
                        />
                        <input
                          value={withdrawSearch}
                          onChange={(e) => setWithdrawSearch(e.target.value)}
                          placeholder="은행, 계좌번호, 예금주, 상태 검색"
                          className="w-full bg-[#0d1117] border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminDateRangePicker
                          startDate={withdrawStartDate}
                          endDate={withdrawEndDate}
                          onStartDateChange={setWithdrawStartDate}
                          onEndDateChange={setWithdrawEndDate}
                        />
                        {(withdrawStartDate ||
                          withdrawEndDate ||
                          withdrawSearch ||
                          withdrawStatusFilter !== "all") && (
                          <button
                            onClick={() => {
                              setWithdrawStatusFilter("all");
                              setWithdrawSearch("");
                              setWithdrawStartDate("");
                              setWithdrawEndDate("");
                            }}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors whitespace-nowrap"
                          >
                            초기화
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50">
                    <tr>
                      {[
                        "일시",
                        "금액(USDT)",
                        "은행",
                        "계좌번호",
                        "예금주",
                        "상태",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs text-gray-400 font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {filteredWithdrawals.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-gray-500 text-xs"
                        >
                          조건에 맞는 출금 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredWithdrawals.map((w) => (
                        <tr
                          key={w.id}
                          className="hover:bg-gray-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {formatDateTime(w.created_at)}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-white">
                            {formatUsdt(Number(w.amount))}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-300">
                            {w.bank || "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-300">
                            {w.account_number || "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-300">
                            {w.account_holder || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColor(w.status)}`}
                            >
                              {statusLabel(w.status)}
                            </span>
                            {w.status === "rejected" && w.reject_reason && (
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {w.reject_reason}
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

      {/* MemberDetailModal 재사용 */}
      <MemberDetailModal
        member={selectedMember}
        isOpen={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        readOnly={true}
      />
    </div>
  );
}
