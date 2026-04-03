import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminInput, AdminButton } from "@/components/admin/ui/AdminForms";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils/formatDate";
import {
  loadSiteSettings,
  parseJsonSetting,
  saveSiteSettings,
  stringifyJsonSetting,
} from "@/lib/utils/siteSettings";
import { Trash2 } from "lucide-react";

type AutoReplyTemplate = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
};

type TemplateForm = {
  title: string;
  content: string;
};

const supabase = createClient();
const STORAGE_KEY = "admin_auto_reply_templates";
const EMPTY_FORM: TemplateForm = {
  title: "",
  content: "",
};

function normalizeTemplate(
  template: Partial<AutoReplyTemplate>,
  fallbackId: number,
): AutoReplyTemplate {
  return {
    id: Number(template.id) || fallbackId,
    title: String(template.title || "").trim(),
    content: String(template.content || "").trim(),
    createdAt: formatDateTime(template.createdAt || new Date()),
  };
}

export function AutoCommentTab() {
  const { addToast } = useNotification();
  const [templates, setTemplates] = useState<AutoReplyTemplate[]>([]);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TemplateForm>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const settings = await loadSiteSettings(supabase, [STORAGE_KEY]);
      const parsed = parseJsonSetting<Partial<AutoReplyTemplate>[]>(
        settings[STORAGE_KEY],
        [],
      );
      setTemplates(
        parsed
          .map((template, index) => normalizeTemplate(template, index + 1))
          .filter((template) => template.title && template.content),
      );
    } catch (error) {
      addToast({
        title: "자동답변 불러오기 실패",
        message:
          error instanceof Error
            ? error.message
            : "자동답변 템플릿을 불러오지 못했습니다.",
        type: "error",
      });
      setLoadError(
        error instanceof Error
          ? error.message
          : "자동답변 템플릿을 불러오지 못했습니다.",
      );
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const orderedTemplates = useMemo(
    () => [...templates].sort((a, b) => b.id - a.id),
    [templates],
  );

  const persistTemplates = useCallback(
    async (
      nextTemplates: AutoReplyTemplate[],
      title: string,
      message: string,
    ) => {
      try {
        setIsSaving(true);
        await saveSiteSettings(supabase, {
          [STORAGE_KEY]: stringifyJsonSetting(nextTemplates),
        });
        setTemplates(nextTemplates);
        addToast({ title, message, type: "success" });
        return true;
      } catch (error) {
        addToast({
          title: "자동답변 저장 실패",
          message:
            error instanceof Error
              ? error.message
              : "자동답변 템플릿을 저장하지 못했습니다.",
          type: "error",
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [addToast],
  );

  const handleAdd = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      addToast({
        title: "입력값 확인 필요",
        message: "제목과 내용을 모두 입력해 주세요.",
        type: "error",
      });
      return;
    }

    const next = normalizeTemplate(
      {
        id: Date.now(),
        title: form.title,
        content: form.content,
        createdAt: new Date().toISOString(),
      },
      Date.now(),
    );

    const success = await persistTemplates(
      [...templates, next],
      "자동답변 등록 완료",
      "자동답변 템플릿이 저장되었습니다.",
    );

    if (success) {
      setForm(EMPTY_FORM);
    }
  };

  const handleEditStart = (template: AutoReplyTemplate) => {
    setEditId(template.id);
    setEditForm({
      title: template.title,
      content: template.content,
    });
  };

  const handleEditSave = async () => {
    if (editId === null) {
      return;
    }

    if (!editForm.title.trim() || !editForm.content.trim()) {
      addToast({
        title: "입력값 확인 필요",
        message: "제목과 내용을 모두 입력해 주세요.",
        type: "error",
      });
      return;
    }

    const success = await persistTemplates(
      templates.map((template) =>
        template.id === editId
          ? {
              ...template,
              title: editForm.title.trim(),
              content: editForm.content.trim(),
            }
          : template,
      ),
      "자동답변 수정 완료",
      "자동답변 템플릿이 업데이트되었습니다.",
    );

    if (success) {
      setEditId(null);
      setEditForm(EMPTY_FORM);
    }
  };

  const handleDelete = async (id: number) => {
    const success = await persistTemplates(
      templates.filter((template) => template.id !== id),
      "자동답변 삭제 완료",
      "자동답변 템플릿이 삭제되었습니다.",
    );

    if (success && editId === id) {
      setEditId(null);
      setEditForm(EMPTY_FORM);
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard title="자동답변 등록">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-400 w-16 shrink-0">제목</label>
            <AdminInput
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="답변 제목 입력"
              className="flex-1"
            />
          </div>
          <div className="flex items-start gap-4">
            <label className="text-sm text-gray-400 w-16 shrink-0 pt-2">
              내용
            </label>
            <textarea
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
              rows={4}
              placeholder="자동답변 내용 입력"
              className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 resize-none transition-all focus:ring-1 focus:ring-yellow-500/50"
            />
          </div>
          <div className="flex justify-end">
            <AdminButton
              onClick={handleAdd}
              disabled={!form.title.trim() || !form.content.trim() || isSaving}
            >
              등록
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={`답변 템플릿 목록 (${orderedTemplates.length}건)`}>
        {isLoading ? (
          <AdminLoadingSpinner message="자동답변 템플릿을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError}
            onRetry={() => void loadTemplates()}
          />
        ) : orderedTemplates.length === 0 ? (
          <AdminEmptyState message="등록된 자동답변 템플릿이 없습니다." />
        ) : (
          <div className="divide-y divide-gray-800">
            {orderedTemplates.map((t) => (
              <div
                key={t.id}
                className="p-4 hover:bg-gray-800/20 transition-colors"
              >
                {editId === t.id ? (
                  <div className="space-y-3">
                    <AdminInput
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                    <textarea
                      value={editForm.content}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          content: e.target.value,
                        }))
                      }
                      rows={3}
                      className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 resize-none transition-all focus:ring-1 focus:ring-yellow-500/50"
                    />
                    <div className="flex gap-2">
                      <AdminButton
                        size="sm"
                        onClick={handleEditSave}
                        disabled={isSaving}
                      >
                        저장
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditId(null);
                          setEditForm(EMPTY_FORM);
                        }}
                        disabled={isSaving}
                      >
                        취소
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white mb-1">
                        {t.title}
                      </p>
                      <p className="text-sm text-gray-400 whitespace-pre-line">
                        {t.content}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {t.createdAt}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <AdminButton
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEditStart(t)}
                        disabled={isSaving}
                      >
                        수정
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(t.id)}
                        disabled={isSaving}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 삭제
                      </AdminButton>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
