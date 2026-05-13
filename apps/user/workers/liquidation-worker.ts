/**
 * Backend Liquidation Worker
 *
 * Runs as an external process (Node.js / Deno / PM2 / Docker).
 * Connects to Binance Futures WebSocket for mark prices,
 * writes them to Supabase `mark_prices` table,
 * and periodically checks all accounts for liquidation conditions.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=xxx \
 *   npx tsx workers/liquidation-worker.ts
 *
 * Architecture:
 *   1. Binance WS → in-memory mark price cache
 *   2. Every PRICE_FLUSH_INTERVAL → batch upsert to mark_prices table
 *   3. Every LIQUIDATION_CHECK_INTERVAL → scan users with open positions
 *      → call liquidate_account() RPC for each at-risk user
 *   4. Fallback REST polling if WS disconnects
 */

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { normalizeCommissionRate } from "@/lib/utils/commission";
import {
  computeCrossMarginAccountMetrics,
  getBinanceStyleWalletBalance,
  getEstimatedCrossLiquidationPrice,
  getEstimatedIsolatedLiquidationPrice,
  computePositionUnrealizedPnl,
  type FuturesMarginMode,
  type OpenPositionForRisk,
} from "@/lib/utils/futuresRisk";
import { recalculateCrossLiquidationPrices } from "@/lib/server/recalcCrossLiq";

// ─── Configuration ──────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const BINANCE_WS_URL = "wss://fstream.binance.com/ws/!markPrice@arr@1s";
const BINANCE_REST_URL = "https://fapi.binance.com/fapi/v1/premiumIndex";

const PRICE_FLUSH_INTERVAL = 1000; // Flush mark prices to DB every 1s
const LIQUIDATION_CHECK_INTERVAL = 2000; // Check liquidation every 2s
const STALE_PRICE_THRESHOLD = 10000; // 10s = stale
const WS_RECONNECT_DELAY = 3000;
const REST_FALLBACK_INTERVAL = 3000;

const IS_PROD = process.env.NODE_ENV === "production";
function log(...args: unknown[]) {
  if (!IS_PROD) console.log(...args);
}

// ─── State ──────────────────────────────────────────────
const markPriceCache = new Map<
  string,
  {
    markPrice: number;
    indexPrice: number;
    fundingRate: number;
    updatedAt: number;
  }
>();

let ws: WebSocket | null = null;
let restFallbackTimer: ReturnType<typeof setInterval> | null = null;

// ─── Supabase Client (service role — full admin access) ─
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

type WorkerOpenPosition = {
  id: number;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  margin_mode?: "cross" | "isolated" | null;
  size: number | string;
  entry_price: number | string;
  liquidation_price: number | string | null;
  margin: number | string;
};

type WorkerPendingOrder = {
  id: number;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  margin_mode?: FuturesMarginMode | null;
  leverage: number | string;
  size: number | string;
  price: number | string;
  margin: number | string;
  fee: number | string;
  reserved_amount: number | string;
};

