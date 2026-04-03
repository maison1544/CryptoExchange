"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Eye, EyeOff, Pin, Plus, Trash2 } from "lucide-react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from "@/components/admin/ui/AdminForms";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import {
  AdminTable,
  AdminTableCell,
  AdminTableRow,
} from "@/components/admin/ui/AdminTable";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { NoticeCategoryBadge } from "@/components/ui/NoticeCategoryBadge";
import { useNotification } from "@/contexts/NotificationContext";
import {
  createAdminNotice,
  deleteAdminNotices,
  fetchAdminNotices,
  toggleAdminNoticePin,
  toggleAdminNoticePublish,
  updateAdminNotice,
} from "@/lib/api/adminNotices";
import type { AdminNotice, NoticeCategory } from "@/lib/types/entities";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";

const TABS = [
  { id: "all", label: "전체" },
  { id: "announcement", label: "공지" },
  { id: "event", label: "이벤트" },
  { id: "maintenance", label: "점검" },
  { id: "alert", label: "긴급" },
] as const;

type NoticeManagementSectionProps = {
  embedded?: boolean;
};

type NoticeSortKey = "latest" | "views" | "title";

type NoticeFormState = {
  category: NoticeCategory;
  title: string;
  content: string;
  isPinned: boolean;
  eventEndDate: string;
};

const INITIAL_FORM: NoticeFormState = {
  category: "announcement",
  title: "",
  content: "",
  isPinned: false,
  eventEndDate: "",
};

