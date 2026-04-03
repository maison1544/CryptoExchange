"use client";

import React, { useState, useEffect } from "react";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { AdminButton } from "@/components/admin/ui/AdminForms";
import { FuturesCloseConfirmContent } from "@/components/trading/FuturesCloseConfirmContent";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type ForceClosePosition = {
  id: string | number;
  symbol: string;
  direction: string;
  marginMode: string;
  leverage: string;
  margin: number;
  entryPrice?: number;
  size?: number;
  pnl: number;
  fee: number;
  status: string;
  email?: string;
  date?: string;
  userId?: string;
  openedAt?: string;
};

interface AdminForceCloseModalProps {
  position: ForceClosePosition | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminForceCloseModal({
  position,
  onClose,
  onSuccess,
}: AdminForceCloseModalProps) {
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markPrice, setMarkPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!position) return;
    setNote("");
    setError(null);
    setMarkPrice(null);
    fetch(
      `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(position.symbol)}`,
    )
      .then((r) => r.json())
      .then((d: { price?: string }) => {
        const p = Number(d.price);
        if (Number.isFinite(p) && p > 0) setMarkPrice(p);
      })
      .catch(() => {});
  }, [position]);

  if (!position) return null;

  const isOpen = position.status === "진행중" || position.status === "open";
  const dirLabel =
    position.direction === "long" || position.direction === "롱" ? "롱" : "숏";
  const entryPrice = position.entryPrice || 0;
  const size = position.size || 0;
  const margin = position.margin;

  const currentPrice = markPrice || 0;
  const estimatedPnl =
    currentPrice > 0 && size > 0
      ? Number(
          (dirLabel === "롱"
            ? (currentPrice - entryPrice) * size
            : (entryPrice - currentPrice) * size
          ).toFixed(4),
        )
      : position.pnl;
  const cappedPnl = Math.max(estimatedPnl, -margin);
  const roe = margin > 0 ? (estimatedPnl / margin) * 100 : 0;
  const feeRate = 0.00035;
  const closeFee =
    currentPrice > 0 && size > 0
      ? Number((currentPrice * size * feeRate).toFixed(4))
      : 0;
  const expectedReturn = Math.max(0, margin + cappedPnl - closeFee);

  const handleForceClose = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/futures/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          positionId: String(position.id),
          action: "force-liquidate",
          note: note || null,
          userId: position.userId,
          symbol: position.symbol,
          openedAt: position.openedAt,
          direction: position.direction,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setError(result.error || "청산에 실패했습니다.");
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AdminModal
      isOpen={!!position}
      onClose={onClose}
      title={`${position.symbol} ${dirLabel === "롱" ? "매수" : "매도"} 청산 확인`}
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          현재 마크가격 기준 손익과 반환 예정 금액을 확인한 뒤 청산을
          확정합니다.
        </p>

        <FuturesCloseConfirmContent
          email={position.email}
          marginMode={position.marginMode}
          markPrice={markPrice}
          entryPrice={entryPrice}
          margin={margin}
          size={size}
          pnl={estimatedPnl}
          roe={roe}
          feeRate={feeRate}
          closeFee={closeFee}
          expectedReturn={expectedReturn}
          note={note}
          onNoteChange={setNote}
          error={error}
        />

        <div className="flex gap-2 pt-2 border-t border-gray-800">
          <AdminButton variant="secondary" onClick={onClose} className="flex-1">
            취소
          </AdminButton>
          {isOpen && (
            <AdminButton
              variant="danger"
              onClick={handleForceClose}
              disabled={isProcessing || !markPrice}
              className="flex-1"
            >
              {isProcessing ? "처리 중..." : "청산 확인"}
            </AdminButton>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
