/**
 * Server-side market price helpers.
 *
 * Binance Futures (fapi.binance.com) and Bybit explicitly geo-block the
 * Vercel iad1 (US-East) data center where Next.js API routes run by
 * default, returning HTTP 451 / 403. Any server-side code that needs the
 * latest spot/perp price for a USDT-margined contract MUST go through
 * this module instead of calling `fapi.binance.com` directly, otherwise
 * the request will fail in production even though it works locally.
 *
 * Fallback chain (in order):
 *   1. OKX USDT-SWAP 1m kline  (perp price — closest to what the user
 *      sees in the futures order panel; symbol mapping
 *      "BTCUSDT" -> "BTC-USDT-SWAP").
 *   2. Binance.US spot 1m kline (separate API host that is not
 *      geo-blocked from Vercel; symbol "BTCUSDT" is reused as-is).
 *
 * Two surfaces are exposed:
 *   - `fetchSymbolLastPrice(symbol)` for callers that only need a single
 *     "current price" (e.g. the close button on a position, force-close
 *     handler, etc.).
 *   - `fetchSymbolPriceWindow(symbol, cutoffMs)` for the limit-order
 *     cron that needs the high/low across all 1m klines whose close time
 *     falls inside the cutoff window in order to detect wicks.
 */

const OKX_REST_URL = "https://www.okx.com";
const BINANCE_US_REST_URL = "https://api.binance.us";

export type SymbolPriceWindow = {
  /** Most recent close price across the fetched klines. */
  lastPrice: number;
  /** Highest traded price across klines whose close time >= cutoffMs. */
  highSinceCutoff: number;
  /** Lowest traded price across klines whose close time >= cutoffMs. */
  lowSinceCutoff: number;
};

type NormalizedKline = {
  startTime: number;
  closeTime: number;
  high: number;
  low: number;
  close: number;
};

function okxInstId(symbol: string): string {
  if (symbol.endsWith("USDT")) {
    return `${symbol.slice(0, -4)}-USDT-SWAP`;
  }
  if (symbol.endsWith("USD")) {
    return `${symbol.slice(0, -3)}-USD-SWAP`;
  }
  return symbol;
}

