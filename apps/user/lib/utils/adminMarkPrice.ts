type LoadAdminMarkPriceMapParams = {
  allowBinanceFallback?: boolean;
  supabase: any;
  symbols: string[];
};

type AdminMarkPriceRow = {
  symbol?: string | null;
  mark_price?: string | number | null;
  updated_at?: string | null;
};

type BinancePremiumIndexResponse = {
  symbol?: string;
  markPrice?: string;
};

export function isSameMarkPriceMap(
  current: Record<string, number>,
  next: Record<string, number>,
) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return currentKeys.every((key) => current[key] === next[key]);
}

const BINANCE_PREMIUM_INDEX_URL =
  "https://fapi.binance.com/fapi/v1/premiumIndex";
const MARK_PRICE_STALE_MS = 5_000;

async function fetchBinanceMarkPrice(symbol: string) {
  try {
    const response = await fetch(
      `${BINANCE_PREMIUM_INDEX_URL}?symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response
      .json()
      .catch(() => null)) as BinancePremiumIndexResponse | null;
    const markPrice = Number(payload?.markPrice || 0);

    if (!Number.isFinite(markPrice) || markPrice <= 0) {
      return null;
    }

    return {
      symbol,
      markPrice,
    };
  } catch {
    return null;
  }
}

export async function loadAdminMarkPriceMap({
  allowBinanceFallback = true,
  supabase,
  symbols,
}: LoadAdminMarkPriceMapParams): Promise<Record<string, number>> {
  const uniqueSymbols = [
    ...new Set(
      symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    ),
  ];

  if (uniqueSymbols.length === 0) {
    return {};
  }

  const { data } = await supabase
    .from("mark_prices")
    .select("symbol, mark_price, updated_at")
    .in("symbol", uniqueSymbols);

  const rows: AdminMarkPriceRow[] = Array.isArray(data)
    ? (data as AdminMarkPriceRow[])
    : [];
  const nextMap: Record<string, number> = {};
  const dbRowsBySymbol = new Map<string, AdminMarkPriceRow>(
    rows.map((row: AdminMarkPriceRow) => [
      String(row.symbol || "").toUpperCase(),
      row,
    ]),
  );

  for (const symbol of uniqueSymbols) {
    const row = dbRowsBySymbol.get(symbol);
    const markPrice = Number(row?.mark_price || 0);
    const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
    const isFresh =
      updatedAt > 0 && Date.now() - updatedAt <= MARK_PRICE_STALE_MS;

    if (Number.isFinite(markPrice) && markPrice > 0 && isFresh) {
      nextMap[symbol] = markPrice;
    }
  }

  const missingSymbols = uniqueSymbols.filter(
    (symbol) => !(nextMap[symbol] > 0),
  );
  if (missingSymbols.length === 0 || !allowBinanceFallback) {
    return nextMap;
  }

  const fallbackRows = await Promise.all(
    missingSymbols.map((symbol) => fetchBinanceMarkPrice(symbol)),
  );

  fallbackRows.forEach((row) => {
    if (row) {
      nextMap[row.symbol] = row.markPrice;
    }
  });

  return nextMap;
}
