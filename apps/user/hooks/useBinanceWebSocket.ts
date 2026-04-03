"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type {
  BinanceTickerData,
  BinanceOrderBookData,
  BinanceTradeData,
  BinanceMarkPriceData,
} from "@/types";

const BINANCE_FUTURES_WS_URL = "wss://fstream.binance.com/stream?streams=";
const BINANCE_FUTURES_REST_URL = "https://fapi.binance.com";
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;
const FALLBACK_POLL_INTERVAL = 3000;

interface UseBinanceWebSocketOptions {
  symbol: string;
  enabled?: boolean;
}

function buildStreams(symbol: string): string[] {
  const s = symbol.toLowerCase();
  return [
    `${s}@ticker`,
    `${s}@depth20@100ms`,
    `${s}@aggTrade`,
    `${s}@markPrice`,
  ];
}

type Binance24hTickerRest = {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
};

type BinanceDepthRest = {
  asks: [string, string][];
  bids: [string, string][];
};

type BinanceAggTradeRest = {
  a: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
};

type BinancePremiumIndexRest = {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
};

function parseTickerData(raw: Record<string, unknown>): BinanceTickerData {
  return {
    symbol: raw.s as string,
    price: parseFloat(raw.c as string),
    priceChange: parseFloat(raw.p as string),
    priceChangePercent: parseFloat(raw.P as string),
    volume: parseFloat(raw.v as string),
    quoteVolume: parseFloat(raw.q as string),
    openPrice: parseFloat(raw.o as string),
    highPrice: parseFloat(raw.h as string),
    lowPrice: parseFloat(raw.l as string),
    lastUpdateTime: Date.now(),
  };
}

function parseOrderBookData(
  raw: Record<string, unknown>,
): BinanceOrderBookData {
  return {
    symbol: (raw.s as string) || "",
    asks: (raw.a as [string, string][]) || [],
    bids: (raw.b as [string, string][]) || [],
    lastUpdateTime: Date.now(),
  };
}

function parseTradeData(raw: Record<string, unknown>): BinanceTradeData {
  return {
    symbol: raw.s as string,
    tradeId: raw.a as number,
    price: parseFloat(raw.p as string),
    qty: parseFloat(raw.q as string),
    time: raw.T as number,
    isBuyerMaker: raw.m as boolean,
    lastUpdateTime: Date.now(),
  };
}

function parseMarkPriceData(
  raw: Record<string, unknown>,
): BinanceMarkPriceData {
  return {
    symbol: raw.s as string,
    markPrice: parseFloat((raw.p as string) || "0"),
    indexPrice: parseFloat((raw.i as string) || "0"),
    fundingRate: parseFloat((raw.r as string) || "0"),
    fundingTime: (raw.T as number) || Date.now(),
  };
}

function parseTickerRestData(raw: Binance24hTickerRest): BinanceTickerData {
  return {
    symbol: raw.symbol,
    price: parseFloat(raw.lastPrice),
    priceChange: parseFloat(raw.priceChange),
    priceChangePercent: parseFloat(raw.priceChangePercent),
    volume: parseFloat(raw.volume),
    quoteVolume: parseFloat(raw.quoteVolume),
    openPrice: parseFloat(raw.openPrice),
    highPrice: parseFloat(raw.highPrice),
    lowPrice: parseFloat(raw.lowPrice),
    lastUpdateTime: Date.now(),
  };
}

function parseOrderBookRestData(
  symbol: string,
  raw: BinanceDepthRest,
): BinanceOrderBookData {
  return {
    symbol,
    asks: raw.asks || [],
    bids: raw.bids || [],
    lastUpdateTime: Date.now(),
  };
}

function parseTradeRestData(
  symbol: string,
  raw: BinanceAggTradeRest,
): BinanceTradeData {
  return {
    symbol,
    tradeId: raw.a,
    price: parseFloat(raw.p),
    qty: parseFloat(raw.q),
    time: raw.T,
    isBuyerMaker: raw.m,
    lastUpdateTime: Date.now(),
  };
}

function parseMarkPriceRestData(
  raw: BinancePremiumIndexRest,
): BinanceMarkPriceData {
  return {
    symbol: raw.symbol,
    markPrice: parseFloat(raw.markPrice || "0"),
    indexPrice: parseFloat(raw.indexPrice || "0"),
    fundingRate: parseFloat(raw.lastFundingRate || "0"),
    fundingTime: raw.nextFundingTime || Date.now(),
  };
}

