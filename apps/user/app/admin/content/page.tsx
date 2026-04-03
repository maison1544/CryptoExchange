"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { InquiryManagementTab } from "./components/InquiryManagementTab";
import { MessageManagementTab } from "./components/MessageManagementTab";
import { PopupManagementTab } from "./components/PopupManagementTab";

const TABS = [
  { id: "inquiry", label: "1:1 문의" },
  { id: "message", label: "알림/메시지" },
  { id: "popup", label: "팝업 관리" },
];

export default function ContentPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTab = searchParams.get("tab");
  const activeTab = TABS.some((tab) => tab.id === searchTab)
    ? searchTab!
    : "inquiry";

  const handleTabChange = (tabId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (tabId === "inquiry") {
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
        title="고객센터/콘텐츠 관리"
        description="사용자 문의, 알림 발송, 사이트 팝업을 관리합니다."
      />

      <AdminTabs tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

      <div>
        {activeTab === "inquiry" && <InquiryManagementTab />}
        {activeTab === "message" && <MessageManagementTab />}
        {activeTab === "popup" && <PopupManagementTab />}
      </div>
    </div>
  );
}
