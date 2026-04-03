import type { ReactNode } from "react";
import { redirect } from "next/navigation";

export default function AdminHistoryLayout({ children }: { children: ReactNode }) {
  void children;
  redirect("/admin/members?tab=logs");
}
