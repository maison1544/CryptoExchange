import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  Settings,
  User,
  Users,
  LogOut,
  Megaphone,
  Clock,
  Bell,
  HelpCircle,
  Coins,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const supabase = createClient();

const primaryNavItems = [
  { href: "/trade", label: "거래", icon: LayoutDashboard },
  { href: "/assets", label: "자산", icon: Wallet },
  { href: "/wallet", label: "입출금", icon: ArrowRightLeft },
  { href: "/staking", label: "스테이킹", icon: Coins },
  { href: "/notice", label: "공지", icon: Megaphone },
];

const workspaceNavItems = [
  {
    href: "/partner",
    label: "파트너",
    icon: Users,
    accentClass: "text-gray-300 hover:text-white",
  },
  {
    href: "/admin",
    label: "관리자",
    icon: Settings,
    accentClass: "text-yellow-500 hover:text-yellow-400",
  },
];

interface DbNotification {
  id: number;
  title: string;
  body: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data as DbNotification[]);
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unread = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) loadNotifications();
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.04] hover:text-white"
        title="알림"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="panel-elevated absolute right-0 top-full z-50 mt-3 w-84 overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b hairline-divider px-4 py-3">
              <span className="text-white font-medium text-sm">알림</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-500">
                  {unread}건 읽지 않음
                </span>
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-gray-300 hover:text-white"
                  >
                    모두 읽음
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.05]">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-xs">
                  알림이 없습니다.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "cursor-pointer px-4 py-3 hover:bg-white/[0.03]",
                      !n.is_read && "bg-yellow-500/[0.05]",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                      )}
                      <div className={n.is_read ? "ml-4" : ""}>
                        <p className="text-gray-200 text-xs font-medium">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-gray-400 text-[11px] mt-0.5">
                            {n.body}
                          </p>
                        )}
                        <span className="text-[10px] text-gray-600">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t hairline-divider px-4 py-3 text-center">
              <Link
                href="/notice"
                className="text-xs text-gray-300 hover:text-white"
                onClick={() => setOpen(false)}
              >
                공지사항 보기
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TopNavbar() {
  const { isLoggedIn, logout, user } = useAuth();
  const pathname = usePathname();

  return (
    <header className="shell-chrome sticky top-0 z-50 border-b hairline-divider">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-6 px-5 text-sm text-gray-300 lg:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 text-white transition-opacity hover:opacity-90"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-yellow-500/90 text-sm font-semibold text-black">
              N
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-[0.16em]">
                NEXUS
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
                Quiet Exchange UI
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium",
                    isActive
                      ? "bg-white/[0.05] text-white"
                      : "text-gray-400 hover:bg-white/[0.03] hover:text-white",
                  )}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-1 border-r hairline-divider pr-3 lg:flex">
            {workspaceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium",
                    isActive ? "bg-white/[0.05] text-white" : item.accentClass,
                  )}
                >
                  <Icon size={14} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center gap-1 border-r hairline-divider pr-3 sm:flex">
            <Link
              href="/history"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.04] hover:text-white"
              title="거래 내역"
            >
              <Clock size={18} />
            </Link>
            <Link
              href="/qa"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.04] hover:text-white"
              title="용어 설명"
            >
              <HelpCircle size={18} />
            </Link>
            <NotificationBell />
            <Link
              href="/settings"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.04] hover:text-white"
              title="설정"
            >
              <Settings size={18} />
            </Link>
          </div>

          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              <Link
                href="/profile"
                className="flex items-center gap-3 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 hover:bg-white/[0.04]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-gray-300">
                  <User size={16} />
                </div>
                <span className="hidden max-w-40 truncate text-[13px] text-gray-300 md:block">
                  {user?.email ?? ""}
                </span>
              </Link>
              <button
                onClick={() => logout()}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-white/[0.04] hover:text-white"
                title="로그아웃"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-300 hover:bg-white/[0.04] hover:text-white"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-yellow-500 px-4 py-2 text-[13px] font-semibold text-black hover:bg-yellow-400"
              >
                회원가입
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
