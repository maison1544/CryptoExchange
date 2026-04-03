"use client";

import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function LogoutButton({
  redirectTo,
  className,
}: {
  redirectTo?: string;
  className?: string;
}) {
  const { logout } = useAuth();

  const handleLogout = () => {
    void logout(redirectTo);
  };

  return (
    <button
      onClick={handleLogout}
      className={
        className ??
        "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-[13px] text-gray-400 hover:bg-red-500/10 hover:text-red-300"
      }
    >
      <LogOut size={16} />
      <span className="hidden sm:inline">로그아웃</span>
    </button>
  );
}
