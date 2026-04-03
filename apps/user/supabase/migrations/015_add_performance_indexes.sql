-- Performance indexes for all high-frequency query patterns

-- futures_positions: most queries filter by user_id + status
CREATE INDEX IF NOT EXISTS idx_futures_positions_user_status
  ON public.futures_positions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_futures_positions_user_opened
  ON public.futures_positions (user_id, opened_at DESC);

-- deposits: queries filter by user_id + status
CREATE INDEX IF NOT EXISTS idx_deposits_user_status
  ON public.deposits (user_id, status);

CREATE INDEX IF NOT EXISTS idx_deposits_user_created
  ON public.deposits (user_id, created_at DESC);

-- withdrawals: queries filter by user_id + status
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status
  ON public.withdrawals (user_id, status);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created
  ON public.withdrawals (user_id, created_at DESC);

-- staking_positions: queries filter by user_id + status
CREATE INDEX IF NOT EXISTS idx_staking_positions_user_status
  ON public.staking_positions (user_id, status);

-- login_logs: queries filter by user_id, order by login_at
CREATE INDEX IF NOT EXISTS idx_login_logs_user_login
  ON public.login_logs (user_id, login_at DESC);

-- agent_commissions: queries filter by agent_id, user_id
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent
  ON public.agent_commissions (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_user
  ON public.agent_commissions (user_id);

-- user_profiles: agent_id for partner member lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_agent
  ON public.user_profiles (agent_id)
  WHERE agent_id IS NOT NULL;
