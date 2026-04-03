"use client";

import { useState } from "react";

export default function LogsPage() {
  const [filterType, setFilterType] = useState("일반");
  const [sortField, setSortField] = useState("최근활동");
  const [sortOrder, setSortOrder] = useState("내림차순");
  const [searchType, setSearchType] = useState("이메일");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">회원 로그</h1>
        <p className="text-gray-400 text-sm">회원 활동 로그</p>
      </div>

      {/* 필터 */}
      <div className="bg-[#111827] border border-gray-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">회원구분</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="전체">전체</option>
              <option value="일반">일반</option>
              <option value="정지">정지</option>
              <option value="탈퇴">탈퇴</option>
              <option value="테스트">테스트</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">정렬기준</label>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="최근활동">최근활동</option>
              <option value="가입일">가입일</option>
              <option value="이메일">이메일</option>
              <option value="회원명">회원명</option>
              <option value="잔고액">잔고액</option>
              <option value="파트너아이디">파트너아이디</option>
              <option value="총입금">총입금</option>
              <option value="총출금">총출금</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">정렬순서</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="내림차순">내림차순</option>
              <option value="오름차순">오름차순</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
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
              <option value="가입코드">가입코드</option>
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

      {/* 목록 */}
      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">회원 로그 목록</h2>
          <span className="text-sm text-gray-500">전체 0명</span>
        </div>
        <div className="p-12 text-center">
          <p className="text-gray-500">회원 데이터가 없습니다.</p>
        </div>
      </div>
    </div>
  );
}
