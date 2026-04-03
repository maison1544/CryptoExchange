export type FuturesMarginTier = {
  tier: number;
  maxLeverage: number;
  minSize: number;
  maxSize: number;
  maintenanceRate: number;
  maintenanceMargin: number;
};

export type FuturesMarginMode = "cross" | "isolated";

export const FUTURES_MARGIN_TIERS: FuturesMarginTier[] = [
  {
    tier: 1,
    maxLeverage: 125,
    minSize: 0,
    maxSize: 300000,
    maintenanceRate: 0.4,
    maintenanceMargin: 0,
  },
  {
    tier: 2,
    maxLeverage: 100,
    minSize: 300000,
    maxSize: 800000,
    maintenanceRate: 0.5,
    maintenanceMargin: 300,
  },
  {
    tier: 3,
    maxLeverage: 75,
    minSize: 800000,
    maxSize: 3000000,
    maintenanceRate: 0.65,
    maintenanceMargin: 1500,
  },
  {
    tier: 4,
    maxLeverage: 50,
    minSize: 3000000,
    maxSize: 12000000,
    maintenanceRate: 1.0,
    maintenanceMargin: 12000,
  },
  {
    tier: 5,
    maxLeverage: 25,
    minSize: 12000000,
    maxSize: 70000000,
    maintenanceRate: 2.0,
    maintenanceMargin: 132000,
  },
  {
    tier: 6,
    maxLeverage: 20,
    minSize: 70000000,
    maxSize: 100000000,
    maintenanceRate: 2.5,
    maintenanceMargin: 482000,
  },
  {
    tier: 7,
    maxLeverage: 10,
    minSize: 100000000,
    maxSize: 230000000,
    maintenanceRate: 5.0,
    maintenanceMargin: 2982000,
  },
  {
    tier: 8,
    maxLeverage: 5,
    minSize: 230000000,
    maxSize: 480000000,
    maintenanceRate: 10.0,
    maintenanceMargin: 14482000,
  },
  {
    tier: 9,
    maxLeverage: 4,
    minSize: 480000000,
    maxSize: 600000000,
    maintenanceRate: 12.5,
    maintenanceMargin: 26482000,
  },
  {
    tier: 10,
    maxLeverage: 3,
    minSize: 600000000,
    maxSize: 800000000,
    maintenanceRate: 15.0,
    maintenanceMargin: 41482000,
  },
  {
    tier: 11,
    maxLeverage: 2,
    minSize: 800000000,
    maxSize: 1200000000,
    maintenanceRate: 25.0,
    maintenanceMargin: 121482000,
  },
  {
    tier: 12,
    maxLeverage: 1,
    minSize: 1200000000,
    maxSize: 1800000000,
    maintenanceRate: 50.0,
    maintenanceMargin: 421482000,
  },
];

export function getFuturesMarginTier(notional: number) {
  if (!Number.isFinite(notional) || notional <= 0) {
    return FUTURES_MARGIN_TIERS[0];
  }

  return (
    FUTURES_MARGIN_TIERS.find(
      (tier) => notional >= tier.minSize && notional < tier.maxSize,
    ) || FUTURES_MARGIN_TIERS[FUTURES_MARGIN_TIERS.length - 1]
  );
}

export function getEstimatedCrossAccountEquity(
  walletBalance: number,
  openFee: number,
) {
  if (!Number.isFinite(walletBalance) || walletBalance <= 0) {
    return 0;
  }

  const nextEquity = walletBalance - Math.max(0, openFee);
  return nextEquity > 0 ? nextEquity : 0;
}

export function getEstimatedIsolatedLiquidationPrice(params: {
  direction: "long" | "short";
  entryPrice: number;
  size: number;
  margin: number;
}) {
  const entryPrice = Number(params.entryPrice);
  const size = Math.abs(Number(params.size));
  const margin = Math.max(0, Number(params.margin));

  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(size) ||
    !Number.isFinite(margin) ||
    entryPrice <= 0 ||
    size <= 0 ||
    margin <= 0
  ) {
    return 0;
  }

  const notional = entryPrice * size;
  const tier = getFuturesMarginTier(notional);
  const maintenanceRate = tier.maintenanceRate / 100;
  const maintenanceAmount = tier.maintenanceMargin;

  if (params.direction === "long") {
    const denominator = size * (1 - maintenanceRate);

    if (denominator <= 0) {
      return 0;
    }

    const liquidationPrice =
      (size * entryPrice - margin - maintenanceAmount) / denominator;

    return Number.isFinite(liquidationPrice) && liquidationPrice > 0
      ? liquidationPrice
      : 0;
  }

  const denominator = size * (1 + maintenanceRate);

  if (denominator <= 0) {
    return 0;
  }

  const liquidationPrice =
    (size * entryPrice + margin + maintenanceAmount) / denominator;

  return Number.isFinite(liquidationPrice) && liquidationPrice > 0
    ? liquidationPrice
    : 0;
}

/**
 * Convert our system's wallet_balance (which has position margins deducted)
 * back to the Binance-style Wallet Balance (total account funds including locked margins).
 *
 * Binance WB = our_wallet_balance + SUM(all_open_position_margins + fees)
 *
 * This is the correct input for the cross-margin liquidation price formula.
 */
