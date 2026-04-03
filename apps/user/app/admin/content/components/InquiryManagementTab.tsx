"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import {
  AdminButton,
  AdminInput,
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
  closeAdminInquiry,
  deleteAdminInquiries,
  fetchAdminInquiries,
  replyAdminInquiry,
  type AdminInquiry,
} from "@/lib/api/adminContent";

const STATUS_TABS = [
  { id: "all", label: "전체" },
  { id: "waiting", label: "답변대기" },
  { id: "answered", label: "답변완료" },
  { id: "closed", label: "종료" },
] as const;

const statusConfig = {
  waiting: {
    label: "답변대기",
    color: "bg-red-500/10 text-red-400 border border-red-500/20",
    icon: AlertCircle,
  },
  answered: {
    label: "답변완료",
    color: "bg-green-500/10 text-green-400 border border-green-500/20",
    icon: CheckCircle2,
  },
  closed: {
    label: "종료",
    color: "bg-gray-700/30 text-gray-300 border border-white/10",
    icon: CheckCircle2,
  },
} as const;

export function InquiryManagementTab() {
  const { addToast } = useNotification();
  const [inquiries, setInquiries] = useState<AdminInquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<AdminInquiry | null>(
    null,
  );
  const [replyText, setReplyText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_TABS)[number]["id"]>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadInquiries = useCallback(
    async (selectedId?: number | null) => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const next = await fetchAdminInquiries();
        setInquiries(next);
        setSelectedIds((prev) =>
          prev.filter((id) => next.some((item) => item.id === id)),
        );

        if (selectedId) {
          setSelectedInquiry(
            next.find((item) => item.id === selectedId) || null,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.";
        setLoadError(message);
        addToast({
          title: "문의 데이터를 불러오지 못했습니다.",
          message,
          type: "error",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [addToast],
  );

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  const filtered = useMemo(() => {
    return inquiries.filter((inq) => {
      if (statusFilter !== "all" && inq.status !== statusFilter) {
        return false;
      }

      if (!searchTerm.trim()) {
        return true;
      }

      const keyword = searchTerm.trim().toLowerCase();

      return [inq.userName, inq.userId, inq.title, inq.content]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [inquiries, searchTerm, statusFilter]);

  const waitingCount = inquiries.filter(
    (item) => item.status === "waiting",
  ).length;
  const answeredCount = inquiries.filter(
    (item) => item.status === "answered",
  ).length;

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(filtered.map((item) => item.id));
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSendReply = async () => {
    if (!selectedInquiry || !replyText.trim() || isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      await replyAdminInquiry(selectedInquiry.id, replyText.trim());
      setReplyText("");
      addToast({
        title: "답변을 등록했습니다.",
        message: `${selectedInquiry.userName} 회원 문의에 답변했습니다.`,
        type: "success",
      });
      await loadInquiries(selectedInquiry.id);
    } catch (error) {
      addToast({
        title: "답변 등록에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleClose = async () => {
    if (!selectedInquiry || isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      await closeAdminInquiry(selectedInquiry.id);
      addToast({
        title: "문의를 종료했습니다.",
        message: `${selectedInquiry.userName} 회원 문의가 종료 처리되었습니다.`,
        type: "success",
      });
      await loadInquiries(selectedInquiry.id);
    } catch (error) {
      addToast({
        title: "문의 종료에 실패했습니다.",
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
      await deleteAdminInquiries(selectedIds);
      const shouldClearDetail =
        selectedInquiry && selectedIds.includes(selectedInquiry.id);
      if (shouldClearDetail) {
        setSelectedInquiry(null);
      }
      addToast({
        title: "선택한 문의를 삭제했습니다.",
        message: `${selectedIds.length}건의 문의가 삭제되었습니다.`,
        type: "success",
      });
      setSelectedIds([]);
      await loadInquiries();
    } catch (error) {
      addToast({
        title: "문의 삭제에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  if (selectedInquiry) {
    const cfg = statusConfig[selectedInquiry.status];
    const StatusIcon = cfg.icon;

    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedInquiry(null)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={16} />
          목록으로 돌아가기
        </button>

        <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium border-white/10 text-gray-300 bg-white/5">
                  기타
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-medium flex items-center gap-1 ${cfg.color}`}
                >
                  <StatusIcon size={10} />
                  {cfg.label}
                </span>
                <span className="text-[10px] text-gray-600">
                  #{selectedInquiry.id}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">
                {selectedInquiry.title}
              </h2>
            </div>
            {selectedInquiry.status !== "closed" && (
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={handleClose}
                disabled={isMutating}
              >
                문의 종료
              </AdminButton>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-800 pt-3">
            <div className="flex items-center gap-1.5">
              <User size={12} />
              <span className="text-gray-300 font-medium">
                {selectedInquiry.userName}
              </span>
              <span>({selectedInquiry.userId})</span>
            </div>
            <span>·</span>
            <span>{selectedInquiry.createdAt}</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
          <div className="text-xs text-gray-500 mb-3 font-medium">
            문의 내용
          </div>
          <div className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">
            {selectedInquiry.content}
          </div>
        </div>

        {selectedInquiry.replies.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs text-gray-500 font-medium px-1">
              답변 내역 ({selectedInquiry.replies.length})
            </div>
            {selectedInquiry.replies.map((reply) => (
              <div
                key={reply.id}
                className={`border rounded-lg p-4 ${
                  reply.writer === "admin"
                    ? "bg-yellow-500/5 border-yellow-500/20"
                    : "bg-[#111827] border-gray-800"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      reply.writer === "admin"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {reply.writer === "admin" ? "관리자" : "고객"}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {reply.createdAt}
                  </span>
                </div>
                <div className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">
                  {reply.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedInquiry.status !== "closed" && (
          <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
            <div className="text-xs text-gray-500 mb-3 font-medium">
              답변 작성
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="고객에게 보낼 답변을 작성하세요..."
              rows={5}
              className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500 placeholder-gray-600 resize-none"
            />
            <div className="flex justify-end mt-3">
              <AdminButton
                onClick={handleSendReply}
                disabled={!replyText.trim() || isMutating}
              >
                <Send size={14} />
                답변 등록
              </AdminButton>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle size={14} className="text-red-400" />
          <span className="text-red-400 text-xs font-medium">
            답변대기 {waitingCount}
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg">
          <CheckCircle2 size={14} className="text-green-400" />
          <span className="text-green-400 text-xs font-medium">
            답변완료 {answeredCount}
          </span>
        </div>
      </div>

      <AdminSearchFilterCard
        fields={[
          {
            key: "statusFilter",
            label: "상태",
            control: (
              <AdminSelect
                className="w-full"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as (typeof STATUS_TABS)[number]["id"],
                  )
                }
              >
                {STATUS_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
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
              placeholder="제목, 회원명 또는 이메일 검색..."
              className="min-w-0 flex-1"
            />
            <AdminButton
              variant="danger"
              className="shrink-0 whitespace-nowrap"
              disabled={selectedIds.length === 0 || isMutating}
              onClick={handleDeleteSelected}
            >
              <Trash2 className="w-3.5 h-3.5" />
              선택 삭제 ({selectedIds.length})
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`문의 목록 (${filtered.length}건)`}>
        {isLoading ? (
          <AdminLoadingSpinner message="문의 목록을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError}
            onRetry={() => void loadInquiries()}
          />
        ) : filtered.length === 0 ? (
          <AdminEmptyState message="문의가 없습니다." />
        ) : (
          <AdminTable
            headers={[
              <input
                key="chk"
                type="checkbox"
                checked={
                  selectedIds.length === filtered.length && filtered.length > 0
                }
                onChange={toggleAll}
                className="rounded border-gray-600 bg-gray-800 focus:ring-yellow-500"
              />,
              "번호",
              "분류",
              "제목",
              "고객",
              "상태",
              "작성일시",
            ]}
          >
            {filtered.map((inq) => {
              const cfg = statusConfig[inq.status];

              return (
                <AdminTableRow key={inq.id}>
                  <AdminTableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(inq.id)}
                      onChange={() => toggleOne(inq.id)}
                      className="rounded border-gray-600 bg-gray-800 focus:ring-yellow-500"
                    />
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-500 text-xs">
                    {inq.id}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium border-white/10 text-gray-300 bg-white/5">
                      기타
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <button
                      onClick={() => setSelectedInquiry(inq)}
                      className="text-white hover:text-yellow-400 font-medium text-left transition-colors truncate max-w-xs block"
                    >
                      {inq.title}
                      {inq.replies.length > 0 && (
                        <span className="text-[10px] text-gray-500 ml-1.5">
                          [{inq.replies.length}]
                        </span>
                      )}
                    </button>
                  </AdminTableCell>
                  <AdminTableCell>
                    <div className="text-white text-xs">{inq.userName}</div>
                    <div className="text-[10px] text-gray-500">
                      {inq.userId}
                    </div>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${cfg.color}`}
                    >
                      {cfg.label}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell className="text-gray-400 text-xs whitespace-nowrap">
                    {inq.createdAt}
                  </AdminTableCell>
                </AdminTableRow>
              );
            })}
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}
