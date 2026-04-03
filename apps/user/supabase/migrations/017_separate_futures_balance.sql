-- Separate futures_balance from wallet_balance
-- wallet_balance = 일반잔고 (입출금용)
-- futures_balance = 선물잔고 (거래용, 전환 필요)
-- staking is tracked via staking_positions table

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS futures_balance NUMERIC(20,4) NOT NULL DEFAULT 0;

-- transfer_balance RPC and adjust_futures_balance RPC
-- (see Supabase MCP applied migration for full SQL)
