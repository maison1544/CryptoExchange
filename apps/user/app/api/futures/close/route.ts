import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getSiteSettings,
  resolveFuturesFeeRate,
} from "@/lib/server/siteSettings";
import { normalizeCommissionRate } from "@/lib/utils/commission";
import { rateLimit } from "@/lib/rateLimit";
import { recalculateCrossLiquidationPrices } from "@/lib/server/recalcCrossLiq";

async function getCurrentPrice(symbol: string) {
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch market price");
  }

  const payload = (await response.json()) as { price?: string };
  const price = Number(payload.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid market price");
  }

  return price;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`futures-close:${ip}`, 30, 60_000);
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

  // Parse body before any DB call
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

    // ── Stage 2: position + settings + profile in parallel (1 RTT) ──
    const positionSelect =
      "id, user_id, symbol, direction, margin_mode, leverage, size, entry_price, exit_price, liquidation_price, margin, pnl, fee, status, opened_at, closed_at";
    const [positionResult, settings, profileResult] = await Promise.all([
      admin
        .from("futures_positions")
        .select(positionSelect)
        .eq("id", positionId)
        .eq("user_id", user.id)
        .eq("status", "open")
        .maybeSingle(),
      getSiteSettings(admin, ["taker_fee", "futures_fee"]),
      admin
        .from("user_profiles")
        .select("agent_id")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const position = positionResult.data;
    if (positionResult.error || !position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 },
      );
    }

    // ── Stage 3: price fetch (external API, can't combine with DB) ──
    const feeRate = resolveFuturesFeeRate(settings);
    const exitPrice = await getCurrentPrice(position.symbol);
    const size = Number(position.size);
    const entryPrice = Number(position.entry_price);
    const margin = Number(position.margin);
    const closeFee = Number((exitPrice * size * feeRate).toFixed(4));
    const pnl = Number(
      (position.direction === "long"
        ? (exitPrice - entryPrice) * size
        : (entryPrice - exitPrice) * size
      ).toFixed(4),
    );
    // In cross-margin, loss is capped at margin (insurance fund absorbs excess)
    const cappedPnl = Math.max(pnl, -margin);
    const returnedAmount = Math.max(
      0,
      Number((margin + cappedPnl - closeFee).toFixed(4)),
    );

    // ── Stage 4: update position + balance adjustment ──
    // Use .select().maybeSingle() as optimistic lock: if another request
    // already closed this position, the update matches 0 rows and returns null.
    const { data: closedRow, error: updateError } = await admin
      .from("futures_positions")
      .update({
        exit_price: exitPrice,
        pnl,
        fee: Number(position.fee ?? 0) + closeFee,
        status: "closed",
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

    if (!closedRow) {
      return NextResponse.json(
        { error: "포지션이 이미 종료되었습니다." },
        { status: 409 },
      );
    }

    if (returnedAmount !== 0) {
      const { data: balanceResult, error: balanceError } = await admin.rpc(
        "adjust_futures_balance",
        {
          p_user_id: user.id,
          p_amount: returnedAmount,
          p_reason: `futures_close_${positionId}`,
        },
      );

      if (balanceError || !balanceResult?.success) {
        return NextResponse.json(
          {
            error:
              balanceError?.message ??
              balanceResult?.error ??
              "Failed to settle balance",
          },
          { status: 500 },
        );
      }
    }

    // ── Stage 5: commission (non-blocking) ──
    let commissionWarning: string | undefined;
    const profile = profileResult.data;

    if (profile?.agent_id) {
      try {
        const { data: agent } = await admin
          .from("agents")
          .select("id, loss_commission_rate, fee_commission_rate")
          .eq("id", profile.agent_id)
          .maybeSingle();

        if (agent) {
          const commissionRows = [];
          const feeCommissionAmount = Number(
            (
              closeFee * normalizeCommissionRate(agent.fee_commission_rate, 0)
            ).toFixed(4),
          );
          const lossCommissionBase = Math.max(0, -pnl);
          const lossCommissionAmount = Number(
            (
              lossCommissionBase *
              normalizeCommissionRate(agent.loss_commission_rate, 0)
            ).toFixed(4),
          );

          if (feeCommissionAmount > 0) {
            commissionRows.push({
              agent_id: agent.id,
              user_id: user.id,
              source_type: "trade_fee",
              source_id: positionId,
              amount: feeCommissionAmount,
            });
          }

          if (lossCommissionAmount > 0) {
            commissionRows.push({
              agent_id: agent.id,
              user_id: user.id,
              source_type: "loss",
              source_id: positionId,
              amount: lossCommissionAmount,
            });
          }

          if (commissionRows.length > 0) {
            const { error: commissionError } = await admin
              .from("agent_commissions")
              .insert(commissionRows);
            if (commissionError) {
              commissionWarning = commissionError.message;
            }
          }
        }
      } catch {
        commissionWarning = "Commission recording failed";
      }
    }

    // ── Stage 6: Recalculate cross liquidation prices for remaining positions ──
    if (position.margin_mode !== "isolated") {
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
      position: {
        ...position,
        margin_mode: position.margin_mode === "isolated" ? "isolated" : "cross",
        exit_price: exitPrice,
        pnl,
        fee: Number(position.fee ?? 0) + closeFee,
        status: "closed",
        closed_at: new Date().toISOString(),
      },
      exitPrice,
      pnl,
      fee: closeFee,
      returnedAmount,
      commissionWarning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
