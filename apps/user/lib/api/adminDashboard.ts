import { createClient } from "@/lib/supabase/client";
import type { DashboardStats } from "@/lib/types/database";

const supabase = createClient();

type DashboardStatsResponse = {
  stats: DashboardStats | null;
};

async function authedFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No session");
  }

  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload as T;
}

export async function fetchAdminDashboardStats() {
  const data = await authedFetch<DashboardStatsResponse>(
    "/api/admin/dashboard/stats",
    { method: "GET" },
  );
  return data.stats;
}

export async function adjustAdminMemberBalance(
  userId: string,
  amount: number,
  reason?: string,
) {
  return authedFetch<{ success: true; result: Record<string, unknown> }>(
    "/api/admin/members/balance",
    {
      method: "POST",
      body: JSON.stringify({ userId, amount, reason }),
    },
  );
}

type ProcessWalletAction = "approve" | "reject";

export async function processAdminWalletRequest(params: {
  kind: "deposit" | "withdrawal";
  requestId: number;
  action: ProcessWalletAction;
  reason?: string | null;
}) {
  return authedFetch<{ success: true }>("/api/admin/wallet/manage", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
