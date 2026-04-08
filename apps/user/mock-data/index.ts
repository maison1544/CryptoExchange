import {
  Market,
  Position,
  Order,
  OrderBookEntry,
  Asset,
  TradeHistory,
} from "../types";

export const mockMarkets: Market[] = [
  {
    symbol: "BTCUSDT",
    name: "Bitcoin",
    lastPrice: 0,
    priceChangePercent: 0,
    volume24h: 0,
    fundingRate: 0.01,
  },
  {
    symbol: "ETHUSDT",
    name: "Ethereum",
    lastPrice: 0,
    priceChangePercent: 0,
    volume24h: 0,
    fundingRate: 0.005,
  },
  {
    symbol: "BNBUSDT",
    name: "BNB",
    lastPrice: 0,
    priceChangePercent: 0,
    volume24h: 0,
    fundingRate: 0.01,
  },
  {
    symbol: "SOLUSDT",
    name: "Solana",
    lastPrice: 0,
    priceChangePercent: 0,
    volume24h: 0,
    fundingRate: 0.015,
  },
];

export const mockPositions: Position[] = [
  {
    id: "pos-1",
    symbol: "BTCUSDT",
    type: "롱",
    marginMode: "cross",
    size: 0.5,
    entryPrice: 92000.0,
    markPrice: 94250.5,
    liqPrice: 85000.0,
    marginRatio: 5.2,
    margin: 4600.0,
    fee: 16.1,
    pnl: 1125.25,
    pnlPercent: 24.46,
    leverage: 10,
  },
  {
    id: "pos-2",
    symbol: "ETHUSDT",
    type: "숏",
    marginMode: "cross",
    size: 10.0,
    entryPrice: 3200.0,
    markPrice: 3120.2,
    liqPrice: 3500.0,
    marginRatio: 8.5,
    margin: 1600.0,
    fee: 11.2,
    pnl: 798.0,
    pnlPercent: 49.87,
    leverage: 20,
  },
];

export const mockOpenOrders: Order[] = [
  {
    id: "ord-1",
    symbol: "BTCUSDT",
    type: "지정가",
    side: "매수",
    price: 90000.0,
    amount: 1.0,
    filled: 0.0,
    status: "주문중",
    time: "2026-02-25 10:15:22",
  },
  {
    id: "ord-2",
    symbol: "SOLUSDT",
    type: "지정가",
    side: "매도",
    price: 150.0,
    amount: 100.0,
    filled: 25.0,
    status: "주문중",
    time: "2026-02-25 09:30:10",
  },
];

export const mockOrderHistory: Order[] = [
  {
    id: "ord-h-1",
    symbol: "ETHUSDT",
    type: "시장가",
    side: "매수",
    price: 3150.0,
    amount: 5.0,
    filled: 5.0,
    status: "체결",
    time: "2026-02-24 15:20:00",
  },
  {
    id: "ord-h-2",
    symbol: "BTCUSDT",
    type: "지정가",
    side: "매도",
    price: 95000.0,
    amount: 0.2,
    filled: 0.0,
    status: "취소",
    time: "2026-02-24 12:10:00",
  },
];

export const mockTradeHistory: TradeHistory[] = [
  {
    id: "trd-1",
    symbol: "ETHUSDT",
    side: "매수",
    price: 3150.0,
    amount: 5.0,
    fee: 15.75,
    realizedPnl: 0,
    time: "2026-02-24 15:20:00",
  },
  {
    id: "trd-2",
    symbol: "BTCUSDT",
    side: "매도",
    price: 93500.0,
    amount: 0.5,
    fee: 46.75,
    realizedPnl: 500.0,
    time: "2026-02-23 08:45:12",
  },
];

export const mockOrderBookAsks: OrderBookEntry[] = Array.from(
  { length: 15 },
  (_, i) => ({
    price: 94250.5 + i * 10,
    amount: Number((Math.random() * 2).toFixed(3)),
    total: 0,
  }),
)
  .reverse()
  .reduce((acc, curr, i) => {
    curr.total = i === 0 ? curr.amount : acc[i - 1].total + curr.amount;
    acc.push(curr);
    return acc;
  }, [] as OrderBookEntry[]);

export const mockOrderBookBids: OrderBookEntry[] = Array.from(
  { length: 15 },
  (_, i) => ({
    price: 94240.0 - i * 10,
    amount: Number((Math.random() * 2).toFixed(3)),
    total: 0,
  }),
).reduce((acc, curr, i) => {
  curr.total = i === 0 ? curr.amount : acc[i - 1].total + curr.amount;
  acc.push(curr);
  return acc;
}, [] as OrderBookEntry[]);

export const mockRecentTrades = Array.from({ length: 20 }, (_, i) => ({
  price: 94240.0 + (Math.random() * 20 - 10),
  amount: Number((Math.random() * 0.5).toFixed(3)),
  time: new Date(Date.now() - i * 5000).toLocaleTimeString([], {
    hour12: false,
  }),
  isBuyerMaker: Math.random() > 0.5,
}));

export const mockAssets: Asset[] = [
  {
    coin: "USDT",
    name: "Tether",
    totalBalance: 50000.0,
    availableBalance: 42000.0,
    inOrder: 8000.0,
    usdValue: 50000.0,
  },
  {
    coin: "BTC",
    name: "Bitcoin",
    totalBalance: 1.5,
    availableBalance: 0.5,
    inOrder: 1.0,
    usdValue: 141375.75,
  },
  {
    coin: "ETH",
    name: "Ethereum",
    totalBalance: 10.0,
    availableBalance: 10.0,
    inOrder: 0.0,
    usdValue: 31202.0,
  },
  {
    coin: "SOL",
    name: "Solana",
    totalBalance: 500.0,
    availableBalance: 400.0,
    inOrder: 100.0,
    usdValue: 72900.0,
  },
];
