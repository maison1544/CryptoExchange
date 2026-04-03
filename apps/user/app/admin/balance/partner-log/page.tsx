"use client";

import { useState } from "react";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import { AdminButton, AdminInput } from "@/components/admin/ui/AdminForms";

const today = new Date().toISOString().split("T")[0];

export default function PartnerBalanceLogPage() {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [partnerId, setPartnerId] = useState("");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">입출금 관리</h1>
        <p className="text-gray-400 text-sm">파트너 입출금 로그</p>
      </div>

      <AdminSearchFilterCard
        fields={[
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
          },
        ]}
        searchLabel="파트너 ID"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder="파트너 ID 입력"
              className="min-w-0 flex-1 md:max-w-36"
            />
            <AdminButton className="shrink-0 whitespace-nowrap">
              검색
            </AdminButton>
          </div>
        }
      />

      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">파트너 입출금 로그</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {[
                  "일시",
                  "파트너 ID",
                  "구분",
                  "금액",
                  "달러매도가",
                  "원화",
                  "잔액",
                  "메모",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  데이터가 없습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
