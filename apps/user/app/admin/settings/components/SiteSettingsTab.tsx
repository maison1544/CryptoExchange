import React, { useState, useEffect, useCallback } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminButton } from "@/components/admin/ui/AdminForms";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import { loadSiteSettings, saveSiteSettings } from "@/lib/utils/siteSettings";

const supabase = createClient();
type S = Record<string, string>;

export function SiteSettingsTab() {
  const { addToast } = useNotification();
  const [s, setS] = useState<S>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setS(await loadSiteSettings(supabase));
    } catch (error) {
      addToast({
        title: "설정 불러오기 실패",
        message:
          error instanceof Error
            ? error.message
            : "사이트 설정을 불러오지 못했습니다.",
        type: "error",
      });
    }
  }, [addToast]);
  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }));

  const save = async (keys: string[]) => {
    try {
      setSaving(true);
      const payload = Object.fromEntries(
        keys.map((key) => [key, s[key] || ""]),
      );
      await saveSiteSettings(supabase, payload);
      addToast({
        title: "설정 저장 완료",
        message: "사이트 설정이 저장되었습니다.",
        type: "success",
      });
      await load();
    } catch (error) {
      addToast({
        title: "설정 저장 실패",
        message:
          error instanceof Error
            ? error.message
            : "사이트 설정을 저장하지 못했습니다.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleBtn = (key: string, active: boolean) => (
    <div className="flex gap-3">
      <button
        onClick={() => set(key, "true")}
        className={`px-4 py-2 rounded text-sm font-medium transition-colors border ${s[key] === "true" || (!s[key] && active) ? "bg-green-500/20 text-green-500 border-green-500/30" : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700"}`}
      >
        활성
      </button>
      <button
        onClick={() => set(key, "false")}
        className={`px-4 py-2 rounded text-sm font-medium transition-colors border ${s[key] === "false" || (!s[key] && !active) ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700"}`}
      >
        비활성
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminCard title="사이트 기본 설정">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">
                사이트명
              </label>
              <input
                type="text"
                value={s.site_name || ""}
                onChange={(e) => set("site_name", e.target.value)}
                placeholder="NEXUS"
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">
                사이트 URL
              </label>
              <input
                type="text"
                value={s.site_url || ""}
                onChange={(e) => set("site_url", e.target.value)}
                placeholder="https://nexus-exchange.com"
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">
                점검 모드
              </label>
              {toggleBtn("maintenance_mode", false)}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">
                신규 가입
              </label>
              {toggleBtn("allow_signup", true)}
            </div>
          </div>
          <div className="pt-6 border-t border-gray-800 flex justify-end">
            <AdminButton
              onClick={() =>
                save([
                  "site_name",
                  "site_url",
                  "maintenance_mode",
                  "allow_signup",
                ])
              }
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="고객센터 설정">
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">
                고객센터 링크 (Kakao / Telegram 등)
              </label>
              <input
                type="text"
                value={s.cs_link || ""}
                onChange={(e) => set("cs_link", e.target.value)}
                placeholder="https://open.kakao.com/... 또는 https://t.me/..."
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
              />
              <p className="text-xs text-gray-500">
                고객센터로 사용할 소셜 링크를 입력하세요. (카카오톡, 텔레그램
                등)
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">
                고객센터 이메일
              </label>
              <input
                type="email"
                value={s.cs_email || ""}
                onChange={(e) => set("cs_email", e.target.value)}
                placeholder="support@example.com"
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
              />
              <p className="text-xs text-gray-500">
                고객센터 문의용 이메일 주소를 입력하세요. (선택사항)
              </p>
            </div>
          </div>
          <div className="pt-6 border-t border-gray-800 flex justify-end">
            <AdminButton
              onClick={() => save(["cs_link", "cs_email"])}
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </AdminButton>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
