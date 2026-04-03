import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type AdminInquiryStatus = "waiting" | "answered" | "closed";

export type AdminInquiryReply = {
  id: number;
  writer: "user" | "admin";
  content: string;
  createdAt: string;
};

export type AdminInquiry = {
  id: number;
  category: "etc";
  title: string;
  content: string;
  userName: string;
  userId: string;
  status: AdminInquiryStatus;
  createdAt: string;
  replies: AdminInquiryReply[];
};

export type AdminMessageHistoryItem = {
  id: number;
  title: string;
  content: string;
  target: string;
  sender: string;
  date: string;
};

export type AdminPopupItem = {
  id: number;
  title: string;
  content: string;
  imageUrl: string;
  linkUrl: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  target: "all" | "user" | "agent";
  createdAt: string;
};

export type AdminPopupPayload = {
  title: string;
  content: string;
  imageUrl?: string;
  linkUrl?: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  target: "all" | "user" | "agent";
};

async function adminContentRequest<T>(
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
    `/api/admin/content${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
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

export async function fetchAdminInquiries() {
  const payload = await adminContentRequest<{ inquiries: AdminInquiry[] }>("GET", {
    resource: "inquiries",
  });

  return payload.inquiries;
}

export async function replyAdminInquiry(ticketId: number, content: string) {
  return adminContentRequest<{ success: true }>("POST", undefined, {
    resource: "inquiries",
    action: "reply",
    ticketId,
    content,
  });
}

export async function closeAdminInquiry(ticketId: number) {
  return adminContentRequest<{ success: true }>("POST", undefined, {
    resource: "inquiries",
    action: "close",
    ticketId,
  });
}

export async function deleteAdminInquiries(ticketIds: number[]) {
  return adminContentRequest<{ success: true; deletedCount: number }>(
    "POST",
    undefined,
    {
      resource: "inquiries",
      action: "delete",
      ticketIds,
    },
  );
}

export async function fetchAdminMessages() {
  const payload = await adminContentRequest<{ messages: AdminMessageHistoryItem[] }>(
    "GET",
    {
      resource: "messages",
    },
  );

  return payload.messages;
}

export async function sendAdminMessage(data: {
  target?: string;
  title: string;
  content: string;
}) {
  return adminContentRequest<{ success: true; sentCount: number }>(
    "POST",
    undefined,
    {
      resource: "messages",
      action: "send",
      ...data,
    },
  );
}

export async function fetchAdminPopups() {
  const payload = await adminContentRequest<{ popups: AdminPopupItem[] }>("GET", {
    resource: "popups",
  });

  return payload.popups;
}

export async function createAdminPopup(data: AdminPopupPayload) {
  return adminContentRequest<{ success: true; popup: AdminPopupItem }>(
    "POST",
    undefined,
    {
      resource: "popups",
      action: "create",
      ...data,
    },
  );
}

export async function updateAdminPopup(id: number, data: AdminPopupPayload) {
  return adminContentRequest<{ success: true; popup: AdminPopupItem }>(
    "POST",
    undefined,
    {
      resource: "popups",
      action: "update",
      id,
      ...data,
    },
  );
}

export async function deleteAdminPopup(id: number) {
  return adminContentRequest<{ success: true; deletedId: number }>(
    "POST",
    undefined,
    {
      resource: "popups",
      action: "delete",
      id,
    },
  );
}