export function NoticeManagementSection({
  embedded = false,
}: NoticeManagementSectionProps) {
  const { addToast } = useNotification();
  const [activeTab, setActiveTab] =
    useState<(typeof TABS)[number]["id"]>("all");
  const [publishFilter, setPublishFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<NoticeSortKey>("latest");
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingNotice, setEditingNotice] = useState<AdminNotice | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [form, setForm] = useState<NoticeFormState>(INITIAL_FORM);

  const loadNotices = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const next = await fetchAdminNotices();
      setNotices(next);
      setSelectedIds((prev) =>
        prev.filter((id) => next.some((item) => item.id === id)),
      );
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "공지 목록을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const filteredNotices = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const rows = notices.filter((notice) => {
      if (activeTab !== "all" && notice.category !== activeTab) {
        return false;
      }

      if (publishFilter === "published" && !notice.isPublished) {
        return false;
      }

      if (publishFilter === "hidden" && notice.isPublished) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [notice.title, notice.content, notice.author]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });

    rows.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }

      if (sortKey === "views") {
        return b.views - a.views;
      }

      if (sortKey === "title") {
        return a.title.localeCompare(b.title, "ko");
      }

      return b.createdAt.localeCompare(a.createdAt);
    });

    return rows;
  }, [activeTab, notices, publishFilter, searchTerm, sortKey]);

  const summary = useMemo(
    () => ({
      total: notices.length,
      published: notices.filter((item) => item.isPublished).length,
      pinned: notices.filter((item) => item.isPinned).length,
      hidden: notices.filter((item) => !item.isPublished).length,
    }),
    [notices],
  );

  const isAllSelected =
    filteredNotices.length > 0 &&
    filteredNotices.every((notice) => selectedIds.includes(notice.id));

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingNotice(null);
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    setForm(INITIAL_FORM);
    setEditingNotice(null);
    setIsModalOpen(true);
  };

  const openEditModal = (notice: AdminNotice) => {
    setEditingNotice(notice);
    setForm({
      category: notice.category,
      title: notice.title,
      content: notice.content,
      isPinned: notice.isPinned,
      eventEndDate: notice.eventEndDate || "",
    });
    setIsModalOpen(true);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(
      isAllSelected ? [] : filteredNotices.map((notice) => notice.id),
    );
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim() || isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      if (editingNotice) {
        await updateAdminNotice(editingNotice.id, {
          category: form.category,
          title: form.title.trim(),
          content: form.content.trim(),
          isPinned: form.isPinned,
          eventEndDate: form.category === "event" ? form.eventEndDate : "",
        });
        addToast({
          title: "공지를 수정했습니다.",
          message: `${form.title.trim()} 공지가 저장되었습니다.`,
          type: "success",
        });
      } else {
        await createAdminNotice({
          category: form.category,
          title: form.title.trim(),
          content: form.content.trim(),
          isPinned: form.isPinned,
          eventEndDate: form.category === "event" ? form.eventEndDate : "",
        });
        addToast({
          title: "공지를 등록했습니다.",
          message: `${form.title.trim()} 공지가 추가되었습니다.`,
          type: "success",
        });
      }

      resetForm();
      await loadNotices();
    } catch (error) {
      addToast({
        title: editingNotice
          ? "공지 수정에 실패했습니다."
          : "공지 등록에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0 || isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      await deleteAdminNotices(selectedIds);
      addToast({
        title: "선택한 공지를 삭제했습니다.",
        message: `${selectedIds.length}건의 공지가 삭제되었습니다.`,
        type: "success",
      });
      setSelectedIds([]);
      await loadNotices();
    } catch (error) {
      addToast({
        title: "공지 삭제에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleTogglePublish = async (notice: AdminNotice) => {
    if (isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      await toggleAdminNoticePublish(notice.id);
      addToast({
        title: notice.isPublished
          ? "공지 게시를 중단했습니다."
          : "공지를 게시했습니다.",
        message: notice.title,
        type: "success",
      });
      await loadNotices();
    } catch (error) {
      addToast({
        title: "공지 상태 변경에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleTogglePin = async (notice: AdminNotice) => {
    if (isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      await toggleAdminNoticePin(notice.id);
      addToast({
        title: notice.isPinned
          ? "상단 고정을 해제했습니다."
          : "상단 고정을 적용했습니다.",
        message: notice.title,
        type: "success",
      });
      await loadNotices();
    } catch (error) {
      addToast({
        title: "공지 고정 상태 변경에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      <AdminTabs
        tabs={TABS as unknown as { id: string; label: string }[]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as (typeof TABS)[number]["id"])}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/8 bg-[#111827] p-4">
          <div className="mb-1 text-xs text-gray-500">전체 공지</div>
          <div className="text-lg font-bold text-white">{summary.total}건</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#111827] p-4">
          <div className="mb-1 text-xs text-gray-500">게시중</div>
          <div className="text-lg font-bold text-white">
            {summary.published}건
          </div>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#111827] p-4">
          <div className="mb-1 text-xs text-gray-500">고정 공지</div>
          <div className="text-lg font-bold text-white">{summary.pinned}건</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#111827] p-4">
          <div className="mb-1 text-xs text-gray-500">비공개</div>
          <div className="text-lg font-bold text-white">{summary.hidden}건</div>
        </div>
      </div>

      <AdminSearchFilterCard
        fields={[
          {
            key: "publishFilter",
            label: "게시 상태",
            control: (
              <AdminSelect
                value={publishFilter}
                onChange={(e) => setPublishFilter(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="published">게시중</option>
                <option value="hidden">비공개</option>
              </AdminSelect>
            ),
          },
          {
            key: "sortKey",
            label: "정렬",
            control: (
              <AdminSelect
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as NoticeSortKey)}
              >
                <option value="latest">최신순</option>
                <option value="views">조회수순</option>
                <option value="title">제목순</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-4"
        searchLabel="검색"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="제목, 내용, 작성자 검색"
              className="min-w-0 flex-1"
            />
            <AdminButton
              variant="danger"
              className="shrink-0 whitespace-nowrap"
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0 || isMutating}
            >
              <Trash2 className="h-4 w-4" /> 삭제 ({selectedIds.length})
            </AdminButton>
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={openCreateModal}
              disabled={isMutating}
            >
              <Plus className="h-4 w-4" /> 공지 작성
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`공지사항 목록 (${filteredNotices.length}건)`}>
        <AdminTable
          headers={[
            <input
              key="cb"
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="rounded"
            />,
            "카테고리",
            "제목",
            "작성자",
            "상태",
            "조회수",
            "작성일",
            "관리",
          ]}
        >
          {isLoading ? (
            <AdminTableRow>
              <AdminTableCell colSpan={8}>
                <AdminLoadingSpinner message="공지 목록을 불러오는 중..." />
              </AdminTableCell>
            </AdminTableRow>
          ) : loadError ? (
            <AdminTableRow>
              <AdminTableCell colSpan={8}>
                <AdminErrorState
                  message={loadError}
                  onRetry={() => void loadNotices()}
                />
              </AdminTableCell>
            </AdminTableRow>
          ) : filteredNotices.length === 0 ? (
            <AdminTableRow>
              <AdminTableCell colSpan={8}>
                <AdminEmptyState message="조건에 맞는 공지가 없습니다." />
              </AdminTableCell>
            </AdminTableRow>
          ) : (
            filteredNotices.map((notice) => (
              <AdminTableRow key={notice.id}>
                <AdminTableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(notice.id)}
                    onChange={() => toggleSelect(notice.id)}
                    className="rounded"
                  />
                </AdminTableCell>
                <AdminTableCell>
                  <NoticeCategoryBadge category={notice.category} />
                </AdminTableCell>
                <AdminTableCell className="max-w-md text-left whitespace-normal wrap-break-word">
                  <div className="flex items-start gap-2">
                    {notice.isPinned && (
                      <Pin
                        size={12}
                        className="mt-1 shrink-0 text-yellow-500"
                      />
                    )}
                    <button
                      onClick={() => openEditModal(notice)}
                      className="text-left font-medium text-yellow-400 transition-colors hover:text-yellow-300 hover:underline"
                    >
                      {notice.title}
                    </button>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                    {notice.content}
                  </div>
                </AdminTableCell>
                <AdminTableCell>{notice.author}</AdminTableCell>
                <AdminTableCell>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${notice.isPublished ? "bg-green-500/10 text-green-400" : "bg-gray-700 text-gray-400"}`}
                  >
                    {notice.isPublished ? "게시중" : "비공개"}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-gray-400">
                  {formatDisplayNumber(notice.views, {
                    maximumFractionDigits: 0,
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-xs text-gray-400 whitespace-nowrap">
                  {notice.createdAt}
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => void handleTogglePin(notice)}
                      className={`rounded p-1.5 transition-colors ${notice.isPinned ? "bg-yellow-500/10 text-yellow-500" : "text-gray-500 hover:bg-gray-700 hover:text-white"}`}
                      title={notice.isPinned ? "고정 해제" : "고정"}
                    >
                      <Pin size={14} />
                    </button>
                    <button
                      onClick={() => void handleTogglePublish(notice)}
                      className={`rounded p-1.5 transition-colors ${notice.isPublished ? "bg-green-500/10 text-green-400" : "text-gray-500 hover:bg-gray-700 hover:text-white"}`}
                      title={notice.isPublished ? "비공개 전환" : "게시"}
                    >
                      {notice.isPublished ? (
                        <Eye size={14} />
                      ) : (
                        <EyeOff size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => openEditModal(notice)}
                      className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
                      title="수정"
                    >
                      <Edit3 size={14} />
                    </button>
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTable>
      </AdminCard>

      <AdminModal
        isOpen={isModalOpen}
        onClose={resetForm}
        title={editingNotice ? "공지 수정" : "공지 작성"}
      >
        <div className="space-y-4">
          <div className="grid gap-2">
            <AdminLabel>카테고리</AdminLabel>
            <AdminSelect
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  category: e.target.value as NoticeCategory,
                }))
              }
            >
              <option value="announcement">공지</option>
              <option value="event">이벤트</option>
              <option value="maintenance">점검</option>
              <option value="alert">긴급</option>
            </AdminSelect>
          </div>
          <div className="grid gap-2">
            <AdminLabel>제목</AdminLabel>
            <AdminInput
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="공지 제목 입력"
            />
          </div>
          <div className="grid gap-2">
            <AdminLabel>내용</AdminLabel>
            <textarea
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
              rows={8}
              placeholder="공지 내용 입력"
              className="w-full rounded-xl border border-white/8 bg-white/3 px-3.5 py-3 text-sm text-white placeholder:text-gray-600 focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none resize-none"
            />
          </div>
          {form.category === "event" && (
            <div className="grid gap-2">
              <AdminLabel>종료일</AdminLabel>
              <AdminInput
                type="date"
                value={form.eventEndDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, eventEndDate: e.target.value }))
                }
              />
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, isPinned: e.target.checked }))
              }
              className="rounded border-gray-600 bg-gray-800 focus:ring-yellow-500"
            />
            상단 고정
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <AdminButton
              variant="secondary"
              onClick={resetForm}
              disabled={isMutating}
            >
              취소
            </AdminButton>
            <AdminButton
              onClick={handleSave}
              disabled={
                !form.title.trim() || !form.content.trim() || isMutating
              }
            >
              {editingNotice ? "수정" : "등록"}
            </AdminButton>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
