import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getCommissionFilterLabel,
  getCommissionSourceLabel,
} from "@/lib/utils/commission";
import { formatDate, formatDateTime } from "@/lib/utils/formatDate";
import { getPaginationBounds } from "@/lib/utils/pagination";
import { sanitizePostgrestSearch } from "@/lib/utils/sanitizeSearch";

type AgentRow = {
  id: string;
  username: string;
  name: string;
  grade: string | null;
  referral_code: string | null;
  commission_rate: number | string | null;
  loss_commission_rate: number | string | null;
  fee_commission_rate: number | string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_holder: string | null;
  commission_balance: number | string | null;
  is_active: boolean | null;
};

type AgentCommissionProfileRow = {
  name?: string | null;
  email?: string | null;
};

type AgentCommissionRow = {
  id: number;
  user_id?: string | null;
  source_type: string | null;
  amount: number | string | null;
  created_at: string;
  user_profiles?:
    | AgentCommissionProfileRow[]
    | AgentCommissionProfileRow
    | null;
};

type AgentWithdrawalRow = {
  id: number;
  amount: number | string | null;
  status: string | null;
  bank: string | null;
  account_number: string | null;
  account_holder: string | null;
  reject_reason: string | null;
  created_at: string;
};

type UserProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  wallet_balance: number | string | null;
  created_at: string;
  referral_code_used: string | null;
};

type DepositAggregateRow = {
  user_id: string | null;
  amount: number | string | null;
  status: string | null;
};

type WithdrawalAggregateRow = {
  user_id: string | null;
  amount: number | string | null;
  status: string | null;
};

type CommissionBreakdown = {
  trade_fee: number;
  rolling: number;
  loss: number;
  staking: number;
  deposit: number;
};

type PartnerSummary = {
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
  commissionBreakdown: CommissionBreakdown;
  monthCommissionBreakdown: CommissionBreakdown;
};

type PartnerSummaryResponse = {
  success: true;
  summary: PartnerSummary;
  recentCommissions: {
    id: number;
    date: string;
    memberName: string;
    sourceLabel: string;
    amount: number;
  }[];
};

type FuturesPositionRow = {
  user_id: string;
  margin: number | string | null;
  status: string | null;
};

type StakingPositionRow = {
  user_id: string;
  amount: number | string | null;
  status: string | null;
};

type PartnerMembersResponse = {
  success: true;
  summary: PartnerSummary;
  members: {
    rows: {
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
    }[];
    totalCount: number;
    page: number;
    pageSize: number;
  };
};

type PartnerCommissionsResponse = {
  success: true;
  summary: PartnerSummary;
  commissions: {
    rows: {
      id: number;
      date: string;
      memberEmail: string;
      typeLabel: string;
      description: string;
      amount: number;
    }[];
    totalCount: number;
    page: number;
    pageSize: number;
  };
};

type PartnerWithdrawalsResponse = {
  success: true;
  summary: PartnerSummary;
  withdrawals: {
    rows: {
      id: number;
      date: string;
      amount: number;
      bank: string;
      accountNumber: string;
      accountHolder: string;
      status: string;
      rejectReason: string | null;
    }[];
    totalCount: number;
    page: number;
    pageSize: number;
  };
};

type RequestWithdrawalBody = {
  action?: "request-withdrawal";
  amount?: number;
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server config error");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function toSafeNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeSearchTerm(value: string | null) {
  return sanitizePostgrestSearch(value);
}

function normalizePageParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "처리중";
    case "approved":
      return "완료";
    case "rejected":
      return "거절";
    default:
      return status || "-";
  }
}

