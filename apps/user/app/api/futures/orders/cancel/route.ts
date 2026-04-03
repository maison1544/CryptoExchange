import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const orderId = Number(body?.orderId);

  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: order, error: orderError } = await admin
      .from("futures_orders")
      .select(
        "id, user_id, symbol, direction, margin_mode, leverage, size, price, margin, fee, reserved_amount, status, placed_at",
      )
      .eq("id", orderId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "미체결 주문을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const canceledAt = new Date().toISOString();
    const { data: canceledOrder, error: updateError } = await admin
      .from("futures_orders")
      .update({
        status: "canceled",
        canceled_at: canceledAt,
      })
      .eq("id", orderId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select(
        "id, user_id, symbol, direction, margin_mode, leverage, size, price, margin, fee, reserved_amount, status, placed_at, canceled_at",
      )
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!canceledOrder) {
      return NextResponse.json(
        { error: "주문이 이미 처리되었습니다." },
        { status: 409 },
      );
    }

    const refundAmount = Number(order.reserved_amount || 0);

    if (refundAmount > 0) {
      const { data: balanceResult, error: balanceError } = await admin.rpc(
        "adjust_futures_balance",
        {
          p_user_id: user.id,
          p_amount: refundAmount,
          p_reason: `futures_order_cancel_${orderId}`,
        },
      );

      if (balanceError || !balanceResult?.success) {
        await admin
          .from("futures_orders")
          .update({
            status: "pending",
            canceled_at: null,
          })
          .eq("id", orderId)
          .eq("user_id", user.id)
          .eq("status", "canceled");

        return NextResponse.json(
          {
            error:
              balanceError?.message ??
              balanceResult?.error ??
              "Failed to refund reserved balance",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      order: canceledOrder,
      refundedAmount: refundAmount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
