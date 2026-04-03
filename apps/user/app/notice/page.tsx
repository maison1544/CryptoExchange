"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect } from "react";
import {
  Megaphone,
  AlertTriangle,
  Gift,
  Wrench,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DbNotice } from "@/lib/types/database";

import { cn } from "@/lib/utils";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";

const supabase = createClient();

type NoticeCategory =
  | "all"
  | "announcement"
  | "event"
  | "maintenance"
  | "alert";

interface Notice {
  id: number;
  category: "announcement" | "event" | "maintenance" | "alert";
  title: string;
  content: string;
  date: string;
  isPinned?: boolean;
  isNew?: boolean;
  eventEndDate?: string;
}

function dbToNotice(d: DbNotice): Notice {
  const daysDiff = Math.floor(
    (Date.now() - new Date(d.created_at).getTime()) / 86400000,
  );
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    content: d.content,
    date: new Date(d.created_at).toISOString().split("T")[0],
    isPinned: d.is_pinned,
    isNew: daysDiff <= 7,
    eventEndDate: d.event_end_date
      ? new Date(d.event_end_date).toISOString().split("T")[0]
      : undefined,
  };
}

const categoryConfig = {
  announcement: {
    label: "공지",
    icon: Megaphone,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  event: {
    label: "이벤트",
    icon: Gift,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  maintenance: {
    label: "점검",
    icon: Wrench,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  alert: {
    label: "긴급",
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
};

export default function NoticePage() {
  const [activeCategory, setActiveCategory] = useState<NoticeCategory>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    supabase
      .from("notices")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setNotices((data as DbNotice[]).map(dbToNotice));
      });
  }, []);

  const filtered = notices.filter((n) => {
    if (activeCategory !== "all" && n.category !== activeCategory) return false;
    if (searchTerm && !n.title.toLowerCase().includes(searchTerm.toLowerCase()))
      return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-y-auto bg-background p-6 lg:p-8 text-sm">
        <div className="max-w-4xl mx-auto w-full space-y-6 pb-10">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">공지사항</h1>
            <span className="text-xs text-gray-500">
              총 {formatDisplayNumber(sorted.length)}건
            </span>
          </div>

          {/* 검색 */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="공지사항 검색..."
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-gray-700 placeholder-gray-600"
            />
          </div>

          {/* 카테고리 필터 */}
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { key: "all", label: "전체" },
                { key: "announcement", label: "공지" },
                { key: "event", label: "이벤트" },
                { key: "maintenance", label: "점검" },
                { key: "alert", label: "긴급" },
              ] as const
            ).map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-medium transition-colors border",
                  activeCategory === cat.key
                    ? "bg-yellow-500/10 border-yellow-500 text-yellow-500"
                    : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 공지 목록 */}
          <div className="space-y-3">
            {sorted.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                해당하는 공지사항이 없습니다.
              </div>
            ) : (
              sorted.map((notice) => {
                const config = categoryConfig[notice.category];
                const Icon = config.icon;
                const isExpanded = expandedId === notice.id;

                return (
                  <div
                    key={notice.id}
                    className={cn(
                      "bg-gray-900 border rounded-lg overflow-hidden transition-colors",
                      notice.isPinned
                        ? "border-yellow-500/30"
                        : "border-gray-800",
                    )}
                  >
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : notice.id)
                      }
                      className="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-800/30 transition-colors"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                          config.bg,
                        )}
                      >
                        <Icon size={16} className={config.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium border",
                              config.bg,
                              config.color,
                              config.border,
                            )}
                          >
                            {config.label}
                          </span>
                          {notice.isPinned && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 font-medium">
                              📌 고정
                            </span>
                          )}
                          {notice.isNew && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                              NEW
                            </span>
                          )}
                          {notice.eventEndDate && (
                            <span className="text-[10px] text-gray-500 flex items-center gap-1">
                              <Calendar size={10} />~{notice.eventEndDate}
                            </span>
                          )}
                        </div>
                        <h3 className="text-white font-medium text-sm truncate">
                          {notice.title}
                        </h3>
                        <span className="text-xs text-gray-500 mt-1 block">
                          {notice.date}
                        </span>
                      </div>
                      <div className="shrink-0 text-gray-500 mt-1">
                        {isExpanded ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pl-[3.25rem]">
                        <div className="border-t border-gray-800 pt-4">
                          <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed">
                            {notice.content}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
