"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
import { Moon, Sun, Bell, Globe, Lock, Volume2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useNotification,
  NOTIFICATION_SOUNDS,
} from "@/contexts/NotificationContext";

export default function SettingsPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [language, setLanguage] = useState("Korean");
  const { isLoggedIn } = useAuth();
  const { previewSound, settings, updateSettings } = useNotification();

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-background p-6 lg:p-8 text-sm">
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          <h1 className="text-2xl font-semibold text-white">설정</h1>

          <div className="relative">
            {!isLoggedIn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 rounded-xl">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <Lock size={24} className="text-gray-500" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  로그인이 필요합니다
                </h2>
                <p className="text-gray-400 mb-6 text-center max-w-sm">
                  설정을 관리하려면 로그인하세요.
                </p>
                <button
                  onClick={() => (window.location.href = "/login")}
                  className="px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-colors"
                >
                  로그인
                </button>
              </div>
            )}

            <div className="space-y-6">
              {/* Theme */}
              <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Moon size={20} className="text-gray-400" />
                  테마 설정
                </h2>
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 rounded-md border transition-colors",
                      theme === "dark"
                        ? "border-yellow-500 bg-yellow-500/10 text-yellow-500"
                        : "border-gray-700 text-gray-300 hover:border-gray-600",
                    )}
                  >
                    <Moon size={18} />
                    다크 모드
                  </button>
                  <button
                    disabled
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 rounded-md border transition-colors opacity-50 cursor-not-allowed",
                      "border-gray-700 text-gray-300",
                    )}
                  >
                    <Sun size={18} />
                    라이트 모드 (준비 중)
                  </button>
                </div>
              </section>

              {/* Language */}
              <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Globe size={20} className="text-gray-400" />
                  언어 및 지역
                </h2>
                <div className="max-w-xs">
                  <label className="block text-gray-400 mb-2">표시 언어</label>
                  <select
                    className="w-full bg-background border border-gray-800 rounded-md p-3 text-white focus:outline-none focus:border-gray-700"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="Korean">한국어</option>
                    <option value="English">English</option>
                  </select>
                </div>
              </section>

              {/* Order Alert Notification */}
              <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Bell size={20} className="text-gray-400" />
                  알림 설정
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-gray-200 font-medium">
                        주문 체결 알림
                      </div>
                      <div className="text-gray-500 text-xs">
                        주문이 체결되었을 때 알림을 표시합니다
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateSettings({
                          orderFillEnabled: !settings.orderFillEnabled,
                        })
                      }
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        settings.orderFillEnabled
                          ? "bg-yellow-500"
                          : "bg-gray-700",
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 bg-white rounded-full absolute top-1 transition-transform",
                          settings.orderFillEnabled ? "left-7" : "left-1",
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-gray-200 font-medium">
                        청산 위기 알림
                      </div>
                      <div className="text-gray-500 text-xs">
                        포지션이 청산 위기에 도달했을 때 알림을 표시합니다
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateSettings({
                          liquidationWarningEnabled:
                            !settings.liquidationWarningEnabled,
                        })
                      }
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        settings.liquidationWarningEnabled
                          ? "bg-yellow-500"
                          : "bg-gray-700",
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 bg-white rounded-full absolute top-1 transition-transform",
                          settings.liquidationWarningEnabled
                            ? "left-7"
                            : "left-1",
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-gray-200 font-medium">
                        청산 완료 알림
                      </div>
                      <div className="text-gray-500 text-xs">
                        포지션이 강제 청산되었을 때 알림을 표시합니다
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateSettings({
                          liquidationAlertEnabled:
                            !settings.liquidationAlertEnabled,
                        })
                      }
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        settings.liquidationAlertEnabled
                          ? "bg-yellow-500"
                          : "bg-gray-700",
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 bg-white rounded-full absolute top-1 transition-transform",
                          settings.liquidationAlertEnabled
                            ? "left-7"
                            : "left-1",
                        )}
                      />
                    </button>
                  </div>

                  {/* Alert Sound Selection */}
                  <div className="pt-3 border-t border-gray-800/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Volume2 size={16} className="text-gray-400" />
                      <span className="text-gray-200 font-medium">
                        알림음 설정
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {NOTIFICATION_SOUNDS.map((sound) => (
                        <div
                          key={sound.id}
                          onClick={() => {
                            updateSettings({ selectedSoundId: sound.id });
                            previewSound(sound.id);
                          }}
                          className={cn(
                            "flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                            settings.selectedSoundId === sound.id
                              ? "bg-yellow-500/10 border border-yellow-500/30"
                              : "bg-gray-800/50 border border-transparent hover:border-gray-700",
                          )}
                        >
                          <span
                            className={cn(
                              "text-xs",
                              settings.selectedSoundId === sound.id
                                ? "text-yellow-500 font-medium"
                                : "text-gray-300",
                            )}
                          >
                            {sound.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              previewSound(sound.id);
                            }}
                            className="text-gray-500 hover:text-yellow-500 transition-colors p-1"
                          >
                            <Play size={14} />
                          </button>
                        </div>
                      ))}
                      <div
                        onClick={() =>
                          updateSettings({
                            selectedSoundId: null,
                          })
                        }
                        className={cn(
                          "flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                          settings.selectedSoundId === null
                            ? "bg-yellow-500/10 border border-yellow-500/30"
                            : "bg-gray-800/50 border border-transparent hover:border-gray-700",
                        )}
                      >
                        <span
                          className={cn(
                            "text-xs",
                            settings.selectedSoundId === null
                              ? "text-yellow-500 font-medium"
                              : "text-gray-300",
                          )}
                        >
                          무음
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2">
                      알림음은 주문 체결, 청산, 입출금 알림에 적용됩니다.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
