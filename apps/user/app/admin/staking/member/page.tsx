"use client";

import { useState } from "react";

export default function MemberStakingPage() {
  const [searchType, setSearchType] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">회원 스테이킹</h1>
        <p className="text-gray-400 text-sm">회원 스테이킹 현황</p>
      </div>

      <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="전체">전체</option>
              <option value="스테이킹중">스테이킹중</option>
              <option value="해제">해제</option>
              <option value="만료">만료</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">검색구분</label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="전체">전체</option>
              <option value="이메일">이메일</option>
              <option value="회원명">회원명</option>
              <option value="파트너아이디">파트너아이디</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">검색어</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색어 입력"
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 w-40"
            />
          </div>
          <button className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded text-sm transition-colors">
            검색
          </button>
        </div>
      </div>

      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">스테이킹 목록</h2>
          <span className="text-sm text-gray-500">전체 0건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {[
                  "시작일",
                  "만료일",
                  "이메일",
                  "이름",
                  "파트너",
                  "코인",
                  "스테이킹액",
                  "만기일수",
                  "수익률",
                  "예상수익",
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
                  colSpan={11}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  스테이킹 데이터가 없습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
