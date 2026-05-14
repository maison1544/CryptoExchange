import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type AdjustBalanceBody = {
  userId?: string;
  amount?: number;
  reason?: string;
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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

  const body = (await req.json().catch(() => null)) as AdjustBalanceBody | null;
  const userId = String(body?.userId || "").trim();
  const amount = Number(body?.amount ?? NaN);
  const reason = String(body?.reason || "").trim() || "admin_adjustment";

  if (!userId || !isUuid(userId)) {
    return NextResponse.json(
      { error: "Valid userId required" },
      { status: 400 },
    );
  }

  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json(
      { error: "Valid non-zero amount required" },
      { status: 400 },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid auth token" },
        { status: 401 },
      );
    }

    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!adminRow) {
      return NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 },
      );
    }

    const auditReason = `[${user.email || user.id}] ${reason}`.slice(0, 500);

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "adjust_user_balance",
      {
        p_user_id: userId,
        p_amount: amount,
        p_reason: auditReason,
      },
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    if (!rpcResult?.success) {
      return NextResponse.json(
        { error: rpcResult?.error || "Failed to adjust balance" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, result: rpcResult });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
