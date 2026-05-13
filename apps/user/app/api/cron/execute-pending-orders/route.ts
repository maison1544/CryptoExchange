import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { normalizeCommissionRate } from "@/lib/utils/commission";
import { recalculateCrossLiquidationPrices } from "@/lib/server/recalcCrossLiq";
import {
  getBinanceStyleWalletBalance,
  getEstimatedCrossLiquidationPrice,
  getEstimatedIsolatedLiquidationPrice,
  computeCrossMarginAccountMetrics,
  type FuturesMarginMode,
  type OpenPositionForRisk,
} from "@/lib/utils/futuresRisk";

// Always run on the Node runtime (not edge) — uses the service-role
// Supabase client and outbound fetch to Binance.
export const runtime = "nodejs";
// Disable any caching so each cron tick fetches fresh data.
export const dynamic = "force-dynamic";

const BINANCE_FUTURES_REST_URL = "https://fapi.binance.com";

type PendingOrder = {
  id: number;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  margin_mode: FuturesMarginMode;
  leverage: number;
  size: number;
  price: number;
  margin: number;
  fee: number;
  reserved_amount: number;
};

type FilledResult = {
  position_id: number;
  user_id: string;
  symbol: string;
  margin_mode: FuturesMarginMode;
  margin: number;
  fee: number;
};

/**
 * Validate the incoming request was triggered by Vercel Cron (or another
 * authorised caller). Vercel automatically injects an
 *   Authorization: Bearer <CRON_SECRET>
 * header on cron invocations when the CRON_SECRET env var is set on the
 * project. Manual invocations from a browser will not have this header.
 */
