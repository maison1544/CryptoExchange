"use client";

import React, { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { MemberListTab } from "./components/MemberListTab";
import { MemberTradesTab } from "./components/MemberTradesTab";
import { MemberLogsTab } from "./components/MemberLogsTab";
import { MemberBalanceTab } from "./components/MemberBalanceTab";
import { MemberApprovalTab } from "./components/MemberApprovalTab";

const TABS = [
  { id: "list", label: "회원 목록" },
  { id: "approval", label: "가입 승인" },
  { id: "trades", label: "거래 내역" },
  { id: "balance", label: "입출금 내역" },
  { id: "logs", label: "활동 로그" },
];

function MembersInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTab = searchParams.get("tab");
  const activeTab = TABS.some((tab) => tab.id === searchTab)
    ? searchTab!
    : "list";

  const handleTabChange = (tabId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (tabId === "list") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", tabId);
    }

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <AdminPageHeader
        title="회원 관리"
        description="가입 회원 목록 및 활동 내역을 통합 관리합니다."
      />

      <AdminTabs tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

      <div>
        {activeTab === "list" && <MemberListTab />}
        {activeTab === "approval" && <MemberApprovalTab />}
        {activeTab === "trades" && <MemberTradesTab />}
        {activeTab === "balance" && <MemberBalanceTab />}
        {activeTab === "logs" && <MemberLogsTab />}
      </div>
    </div>
  );
}

export default function MembersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">로딩 중...</div>}>
      <MembersInner />
    </Suspense>
  );
}