export function useBinanceWebSocket({
  symbol,
  enabled = true,
}: UseBinanceWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ticker, setTicker] = useState<BinanceTickerData | null>(null);
  const [orderBook, setOrderBook] = useState<BinanceOrderBookData | null>(null);
  const [recentTrades, setRecentTrades] = useState<BinanceTradeData[]>([]);
  const [markPrice, setMarkPrice] = useState<BinanceMarkPriceData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const stopFallbackPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchFallbackData = useCallback(async () => {
    if (!enabled || !symbol) {
      return;
    }

    try {
      const encodedSymbol = encodeURIComponent(symbol);
      const [tickerRes, depthRes, tradeRes, markPriceRes] = await Promise.all([
        fetch(
          `${BINANCE_FUTURES_REST_URL}/fapi/v1/ticker/24hr?symbol=${encodedSymbol}`,
          { cache: "no-store" },
        ),
        fetch(
          `${BINANCE_FUTURES_REST_URL}/fapi/v1/depth?symbol=${encodedSymbol}&limit=20`,
          { cache: "no-store" },
        ),
        fetch(
          `${BINANCE_FUTURES_REST_URL}/fapi/v1/aggTrades?symbol=${encodedSymbol}&limit=50`,
          { cache: "no-store" },
        ),
        fetch(
          `${BINANCE_FUTURES_REST_URL}/fapi/v1/premiumIndex?symbol=${encodedSymbol}`,
          { cache: "no-store" },
        ),
      ]);

      if (!tickerRes.ok || !depthRes.ok || !tradeRes.ok || !markPriceRes.ok) {
        return;
      }

      const [tickerJson, depthJson, tradeJson, markPriceJson] =
        await Promise.all([
          tickerRes.json() as Promise<Binance24hTickerRest>,
          depthRes.json() as Promise<BinanceDepthRest>,
          tradeRes.json() as Promise<BinanceAggTradeRest[]>,
          markPriceRes.json() as Promise<BinancePremiumIndexRest>,
        ]);

      setTicker(parseTickerRestData(tickerJson));
      setOrderBook(parseOrderBookRestData(symbol, depthJson));
      setRecentTrades(
        (tradeJson || [])
          .slice()
          .reverse()
          .map((item) => parseTradeRestData(symbol, item)),
      );
      setMarkPrice(parseMarkPriceRestData(markPriceJson));
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, [enabled, symbol]);

  const startFallbackPolling = useCallback(() => {
    if (!enabled || !symbol || pollTimerRef.current) {
      return;
    }

    void fetchFallbackData();
    pollTimerRef.current = setInterval(() => {
      void fetchFallbackData();
    }, FALLBACK_POLL_INTERVAL);
  }, [enabled, fetchFallbackData, symbol]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      if (!parsed.stream || !parsed.data) return;

      const stream: string = parsed.stream;
      const data = parsed.data;

      if (stream.includes("@ticker")) {
        const tickerData = parseTickerData(data);
        setTicker(tickerData);
      } else if (stream.includes("@depth")) {
        const obData = parseOrderBookData(data);
        setOrderBook(obData);
      } else if (stream.includes("@aggTrade")) {
        const tradeData = parseTradeData(data);
        setRecentTrades((prev) => [tradeData, ...prev].slice(0, 50));
      } else if (stream.includes("@markPrice")) {
        const mpData = parseMarkPriceData(data);
        setMarkPrice(mpData);
      }
    } catch (err) {
      console.error("[BinanceWS] 메시지 파싱 오류:", err);
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !symbol) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const streams = buildStreams(symbol);
      const url = `${BINANCE_FUTURES_WS_URL}${streams.join("/")}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        stopFallbackPolling();
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        startFallbackPolling();
      };

      ws.onclose = () => {
        startFallbackPolling();
        wsRef.current = null;

        // Reconnect with exponential backoff
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS && enabled) {
          const delay =
            RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            connectRef.current();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      startFallbackPolling();
      console.error(`[BinanceWS] 연결 초기화 오류:`, err);
    }
  }, [
    symbol,
    enabled,
    handleMessage,
    startFallbackPolling,
    stopFallbackPolling,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect
      wsRef.current.close();
      wsRef.current = null;
    }
    stopFallbackPolling();
    setIsConnected(false);
  }, [stopFallbackPolling]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const timer = setTimeout(() => {
      connect();
    }, 0);

    return () => {
      clearTimeout(timer);
      disconnect();
    };
  }, [connect, disconnect]);

  // Reset data when symbol changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setTicker(null);
      setOrderBook(null);
      setRecentTrades([]);
      setMarkPrice(null);
      stopFallbackPolling();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [symbol, stopFallbackPolling]);

  return {
    ticker,
    orderBook,
    recentTrades,
    markPrice,
    isConnected,
    disconnect,
    reconnect: connect,
  };
}
