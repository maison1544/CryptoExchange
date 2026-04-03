-- Backend Liquidation Engine: mark_prices table + liquidation_logs + atomic RPC
-- This migration enables server-side liquidation independent of frontend

-- 1. Mark Prices Table
CREATE TABLE IF NOT EXISTS public.mark_prices (
  symbol TEXT PRIMARY KEY,
  mark_price NUMERIC(20,8) NOT NULL DEFAULT 0,
  index_price NUMERIC(20,8) NOT NULL DEFAULT 0,
  funding_rate NUMERIC(20,8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mark_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mark_prices_select" ON public.mark_prices FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS idx_mark_prices_updated ON public.mark_prices (updated_at DESC);

-- 2. Liquidation Log Table
CREATE TABLE IF NOT EXISTS public.liquidation_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  equity NUMERIC(20,4),
  maintenance_margin NUMERIC(20,4),
  margin_ratio NUMERIC(10,4),
  positions_liquidated INT NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'worker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.liquidation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liquidation_logs_select_own" ON public.liquidation_logs FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_liquidation_logs_user ON public.liquidation_logs (user_id, created_at DESC);

-- 3. Atomic Liquidation RPC (see migration applied via Supabase MCP)
