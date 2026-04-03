import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type AdminPartnerAction = "update" | "adjust-balance";

export type AdminPartnerRow = {
  id: string;
  visibleId: string;
  name: string;
  grade: string;
  phone: string;
  email: string;
  account: string;
  balance: number;
  balanceAdjustment: number;
  memberCount: number;
  joinCode: string;
  lossCommission: number;
  rollingCommission: number;
  feeCommission: number;
  totalCommissionEarned: number;
  date: string;
  status: string;
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
  lastLoginIp: string;
  lastLoginDate: string;
};

export type AdminPartnerMemberRow = {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: string;
  balance: number;
  totalDeposit: number;
  totalWithdraw: number;
  joinDate: string;
  joinCode: string;
};

type AdminPartnersResponse = {
  partners: AdminPartnerRow[];
  partnerMembers: Record<string, AdminPartnerMemberRow[]>;
};

export type UpdateAdminPartnerPayload = {
  name: string;
  phone: string;
  email: string;
  grade: string;
  lossCommissionRate: number;
  commissionRate: number;
  feeCommissionRate: number;
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
  referralCode: string;
  isActive: boolean;
};

async function adminPartnersRequest<T>(
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No session");
  }

  const response = await fetch("/api/admin/partners", {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload as T;
}

export async function fetchAdminPartners() {
  return adminPartnersRequest<AdminPartnersResponse>("GET");
}

export async function updateAdminPartner(
  partnerId: string,
  payload: UpdateAdminPartnerPayload,
) {
  return adminPartnersRequest<{ success: true }>("POST", {
    action: "update" satisfies AdminPartnerAction,
    partnerId,
    ...payload,
  });
}

export async function adjustAdminPartnerBalance(
  partnerId: string,
  signedAmount: number,
) {
  return adminPartnersRequest<{ success: true; balanceAdjustment: number }>(
    "POST",
    {
      action: "adjust-balance" satisfies AdminPartnerAction,
      partnerId,
      signedAmount,
    },
  );
}