export function getBinanceStyleWalletBalance(
  ourWalletBalance: number,
  openPositionMargins: number,
  openPositionFees: number,
): number {
  const wb = Number.isFinite(ourWalletBalance) ? ourWalletBalance : 0;
  const margins = Number.isFinite(openPositionMargins)
    ? openPositionMargins
    : 0;
  const fees = Number.isFinite(openPositionFees) ? openPositionFees : 0;
  return wb + margins + fees;
}

// ─── Cross-Margin Account-Level Risk Metrics ────────────

export type OpenPositionForRisk = {
  direction: "long" | "short";
  size: number;
  entryPrice: number;
  margin: number;
  markPrice: number;
  marginMode?: FuturesMarginMode;
};

export type CrossMarginAccountMetrics = {
  walletBalance: number;
  unrealizedPnl: number;
  equity: number;
  usedMargin: number;
  maintenanceMargin: number;
  availableBalance: number;
  marginRatio: number;
  isLiquidatable: boolean;
};

export function computePositionUnrealizedPnl(
  direction: "long" | "short",
  entryPrice: number,
  markPrice: number,
  size: number,
): number {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(markPrice) ||
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return 0;
  }

  return direction === "long"
    ? (markPrice - entryPrice) * size
    : (entryPrice - markPrice) * size;
}

export function computePositionMaintenanceMargin(
  markPrice: number,
  size: number,
): number {
  const notional = Math.abs(markPrice * size);
  const tier = getFuturesMarginTier(notional);
  return (notional * tier.maintenanceRate) / 100 - tier.maintenanceMargin;
}

/**
 * Compute cross-margin account-level risk metrics.
 *
 * IMPORTANT: `walletBalance` is our system's DB value which already has
 * open position margins and fees deducted. To compute Binance-style equity
 * we must add back the used margins:
 *
 *   Binance WB  = our_wallet_balance + SUM(margins)  (fees are sunk cost)
 *   Equity      = Binance_WB + unrealized_pnl
 *   Available   = Equity - SUM(margins)
 *   MarginRatio = maintenance_margin / Equity × 100%
 *   Liquidate   = Equity ≤ maintenance_margin
 */
export function computeCrossMarginAccountMetrics(
  walletBalance: number,
  positions: OpenPositionForRisk[],
): CrossMarginAccountMetrics {
  const wb = Number.isFinite(walletBalance) ? walletBalance : 0;

  let unrealizedPnl = 0;
  let usedMargin = 0;
  let maintenanceMargin = 0;

  for (const pos of positions) {
    unrealizedPnl += computePositionUnrealizedPnl(
      pos.direction,
      pos.entryPrice,
      pos.markPrice,
      pos.size,
    );
    usedMargin += Math.max(0, Number(pos.margin) || 0);
    maintenanceMargin += Math.max(
      0,
      computePositionMaintenanceMargin(pos.markPrice, pos.size),
    );
  }

  // Reconstruct Binance-style Wallet Balance (add back locked margins)
  const binanceWB = wb + usedMargin;
  const equity = binanceWB + unrealizedPnl;
  const availableBalance = Math.max(0, equity - usedMargin);
  const marginRatio =
    equity > 0
      ? (maintenanceMargin / equity) * 100
      : positions.length > 0
        ? 100
        : 0;
  const isLiquidatable = positions.length > 0 && equity <= maintenanceMargin;

  return {
    walletBalance: binanceWB,
    unrealizedPnl,
    equity,
    usedMargin,
    maintenanceMargin,
    availableBalance,
    marginRatio: Math.round(marginRatio * 100) / 100,
    isLiquidatable,
  };
}

export function getEstimatedCrossLiquidationPrice(params: {
  accountEquity: number;
  direction: "long" | "short";
  entryPrice: number;
  size: number;
}) {
  const entryPrice = Number(params.entryPrice);
  const size = Math.abs(Number(params.size));
  const accountEquity = Math.max(0, Number(params.accountEquity));

  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(size) ||
    !Number.isFinite(accountEquity) ||
    entryPrice <= 0 ||
    size <= 0
  ) {
    return 0;
  }

  const notional = entryPrice * size;
  const tier = getFuturesMarginTier(notional);
  const maintenanceRate = tier.maintenanceRate / 100;
  const maintenanceAmount = tier.maintenanceMargin;

  if (params.direction === "long") {
    const denominator = size * (1 - maintenanceRate);

    if (denominator <= 0) {
      return 0;
    }

    const liquidationPrice =
      (size * entryPrice - accountEquity - maintenanceAmount) / denominator;

    return Number.isFinite(liquidationPrice) && liquidationPrice > 0
      ? liquidationPrice
      : 0;
  }

  const denominator = size * (1 + maintenanceRate);

  if (denominator <= 0) {
    return 0;
  }

  const liquidationPrice =
    (size * entryPrice + accountEquity + maintenanceAmount) / denominator;

  return Number.isFinite(liquidationPrice) && liquidationPrice > 0
    ? liquidationPrice
    : 0;
}
