import React from "react";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { AdminButton } from "@/components/admin/ui/AdminForms";
import { formatUsdt } from "@/lib/utils/numberFormat";

export type AdminTradeDetail = {
  id: string | number;
  date: string;
  email: string;
  symbol: string;
  type: string;
  marginMode: "cross" | "isolated";
  margin: number;
  leverage: string;
  entryPrice: number;
  size: number;
  pnl: number;
  fee: number;
  status: string;
  userId?: string;
  openedAt?: string;
};

interface AdminTradeDetailModalProps {
  trade: AdminTradeDetail | null;
  onClose: () => void;
  onForceClose?: (trade: AdminTradeDetail) => void;
}

export function AdminTradeDetailModal({
  trade,
  onClose,
  onForceClose,
}: AdminTradeDetailModalProps) {
  const statusTone =
    trade?.status === "진행중"
      ? "bg-blue-500/10 text-blue-400"
      : trade?.status === "강제청산"
        ? "bg-red-500/10 text-red-400"
        : "bg-gray-500/10 text-gray-300";

  return (
    <AdminModal isOpen={!!trade} onClose={onClose} title="거래 상세 정보">
      {trade && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-white">
                {trade.symbol}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${trade.type === "롱" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
              >
                {trade.type}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusTone}`}
              >
                {trade.status}
              </span>
              <span className="rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">
                {trade.marginMode === "isolated" ? "격리" : "교차"}
              </span>
              <span className="rounded bg-blue-800/50 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                {trade.leverage}
              </span>
            </div>
            <span className="text-xs text-gray-500">#{trade.id}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg bg-surface p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">이메일</span>
              <span className="text-white">{trade.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">일시</span>
              <span className="text-white">{trade.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">증거금</span>
              <span className="font-medium text-white">
                {formatUsdt(trade.margin)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">레버리지</span>
              <span className="font-medium text-blue-400">
                {trade.leverage}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">손익</span>
              <span
                className={`font-medium ${trade.pnl > 0 ? "text-green-400" : trade.pnl < 0 ? "text-red-400" : "text-white"}`}
              >
                {formatUsdt(trade.pnl, { signed: true })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">수수료</span>
              <span className="text-gray-300">{formatUsdt(trade.fee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">진입가</span>
              <span className="text-white">
                {trade.entryPrice > 0
                  ? `${trade.entryPrice.toLocaleString()} USDT`
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">수량</span>
              <span className="text-white">
                {trade.size > 0 ? trade.size.toLocaleString() : "-"}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <AdminButton variant="secondary" onClick={onClose}>
              닫기
            </AdminButton>
            {trade.status === "진행중" && onForceClose && (
              <AdminButton variant="danger" onClick={() => onForceClose(trade)}>
                강제청산
              </AdminButton>
            )}
          </div>
        </div>
      )}
    </AdminModal>
  );
}
