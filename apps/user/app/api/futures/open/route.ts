import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getSiteSettings,
  resolveFuturesFeeRate,
} from "@/lib/server/siteSettings";
import { normalizeCommissionRate } from "@/lib/utils/commission";
import {
  getBinanceStyleWalletBalance,
  getEstimatedCrossLiquidationPrice,
  getEstimatedIsolatedLiquidationPrice,
  computeCrossMarginAccountMetrics,
  type FuturesMarginMode,
  type OpenPositionForRisk,
} from "@/lib/utils/futuresRisk";
import { rateLimit } from "@/lib/rateLimit";
import { recalculateCrossLiquidationPrices } from "@/lib/server/recalcCrossLiq";

function isInsufficientBalanceError(message: string | null | undefined) {
  if (!message) return false;

  const normalized = message.toLowerCase();
  return (
    normalized.includes("balance cannot go below zero") ||
    normalized.includes("insufficient available balance")
  );
}

function getOrderOpenBalanceErrorMessage(message: string | null | undefined) {
  if (isInsufficientBalanceError(message)) {
    return "보유 잔액이 부족합니다. 잔액을 새로고침 후 다시 시도해주세요.";
  }

  return message || "잔액 차감 처리에 실패했습니다.";
}

function parseOrderType(value: unknown): "market" | "limit" {
  if (typeof value !== "string") {
    return "market";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "limit" || value === "지정가") {
    return "limit";
  }

  return "market";
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`futures-open:${ip}`, 30, 60_000);
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

  // Parse body immediately (no DB needed)
  const body = await req.json().catch(() => null);
  const symbol =
    typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const direction =
    body?.direction === "short"
      ? "short"
      : body?.direction === "long"
        ? "long"
        : "";
  const leverage = Number(body?.leverage);
  const size = Number(body?.size);
  const entryPrice = Number(body?.entryPrice);
  const marginMode: FuturesMarginMode =
    body?.marginMode === "isolated" ? "isolated" : "cross";
  const orderType = parseOrderType(body?.orderType);

  if (
    !symbol ||
    !direction ||
    !Number.isFinite(leverage) ||
    !Number.isFinite(size) ||
    !Number.isFinite(entryPrice)
  ) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (leverage <= 0 || size <= 0 || entryPrice <= 0) {
    return NextResponse.json(
      { error: "Invalid order values" },
      { status: 400 },
    );
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── Stage 1: auth (required to get user.id) ──
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Stage 2: settings + profile + existing open positions in parallel (1 RTT) ──
    const [settings, profileResult, existingPositionsResult] =
      await Promise.all([
        getSiteSettings(admin, ["taker_fee", "futures_fee"]),
        admin
          .from("user_profiles")
          .select(
            "id, wallet_balance, available_balance, futures_balance, agent_id",
          )
          .eq("id", user.id)
          .maybeSingle(),
        admin
          .from("futures_positions")
          .select("margin, fee, direction, size, entry_price, margin_mode")
          .eq("user_id", user.id)
          .eq("status", "open"),
      ]);

    const profile = profileResult.data;
    if (profileResult.error || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const feeRate = resolveFuturesFeeRate(settings);
    const margin = Number(((entryPrice * size) / leverage).toFixed(4));
    const fee = Number((entryPrice * size * feeRate).toFixed(4));
    const totalDeduction = Number((margin + fee).toFixed(4));

    const futuresBalance = Number(profile.futures_balance ?? 0);
    const existingPositions = existingPositionsResult.data ?? [];
    const crossPositions = existingPositions.filter(
      (position: { margin_mode?: FuturesMarginMode | null }) =>
        position.margin_mode !== "isolated",
    );

    if (futuresBalance < totalDeduction) {
      return NextResponse.json(
        {
          error:
            "선물 잔고가 부족합니다. 자산 페이지에서 일반잔고 → 선물잔고로 전환 후 다시 시도해주세요.",
        },
        { status: 400 },
      );
    }

    // Account-level equity check: reject orders if account is in liquidation state
    if (crossPositions.length > 0) {
      const riskPositions: OpenPositionForRisk[] = crossPositions.map(
        (p: {
          direction: string;
          size: number | string;
          entry_price: number | string;
          margin: number | string;
          margin_mode?: FuturesMarginMode | null;
        }) => ({
          direction: p.direction as "long" | "short",
          size: Number(p.size),
          entryPrice: Number(p.entry_price),
          margin: Number(p.margin),
          markPrice: Number(p.entry_price),
          marginMode: p.margin_mode === "isolated" ? "isolated" : "cross",
        }),
      );
      const metrics = computeCrossMarginAccountMetrics(
        futuresBalance,
        riskPositions,
      );
      if (metrics.isLiquidatable) {
        return NextResponse.json(
          {
            error:
              "계정 증거금 비율이 100%를 초과하여 신규 주문이 불가합니다. 포지션을 정리해주세요.",
          },
          { status: 400 },
        );
      }
    }

    // Compute Binance-style Wallet Balance for liquidation price
    // In the separated model: futures_balance already has margins deducted
    const existingMargins = crossPositions.reduce(
      (sum: number, p: { margin: number | string; fee?: number | string }) =>
        sum + Number(p.margin || 0),
      0,
    );
    const existingFees = crossPositions.reduce(
      (sum: number, p: { margin: number | string; fee?: number | string }) =>
        sum + Number(p.fee || 0),
      0,
    );
    const liquidationPrice = Number(
      (marginMode === "isolated"
        ? getEstimatedIsolatedLiquidationPrice({
            direction,
            entryPrice,
            size,
            margin,
          })
        : getEstimatedCrossLiquidationPrice({
            accountEquity:
              getBinanceStyleWalletBalance(
                futuresBalance,
                existingMargins,
                existingFees,
              ) - fee,
            direction,
            entryPrice,
            size,
          })
      ).toFixed(8),
    );

    if (orderType === "limit") {
      const { data: insertedOrder, error: insertOrderError } = await admin
        .from("futures_orders")
        .insert({
          user_id: user.id,
          symbol,
          direction,
          margin_mode: marginMode,
          order_type: "limit",
          leverage,
          size,
          price: entryPrice,
          margin,
          fee,
          reserved_amount: totalDeduction,
          status: "pending",
          placed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertOrderError || !insertedOrder) {
        return NextResponse.json(
          {
            error: insertOrderError?.message ?? "Failed to create limit order",
          },
          { status: 500 },
        );
      }

      const { data: balanceResult, error: balanceError } = await admin.rpc(
        "adjust_futures_balance",
        {
          p_user_id: user.id,
          p_amount: -totalDeduction,
          p_reason: `futures_order_${insertedOrder.id}`,
        },
      );

      if (balanceError || !balanceResult?.success) {
        await admin.from("futures_orders").delete().eq("id", insertedOrder.id);

        const rawBalanceError =
          balanceError?.message ??
          balanceResult?.error ??
          "Failed to deduct balance";

        return NextResponse.json(
          {
            error: getOrderOpenBalanceErrorMessage(rawBalanceError),
          },
          { status: isInsufficientBalanceError(rawBalanceError) ? 400 : 500 },
        );
      }

      return NextResponse.json({
        success: true,
        order: insertedOrder,
        reservedAmount: totalDeduction,
        fee,
      });
    }

    const { data: inserted, error: insertError } = await admin
      .from("futures_positions")
      .insert({
        user_id: user.id,
        symbol,
        direction,
        margin_mode: marginMode,
        leverage,
        size,
        entry_price: entryPrice,
        liquidation_price: liquidationPrice,
        margin,
        fee,
        status: "open",
        opened_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to open position" },
        { status: 500 },
      );
    }

    const { data: balanceResult, error: balanceError } = await admin.rpc(
      "adjust_futures_balance",
      {
        p_user_id: user.id,
        p_amount: -totalDeduction,
        p_reason: `futures_margin_${inserted.id}`,
      },
    );

    if (balanceError || !balanceResult?.success) {
      await admin.from("futures_positions").delete().eq("id", inserted.id);

      const rawBalanceError =
        balanceError?.message ??
        balanceResult?.error ??
        "Failed to deduct balance";

      return NextResponse.json(
        {
          error: getOrderOpenBalanceErrorMessage(rawBalanceError),
        },
        { status: isInsufficientBalanceError(rawBalanceError) ? 400 : 500 },
      );
    }

    // ── Stage 3: Commission (non-blocking, after core order succeeds) ──
    let commissionWarning: string | undefined;

    if (profile.agent_id) {
      try {
        const { data: agent } = await admin
          .from("agents")
          .select("id, commission_rate, fee_commission_rate")
          .eq("id", profile.agent_id)
          .maybeSingle();

        if (agent) {
          const feeCommissionAmount = Number(
            (
              fee * normalizeCommissionRate(agent.fee_commission_rate, 0)
            ).toFixed(4),
          );
          const rollingCommissionAmount = Number(
            (
              margin * normalizeCommissionRate(agent.commission_rate, 0)
            ).toFixed(4),
          );
          const commissionRows = [];

          if (feeCommissionAmount > 0) {
            commissionRows.push({
              agent_id: agent.id,
              user_id: user.id,
              source_type: "trade_fee",
              source_id: inserted.id,
              amount: feeCommissionAmount,
            });
          }

          if (rollingCommissionAmount > 0) {
            commissionRows.push({
              agent_id: agent.id,
              user_id: user.id,
              source_type: "rolling",
              source_id: inserted.id,
              amount: rollingCommissionAmount,
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

    // ── Stage 4: Recalculate cross liquidation prices for all positions ──
    if (marginMode === "cross") {
      try {
        // Re-read the actual balance after deduction to avoid stale data
        const { data: freshProfile } = await admin
          .from("user_profiles")
          .select("futures_balance")
          .eq("id", user.id)
          .maybeSingle();
        const freshBalance = Number(freshProfile?.futures_balance ?? 0);
        await recalculateCrossLiquidationPrices(admin, user.id, freshBalance);
      } catch (recalcErr) {
        console.error(
          "[futures/open] Failed to recalculate cross liq prices:",
          recalcErr,
        );
      }
    }

    return NextResponse.json({
      success: true,
      position: inserted,
      deductedMargin: totalDeduction,
      fee,
      commissionWarning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
