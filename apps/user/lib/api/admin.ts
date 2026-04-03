import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function callAdminApiRoute(path: string, body: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      data: null,
      error: { message: "No session" },
    };
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      data: payload,
      error: {
        message: payload?.error || `Request failed (${response.status})`,
      },
    };
  }

  return {
    data: payload,
    error: null,
  };
}

async function callAdminEdgeFunction(fnName: string, body: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "No session" };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function createBackofficeAccount(data: {
  accountType: "admin" | "agent";
  username: string;
  name: string;
  email?: string;
  phone?: string;
  password: string;
  grade?: string;
  commissionRate?: number;
  lossCommissionRate?: number;
  feeCommissionRate?: number;
  role?: "super_admin" | "admin";
  referralCode?: string;
}) {
  return callAdminEdgeFunction("admin-create-backoffice-account", data);
}

export async function deleteBackofficeAccount(
  accountType: "admin" | "agent",
  userId: string,
) {
  return callAdminEdgeFunction("admin-delete-backoffice-account", {
    accountType,
    userId,
  });
}

export async function updateUserPassword(userId: string, newPassword: string) {
  return callAdminEdgeFunction("admin-update-user-password", {
    userId,
    newPassword,
  });
}

export async function forceLogout(userId: string) {
  return callAdminEdgeFunction("admin-force-logout", { userId });
}

export async function processDeposit(
  depositId: number,
  action: "approve" | "reject",
  reason?: string,
) {
  return callAdminApiRoute("/api/admin/wallet/manage", {
    kind: "deposit",
    requestId: depositId,
    action,
    reason: reason ?? null,
  });
}

export async function processWithdrawal(
  withdrawalId: number,
  action: "approve" | "reject",
  reason?: string,
) {
  return callAdminApiRoute("/api/admin/wallet/manage", {
    kind: "withdrawal",
    requestId: withdrawalId,
    action,
    reason: reason ?? null,
  });
}

export async function adjustUserBalance(
  userId: string,
  amount: number,
  reason?: string,
) {
  return supabase.rpc("adjust_user_balance", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason ?? "admin_adjustment",
  });
}

export async function manageFuturesPosition(
  positionId: string | number,
  action: "force-liquidate" | "refund-trade",
  note?: string,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      success: false,
      error: "No session",
    };
  }

  const response = await fetch("/api/admin/futures/manage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      positionId: String(positionId),
      action,
      note: note?.trim() || null,
    }),
  });

  return response.json();
}

export async function manageStakingAction(data: {
  action:
    | "set-product-rate"
    | "set-position-rate"
    | "settle-position"
    | "cancel-position"
    | "cancel-product";
  productId?: number;
  stakingId?: number;
  rate?: number | null;
  reason?: string | null;
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      success: false,
      error: "No session",
    };
  }

  const response = await fetch("/api/admin/staking/manage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(data),
  });

  return response.json();
}

export async function cancelStaking(stakingId: number, reason?: string) {
  return manageStakingAction({
    action: "cancel-position",
    stakingId,
    reason: reason ?? "admin_cancel",
  });
}

export async function settleStaking(stakingId: number) {
  return manageStakingAction({
    action: "settle-position",
    stakingId,
  });
}

export async function getDashboardStats() {
  return supabase.rpc("get_admin_dashboard_stats");
}