async function recordLossCommission(
  userId: string,
  positionId: number,
  lossAmount: number,
) {
  if (!(lossAmount > 0)) {
    return;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("agent_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.agent_id) {
    return;
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, loss_commission_rate")
    .eq("id", profile.agent_id)
    .maybeSingle();

  if (!agent) {
    return;
  }

  const commissionAmount = Number(
    (
      lossAmount * normalizeCommissionRate(agent.loss_commission_rate, 0)
    ).toFixed(4),
  );

  if (!(commissionAmount > 0)) {
    return;
  }

  const { error } = await supabase.from("agent_commissions").insert({
    agent_id: agent.id,
    user_id: userId,
    source_type: "loss",
    source_id: positionId,
    amount: commissionAmount,
  });

  if (error) {
    console.error(
      `[Worker] Failed to record loss commission for position=${positionId}:`,
      error.message,
    );
  }
}

async function recordOpenCommission(params: {
  userId: string;
  agentId?: string | null;
  positionId: number;
  margin: number;
  fee: number;
}) {
  if (!params.agentId) {
    return;
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, commission_rate, fee_commission_rate")
    .eq("id", params.agentId)
    .maybeSingle();

  if (!agent) {
    return;
  }

  const feeCommissionAmount = Number(
    (
      params.fee * normalizeCommissionRate(agent.fee_commission_rate, 0)
    ).toFixed(4),
  );
  const rollingCommissionAmount = Number(
    (params.margin * normalizeCommissionRate(agent.commission_rate, 0)).toFixed(
      4,
    ),
  );
  const commissionRows = [];

  if (feeCommissionAmount > 0) {
    commissionRows.push({
      agent_id: agent.id,
      user_id: params.userId,
      source_type: "trade_fee",
      source_id: params.positionId,
      amount: feeCommissionAmount,
    });
  }

  if (rollingCommissionAmount > 0) {
    commissionRows.push({
      agent_id: agent.id,
      user_id: params.userId,
      source_type: "rolling",
      source_id: params.positionId,
      amount: rollingCommissionAmount,
    });
  }

  if (commissionRows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("agent_commissions")
    .insert(commissionRows);

  if (error) {
    console.error(
      `[Worker] Failed to record open commission for position=${params.positionId}:`,
      error.message,
    );
  }
}

async function settleLiquidation(params: {
  position: WorkerOpenPosition;
  exitPrice: number;
  pnl: number;
}) {
  const closedAt = new Date().toISOString();
  const { position, exitPrice, pnl } = params;

  const { data: updatedRow, error } = await supabase
    .from("futures_positions")
    .update({
      status: "liquidated",
      exit_price: Number(exitPrice.toFixed(8)),
      pnl: Number(pnl.toFixed(4)),
      closed_at: closedAt,
    })
    .eq("id", position.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      `[Worker] Failed to liquidate position=${position.id}:`,
      error.message,
    );
    return false;
  }

  if (!updatedRow) {
    return false;
  }

  await recordLossCommission(position.user_id, position.id, Math.max(0, -pnl));
  return true;
}

async function liquidateCrossPositionsForUser(params: {
  userId: string;
  positions: WorkerOpenPosition[];
  futuresBalance: number;
  markPriceBySymbol: Map<string, number>;
}) {
  const riskPositions: OpenPositionForRisk[] = [];

  for (const position of params.positions) {
    const markPrice = params.markPriceBySymbol.get(position.symbol);

    if (!markPrice) {
      return null;
    }

    riskPositions.push({
      direction: position.direction,
      size: Number(position.size),
      entryPrice: Number(position.entry_price),
      margin: Number(position.margin),
      markPrice,
      marginMode: "cross",
    });
  }

  const metrics = computeCrossMarginAccountMetrics(
    params.futuresBalance,
    riskPositions,
  );

  if (!metrics.isLiquidatable) {
    return null;
  }

  let liquidatedCount = 0;

  for (const position of params.positions) {
    const markPrice = params.markPriceBySymbol.get(position.symbol);

    if (!markPrice) {
      continue;
    }

    const rawPnl = computePositionUnrealizedPnl(
      position.direction,
      Number(position.entry_price),
      markPrice,
      Number(position.size),
    );
    const cappedPnl = Math.max(rawPnl, -Number(position.margin));

    const liquidated = await settleLiquidation({
      position,
      exitPrice: markPrice,
      pnl: cappedPnl,
    });

    if (liquidated) {
      liquidatedCount += 1;
    }
  }

  if (liquidatedCount > 0) {
    const { error } = await supabase.from("liquidation_logs").insert({
      user_id: params.userId,
      equity: Number(metrics.equity.toFixed(4)),
      maintenance_margin: Number(metrics.maintenanceMargin.toFixed(4)),
      margin_ratio: Number(metrics.marginRatio.toFixed(4)),
      positions_liquidated: liquidatedCount,
      triggered_by: "worker",
    });

    if (error) {
      console.error(
        `[Worker] Failed to write liquidation log for ${params.userId}:`,
        error.message,
      );
    }
  }

  return {
    liquidatedCount,
    metrics,
  };
}

async function liquidateIsolatedPosition(
  position: WorkerOpenPosition,
  markPriceBySymbol: Map<string, number>,
) {
  const markPrice = markPriceBySymbol.get(position.symbol);
  const liquidationPrice = Number(position.liquidation_price || 0);

  if (!markPrice || !(liquidationPrice > 0)) {
    return false;
  }

  const shouldLiquidate =
    position.direction === "long"
      ? markPrice <= liquidationPrice
      : markPrice >= liquidationPrice;

  if (!shouldLiquidate) {
    return false;
  }

  const rawPnl = computePositionUnrealizedPnl(
    position.direction,
    Number(position.entry_price),
    markPrice,
    Number(position.size),
  );
  const cappedPnl = Math.max(rawPnl, -Number(position.margin));

  const liquidated = await settleLiquidation({
    position,
    exitPrice: markPrice,
    pnl: cappedPnl,
  });

  if (liquidated) {
    log(
      `[Worker] ⚡ ISOLATED LIQUIDATED position=${position.id} user=${position.user_id} symbol=${position.symbol}`,
    );
  }

  return liquidated;
}

async function executePendingLimitOrders(
  markPriceBySymbol: Map<string, number>,
) {
  const { data: pendingOrders, error } = await supabase
    .from("futures_orders")
    .select(
      "id, user_id, symbol, direction, margin_mode, leverage, size, price, margin, fee, reserved_amount",
    )
    .eq("status", "pending")
    .order("placed_at", { ascending: true });

  if (error) {
    console.error(
      "[Worker] Failed to load pending futures orders:",
      error.message,
    );
    return;
  }

  for (const order of (pendingOrders ?? []) as WorkerPendingOrder[]) {
    const markPrice = markPriceBySymbol.get(order.symbol);
    const limitPrice = Number(order.price);

    if (!markPrice || !(limitPrice > 0)) {
      continue;
    }

    const shouldFill =
      order.direction === "long"
        ? markPrice <= limitPrice
        : markPrice >= limitPrice;

    if (!shouldFill) {
      continue;
    }

    try {
      const [profileResult, existingPositionsResult] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("futures_balance, agent_id")
          .eq("id", order.user_id)
          .maybeSingle(),
        supabase
          .from("futures_positions")
          .select(
            "margin, fee, direction, size, entry_price, margin_mode, symbol",
          )
          .eq("user_id", order.user_id)
          .eq("status", "open"),
      ]);

      const profile = profileResult.data;

      if (profileResult.error || !profile) {
        console.error(
          `[Worker] Failed to load profile for pending order=${order.id}:`,
          profileResult.error?.message,
        );
        continue;
      }

      const futuresBalance =
        Number(profile.futures_balance || 0) +
        Number(order.reserved_amount || 0);
      const existingPositions = existingPositionsResult.data ?? [];
      const crossPositions = existingPositions.filter(
        (position: { margin_mode?: FuturesMarginMode | null }) =>
          position.margin_mode !== "isolated",
      );

      if (crossPositions.length > 0) {
        const riskPositions: OpenPositionForRisk[] = crossPositions.map(
          (position: {
            direction: string;
            size: number | string;
            entry_price: number | string;
            margin: number | string;
            margin_mode?: FuturesMarginMode | null;
            symbol: string;
          }) => ({
            direction: position.direction as "long" | "short",
            size: Number(position.size),
            entryPrice: Number(position.entry_price),
            margin: Number(position.margin),
            markPrice:
              markPriceBySymbol.get(position.symbol) ??
              Number(position.entry_price),
            marginMode:
              position.margin_mode === "isolated" ? "isolated" : "cross",
          }),
        );

        const metrics = computeCrossMarginAccountMetrics(
          futuresBalance,
          riskPositions,
        );

        if (metrics.isLiquidatable) {
          continue;
        }
      }

      const existingMargins = crossPositions.reduce(
        (sum: number, position: { margin: number | string }) =>
          sum + Number(position.margin || 0),
        0,
      );
      const existingFees = crossPositions.reduce(
        (sum: number, position: { fee?: number | string }) =>
          sum + Number(position.fee || 0),
        0,
      );
      const entryPrice = limitPrice;
      const size = Number(order.size);
      const margin = Number(order.margin);
      const fee = Number(order.fee);
      const marginMode =
        order.margin_mode === "isolated" ? "isolated" : "cross";
      const liquidationPrice = Number(
        (marginMode === "isolated"
          ? getEstimatedIsolatedLiquidationPrice({
              direction: order.direction,
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
              direction: order.direction,
              entryPrice,
              size,
            })
        ).toFixed(8),
      );
      const openedAt = new Date().toISOString();
      const { data: insertedPosition, error: insertError } = await supabase
        .from("futures_positions")
        .insert({
          user_id: order.user_id,
          symbol: order.symbol,
          direction: order.direction,
          margin_mode: marginMode,
          leverage: Number(order.leverage),
          size,
          entry_price: entryPrice,
          liquidation_price: liquidationPrice,
          margin,
          fee,
          status: "open",
          opened_at: openedAt,
        })
        .select("id")
        .single();

      if (insertError || !insertedPosition) {
        console.error(
          `[Worker] Failed to create position from pending order=${order.id}:`,
          insertError?.message,
        );
        continue;
      }

      const { data: filledOrder, error: updateError } = await supabase
        .from("futures_orders")
        .update({
          status: "filled",
          filled_position_id: insertedPosition.id,
          filled_at: openedAt,
        })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (updateError || !filledOrder) {
        await supabase
          .from("futures_positions")
          .delete()
          .eq("id", insertedPosition.id);

        if (updateError) {
          console.error(
            `[Worker] Failed to mark pending order=${order.id} as filled:`,
            updateError.message,
          );
        }

        continue;
      }

      await recordOpenCommission({
        userId: order.user_id,
        agentId: profile.agent_id,
        positionId: insertedPosition.id,
        margin,
        fee,
      });

      // Recalculate cross liquidation prices for all user positions
      if (marginMode === "cross") {
        const newFuturesBalance =
          futuresBalance - Number(order.reserved_amount || 0);
        await recalculateCrossLiquidationPrices(
          supabase,
          order.user_id,
          newFuturesBalance,
        ).catch((err) => {
          console.error(
            `[Worker] Failed to recalculate cross liq prices for user=${order.user_id}:`,
            err,
          );
        });
      }

      log(
        `[Worker] ✅ FILLED LIMIT order=${order.id} user=${order.user_id} symbol=${order.symbol} position=${insertedPosition.id}`,
      );
    } catch (err) {
      console.error(
        `[Worker] Unexpected pending order execution error for order=${order.id}:`,
        err,
      );
    }
  }
}

// ─── Mark Price Ingestion: WebSocket ────────────────────
function connectWebSocket() {
  if (ws?.readyState === WebSocket.OPEN) return;

  log("[Worker] Connecting to Binance markPrice WS...");
  ws = new WebSocket(BINANCE_WS_URL);

  ws.on("open", () => {
    log("[Worker] Binance WS connected");
    stopRestFallback();
  });

  ws.on("message", (data: Buffer) => {
    try {
      const items = JSON.parse(data.toString());
      if (!Array.isArray(items)) return;

      for (const item of items) {
        if (!item.s || !item.p) continue;
        markPriceCache.set(item.s, {
          markPrice: parseFloat(item.p),
          indexPrice: parseFloat(item.i || "0"),
          fundingRate: parseFloat(item.r || "0"),
          updatedAt: Date.now(),
        });
      }
    } catch {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    log("[Worker] Binance WS disconnected, reconnecting...");
    startRestFallback();
    setTimeout(connectWebSocket, WS_RECONNECT_DELAY);
  });

  ws.on("error", (err) => {
    console.error("[Worker] WS error:", err.message);
    ws?.close();
  });
}

// ─── Mark Price Ingestion: REST Fallback ────────────────
async function fetchMarkPricesRest() {
  try {
    const res = await fetch(BINANCE_REST_URL);
    if (!res.ok) return;
    const items = await res.json();
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item.symbol || !item.markPrice) continue;
      markPriceCache.set(item.symbol, {
        markPrice: parseFloat(item.markPrice),
        indexPrice: parseFloat(item.indexPrice || "0"),
        fundingRate: parseFloat(item.lastFundingRate || "0"),
        updatedAt: Date.now(),
      });
    }
  } catch {
    // ignore
  }
}

