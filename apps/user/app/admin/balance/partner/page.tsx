"use client";

import { formatDisplayNumber, formatKrw } from "@/lib/utils/numberFormat";

const mockPartnerWithdraws = [
  {
    id: 1,
    requestDate: "2025-12-09 23:28:12",
    partnerId: "admin",
    content: "출금신청",
    amount: 11.0,
    krwRate: 1444.0,
    krwAmount: 15884,
    status: "처리완료",
  },
];

export default function PartnerWithdrawPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">입출금 관리</h1>
        <p className="text-gray-400 text-sm">파트너 출금 리스트</p>
      </div>

      <div className="bg-[#111827] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">파트너 출금 목록</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {[
                  "신청일시",
                  "아이디",
                  "내용",
                  "출금",
                  "달러매도가",
                  "원화",
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
              {mockPartnerWithdraws.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                    {item.requestDate}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {item.partnerId}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{item.content}</td>
                  <td className="px-4 py-3 text-red-400 whitespace-nowrap">
                    {formatDisplayNumber(item.amount, {
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2,
                    })}{" "}
                    $
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {formatDisplayNumber(item.krwRate, {
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {formatKrw(item.krwAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        item.status === "처리완료"
                          ? "bg-green-500/20 text-green-400"
                          : item.status === "대기중"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {item.status}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
