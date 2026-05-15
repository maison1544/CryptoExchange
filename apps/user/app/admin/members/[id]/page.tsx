"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import {
  Shield,
  TrendingUp,
  TrendingDown,
  Ban,
  Mail,
  Calendar,
  Wallet,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import {
  formatDisplayNumber,
  formatKrw,
  formatUsdt,
} from "@/lib/utils/numberFormat";

const mockMember = {
  id: "user001",
  name: "홍길동",
  email: "user@example.com",
  phone: "010-1234-5678",
  joinDate: "2024-11-15",
  lastLogin: "2025-02-28 14:30",
  lastLoginIP: "192.168.1.***",
  registrationIP: "211.234.56.***",
  status: "active" as const,
  kycLevel: 2,
  partner: "agent001",
  partnerName: "파트너A",
  joinCode: "NXS-A8F2K9",
  memo: "",
  points: 1500000,
  balance_usdt: 10500,
  balance_krw: 14857500,
  walletGeneral: 42000,
  walletFutures: 6200,
  walletStaking: 1800,
  totalDeposit: 5000000,
  totalDeposit_usdt: 3534,
  totalWithdraw: 2000000,
  totalWithdraw_usdt: 1414,
  totalTrades: 342,
  winRate: 54.2,
  totalPnl: 1243000,
  totalFee: 156000,
  totalVolume: 12500000,
  avgLeverage: 28.5,
  mainPair: "BTC/USDT",
  bankName: "국민은행",
  bankAccount: "123-456-789012",
  bankAccountHolder: "홍길동",
  stakingCount: 2,
};

const mockTradeHistory = [
  {
    id: 1,
    pair: "BTC/USDT",
    direction: "long" as const,
    leverage: 50,
    entryPrice: 97250,
    exitPrice: 98100,
    pnl: 425000,
    fee: 9750,
    status: "closed",
    date: "2025-02-28 14:23",
  },
  {
    id: 2,
    pair: "ETH/USDT",
    direction: "short" as const,
    leverage: 25,
    entryPrice: 3420,
    exitPrice: 3380,
    pnl: 200000,
    fee: 4275,
    status: "closed",
    date: "2025-02-28 11:05",
  },
  {
    id: 3,
    pair: "SOL/USDT",
    direction: "long" as const,
    leverage: 75,
    entryPrice: 178.5,
    exitPrice: 165.2,
    pnl: -997500,
    fee: 13388,
    status: "liquidated",
    date: "2025-02-27 22:48",
  },
  {
    id: 4,
    pair: "BTC/USDT",
    direction: "short" as const,
    leverage: 20,
    entryPrice: 96800,
    exitPrice: 96200,
    pnl: 180000,
    fee: 5808,
    status: "closed",
    date: "2025-02-27 16:30",
  },
  {
    id: 5,
    pair: "XRP/USDT",
    direction: "long" as const,
    leverage: 30,
    entryPrice: 2.45,
    exitPrice: 2.52,
    pnl: 700000,
    fee: 7350,
    status: "closed",
    date: "2025-02-27 09:15",
  },
];

const mockPointHistory = [
  {
    id: 1,
    type: "deposit",
    amount: 500000,
    balance: 1500000,
    desc: "무통장 입금",
    date: "2025-02-28 13:00",
  },
  {
    id: 2,
    type: "earn",
    amount: 425000,
    balance: 1000000,
    desc: "BTC/USDT 거래 수익",
    date: "2025-02-28 15:10",
  },
  {
    id: 3,
    type: "fee",
    amount: -9750,
    balance: 575000,
    desc: "거래 수수료",
    date: "2025-02-28 15:10",
  },
  {
    id: 4,
    type: "withdraw",
    amount: -300000,
    balance: 584750,
    desc: "출금 (KB국민)",
    date: "2025-02-28 09:00",
  },
  {
    id: 5,
    type: "loss",
    amount: -997500,
    balance: 884750,
    desc: "SOL/USDT 청산 손실",
    date: "2025-02-27 22:48",
  },
];

