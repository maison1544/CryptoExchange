"use client";

import React, { useState } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { PartnerListTab } from "./components/PartnerListTab";
import { CommissionTab } from "./components/CommissionTab";
import { PartnerWithdrawTab } from "./components/PartnerWithdrawTab";
import { PartnerLogTab } from "./components/PartnerLogTab";

const TABS = [
  { id: "list", label: "파트너 / 가입코드" },
  { id: "commissions", label: "커미션 관리" },
  { id: "withdraw", label: "파트너 출금" },
  { id: "logs", label: "활동 로그" },
];

export default function PartnersPage() {
  const [activeTab, setActiveTab] = useState("list");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <AdminPageHeader
        title="파트너 관리"
        description="파트너 목록과 가입코드, 커미션, 출금 승인, 활동 로그를 통합 관리합니다."
      />

      <AdminTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div>
        {activeTab === "list" && <PartnerListTab />}
        {activeTab === "commissions" && <CommissionTab />}
        {activeTab === "withdraw" && <PartnerWithdrawTab />}
        {activeTab === "logs" && <PartnerLogTab />}
      </div>
    </div>
  );
}
