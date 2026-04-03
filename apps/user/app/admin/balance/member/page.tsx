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

export default function MemberBalancePage() {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [txType, setTxType] = useState("입금");
  const [memberType, setMemberType] = useState("일반");
  const [searchType, setSearchType] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");

  const stats = [
    { label: `조회일자 열 입금건수`, value: "0건" },
    { label: `조회일자 처리중 입금금액`, value: "0원" },
    { label: `조회일자 처리완료 입금금액`, value: "0원" },
    { label: `조회일자 총 취소금액`, value: "0원" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">입출금 관리</h1>
        <p className="text-gray-400 text-sm">회원 입출금 리스트</p>
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
            key: "txType",
            label: "구분",
            control: (
              <AdminSelect
                value={txType}
                onChange={(e) => setTxType(e.target.value)}
              >
                <option value="입금">입금</option>
                <option value="출금">출금</option>
              </AdminSelect>
            ),
          },
          {
            key: "memberType",
            label: "회원구분",
            control: (
              <AdminSelect
                value={memberType}
                onChange={(e) => setMemberType(e.target.value)}
              >
                <option value="일반">일반</option>
                <option value="테스트">테스트</option>
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
              className="min-w-0 flex-1 md:max-w-36"
            />
            <AdminButton className="shrink-0 whitespace-nowrap">
              검색
            </AdminButton>
          </div>
        }
      />

      {/* 요약 통계 */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-[#111827] border border-gray-800 rounded-lg p-4"
          >
            <p className="text-2xl font-bold text-white mb-1">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 리스트 테이블 */}
      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">
            회원 {txType} 리스트
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {[
                  "신청일시",
                  "아이디",
                  "이름",
                  "파트너",
                  "내용",
                  "금액",
                  "계좌정보",
                  "상태",
                  "처리시간",
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
                  colSpan={10}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  입출금 내역이 없습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
