"use client";

import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { NoticeManagementSection } from "./components/NoticeManagementSection";

export default function AdminNoticePage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <AdminPageHeader
        title="공지사항 관리"
        description="공지사항, 이벤트, 점검, 긴급 공지를 관리합니다."
      />

      <NoticeManagementSection />
    </div>
  );
}