function startRestFallback() {
  if (restFallbackTimer) return;
  log("[Worker] Starting REST fallback polling");
  void fetchMarkPricesRest();
  restFallbackTimer = setInterval(fetchMarkPricesRest, REST_FALLBACK_INTERVAL);
}

function stopRestFallback() {
  if (restFallbackTimer) {
    clearInterval(restFallbackTimer);
    restFallbackTimer = null;
  }
}

// ─── Flush Mark Prices to DB ────────────────────────────
async function flushMarkPricesToDB() {
  if (markPriceCache.size === 0) return;

  const now = Date.now();
  const rows: Array<{
    symbol: string;
    mark_price: number;
    index_price: number;
    funding_rate: number;
    updated_at: string;
  }> = [];

  for (const [symbol, data] of markPriceCache) {
    // Skip stale prices
    if (now - data.updatedAt > STALE_PRICE_THRESHOLD) continue;

    rows.push({
      symbol,
      mark_price: data.markPrice,
      index_price: data.indexPrice,
      funding_rate: data.fundingRate,
      updated_at: new Date(data.updatedAt).toISOString(),
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("mark_prices")
    .upsert(rows, { onConflict: "symbol" });

  if (error) {
    console.error("[Worker] Failed to flush mark prices:", error.message);
  }
}

// ─── Liquidation Check Loop ─────────────────────────────
async function runLiquidationCheck() {
  const markPricesJson: Array<{ symbol: string; mark_price: number }> = [];
  for (const [symbol, data] of markPriceCache) {
    if (Date.now() - data.updatedAt > STALE_PRICE_THRESHOLD) continue;
    markPricesJson.push({ symbol, mark_price: data.markPrice });
  }

  if (markPricesJson.length === 0) {
    log("[Worker] No fresh mark prices available, skipping liquidation check");
    return;
  }

  const markPriceBySymbol = new Map(
    markPricesJson.map((item) => [item.symbol, item.mark_price]),
  );

  await executePendingLimitOrders(markPriceBySymbol);

  const { data: openPositions, error: usersError } = await supabase
    .from("futures_positions")
    .select(
      "id, user_id, symbol, direction, margin_mode, size, entry_price, liquidation_price, margin",
    )
    .eq("status", "open");

  if (usersError || !openPositions) return;

  const typedPositions = openPositions as WorkerOpenPosition[];
  if (typedPositions.length === 0) return;

  const positionsByUser = new Map<string, WorkerOpenPosition[]>();

  for (const position of typedPositions) {
    const current = positionsByUser.get(position.user_id) ?? [];
    current.push(position);
    positionsByUser.set(position.user_id, current);
  }

  for (const [userId, userPositions] of positionsByUser) {
    const crossPositions = userPositions.filter(
      (position) => position.margin_mode !== "isolated",
    );

    if (crossPositions.length === 0) {
      continue;
    }

    // Always use the in-process cross-margin liquidation routine. The previous
    // implementation tried to call a `liquidate_account` RPC for cross-only
    // accounts, but that function was never persisted in the schema and the
    // worker silently skipped every cross-only user when the RPC returned
    // `PGRST202 - Could not find the function`. The JS path below is the
    // single source of truth for the tiered maintenance-margin math (see
    // lib/utils/futuresRisk.ts) and works for both cross-only and mixed
    // accounts.
    try {
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("futures_balance")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profile) {
        console.error(
          `[Worker] Failed to load profile for ${userId}:`,
          profileError?.message,
        );
        continue;
      }

      const result = await liquidateCrossPositionsForUser({
        userId,
        positions: crossPositions,
        futuresBalance: Number(profile.futures_balance || 0),
        markPriceBySymbol,
      });

      if (result?.liquidatedCount) {
        log(
          `[Worker] ⚡ CROSS LIQUIDATED user=${userId} ` +
            `positions=${result.liquidatedCount} ` +
            `equity=${result.metrics.equity} mm=${result.metrics.maintenanceMargin}`,
        );
      }
    } catch (err) {
      console.error(`[Worker] Unexpected error for ${userId}:`, err);
    }
  }

  for (const position of typedPositions) {
    if (position.margin_mode !== "isolated") {
      continue;
    }

    try {
      await liquidateIsolatedPosition(position, markPriceBySymbol);
    } catch (err) {
      console.error(
        `[Worker] Unexpected isolated liquidation error for position=${position.id}:`,
        err,
      );
    }
  }
}

// ─── Main Loop ──────────────────────────────────────────
async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[Worker] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  log("[Worker] Starting liquidation worker...");
  log(`[Worker] Supabase: ${SUPABASE_URL}`);

  // Start mark price ingestion
  connectWebSocket();

  // Periodic flush to DB
  setInterval(() => {
    void flushMarkPricesToDB();
  }, PRICE_FLUSH_INTERVAL);

  // Periodic liquidation checks
  setInterval(() => {
    void runLiquidationCheck();
  }, LIQUIDATION_CHECK_INTERVAL);

  // Initial REST fetch for immediate mark prices
  await fetchMarkPricesRest();

  log("[Worker] Liquidation worker running.");
  log(`[Worker] Price flush: every ${PRICE_FLUSH_INTERVAL}ms`);
  log(`[Worker] Liquidation check: every ${LIQUIDATION_CHECK_INTERVAL}ms`);
}

main().catch((err) => {
  console.error("[Worker] Fatal error:", err);
  process.exit(1);
});
