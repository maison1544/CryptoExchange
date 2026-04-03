import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type ManageAction =
  | "set-product-rate"
  | "set-position-rate"
  | "settle-position"
  | "cancel-position"
  | "cancel-product";

type ManageBody = {
  action?: ManageAction;
  productId?: number;
  stakingId?: number;
  rate?: number | string | null;
  reason?: string | null;
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function parseOptionalRate(value: ManageBody["rate"]) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const rate = Number(value);
  return Number.isFinite(rate) ? rate : Number.NaN;
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

  const body = (await req.json().catch(() => null)) as ManageBody | null;
  const action = body?.action;
  const productId = Number(body?.productId);
  const stakingId = Number(body?.stakingId);
  const reason = body?.reason?.trim() || null;
  const rate = parseOptionalRate(body?.rate);

  if (
    action !== "set-product-rate" &&
    action !== "set-position-rate" &&
    action !== "settle-position" &&
    action !== "cancel-position" &&
    action !== "cancel-product"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (Number.isNaN(rate)) {
    return NextResponse.json({ error: "Invalid rate" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const { data: adminUser } = await admin
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminUser) {
    return NextResponse.json(
      { error: "Admin privileges required" },
      { status: 403 },
    );
  }

  if (action === "set-product-rate") {
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "productId required" },
        { status: 400 },
      );
    }

    const { data, error } = await admin.rpc(
      "set_staking_product_settlement_rate",
      {
        p_product_id: productId,
        p_rate: rate,
      },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Failed to update product rate" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, message: data.message });
  }

  if (action === "cancel-product") {
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "productId required" },
        { status: 400 },
      );
    }

    const { data, error } = await admin.rpc("cancel_staking_product", {
      p_product_id: productId,
      p_reason: reason || "admin_cancel_product",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Failed to cancel product" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product staking positions cancelled",
      cancelledCount: data.cancelled_count ?? 0,
    });
  }

  if (!Number.isFinite(stakingId) || stakingId <= 0) {
    return NextResponse.json({ error: "stakingId required" }, { status: 400 });
  }

  if (action === "set-position-rate") {
    const { data, error } = await admin.rpc(
      "set_staking_position_settlement_rate",
      {
        p_staking_id: stakingId,
        p_rate: rate,
      },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Failed to update position rate" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, message: data.message });
  }

  if (action === "cancel-position") {
    const { data, error } = await admin.rpc("cancel_staking", {
      p_staking_id: stakingId,
      p_reason: reason || "admin_cancel",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Failed to cancel staking" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, message: data.message });
  }

  if (rate !== null) {
    const { data: rateResult, error: rateError } = await admin.rpc(
      "set_staking_position_settlement_rate",
      {
        p_staking_id: stakingId,
        p_rate: rate,
      },
    );

    if (rateError) {
      return NextResponse.json({ error: rateError.message }, { status: 500 });
    }

    if (!rateResult?.success) {
      return NextResponse.json(
        { error: rateResult?.error || "Failed to set settlement rate" },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin.rpc("settle_staking", {
    p_staking_id: stakingId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.success) {
    return NextResponse.json(
      { error: data?.error || "Failed to settle staking" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message: data.message,
    totalReward: data.total_reward ?? null,
  });
}
