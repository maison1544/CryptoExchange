import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBinanceStyleWalletBalance,
  getEstimatedCrossLiquidationPrice,
  type FuturesMarginMode,
} from "@/lib/utils/futuresRisk";

type CrossPositionRow = {
  id: number;
  direction: "long" | "short";
  size: number | string;
  entry_price: number | string;
  margin: number | string;
  fee: number | string;
  margin_mode: FuturesMarginMode | null;
};

/**
 * Recalculate and update the `liquidation_price` for every open
 * cross-margin position belonging to the given user.
 *
 * Must be called after any event that changes the shared margin pool:
 *   - Opening a new cross position (balance decreases)
 *   - Closing a cross position (balance increases)
 *   - Limit-order fill creating a cross position
 *
 * The per-position estimated liquidation price formula uses the total
 * Binance-style Wallet Balance (our_futures_balance + all_cross_margins + all_cross_fees)
 * minus total cross fees as the account equity input.
 */
export async function recalculateCrossLiquidationPrices(
  supabase: SupabaseClient,
  userId: string,
  currentFuturesBalance: number,
): Promise<void> {
  const { data: crossPositions, error } = await supabase
    .from("futures_positions")
    .select("id, direction, size, entry_price, margin, fee, margin_mode")
    .eq("user_id", userId)
    .eq("status", "open")
    .neq("margin_mode", "isolated");

  if (error || !crossPositions || crossPositions.length === 0) {
    return;
  }

  const positions = crossPositions as CrossPositionRow[];

  const totalCrossMargins = positions.reduce(
    (sum, p) => sum + (Number(p.margin) || 0),
    0,
  );
  const totalCrossFees = positions.reduce(
    (sum, p) => sum + (Number(p.fee) || 0),
    0,
  );

  const binanceWB = getBinanceStyleWalletBalance(
    currentFuturesBalance,
    totalCrossMargins,
    totalCrossFees,
  );

  const accountEquity = binanceWB - totalCrossFees;

  const updates: Array<{ id: number; liquidation_price: number }> = [];

  for (const pos of positions) {
    const liqPrice = Number(
      getEstimatedCrossLiquidationPrice({
        accountEquity,
        direction: pos.direction,
        entryPrice: Number(pos.entry_price),
        size: Number(pos.size),
      }).toFixed(8),
    );

    updates.push({ id: pos.id, liquidation_price: liqPrice });
  }

  const updatePromises = updates.map((u) =>
    supabase
      .from("futures_positions")
      .update({ liquidation_price: u.liquidation_price })
      .eq("id", u.id)
      .eq("status", "open"),
  );

  await Promise.all(updatePromises);
}
