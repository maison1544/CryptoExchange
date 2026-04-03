"use client";

import { ReactNode, useState, useEffect } from "react";
import { TopNavbar } from "./TopNavbar";
import { createClient } from "@/lib/supabase/client";
import { Mail, MessageCircle } from "lucide-react";

const supabase = createClient();

function Footer() {
  const [cs, setCs] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["cs_link", "cs_email", "site_name"])
      .then(({ data }) => {
        if (data) {
          const m: Record<string, string> = {};
          data.forEach((r: any) => {
            m[r.key] = r.value;
          });
          setCs(m);
        }
      });
  }, []);

  return (
    <footer className="border-t hairline-divider shell-chrome px-6 py-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
        <span className="muted-copy tracking-[0.02em]">
          © {new Date().getFullYear()} {cs.site_name || "NEXUS"}. All rights
          reserved.
        </span>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500">
          {cs.cs_link && (
            <a
              href={cs.cs_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <MessageCircle size={12} /> 고객센터
            </a>
          )}
          {cs.cs_email && (
            <a
              href={`mailto:${cs.cs_email}`}
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Mail size={12} /> {cs.cs_email}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-gray-300">
      <TopNavbar />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col">
            {children}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