function resolveCommissionSourceTypesFromSearch(term: string) {
  const normalized = term.toLowerCase();
  const sourceTypes = new Set<string>();

  if (normalized.includes("수수료") || normalized.includes("fee")) {
    sourceTypes.add("trade_fee");
  }
  if (normalized.includes("롤링") || normalized.includes("rolling")) {
    sourceTypes.add("rolling");
  }
  if (normalized.includes("죽장") || normalized.includes("loss")) {
    sourceTypes.add("loss");
  }
  if (normalized.includes("스테이킹") || normalized.includes("staking")) {
    sourceTypes.add("staking");
  }
  if (normalized.includes("입금") || normalized.includes("deposit")) {
    sourceTypes.add("deposit");
  }

  return [...sourceTypes];
}

function getCommissionMemberName(
  profiles:
    | AgentCommissionProfileRow[]
    | AgentCommissionProfileRow
    | null
    | undefined,
) {
  if (!profiles) {
    return "-";
  }

  if (Array.isArray(profiles)) {
    return (
      profiles
        .map((profile) => profile.name)
        .filter(Boolean)
        .join(", ") || "-"
    );
  }

  return profiles.name || "-";
}

async function requireAgent(req: NextRequest) {
  const jwt = getBearer(req);

  if (!jwt) {
    return {
      error: NextResponse.json(
        { error: "Missing auth token" },
        { status: 401 },
      ),
      admin: null,
      userId: null,
      agent: null,
    } as const;
  }

  const admin = getAdminClient();
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt);

  if (authError || !user) {
    return {
      error: NextResponse.json(
        { error: "Invalid auth token" },
        { status: 401 },
      ),
      admin: null,
      userId: null,
      agent: null,
    } as const;
  }

  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select(
      "id, username, name, grade, referral_code, commission_rate, loss_commission_rate, fee_commission_rate, bank_name, bank_account, bank_account_holder, commission_balance, is_active",
    )
    .eq("id", user.id)
    .maybeSingle<AgentRow>();

  if (agentError) {
    return {
      error: NextResponse.json({ error: agentError.message }, { status: 500 }),
      admin: null,
      userId: null,
      agent: null,
    } as const;
  }

  if (!agent) {
    return {
      error: NextResponse.json(
        { error: "Agent privileges required" },
        { status: 403 },
      ),
      admin: null,
      userId: null,
      agent: null,
    } as const;
  }

  if (agent.is_active === false) {
    return {
      error: NextResponse.json(
        { error: "Inactive partner account" },
        { status: 403 },
      ),
      admin: null,
      userId: null,
      agent: null,
    } as const;
  }

  return {
    error: null,
    admin,
    userId: user.id,
    agent,
  } as const;
}

