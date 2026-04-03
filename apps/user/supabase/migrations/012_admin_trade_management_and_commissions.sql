ALTER TABLE public.agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_source_type_check;

ALTER TABLE public.agent_commissions
  ADD CONSTRAINT agent_commissions_source_type_check
  CHECK (source_type IN ('trade_fee', 'rolling', 'loss', 'staking', 'deposit'));

ALTER TABLE public.futures_positions
  ADD COLUMN IF NOT EXISTS admin_action_note TEXT,
  ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(20,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_fee NUMERIC(20,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forced_liquidated_at TIMESTAMPTZ;
