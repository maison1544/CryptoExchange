"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const NOTIFICATION_SOUNDS = [
  { id: 1, name: "기본 알림", file: "/sounds/notification1.mp3" },
  { id: 2, name: "알림음 2", file: "/sounds/notification2.mp3" },
  { id: 3, name: "알림음 3", file: "/sounds/notification3.mp3" },
  { id: 4, name: "알림음 4", file: "/sounds/notification4.mp3" },
  { id: 5, name: "알림음 5", file: "/sounds/notification5.mp3" },
] as const;

export interface NotificationSettings {
  selectedSoundId: number | null;
  globalEnabled: boolean;
  orderFillEnabled: boolean;
  liquidationWarningEnabled: boolean;
  liquidationAlertEnabled: boolean;
  depositWithdrawEnabled: boolean;
  registrationEnabled: boolean;
}

export interface ToastNotification {
  title: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
}

interface NotificationContextValue {
  settings: NotificationSettings;
  updateSettings: (updates: Partial<NotificationSettings>) => void;
  playSound: () => void;
  previewSound: (soundId: number | null) => void;
  addToast: (toastPayload: ToastNotification) => void;
}

type NotificationRow = {
  id: number;
  title: string;
  body: string | null;
  type: string | null;
  is_read: boolean;
  created_at: string;
};

type AgentWithdrawalRow = {
  id: number;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  amount: number | string | null;
  created_at: string;
};

type AdminPendingSnapshot = {
  deposits: number;
  withdrawals: number;
  registrations: number;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  selectedSoundId: 1,
  globalEnabled: true,
  orderFillEnabled: true,
  liquidationWarningEnabled: true,
  liquidationAlertEnabled: true,
  depositWithdrawEnabled: true,
  registrationEnabled: true,
};

const STORAGE_KEY = "nexus_notification_settings";
const POLL_INTERVAL_MS = 10000;
const supabase = createClient();
const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

function normalizeNotificationType(
  type: string | null | undefined,
  title: string,
) {
  const normalized = String(type || "").toLowerCase();
  if (normalized) return normalized;
  if (title.includes("청산")) return "liquidation";
  if (title.includes("입금") || title.includes("출금")) return "withdrawal";
  if (title.includes("가입")) return "registration";
  return "general";
}

function mapToastType(
  type: string | null | undefined,
  title: string,
  body: string | null | undefined,
): ToastNotification["type"] {
  const normalized = normalizeNotificationType(type, title);
  if (
    normalized.includes("reject") ||
    normalized.includes("error") ||
    normalized.includes("fail") ||
    title.includes("거절") ||
    title.includes("실패") ||
    (body || "").includes("거절")
  ) {
    return "error";
  }
  if (normalized.includes("warning")) return "warning";
  if (
    normalized.includes("deposit") ||
    normalized.includes("withdraw") ||
    normalized.includes("staking") ||
    normalized.includes("registration") ||
    normalized.includes("order") ||
    normalized.includes("liquidation")
  ) {
    return "success";
  }
  return "info";
}

