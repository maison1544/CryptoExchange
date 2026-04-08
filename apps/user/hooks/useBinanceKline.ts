"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const BINANCE_FUTURES_REST_URL = "https://fapi.binance.com";
const BINANCE_FUTURES_WS_URL = "wss://fstream.binance.com/ws/";

export type KlineInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type KlineBar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
};

interface UseBinanceKlineOptions {
  symbol: string;
  interval: KlineInterval;
  enabled?: boolean;
}

function parseRestKline(raw: unknown[]): KlineBar {
  return {
    timestamp: raw[0] as number,
    open: parseFloat(raw[1] as string),
    high: parseFloat(raw[2] as string),
    low: parseFloat(raw[3] as string),
    close: parseFloat(raw[4] as string),
    volume: parseFloat(raw[5] as string),
    turnover: parseFloat(raw[7] as string),
  };
}

function parseWsKline(k: Record<string, unknown>): KlineBar {
  return {
    timestamp: k.t as number,
    open: parseFloat(k.o as string),
    high: parseFloat(k.h as string),
    low: parseFloat(k.l as string),
    close: parseFloat(k.c as string),
    volume: parseFloat(k.v as string),
    turnover: parseFloat(k.q as string),
  };
}

export function useBinanceKline({
  symbol,
  interval,
  enabled = true,
}: UseBinanceKlineOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const [historicalBars, setHistoricalBars] = useState<KlineBar[]>([]);
  const [latestBar, setLatestBar] = useState<KlineBar | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const fetchHistorical = useCallback(async () => {
    if (!enabled || !symbol) return;
    setIsLoading(true);
    try {
      const encodedSymbol = encodeURIComponent(symbol);
      const res = await fetch(
        `${BINANCE_FUTURES_REST_URL}/fapi/v1/klines?symbol=${encodedSymbol}&interval=${interval}&limit=1500`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as unknown[][];
      const bars = data.map(parseRestKline);
      setHistoricalBars(bars);
      if (bars.length > 0) {
        setLatestBar(bars[bars.length - 1]);
      }
    } catch (err) {
      console.error("[BinanceKline] REST fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval, enabled]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !symbol) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const stream = `${symbol.toLowerCase()}@kline_${interval}`;
      const ws = new WebSocket(`${BINANCE_FUTURES_WS_URL}${stream}`);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.e !== "kline" || !parsed.k) return;
          const bar = parseWsKline(parsed.k);
          setLatestBar(bar);
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
        setIsConnected(false);

        if (reconnectAttemptsRef.current < 10 && enabled) {
          const delay = 1000 * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("[BinanceKline] WS connect error:", err);
    }
  }, [symbol, interval, enabled]);

  // Fetch historical data when symbol/interval changes
  useEffect(() => {
    void fetchHistorical();
  }, [fetchHistorical]);

  // Connect WS when symbol/interval changes
  useEffect(() => {
    disconnect();
    const timer = setTimeout(() => {
      connect();
    }, 100);

    return () => {
      clearTimeout(timer);
      disconnect();
    };
  }, [connect, disconnect]);

  // Reset on symbol/interval change
  useEffect(() => {
    setHistoricalBars([]);
    setLatestBar(null);
  }, [symbol, interval]);

  return {
    historicalBars,
    latestBar,
    isLoading,
    isConnected,
    refetch: fetchHistorical,
  };
}