const mockLogs = [
  {
    id: 1,
    action: "로그인",
    ip: "192.168.1.***",
    device: "Chrome / Windows",
    date: "2025-02-28 14:30",
  },
  {
    id: 2,
    action: "BTC/USDT 롱 포지션 진입 (50x)",
    ip: "192.168.1.***",
    device: "Chrome / Windows",
    date: "2025-02-28 14:23",
  },
  {
    id: 3,
    action: "출금 신청 300,000 USDT",
    ip: "192.168.1.***",
    device: "Chrome / Windows",
    date: "2025-02-28 09:00",
  },
  {
    id: 4,
    action: "레버리지 변경 (25x → 50x)",
    ip: "192.168.1.***",
    device: "Mobile / iOS",
    date: "2025-02-27 22:45",
  },
  {
    id: 5,
    action: "비밀번호 변경",
    ip: "192.168.1.***",
    device: "Chrome / Windows",
    date: "2025-02-26 10:00",
  },
];

const TABS = [
  { id: "overview", label: "개요" },
  { id: "trades", label: "거래 내역" },
  { id: "points", label: "자산 내역" },
  { id: "logs", label: "활동 로그" },
];

export default function MemberDetailPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [memo, setMemo] = useState(mockMember.memo);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<
    "suspend" | "adjust" | "reset2fa" | null
  >(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const m = mockMember;

  const openAction = (type: "suspend" | "adjust" | "reset2fa") => {
    setActionType(type);
    setIsActionModalOpen(true);
    setAdjustAmount("");
    setAdjustReason("");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href="/admin/members"
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <AdminPageHeader
          title={`회원 상세 - ${m.name}`}
          description={`${m.id} · ${m.email}`}
        />
      </div>

      {/* 프로필 카드 */}
      <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-2xl font-bold text-gray-300">
              {m.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{m.name}</h2>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-medium ${m.status === "active" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                >
                  {m.status === "active" ? "활성" : "정지"}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-blue-500/10 text-blue-400">
                  KYC Lv.{m.kycLevel}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Mail size={11} />
                  {m.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  가입: {m.joinDate}
                </span>
                <span>
                  최근 접속: {m.lastLogin} (IP: {m.lastLoginIP})
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>
                  파트너: {m.partnerName} ({m.partner})
                </span>
                <span>가입코드: {m.joinCode}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAction("adjust")}
              className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-medium rounded transition-colors flex items-center gap-1"
            >
              <Wallet size={12} />
              잔액 조정
            </button>
            <button
              onClick={() => openAction("reset2fa")}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors flex items-center gap-1"
            >
              <Shield size={12} />
              2FA 초기화
            </button>
            <button
              onClick={() => openAction("suspend")}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors flex items-center gap-1"
            >
              <Ban size={12} />
              계정 정지
            </button>
          </div>
        </div>

        {/* 요약 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-5 border-t border-gray-800">
          <div>
            <div className="text-[10px] text-gray-500">현재 잔액</div>
            <div className="text-white font-bold">
              {formatUsdt(m.balance_usdt)}
            </div>
            <div className="text-[10px] text-gray-500">
              {formatKrw(m.balance_krw)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">총 입금</div>
            <div className="text-green-400 font-bold">
              {formatUsdt(m.totalDeposit_usdt)}
            </div>
            <div className="text-[10px] text-gray-500">
              {formatKrw(m.totalDeposit)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">총 출금</div>
            <div className="text-red-400 font-bold">
              {formatUsdt(m.totalWithdraw_usdt)}
            </div>
            <div className="text-[10px] text-gray-500">
              {formatKrw(m.totalWithdraw)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">
              총 거래 손익 / 수수료
            </div>
            <div
              className={`font-bold ${m.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {formatUsdt(m.totalPnl, { signed: true })}
            </div>
            <div className="text-[10px] text-yellow-500">
              {formatUsdt(m.totalFee)} 수수료
            </div>
          </div>
        </div>
      </div>

      <AdminTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 콘텐츠 */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* 3-지갑 잔고 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
              <div className="text-[10px] text-gray-500 mb-1">일반 잔고</div>
              <div className="text-emerald-400 font-bold">
                {formatUsdt(m.walletGeneral)}
              </div>
            </div>
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
              <div className="text-[10px] text-gray-500 mb-1">선물 잔고</div>
              <div className="text-yellow-400 font-bold">
                {formatUsdt(m.walletFutures)}
              </div>
            </div>
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-4">
              <div className="text-[10px] text-gray-500 mb-1">
                스테이킹 잔고
              </div>
              <div className="text-blue-400 font-bold">
                {formatUsdt(m.walletStaking)}
              </div>
            </div>
            <div className="bg-[#111827] border border-yellow-500/30 rounded-lg p-4">
              <div className="text-[10px] text-gray-500 mb-1">
                예상 자산 (합계)
              </div>
              <div className="text-white font-bold">
                {formatUsdt(
                  m.walletGeneral + m.walletFutures + m.walletStaking,
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-5 space-y-3">
              <h3 className="text-white font-medium text-sm">거래 통계</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">총 거래</span>
                  <div className="text-white">{m.totalTrades}건</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">승률</span>
                  <div className="text-white">{m.winRate}%</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">총 거래량</span>
                  <div className="text-white">
                    {formatDisplayNumber(m.totalVolume / 1000000, {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    })}
                    M
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">평균 레버리지</span>
                  <div className="text-white">{m.avgLeverage}x</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">주요 페어</span>
                  <div className="text-white">{m.mainPair}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">스테이킹 횟수</span>
                  <div className="text-white">{m.stakingCount}건</div>
                </div>
              </div>
            </div>
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-5 space-y-3">
              <h3 className="text-white font-medium text-sm">관리자 메모</h3>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={5}
                placeholder="회원에 대한 메모를 작성하세요..."
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 resize-none"
              />
              <button className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-medium rounded transition-colors">
                메모 저장
              </button>
            </div>
          </div>

          {/* 은행 정보 */}
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-5 space-y-3">
            <h3 className="text-white font-medium text-sm">은행 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  은행명
                </label>
                <input
                  type="text"
                  defaultValue={m.bankName}
                  placeholder="은행명 입력"
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  계좌번호
                </label>
                <input
                  type="text"
                  defaultValue={m.bankAccount}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  예금주명
                </label>
                <input
                  type="text"
                  defaultValue={m.bankAccountHolder}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
          </div>

          {/* 비밀번호 변경 */}
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-5 space-y-3">
            <h3 className="text-white font-medium text-sm">비밀번호 변경</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  placeholder="변경시에만 입력"
                  autoComplete="new-password"
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  비밀번호 확인
                </label>
                <input
                  type="password"
                  placeholder="변경시에만 입력"
                  autoComplete="new-password"
                  className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-medium rounded transition-colors">
                비밀번호 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "trades" && (
        <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <AdminTable
              headers={[
                "시간",
                "페어",
                "방향",
                "배율",
                "진입가",
                "청산가",
                "손익",
                "수수료",
                "상태",
              ]}
            >
              {mockTradeHistory.map((t) => (
                <AdminTableRow key={t.id}>
                  <AdminTableCell className="text-xs whitespace-nowrap text-gray-400">
                    {t.date}
                  </AdminTableCell>
                  <AdminTableCell className="text-white font-medium">
                    {t.pair}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`flex items-center gap-1 text-xs font-medium ${t.direction === "long" ? "text-green-400" : "text-red-400"}`}
                    >
                      {t.direction === "long" ? (
                        <TrendingUp size={12} />
                      ) : (
                        <TrendingDown size={12} />
                      )}
                      {t.direction === "long" ? "롱" : "숏"}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell className="text-yellow-500 text-xs">
                    {t.leverage}x
                  </AdminTableCell>
                  <AdminTableCell className="text-xs">
                    {formatDisplayNumber(t.entryPrice, {
                      maximumFractionDigits: 6,
                    })}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs">
                    {formatDisplayNumber(t.exitPrice, {
                      maximumFractionDigits: 6,
                    })}
                  </AdminTableCell>
                  <AdminTableCell
                    className={`text-xs font-medium ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {formatUsdt(t.pnl, { signed: true })}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs">
                    {formatUsdt(t.fee)}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        t.status === "closed"
                          ? "bg-gray-700 text-gray-300"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {t.status === "closed" ? "종료" : "청산"}
                    </span>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
          </div>
        </div>
      )}

      {activeTab === "points" && (
        <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <AdminTable headers={["시간", "유형", "금액", "잔액", "설명"]}>
              {mockPointHistory.map((p) => (
                <AdminTableRow key={p.id}>
                  <AdminTableCell className="text-xs whitespace-nowrap text-gray-400">
                    {p.date}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        p.type === "deposit"
                          ? "bg-green-500/10 text-green-400"
                          : p.type === "earn"
                            ? "bg-green-500/10 text-green-400"
                            : p.type === "withdraw"
                              ? "bg-red-500/10 text-red-400"
                              : p.type === "fee"
                                ? "bg-yellow-500/10 text-yellow-400"
                                : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {p.type === "deposit"
                        ? "입금"
                        : p.type === "earn"
                          ? "수익"
                          : p.type === "withdraw"
                            ? "출금"
                            : p.type === "fee"
                              ? "수수료"
                              : "손실"}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell
                    className={`font-medium ${p.amount >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {formatUsdt(p.amount, { signed: true })}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-300">
                    {formatUsdt(p.balance)}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs">
                    {p.desc}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <AdminTable headers={["시간", "활동", "IP", "디바이스"]}>
              {mockLogs.map((l) => (
                <AdminTableRow key={l.id}>
                  <AdminTableCell className="text-xs whitespace-nowrap text-gray-400">
                    {l.date}
                  </AdminTableCell>
                  <AdminTableCell className="text-white text-xs">
                    {l.action}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs font-mono">
                    {l.ip}
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs">
                    {l.device}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTable>
          </div>
        </div>
      )}

      {/* 액션 모달 */}
      <AdminModal
        isOpen={isActionModalOpen}
        onClose={() => setIsActionModalOpen(false)}
        title={
          actionType === "suspend"
            ? "계정 정지"
            : actionType === "adjust"
              ? "잔액 조정"
              : "2FA 초기화"
        }
      >
        {actionType === "adjust" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              현재 잔액:{" "}
              <span className="text-white font-medium">
                {formatUsdt(m.points)}
              </span>
            </p>
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-400 w-16 shrink-0">
                금액
              </label>
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="양수=지급, 음수=차감"
                className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-400 w-16 shrink-0">
                사유
              </label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="조정 사유 입력"
                className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
              <button
                onClick={() => setIsActionModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
              >
                취소
              </button>
              <button
                disabled={!adjustAmount || !adjustReason}
                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold text-sm rounded transition-colors"
              >
                적용
              </button>
            </div>
          </div>
        )}
        {actionType === "suspend" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle size={20} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-400">
                계정을 정지하면 해당 회원은 로그인, 거래, 입출금이 불가합니다.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-400 w-16 shrink-0">
                사유
              </label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="정지 사유 입력"
                className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
              <button
                onClick={() => setIsActionModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
              >
                취소
              </button>
              <button
                disabled={!adjustReason}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-sm rounded transition-colors"
              >
                정지
              </button>
            </div>
          </div>
        )}
        {actionType === "reset2fa" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <Shield size={20} className="text-yellow-400 shrink-0" />
              <p className="text-sm text-yellow-400">
                2FA를 초기화하면 회원이 다시 설정해야 합니다. 본인 확인 후
                진행하세요.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
              <button
                onClick={() => setIsActionModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
              >
                취소
              </button>
              <button className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-sm rounded transition-colors">
                초기화
              </button>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