function shouldToastBySettings(
  type: string | null | undefined,
  title: string,
  settings: NotificationSettings,
) {
  const normalized = normalizeNotificationType(type, title);
  if (
    normalized.includes("order") ||
    normalized.includes("trade") ||
    normalized.includes("fill")
  ) {
    return settings.orderFillEnabled;
  }
  if (normalized.includes("liquidation_warning")) {
    return settings.liquidationWarningEnabled;
  }
  if (normalized.includes("liquidation")) {
    return settings.liquidationAlertEnabled;
  }
  if (
    normalized.includes("deposit") ||
    normalized.includes("withdraw") ||
    normalized.includes("staking")
  ) {
    return settings.depositWithdrawEnabled;
  }
  if (normalized.includes("registration")) {
    return settings.registrationEnabled;
  }
  return true;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isInitialized, role, user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const latestUserNotificationAtRef = useRef<string | null>(null);
  const adminSnapshotRef = useRef<AdminPendingSnapshot | null>(null);
  const agentWithdrawalStatusRef = useRef<
    Record<number, AgentWithdrawalRow["status"]>
  >({});

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const updateSettings = useCallback(
    (updates: Partial<NotificationSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const playSound = useCallback(() => {
    if (!settings.globalEnabled || settings.selectedSoundId === null) return;
    const sound = NOTIFICATION_SOUNDS.find(
      (item) => item.id === settings.selectedSoundId,
    );
    if (!sound) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const audio = new Audio(sound.file);
      audio.volume = 0.5;
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch {}
  }, [settings.globalEnabled, settings.selectedSoundId]);

  const previewSound = useCallback((soundId: number | null) => {
    if (soundId === null) return;
    const sound = NOTIFICATION_SOUNDS.find((item) => item.id === soundId);
    if (!sound) return;
    try {
      const audio = new Audio(sound.file);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }, []);

  const addToast = useCallback(
    ({ title, message, type, duration }: ToastNotification) => {
      if (!settings.globalEnabled) return;

      playSound();

      const options = {
        description: message,
        duration: duration ?? 5000,
      };

      if (type === "success") {
        toast.success(title, options);
        return;
      }
      if (type === "error") {
        toast.error(title, options);
        return;
      }
      if (type === "warning") {
        toast.warning(title, options);
        return;
      }
      toast(title, options);
    },
    [playSound, settings.globalEnabled],
  );

  useEffect(() => {
    if (!isInitialized || !user?.id || role !== "user") {
      latestUserNotificationAtRef.current = null;
      return;
    }

    let cancelled = false;

    const pollUserNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, type, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (cancelled) return;

      const notifications = (data ?? []) as NotificationRow[];
      const latestCreatedAt = notifications[0]?.created_at ?? null;

      if (latestUserNotificationAtRef.current === null) {
        latestUserNotificationAtRef.current = latestCreatedAt;
        return;
      }

      if (!latestCreatedAt) return;

      const baseline = new Date(latestUserNotificationAtRef.current).getTime();
      const newNotifications = notifications
        .filter((item) => new Date(item.created_at).getTime() > baseline)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

      newNotifications.forEach((item) => {
        if (!shouldToastBySettings(item.type, item.title, settings)) return;
        addToast({
          title: item.title,
          message: item.body || "새 알림이 도착했습니다.",
          type: mapToastType(item.type, item.title, item.body),
        });
      });

      latestUserNotificationAtRef.current = latestCreatedAt;
    };

    void pollUserNotifications();
    const intervalId = window.setInterval(
      pollUserNotifications,
      POLL_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [addToast, isInitialized, role, settings, user?.id]);

  useEffect(() => {
    if (!isInitialized || !user?.id || role !== "agent") {
      agentWithdrawalStatusRef.current = {};
      return;
    }

    let cancelled = false;

    const pollAgentWithdrawals = async () => {
      const { data } = await supabase
        .from("withdrawals")
        .select("id, status, reject_reason, amount, created_at")
        .eq("agent_id", user.id)
        .eq("withdrawal_type", "agent")
        .order("created_at", { ascending: false })
        .limit(30);

      if (cancelled) return;

      const rows = (data ?? []) as AgentWithdrawalRow[];

      if (Object.keys(agentWithdrawalStatusRef.current).length === 0) {
        agentWithdrawalStatusRef.current = Object.fromEntries(
          rows.map((item) => [item.id, item.status]),
        );
        return;
      }

      rows.forEach((item) => {
        const previousStatus = agentWithdrawalStatusRef.current[item.id];
        if (!previousStatus || previousStatus === item.status) return;
        if (
          !shouldToastBySettings("agent_withdrawal", "파트너 출금", settings)
        ) {
          agentWithdrawalStatusRef.current[item.id] = item.status;
          return;
        }

        addToast({
          title:
            item.status === "approved"
              ? "파트너 출금 승인 완료"
              : "파트너 출금 거절",
          message:
            item.status === "approved"
              ? `${Number(item.amount || 0).toLocaleString()} USDT 출금 요청이 승인되었습니다.`
              : item.reject_reason
                ? `출금 요청이 거절되었습니다. 사유: ${item.reject_reason}`
                : "출금 요청이 거절되었습니다.",
          type: item.status === "approved" ? "success" : "error",
        });
        agentWithdrawalStatusRef.current[item.id] = item.status;
      });

      rows.forEach((item) => {
        agentWithdrawalStatusRef.current[item.id] = item.status;
      });
    };

    void pollAgentWithdrawals();
    const intervalId = window.setInterval(
      pollAgentWithdrawals,
      POLL_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [addToast, isInitialized, role, settings, user?.id]);

  useEffect(() => {
    if (!isInitialized || role !== "admin") {
      adminSnapshotRef.current = null;
      return;
    }

    let cancelled = false;

    const pollAdminPendingCounts = async () => {
      const [depositRes, withdrawalRes, registrationRes] = await Promise.all([
        supabase
          .from("deposits")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("withdrawals")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_approval"),
      ]);

      if (cancelled) return;

      const snapshot: AdminPendingSnapshot = {
        deposits: depositRes.count ?? 0,
        withdrawals: withdrawalRes.count ?? 0,
        registrations: registrationRes.count ?? 0,
      };

      if (!adminSnapshotRef.current) {
        adminSnapshotRef.current = snapshot;
        return;
      }

      if (
        settings.depositWithdrawEnabled &&
        snapshot.deposits > adminSnapshotRef.current.deposits
      ) {
        addToast({
          title: "새 입금 요청",
          message: `대기 중인 입금 요청이 ${snapshot.deposits - adminSnapshotRef.current.deposits}건 추가되었습니다.`,
          type: "info",
        });
      }

      if (
        settings.depositWithdrawEnabled &&
        snapshot.withdrawals > adminSnapshotRef.current.withdrawals
      ) {
        addToast({
          title: "새 출금 요청",
          message: `대기 중인 출금 요청이 ${snapshot.withdrawals - adminSnapshotRef.current.withdrawals}건 추가되었습니다.`,
          type: "info",
        });
      }

      if (
        settings.registrationEnabled &&
        snapshot.registrations > adminSnapshotRef.current.registrations
      ) {
        addToast({
          title: "새 가입 승인 요청",
          message: `승인 대기 회원이 ${snapshot.registrations - adminSnapshotRef.current.registrations}명 추가되었습니다.`,
          type: "info",
        });
      }

      adminSnapshotRef.current = snapshot;
    };

    void pollAdminPendingCounts();
    const intervalId = window.setInterval(
      pollAdminPendingCounts,
      POLL_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [addToast, isInitialized, role, settings]);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      playSound,
      previewSound,
      addToast,
    }),
    [addToast, playSound, previewSound, settings, updateSettings],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}
