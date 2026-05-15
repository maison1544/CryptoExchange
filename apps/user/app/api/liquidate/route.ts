import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalizeCommissionRate } from "@/lib/utils/commission";
import { rateLimit } from "@/lib/rateLimit";
import { recalculateCrossLiquidationPrices } from "@/lib/server/recalcCrossLiq";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`liquidate:${ip}`, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

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

  // Parse body before auth
  const body = await req.json().catch(() => null);
  const positionId = Number(body?.positionId);

  if (!Number.isFinite(positionId) || positionId <= 0) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── Stage 1: auth ──
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Stage 2: position + profile in parallel (1 RTT) ──
    const posSelect =
      "id, user_id, symbol, direction, margin_mode, margin, liquidation_price, status";
    const [posResult, profileResult] = await Promise.all([
      admin
        .from("futures_positions")
        .select(posSelect)
        .eq("id", positionId)
        .eq("user_id", user.id)
        .eq("status", "open")
        .maybeSingle(),
      admin
        .from("user_profiles")
        .select("agent_id")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const pos = posResult.data;
    if (posResult.error || !pos) {
      return NextResponse.json(
        { error: "Position not found or already closed" },
        { status: 404 },
      );
    }

    // ── Stage 2.5: defensive mark-price check ──
    // Verify the current mark price has actually reached the position's
    // liquidation price. Without this check any user could call this
    // endpoint to forcibly realize a loss (and pay a loss commission to
    // their agent) regardless of the real market price — useful for
    // collusive money-laundering between an agent and a user.
    const liquidationPrice = Number(pos.liquidation_price);
    if (!Number.isFinite(liquidationPrice) || liquidationPrice <= 0) {
      return NextResponse.json(
        { error: "Position has no valid liquidation price" },
        { status: 400 },
      );
    }

    const { data: markRow } = await admin
      .from("mark_prices")
      .select("mark_price, updated_at")
      .eq("symbol", pos.symbol)
      .maybeSingle();

    const markPrice = Number(markRow?.mark_price ?? 0);
    if (!Number.isFinite(markPrice) || markPrice <= 0) {
      return NextResponse.json(
        { error: "Mark price unavailable for this symbol" },
        { status: 503 },
      );
    }

    const reached =
      pos.direction === "long"
        ? markPrice <= liquidationPrice
        : pos.direction === "short"
          ? markPrice >= liquidationPrice
          : false;

    if (!reached) {
      return NextResponse.json(
        {
          error: "Liquidation price has not been reached",
          markPrice,
          liquidationPrice,
          direction: pos.direction,
        },
        { status: 400 },
      );
    }

    // ── Stage 3: update position (with optimistic lock) ──
    const pnl = -Number(pos.margin);

    const { data: liquidatedRow, error: updateError } = await admin
      .from("futures_positions")
      .update({
        status: "liquidated",
        exit_price: pos.liquidation_price,
        pnl,
        closed_at: new Date().toISOString(),
      })
      .eq("id", positionId)
      .eq("user_id", user.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!liquidatedRow) {
      return NextResponse.json(
        { error: "Position already closed or liquidated" },
        { status: 409 },
      );
    }

    // ── Stage 4: commission (non-blocking) ──
    let commissionWarning: string | undefined;
    const profile = profileResult.data;

    if (profile?.agent_id) {
      try {
        const { data: agent } = await admin
          .from("agents")
          .select("id, loss_commission_rate")
          .eq("id", profile.agent_id)
          .maybeSingle();

        if (agent) {
          const lossCommissionAmount = Number(
            (
              Math.max(0, -pnl) *
              normalizeCommissionRate(agent.loss_commission_rate, 0)
            ).toFixed(4),
          );

          if (lossCommissionAmount > 0) {
            const { error: commissionError } = await admin
              .from("agent_commissions")
              .insert({
                agent_id: agent.id,
                user_id: user.id,
                source_type: "loss",
                source_id: positionId,
                amount: lossCommissionAmount,
              });
            if (commissionError) {
              commissionWarning = commissionError.message;
            }
          }
        }
      } catch {
        commissionWarning = "Commission recording failed";
      }
    }

    // ── Stage 5: Recalculate cross liquidation prices for remaining positions ──
    if (pos.margin_mode !== "isolated") {
      const { data: updatedProfile } = await admin
        .from("user_profiles")
        .select("futures_balance")
        .eq("id", user.id)
        .maybeSingle();
      if (updatedProfile) {
        await recalculateCrossLiquidationPrices(
          admin,
          user.id,
          Number(updatedProfile.futures_balance ?? 0),
        ).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      positionId,
      marginMode: pos.margin_mode === "isolated" ? "isolated" : "cross",
      exitPrice: pos.liquidation_price,
      pnl,
      commissionWarning,
      message: `Position #${positionId} liquidated. Margin ${Number(pos.margin).toFixed(2)} USDT lost.`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
