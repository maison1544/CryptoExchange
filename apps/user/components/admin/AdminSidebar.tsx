"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Settings,
  Building2,
  Coins,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "대시보드", href: "/admin", icon: LayoutDashboard },
  { section: "회원 및 파트너" },
  { name: "회원 관리", href: "/admin/members", icon: Users },
  { name: "파트너 관리", href: "/admin/partners", icon: Building2 },
  { section: "자산 관리" },
  { name: "스테이킹 관리", href: "/admin/staking", icon: Coins },
  { section: "콘텐츠" },
  { name: "공지/컨텐츠", href: "/admin/notice", icon: Megaphone },
  { section: "설정" },
  { name: "환경 설정", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="shell-chrome hidden h-full w-44 shrink-0 border-r hairline-divider xl:flex xl:flex-col">
      <div className="border-b hairline-divider px-3 py-3">
        <Link href="/admin" prefetch={false} className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-yellow-500/90 text-sm font-semibold text-black">
            N
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-xs font-semibold tracking-[0.12em] text-white">
              NEXUS ADMIN
            </div>
          </div>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {navItems.map((item, idx) => {
          if ("section" in item) {
            return (
              <div key={idx} className="px-2 pb-1.5 pt-4 first:pt-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">
                  {item.section}
                </span>
              </div>
            );
          }

          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2 py-2.5 text-[12px] font-medium leading-4",
                isActive
                  ? "bg-white/5 text-white"
                  : "text-gray-400 hover:bg-white/3 hover:text-white",
              )}
            >
              <Icon size={15} className="shrink-0" />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </div>

      <div className="border-t hairline-divider px-3 py-3">
        <div className="text-[10px] leading-4 text-gray-600">
          조용한 밀도 유지
        </div>
      </div>
    </aside>
  );
}
