import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type ManageWalletBody = {
  kind?: "deposit" | "withdrawal";
  requestId?: number;
  action?: "approve" | "reject";
  reason?: string | null;
};

type DepositTarget = {
  id: number;
  user_id: string;
  amount: number | string | null;
  status: "pending" | "approved" | "rejected";
};

type WithdrawalTarget = {
  id: number;
  user_id: string | null;
  amount: number | string | null;
  fee: number | string | null;
  status: "pending" | "approved" | "rejected";
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function formatAmount(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("ko-KR");
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as ManageWalletBody | null;
  const kind = body?.kind;
  const requestId = Number(body?.requestId);
  const action = body?.action;
  const reason = body?.reason?.trim() || null;

  if (kind !== "deposit" && kind !== "withdrawal") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (!Number.isFinite(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "Reject reason required" }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const [adminResult, targetResult] = await Promise.all([
      supabaseAdmin.from("admins").select("id").eq("id", user.id).maybeSingle(),
      kind === "deposit"
        ? supabaseAdmin
            .from("deposits")
            .select("id, user_id, amount, status")
            .eq("id", requestId)
            .maybeSingle<DepositTarget>()
        : supabaseAdmin
            .from("withdrawals")
            .select("id, user_id, amount, fee, status")
            .eq("id", requestId)
            .maybeSingle<WithdrawalTarget>(),
    ]);

    if (!adminResult.data) {
      return NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 },
      );
    }

    if (targetResult.error || !targetResult.data) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const rpcName = kind === "deposit" ? "process_deposit" : "process_withdrawal";
    const rpcParams =
      kind === "deposit"
        ? {
            p_deposit_id: requestId,
            p_action: action,
            p_reason: reason,
          }
        : {
            p_withdrawal_id: requestId,
            p_action: action,
            p_reason: reason,
          };

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      rpcName,
      rpcParams,
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    if (!rpcResult?.success) {
      return NextResponse.json(
        { error: rpcResult?.error || "Failed to process request" },
        { status: 400 },
      );
    }

    const target = targetResult.data;
    const targetUserId = target.user_id;

    if (targetUserId) {
      const amountLabel =
        kind === "withdrawal"
          ? `${formatAmount((target as WithdrawalTarget).amount)} / 수수료 ${formatAmount((target as WithdrawalTarget).fee)}`
          : formatAmount((target as DepositTarget).amount);
      const title =
        kind === "deposit"
          ? action === "approve"
            ? "입금 승인 완료"
            : "입금 거절"
          : action === "approve"
            ? "출금 승인 완료"
            : "출금 거절";
      const bodyText =
        action === "approve"
          ? `${amountLabel} 요청이 승인되었습니다.`
          : `${amountLabel} 요청이 거절되었습니다.${reason ? ` 사유: ${reason}` : ""}`;

      await supabaseAdmin.from("notifications").insert({
        user_id: targetUserId,
        title,
        body: bodyText,
        type: kind === "deposit" ? "deposit" : "withdrawal",
      });
    }

    return NextResponse.json({
      success: true,
      kind,
      action,
      result: rpcResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
