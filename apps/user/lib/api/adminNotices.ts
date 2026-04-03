import { createClient } from "@/lib/supabase/client";
import type { AdminNotice, NoticeCategory } from "@/lib/types/entities";

const supabase = createClient();

type NoticeAction = "create" | "update" | "delete" | "toggle-publish" | "toggle-pin";

export type AdminNoticePayload = {
  category: NoticeCategory;
  title: string;
  content: string;
  isPinned: boolean;
  eventEndDate?: string;
};

async function adminNoticesRequest<T>(
  method: "GET" | "POST",
  query?: Record<string, string | number | null | undefined>,
  body?: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No session");
  }

  const searchParams = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  const response = await fetch(
    `/api/admin/notices${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: method === "POST" ? JSON.stringify(body || {}) : undefined,
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload as T;
}

export async function fetchAdminNotices() {
  const payload = await adminNoticesRequest<{ notices: AdminNotice[] }>("GET");
  return payload.notices;
}

export async function createAdminNotice(data: AdminNoticePayload) {
  return adminNoticesRequest<{ success: true; notice: AdminNotice }>("POST", undefined, {
    action: "create" satisfies NoticeAction,
    ...data,
  });
}

export async function updateAdminNotice(id: number, data: AdminNoticePayload) {
  return adminNoticesRequest<{ success: true; notice: AdminNotice }>("POST", undefined, {
    action: "update" satisfies NoticeAction,
    id,
    ...data,
  });
}

export async function deleteAdminNotices(ids: number[]) {
  return adminNoticesRequest<{ success: true; deletedCount: number }>("POST", undefined, {
    action: "delete" satisfies NoticeAction,
    ids,
  });
}

export async function toggleAdminNoticePublish(id: number) {
  return adminNoticesRequest<{ success: true; notice: AdminNotice }>("POST", undefined, {
    action: "toggle-publish" satisfies NoticeAction,
    id,
  });
}

export async function toggleAdminNoticePin(id: number) {
  return adminNoticesRequest<{ success: true; notice: AdminNotice }>("POST", undefined, {
    action: "toggle-pin" satisfies NoticeAction,
    id,
  });
}
