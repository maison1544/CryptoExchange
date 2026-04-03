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

export default function TradesPage() {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [sortField, setSortField] = useState("진입일");
  const [sortOrder, setSortOrder] = useState("내림차순");
  const [searchType, setSearchType] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">거래 관리</h1>
        <p className="text-gray-400 text-sm">회원 거래내역 리스트</p>
      </div>

      {/* 검색 필터 */}
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
          {
            key: "sortField",
            label: "정렬기준",
            control: (
              <AdminSelect
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
              >
                <option value="진입일">진입일</option>
                <option value="아이디">아이디</option>
                <option value="회원명">회원명</option>
                <option value="파트너아이디">파트너아이디</option>
                <option value="수익금">수익금</option>
              </AdminSelect>
            ),
          },
          {
            key: "sortOrder",
            label: "정렬순서",
            control: (
              <AdminSelect
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="내림차순">내림차순</option>
                <option value="오름차순">오름차순</option>
              </AdminSelect>
            ),
          },
          {
            key: "searchType",
            label: "검색구분",
            control: (
              <AdminSelect
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="전체">전체</option>
                <option value="이메일">이메일</option>
                <option value="회원명">회원명</option>
                <option value="가입코드">가입코드</option>
                <option value="파트너아이디">파트너아이디</option>
              </AdminSelect>
            ),
          },
        ]}
        searchLabel="검색어"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색어 입력"
              className="min-w-0 flex-1 md:max-w-40"
            />
            <AdminButton className="shrink-0 whitespace-nowrap">
              검색
            </AdminButton>
          </div>
        }
      />

      {/* 거래 목록 */}
      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">거래 목록</h2>
          <span className="text-sm text-gray-500">전체 0건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {[
                  "진입일시",
                  "아이디",
                  "이름",
                  "파트너",
                  "코인",
                  "방향",
                  "진입가",
                  "청산가",
                  "수량",
                  "수익금",
                  "수수료",
                  "상태",
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
                  colSpan={12}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  거래 데이터가 없습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
