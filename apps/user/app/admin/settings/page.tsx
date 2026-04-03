"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { CoinSymbolsTab } from "./components/CoinSymbolsTab";
import { SiteSettingsTab } from "./components/SiteSettingsTab";
import { FeeSettingsTab } from "./components/FeeSettingsTab";

const TABS = [
  { id: "site", label: "사이트 기본 설정" },
  { id: "fee", label: "수수료 및 출금 설정" },
  { id: "symbols", label: "코인 관리" },
];

export default function SettingsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTab = searchParams.get("tab");
  const activeTab = TABS.some((tab) => tab.id === searchTab)
    ? searchTab!
    : "site";

  const handleTabChange = (tabId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (tabId === "site") {
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
        title="환경 설정"
        description="시스템 기본 설정, 수수료, 코인 관리 항목을 관리합니다."
      />

      <AdminTabs tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

      <div>
        {activeTab === "site" && <SiteSettingsTab />}
        {activeTab === "fee" && <FeeSettingsTab />}
        {activeTab === "symbols" && <CoinSymbolsTab />}
      </div>
    </div>
  );
}
