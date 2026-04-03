import React, { useState, useEffect, useCallback } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminButton } from "@/components/admin/ui/AdminForms";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import { loadSiteSettings, saveSiteSettings } from "@/lib/utils/siteSettings";

const supabase = createClient();

type SettingsMap = Record<string, string>;

function FeeField({
  label,
  settingKey,
  suffix,
  description,
  settings,
  onChange,
}: {
  label: string;
  settingKey: string;
  suffix: string;
  description?: string;
  settings: SettingsMap;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      {description && (
        <p className="text-xs text-gray-500 -mt-1">{description}</p>
      )}
      <div className="flex items-center">
        <input
          type="number"
          value={settings[settingKey] || "0"}
          onChange={(e) => onChange(settingKey, e.target.value)}
          step="0.001"
          className="flex-1 bg-[#0d1117] border border-gray-700 rounded-l px-3 py-2 text-center text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
        />
        <div className="bg-gray-800 border border-l-0 border-gray-700 px-4 py-2 rounded-r text-sm text-gray-400">
          {suffix}
        </div>
      </div>
    </div>
  );
}

export function FeeSettingsTab() {
  const { addToast } = useNotification();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await loadSiteSettings(supabase));
    } catch (error) {
      addToast({
        title: "설정 불러오기 실패",
        message:
          error instanceof Error
            ? error.message
            : "수수료 설정을 불러오지 못했습니다.",
        type: "error",
      });
    }
  }, [addToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const saveSettings = async (keys: string[]) => {
    try {
      setSaving(true);
      const payload = Object.fromEntries(
        keys.map((key) => [key, settings[key] || "0"]),
      );
      await saveSiteSettings(supabase, payload);
      addToast({
        title: "설정 저장 완료",
        message: "수수료 설정이 저장되었습니다.",
        type: "success",
      });
      await loadSettings();
    } catch (error) {
      addToast({
        title: "설정 저장 실패",
        message:
          error instanceof Error
            ? error.message
            : "수수료 설정을 저장하지 못했습니다.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard title="거래 수수료 설정">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeeField
              label="메이커 수수료 (지정가)"
              settingKey="maker_fee"
              suffix="%"
              description="지정가 주문 시 적용"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="테이커 수수료 (시장가)"
              settingKey="taker_fee"
              suffix="%"
              description="시장가 주문 시 적용"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="선물 거래 수수료"
              settingKey="futures_fee"
              suffix="%"
              description="선물(마진) 거래 시 적용"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="펀딩비율"
              settingKey="funding_rate"
              suffix="%"
              description="8시간마다 적용"
              settings={settings}
              onChange={handleChange}
            />
          </div>
          <div className="pt-6 border-t border-gray-800 flex justify-end">
            <AdminButton
              onClick={() =>
                saveSettings([
                  "maker_fee",
                  "taker_fee",
                  "futures_fee",
                  "funding_rate",
                ])
              }
              disabled={saving}
            >
              {saving ? "저장 중..." : "거래 수수료 저장"}
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="출금 설정">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeeField
              label="USDT 환율"
              settingKey="usdt_krw_rate"
              suffix="원"
              description="1 USDT당 원화 기준값"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="출금 수수료"
              settingKey="withdraw_fee"
              suffix="원"
              description="출금 건당 수수료"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="최소 출금액"
              settingKey="min_withdraw"
              suffix="원"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="일일 최대 출금액"
              settingKey="daily_max_withdraw"
              suffix="원"
              description="1일 출금 한도"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="1회 최대 출금액"
              settingKey="single_max_withdraw"
              suffix="원"
              description="1건당 최대 출금 금액"
              settings={settings}
              onChange={handleChange}
            />
          </div>
          <div className="pt-6 border-t border-gray-800 flex justify-end">
            <AdminButton
              onClick={() =>
                saveSettings([
                  "usdt_krw_rate",
                  "withdraw_fee",
                  "min_withdraw",
                  "daily_max_withdraw",
                  "single_max_withdraw",
                ])
              }
              disabled={saving}
            >
              {saving ? "저장 중..." : "출금 설정 저장"}
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="스테이킹 수수료">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeeField
              label="조기해지 수수료"
              settingKey="early_cancel_fee"
              suffix="%"
              description="만기 전 해지 시 수익 차감률"
              settings={settings}
              onChange={handleChange}
            />
            <FeeField
              label="플랫폼 수수료"
              settingKey="platform_staking_fee"
              suffix="%"
              description="스테이킹 수익 중 플랫폼 수수료"
              settings={settings}
              onChange={handleChange}
            />
          </div>
          <div className="pt-6 border-t border-gray-800 flex justify-end">
            <AdminButton
              onClick={() =>
                saveSettings(["early_cancel_fee", "platform_staking_fee"])
              }
              disabled={saving}
            >
              {saving ? "저장 중..." : "스테이킹 수수료 저장"}
            </AdminButton>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