async function fetchFromOkx(
  symbol: string,
  klineLimit: number,
): Promise<{ klines: NormalizedKline[] | null; error?: string }> {
  try {
    const instId = okxInstId(symbol);
    // OKX v5 candles. Response shape:
    //   { code: "0", data: [ [ts, open, high, low, close, vol, ...], ... ] }
    // List sorted DESC by ts; ts is the kline start in ms.
    // OKX limit max = 300 per request.
    const limit = Math.min(klineLimit, 300);
    const response = await fetch(
      `${OKX_REST_URL}/api/v5/market/candles?instId=${encodeURIComponent(
        instId,
      )}&bar=1m&limit=${limit}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      return { klines: null, error: `okx_http_${response.status}` };
    }
    const payload = (await response.json()) as {
      code?: string;
      msg?: string;
      data?: unknown[];
    };
    if (payload.code !== undefined && payload.code !== "0") {
      return {
        klines: null,
        error: `okx_code_${payload.code}_${payload.msg ?? ""}`,
      };
    }
    if (!Array.isArray(payload.data) || payload.data.length === 0) {
      return { klines: null, error: "okx_empty_rows" };
    }
    const klines = payload.data
      .map((row) => {
        if (!Array.isArray(row) || row.length < 5) return null;
        const startTime = Number(row[0]);
        return {
          startTime,
          closeTime: startTime + 60_000,
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
        };
      })
      .filter((k): k is NormalizedKline => k !== null);
    return { klines };
  } catch (err) {
    return {
      klines: null,
      error: err instanceof Error ? err.message : "okx_threw",
    };
  }
}

async function fetchFromBinanceUs(
  symbol: string,
  klineLimit: number,
): Promise<{ klines: NormalizedKline[] | null; error?: string }> {
  try {
    const limit = Math.min(klineLimit, 1000);
    const response = await fetch(
      `${BINANCE_US_REST_URL}/api/v3/klines?symbol=${encodeURIComponent(
        symbol,
      )}&interval=1m&limit=${limit}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      return { klines: null, error: `binance_us_http_${response.status}` };
    }
    const rows = (await response.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { klines: null, error: "binance_us_empty_rows" };
    }
    const klines = rows
      .map((row) => {
        if (!Array.isArray(row) || row.length < 7) return null;
        return {
          startTime: Number(row[0]),
          closeTime: Number(row[6]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
        };
      })
      .filter((k): k is NormalizedKline => k !== null);
    return { klines };
  } catch (err) {
    return {
      klines: null,
      error: err instanceof Error ? err.message : "binance_us_threw",
    };
  }
}

function aggregateKlines(
  klines: NormalizedKline[],
  cutoffMs: number,
): SymbolPriceWindow | null {
  let highSinceCutoff = -Infinity;
  let lowSinceCutoff = Infinity;
  let newestStart = 0;
  let newestClose = 0;
  for (const k of klines) {
    if (Number.isFinite(k.close) && k.close > 0 && k.startTime > newestStart) {
      newestStart = k.startTime;
      newestClose = k.close;
    }
    if (k.closeTime < cutoffMs) continue;
    if (Number.isFinite(k.high) && k.high > highSinceCutoff) {
      highSinceCutoff = k.high;
    }
    if (Number.isFinite(k.low) && k.low > 0 && k.low < lowSinceCutoff) {
      lowSinceCutoff = k.low;
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
    lastPrice: newestClose > 0 ? newestClose : highSinceCutoff,
    highSinceCutoff,
    lowSinceCutoff,
  };
}

/**
 * Returns the high/low/last price across all 1m klines whose close time is
 * >= cutoffMs, falling back through OKX then Binance.US. Used by the cron
 * job for wick-aware limit-order fills.
 */
export async function fetchSymbolPriceWindow(
  symbol: string,
  cutoffMs: number,
): Promise<{ window: SymbolPriceWindow | null; error?: string }> {
  // Dynamic limit: we need enough 1m candles to cover [cutoffMs, now] so a
  // long-standing pending order still has its full price history scanned
  // for a wick that touched the limit. +2 minutes safety margin.
  const minutesNeeded =
    Math.ceil(Math.max(0, Date.now() - cutoffMs) / 60_000) + 2;
  const klineLimit = Math.max(minutesNeeded, 3);

  const okx = await fetchFromOkx(symbol, klineLimit);
  if (okx.klines) {
    const window = aggregateKlines(okx.klines, cutoffMs);
    if (window) return { window };
    return { window: null, error: "okx_no_kline_in_cutoff_window" };
  }

  const fallback = await fetchFromBinanceUs(symbol, klineLimit);
  if (fallback.klines) {
    const window = aggregateKlines(fallback.klines, cutoffMs);
    if (window) return { window };
    return { window: null, error: "binance_us_no_kline_in_cutoff_window" };
  }

  return {
    window: null,
    error: `okx_failed_${okx.error ?? "?"};binance_us_failed_${
      fallback.error ?? "?"
    }`,
  };
}

/**
 * Returns just the latest close price for the given symbol via the same
 * OKX → Binance.US fallback chain. Returns null if every upstream source
 * is unreachable so callers can decide how to react (throw, use a stale
 * DB cache, fall back to a client-supplied price, etc.).
 */
export async function fetchSymbolLastPrice(
  symbol: string,
): Promise<number | null> {
  // Two klines is enough: the newest close gives us the current minute's
  // last traded price.
  const okx = await fetchFromOkx(symbol, 2);
  if (okx.klines && okx.klines.length > 0) {
    let newestStart = 0;
    let newestClose = 0;
    for (const k of okx.klines) {
      if (k.startTime > newestStart && Number.isFinite(k.close) && k.close > 0) {
        newestStart = k.startTime;
        newestClose = k.close;
      }
    }
    if (newestClose > 0) return newestClose;
  }

  const fallback = await fetchFromBinanceUs(symbol, 2);
  if (fallback.klines && fallback.klines.length > 0) {
    let newestStart = 0;
    let newestClose = 0;
    for (const k of fallback.klines) {
      if (k.startTime > newestStart && Number.isFinite(k.close) && k.close > 0) {
        newestStart = k.startTime;
        newestClose = k.close;
      }
    }
    if (newestClose > 0) return newestClose;
  }

  return null;
}
