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
  placed_at: string | null;
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

type SymbolPriceWindow = {
  /** Last traded close price (used for logging / fallback). */
  lastPrice: number;
  /**
   * Highest and lowest traded price across all 1m klines whose close time is
   * >= cutoffMs. Used to detect wicks so limit orders are filled even when
   * the price only momentarily crossed the limit between cron ticks.
   */
  highSinceCutoff: number;
  lowSinceCutoff: number;
};

/**
 * Fetch the last few 1m klines for a symbol from Binance Futures and return
 * the aggregated high/low/last across the klines whose close time falls on
 * or after `cutoffMs`. Returns null if Binance is unreachable.
 *
 * Using klines instead of a single premiumIndex snapshot is what allows a
 * once-per-minute cron to still match limit orders that only touched their
 * trigger price during a brief intra-minute wick.
 */
async function fetchSymbolPriceWindow(
  symbol: string,
  cutoffMs: number,
): Promise<SymbolPriceWindow | null> {
  try {
    // Dynamic limit: we need enough klines to cover [cutoffMs, now] so that a
    // long-standing pending order (placed many minutes ago) still gets its
    // entire price history scanned for a wick that touched the limit. We
    // add a 2-minute safety margin, clamp to [3, 720] minutes (Binance
    // allows up to 1500 klines per request), and request 1m candles.
    const minutesNeeded =
      Math.ceil(Math.max(0, Date.now() - cutoffMs) / 60_000) + 2;
    const klineLimit = Math.min(Math.max(minutesNeeded, 3), 720);
    const response = await fetch(
      `${BINANCE_FUTURES_REST_URL}/fapi/v1/klines?symbol=${encodeURIComponent(
        symbol,
      )}&interval=1m&limit=${klineLimit}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      return null;
    }
    const rows = (await response.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    let highSinceCutoff = -Infinity;
    let lowSinceCutoff = Infinity;
    let lastPrice = 0;

    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 7) continue;
      // Binance kline shape:
      // [ openTime, open, high, low, close, volume, closeTime, ... ]
      const closeTime = Number(row[6]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      if (!Number.isFinite(closeTime)) continue;

      // Track the last traded close across the window for diagnostics.
      if (Number.isFinite(close) && close > 0) {
        lastPrice = close;
      }

      // Only consider klines that ended at-or-after the cutoff. The
      // in-progress kline (closeTime in the future) always qualifies.
      if (closeTime < cutoffMs) continue;

      if (Number.isFinite(high) && high > highSinceCutoff) {
        highSinceCutoff = high;
      }
      if (Number.isFinite(low) && low > 0 && low < lowSinceCutoff) {
        lowSinceCutoff = low;
      }
    }

    if (
      !Number.isFinite(highSinceCutoff) ||
      !Number.isFinite(lowSinceCutoff) ||
      lowSinceCutoff <= 0
    ) {
      return null;
    }

    return {
      lastPrice: lastPrice > 0 ? lastPrice : highSinceCutoff,
      highSinceCutoff,
      lowSinceCutoff,
    };
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
      "id, user_id, symbol, direction, margin_mode, leverage, size, price, margin, fee, reserved_amount, placed_at",
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

  // ── Stage 2: fetch a 1m kline window per distinct symbol ──
  //
  // For each symbol we look at the high/low across the most recent klines
  // whose close time falls inside the period [earliest_placed_at, now].
  // This catches intra-minute wicks that a single mark-price snapshot would
  // miss when the cron only fires once per minute.
  const nowMs = Date.now();
  const earliestPlacedAt = pendingOrders.reduce<number>((min, o) => {
    const ts = o.placed_at ? new Date(o.placed_at).getTime() : NaN;
    return Number.isFinite(ts) && ts > 0 && ts < min ? ts : min;
  }, nowMs);
  // Always look back at least 2 minutes so we never miss a wick even when
  // an order was just placed seconds before this cron tick.
  const cutoffMs = Math.min(earliestPlacedAt, nowMs - 2 * 60_000);

  const distinctSymbols = Array.from(
    new Set(pendingOrders.map((o) => o.symbol)),
  );
  const priceEntries = await Promise.all(
    distinctSymbols.map(
      async (sym) =>
        [sym, await fetchSymbolPriceWindow(sym, cutoffMs)] as const,
    ),
  );
  const priceWindowBySymbol = new Map<string, SymbolPriceWindow>();
  for (const [sym, window] of priceEntries) {
    if (window !== null) {
      priceWindowBySymbol.set(sym, window);
    }
  }

  if (priceWindowBySymbol.size === 0) {
    return NextResponse.json({
      checked: pendingOrders.length,
      filled: 0,
      warning: "no_fresh_price_window",
    });
  }

  // For the cross-margin risk pre-check below we still need a
  // per-symbol "current" price; use the kline last (close) value.
  const markPriceBySymbol = new Map<string, number>(
    Array.from(priceWindowBySymbol.entries()).map(([s, w]) => [s, w.lastPrice]),
  );

  // ── Stage 3: per-order fill decision + atomic RPC call ──
  const filled: FilledResult[] = [];
  const errors: Array<{ order_id: number; error: string }> = [];
  const decisions: Array<Record<string, unknown>> = [];

  for (const order of pendingOrders) {
    const window = priceWindowBySymbol.get(order.symbol);
    if (!window) {
      decisions.push({
        order_id: order.id,
        symbol: order.symbol,
        reason: "no_price_window",
      });
      continue;
    }

    // A long limit fills when the market trades AT OR BELOW the limit; the
    // matching engine on a real exchange would fill on the first downward
    // tick that touches the limit even if price immediately bounces back.
    // We replicate that by checking the kline LOW for longs and HIGH for
    // shorts. The fill price is always the limit price (favourable exec).
    const limitPrice = Number(order.price);
    const shouldFill =
      order.direction === "long"
        ? window.lowSinceCutoff <= limitPrice
        : window.highSinceCutoff >= limitPrice;

    decisions.push({
      order_id: order.id,
      symbol: order.symbol,
      direction: order.direction,
      limit: limitPrice,
      low: window.lowSinceCutoff,
      high: window.highSinceCutoff,
      last: window.lastPrice,
      should_fill: shouldFill,
    });

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
    //
    // We pass the limit price as `p_mark_price` so the RPC's defensive
    // re-check (long: mark<=limit, short: mark>=limit) is always satisfied
    // here. The actual trigger decision was made above against the kline
    // wick; from the RPC's perspective, this is equivalent to the price
    // having reached the limit exactly.
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      "fill_limit_order",
      {
        p_order_id: order.id,
        p_mark_price: limitPrice,
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

  // Persist a compact diagnostic snapshot to the database so operators can
  // inspect why a particular pending order is or isn't being filled. The
  // table is RLS-locked and only the service_role (used by this route)
  // can write or read it.
  try {
    await admin.from("cron_diagnostics").insert({
      job: "execute_pending_orders",
      payload: {
        checked: pendingOrders.length,
        filled: filled.length,
        decisions,
        errors,
      },
    });
  } catch {
    // never fail the cron because diagnostics failed
  }

  return NextResponse.json({
    checked: pendingOrders.length,
    filled: filled.length,
    results: filled,
    decisions,
    errors,
  });
}
