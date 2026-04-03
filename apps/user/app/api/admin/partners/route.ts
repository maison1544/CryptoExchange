import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { formatDate, formatDateTime } from "@/lib/utils/formatDate";

type AgentRow = {
  id: string;
  username: string;
  name: string;
  referral_code: string | null;
  commission_rate: number | string | null;
  loss_commission_rate: number | string | null;
  fee_commission_rate: number | string | null;
  grade: string | null;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_holder: string | null;
  commission_balance: number | string | null;
  is_active: boolean | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
};

type AgentCommissionRow = {
  agent_id: string | null;
  amount: number | string | null;
};

type AgentWithdrawalRow = {
  agent_id: string | null;
  amount: number | string | null;
  status: string | null;
};

type UserProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  wallet_balance: number | string | null;
  created_at: string;
  agent_id: string | null;
  referral_code_used: string | null;
};

type PostBody =
  | {
      action?: "update";
      partnerId?: string;
      name?: string;
      phone?: string;
      email?: string;
      grade?: string;
      lossCommissionRate?: number;
      commissionRate?: number;
      feeCommissionRate?: number;
      bankName?: string;
      bankAccount?: string;
      bankAccountHolder?: string;
      referralCode?: string;
      isActive?: boolean;
    }
  | {
      action?: "adjust-balance";
      partnerId?: string;
      signedAmount?: number;
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

async function requireAdmin(req: NextRequest) {
  const jwt = getBearer(req);

  if (!jwt) {
    return {
      error: NextResponse.json(
        { error: "Missing auth token" },
        { status: 401 },
      ),
      admin: null,
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
    } as const;
  }

  const { data: adminUser } = await admin
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminUser) {
    return {
      error: NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 },
      ),
      admin: null,
    } as const;
  }

  return {
    error: null,
    admin,
  } as const;
}

