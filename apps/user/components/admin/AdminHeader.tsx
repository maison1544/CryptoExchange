"use client";

import { Bell, User, BellOff, Volume2, X, Play, Settings } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useNotification,
  NOTIFICATION_SOUNDS,
} from "@/contexts/NotificationContext";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/admin/ui/LogoutButton";

export function AdminHeader() {
  const { user } = useAuth();
  const { settings, updateSettings, previewSound } = useNotification();
  const [showSoundModal, setShowSoundModal] = useState(false);

  return (
    <>
      <header className="shell-chrome sticky top-0 z-50 border-b hairline-divider">
        <div className="flex w-full flex-col gap-3 px-4 py-3 lg:px-5 xl:h-16 xl:flex-row xl:items-center xl:justify-between xl:py-0 2xl:px-6">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
              Admin Workspace
            </div>
            <div className="mt-1 text-sm font-medium text-gray-200">
              운영 상태와 회원 활동을 조용한 밀도로 관리합니다.
            </div>
          </div>

          <div className="flex w-full min-w-0 items-center justify-between gap-3 xl:w-auto xl:justify-end">
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <button
                onClick={() =>
                  updateSettings({ globalEnabled: !settings.globalEnabled })
                }
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/8 bg-white/3 px-3 py-2 text-[13px] text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {settings.globalEnabled ? (
                  <Bell size={16} />
                ) : (
                  <BellOff size={16} />
                )}
                <span>
                  {settings.globalEnabled ? "알림음 켜짐" : "알림음 꺼짐"}
                </span>
              </button>

              <button
                onClick={() => setShowSoundModal(true)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[13px] text-gray-400 hover:bg-white/4 hover:text-white"
              >
                <Settings size={15} />
                <span>알림 설정</span>
              </button>
            </div>

            <div className="hidden h-8 w-px bg-white/8 xl:block" />

            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 items-center gap-3 rounded-full border border-white/8 bg-white/3 px-2.5 py-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/4 text-gray-300">
                  <User size={16} />
                </div>
                <div className="hidden min-w-0 text-sm md:block">
                  <div className="font-medium text-white">관리자</div>
                  <div className="truncate text-xs text-gray-500">
                    {user?.email ?? "admin"}
                  </div>
                </div>
              </div>

              <LogoutButton redirectTo="/admin/login" />
            </div>
          </div>
        </div>
      </header>

      {showSoundModal && (
        <div className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto bg-black/72 px-4 py-6 backdrop-blur-sm">
          <div className="panel-elevated flex max-h-[calc(100vh-3rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b hairline-divider px-5 py-4">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                  <Bell size={18} /> 관리자 알림 설정
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  각 항목 변경 시 설정이 즉시 저장됩니다.
                </p>
              </div>
              <button
                onClick={() => setShowSoundModal(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-white/4 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                  알림 유형
                </div>
                {[
                  {
                    key: "depositWithdrawEnabled" as const,
                    label: "입출금 신청 알림",
                    desc: "회원의 입출금 신청이 들어올 때 알립니다.",
                  },
                  {
                    key: "registrationEnabled" as const,
                    label: "가입 신청 알림",
                    desc: "새로운 회원 가입 신청이 들어올 때 알립니다.",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/6 bg-white/3 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm text-gray-200">{item.label}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {item.desc}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateSettings({ [item.key]: !settings[item.key] })
                      }
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors",
                        settings[item.key] ? "bg-yellow-500" : "bg-white/10",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
                          settings[item.key] ? "left-6" : "left-1",
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t hairline-divider pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <Volume2 size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-200">
                    알림음 선택
                  </span>
                </div>
                <div className="space-y-2">
                  {NOTIFICATION_SOUNDS.map((sound) => (
                    <div
                      key={sound.id}
                      onClick={() =>
                        updateSettings({ selectedSoundId: sound.id })
                      }
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-3 transition-colors",
                        settings.selectedSoundId === sound.id
                          ? "border-yellow-500/30 bg-yellow-500/8"
                          : "border-white/6 bg-white/3 hover:bg-white/4",
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm",
                          settings.selectedSoundId === sound.id
                            ? "font-medium text-yellow-500"
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
                        className="rounded-full p-2 text-gray-500 hover:bg-white/4 hover:text-white"
                      >
                        <Play size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
