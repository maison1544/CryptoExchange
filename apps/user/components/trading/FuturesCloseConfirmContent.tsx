"use client";

import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

interface FuturesCloseConfirmContentProps {
  email?: string;
  marginMode: string;
  markPrice: number | null;
  entryPrice: number;
  margin: number;
  size: number;
  pnl: number;
  roe: number;
  feeRate: number;
  closeFee: number;
  expectedReturn: number;
  note?: string;
  onNoteChange?: (value: string) => void;
  error?: string | null;
}

export function FuturesCloseConfirmContent({
  email,
  marginMode,
  markPrice,
  entryPrice,
  margin,
  size,
  pnl,
  roe,
  feeRate,
  closeFee,
  expectedReturn,
  note,
  onNoteChange,
  error,
}: FuturesCloseConfirmContentProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {email && (
          <div className="col-span-2 flex justify-between">
            <span className="text-gray-500">이메일</span>
            <span className="text-white">{email}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">마진모드</span>
          <span className="text-white">
            {marginMode === "isolated" ? "격리" : "교차"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">현재가격</span>
          <span className="text-white">
            {markPrice
              ? `${formatDisplayNumber(markPrice, {
                  maximumFractionDigits: 2,
                })} USDT`
              : "로딩중..."}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">진입가</span>
          <span className="text-white">
            {entryPrice > 0
              ? `${formatDisplayNumber(entryPrice, {
                  maximumFractionDigits: 2,
                })} USDT`
              : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">증거금</span>
          <span className="text-white">
            {formatUsdt(margin, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">수량</span>
          <span className="text-white">
            {size > 0
              ? formatDisplayNumber(size, { maximumFractionDigits: 4 })
              : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">미실현 손익</span>
          <span className={pnl >= 0 ? "text-green-400" : "text-red-400"}>
            {formatUsdt(pnl, {
              signed: true,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">수익률</span>
          <span className={roe >= 0 ? "text-green-400" : "text-red-400"}>
            {formatDisplayNumber(roe, {
              signed: true,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            %
          </span>
        </div>
      </div>

      <div className="space-y-2 border-t border-gray-800 pt-3 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">
            청산 수수료 (
            {formatDisplayNumber(feeRate * 100, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            })}
            %)
          </span>
          <span className="text-white">
            {formatUsdt(closeFee, {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            })}
          </span>
        </div>
        <div className="flex justify-between font-medium">
          <span className="text-gray-300">예상 반환금액 (수수료 차감)</span>
          <span className="text-yellow-400">
            {formatUsdt(expectedReturn, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {onNoteChange && (
        <div>
          <label className="mb-1 block text-xs text-gray-400">
            청산 사유 (선택)
          </label>
          <textarea
            value={note ?? ""}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={2}
            className="w-full resize-none rounded border border-gray-700 bg-surface px-3 py-2 text-sm text-white transition-colors focus:border-yellow-500 focus:outline-none"
            placeholder="강제청산 사유를 입력하세요"
          />
        </div>
      )}

      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
