"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/admin/ui/LogoutButton";

export default function PartnerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/partner/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-gray-300">
      <header className="shell-chrome sticky top-0 z-50 border-b hairline-divider">
        <div className="flex w-full items-center justify-between px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-yellow-500/90 text-xs font-semibold text-black">
              N
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                Partner Center
              </div>
            </div>
          </div>
          <LogoutButton redirectTo="/partner/login" />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
