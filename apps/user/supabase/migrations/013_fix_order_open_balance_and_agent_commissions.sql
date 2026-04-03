-- Fix agent_commissions constraint to include 'rolling' and 'loss' source types
ALTER TABLE public.agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_source_type_check;

ALTER TABLE public.agent_commissions
  ADD CONSTRAINT agent_commissions_source_type_check
  CHECK (source_type IN ('trade_fee', 'rolling', 'loss', 'staking', 'deposit'));
