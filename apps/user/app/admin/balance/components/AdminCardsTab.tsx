"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
} from "@/components/admin/ui/AdminForms";
import { Pencil, Trash2 } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import { formatKrw, formatUsdt } from "@/lib/utils/numberFormat";
import {
  parseJsonSetting,
  stringifyJsonSetting,
} from "@/lib/utils/siteSettings";

interface ChargeCard {
  id: number;
  amount: number;
  bonus: number;
  totalAmount: number;
  isActive: boolean;
}

const supabase = createClient();
const STORAGE_KEY = "admin_charge_cards";

const EMPTY_FORM = {
  amount: "",
  bonus: "0",
  isActive: true,
};

function normalizeCard(
  card: Partial<ChargeCard>,
  fallbackId: number,
): ChargeCard {
  const amount = Number(card.amount) || 0;
  const bonus = Number(card.bonus) || 0;

  return {
    id: Number(card.id) || fallbackId,
    amount,
    bonus,
    totalAmount: amount + bonus,
    isActive: card.isActive !== false,
  };
}

// ── 충전권 추가/수정 모달 ─────────────────────────────────────────────────
function CardFormModal({
  card,
  onSave,
  onClose,
}: {
  card: ChargeCard | null;
  onSave: (data: Omit<ChargeCard, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(
    card
      ? {
          amount: String(card.amount),
          bonus: String(card.bonus),
          isActive: card.isActive,
        }
      : EMPTY_FORM,
  );

  const set = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const totalAmount = (Number(form.amount) || 0) + (Number(form.bonus) || 0);

  const handleSave = () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    const amt = Number(form.amount);
    const bns = Number(form.bonus) || 0;
    onSave({
      amount: amt,
      bonus: bns,
      totalAmount: amt + bns,
      isActive: form.isActive,
    });
  };

  return (
    <AdminModal
      isOpen={true}
      onClose={onClose}
      title={card ? "충전권 수정" : "새 충전권 추가"}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <AdminLabel>기본 금액 (원)</AdminLabel>
            <AdminInput
              type="number"
              className="w-full mt-1"
              placeholder="10000"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
          <div>
            <AdminLabel>보너스 (USDT)</AdminLabel>
            <AdminInput
              type="number"
              className="w-full mt-1"
              placeholder="0"
              value={form.bonus}
              onChange={(e) => set("bonus", e.target.value)}
            />
          </div>
        </div>

        <div className="bg-[#0f172a] rounded-lg p-4 flex justify-between items-center border border-gray-800">
          <span className="text-sm text-gray-400">총 지급액</span>
          <span className="text-xl font-black text-yellow-500">
            {formatUsdt(totalAmount)}
          </span>
        </div>

        <div>
          <AdminLabel>상태</AdminLabel>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="isActiveCheck"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 accent-yellow-500"
            />
            <label htmlFor="isActiveCheck" className="text-gray-300 text-sm">
              활성 상태
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
          <AdminButton variant="secondary" onClick={onClose}>
            취소
          </AdminButton>
          <AdminButton variant="primary" onClick={handleSave}>
            {card ? "수정하기" : "추가하기"}
          </AdminButton>
        </div>
      </div>
    </AdminModal>
  );
}

// ── 삭제 확인 모달 ────────────────────────────────────────────────────────
function DeleteConfirmModal({
  card,
  onConfirm,
  onCancel,
}: {
  card: ChargeCard;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AdminModal isOpen={true} onClose={onCancel} title="충전권 삭제">
      <div className="space-y-5">
        <p className="text-gray-300">
          <span className="text-white font-bold">{formatKrw(card.amount)}</span>{" "}
          충전권을 삭제하시겠습니까?
        </p>
        <p className="text-sm text-gray-500">
          삭제된 충전권은 복구할 수 없습니다.
        </p>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
          <AdminButton variant="secondary" onClick={onCancel}>
            취소
          </AdminButton>
          <AdminButton variant="danger" onClick={onConfirm}>
            삭제
          </AdminButton>
        </div>
      </div>
    </AdminModal>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export function AdminCardsTab() {
  const { addToast } = useNotification();
  const [cards, setCards] = useState<ChargeCard[]>([]);
  const [editTarget, setEditTarget] = useState<ChargeCard | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<ChargeCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadCards = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", STORAGE_KEY)
      .maybeSingle();

    if (error) {
      addToast({
        title: "충전권 불러오기 실패",
        message: error.message,
        type: "error",
      });
      setLoadError(error.message);
      setCards([]);
      setIsLoading(false);
      return;
    }

    const parsed = parseJsonSetting<Partial<ChargeCard>[]>(data?.value, []);
    setCards(parsed.map((card, index) => normalizeCard(card, index + 1)));
    setIsLoading(false);
  }, [addToast]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCards();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadCards]);

  const persistCards = useCallback(
    async (
      nextCards: ChargeCard[],
      successTitle: string,
      successMessage: string,
    ) => {
      setIsSaving(true);

      const { error } = await supabase.from("site_settings").upsert({
        key: STORAGE_KEY,
        value: stringifyJsonSetting(nextCards),
        updated_at: new Date().toISOString(),
      });

      setIsSaving(false);

      if (error) {
        addToast({
          title: "충전권 저장 실패",
          message: error.message,
          type: "error",
        });
        return false;
      }

      setCards(nextCards);
      addToast({
        title: successTitle,
        message: successMessage,
        type: "success",
      });
      return true;
    },
    [addToast],
  );

  const orderedCards = useMemo(
    () => [...cards].sort((a, b) => a.amount - b.amount),
    [cards],
  );

  const handleSave = async (data: Omit<ChargeCard, "id">) => {
    const normalizedData = normalizeCard(data, Date.now());
    const nextCards =
      editTarget === "new"
        ? [...cards, { ...normalizedData, id: Date.now() }]
        : editTarget
          ? cards.map((c) =>
              c.id === editTarget.id
                ? { ...normalizedData, id: editTarget.id }
                : c,
            )
          : cards;

    const success = await persistCards(
      nextCards,
      editTarget === "new" ? "충전권 추가 완료" : "충전권 수정 완료",
      editTarget === "new"
        ? "새 충전권이 저장되었습니다."
        : "충전권 설정이 업데이트되었습니다.",
    );

    if (success) {
      setEditTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const success = await persistCards(
      cards.filter((c) => c.id !== deleteTarget.id),
      "충전권 삭제 완료",
      "선택한 충전권이 삭제되었습니다.",
    );

    if (success) {
      setDeleteTarget(null);
    }
  };

  const toggleActive = async (id: number) => {
    const targetCard = cards.find((card) => card.id === id);
    if (!targetCard) {
      return;
    }

    await persistCards(
      cards.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c)),
      targetCard.isActive ? "충전권 비활성화" : "충전권 활성화",
      targetCard.isActive
        ? "충전권이 사용자 화면에서 숨겨집니다."
        : "충전권이 다시 노출됩니다.",
    );
  };

  return (
    <div className="space-y-6">
      {/* 추가/수정 모달 */}
      {editTarget !== null && (
        <CardFormModal
          card={editTarget === "new" ? null : editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <DeleteConfirmModal
          card={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-white">
          전체 <span className="text-yellow-500">{orderedCards.length}</span>개
          충전권
        </h2>
        <AdminButton onClick={() => setEditTarget("new")} disabled={isSaving}>
          + 새 충전권 추가
        </AdminButton>
      </div>

      {isLoading ? (
        <AdminCard title="충전권 목록">
          <AdminLoadingSpinner message="충전권 설정을 불러오는 중입니다." />
        </AdminCard>
      ) : loadError ? (
        <AdminCard title="충전권 목록">
          <AdminErrorState
            message={loadError}
            onRetry={() => void loadCards()}
          />
        </AdminCard>
      ) : orderedCards.length === 0 ? (
        <AdminCard title="충전권 목록">
          <AdminEmptyState message="등록된 충전권이 없습니다. 새 충전권을 추가해 주세요." />
        </AdminCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {orderedCards.map((card) => (
            <div
              key={card.id}
              className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-lg flex flex-col"
            >
              {/* 카드 헤더 */}
              <div
                className={`p-3 flex justify-between items-center border-b border-gray-800 ${card.isActive ? "bg-blue-500/10" : "bg-gray-800/50"}`}
              >
                <button
                  onClick={() => toggleActive(card.id)}
                  disabled={isSaving}
                  className={`flex items-center gap-1.5 text-sm font-bold transition-colors ${
                    card.isActive
                      ? "text-blue-400 hover:text-blue-300"
                      : "text-gray-500 hover:text-gray-400"
                  }`}
                  title="클릭하여 상태 전환"
                >
                  <span>{card.isActive ? "✅" : "⭕"}</span>
                  {card.isActive ? "활성" : "비활성"}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditTarget(card)}
                    disabled={isSaving}
                    className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(card)}
                    disabled={isSaving}
                    className="text-red-400 hover:text-red-300 transition-colors p-1 rounded hover:bg-gray-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* 카드 본문 */}
              <div className="p-5 space-y-4 flex-1">
                <div className="text-center border-b border-gray-800 pb-4">
                  <p className="text-xs text-gray-400 mb-1">기본 금액</p>
                  <p className="text-xl font-bold text-white">
                    {formatKrw(card.amount)}
                  </p>
                </div>

                {card.bonus > 0 && (
                  <div className="text-center border-b border-gray-800 pb-4">
                    <p className="text-xs text-gray-400 mb-1">보너스</p>
                    <p className="text-lg font-bold text-white">
                      {formatUsdt(card.bonus, { signed: true })}
                    </p>
                  </div>
                )}

                <div className="text-center pt-2 border-b border-gray-800 pb-4">
                  <p className="text-xs text-gray-400 mb-1">총 지급액</p>
                  <p className="text-2xl font-black text-white">
                    {formatUsdt(card.totalAmount)}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">노출 상태</p>
                  <p className="text-sm font-bold text-white">
                    {card.isActive ? "활성" : "비활성"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminCard title="💡 충전권 설정 가이드">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-400 ml-4">
          <li>
            <strong>기본 금액:</strong> 사용자가 실제로 결제하는 금액입니다.
          </li>
          <li>
            <strong>보너스:</strong> 충전 시 추가로 지급되는 USDT입니다.
          </li>
          <li>
            <strong>총 지급액:</strong> 기본 금액과 보너스를 합산한 최종
            지급액입니다.
          </li>
          <li>
            비활성 상태의 충전권은 사용자 앱 충전 화면에 노출되지 않습니다.
          </li>
        </ul>
      </AdminCard>
    </div>
  );
}