async function buildPartnerSummary(
  admin: ReturnType<typeof getAdminClient>,
  agent: AgentRow,
) {
  const [
    memberCountResult,
    commissionResult,
    withdrawalResult,
    recentCommissionResult,
  ] = await Promise.all([
    admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent.id),
    admin
      .from("agent_commissions")
      .select("amount, source_type, created_at")
      .eq("agent_id", agent.id),
    admin
      .from("withdrawals")
      .select("amount, status")
      .eq("agent_id", agent.id)
      .eq("withdrawal_type", "agent"),
    admin
      .from("agent_commissions")
      .select(
        "id, amount, source_type, created_at, user_id, user_profiles(name)",
      )
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  if (memberCountResult.error) {
    throw new Error(memberCountResult.error.message);
  }

  if (commissionResult.error) {
    throw new Error(commissionResult.error.message);
  }

  if (withdrawalResult.error) {
    throw new Error(withdrawalResult.error.message);
  }

  if (recentCommissionResult.error) {
    throw new Error(recentCommissionResult.error.message);
  }

  const commissionRows =
    (commissionResult.data as
      | {
          amount: number | string | null;
          source_type: string | null;
          created_at: string;
        }[]
      | null) ?? [];

  const emptyBreakdown: CommissionBreakdown = {
    trade_fee: 0,
    rolling: 0,
    loss: 0,
    staking: 0,
    deposit: 0,
  };
  const commissionBreakdown: CommissionBreakdown = { ...emptyBreakdown };
  const monthCommissionBreakdown: CommissionBreakdown = { ...emptyBreakdown };

  // KST month boundary so the breakdown matches the partner's local month.
  // Using UTC instead would roll over 9 hours early for Korean partners.
  const now = new Date();
  const kstMonthLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(now);

  let totalCommissionEarned = 0;
  for (const row of commissionRows) {
    const amount = toSafeNumber(row.amount);
    totalCommissionEarned += amount;
    const key = (row.source_type ?? "") as keyof CommissionBreakdown;
    if (key in commissionBreakdown) {
      commissionBreakdown[key] += amount;
    }

    const rowMonthLabel = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
    }).format(new Date(row.created_at));

    if (rowMonthLabel === kstMonthLabel && key in monthCommissionBreakdown) {
      monthCommissionBreakdown[key] += amount;
    }
  }

  const approvedWithdrawalAmount = (
    (withdrawalResult.data as
      | {
          amount: number | string | null;
          status: string | null;
        }[]
      | null) ?? []
  )
    .filter((row) => row.status === "approved")
    .reduce((sum, row) => sum + toSafeNumber(row.amount), 0);

  const pendingWithdrawalRows = (
    (withdrawalResult.data as
      | {
          amount: number | string | null;
          status: string | null;
        }[]
      | null) ?? []
  ).filter((row) => row.status === "pending");
  const pendingWithdrawalAmount = pendingWithdrawalRows.reduce(
    (sum, row) => sum + toSafeNumber(row.amount),
    0,
  );

  const summary: PartnerSummary = {
    id: agent.username,
    name: agent.name,
    grade: agent.grade || "총판",
    referralCode: agent.referral_code || "-",
    availableCommissionBalance: Math.max(
      0,
      totalCommissionEarned -
        approvedWithdrawalAmount -
        pendingWithdrawalAmount +
        toSafeNumber(agent.commission_balance),
    ),
    totalCommissionEarned,
    lossCommission: toSafeNumber(agent.loss_commission_rate) || 15,
    rollingCommission: toSafeNumber(agent.commission_rate) * 100,
    feeCommission: toSafeNumber(agent.fee_commission_rate) || 30,
    memberCount: memberCountResult.count ?? 0,
    pendingWithdrawalAmount,
    pendingWithdrawalCount: pendingWithdrawalRows.length,
    bankName: agent.bank_name || "",
    bankAccount: agent.bank_account || "",
    bankAccountHolder: agent.bank_account_holder || "",
    commissionBreakdown,
    monthCommissionBreakdown,
  };

  const recentCommissions = (
    (recentCommissionResult.data as AgentCommissionRow[] | null) ?? []
  ).map((row) => ({
    id: row.id,
    date: formatDateTime(row.created_at),
    memberName: getCommissionMemberName(row.user_profiles),
    sourceLabel: getCommissionFilterLabel(row.source_type),
    amount: toSafeNumber(row.amount),
  }));

  return {
    summary,
    recentCommissions,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAgent(req);

    if (auth.error) {
      return auth.error;
    }

    if (!auth.admin || !auth.agent) {
      return NextResponse.json(
        { error: "Agent client unavailable" },
        { status: 500 },
      );
    }

    const section = req.nextUrl.searchParams.get("section") || "summary";
    const page = normalizePageParam(req.nextUrl.searchParams.get("page"), 1);
    const pageSize = Math.min(
      50,
      normalizePageParam(req.nextUrl.searchParams.get("pageSize"), 10),
    );

    const summaryPayload = await buildPartnerSummary(auth.admin, auth.agent);

    if (section === "summary") {
      return NextResponse.json({
        success: true,
        summary: summaryPayload.summary,
        recentCommissions: summaryPayload.recentCommissions,
      } satisfies PartnerSummaryResponse);
    }

    if (section === "members") {
      const search = sanitizeSearchTerm(req.nextUrl.searchParams.get("search"));
      let query = auth.admin
        .from("user_profiles")
        .select(
          "id, email, name, phone, status, wallet_balance, created_at, referral_code_used",
          { count: "exact" },
        )
        .eq("agent_id", auth.agent.id)
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,referral_code_used.ilike.%${search}%`,
        );
      }

      const { from, to } = getPaginationBounds(page, pageSize);
      const membersResult = await query.range(from, to);

      if (membersResult.error) {
        return NextResponse.json(
          { error: membersResult.error.message },
          { status: 500 },
        );
      }

      const memberRows = (membersResult.data as UserProfileRow[] | null) ?? [];
      const memberIds = memberRows.map((row) => row.id);

      let depositRows: DepositAggregateRow[] = [];
      let withdrawalRows: WithdrawalAggregateRow[] = [];
      let futuresRows: FuturesPositionRow[] = [];
      let stakingRows: StakingPositionRow[] = [];

      if (memberIds.length > 0) {
        const [depositResult, withdrawalResult, futuresResult, stakingResult] =
          await Promise.all([
            auth.admin
              .from("deposits")
              .select("user_id, amount, status")
              .in("user_id", memberIds),
            auth.admin
              .from("withdrawals")
              .select("user_id, amount, status")
              .eq("withdrawal_type", "user")
              .in("user_id", memberIds),
            auth.admin
              .from("futures_positions")
              .select("user_id, margin, status")
              .in("user_id", memberIds),
            auth.admin
              .from("staking_positions")
              .select("user_id, amount, status")
              .in("user_id", memberIds),
          ]);

        if (depositResult.error) {
          return NextResponse.json(
            { error: depositResult.error.message },
            { status: 500 },
          );
        }

        if (withdrawalResult.error) {
          return NextResponse.json(
            { error: withdrawalResult.error.message },
            { status: 500 },
          );
        }

        depositRows =
          (depositResult.data as DepositAggregateRow[] | null) ?? [];
        withdrawalRows =
          (withdrawalResult.data as WithdrawalAggregateRow[] | null) ?? [];
        futuresRows = (futuresResult.data as FuturesPositionRow[] | null) ?? [];
        stakingRows = (stakingResult.data as StakingPositionRow[] | null) ?? [];
      }

      const depositMap: Record<string, number> = {};
      depositRows.forEach((row) => {
        if (!row.user_id || row.status !== "approved") {
          return;
        }
        depositMap[row.user_id] =
          (depositMap[row.user_id] || 0) + toSafeNumber(row.amount);
      });

      const withdrawalMap: Record<string, number> = {};
      withdrawalRows.forEach((row) => {
        if (!row.user_id || row.status !== "approved") {
          return;
        }
        withdrawalMap[row.user_id] =
          (withdrawalMap[row.user_id] || 0) + toSafeNumber(row.amount);
      });

      const futuresBalanceMap: Record<string, number> = {};
      futuresRows.forEach((row) => {
        if (!row.user_id || row.status !== "open") return;
        futuresBalanceMap[row.user_id] =
          (futuresBalanceMap[row.user_id] || 0) + toSafeNumber(row.margin);
      });

      const stakingBalanceMap: Record<string, number> = {};
      stakingRows.forEach((row) => {
        if (
          !row.user_id ||
          (row.status !== "active" && row.status !== "진행중")
        )
          return;
        stakingBalanceMap[row.user_id] =
          (stakingBalanceMap[row.user_id] || 0) + toSafeNumber(row.amount);
      });

      return NextResponse.json({
        success: true,
        summary: summaryPayload.summary,
        members: {
          rows: memberRows.map((row) => ({
            id: row.id,
            email: row.email || "-",
            name: row.name || "-",
            phone: row.phone || "-",
            status: row.status === "active" ? "정상" : "정지",
            balance: toSafeNumber(row.wallet_balance),
            futuresBalance: futuresBalanceMap[row.id] || 0,
            stakingBalance: stakingBalanceMap[row.id] || 0,
            totalDeposit: depositMap[row.id] || 0,
            totalWithdraw: withdrawalMap[row.id] || 0,
            joinDate: formatDate(row.created_at),
            joinCode: row.referral_code_used || "-",
          })),
          totalCount: membersResult.count ?? 0,
          page,
          pageSize,
        },
      } satisfies PartnerMembersResponse);
    }

    if (section === "commissions") {
      const sourceType = req.nextUrl.searchParams.get("sourceType") || "all";
      const startDate = req.nextUrl.searchParams.get("startDate") || "";
      const endDate = req.nextUrl.searchParams.get("endDate") || "";
      const search = sanitizeSearchTerm(req.nextUrl.searchParams.get("search"));
      const matchedSourceTypes = resolveCommissionSourceTypesFromSearch(search);

      let matchedUserIds: string[] = [];
      if (search) {
        const memberSearchResult = await auth.admin
          .from("user_profiles")
          .select("id")
          .eq("agent_id", auth.agent.id)
          .or(
            `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
          )
          .limit(100);

        if (memberSearchResult.error) {
          return NextResponse.json(
            { error: memberSearchResult.error.message },
            { status: 500 },
          );
        }

        matchedUserIds = (
          (memberSearchResult.data as { id: string }[] | null) ?? []
        )
          .map((row) => row.id)
          .filter(Boolean);
      }

      if (
        search &&
        matchedUserIds.length === 0 &&
        matchedSourceTypes.length === 0
      ) {
        return NextResponse.json({
          success: true,
          summary: summaryPayload.summary,
          commissions: {
            rows: [],
            totalCount: 0,
            page,
            pageSize,
          },
        } satisfies PartnerCommissionsResponse);
      }

      let query = auth.admin
        .from("agent_commissions")
        .select(
          "id, amount, source_type, created_at, user_id, user_profiles(name, email)",
          {
            count: "exact",
          },
        )
        .eq("agent_id", auth.agent.id)
        .order("created_at", { ascending: false });

      if (sourceType !== "all") {
        query = query.eq("source_type", sourceType);
      }
      if (startDate) {
        query = query.gte("created_at", `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte("created_at", `${endDate}T23:59:59`);
      }
      if (search) {
        if (matchedUserIds.length > 0 && matchedSourceTypes.length > 0) {
          query = query.or(
            `user_id.in.(${matchedUserIds.join(",")}),source_type.in.(${matchedSourceTypes.join(",")})`,
          );
        } else if (matchedUserIds.length > 0) {
          query = query.in("user_id", matchedUserIds);
        } else if (matchedSourceTypes.length > 0) {
          query = query.in("source_type", matchedSourceTypes);
        }
      }

      const { from, to } = getPaginationBounds(page, pageSize);
      const commissionResult = await query.range(from, to);

      if (commissionResult.error) {
        return NextResponse.json(
          { error: commissionResult.error.message },
          { status: 500 },
        );
      }

      const rows = (
        (commissionResult.data as AgentCommissionRow[] | null) ?? []
      ).map((row) => {
        const typeLabel = getCommissionFilterLabel(row.source_type);
        const sourceLabel = getCommissionSourceLabel(row.source_type);
        const profiles = row.user_profiles;
        let memberEmail = "-";
        if (profiles) {
          if (Array.isArray(profiles)) {
            memberEmail =
              profiles
                .map((p) => p.email)
                .filter(Boolean)
                .join(", ") || "-";
          } else {
            memberEmail = profiles.email || "-";
          }
        }

        return {
          id: row.id,
          date: formatDateTime(row.created_at),
          memberEmail,
          typeLabel,
          description: sourceLabel,
          amount: toSafeNumber(row.amount),
        };
      });

      return NextResponse.json({
        success: true,
        summary: summaryPayload.summary,
        commissions: {
          rows,
          totalCount: commissionResult.count ?? 0,
          page,
          pageSize,
        },
      } satisfies PartnerCommissionsResponse);
    }

    if (section === "withdrawals") {
      const status = req.nextUrl.searchParams.get("status") || "all";
      const startDate = req.nextUrl.searchParams.get("startDate") || "";
      const endDate = req.nextUrl.searchParams.get("endDate") || "";
      const search = sanitizeSearchTerm(req.nextUrl.searchParams.get("search"));
      const numericSearch = Number(search);

      let query = auth.admin
        .from("withdrawals")
        .select(
          "id, amount, bank, account_number, account_holder, status, reject_reason, created_at",
          { count: "exact" },
        )
        .eq("agent_id", auth.agent.id)
        .eq("withdrawal_type", "agent")
        .order("created_at", { ascending: false });

      if (status !== "all") {
        query = query.eq("status", status);
      }
      if (startDate) {
        query = query.gte("created_at", `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte("created_at", `${endDate}T23:59:59`);
      }
      if (search) {
        let orQuery = `bank.ilike.%${search}%,account_number.ilike.%${search}%,account_holder.ilike.%${search}%`;
        if (Number.isFinite(numericSearch) && search !== "") {
          orQuery += `,amount.eq.${numericSearch}`;
        }
        query = query.or(orQuery);
      }

      const { from, to } = getPaginationBounds(page, pageSize);
      const withdrawalResult = await query.range(from, to);

      if (withdrawalResult.error) {
        return NextResponse.json(
          { error: withdrawalResult.error.message },
          { status: 500 },
        );
      }

      const rows = (
        (withdrawalResult.data as AgentWithdrawalRow[] | null) ?? []
      ).map((row) => ({
        id: row.id,
        date: formatDateTime(row.created_at),
        amount: toSafeNumber(row.amount),
        bank: row.bank || "-",
        accountNumber: row.account_number || "-",
        accountHolder: row.account_holder || "-",
        status: statusLabel(row.status),
        rejectReason: row.reject_reason,
      }));

      return NextResponse.json({
        success: true,
        summary: summaryPayload.summary,
        withdrawals: {
          rows,
          totalCount: withdrawalResult.count ?? 0,
          page,
          pageSize,
        },
      } satisfies PartnerWithdrawalsResponse);
    }

    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAgent(req);

    if (auth.error) {
      return auth.error;
    }

    if (!auth.admin || !auth.agent) {
      return NextResponse.json(
        { error: "Agent client unavailable" },
        { status: 500 },
      );
    }

    const body = (await req
      .json()
      .catch(() => null)) as RequestWithdrawalBody | null;
    const action = body?.action;

    if (action !== "request-withdrawal") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const amount = toSafeNumber(body?.amount);
    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json(
        { error: "최소 출금 금액은 1 USDT입니다." },
        { status: 400 },
      );
    }

    if (!auth.agent.bank_account || !auth.agent.bank_account_holder) {
      return NextResponse.json(
        { error: "출금 계좌 정보가 없습니다." },
        { status: 400 },
      );
    }

    const summaryPayload = await buildPartnerSummary(auth.admin, auth.agent);
    if (amount > summaryPayload.summary.availableCommissionBalance) {
      return NextResponse.json(
        { error: "출금 가능 잔액을 초과했습니다." },
        { status: 400 },
      );
    }

    const { error } = await auth.admin.from("withdrawals").insert({
      user_id: null,
      agent_id: auth.userId,
      withdrawal_type: "agent",
      amount,
      bank: auth.agent.bank_name || "",
      account_number: auth.agent.bank_account,
      account_holder: auth.agent.bank_account_holder,
      status: "pending",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nextSummaryPayload = await buildPartnerSummary(
      auth.admin,
      auth.agent,
    );

    return NextResponse.json({
      success: true,
      summary: nextSummaryPayload.summary,
      message: "출금 신청이 접수되었습니다.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
