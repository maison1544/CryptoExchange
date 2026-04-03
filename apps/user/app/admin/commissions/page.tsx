"use client";

import { useState } from "react";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
} from "@/components/admin/ui/AdminForms";

const today = new Date().toISOString().split("T")[0];
const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

export default function CommissionsPage() {
  const [commissionType, setCommissionType] = useState("커미션1");
  const [startDate, setStartDate] = useState(threeMonthsAgo);
  const [endDate, setEndDate] = useState(today);
  const [memberId, setMemberId] = useState("");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">커미션 관리</h1>
        <p className="text-gray-400 text-sm">커미션 내역 조회</p>
      </div>

      {/* 검색 필터 */}
      <AdminSearchFilterCard
        fields={[
          {
            key: "commissionType",
            label: "커미션 타입",
            control: (
              <AdminSelect
                value={commissionType}
                onChange={(e) => setCommissionType(e.target.value)}
              >
                <option value="커미션1">커미션1</option>
                <option value="커미션2">커미션2</option>
              </AdminSelect>
            ),
          },
          {
            key: "date",
            label: "기간",
            control: (
              <AdminDateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            ),
            className: "md:col-span-2",
          },
        ]}
        fieldsClassName="md:grid-cols-5"
        searchLabel="회원 이메일"
        searchControls={
          <div
            className="grid min-w-0 items-end gap-2"
            style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
          >
            <AdminInput
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="회원 이메일 입력"
              className="min-w-0 w-full"
            />
            <AdminButton className="shrink-0 whitespace-nowrap">
              검색
            </AdminButton>
          </div>
        }
      />

      {/* 커미션 내역 */}
      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">
            커미션 내역{" "}
            <span className="text-sm font-normal text-gray-500">
              (전체 0건)
            </span>
          </h2>
        </div>
        <div className="p-12 text-center">
          <p className="text-gray-500">커미션 데이터가 없습니다.</p>
        </div>
      </div>
    </div>
  );
}