function buildPartnerPayload(
  agents: AgentRow[],
  commissions: AgentCommissionRow[],
  withdrawals: AgentWithdrawalRow[],
  members: UserProfileRow[],
) {
  const commissionTotals: Record<string, number> = {};
  commissions.forEach((commission) => {
    if (!commission.agent_id) {
      return;
    }

    commissionTotals[commission.agent_id] =
      (commissionTotals[commission.agent_id] || 0) +
      Number(commission.amount || 0);
  });

  const withdrawnTotals: Record<string, number> = {};
  withdrawals.forEach((withdrawal) => {
    if (!withdrawal.agent_id || withdrawal.status !== "approved") {
      return;
    }

    withdrawnTotals[withdrawal.agent_id] =
      (withdrawnTotals[withdrawal.agent_id] || 0) +
      Number(withdrawal.amount || 0);
  });

  const membersByAgentId: Record<string, UserProfileRow[]> = {};
  members.forEach((member) => {
    if (!member.agent_id) {
      return;
    }

    if (!membersByAgentId[member.agent_id]) {
      membersByAgentId[member.agent_id] = [];
    }

    membersByAgentId[member.agent_id].push(member);
  });

  const partners = agents.map((agent) => {
    const memberRows = membersByAgentId[agent.id] || [];

    return {
      id: agent.username,
      visibleId: agent.id,
      name: agent.name,
      grade: agent.grade || "총판",
      phone: agent.phone || "-",
      email: agent.email || `${agent.username}@backoffice.local`,
      account: agent.bank_account || "-",
      balance: Math.max(
        0,
        (commissionTotals[agent.id] || 0) -
          (withdrawnTotals[agent.id] || 0) +
          Number(agent.commission_balance || 0),
      ),
      balanceAdjustment: Number(agent.commission_balance || 0),
      memberCount: memberRows.length,
      joinCode: agent.referral_code || "-",
      lossCommission: Number(agent.loss_commission_rate) || 15,
      rollingCommission: Number(agent.commission_rate || 0) * 100,
      feeCommission: Number(agent.fee_commission_rate) || 30,
      totalCommissionEarned: commissionTotals[agent.id] || 0,
      date: formatDate(agent.created_at),
      status: agent.is_active ? "활성" : "비활성",
      bankName: agent.bank_name || "",
      bankAccount: agent.bank_account || "",
      bankAccountHolder: agent.bank_account_holder || "",
      lastLoginIp: agent.last_login_ip || "-",
      lastLoginDate: formatDateTime(agent.last_login_at),
    };
  });

  const partnerMembers = Object.fromEntries(
    agents.map((agent) => [
      agent.username,
      (membersByAgentId[agent.id] || []).map((member) => ({
        id: member.id,
        email: member.email || "-",
        name: member.name || "-",
        phone: member.phone || "-",
        status: member.status === "active" ? "정상" : "정지",
        balance: Number(member.wallet_balance || 0),
        totalDeposit: 0,
        totalWithdraw: 0,
        joinDate: formatDate(member.created_at),
        joinCode: member.referral_code_used || "-",
      })),
    ]),
  );

  return { partners, partnerMembers };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.admin) {
    return NextResponse.json(
      { error: "Admin client unavailable" },
      { status: 500 },
    );
  }

  const { data: agentData, error: agentError } = await auth.admin
    .from("agents")
    .select(
      "id, username, name, referral_code, commission_rate, loss_commission_rate, fee_commission_rate, grade, phone, email, bank_name, bank_account, bank_account_holder, commission_balance, is_active, last_login_at, last_login_ip, created_at",
    )
    .order("created_at", { ascending: false });

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  const agents = (agentData || []) as AgentRow[];
  const agentIds = agents.map((agent) => agent.id).filter(Boolean);

  let commissions: AgentCommissionRow[] = [];
  let withdrawals: AgentWithdrawalRow[] = [];
  let members: UserProfileRow[] = [];

  if (agentIds.length > 0) {
    const [commissionResult, withdrawalResult, memberResult] =
      await Promise.all([
        auth.admin
          .from("agent_commissions")
          .select("agent_id, amount")
          .in("agent_id", agentIds),
        auth.admin
          .from("withdrawals")
          .select("agent_id, amount, status")
          .eq("withdrawal_type", "agent")
          .in("agent_id", agentIds),
        auth.admin
          .from("user_profiles")
          .select(
            "id, email, name, phone, status, wallet_balance, created_at, agent_id, referral_code_used",
          )
          .in("agent_id", agentIds),
      ]);

    if (!commissionResult.error) {
      commissions = (commissionResult.data || []) as AgentCommissionRow[];
    }

    if (!withdrawalResult.error) {
      withdrawals = (withdrawalResult.data || []) as AgentWithdrawalRow[];
    }

    if (!memberResult.error) {
      members = (memberResult.data || []) as UserProfileRow[];
    }
  }

  return NextResponse.json(
    buildPartnerPayload(agents, commissions, withdrawals, members),
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.admin) {
    return NextResponse.json(
      { error: "Admin client unavailable" },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const action = body?.action;
  const partnerId = typeof body?.partnerId === "string" ? body.partnerId : "";

  if (!partnerId) {
    return NextResponse.json({ error: "Partner id required" }, { status: 400 });
  }

  if (action === "update") {
    const updateBody = body as Extract<PostBody, { action?: "update" }>;
    const { error } = await auth.admin
      .from("agents")
      .update({
        name: updateBody.name?.trim() || "",
        phone: updateBody.phone?.trim() || null,
        email: updateBody.email?.trim() || null,
        grade: updateBody.grade?.trim() || "총판",
        loss_commission_rate: Number(updateBody.lossCommissionRate || 0),
        commission_rate: Number(updateBody.commissionRate || 0),
        fee_commission_rate: Number(updateBody.feeCommissionRate || 0),
        bank_name: updateBody.bankName?.trim() || null,
        bank_account: updateBody.bankAccount?.trim() || null,
        bank_account_holder: updateBody.bankAccountHolder?.trim() || null,
        referral_code: updateBody.referralCode?.trim().toUpperCase() || null,
        is_active: Boolean(updateBody.isActive),
      })
      .eq("id", partnerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === "adjust-balance") {
    const adjustBody = body as Extract<PostBody, { action?: "adjust-balance" }>;
    const signedAmount = Number(adjustBody.signedAmount || 0);

    if (!Number.isFinite(signedAmount) || signedAmount === 0) {
      return NextResponse.json(
        { error: "Valid signedAmount required" },
        { status: 400 },
      );
    }

    const { data: target, error: targetError } = await auth.admin
      .from("agents")
      .select("commission_balance")
      .eq("id", partnerId)
      .maybeSingle<{ commission_balance: number | string | null }>();

    if (targetError || !target) {
      return NextResponse.json(
        { error: targetError?.message || "Partner not found" },
        { status: 500 },
      );
    }

    const nextBalanceAdjustment =
      Number(target.commission_balance || 0) + signedAmount;

    if (nextBalanceAdjustment < 0) {
      return NextResponse.json(
        { error: "Balance adjustment cannot be negative" },
        { status: 400 },
      );
    }

    const { error } = await auth.admin
      .from("agents")
      .update({ commission_balance: nextBalanceAdjustment })
      .eq("id", partnerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      balanceAdjustment: nextBalanceAdjustment,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
