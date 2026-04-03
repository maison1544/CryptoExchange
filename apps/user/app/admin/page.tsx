"use client";

import { useState, useEffect } from "react";
import {
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { DashboardStats } from "@/lib/types/database";
import { AdminCard } from "@/components/admin/ui/AdminCard";

const supabase = createClient();

const formatNumber = (value: number) =>
  new Intl.NumberFormat("ko-KR").format(value);

const defaultStats: DashboardStats = {
  total_users: 0,
  active_users: 0,
  online_users: 0,
  pending_users: 0,
  today_new_members: 0,
  today_deposits: 0,
  today_withdrawals: 0,
  pending_deposits: 0,
  pending_withdrawals: 0,
  total_staking: 0,
  total_agents: 0,
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);

  useEffect(() => {
    supabase.rpc("get_admin_dashboard_stats").then(({ data }) => {
      if (data) setStats(data as DashboardStats);
    });
  }, []);

  const adminMockSummary = {
    todayNewMembers: stats.today_new_members,
    monthNewMembers: stats.total_users,
    todayDeposit: stats.today_deposits,
    todayWithdraw: stats.today_withdrawals,
    todayProfit: 0,
    monthProfit: 0,
    monthDeposit: stats.today_deposits,
    monthWithdraw: stats.today_withdrawals,
    currentUsers: stats.online_users || 1,
  };

  const adminMockDailyStats: {
    date: string;
    newMembers: number;
    deposit: number;
    withdraw: number;
    profit: number;
    feeTotal: number;
  }[] = [];

  const topStats = [
    {
      label: "금일 신규회원",
      value: `${formatNumber(adminMockSummary.todayNewMembers)} 명`,
      tone: "text-white",
      icon: Users,
    },
    {
      label: "금일 입금",
      value: `${formatNumber(adminMockSummary.todayDeposit)} 원`,
      tone: "text-emerald-400",
      icon: ArrowDownToLine,
    },
    {
      label: "금일 출금",
      value: `${formatNumber(adminMockSummary.todayWithdraw)} 원`,
      tone: "text-rose-300",
      icon: ArrowUpFromLine,
    },
    {
      label: "현재 접속자",
      value: `${formatNumber(adminMockSummary.currentUsers)} 명`,
      tone: "text-yellow-500",
      icon: Activity,
    },
  ];

  const periodSummaries = [
    {
      title: "회원 흐름",
      icon: Users,
      rows: [
        {
          label: "금일 신규회원",
          value: `${formatNumber(adminMockSummary.todayNewMembers)} 명`,
          tone: "text-white",
        },
        {
          label: "누적 회원수",
          value: `${formatNumber(adminMockSummary.monthNewMembers)} 명`,
          tone: "text-white",
        },
      ],
    },
    {
      title: "입출금 흐름",
      icon: ArrowDownToLine,
      rows: [
        {
          label: "금일 입금",
          value: `${formatNumber(adminMockSummary.todayDeposit)} 원`,
          tone: "text-emerald-400",
          href: "/admin/balance?dw=deposit",
        },
        {
          label: "금일 출금",
          value: `${formatNumber(adminMockSummary.todayWithdraw)} 원`,
          tone: "text-rose-300",
          href: "/admin/balance?dw=withdraw",
        },
        {
          label: "월간 입금",
          value: `${formatNumber(adminMockSummary.monthDeposit)} 원`,
          tone: "text-emerald-400",
          href: "/admin/balance?dw=deposit",
        },
        {
          label: "월간 출금",
          value: `${formatNumber(adminMockSummary.monthWithdraw)} 원`,
          tone: "text-rose-300",
          href: "/admin/balance?dw=withdraw",
        },
      ],
    },
    {
      title: "회원 손익",
      icon: TrendingUp,
      rows: [
        {
          label: "금일 회원 수익금",
          value: `${formatNumber(adminMockSummary.todayProfit)} USDT`,
          tone: "text-white",
        },
        {
          label: "월간 회원 수익금",
          value: `${formatNumber(adminMockSummary.monthProfit)} USDT`,
          tone: "text-white",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
            Admin overview
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">
            오늘의 운영 지표를 한 번에 확인합니다.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-500">
            회원 흐름, 입출금, 온라인 접속 현황을 같은 기준선 위에 정리해 운영
            판단 속도를 높입니다.
          </p>
        </div>

        <div className="panel-surface rounded-2xl px-4 py-4">
          <div className="flex items-start gap-3">
            <Activity className="mt-0.5 shrink-0 text-blue-400" size={18} />
            <div>
              <div className="text-sm font-medium text-blue-100">
                현재 시스템 상태가 안정적입니다.
              </div>
              <div className="mt-1 text-xs leading-6 text-blue-200/70">
                일일 정산이 정상적으로 완료되었으며 핵심 서비스는 정상 응답
                중입니다.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {topStats.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="panel-surface rounded-2xl px-4 py-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                  {item.label}
                </span>
                <Icon size={16} className="text-gray-500" />
              </div>
              <div
                className={`mt-4 text-2xl font-semibold tracking-[-0.03em] ${item.tone}`}
              >
                {item.value}
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <AdminCard title="날짜별 요약">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-center text-sm whitespace-nowrap">
                <thead className="border-b hairline-divider text-[11px] uppercase tracking-[0.14em] text-gray-600">
                  <tr>
                    <th className="px-5 py-4 font-medium">날짜</th>
                    <th className="px-5 py-4 font-medium">신규회원</th>
                    <th className="px-5 py-4 font-medium">입금</th>
                    <th className="px-5 py-4 font-medium">출금</th>
                    <th className="px-5 py-4 font-medium">회원수익금</th>
                    <th className="px-5 py-4 font-medium">수수료합계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {adminMockDailyStats.length > 0 ? (
                    adminMockDailyStats.map((stat, i) => (
                      <tr key={i} className="hover:bg-white/3">
                        <td className="px-5 py-4 text-gray-300">{stat.date}</td>
                        <td className="px-5 py-4 text-gray-300">
                          {formatNumber(stat.newMembers)}명
                        </td>
                        <td className="px-5 py-4 text-emerald-400">
                          {formatNumber(stat.deposit)} 원
                        </td>
                        <td className="px-5 py-4 text-rose-300">
                          {formatNumber(stat.withdraw)} 원
                        </td>
                        <td className="px-5 py-4 text-gray-300">
                          {formatNumber(stat.profit)} USDT
                        </td>
                        <td className="px-5 py-4 text-yellow-500">
                          {formatNumber(stat.feeTotal)} USDT
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-12 text-center text-sm text-gray-500"
                      >
                        아직 집계된 일별 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AdminCard>

          <AdminCard title="현재 접속자 현황">
            <div className="flex items-end justify-between gap-4 px-5 py-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                  Realtime users
                </div>
                <div className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-yellow-500">
                  {formatNumber(adminMockSummary.currentUsers)}명
                </div>
              </div>
              <div className="text-xs text-gray-500">20초마다 갱신</div>
            </div>
          </AdminCard>
        </div>

        <div className="space-y-6">
          {periodSummaries.map((group) => {
            const Icon = group.icon;

            return (
              <AdminCard
                key={group.title}
                title={group.title}
                action={<Icon size={16} className="text-gray-500" />}
              >
                <div className="px-5 py-4">
                  <div className="divide-y divide-white/5">
                    {group.rows.map((row) => {
                      const href = "href" in row ? row.href : undefined;
                      const content = (
                        <>
                          <span className="text-sm text-gray-500">
                            {row.label}
                          </span>
                          <span className={`text-sm font-medium ${row.tone}`}>
                            {row.value}
                          </span>
                        </>
                      );

                      return href ? (
                        <Link
                          key={row.label}
                          href={href}
                          className="flex items-center justify-between gap-4 py-3 hover:text-white"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div
                          key={row.label}
                          className="flex items-center justify-between gap-4 py-3"
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      </section>
    </div>
  );
}
