"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
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
  fetchAdminMessages,
  sendAdminMessage,
  type AdminMessageHistoryItem,
} from "@/lib/api/adminContent";

export function MessageManagementTab() {
  const { addToast } = useNotification();
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<AdminMessageHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const next = await fetchAdminMessages();
      setMessages(next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.";
      setLoadError(message);
      addToast({
        title: "알림 이력을 불러오지 못했습니다.",
        message,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || isSending) {
      return;
    }

    setIsSending(true);

    try {
      const result = await sendAdminMessage({
        target: target.trim(),
        title: title.trim(),
        content: content.trim(),
      });

      addToast({
        title: "알림을 발송했습니다.",
        message: target.trim()
          ? `${target.trim()} 대상으로 발송했습니다.`
          : `${result.sentCount.toLocaleString("ko-KR")}명에게 발송했습니다.`,
        type: "success",
      });

      setTarget("");
      setTitle("");
      setContent("");
      await loadMessages();
    } catch (error) {
      addToast({
        title: "알림 발송에 실패했습니다.",
        message:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        type: "error",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard title="알림 발송">
        <div className="p-5 space-y-4">
          <div className="grid gap-2">
            <AdminLabel>수신 대상</AdminLabel>
            <AdminInput
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="회원 이메일 입력 (공란일 경우 전체발송)"
              className="max-w-xl"
            />
          </div>
          <div className="grid gap-2">
            <AdminLabel>제목</AdminLabel>
            <AdminInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="알림 제목"
            />
          </div>
          <div className="grid gap-2">
            <AdminLabel>내용</AdminLabel>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="알림 내용을 입력하세요"
              className="w-full rounded-xl border border-white/8 bg-white/3 px-3.5 py-3 text-sm text-white placeholder:text-gray-600 focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none resize-none"
            />
          </div>
          <div className="flex justify-end pt-2">
            <AdminButton
              onClick={handleSubmit}
              disabled={!title.trim() || !content.trim() || isSending}
            >
              <Send className="w-4 h-4" />
              발송하기
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={`발송 이력 (${messages.length}건)`}>
        {isLoading ? (
          <AdminLoadingSpinner message="알림 이력을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError}
            onRetry={() => void loadMessages()}
          />
        ) : messages.length === 0 ? (
          <AdminEmptyState message="발송 이력이 없습니다." />
        ) : (
          <AdminTable
            headers={["전송일시", "제목", "내용", "수신대상", "발송자"]}
          >
            {messages.map((item) => (
              <AdminTableRow key={item.id}>
                <AdminTableCell>{item.date}</AdminTableCell>
                <AdminTableCell className="font-medium text-white max-w-xs truncate">
                  {item.title}
                </AdminTableCell>
                <AdminTableCell className="max-w-md whitespace-normal wrap-break-word text-left">
                  {item.content}
                </AdminTableCell>
                <AdminTableCell>
                  <span className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-300">
                    {item.target}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-gray-400">
                  {item.sender}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}
