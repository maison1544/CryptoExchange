import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const DEFAULT_PAGE_SIZE = 10;

export type PartnerSummary = {
  id: string;
  name: string;
  grade: string;
  referralCode: string;
  availableCommissionBalance: number;
  totalCommissionEarned: number;
  lossCommission: number;
  rollingCommission: number;
  feeCommission: number;
  memberCount: number;
  pendingWithdrawalAmount: number;
  pendingWithdrawalCount: number;
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
};

export type PartnerRecentCommissionRow = {
  id: number;
  date: string;
  memberName: string;
  sourceLabel: string;
  amount: number;
};

export type PartnerMemberRow = {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: string;
  balance: number;
  futuresBalance: number;
  stakingBalance: number;
  totalDeposit: number;
  totalWithdraw: number;
  joinDate: string;
  joinCode: string;
};

export type PartnerCommissionRow = {
  id: number;
  date: string;
  memberEmail: string;
  typeLabel: string;
  description: string;
  amount: number;
};

export type PartnerWithdrawalRow = {
  id: number;
  date: string;
  amount: number;
  bank: string;
  accountNumber: string;
  accountHolder: string;
  status: string;
  rejectReason: string | null;
};

export type PartnerPagedResult<T> = {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type PartnerSummaryResponse = {
  success: true;
  summary: PartnerSummary;
  recentCommissions: PartnerRecentCommissionRow[];
};

type PartnerMembersResponse = {
  success: true;
  summary: PartnerSummary;
  members: PartnerPagedResult<PartnerMemberRow>;
};

type PartnerCommissionsResponse = {
  success: true;
  summary: PartnerSummary;
  commissions: PartnerPagedResult<PartnerCommissionRow>;
};

type PartnerWithdrawalsResponse = {
  success: true;
  summary: PartnerSummary;
  withdrawals: PartnerPagedResult<PartnerWithdrawalRow>;
};

type PartnerRequestWithdrawalResponse = {
  success: true;
  summary: PartnerSummary;
  message: string;
};

type PartnerApiQuery = Record<string, string | number | undefined | null>;

async function partnerRequest<T>(
  method: "GET" | "POST",
  query?: PartnerApiQuery,
  body?: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No session");
  }

  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  const response = await fetch(
    `/api/partner${params.size > 0 ? `?${params.toString()}` : ""}`,
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

export async function fetchPartnerSummary() {
  return partnerRequest<PartnerSummaryResponse>("GET", {
    section: "summary",
  });
}

export async function fetchPartnerMembers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  return partnerRequest<PartnerMembersResponse>("GET", {
    section: "members",
    page: params.page ?? 1,
    pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
    search: params.search,
  });
}

export async function fetchPartnerCommissions(params: {
  page?: number;
  pageSize?: number;
  sourceType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  return partnerRequest<PartnerCommissionsResponse>("GET", {
    section: "commissions",
    page: params.page ?? 1,
    pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
    sourceType: params.sourceType,
    startDate: params.startDate,
    endDate: params.endDate,
    search: params.search,
  });
}

export async function fetchPartnerWithdrawals(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  return partnerRequest<PartnerWithdrawalsResponse>("GET", {
    section: "withdrawals",
    page: params.page ?? 1,
    pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
    status: params.status,
    startDate: params.startDate,
    endDate: params.endDate,
    search: params.search,
  });
}

export async function requestPartnerWithdrawal(amount: number) {
  return partnerRequest<PartnerRequestWithdrawalResponse>("POST", undefined, {
    action: "request-withdrawal",
    amount,
  });
}
