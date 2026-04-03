"use client";

import Image from "next/image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminTable,
  AdminTableCell,
  AdminTableRow,
} from "@/components/admin/ui/AdminTable";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import {
  AdminInput,
  AdminSelect,
  AdminButton,
} from "@/components/admin/ui/AdminForms";
import { useNotification } from "@/contexts/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import {
  loadSiteSettings,
  parseJsonSetting,
  saveSiteSettings,
  stringifyJsonSetting,
} from "@/lib/utils/siteSettings";
import { loadAdminMarkPriceMap } from "@/lib/utils/adminMarkPrice";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

type CoinConfig = {
  symbol: string;
  name: string;
  active: boolean;
  maxLeverage: number;
  sortOrder: number;
  isLive: boolean;
  price: number;
  volume24h: number;
  traderCount: number;
  tradeAmount: number;
  openPositionCount: number;
  openMargin: number;
  sales: number;
};

type CoinFormState = {
  active: string;
  maxLeverage: string;
  sortOrder: string;
};

type FuturesPositionMetricRow = {
  symbol?: string | null;
  user_id?: string | null;
  status?: string | null;
  margin?: string | number | null;
  size?: string | number | null;
  entry_price?: string | number | null;
  fee?: string | number | null;
};

type FuturesPositionsQueryResponse = {
  data: FuturesPositionMetricRow[] | null;
  error: unknown;
};

type LiveFuturesMarket = {
  symbol: string;
  name: string;
  volume24h: number;
};

type BinanceExchangeInfo = {
  symbols?: Array<{
    symbol: string;
    status: string;
    contractType: string;
    quoteAsset: string;
    baseAsset: string;
  }>;
};

type Binance24hTicker = {
  symbol: string;
  quoteVolume: string;
};

const supabase = createClient();
const STORAGE_KEY = "admin_coin_symbols";
const LIVE_MARKET_REQUEST_TIMEOUT_MS = 4000;
const ADMIN_COIN_REQUEST_TIMEOUT_MS = 6000;
const TOP_MARKET_CAP_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "SOLUSDT",
  "TRXUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "LINKUSDT",
  "AVAXUSDT",
] as const;
const COIN_PAGE_SIZE = 10;
const COIN_ICON_URLS: Record<(typeof TOP_MARKET_CAP_SYMBOLS)[number], string> =
  {
    BTCUSDT: "https://img.icons8.com/color/96/bitcoin--v3.png",
    ETHUSDT: "https://img.icons8.com/color/96/ethereum.png",
    BNBUSDT: "https://img.icons8.com/dusk/96/binance.png",
    XRPUSDT: "https://img.icons8.com/color/96/xrp.png",
    SOLUSDT: "https://img.icons8.com/nolan/96/solana.png",
    TRXUSDT: "https://img.icons8.com/cotton/96/tron.png",
    DOGEUSDT: "https://img.icons8.com/liquid-glass-color/96/dogecoin.png",
    ADAUSDT: "https://img.icons8.com/fluent/96/cardano.png",
    LINKUSDT: "https://img.icons8.com/cotton/96/chainlink.png",
    AVAXUSDT: "https://img.icons8.com/color/96/avalanche.png",
  };
const EMPTY_FORM: CoinFormState = {
  active: "true",
  maxLeverage: "75",
  sortOrder: "1",
};

function withTimeoutFallback<T>(
  promise: PromiseLike<T>,
  fallback: T,
  timeoutMs: number,
) {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(fallback);
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        resolve(fallback);
      });
  });
}

function toPersistedCoinPayload(coins: CoinConfig[]) {
  return coins.map((coin) => ({
    symbol: coin.symbol,
    name: coin.name,
    active: coin.active,
    maxLeverage: coin.maxLeverage,
    sortOrder: coin.sortOrder,
  }));
}

