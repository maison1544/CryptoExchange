export type Market = {
  symbol: string;
  name: string;
  lastPrice: number;
  priceChangePercent: number;
  volume24h: number;
  fundingRate: number;
};

export type Position = {
  id: string;
  symbol: string;
  type: "롱" | "숏";
  marginMode: "cross" | "isolated";
  size: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number;
  marginRatio: number;
  margin: number;
  fee: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
};

export type Order = {
  id: string;
  symbol: string;
  type: "지정가" | "시장가" | "스탑";
  side: "매수" | "매도";
  price: number;
  amount: number;
  filled: number;
  status: "주문중" | "체결" | "취소";
  time: string;
};

export type OrderBookEntry = {
  price: number;
  amount: number;
  total: number;
};

export type Asset = {
  coin: string;
  name: string;
  totalBalance: number;
  availableBalance: number;
  inOrder: number;
  usdValue: number;
};

export type TradeHistory = {
  id: string;
  symbol: string;
  side: "매수" | "매도";
  price: number;
  amount: number;
  fee: number;
  realizedPnl: number;
  time: string;
};

// Binance WebSocket Types
export type BinanceTickerData = {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  lastUpdateTime: number;
};

export type BinanceOrderBookData = {
  symbol: string;
  asks: [string, string][]; // [price, qty][]
  bids: [string, string][]; // [price, qty][]
  lastUpdateTime: number;
};

export type BinanceTradeData = {
  symbol: string;
  tradeId: number;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean;
  lastUpdateTime: number;
};

export type BinanceMarkPriceData = {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  fundingTime: number;
};
