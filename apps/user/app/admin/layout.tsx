"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-gray-300">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto">
          <div className="w-full px-4 py-5 lg:px-5 lg:py-6 2xl:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
