"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from "@/components/admin/ui/AdminForms";
import {
  AdminTable,
  AdminTableCell,
  AdminTableRow,
} from "@/components/admin/ui/AdminTable";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { useNotification } from "@/contexts/NotificationContext";
import {
  createAdminPopup,
  deleteAdminPopup,
  fetchAdminPopups,
  updateAdminPopup,
  type AdminPopupItem,
  type AdminPopupPayload,
} from "@/lib/api/adminContent";

type PopupFormState = {
  title: string;
  content: string;
  imageUrl: string;
  linkUrl: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  target: "all" | "user" | "agent";
};

const INITIAL_FORM: PopupFormState = {
  title: "",
  content: "",
  imageUrl: "",
  linkUrl: "",
  startDate: "",
  endDate: "",
  isActive: true,
  target: "all",
};

function toPayload(form: PopupFormState): AdminPopupPayload {
  return {
    title: form.title.trim(),
    content: form.content.trim(),
    imageUrl: form.imageUrl.trim(),
    linkUrl: form.linkUrl.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    isActive: form.isActive,
    target: form.target,
  };
}

export function PopupManagementTab() {
  const { addToast } = useNotification();
  const [popups, setPopups] = useState<AdminPopupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PopupFormState>(INITIAL_FORM);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPopups = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const next = await fetchAdminPopups();
      setPopups(next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.";
      setLoadError(message);
      addToast({
        title: "팝업 목록을 불러오지 못했습니다.",
        message,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadPopups();
  }, [loadPopups]);

  const activeFormTitle = useMemo(() => {
    if (editingId) {
      return "팝업 수정";
    }

    return "팝업 등록";
  }, [editingId]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setIsAdding(false);
    setEditingId(null);
  };

  const startCreate = () => {
    setForm(INITIAL_FORM);
    setEditingId(null);
    setIsAdding(true);
  };

  const startEdit = (item: AdminPopupItem) => {
    setForm({
      title: item.title,
      content: item.content,
      imageUrl: item.imageUrl,
      linkUrl: item.linkUrl,
      startDate: item.startDate,
      endDate: item.endDate,
      isActive: item.isActive,
      target: item.target,
    });
    setEditingId(item.id);
    setIsAdding(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      if (editingId) {
        await updateAdminPopup(editingId, toPayload(form));
        addToast({
          title: "팝업을 수정했습니다.",
          message: `${form.title.trim()} 팝업이 저장되었습니다.`,
          type: "success",
        });
      } else {
        await createAdminPopup(toPayload(form));
        addToast({
          title: "팝업을 등록했습니다.",
          message: `${form.title.trim()} 팝업이 추가되었습니다.`,
          type: "success",
        });
      }

      resetForm();
      await loadPopups();
    } catch (error) {
      addToast({
        title: editingId
          ? "팝업 수정에 실패했습니다."
          : "팝업 등록에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await deleteAdminPopup(id);
      addToast({
        title: "팝업을 삭제했습니다.",
        message: `팝업 #${id} 이(가) 삭제되었습니다.`,
        type: "success",
      });
      if (editingId === id) {
        resetForm();
      }
      await loadPopups();
    } catch (error) {
      addToast({
        title: "팝업 삭제에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {isAdding && (
        <AdminCard title={activeFormTitle}>
          <div className="p-5 space-y-4">
            <div className="grid gap-2">
              <AdminLabel>제목</AdminLabel>
              <AdminInput
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="팝업 제목"
              />
            </div>
            <div className="grid gap-2">
              <AdminLabel>내용</AdminLabel>
              <textarea
                value={form.content}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, content: e.target.value }))
                }
                rows={5}
                placeholder="팝업 내용"
                className="w-full rounded-xl border border-white/8 bg-white/3 px-3.5 py-3 text-sm text-white placeholder:text-gray-600 focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none resize-none"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <AdminLabel>이미지 URL</AdminLabel>
                <AdminInput
                  value={form.imageUrl}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, imageUrl: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
              <div className="grid gap-2">
                <AdminLabel>링크 URL</AdminLabel>
                <AdminInput
                  value={form.linkUrl}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, linkUrl: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <AdminLabel>대상</AdminLabel>
                <AdminSelect
                  value={form.target}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      target: e.target.value as PopupFormState["target"],
                    }))
                  }
                >
                  <option value="all">전체</option>
                  <option value="user">회원</option>
                  <option value="agent">파트너</option>
                </AdminSelect>
              </div>
              <div className="grid gap-2">
                <AdminLabel>시작일</AdminLabel>
                <AdminInput
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <AdminLabel>종료일</AdminLabel>
                <AdminInput
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                }
                className="rounded border-gray-600 bg-gray-800 focus:ring-yellow-500"
              />
              활성 상태
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <AdminButton
                variant="secondary"
                onClick={resetForm}
                disabled={isSaving}
              >
                취소
              </AdminButton>
              <AdminButton
                onClick={handleSubmit}
                disabled={!form.title.trim() || isSaving}
              >
                {editingId ? "수정" : "등록"}
              </AdminButton>
            </div>
          </div>
        </AdminCard>
      )}

      <AdminCard
        title={`팝업 목록 (${popups.length}건)`}
        action={
          !isAdding && (
            <AdminButton size="sm" onClick={startCreate}>
              <Plus className="w-4 h-4" /> 팝업 등록
            </AdminButton>
          )
        }
      >
        {isLoading ? (
          <AdminLoadingSpinner message="팝업 목록을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError}
            onRetry={() => void loadPopups()}
          />
        ) : popups.length === 0 ? (
          <AdminEmptyState message="등록된 팝업이 없습니다." />
        ) : (
          <AdminTable
            headers={[
              "NO",
              "제목",
              "대상",
              "시작일",
              "종료일",
              "상태",
              "등록일",
              "관리",
            ]}
          >
            {popups.map((item) => (
              <AdminTableRow key={item.id}>
                <AdminTableCell>{item.id}</AdminTableCell>
                <AdminTableCell className="font-medium text-white text-left whitespace-normal wrap-break-word">
                  <div>{item.title}</div>
                  {item.content && (
                    <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                      {item.content}
                    </div>
                  )}
                </AdminTableCell>
                <AdminTableCell>{item.target}</AdminTableCell>
                <AdminTableCell>{item.startDate || "-"}</AdminTableCell>
                <AdminTableCell>{item.endDate || "-"}</AdminTableCell>
                <AdminTableCell>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      item.isActive
                        ? "bg-green-500/20 text-green-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {item.isActive ? "활성" : "비활성"}
                  </span>
                </AdminTableCell>
                <AdminTableCell>{item.createdAt}</AdminTableCell>
                <AdminTableCell>
                  <div className="flex justify-center gap-2">
                    <AdminButton
                      variant="secondary"
                      size="sm"
                      onClick={() => startEdit(item)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </AdminButton>
                    <AdminButton
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </AdminButton>
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}