function toSafeNumber(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildPositionMetrics(rows: FuturesPositionMetricRow[]) {
  const metrics = new Map<
    string,
    {
      traderIds: Set<string>;
      tradeAmount: number;
      openPositionCount: number;
      openMargin: number;
      sales: number;
    }
  >();

  rows.forEach((row) => {
    const symbol = String(row.symbol || "")
      .trim()
      .toUpperCase();

    if (!symbol) {
      return;
    }

    const current = metrics.get(symbol) ?? {
      traderIds: new Set<string>(),
      tradeAmount: 0,
      openPositionCount: 0,
      openMargin: 0,
      sales: 0,
    };
    const userId = String(row.user_id || "").trim();

    if (userId) {
      current.traderIds.add(userId);
    }

    current.tradeAmount +=
      Math.abs(toSafeNumber(row.size)) * toSafeNumber(row.entry_price);

    if (row.status === "open") {
      current.openPositionCount += 1;
      current.openMargin += toSafeNumber(row.margin);
    }

    current.sales += toSafeNumber(row.fee);
    metrics.set(symbol, current);
  });

  return metrics;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    LIVE_MARKET_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("실시간 선물 종목을 불러오지 못했습니다.");
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function loadLiveFuturesMarkets(): Promise<LiveFuturesMarket[]> {
  const [exchangeInfo, tickers] = await Promise.all([
    fetchJsonWithTimeout<BinanceExchangeInfo>(
      "https://fapi.binance.com/fapi/v1/exchangeInfo",
    ),
    fetchJsonWithTimeout<Binance24hTicker[]>(
      "https://fapi.binance.com/fapi/v1/ticker/24hr",
    ),
  ]);

  const allowedSymbols = new Map(
    (exchangeInfo.symbols ?? [])
      .filter(
        (item) =>
          item.quoteAsset === "USDT" &&
          item.contractType === "PERPETUAL" &&
          item.status === "TRADING",
      )
      .map((item) => [item.symbol, item.baseAsset]),
  );

  return tickers
    .filter((item) => allowedSymbols.has(item.symbol))
    .map((item) => ({
      symbol: item.symbol,
      name: allowedSymbols.get(item.symbol) ?? item.symbol.replace(/USDT$/, ""),
      volume24h: toSafeNumber(item.quoteVolume),
    }))
    .sort(
      (a, b) => b.volume24h - a.volume24h || a.symbol.localeCompare(b.symbol),
    );
}

function normalizeCoin(
  value: Partial<CoinConfig>,
  fallbackOrder: number,
): CoinConfig {
  const symbol = String(value.symbol || "")
    .trim()
    .toUpperCase();
  const name = String(value.name || "").trim();
  const maxLeverage = Number(value.maxLeverage);
  const sortOrder = Number(value.sortOrder);

  return {
    symbol,
    name,
    active: value.active !== false,
    maxLeverage:
      Number.isFinite(maxLeverage) && maxLeverage > 0 ? maxLeverage : 75,
    sortOrder:
      Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : fallbackOrder,
    isLive: value.isLive === true,
    price: toSafeNumber(value.price),
    volume24h: toSafeNumber(value.volume24h),
    traderCount: Math.max(0, Math.trunc(toSafeNumber(value.traderCount))),
    tradeAmount: toSafeNumber(value.tradeAmount),
    openPositionCount: Math.max(
      0,
      Math.trunc(toSafeNumber(value.openPositionCount)),
    ),
    openMargin: toSafeNumber(value.openMargin),
    sales: toSafeNumber(value.sales),
  };
}

function toFormState(coin: CoinConfig): CoinFormState {
  return {
    active: coin.active ? "true" : "false",
    maxLeverage: String(coin.maxLeverage),
    sortOrder: String(coin.sortOrder),
  };
}

export function CoinSymbolsTab() {
  const { addToast } = useNotification();
  const addToastRef = useRef(addToast);
  const [coins, setCoins] = useState<CoinConfig[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CoinFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);

  const loadCoins = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const [settings, positionsResponse, liveMarketResult] = await Promise.all(
        [
          withTimeoutFallback(
            loadSiteSettings(supabase, [STORAGE_KEY]),
            {} as Record<string, string>,
            ADMIN_COIN_REQUEST_TIMEOUT_MS,
          ),
          withTimeoutFallback(
            supabase
              .from("futures_positions")
              .select(
                "symbol, user_id, status, margin, size, entry_price, fee",
              ) as PromiseLike<FuturesPositionsQueryResponse>,
            {
              data: null,
              error: null,
            } as FuturesPositionsQueryResponse,
            ADMIN_COIN_REQUEST_TIMEOUT_MS,
          ),
          loadLiveFuturesMarkets()
            .then((markets) => ({ markets, error: null as string | null }))
            .catch((error) => ({
              markets: [] as LiveFuturesMarket[],
              error:
                error instanceof Error
                  ? error.message
                  : "실시간 선물 종목을 불러오지 못했습니다.",
            })),
        ],
      );

      if (positionsResponse.error) {
        throw positionsResponse.error;
      }

      const parsed = parseJsonSetting<Partial<CoinConfig>[]>(
        settings[STORAGE_KEY],
        [],
      );
      const savedCoins = parsed
        .map((coin, index) => normalizeCoin(coin, index + 1))
        .filter(
          (coin) =>
            coin.symbol &&
            TOP_MARKET_CAP_SYMBOLS.includes(
              coin.symbol as (typeof TOP_MARKET_CAP_SYMBOLS)[number],
            ),
        );
      const hasPrunedSavedCoins = savedCoins.length !== parsed.length;
      const savedCoinBySymbol = new Map(
        savedCoins.map((coin) => [coin.symbol, coin]),
      );
      const positionMetrics = buildPositionMetrics(
        (positionsResponse.data as FuturesPositionMetricRow[] | null) ?? [],
      );
      const markPriceMap = await withTimeoutFallback(
        loadAdminMarkPriceMap({
          allowBinanceFallback: false,
          supabase,
          symbols: [
            ...liveMarketResult.markets.map((market) => market.symbol),
            ...savedCoins.map((coin) => coin.symbol),
            ...Array.from(positionMetrics.keys()),
          ],
        }),
        {} as Record<string, number>,
        ADMIN_COIN_REQUEST_TIMEOUT_MS,
      );
      const liveMarketBySymbol = new Map(
        liveMarketResult.markets.map((market) => [market.symbol, market]),
      );

      const nextCoins = TOP_MARKET_CAP_SYMBOLS.map((symbol, index) => {
        const saved = savedCoinBySymbol.get(symbol);
        const market = liveMarketBySymbol.get(symbol);
        const metrics = positionMetrics.get(symbol);

        return normalizeCoin(
          {
            symbol,
            name: saved?.name || market?.name || symbol.replace(/USDT$/, ""),
            active: saved?.active ?? true,
            maxLeverage: saved?.maxLeverage ?? 75,
            sortOrder: saved?.sortOrder ?? index + 1,
            isLive: Boolean(market),
            price: markPriceMap[symbol] ?? 0,
            volume24h: market?.volume24h ?? 0,
            traderCount: metrics?.traderIds.size ?? 0,
            tradeAmount: metrics?.tradeAmount ?? 0,
            openPositionCount: metrics?.openPositionCount ?? 0,
            openMargin: metrics?.openMargin ?? 0,
            sales: metrics?.sales ?? 0,
          },
          index + 1,
        );
      });

      if (liveMarketResult.error) {
        addToastRef.current({
          title: "실시간 선물 종목 동기화 실패",
          message:
            liveMarketResult.error ?? "실시간 선물 종목을 불러오지 못했습니다.",
          type: "error",
        });
      }

      setCoins(nextCoins);

      if (hasPrunedSavedCoins) {
        void saveSiteSettings(supabase, {
          [STORAGE_KEY]: stringifyJsonSetting(
            toPersistedCoinPayload(nextCoins),
          ),
        }).catch((error) => {
          addToastRef.current({
            title: "코인 설정 정리 실패",
            message:
              error instanceof Error
                ? error.message
                : "허용 종목 외 코인 설정을 정리하지 못했습니다.",
            type: "error",
          });
        });
      }
    } catch (error) {
      addToastRef.current({
        title: "코인 설정 불러오기 실패",
        message:
          error instanceof Error
            ? error.message
            : "코인 설정을 불러오지 못했습니다.",
        type: "error",
      });
      setLoadError(
        error instanceof Error
          ? error.message
          : "코인 설정을 불러오지 못했습니다.",
      );
      setCoins([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoins();
  }, [loadCoins]);

  const persistCoins = useCallback(
    async (nextCoins: CoinConfig[], title: string, message: string) => {
      try {
        setIsSaving(true);
        await saveSiteSettings(supabase, {
          [STORAGE_KEY]: stringifyJsonSetting(
            toPersistedCoinPayload(nextCoins),
          ),
        });
        setCoins(nextCoins);
        addToast({ title, message, type: "success" });
        return true;
      } catch (error) {
        addToast({
          title: "코인 설정 저장 실패",
          message:
            error instanceof Error
              ? error.message
              : "코인 설정을 저장하지 못했습니다.",
          type: "error",
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [addToast],
  );

  const orderedCoins = useMemo(
    () =>
      [...coins].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.symbol.localeCompare(b.symbol),
      ),
    [coins],
  );

  const filtered = orderedCoins;

  const totalPages = Math.max(1, Math.ceil(filtered.length / COIN_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCoins = filtered.slice(
    (safeCurrentPage - 1) * COIN_PAGE_SIZE,
    safeCurrentPage * COIN_PAGE_SIZE,
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleEditField = (key: keyof CoinFormState, value: string) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelect = (coin: CoinConfig) => {
    if (selectedSymbol === coin.symbol) {
      setSelectedSymbol(null);
      setEditForm(EMPTY_FORM);
      return;
    }

    setSelectedSymbol(coin.symbol);
    setEditForm(toFormState(coin));
  };

  const handleUpdate = async () => {
    if (!selectedSymbol) {
      return;
    }

    const currentCoin = coins.find((coin) => coin.symbol === selectedSymbol);

    if (!currentCoin) {
      return;
    }

    const nextCoin = normalizeCoin(
      {
        symbol: currentCoin.symbol,
        name: currentCoin.name,
        active: editForm.active === "true",
        maxLeverage: Number(editForm.maxLeverage),
        sortOrder: Number(editForm.sortOrder),
        isLive: currentCoin.isLive,
        price: currentCoin.price,
        volume24h: currentCoin.volume24h,
        traderCount: currentCoin.traderCount,
        tradeAmount: currentCoin.tradeAmount,
        openPositionCount: currentCoin.openPositionCount,
        openMargin: currentCoin.openMargin,
        sales: currentCoin.sales,
      },
      coins.findIndex((coin) => coin.symbol === selectedSymbol) + 1,
    );

    if (
      !TOP_MARKET_CAP_SYMBOLS.includes(
        nextCoin.symbol as (typeof TOP_MARKET_CAP_SYMBOLS)[number],
      )
    ) {
      addToast({
        title: "상위 시총 종목만 관리 가능",
        message: "현재 코인 관리는 시가총액 상위 10개 USDT 종목만 유지합니다.",
        type: "error",
      });
      return;
    }

    const success = await persistCoins(
      coins.map((coin) => (coin.symbol === selectedSymbol ? nextCoin : coin)),
      "코인 수정 완료",
      `${nextCoin.symbol} 설정이 업데이트되었습니다.`,
    );

    if (success) {
      setSelectedSymbol(nextCoin.symbol);
      setEditForm(toFormState(nextCoin));
    }
  };

  const handleDelete = async (symbol: string) => {
    const success = await persistCoins(
      coins.filter((coin) => coin.symbol !== symbol),
      "코인 삭제 완료",
      `${symbol} 설정이 삭제되었습니다.`,
    );

    if (success && selectedSymbol === symbol) {
      setSelectedSymbol(null);
      setEditForm(EMPTY_FORM);
    }
  };

  return (
    <div className="space-y-6">
      <AdminCard
        title={`코인 목록 (${filtered.length}건)`}
        action={
          <div className="text-xs text-gray-500">
            시총 상위 10개 USDT 종목만 관리합니다.
          </div>
        }
      >
        {isLoading ? (
          <AdminLoadingSpinner message="코인 설정을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError ?? "코인 설정을 불러오지 못했습니다."}
            onRetry={() => void loadCoins()}
          />
        ) : filtered.length === 0 ? (
          <AdminEmptyState message="등록된 코인이 없습니다." />
        ) : (
          <div className="space-y-4 p-4">
            <AdminTable
              containerClassName="xl:overflow-x-visible"
              tableClassName="min-w-full table-fixed"
              headerCellClassName="text-center text-[11px]"
              columnClassNames={[
                "w-14",
                "w-40",
                "w-40",
                "w-20",
                "w-20",
                "w-28",
                "w-28",
                "w-24",
              ]}
              headers={[
                "순서",
                "코인",
                "상태",
                "거래자",
                "오픈",
                "오픈 마진",
                "누적 매출",
                "관리",
              ]}
            >
              {paginatedCoins.map((coin) => (
                <React.Fragment key={coin.symbol}>
                  <AdminTableRow
                    className={
                      selectedSymbol === coin.symbol ? "bg-white/3" : ""
                    }
                  >
                    <AdminTableCell className="text-center font-medium text-gray-400">
                      {coin.sortOrder}
                    </AdminTableCell>
                    <AdminTableCell className="whitespace-normal text-center">
                      <div className="flex min-w-0 items-center justify-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                          <Image
                            src={
                              COIN_ICON_URLS[
                                coin.symbol as keyof typeof COIN_ICON_URLS
                              ]
                            }
                            alt={`${coin.symbol} icon`}
                            width={32}
                            height={32}
                            className="h-8 w-8 object-contain"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 max-w-full text-center">
                          <div className="font-medium text-white">
                            {coin.symbol}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-gray-500">
                            {coin.name}
                          </div>
                        </div>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="whitespace-normal text-center">
                      <div className="flex items-center justify-center gap-1.5 px-1">
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-medium ${coin.active ? "bg-green-500/14 text-green-400" : "bg-white/6 text-gray-400"}`}
                        >
                          {coin.active ? "발매" : "미발매"}
                        </span>
                        <span className="rounded-full bg-white/6 px-2 py-1 text-[11px] font-medium text-gray-300">
                          {coin.maxLeverage}x
                        </span>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="text-center font-medium text-white">
                      {formatDisplayNumber(coin.traderCount, {
                        maximumFractionDigits: 0,
                      })}
                      명
                    </AdminTableCell>
                    <AdminTableCell className="text-center font-medium text-white">
                      {formatDisplayNumber(coin.openPositionCount, {
                        maximumFractionDigits: 0,
                      })}
                      건
                    </AdminTableCell>
                    <AdminTableCell className="text-center font-medium text-white">
                      {formatUsdt(coin.openMargin, {
                        maximumFractionDigits: 0,
                      })}
                    </AdminTableCell>
                    <AdminTableCell className="text-center font-medium text-white">
                      {formatUsdt(coin.sales, {
                        maximumFractionDigits: 2,
                      })}
                    </AdminTableCell>
                    <AdminTableCell className="text-center">
                      <AdminButton
                        size="sm"
                        variant={
                          selectedSymbol === coin.symbol
                            ? "secondary"
                            : "primary"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(coin);
                        }}
                      >
                        {selectedSymbol === coin.symbol ? "접기" : "편집"}
                      </AdminButton>
                    </AdminTableCell>
                  </AdminTableRow>

                  {selectedSymbol === coin.symbol && (
                    <AdminTableRow className="bg-white/3 hover:bg-white/3">
                      <AdminTableCell
                        colSpan={8}
                        className="whitespace-normal px-5 py-5"
                      >
                        <div
                          className="max-w-full space-y-5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-xs text-gray-300">
                                최대 레버리지
                              </label>
                              <AdminInput
                                type="number"
                                value={editForm.maxLeverage}
                                onChange={(e) =>
                                  handleEditField("maxLeverage", e.target.value)
                                }
                                className="w-full min-w-0"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-gray-300">
                                정렬 순서
                              </label>
                              <AdminInput
                                type="number"
                                value={editForm.sortOrder}
                                onChange={(e) =>
                                  handleEditField("sortOrder", e.target.value)
                                }
                                className="w-full min-w-0"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-gray-300">
                                발매 설정
                              </label>
                              <AdminSelect
                                className="w-full min-w-0"
                                value={editForm.active}
                                onChange={(e) =>
                                  handleEditField("active", e.target.value)
                                }
                              >
                                <option value="true">발매</option>
                                <option value="false">미발매</option>
                              </AdminSelect>
                            </div>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            <AdminButton
                              onClick={handleUpdate}
                              disabled={isSaving}
                            >
                              저장
                            </AdminButton>
                            <AdminButton
                              variant="secondary"
                              onClick={() => {
                                setSelectedSymbol(null);
                                setEditForm(EMPTY_FORM);
                              }}
                              disabled={isSaving}
                            >
                              취소
                            </AdminButton>
                            {!coin.isLive && (
                              <AdminButton
                                variant="danger"
                                onClick={() => handleDelete(coin.symbol)}
                                disabled={isSaving}
                              >
                                삭제
                              </AdminButton>
                            )}
                          </div>
                        </div>
                      </AdminTableCell>
                    </AdminTableRow>
                  )}
                </React.Fragment>
              ))}
            </AdminTable>

            {totalPages > 1 && (
              <AdminPagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalCount={filtered.length}
                pageSize={COIN_PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            )}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