function isAuthorisedCronCall(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured → refuse to run (fail-closed). This forces
    // the operator to set CRON_SECRET before the route can fire.
    return false;
  }
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function fetchMarkPrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${BINANCE_FUTURES_REST_URL}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(
        symbol,
      )}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { markPrice?: string };
    const value = Number(payload.markPrice);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorisedCronCall(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server config error" },
      { status: 500 },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ── Stage 1: list all pending limit orders ──
  const { data: pendingRows, error: pendingError } = await admin
    .from("futures_orders")
    .select(
      "id, user_id, symbol, direction, margin_mode, leverage, size, price, margin, fee, reserved_amount",
    )
    .eq("status", "pending")
    .order("placed_at", { ascending: true });

  if (pendingError) {
    return NextResponse.json(
      { error: `pending_query_failed: ${pendingError.message}` },
      { status: 500 },
    );
  }

  const pendingOrders = (pendingRows ?? []) as PendingOrder[];

  if (pendingOrders.length === 0) {
    return NextResponse.json({ checked: 0, filled: 0, results: [] });
  }

  // ── Stage 2: fetch a fresh mark price for every distinct symbol ──
  const distinctSymbols = Array.from(
    new Set(pendingOrders.map((o) => o.symbol)),
  );
  const markPriceEntries = await Promise.all(
    distinctSymbols.map(async (sym) => [sym, await fetchMarkPrice(sym)] as const),
  );
  const markPriceBySymbol = new Map<string, number>();
  for (const [sym, price] of markPriceEntries) {
    if (price !== null) {
      markPriceBySymbol.set(sym, price);
    }
  }

  if (markPriceBySymbol.size === 0) {
    return NextResponse.json({
      checked: pendingOrders.length,
      filled: 0,
      warning: "no_fresh_mark_prices",
    });
  }

  // ── Stage 3: per-order fill decision + atomic RPC call ──
  const filled: FilledResult[] = [];
  const errors: Array<{ order_id: number; error: string }> = [];

  for (const order of pendingOrders) {
    const markPrice = markPriceBySymbol.get(order.symbol);
    if (!markPrice) continue;

    const shouldFill =
      order.direction === "long"
        ? markPrice <= Number(order.price)
        : markPrice >= Number(order.price);
    if (!shouldFill) continue;

    // Refresh the user's balance + cross positions so the liquidation
    // price (and cross-account safety check) reflects the current state.
    const [profileResult, positionsResult] = await Promise.all([
      admin
        .from("user_profiles")
        .select("futures_balance, agent_id")
        .eq("id", order.user_id)
        .maybeSingle(),
      admin
        .from("futures_positions")
        .select("direction, size, entry_price, margin, fee, margin_mode, symbol")
        .eq("user_id", order.user_id)
        .eq("status", "open"),
    ]);

    if (profileResult.error || !profileResult.data) {
      errors.push({
        order_id: order.id,
        error: profileResult.error?.message ?? "profile_missing",
      });
      continue;
    }

    const profile = profileResult.data;
    // Reserved amount was already deducted at placement time; add it back
    // when computing what the post-fill futures balance pool will be.
    const effectiveFuturesBalance =
      Number(profile.futures_balance || 0) +
      Number(order.reserved_amount || 0);
    const existingPositions = positionsResult.data ?? [];
    const crossPositions = existingPositions.filter(
      (p) => p.margin_mode !== "isolated",
    );

    // Refuse to fill if the existing cross account is already liquidatable
    // at the latest mark prices — otherwise the new position would inherit
    // an immediately-underwater balance.
    if (crossPositions.length > 0) {
      const riskPositions: OpenPositionForRisk[] = crossPositions.map((p) => ({
        direction: p.direction as "long" | "short",
        size: Number(p.size),
        entryPrice: Number(p.entry_price),
        margin: Number(p.margin),
        markPrice:
          markPriceBySymbol.get(p.symbol) ?? Number(p.entry_price),
        marginMode: p.margin_mode === "isolated" ? "isolated" : "cross",
      }));
      const metrics = computeCrossMarginAccountMetrics(
        effectiveFuturesBalance,
        riskPositions,
      );
      if (metrics.isLiquidatable) {
        errors.push({ order_id: order.id, error: "account_liquidatable" });
        continue;
      }
    }

    // Precompute the liquidation price with the same helpers used by the
    // synchronous /api/futures/open route so the math stays consistent.
    const marginMode: FuturesMarginMode =
      order.margin_mode === "isolated" ? "isolated" : "cross";

    let liquidationPrice = 0;
    if (marginMode === "isolated") {
      liquidationPrice = getEstimatedIsolatedLiquidationPrice({
        direction: order.direction,
        entryPrice: Number(order.price),
        size: Number(order.size),
        margin: Number(order.margin),
      });
    } else {
      const existingMargins = crossPositions.reduce(
        (sum, p) => sum + Number(p.margin || 0),
        0,
      );
      const existingFees = crossPositions.reduce(
        (sum, p) => sum + Number(p.fee || 0),
        0,
      );
      const accountEquity =
        getBinanceStyleWalletBalance(
          effectiveFuturesBalance,
          existingMargins,
          existingFees,
        ) - Number(order.fee);
      liquidationPrice = getEstimatedCrossLiquidationPrice({
        accountEquity,
        direction: order.direction,
        entryPrice: Number(order.price),
        size: Number(order.size),
      });
    }
    liquidationPrice = Number(liquidationPrice.toFixed(8));

    // ── RPC: atomic position-insert + order-flip ──
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      "fill_limit_order",
      {
        p_order_id: order.id,
        p_mark_price: markPrice,
        p_liquidation_price: liquidationPrice,
      },
    );

    if (rpcError || !rpcResult?.success) {
      errors.push({
        order_id: order.id,
        error: rpcError?.message ?? rpcResult?.error ?? "rpc_failed",
      });
      continue;
    }

    filled.push({
      position_id: Number(rpcResult.position_id),
      user_id: String(rpcResult.user_id),
      symbol: String(rpcResult.symbol),
      margin_mode: marginMode,
      margin: Number(rpcResult.margin),
      fee: Number(rpcResult.fee),
    });

    // ── Best-effort agent commission recording (matches /api/futures/open) ──
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
              Number(order.fee) *
              normalizeCommissionRate(agent.fee_commission_rate, 0)
            ).toFixed(4),
          );
          const rollingCommissionAmount = Number(
            (
              Number(order.margin) *
              normalizeCommissionRate(agent.commission_rate, 0)
            ).toFixed(4),
          );
          const commissionRows: Array<{
            agent_id: string;
            user_id: string;
            source_type: string;
            source_id: number;
            amount: number;
          }> = [];
          if (feeCommissionAmount > 0) {
            commissionRows.push({
              agent_id: agent.id,
              user_id: order.user_id,
              source_type: "trade_fee",
              source_id: Number(rpcResult.position_id),
              amount: feeCommissionAmount,
            });
          }
          if (rollingCommissionAmount > 0) {
            commissionRows.push({
              agent_id: agent.id,
              user_id: order.user_id,
              source_type: "rolling",
              source_id: Number(rpcResult.position_id),
              amount: rollingCommissionAmount,
            });
          }
          if (commissionRows.length > 0) {
            await admin.from("agent_commissions").insert(commissionRows);
          }
        }
      } catch {
        // commissions are best-effort; never block a successful fill
      }
    }
  }

  // ── Stage 4: per-user cross-liquidation-price recalculation ──
  const usersToRecalc = new Set<string>();
  for (const f of filled) {
    if (f.margin_mode === "cross") usersToRecalc.add(f.user_id);
  }
  await Promise.all(
    Array.from(usersToRecalc).map(async (userId) => {
      try {
        const { data: prof } = await admin
          .from("user_profiles")
          .select("futures_balance")
          .eq("id", userId)
          .maybeSingle();
        if (!prof) return;
        await recalculateCrossLiquidationPrices(
          admin,
          userId,
          Number(prof.futures_balance ?? 0),
        );
      } catch (err) {
        errors.push({
          order_id: 0,
          error: `recalc_failed_${userId}: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        });
      }
    }),
  );

  return NextResponse.json({
    checked: pendingOrders.length,
    filled: filled.length,
    results: filled,
    errors,
  });
}
